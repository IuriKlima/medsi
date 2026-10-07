import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {firestoreStore,type DocumentStore,type Row} from '../apps/api/src/platform/firestore/store';
import {MemoryStore} from './helpers/firestore-memory';

async function value<T=Row>(request:PromiseLike<{data:unknown;error:unknown}>):Promise<T>{const r=await request;if(r.error)throw r.error;return r.data as T;}
const emulator=process.env.FIRESTORE_EMULATOR_HOST;
if(emulator&&!/^(127\.0\.0\.1|localhost):\d+$/.test(emulator))throw new Error('Checkout tests require a local emulator');
const apiRequire=createRequire(resolve('apps/api/package.json'));
const instant=new Date('2026-10-02T12:00:00Z');
describe('Firestore checkout — '+(emulator?'local emulator':'isolated memory')+', no charges',()=>{
 let close:(()=>Promise<void>)|undefined;
 let store:DocumentStore,owner:string,company:string,otherCompany:string,workspace:string,readerId:string;
 let user:ReturnType<typeof firestoreClient>,server:ReturnType<typeof firestoreClient>;
 beforeEach(async()=>{
  vi.stubEnv('CHECKOUT_MODE','test');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(instant);
  if(emulator){const {Firestore}=apiRequire('firebase-admin/firestore');const db=new Firestore({projectId:'demo-medsi'});store=firestoreStore(db);close=()=>db.terminate();}else store=new MemoryStore();owner=randomUUID();company=randomUUID();otherCompany=randomUUID();workspace=randomUUID();readerId=randomUUID();
  user=firestoreClient('authenticated',owner,store);server=firestoreClient('service_role',null,store);
  await store.run(async tx=>{
   tx.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});
   for(const id of [company,otherCompany]){tx.put('companies',id,{id,workspace_id:workspace,archived_at:null});tx.put('company_onboarding',id,{company_id:id,profile_version:1,revision:8,confirmed_revision:8});}
   tx.put('company_members',company+'_'+readerId,{company_id:company,user_id:readerId,role:'reader'});
   tx.put('onboarding_provider_limits',company+'_strategy',{company_id:company,kind:'strategy',daily_calls:1});
  });
 });
 afterEach(async()=>{vi.unstubAllEnvs();vi.useRealTimers();await close?.();});
 const beginArgs=(companyId:string,id=randomUUID(),plan='askadia_monthly',installments?:number)=>({p_company_id:companyId,p_id:id,p_plan:plan,p_installments:installments??null});
 function begin(plan='askadia_monthly',installments?:number){return value(user.rpc('begin_test_checkout',beginArgs(company,randomUUID(),plan,installments)));}
 function complete(id:string,outcome='approved',accepted=true,actor=owner,companyId=company){return server.rpc('complete_test_checkout_server',{p_company_id:companyId,p_id:id,p_actor:actor,p_outcome:outcome,p_accepted:accepted});}
 function state(client=user,id=company){return value(client.rpc('company_purchase_state',{p_company_id:id}));}
 it('opens a test checkout after onboarding and resumes it without charging or granting access',async()=>{
  const checkout=await begin();expect(checkout).toMatchObject({company_id:company,actor_id:owner,mode:'test',status:'pending',total_cents:159700,installments:1,installment_cents:159700});
  expect(Date.parse(checkout.expires_at)-instant.getTime()).toBe(30*60*1000);
  expect(await state()).toMatchObject({aiAllowed:false,accessMode:'none',latestCheckout:{id:checkout.id}});
  expect(await store.run(tx=>tx.get('company_subscriptions',company))).toBeNull();
 });
 it('uses server prices and exact cent totals for every semiannual installment count',async()=>{
  for(let n=1;n<=6;n++){const c=await begin('askadia_semiannual',n);expect(c.total_cents).toBe(800000);expect(c.installments).toBe(n);expect(c.installment_cents).toBe(Math.floor(800000/n));}
  expect((await begin('askadia_semiannual')).installments).toBe(6);
  for(const [plan,n] of [['askadia_monthly',2],['askadia_semiannual',0],['askadia_semiannual',7],['askadia_semiannual',1.5],['askadia_annual',1]] as const)expect((await user.rpc('begin_test_checkout',beginArgs(company,randomUUID(),plan,n))).error?.code).toBe('22023');
 });
 it('is idempotent on retries, cancels replaced plans, and rejects reused IDs with changed inputs',async()=>{
  const args=beginArgs(company);const results=await Promise.all([value(user.rpc('begin_test_checkout',args)),value(user.rpc('begin_test_checkout',args))]);expect(results[0]).toEqual(results[1]);
  expect((await user.rpc('begin_test_checkout',{...args,p_plan:'askadia_semiannual'})).error?.code).toBe('22023');
  expect((await user.rpc('begin_test_checkout',{...args,p_company_id:otherCompany})).error?.code).toBe('22023');
  const newer=await begin('askadia_semiannual');expect((await store.run(tx=>tx.get('company_test_checkouts',args.p_id)))?.status).toBe('cancelled');
  expect((await state()).latestCheckout.id).toBe(newer.id);
  expect((await complete(args.p_id)).error?.code).toBe('22023');
 });
 it('serializes different checkout IDs so only the newest remains pending',async()=>{
  const first=beginArgs(company),second=beginArgs(company,randomUUID(),'askadia_semiannual');
  await Promise.all([value(user.rpc('begin_test_checkout',first)),value(user.rpc('begin_test_checkout',second))]);
  const rows=await store.run(tx=>tx.list('company_test_checkouts',[{field:'company_id',value:company}]));
  expect(rows.filter(r=>r.status==='pending')).toHaveLength(1);expect(rows.filter(r=>r.status==='cancelled')).toHaveLength(1);
  expect((await state()).latestCheckout.id).toBe(rows.find(r=>r.status==='pending')?.id);
 });
 it('does not approve an old checkout concurrently with replacing it',async()=>{
  const old=await begin();const [completion,replacement]=await Promise.all([complete(old.id),user.rpc('begin_test_checkout',beginArgs(company))]);
  expect([completion,replacement].filter(r=>!r.error)).toHaveLength(1);
  expect([completion,replacement].find(r=>r.error)?.error?.code).toBe('22023');
  const status=await state();expect(status.aiAllowed).toBe(!completion.error);
  expect(status.latestCheckout.status).toBe(completion.error?'pending':'test_approved');
 });
 it('requires explicit test mode for starting and completing even through the adapter',async()=>{
  const c=await begin();vi.stubEnv('CHECKOUT_MODE','live');
  expect((await user.rpc('begin_test_checkout',beginArgs(company))).error?.code).toBe('22023');expect((await complete(c.id)).error?.code).toBe('22023');expect((await state()).aiAllowed).toBe(false);
 });
 it('denies readers, outsiders, anonymous clients, and direct user completion',async()=>{
  const c=await begin();const reader=firestoreClient('authenticated',readerId,store);
  expect(await state(reader)).toMatchObject({canPurchase:false,latestCheckout:null});
  for(const actor of [reader,firestoreClient('authenticated',randomUUID(),store),firestoreClient('anon',null,store),server])expect((await actor.rpc('begin_test_checkout',beginArgs(company))).error?.code).toBe('42501');
  expect((await user.rpc('complete_test_checkout_server',{p_company_id:company,p_id:c.id,p_actor:owner,p_outcome:'approved',p_accepted:true})).error?.code).toBe('42501');
  expect((await complete(c.id,'approved',true,readerId)).error?.code).toBe('42501');
  expect((await user.from('company_test_access').select('*')).error?.code).toBe('FIRESTORE_OPERATION_PENDING');
 });
 it('revalidates the actor, company, terms, and confirmed profile before granting test access',async()=>{
  const c=await begin();expect((await complete(c.id,'approved',false)).error?.code).toBe('22023');expect((await complete(c.id,'approved',true,owner,otherCompany)).error?.code).toBe('22023');
  await store.run(async tx=>tx.put('company_onboarding',company,{company_id:company,profile_version:1,revision:9,confirmed_revision:8}));expect((await complete(c.id)).error?.code).toBe('22023');
  await store.run(async tx=>tx.remove('workspace_members',workspace+'_'+owner));expect((await complete(c.id)).error?.code).toBe('42501');
  expect(await store.run(tx=>tx.get('company_test_access',company))).toBeNull();
 });
 it('does not start before confirmation and never grants access to an archived clinic',async()=>{
  await store.run(async tx=>tx.put('company_onboarding',company,{profile_version:0,revision:0,confirmed_revision:null}));expect((await user.rpc('begin_test_checkout',beginArgs(company))).error?.code).toBe('22023');
  await store.run(async tx=>tx.put('companies',company,{id:company,workspace_id:workspace,archived_at:instant.toISOString()}));expect((await user.rpc('company_purchase_state',{p_company_id:company})).error?.code).toBe('42501');
 });
 it('persists seven days of test access once, without live subscription, and gates paid AI and quotas',async()=>{
  const c=await begin();const reserve=()=>user.rpc('reserve_onboarding_provider',{p_company_id:company,p_request_id:randomUUID(),p_kind:'strategy'});
  expect((await reserve()).error?.code).toBe('P0402');await value(complete(c.id));
  const access=await state();expect(access).toMatchObject({aiAllowed:true,accessMode:'test',planId:'askadia_monthly',testUntil:'2026-10-09T12:00:00.000Z',latestCheckout:{status:'test_approved'}});
  vi.setSystemTime(new Date(instant.getTime()+3600000));await value(complete(c.id));expect((await state()).testUntil).toBe(access.testUntil);
  expect(await value(reserve())).toBe(true);expect(await value(reserve())).toBe(false);
  expect((await state(user,otherCompany)).aiAllowed).toBe(false);expect(await store.run(tx=>tx.get('company_subscriptions',company))).toBeNull();
  expect((await store.run(tx=>tx.list('audit_logs'))).filter(x=>x.company_id===company&&x.action==='checkout.test.approved')).toHaveLength(1);
  expect((await user.rpc('begin_test_checkout',beginArgs(company))).error?.code).toBe('22023');
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));expect(await state()).toMatchObject({aiAllowed:false,accessMode:'none'});expect((await reserve()).error?.code).toBe('P0402');
 });
 it.each(['declined','cancelled'])('keeps AI locked after %s and rejects changing the outcome',async outcome=>{
  const c=await begin();expect(await value(complete(c.id,outcome,false))).toMatchObject({status:outcome});await value(complete(c.id,outcome,false));expect((await complete(c.id)).error?.code).toBe('22023');expect((await state()).aiAllowed).toBe(false);
 });
 it('rejects an expired checkout and rolls back all confirmation writes',async()=>{
  const c=await begin();vi.setSystemTime(new Date(c.expires_at));expect((await complete(c.id)).error?.code).toBe('22023');expect((await store.run(tx=>tx.get('company_test_checkouts',c.id)))?.status).toBe('pending');expect(await store.run(tx=>tx.get('company_test_access',company))).toBeNull();
 });
 it('does not carry a simulated grant into provider checkout mode or production',async()=>{
  const c=await begin();await value(complete(c.id));expect((await state()).aiAllowed).toBe(true);
  vi.stubEnv('CHECKOUT_MODE','asaas_sandbox');expect((await state()).aiAllowed).toBe(false);
  vi.stubEnv('CHECKOUT_MODE','test');vi.stubEnv('NODE_ENV','production');expect((await state()).aiAllowed).toBe(false);
 });
 it('requires a matching approved test checkout behind an entitlement and gives live access precedence',async()=>{
  const c=await begin();await store.run(async tx=>tx.put('company_test_access',company,{company_id:company,checkout_id:c.id,valid_until:'2026-10-09T12:00:00Z'}));expect((await state()).aiAllowed).toBe(false);
  await value(complete(c.id));await store.run(async tx=>tx.put('company_test_checkouts',c.id,{...c,company_id:otherCompany,status:'test_approved'}));expect((await state()).aiAllowed).toBe(false);
  await store.run(async tx=>tx.put('company_subscriptions',company,{company_id:company,plan_id:'askadia_semiannual',status:'active',current_period_end:'2026-11-01T12:00:00Z'}));expect(await state()).toMatchObject({aiAllowed:true,accessMode:'live',planId:'askadia_semiannual'});
 });
});