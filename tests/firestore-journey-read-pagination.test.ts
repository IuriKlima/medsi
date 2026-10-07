import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {companyAccess} from '../apps/api/src/platform/firestore/access';
import {context} from '../apps/api/src/platform/firestore/journey-state';
import {onboardingSnapshot} from '../apps/api/src/platform/firestore/onboarding';
import {purchaseState} from '../apps/api/src/platform/firestore/commerce';
import {contentRpc} from '../apps/api/src/platform/firestore/content';
import {beginCompany} from '../apps/api/src/platform/firestore/identity';
import {FIRESTORE_ROOT,firestoreStore,type DocumentStore,type Predicate,type Row} from '../apps/api/src/platform/firestore/store';

type Reference={path:string};
/** SDK boundary fixture only: production FirestoreTransaction enforces its own
 * query cap. Unlike MemoryStore, this fixture applies SDK order/cursor/limit. */
class Query {
 constructor(readonly path:string,readonly filters:Predicate[]=[],readonly maximum=Infinity,readonly ordering='__name__',readonly descending=false,readonly after?:string){}
 doc(id:string):Reference{return {path:this.path+'/'+id};}
 where(field:string,operator:string,value:unknown){return new Query(this.path,[...this.filters,{field,value,op:operator as Predicate['op']}],this.maximum,this.ordering,this.descending,this.after);}
 limit(maximum:number){return new Query(this.path,this.filters,maximum,this.ordering,this.descending,this.after);}
 orderBy(field:unknown,direction='asc'){return new Query(this.path,this.filters,this.maximum,typeof field==='string'?field:'__name__',direction==='desc',this.after);}
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
    const page=docs.filter(doc=>ref.after===undefined||(ref.descending?doc.id<ref.after:doc.id>ref.after)).slice(0,ref.maximum);
    return {size:page.length,docs:page.map(doc=>({id:doc.id,data:()=>structuredClone(doc.row)}))};
   },
   set:(ref:Reference,value:Row)=>{this.rows.set(ref.path,structuredClone(value));},
   delete:(ref:Reference)=>{this.rows.delete(ref.path);},
  });
 }
 store(){return firestoreStore(this as unknown as Parameters<typeof firestoreStore>[0]);}
}

describe('journey scoped reads — local native SDK boundary only',()=>{
 let fixture:SdkFixture,store:DocumentStore,company:string,workspace:string,owner:string,member:string,brief:string,item:string;
 const actor=()=>({role:'authenticated' as const,id:owner});
 const call=(name:string,args:Row={})=>store.run(tx=>contentRpc(tx,actor(),name,{p_company_id:company,...args}));
 beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
  fixture=new SdkFixture();store=fixture.store();[company,workspace,owner,member,brief,item]=Array.from({length:6},()=>randomUUID());
  fixture.put('companies',company,{id:company,workspace_id:workspace,archived_at:null});
  fixture.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});
  fixture.put('company_members',company+'_'+member,{company_id:company,user_id:member,role:'reader'});
  fixture.put('profiles',owner,{id:owner});
  fixture.put('company_onboarding',company,{company_id:company,profile_version:2,revision:2,confirmed_revision:2});
  fixture.put('company_profile_versions',company+'_2',{company_id:company,version:2,facts:{}});
  fixture.put('company_journey_state',company+'_2',{brief_id:brief});
  fixture.put('company_strategy_briefs',brief,{id:brief,company_id:company,profile_version:2,generation:2,approved_generation:2,status:'approved'});
  fixture.put('company_calendar_items',item,{id:item,company_id:company,profile_version:2,brief_id:brief,generation:2,position:0,format:'imagem',details:null,planned_date:null,revision:1});
  fixture.put('company_subscriptions',company,{company_id:company,status:'active',plan_id:'fixture',current_period_end:'2026-11-01T00:00:00.000Z'});
 });
 afterEach(()=>vi.useRealTimers());
 const historical=(table:string,extra:Row={})=>{for(let i=0;i<1100;i++)fixture.put(table,'old-'+String(i).padStart(4,'0'),{id:'old-'+i,company_id:company,created_at:'2020-01-01T00:00:00.000Z',...extra});};
 it('narrows delegated permissions to the actor and still rejects revocation',async()=>{
  historical('company_permission_grants',{user_id:randomUUID(),action:'billing.manage'});
  fixture.put('company_permission_grants','target',{company_id:company,user_id:member,action:'content.approve'});
  await expect(store.run(tx=>companyAccess(tx,{role:'authenticated',id:member},company,'content.approve'))).resolves.toMatchObject({actions:expect.arrayContaining(['content.approve'])});
  expect(fixture.queries.find(q=>q.path.endsWith('/company_permission_grants'))?.filters).toContainEqual({field:'user_id',value:member,op:'=='});
  fixture.rows.delete(FIRESTORE_ROOT+'/company_members/'+company+'_'+member);
  await expect(store.run(tx=>companyAccess(tx,{role:'authenticated',id:member},company,'content.approve'))).rejects.toMatchObject({code:'42501'});
 });
 it('reads current calendar and approvals beyond historical versions',async()=>{
  historical('company_calendar_items',{profile_version:1,brief_id:brief,generation:1});historical('company_marketing_approvals',{profile_version:1});historical('company_competitor_research',{profile_version:1});
  const result=await store.run(tx=>context(tx,company));expect(result.items.map(row=>row.id)).toEqual([item]);expect(result.approvals).toEqual([]);expect(result.digital.research).toEqual([]);
 });
 it('returns complete scoped onboarding history using physical IDs and latest profile',async()=>{
  historical('onboarding_messages');historical('onboarding_attachments');historical('company_profile_versions',{version:1});
  fixture.put('onboarding_messages','zz-tail',{company_id:company,body:'tail without row ID',created_at:'2026-10-07'});
  fixture.put('onboarding_messages','foreign',{company_id:randomUUID(),created_at:'2026-10-07'});
  const result=await store.run(tx=>onboardingSnapshot(tx,actor(),company));expect(result.messages).toHaveLength(1101);expect(result.messages.at(-1)?.body).toBe('tail without row ID');expect(result.attachments).toHaveLength(1100);expect(result.confirmedProfile?.version).toBe(2);
 });
 it('finds newest checkout deterministically without reading old history',async()=>{
  historical('company_test_checkouts');fixture.put('company_test_checkouts','zz-new',{id:'zz-new',company_id:company,created_at:'2026-10-07'});fixture.put('company_test_checkouts','aa-new',{id:'aa-new',company_id:company,created_at:'2026-10-07'});
  expect((await store.run(tx=>purchaseState(tx,actor(),company))).latestCheckout?.id).toBe('zz-new');
  expect(fixture.queries.find(q=>q.path.endsWith('/company_test_checkouts'))?.maximum).toBe(1);
 });
 it('resumes a clinic after more than 1000 archived workspace clinics',async()=>{
  historical('companies',{workspace_id:workspace,archived_at:'2020-01-01'});
  const result=await store.run(tx=>beginCompany(tx,actor(),{p_request_id:randomUUID()}));expect(result).toMatchObject({companyId:company,resumed:true});
 });
 it('enforces the full-history bound explicitly instead of returning a partial snapshot',async()=>{
  for(let i=0;i<10001;i++)fixture.put('onboarding_messages','msg-'+i,{company_id:company,created_at:'2020-01-01'});
  await expect(store.run(tx=>onboardingSnapshot(tx,actor(),company))).rejects.toMatchObject({code:'54000'});
 });
 it('queries the UTC day for unchanged company and cross-clinic actor quotas',async()=>{
  historical('calendar_date_runs',{actor_id:owner,kind:'dates',status:'failed'});
  for(let i=0;i<4;i++)fixture.put('calendar_date_runs','today-'+i,{company_id:company,actor_id:randomUUID(),kind:'dates',created_at:'2026-10-07T00:00:00.000Z',status:'failed'});
  await expect(call('start_calendar_dates',{p_id:randomUUID(),p_month:'2026-10-01'})).rejects.toThrow('Daily allowance exhausted');
  for(let i=0;i<4;i++)fixture.rows.delete(FIRESTORE_ROOT+'/calendar_date_runs/today-'+i);
  for(let i=0;i<12;i++)fixture.put('calendar_date_runs','actor-'+i,{company_id:randomUUID(),actor_id:owner,kind:'dates',created_at:'2026-10-07T23:59:59.999Z',status:'failed'});
  await expect(call('start_calendar_dates',{p_id:randomUUID(),p_month:'2026-10-01'})).rejects.toThrow('Daily user allowance exhausted');
  const queries=fixture.queries.filter(q=>q.path.endsWith('/calendar_date_runs'));
  expect(queries.every(q=>q.filters.some(f=>f.field==='created_at'&&f.op==='>=')&&q.filters.some(f=>f.field==='created_at'&&f.op==='<'))).toBe(true);
 });
 it('ignores prior-day history, but detects an active run across midnight',async()=>{
  historical('calendar_date_runs',{actor_id:owner,kind:'dates',status:'failed'});
  fixture.put('calendar_date_runs','active',{company_id:company,actor_id:owner,kind:'dates',status:'running',created_at:'2026-10-06T23:59:59.999Z',lease_until:'2026-10-07T12:01:00.000Z'});
  await expect(call('start_calendar_dates',{p_id:randomUUID(),p_month:'2026-10-01'})).rejects.toThrow('Generation running');
  fixture.rows.delete(FIRESTORE_ROOT+'/calendar_date_runs/active');
  await expect(call('start_calendar_dates',{p_id:randomUUID(),p_month:'2026-10-01'})).resolves.toMatchObject({items:[{id:item}]});
 });
});
