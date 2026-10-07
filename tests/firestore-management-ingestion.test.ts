import {createHash,randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {MemoryStore} from './helpers/firestore-memory';
import type {Row} from '../apps/api/src/platform/firestore/store';

describe('management ingestion on native Firestore — isolated simulated storage',()=>{
 let store:MemoryStore,company:string,workspace:string,owner:string;
 const tokenHash='a'.repeat(64),observed='2026-10-07T11:59:00Z';
 const student=(id='fixture-person',phone='+5511999999001')=>({externalId:id,name:'Pessoa fictícia',phone,birthday:null,lastAttendance:null,status:'active',consent:true,tag:''});
 const db=()=>firestoreClient('authenticated',owner,store);
 const ingest=(args:Row={})=>{const students=[student()],event=randomUUID();return firestoreClient('service_role',null,store).rpc('ingest_management_students',{p_hash:tokenHash,p_event:event,p_observed_at:observed,p_students:students,p_body_hash:createHash('sha256').update(JSON.stringify(students)).digest('hex'),...args});};
 const key=(value:string|null=tokenHash,who=owner,id=company)=>firestoreClient('authenticated',who,store).rpc('set_management_ingestion_key',{p_company_id:id,p_id:randomUUID(),p_hash:value});
 beforeEach(async()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Network forbidden in local fixtures');}));store=new MemoryStore();company=randomUUID();workspace=randomUUID();owner=randomUUID();await store.run(async tx=>{tx.put('companies',company,{id:company,workspace_id:workspace,name:'Clínica fictícia',timezone:'UTC'});tx.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});});});
 afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
 it('maps controller operations, exposes safe status and imports only into the key tenant',async()=>{
  expect(await db().rpc('management_ingestion_status',{p_company_id:company})).toMatchObject({data:null,error:null});expect(await key()).toMatchObject({error:null});
  const status=await db().rpc('management_ingestion_status',{p_company_id:company});expect(status.data).toMatchObject({active:true,lastReceivedAt:null,lastObservedAt:null});expect(JSON.stringify(status.data)).not.toContain(tokenHash);
  const foreign=randomUUID();expect(await ingest({p_company_id:foreign})).toMatchObject({data:{duplicate:false,imported:1},error:null});
  expect((await db().from('campaign_students').select('*').eq('company_id',company)).data).toEqual([expect.objectContaining({company_id:company,source:'api',updated_at:observed})]);
  for(const table of ['management_ingestion_keys','management_ingestion_key_hashes','management_ingestion_events'])expect((await db().from(table).select('*').eq('company_id',company)).error).toBeTruthy();
 });
 it('requires owner key control, dual permission for ingestion and service role entry',async()=>{
  const member=randomUUID();await store.run(async tx=>tx.put('company_members',company+'_'+member,{company_id:company,user_id:member,role:'admin'}));expect((await key(tokenHash,member)).error).toMatchObject({code:'42501'});expect((await key()).error).toBeNull();
  expect((await db().rpc('ingest_management_students',{})).error).toMatchObject({code:'42501'});
  await store.run(async tx=>tx.remove('workspace_members',workspace+'_'+owner));expect((await ingest()).error).toMatchObject({code:'42501'});
 });
 it('serializes replay and rejects changed bodies and older snapshots without writes',async()=>{
  expect((await key()).error).toBeNull();const event=randomUUID(),first=await ingest({p_event:event});expect(first.error).toBeNull();expect(await ingest({p_event:event})).toMatchObject({data:{duplicate:true,imported:0},error:null});expect((await ingest({p_event:event,p_body_hash:'b'.repeat(64)})).error).toMatchObject({code:'40001'});
  expect((await ingest({p_observed_at:'2026-10-07T11:58:00Z'})).error).toMatchObject({code:'40001'});expect((await ingest({p_observed_at:'2026-10-06T11:00:00Z'})).error).toMatchObject({code:'22023'});expect((await ingest({p_observed_at:'2026-10-07T12:06:00Z'})).error).toMatchObject({code:'22023'});
  const next=randomUUID(),concurrent=await Promise.all([ingest({p_event:next}),ingest({p_event:next})]);expect(concurrent.every(r=>r.error===null)).toBe(true);expect(concurrent.map(r=>r.data.imported).sort()).toEqual([0,1]);
 });
 it('revokes and rotates keys atomically without resetting replay or snapshot history',async()=>{
  expect((await key()).error).toBeNull();const event=randomUUID();expect((await ingest({p_event:event})).error).toBeNull();expect((await key(null)).error).toBeNull();expect((await ingest()).error).toMatchObject({code:'42501'});
  expect((await key('b'.repeat(64))).error).toBeNull();expect((await ingest()).error).toMatchObject({code:'42501'});expect(await ingest({p_hash:'b'.repeat(64),p_event:event})).toMatchObject({data:{duplicate:true,imported:0},error:null});
 });
 it('enforces ten batches per minute and rejects invalid recipient batches atomically',async()=>{
  expect((await key()).error).toBeNull();expect((await ingest({p_students:[student(),student()]})).error).toMatchObject({code:'22023'});expect((await db().from('campaign_students').select('*').eq('company_id',company)).data).toEqual([]);
  for(let n=0;n<10;n++)expect((await ingest()).error).toBeNull();expect((await ingest()).error).toMatchObject({code:'22023'});vi.setSystemTime(new Date(Date.now()+60001));expect((await ingest()).error).toBeNull();
 });
 it('cannot reuse a key hash across companies and retains explicit opt-out on import',async()=>{
  expect((await key()).error).toBeNull();const foreign=randomUUID();await store.run(async tx=>tx.put('companies',foreign,{id:foreign,workspace_id:workspace,name:'Outra clínica fictícia',timezone:'UTC'}));expect((await key(tokenHash,owner,foreign)).error).toMatchObject({code:'23505'});
  expect((await ingest()).error).toBeNull();const rows=(await db().from('campaign_students').select('*').eq('company_id',company)).data!;expect((await db().rpc('revoke_campaign_contact',{p_company_id:company,p_id:rows[0].id})).error).toBeNull();expect((await ingest()).error).toBeNull();expect((await db().from('campaign_students').select('*').eq('company_id',company)).data).toEqual([expect.objectContaining({consent:false,opted_out:true})]);
 });
});
