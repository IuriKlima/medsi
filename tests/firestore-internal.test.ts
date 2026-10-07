import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import type {DocumentStore,Row} from '../apps/api/src/platform/firestore/store';
import {MemoryStore} from './helpers/firestore-memory';

describe('internal operations through the Firestore dispatcher — local fixtures',()=>{
 let store:MemoryStore,admin:string,support:string,otherSupport:string,owner:string,company:string,otherCompany:string,workspace:string;
 const client=(id:string)=>firestoreClient('authenticated',id,store);
 const call=async(id:string,name:string,args:Row={})=>{const result=await client(id).rpc(name,args);if(result.error)throw result.error;return result.data;};
 const start=(id=support,c=company)=>call(id,'start_internal_access',{p_company_id:c,p_reason:'Review weekly followup'});
 const context=(session:string,id=support)=>call(id,'internal_company_context',{p_session_id:session});
 const meeting=(session:string,request=randomUUID(),patch:Row={})=>call(support,'record_followup_meeting',{p_session_id:session,p_request_id:request,p_date:'2026-10-07',p_participants:'Clinic owner',p_decisions:'Review strategy',p_next_actions:'Prepare next meeting',...patch});
 // Exercise the production query cap instead of relying on unbounded memory reads.
 const boundedStore=():DocumentStore=>({run:operation=>store.run(tx=>operation({...tx,list:async(collection,filters=[],options?:{limit?:number;afterId?:string;orderBy?:string;descending?:boolean})=>{
  let rows=await tx.list(collection,filters);
  if(!options&&rows.length>1000)throw new Error('Use a narrower Firestore query');
  const field=options?.orderBy??'id';rows=rows.sort((a,b)=>(a[field]===b[field]?0:a[field]<b[field]?-1:1)*(options?.descending?-1:1));
  if(options?.afterId)rows=rows.filter(row=>row.id>options.afterId!);
  return options?.limit===undefined?rows:rows.slice(0,options.limit);
 }}))});
 const boundedCall=async(id:string,name:string,args:Row={})=>{const result=await firestoreClient('authenticated',id,boundedStore()).rpc(name,args);if(result.error)throw result.error;return result.data;};
 beforeEach(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
  store=new MemoryStore();[admin,support,otherSupport,owner,company,otherCompany,workspace]=Array.from({length:7},()=>randomUUID()) as [string,string,string,string,string,string,string];
  await store.run(async tx=>{
   for(const [id,role] of [[admin,'platform_admin'],[support,'support'],[otherSupport,'support']]){tx.put('platform_staff',id!,{user_id:id,role,active:true});tx.put('profiles',id!,{id,display_name:role+' '+id,email:'private@example.test'});}
   tx.put('profiles',owner,{id:owner,display_name:'Clinic owner',email:'private-owner@example.test'});
   tx.put('workspaces',workspace,{id:workspace,name:'Fixture workspace'});
   for(const [id,name] of [[company,'Clinic Alpha'],[otherCompany,'Clinic Beta']])tx.put('companies',id!,{id,name,workspace_id:workspace,city:'São Paulo',segment:'clinic',archived_at:null,created_at:'2026-10-01T00:00:00Z'});
   tx.put('company_members',company+'_'+owner,{company_id:company,user_id:owner,role:'admin'});
   tx.put('company_assignments',company+'_'+support,{company_id:company,staff_id:support,assigned_by:admin});
   tx.put('company_subscriptions',company,{company_id:company,plan_id:'basic',status:'active',weekly_support:true,current_period_end:'2026-11-07T00:00:00Z'});
  });
 });
 afterEach(()=>vi.useRealTimers());
 it('lists assigned companies and gives only active platform admins the assignment roster',async()=>{
  expect(await call(support,'internal_portfolio')).toMatchObject({role:'support',total:1,pageSize:30,companies:[{id:company,weekly_support:true}]});
  expect(await call(admin,'internal_portfolio',{p_search:'beta',p_offset:0})).toMatchObject({total:1,companies:[{id:otherCompany}]});
  const roster=await call(admin,'company_assignment_roster',{p_company_id:company});expect(roster).toHaveLength(2);expect(roster.find((r:Row)=>r.user_id===support)).toEqual({user_id:support,display_name:'support '+support,assigned:true});
  for(const id of [owner,support])await expect(call(id,'company_assignment_roster',{p_company_id:company})).rejects.toMatchObject({code:'42501'});
  await expect(call(owner,'internal_portfolio')).rejects.toMatchObject({code:'42501'});
  await expect(call(admin,'internal_portfolio',{p_offset:-1})).rejects.toMatchObject({code:'22023'});
 });
 it('assigns only active support staff and revokes open sessions transactionally',async()=>{
  await expect(call(support,'set_company_assignment',{p_company_id:otherCompany,p_staff_id:support,p_assigned:true})).rejects.toMatchObject({code:'42501'});
  await expect(call(admin,'set_company_assignment',{p_company_id:company,p_staff_id:admin,p_assigned:true})).rejects.toMatchObject({code:'22023'});
  await call(admin,'set_company_assignment',{p_company_id:otherCompany,p_staff_id:support,p_assigned:true});expect((await call(support,'internal_portfolio')).total).toBe(2);
  const session=await start();await call(admin,'set_company_assignment',{p_company_id:company,p_staff_id:support,p_assigned:false});
  await expect(context(session)).rejects.toMatchObject({code:'42501'});
  expect(await store.run(tx=>tx.get('internal_access_sessions',session))).toMatchObject({ended_at:'2026-10-07T12:00:00.000Z'});
 });
 it('creates read-only sessions with thirty-minute expiry, projected team and scoped history',async()=>{
  await store.run(async tx=>{tx.put('audit_logs','own',{id:'own',company_id:company,action:'company.updated',actor_id:owner,created_at:'2026-10-07',details:{private:true}});tx.put('audit_logs','other',{company_id:otherCompany,action:'secret'});});
  const session=await start(),result=await context(session);expect(result).toMatchObject({scope:'read_only',operatorRole:'support',company:{id:company},session:{operator_id:support,expires_at:'2026-10-07T12:30:00.000Z'},team:[{display_name:'Clinic owner',role:'admin'}],history:[{action:'company.updated',actor_id:owner,created_at:'2026-10-07'}]});
  expect(result.team[0]).not.toHaveProperty('email');expect(result.history[0]).not.toHaveProperty('details');
  expect((await client(support).rpc('company_capabilities',{p_company_id:company})).error?.code).toBe('42501');
  expect(await store.run(tx=>tx.get('company_members',company+'_'+support))).toBeNull();
  await expect(start(support,otherCompany)).rejects.toMatchObject({code:'42501'});await expect(start(owner)).rejects.toMatchObject({code:'42501'});
  await expect(call(support,'start_internal_access',{p_company_id:company,p_reason:'short'})).rejects.toMatchObject({code:'22023'});
 });
 it('denies stolen, expired, ended and newly unassigned sessions on every read',async()=>{
  const session=await start();await expect(context(session,otherSupport)).rejects.toMatchObject({code:'42501'});
  await call(otherSupport,'end_internal_access',{p_session_id:session});expect((await context(session)).session.ended_at).toBeNull();
  vi.setSystemTime(new Date('2026-10-07T12:30:00Z'));await expect(context(session)).rejects.toMatchObject({code:'42501'});
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));await call(support,'end_internal_access',{p_session_id:session});await call(support,'end_internal_access',{p_session_id:session});await expect(context(session)).rejects.toMatchObject({code:'42501'});
  const fresh=await start();await store.run(async tx=>tx.remove('company_assignments',company+'_'+support));await expect(context(fresh)).rejects.toMatchObject({code:'42501'});
  expect((await store.run(tx=>tx.list('platform_audit'))).filter(r=>r.action==='internal_access.ended')).toHaveLength(1);
 });
 it('rechecks staff activity and role even for an existing session',async()=>{
  const session=await start();await store.run(async tx=>tx.put('platform_staff',support,{user_id:support,role:'support',active:false}));
  await expect(context(session)).rejects.toMatchObject({code:'42501'});await expect(call(support,'internal_portfolio')).rejects.toMatchObject({code:'42501'});
  await store.run(async tx=>tx.put('platform_staff',support,{user_id:support,role:'reader',active:true}));await expect(context(session)).rejects.toMatchObject({code:'42501'});
 });
 it('returns only the session company onboarding and latest confirmed profile',async()=>{
  await store.run(async tx=>{tx.put('company_onboarding',company,{company_id:company,facts:{name:'Alpha'}});for(const version of [1,2])tx.put('company_profile_versions',company+'_'+version,{company_id:company,version,facts:{name:'Alpha '+version}});tx.put('company_profile_versions','other',{company_id:otherCompany,version:99,facts:{secret:true}});});
  const session=await start();expect(await call(support,'internal_onboarding_context',{p_session_id:session})).toMatchObject({companyId:company,profile:{facts:{name:'Alpha'}},confirmedProfile:{version:2},meetings:[]});
  await store.run(async tx=>{const row=await tx.get('companies',company);tx.put('companies',company,{...row,archived_at:'2026-10-07'});});await expect(call(support,'internal_onboarding_context',{p_session_id:session})).rejects.toMatchObject({code:'42501'});
 });
 it('records a followup once and rejects changed payload and cross-company request reuse',async()=>{
  const session=await start(),request=randomUUID(),first=await meeting(session,request);expect(first).toMatchObject({company_id:company,operator_id:support,session_id:session,meeting_date:'2026-10-07'});expect(await meeting(session,request)).toEqual(first);
  await expect(meeting(session,request,{p_decisions:'Changed decisions'})).rejects.toMatchObject({code:'22023'});
  await call(admin,'set_company_assignment',{p_company_id:otherCompany,p_staff_id:support,p_assigned:true});await store.run(async tx=>tx.put('company_subscriptions',otherCompany,{company_id:otherCompany,status:'active',weekly_support:true,current_period_end:'2026-11-07'}));
  await expect(meeting(await start(support,otherCompany),request)).rejects.toMatchObject({code:'22023'});
  expect(await store.run(tx=>tx.list('company_followup_meetings'))).toHaveLength(1);expect((await store.run(tx=>tx.list('platform_audit'))).filter(r=>r.action==='followup.meeting_recorded')).toHaveLength(1);
  await call(support,'end_internal_access',{p_session_id:session});await expect(meeting(session,request)).rejects.toMatchObject({code:'42501'});
 });
 it('preserves followup access without a subscription and rejects invalid fields without writes',async()=>{
  const session=await start();await store.run(async tx=>tx.remove('company_subscriptions',company));
  for(const patch of [{p_date:'2026-02-31'},{p_participants:'x'},{p_decisions:'x'.repeat(6001)}])await expect(meeting(session,randomUUID(),patch)).rejects.toMatchObject({code:'22023'});
  expect(await store.run(tx=>tx.list('company_followup_meetings'))).toHaveLength(0);
  expect(await meeting(session)).toMatchObject({company_id:company});
 });
 it('keeps identical request IDs isolated by operator and requires fresh authorization on replay',async()=>{
  const session=await start(),request=randomUUID(),first=await meeting(session,request);
  await call(admin,'set_company_assignment',{p_company_id:company,p_staff_id:otherSupport,p_assigned:true});const otherSession=await start(otherSupport);
  const second=await call(otherSupport,'record_followup_meeting',{p_session_id:otherSession,p_request_id:request,p_date:'2026-10-07',p_participants:'Another participant',p_decisions:'Separate decisions',p_next_actions:'Separate next actions'});
  expect(second.id).not.toBe(first.id);expect(second.operator_id).toBe(otherSupport);
  await store.run(async tx=>tx.remove('company_assignments',company+'_'+support));await expect(meeting(session,request)).rejects.toMatchObject({code:'42501'});
  expect(await store.run(tx=>tx.list('company_followup_meetings'))).toHaveLength(2);
 });
 it('denies anonymous and service-role callers for every internal RPC',async()=>{
  for(const role of ['anon','service_role'] as const)for(const name of ['company_assignment_roster','set_company_assignment','internal_portfolio','start_internal_access','end_internal_access','internal_company_context','internal_onboarding_context','record_followup_meeting'])expect((await firestoreClient(role,null,store).rpc(name,{})).error?.code).toBe('42501');
 });
 it('reads support assignments without scanning more than a thousand unrelated companies',async()=>{
  await store.run(async tx=>{for(let i=0;i<1005;i++){const id=randomUUID();tx.put('companies',id,{id,name:'Unassigned '+i,workspace_id:workspace,created_at:'2026-10-02T00:00:00Z'});}});
  expect(await boundedCall(support,'internal_portfolio')).toMatchObject({total:1,companies:[{id:company}]});
 });
 it('paginates the admin company scan before computing exact search totals and portfolio pages',async()=>{
  const ids:string[]=[];
  await store.run(async tx=>{for(let i=0;i<1005;i++){const id=randomUUID();ids.push(id);tx.put('companies',id,{id,name:'Searchable clinic '+i,workspace_id:workspace,created_at:new Date(Date.UTC(2026,9,2,0,0,i)).toISOString()});}});
  const result=await boundedCall(admin,'internal_portfolio',{p_search:'SEARCHABLE',p_offset:990});
  expect(result).toMatchObject({total:1005,offset:990,pageSize:30});expect(result.companies.map((row:Row)=>row.id)).toEqual(ids.slice(0,15).reverse());
 });
 it('queries the thirty newest scoped audit rows when company history exceeds a thousand events',async()=>{
  await store.run(async tx=>{for(let i=0;i<1005;i++)tx.put('audit_logs','event-'+i,{id:'event-'+i,company_id:company,action:'action.'+i,actor_id:owner,created_at:new Date(Date.UTC(2026,9,1,0,0,i)).toISOString(),details:{secret:true}});tx.put('audit_logs','foreign',{id:'foreign',company_id:otherCompany,action:'foreign',actor_id:owner,created_at:'2026-12-01T00:00:00Z'});});
  const result=await boundedCall(support,'internal_company_context',{p_session_id:await start()});
  expect(result.history).toHaveLength(30);expect(result.history.map((row:Row)=>row.action)).toEqual(Array.from({length:30},(_,i)=>'action.'+(1004-i)));expect(result.history[0]).not.toHaveProperty('details');
 });
});
