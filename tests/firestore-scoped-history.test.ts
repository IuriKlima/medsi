import {randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it} from 'vitest';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {firestoreStore,type DocumentStore,type ListOptions,type Predicate,type Row} from '../apps/api/src/platform/firestore/store';
import {MemoryStore} from './helpers/firestore-memory';

type Reference={path:string};
class SdkQuery {
 constructor(readonly path:string,readonly filters:Predicate[]=[],readonly orders:{field:string;descending:boolean}[]=[],readonly maximum=Infinity,readonly skip=0,readonly after?:string){}
 doc(id:string):Reference{return {path:this.path+'/'+id};}
 where(field:string,operator:string,value:unknown){if(operator!=='==')throw new Error('Unsupported fixture operator');return new SdkQuery(this.path,[...this.filters,{field,value}],this.orders,this.maximum,this.skip,this.after);}
 orderBy(field:unknown,direction='asc'){return new SdkQuery(this.path,this.filters,[...this.orders,{field:typeof field==='string'?field:'__name__',descending:direction==='desc'}],this.maximum,this.skip,this.after);}
 limit(maximum:number){return new SdkQuery(this.path,this.filters,this.orders,maximum,this.skip,this.after);}
 offset(skip:number){return new SdkQuery(this.path,this.filters,this.orders,this.maximum,skip,this.after);}
 startAfter(after:string){return new SdkQuery(this.path,this.filters,this.orders,this.maximum,this.skip,after);}
}
/** In-process Admin SDK boundary fixture; production paging/staging executes. */
class HistorySdkFixture {
 private rows=new Map<string,Row>();
 collection(path:string){return new SdkQuery(path);}
 async runTransaction<T>(operation:(tx:unknown)=>Promise<T>):Promise<T>{
  const writes=new Map<string,Row|null>();
  const result=await operation({
   get:async(ref:Reference|SdkQuery)=>{
    if(!(ref instanceof SdkQuery)){const row=this.rows.get(ref.path);return {exists:row!==undefined,data:()=>structuredClone(row)};}
    const orders=ref.orders.length?ref.orders:[{field:'__name__',descending:false}];
    if(!orders.some(o=>o.field==='__name__'))orders.push({field:'__name__',descending:orders.at(-1)!.descending});
    const compare=(a:unknown,b:unknown)=>a===b?0:a!<b!?-1:1;
    const docs=[...this.rows].filter(([path,row])=>path.startsWith(ref.path+'/')&&ref.filters.every(f=>row[f.field]===f.value)&&orders.every(o=>o.field==='__name__'||row[o.field]!==undefined)).map(([path,row])=>({id:path.slice(ref.path.length+1),row}));
    docs.sort((a,b)=>{for(const order of orders){const c=compare(order.field==='__name__'?a.id:a.row[order.field],order.field==='__name__'?b.id:b.row[order.field])*(order.descending?-1:1);if(c)return c;}return 0;});
    const page=docs.filter(doc=>ref.after===undefined||doc.id>ref.after).slice(ref.skip,ref.skip+ref.maximum);
    return {size:page.length,docs:page.map(doc=>({id:doc.id,data:()=>structuredClone(doc.row)}))};
   },
   set:(ref:Reference,row:Row)=>writes.set(ref.path,structuredClone(row)),delete:(ref:Reference)=>writes.set(ref.path,null),
  });
  for(const [path,row] of writes)if(row===null)this.rows.delete(path);else this.rows.set(path,row);
  return result;
 }
 store(){return firestoreStore(this as unknown as Parameters<typeof firestoreStore>[0]);}
}

/** Local transaction fixture retains the native unbounded-read guard and records
 * query scope/limits. No credentials or provider calls. */
describe.each(['memory','sdk'])('scoped history readers beyond 1000 records — %s fixture',fixture=>{
 let memory:DocumentStore,store:DocumentStore,company:string,workspace:string,owner:string,marketing:string;
 let calls:{collection:string;filters:Predicate[];options?:ListOptions;returned?:number}[];
 const rpc=(name:string,args:Row={},actor=owner)=>firestoreClient('authenticated',actor,store).rpc(name,args);
 beforeEach(async()=>{
  memory=fixture==='sdk'?new HistorySdkFixture().store():new MemoryStore();calls=[];[company,workspace,owner,marketing]=Array.from({length:4},()=>randomUUID());
  store={run:operation=>memory.run(tx=>operation({get:tx.get.bind(tx),put:tx.put.bind(tx),remove:tx.remove.bind(tx),scan:tx.scan?.bind(tx),list:async(collection,filters=[],options)=>{
   const call={collection,filters,options,returned:0};calls.push(call);const rows=await tx.list(collection,filters,options);call.returned=rows.length;
   if(!options&&rows.length>1000)throw new Error('Use a narrower Firestore query');return rows;
  }}))};
  await memory.run(async tx=>{
   tx.put('companies',company,{id:company,workspace_id:workspace,name:'Fixture',archived_at:null});
   tx.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});
   tx.put('company_members',company+'_'+marketing,{company_id:company,user_id:marketing,role:'marketing'});
   tx.put('profiles',owner,{id:owner});
  });
 });
 const seedTickets=async(count:number)=>{
  const rows=Array.from({length:count},(_,i)=>({id:randomUUID(),number:i+1,company_id:company,created_by:owner,subject:'Fixture ticket',status:'open',page:'/workspace',transcript:[],version:1,created_at:'2020-01-01T00:00:00.000Z',updated_at:new Date(Date.UTC(2020,0,1)+i*1000).toISOString()}));
  await memory.run(async tx=>{for(const row of rows)tx.put('support_tickets',row.id,row);});return rows;
 };
 it('returns the newest 100 messages with stable equal-time ID ordering',async()=>{
  const [ticket]=await seedTickets(1);const ids=Array.from({length:1100},()=>randomUUID()).sort();
  await memory.run(async tx=>{for(const id of ids)tx.put('support_messages',id,{id,ticket_id:ticket!.id,author_id:owner,author_kind:'customer',body:'fixture',created_at:'2020-01-01'});});
  const result=await rpc('support_ticket_detail',{p_id:ticket!.id});expect(result.error).toBeNull();
  expect(result.data.messages.map((row:Row)=>row.id)).toEqual(ids.slice(-100));
  expect(calls.find(c=>c.collection==='support_messages')?.options?.limit).toBe(100);
 });
 it('bootstraps protocol from maximum and creates after large historical actor data',async()=>{
  await seedTickets(1100);
  const result=await rpc('create_support_ticket',{p_id:randomUUID(),p_company_id:company,p_subject:'Fixture new ticket',p_message:'A sufficient fixture message',p_page:'/workspace',p_transcript:[]});
  expect(result.error).toBeNull();expect(result.data.ticket.number).toBe(1101);
  const queries=calls.filter(c=>c.collection==='support_tickets');expect(queries.every(q=>q.options&&q.options.limit<=10)).toBe(true);
 });
 it('returns offset pages across more than 1000 support tickets',async()=>{
  const rows=await seedTickets(1100),result=await rpc('support_ticket_list',{p_offset:1000});
  expect(result.error).toBeNull();expect(result.data.map((row:Row)=>row.id)).toEqual(rows.reverse().slice(1000,1020).map(row=>row.id));
 });
 it('fails explicitly when revoked own tickets exhaust the inspection budget before a visible ticket',async()=>{
  const rows=await seedTickets(10021),revoked=randomUUID();
  await memory.run(async tx=>{for(const row of rows.slice(1))tx.put('support_tickets',row.id,{...row,company_id:revoked});});
  const result=await rpc('support_ticket_list',{p_offset:0});expect(result.error).toMatchObject({code:'54000'});expect(result.data).toBeNull();
  expect(calls.filter(c=>c.collection==='support_tickets').reduce((sum,c)=>sum+(c.returned??0),0)).toBeLessThanOrEqual(10001);
 });
 it('shares one inspection budget across assigned-company windows',async()=>{
  const rows=await seedTickets(12000),second=randomUUID();
  await memory.run(async tx=>{
   tx.put('platform_staff',marketing,{user_id:marketing,active:true,role:'support'});
   for(const companyId of [company,second])tx.put('company_assignments',companyId+'_'+marketing,{company_id:companyId,staff_id:marketing});
   for(const row of rows.slice(6000))tx.put('support_tickets',row.id,{...row,company_id:second});
  });
  const result=await rpc('support_ticket_list',{p_team:true,p_offset:5000},marketing);expect(result.error).toMatchObject({code:'54000'});expect(result.data).toBeNull();
  expect(calls.filter(c=>c.collection==='support_tickets').reduce((sum,c)=>sum+(c.returned??0),0)).toBeLessThanOrEqual(10001);
 });
 it('keeps mixed time-descending ID-ascending ordering on the administrator offset page',async()=>{
  const rows=await seedTickets(1100);
  await memory.run(async tx=>{tx.put('platform_staff',owner,{user_id:owner,active:true,role:'platform_admin'});for(const row of rows)tx.put('support_tickets',row.id,{...row,updated_at:'2020-01-01'});});
  const result=await rpc('support_ticket_list',{p_team:true,p_offset:1000});expect(result.error).toBeNull();
  expect(result.data.map((row:Row)=>row.id)).toEqual(rows.map(row=>row.id).sort().slice(1000,1020));
  expect(calls.filter(c=>c.collection==='support_tickets')).toHaveLength(1);
  expect(calls.find(c=>c.collection==='support_tickets')?.options).toMatchObject({limit:20,offset:1000});
 });
 it('applies creation and reply rate limits after large historical data',async()=>{
  const rows=await seedTickets(1100),ticket=rows[0]!;
  await memory.run(async tx=>{
   for(const row of rows.slice(0,10))tx.put('support_tickets',row.id,{...row,created_at:new Date().toISOString()});
   for(let i=0;i<1100;i++){const id=randomUUID();tx.put('support_messages',id,{id,ticket_id:ticket.id,author_id:owner,author_kind:'customer',body:'fixture',created_at:i<30?new Date().toISOString():'2020-01-01'});}
  });
  expect((await rpc('create_support_ticket',{p_id:randomUUID(),p_company_id:company,p_subject:'Fixture new ticket',p_message:'A sufficient fixture message',p_page:'/workspace',p_transcript:[]})).error).toMatchObject({code:'P0429'});
  expect((await rpc('reply_support_ticket',{p_ticket_id:ticket.id,p_id:randomUUID(),p_message:'fixture reply'})).error).toMatchObject({code:'P0429'});
 });
 it('returns a company roster larger than 1000 without including another tenant',async()=>{
  await memory.run(async tx=>{for(let i=0;i<1100;i++){const id=randomUUID();tx.put('profiles',id,{id,display_name:'Fixture '+i});tx.put('company_members',company+'_'+id,{company_id:company,user_id:id,role:'reader'});}tx.put('profiles',marketing,{id:marketing,display_name:'Marketing fixture'});});
  const result=await rpc('company_roster',{p_company_id:company});expect(result.error).toBeNull();expect(result.data).toHaveLength(1101);
 });
 it('reads latest confirmed profile and all scoped hashed meeting records after 1000',async()=>{
  const session=randomUUID();
  await memory.run(async tx=>{
   tx.put('platform_staff',owner,{user_id:owner,active:true,role:'platform_admin'});tx.put('internal_access_sessions',session,{id:session,company_id:company,operator_id:owner,ended_at:null,expires_at:'2099-01-01'});
   for(let i=0;i<1100;i++){tx.put('company_profile_versions','hash-'+i,{company_id:company,version:i+1});tx.put('company_followup_meetings','hash-'+i,{company_id:company,id:'meeting-'+i,created_at:new Date(Date.UTC(2020,0,1)+i*1000).toISOString()});}
  });
  const result=await rpc('internal_onboarding_context',{p_session_id:session});expect(result.error).toBeNull();expect(result.data.confirmedProfile.version).toBe(1100);expect(result.data.meetings).toHaveLength(1100);expect(result.data.meetings[0].id).toBe('meeting-1099');
 });
 it('reads hashed dashboard facts and imports across pages with tenant isolation',async()=>{
  await memory.run(async tx=>{
   for(let i=0;i<1100;i++){
    tx.put('dashboard_facts','hash-'+i,{company_id:company,source:'fixture',domain:'digital',revision:1,payload:{id:i},updated_at:'2020-01-01'});
    tx.put('dashboard_imports','hash-'+i,{company_id:company,source:'fixture-'+i,domain:'digital',coverage_start:'2020-01-01',coverage_end:'2020-01-02',created_at:'2020-01-01',complete:true});
   }
   tx.put('dashboard_facts','foreign',{company_id:randomUUID(),source:'foreign',domain:'digital',payload:{id:'foreign'}});
  });
  const result=await rpc('dashboard_read',{p_company_id:company});expect(result.error).toBeNull();expect(result.data.facts).toHaveLength(1100);expect(result.data.coverage).toHaveLength(1100);
  expect(result.data.facts.some((row:Row)=>row.payload.id==='foreign')).toBe(false);
 });
 it('never reads CRM history for an actor without CRM permission',async()=>{
  await memory.run(async tx=>{for(let i=0;i<1100;i++)tx.put('opportunities','opp-'+i,{id:'opp-'+i,company_id:company});});
  const result=await rpc('dashboard_read',{p_company_id:company},marketing);expect(result.error).toBeNull();expect(result.data.crm).toBeNull();
  expect(calls.some(c=>c.collection==='opportunities')).toBe(false);
 });
 it('looks up dashboard permission for the authenticated member only',async()=>{
  await memory.run(async tx=>{for(let i=0;i<1100;i++)tx.put('dashboard_permissions','permission-'+i,{company_id:company,user_id:'other-'+i,financial_details:true});tx.put('dashboard_permissions','target',{company_id:company,user_id:marketing,financial_details:true});});
  const result=await rpc('dashboard_read',{p_company_id:company},marketing);expect(result.error).toBeNull();expect(result.data.permissions.finance).toBe(true);
  expect(calls.find(c=>c.collection==='dashboard_permissions')?.filters).toContainEqual({field:'user_id',value:marketing});
 });
 it.each(['dashboard_facts','dashboard_imports','opportunities'])('rejects aggregation above the explicit 10000 %s limit instead of truncating',async collection=>{
  await memory.run(async tx=>{for(let i=0;i<10001;i++)tx.put(collection,'hash-'+i,{company_id:company,domain:'digital',payload:{id:i}});});
  expect((await rpc('dashboard_read',{p_company_id:company})).error).toMatchObject({code:'54000'});
 });
});
