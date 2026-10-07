import {randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it} from 'vitest';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {MemoryStore} from './helpers/firestore-memory';

describe('legacy scoped Firestore reads — isolated fictitious clinics',()=>{
 let store:MemoryStore,company:string,other:string,owner:string,admin:string,marketing:string,reader:string,staff:string,platformAdmin:string;
 const db=(id:string)=>firestoreClient('authenticated',id,store);
 beforeEach(async()=>{
  store=new MemoryStore();[company,other,owner,admin,marketing,reader,staff,platformAdmin]=Array.from({length:8},()=>randomUUID());
  const workspace=randomUUID();
  await store.run(async tx=>{
   tx.put('companies',company,{id:company,workspace_id:workspace,archived_at:null});tx.put('companies',other,{id:other,workspace_id:randomUUID(),archived_at:null});
   tx.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});
   for(const [id,role] of [[admin,'admin'],[marketing,'marketing'],[reader,'reader']])tx.put('company_members',company+'_'+id,{company_id:company,user_id:id,role});
   for(const c of [company,other]){
    tx.put('company_invitations',c,{id:c,company_id:c,email:'ficticia@example.test',role:'reader',token_hash:'private-token-fingerprint',invited_by:owner,expires_at:'2099-01-01',accepted_at:null,revoked_at:null,created_at:'2026-10-07'});
    tx.put('audit_logs',c,{id:c,company_id:c,workspace_id:c===company?workspace:randomUUID(),action:'fixture',created_at:'2026-10-07'});
    tx.put('editorial_drafts',c,{id:c,company_id:c,title:'Texto fictício',created_at:'2026-10-07'});
    for(const user of [marketing,reader])tx.put('company_permission_grants',c+'_'+user,{company_id:c,user_id:user,action:'content.approve',expires_at:null});
   }
   tx.put('platform_staff',platformAdmin,{user_id:platformAdmin,role:'platform_admin',active:true});tx.put('platform_staff',staff,{user_id:staff,role:'support',active:true});
  });
 });
 it.each(['company_invitations','audit_logs','company_permission_grants','editorial_drafts'])('supports %s only within an explicitly authorized company scope',async table=>{
  const result=await db(owner).from(table).select('*').eq('company_id',company);expect(result.error).toBeNull();expect(result.data?.length).toBeGreaterThan(0);expect(result.data?.every(r=>r.company_id===company)).toBe(true);
  expect((await db(owner).from(table).select('*').eq('company_id',other)).error?.code).toBe('42501');
  expect((await db(owner).from(table).select('*')).error?.code).toBe('42501');
  expect((await firestoreClient('anon',null,store).from(table).select('*').eq('company_id',company)).error?.code).toBe('42501');
 });
 it('requires a manager for invitations/audit and never returns invitation token hashes',async()=>{
  for(const table of ['company_invitations','audit_logs']){
   expect((await db(admin).from(table).select('*').eq('company_id',company)).error).toBeNull();
   expect((await db(marketing).from(table).select('*').eq('company_id',company)).error?.code).toBe('42501');
  }
  const rows=await db(owner).from('company_invitations').select('*').eq('company_id',company);expect(JSON.stringify(rows.data)).not.toContain('token_hash');expect(JSON.stringify(rows.data)).not.toContain('private-token-fingerprint');
  expect((await db(owner).from('company_invitations').select('token_hash').eq('company_id',company)).error?.code).toBe('42501');
 });
 it('limits delegated grant reads to the current member unless manager',async()=>{
  const own=await db(marketing).from('company_permission_grants').select('*').eq('company_id',company);expect(own.error).toBeNull();expect(own.data).toHaveLength(1);expect(own.data?.[0].user_id).toBe(marketing);
  expect((await db(marketing).from('company_permission_grants').select('*').eq('company_id',company).eq('user_id',reader)).data).toEqual([]);
  await store.run(async tx=>tx.remove('company_members',company+'_'+marketing));expect((await db(marketing).from('company_permission_grants').select('*').eq('company_id',company)).error?.code).toBe('42501');
 });
 it('allows marketing drafts while denying CRM-only and archived clinics',async()=>{
  expect((await db(reader).from('editorial_drafts').select('*').eq('company_id',company)).error).toBeNull();
  await store.run(async tx=>tx.put('company_members',company+'_'+reader,{company_id:company,user_id:reader,role:'attendant'}));expect((await db(reader).from('editorial_drafts').select('*').eq('company_id',company)).error?.code).toBe('42501');
  await store.run(async tx=>{const c=await tx.get('companies',company);tx.put('companies',company,{...c,archived_at:'2026-10-07'});});expect((await db(owner).from('audit_logs').select('*').eq('company_id',company)).error?.code).toBe('42501');
 });
 it('lists assignment candidates only to an active platform administrator',async()=>{
  const query=(actor:string)=>db(actor).from('platform_staff').select('user_id,role').eq('active',true).eq('role','support');
  expect((await query(platformAdmin)).data).toEqual([{user_id:staff,role:'support'}]);
  expect((await query(owner)).data).toEqual([]);expect((await query(staff)).data).toEqual([{user_id:staff,role:'support'}]);
  await store.run(async tx=>tx.put('platform_staff',platformAdmin,{user_id:platformAdmin,role:'platform_admin',active:false}));expect((await query(platformAdmin)).data).toEqual([]);
 });
});
