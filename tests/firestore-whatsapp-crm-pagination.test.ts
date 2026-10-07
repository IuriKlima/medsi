import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {whatsappCloudRpc} from '../apps/api/src/platform/firestore/whatsapp-cloud';
import {hash} from '../apps/api/src/platform/firestore/access';
import {crmRpc} from '../apps/api/src/platform/firestore/crm';
import {FIRESTORE_ROOT,firestoreStore,type DocumentStore,type Predicate,type Row} from '../apps/api/src/platform/firestore/store';

type Reference={path:string};
/** SDK boundary fixture only: production FirestoreTransaction enforces its own
 * query cap. Unlike MemoryStore, this fixture applies SDK order/cursor/limit. */
class Query {
 constructor(readonly path:string,readonly filters:Predicate[]=[],readonly maximum=Infinity,readonly ordering='__name__',readonly descending=false,readonly after?:string,readonly skipped=0){}
 offset(skipped:number){return new Query(this.path,this.filters,this.maximum,this.ordering,this.descending,this.after,skipped);}
 doc(id:string):Reference{return {path:this.path+'/'+id};}
 where(field:string,operator:string,value:unknown){return new Query(this.path,[...this.filters,{field,value,op:operator as Predicate['op']}],this.maximum,this.ordering,this.descending,this.after,this.skipped);}
 limit(maximum:number){return new Query(this.path,this.filters,maximum,this.ordering,this.descending,this.after,this.skipped);}
 orderBy(field:unknown,direction='asc'){return new Query(this.path,this.filters,this.maximum,typeof field==='string'?field:'__name__',direction==='desc',this.after,this.skipped);}
 startAfter(id:string){if(this.ordering!=='__name__')throw new Error('Fixture cursor requires document order');return new Query(this.path,this.filters,this.maximum,this.ordering,this.descending,id);}
}
class SdkFixture {
 readonly rows=new Map<string,Row>();
 readonly queries:Query[]=[];
 put(collection:string,id:string,row:Row){this.rows.set(FIRESTORE_ROOT+'/'+collection+'/'+id,structuredClone(row));}
 collection(path:string){return new Query(path);}
 async runTransaction<T>(operation:(tx:unknown)=>Promise<T>):Promise<T>{
  return operation({
   get:async(ref:Reference|Query)=>{
    if(!(ref instanceof Query)){const row=this.rows.get(ref.path);return {exists:row!==undefined,data:()=>structuredClone(row)};}
    this.queries.push(ref);
    const docs=[...this.rows].filter(([path,row])=>path.startsWith(ref.path+'/')&&ref.filters.every(f=>{const v=row[f.field],x=f.value as string;return !f.op||f.op==='=='?v===x:v!=null&&(f.op==='>='?v>=x:f.op==='>'?v>x:f.op==='<'?v<x:v<=x);})&&(ref.ordering==='__name__'||row[ref.ordering]!==undefined)).map(([path,row])=>({id:path.slice(ref.path.length+1),row}));
    const value=(doc:typeof docs[number])=>ref.ordering==='__name__'?doc.id:doc.row[ref.ordering];
    const compare=(a:unknown,b:unknown)=>a===b?0:String(a)<String(b)?-1:1;
    docs.sort((a,b)=>(compare(value(a),value(b))||compare(a.id,b.id))*(ref.descending?-1:1));
    const page=docs.filter(doc=>ref.after===undefined||(ref.descending?doc.id<ref.after:doc.id>ref.after)).slice(ref.skipped,ref.skipped+ref.maximum);
    return {size:page.length,docs:page.map(doc=>({id:doc.id,data:()=>structuredClone(doc.row)}))};
   },
   set:(ref:Reference,value:Row)=>{this.rows.set(ref.path,structuredClone(value));},
   delete:(ref:Reference)=>{this.rows.delete(ref.path);},
  });
 }
 store(){return firestoreStore(this as unknown as Parameters<typeof firestoreStore>[0]);}
}

describe('WhatsApp and CRM scoped reads — isolated native boundary',()=>{
 let fixture:SdkFixture,store:DocumentStore,company:string,owner:string,workspace:string,contact:string;
 const peer='5511999999999',thread=peer+'@s.whatsapp.net',phone='123456789',waba='987654321';
 const service={role:'service_role' as const,id:null};
 const cloud=(name:string,args:Row={},actor={role:'authenticated' as const,id:owner})=>store.run(tx=>whatsappCloudRpc(tx,actor,name,{p_company_id:company,...args}));
 const crm=(name:string,args:Row={})=>store.run(tx=>crmRpc(tx,{role:'authenticated',id:owner},name,{p_company_id:company,...args}));
 const inbound=(messageId='new-event',body='Hello')=>store.run(tx=>whatsappCloudRpc(tx,service,'ingest_whatsapp_cloud_server',{p_event:{phoneId:phone,wabaId:waba,messageId,peer,time:new Date().toISOString(),body,kind:'text',name:'Fixture'}}));
 beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));fixture=new SdkFixture();store=fixture.store();[company,owner,workspace,contact]=Array.from({length:4},()=>randomUUID());
  fixture.put('companies',company,{id:company,workspace_id:workspace});fixture.put('workspace_members',workspace+'_'+owner,{role:'owner'});
  fixture.put('channel_remote_bindings','whatsapp_cloud_'+phone,{company_id:company,channel_id:'channel'});fixture.put('company_channels','channel',{id:'channel',company_id:company,provider:'whatsapp_cloud',status:'connected',remote_id:phone,metadata:{wabaId:waba,webhookReady:true}});
  fixture.put('contacts',contact,{id:contact,company_id:company,name:'Existing',phone_e164:'+'+peer,consent:false,opted_out:false});
  for(let i=0;i<1100;i++){
   fixture.put('contacts','contact-'+i,{id:'contact-'+i,company_id:company,phone_e164:'+5511'+i});
   fixture.put('opportunities','opp-'+i,{id:'opp-'+i,company_id:company,contact_id:'contact-'+i,stage:'new'});
   fixture.put('whatsapp_cloud_messages','message-'+i,{id:'message-'+i,company_id:company,thread:'other-'+i,provider_id:'old-'+i,time:'2020-01-01',expires_at:'2020-02-01'});
  }
 });
 afterEach(()=>vi.useRealTimers());
 it('ingests and deduplicates despite unrelated clinic history, preserving existing contact consent',async()=>{
  expect(await inbound()).toEqual({received:true});expect(await inbound()).toEqual({duplicate:true});
  const contacts=[...fixture.rows.values()].filter(r=>r.company_id===company&&r.phone_e164==='+'+peer);expect(contacts).toHaveLength(1);expect(contacts[0]).toMatchObject({id:contact,consent:false});
  expect([...fixture.rows.values()].filter(r=>r.contact_id===contact&&r.original_source==='whatsapp')).toHaveLength(1);
  expect(await cloud('read_whatsapp_cloud_inbox',{p_thread:thread})).toEqual([expect.objectContaining({id:'new-event',body:'Hello'})]);
  await expect(cloud('read_whatsapp_cloud_inbox',{p_thread:thread},{role:'authenticated',id:randomUUID()})).rejects.toMatchObject({code:'42501'});
 });
 it('pages newest messages until100 retained results, without returning expired or foreign messages',async()=>{
  for(let i=0;i<1100;i++)fixture.put('whatsapp_cloud_messages','live-'+String(i).padStart(4,'0'),{company_id:company,thread,provider_id:'live-'+i,time:new Date(Date.UTC(2026,9,7)+i*1000).toISOString(),expires_at:'2026-11-01'});
  fixture.put('whatsapp_cloud_messages','expired-newest',{company_id:company,thread,provider_id:'expired',time:'2026-10-08',expires_at:'2026-10-01'});
  fixture.put('whatsapp_cloud_messages','foreign',{company_id:randomUUID(),thread,provider_id:'foreign',time:'2026-10-09',expires_at:'2026-11-01'});
  const messages=await cloud('read_whatsapp_cloud_inbox',{p_thread:thread}) as Row[];expect(messages.map(m=>m.id)).toEqual(Array.from({length:100},(_,i)=>'live-'+(1000+i)));
  expect(fixture.queries.filter(q=>q.path.endsWith('/whatsapp_cloud_messages')).every(q=>q.maximum<=100)).toBe(true);
 });
 it('deduplicates manual CRM contacts and opportunities beyond unrelated history',async()=>{
  const opportunity=randomUUID();fixture.put('opportunities',opportunity,{id:opportunity,company_id:company,contact_id:contact,stage:'qualified',created_at:'2026-10-07'});
  const args={p_request_id:randomUUID(),p_name:'Existing',p_phone:'+'+peer,p_email:'',p_interest:'Fixture'};
  const result=await crm('save_crm_contact',args);expect(result).toMatchObject({contact:{id:contact,consent:false},opportunity:{id:opportunity}});expect(await crm('save_crm_contact',args)).toEqual(result);
 });
 it('preserves long-body dispatch dedup beyond unrelated dispatch history',async()=>{
  await inbound();const handoff=company+'_whatsapp_'+hash(thread);fixture.put('inbox_handoffs',handoff,{company_id:company,actor_id:owner,released_at:null});
  const body='Mensagem administrativa '.repeat(100).trim();
  for(let i=0;i<1100;i++)fixture.put('inbox_dispatches','dispatch-'+i,{company_id:company,thread:'other-'+i,state:'sent',created_at:'2020-01-01'});
  fixture.put('inbox_dispatches','pending',{company_id:company,thread,state:'uncertain',body,created_at:'2026-10-07'});
  expect(await cloud('reserve_whatsapp_cloud_dispatch',{p_id:randomUUID(),p_thread:thread,p_body:body})).toBe(false);
  expect(fixture.queries.filter(q=>q.path.endsWith('/inbox_dispatches')).every(q=>!q.filters.some(f=>f.field==='body'))).toBe(true);
 });
 it('keeps identical foreign phone contacts isolated during ingestion',async()=>{
  fixture.rows.delete(FIRESTORE_ROOT+'/contacts/'+contact);const foreign=randomUUID();fixture.put('contacts',foreign,{id:foreign,company_id:randomUUID(),phone_e164:'+'+peer,name:'Foreign'});
  expect(await inbound()).toEqual({received:true});const result=await cloud('read_whatsapp_cloud_inbox') as Row[];expect(result).toHaveLength(1);expect(result[0].name).toBe('Fixture');
 });
});
