import {createHash,randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it} from 'vitest';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {MemoryStore} from './helpers/firestore-memory';
import type {DocumentStore,Row} from '../apps/api/src/platform/firestore/store';

describe('native Firestore team and delegation contracts',()=>{
 let store:MemoryStore,owner:string,admin:string,member:string,guest:string,company:string,other:string,workspace:string;
 const rpc=(actor:string,name:string,args:Row={})=>firestoreClient('authenticated',actor,store).rpc(name,args);
 const call=(actor:string,name:string,args:Row={})=>rpc(actor,name,{p_company_id:company,...args});
 const invite=(email='guest@example.test',role='marketing',actor=owner)=>call(actor,'create_company_invitation',{p_email:email,p_role:role});
 const accept=(actor:string,token:string)=>rpc(actor,'accept_company_invitation',{p_token:token});
 const permission=(args:Row={},actor=owner)=>call(actor,'set_company_permission',{p_user_id:member,p_action:'crm.read',p_enabled:true,...args});
 const rows=(collection:string)=>store.run(tx=>tx.list(collection));
 const failOnAudit=():DocumentStore=>({run:operation=>store.run(tx=>operation({...tx,put:(c,id,row)=>{if(c==='audit_logs')throw new Error('Injected write failure');tx.put(c,id,row);}}))});
 beforeEach(async()=>{
  store=new MemoryStore();[owner,admin,member,guest,company,other,workspace]=Array.from({length:7},()=>randomUUID());
  await store.run(async tx=>{
   tx.put('companies',company,{id:company,workspace_id:workspace,archived_at:null});tx.put('companies',other,{id:other,workspace_id:randomUUID(),archived_at:null});
   tx.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});
   for(const [id,role] of [[admin,'admin'],[member,'marketing']])tx.put('company_members',company+'_'+id,{company_id:company,user_id:id,role});
   for(const id of [owner,admin,member,guest])tx.put('profiles',id,{id,display_name:id===guest?'Convidado':'Pessoa',private_field:'hidden'});
   tx.put('firebase_identities','guest',{firebase_uid:'guest',user_id:guest,email:'guest@example.test'});
  });
 });
 it('dispatches the six handlers and returns only tenant roster fields to managers',async()=>{
  const result=await call(owner,'company_roster');expect(result.error).toBeNull();expect(result.data).toHaveLength(2);expect(result.data[0]).toEqual({user_id:admin,role:'admin',display_name:'Pessoa'});
  expect((await call(admin,'company_roster')).error).toBeNull();expect((await call(member,'company_roster')).error?.code).toBe('42501');expect((await call(owner,'company_roster',{p_company_id:other})).error?.code).toBe('42501');
 });
 it('creates hashed seven-day invitations, supersedes pending tokens, and isolates other tenants',async()=>{
  const first=await invite('GUEST@EXAMPLE.TEST');expect(first.error).toBeNull();const second=await invite();expect(second.error).toBeNull();expect(second.data.token).toMatch(/^[a-f0-9]{64}$/);
  const invitations=await rows('company_invitations');expect(invitations).toHaveLength(2);expect(invitations[0].revoked_at).toBeTruthy();expect(invitations[1].email).toBe('guest@example.test');expect(invitations[1].token).toBeUndefined();expect(invitations[1].token_hash).toBe(createHash('sha256').update(second.data.token).digest('hex'));expect(Date.parse(second.data.expires_at)-Date.parse(invitations[1].created_at)).toBe(7*86400000);
  expect((await accept(guest,first.data.token)).error?.code).toBe('42501');expect((await call(owner,'revoke_company_invitation',{p_company_id:other,p_invitation_id:second.data.id})).error?.code).toBe('42501');
 });
 it('accepts once with verified identity email, creates scoped memberships and audits no token',async()=>{
  const invitation=await invite();expect(invitation.error).toBeNull();expect(await accept(guest,invitation.data.token)).toMatchObject({data:company,error:null});expect((await accept(guest,invitation.data.token)).error?.code).toBe('42501');
  expect(await store.run(tx=>tx.get('company_members',company+'_'+guest))).toMatchObject({role:'marketing'});expect(await store.run(tx=>tx.get('workspace_members',workspace+'_'+guest))).toMatchObject({role:'member'});expect((await call(guest,'company_capabilities',{p_company_id:other})).error?.code).toBe('42501');expect(JSON.stringify(await rows('audit_logs'))).not.toContain(invitation.data.token);
 });
 it.each(['expired','revoked','issuer_removed','issuer_demoted','archived','email_changed','identity_missing'])('rejects %s invitations atomically',async reason=>{
  const invitation=await invite('guest@example.test','marketing',admin);expect(invitation.error).toBeNull();
  await store.run(async tx=>{
   const row=await tx.get('company_invitations',invitation.data.id);
   if(reason==='expired')tx.put('company_invitations',invitation.data.id,{...row,expires_at:'2000-01-01'});
   if(reason==='revoked')tx.put('company_invitations',invitation.data.id,{...row,revoked_at:new Date().toISOString()});
   if(reason==='issuer_removed')tx.remove('company_members',company+'_'+admin);
   if(reason==='issuer_demoted')tx.put('company_members',company+'_'+admin,{company_id:company,user_id:admin,role:'reader'});
   if(reason==='archived')tx.put('companies',company,{id:company,workspace_id:workspace,archived_at:new Date().toISOString()});
   if(reason==='email_changed')tx.put('firebase_identities','guest',{user_id:guest,email:'another@example.test'});
   if(reason==='identity_missing')tx.remove('firebase_identities','guest');
  });
  expect((await accept(guest,invitation.data.token)).error?.code).toBe('42501');expect(await store.run(tx=>tx.get('company_members',company+'_'+guest))).toBeNull();expect(await store.run(tx=>tx.get('workspace_members',workspace+'_'+guest))).toBeNull();expect(await rows('audit_logs')).toHaveLength(1);
 });
 it('rejects duplicate membership without consuming an invitation or downgrading workspace owners',async()=>{
  const invitation=await invite();expect(invitation.error).toBeNull();await store.run(async tx=>tx.put('company_members',company+'_'+guest,{company_id:company,user_id:guest,role:'reader'}));expect((await accept(guest,invitation.data.token)).error?.code).toBe('23505');expect((await rows('company_invitations'))[0].accepted_at).toBeNull();
  await store.run(async tx=>{tx.remove('company_members',company+'_'+guest);tx.put('workspace_members',workspace+'_'+guest,{workspace_id:workspace,user_id:guest,role:'owner'});});expect((await accept(guest,invitation.data.token)).error).toBeNull();expect(await store.run(tx=>tx.get('workspace_members',workspace+'_'+guest))).toMatchObject({role:'owner'});
 });
 it('revokes only pending invitations belonging to the requested company',async()=>{
  const invitation=await invite();expect(invitation.error).toBeNull();expect((await call(owner,'revoke_company_invitation',{p_invitation_id:invitation.data.id})).error).toBeNull();expect((await accept(guest,invitation.data.token)).error?.code).toBe('42501');expect((await call(owner,'revoke_company_invitation',{p_invitation_id:randomUUID()})).error?.code).toBe('22023');
 });
 it('does not revoke a foreign invitation even when the actor manages both companies',async()=>{
  const invitation=await invite();expect(invitation.error).toBeNull();await store.run(async tx=>tx.put('company_members',other+'_'+owner,{company_id:other,user_id:owner,role:'admin'}));
  expect((await call(owner,'revoke_company_invitation',{p_company_id:other,p_invitation_id:invitation.data.id})).error?.code).toBe('22023');expect((await rows('company_invitations'))[0].revoked_at).toBeNull();
 });
 it('serializes competing acceptances and rejects accepted-token revocation and replay after removal',async()=>{
  const invitation=await invite();expect(invitation.error).toBeNull();const results=await Promise.all([accept(guest,invitation.data.token),accept(guest,invitation.data.token)]);expect(results.filter(r=>!r.error)).toHaveLength(1);expect(results.find(r=>r.error)?.error?.code).toBe('42501');
  expect((await call(owner,'revoke_company_invitation',{p_invitation_id:invitation.data.id})).error?.code).toBe('22023');expect((await call(owner,'change_company_member',{p_user_id:guest,p_role:null})).error).toBeNull();expect((await accept(guest,invitation.data.token)).error?.code).toBe('42501');expect(await store.run(tx=>tx.get('company_members',company+'_'+guest))).toBeNull();
 });
 it('protects the last administrator, including concurrent demotions',async()=>{
  expect((await call(owner,'change_company_member',{p_user_id:admin,p_role:null})).error?.code).toBe('22023');expect((await call(owner,'change_company_member',{p_user_id:member,p_role:'admin'})).error).toBeNull();
  const results=await Promise.all([call(owner,'change_company_member',{p_user_id:admin,p_role:'reader'}),call(owner,'change_company_member',{p_user_id:member,p_role:'reader'})]);expect(results.filter(r=>!r.error)).toHaveLength(1);expect((await rows('company_members')).filter(m=>m.role==='admin')).toHaveLength(1);
 });
 it('removal cascades delegated grants, revokes issuer invitations and rechecks retry access',async()=>{
  await call(owner,'change_company_member',{p_user_id:member,p_role:'admin'});const invitation=await invite('guest@example.test','reader',member);expect(invitation.error).toBeNull();expect((await permission()).error).toBeNull();expect((await call(owner,'change_company_member',{p_user_id:member,p_role:null})).error).toBeNull();expect(await rows('company_permission_grants')).toHaveLength(0);expect((await rows('company_invitations'))[0].revoked_at).toBeTruthy();expect((await invite('other@example.test','reader',member)).error?.code).toBe('42501');expect((await call(member,'company_capabilities')).error?.code).toBe('42501');
 });
 it('limits delegation to owners and existing members, expires grants and upserts without duplicates',async()=>{
  expect((await permission({},admin)).error?.code).toBe('42501');expect((await permission({p_user_id:guest})).error?.code).toBe('22023');expect((await permission()).error).toBeNull();expect((await permission()).error).toBeNull();expect(await rows('company_permission_grants')).toHaveLength(1);expect((await call(member,'company_capabilities')).data.actions).toContain('crm.read');
  await store.run(async tx=>{const g=(await tx.list('company_permission_grants'))[0];tx.put('company_permission_grants',company+'_'+member+'_crm.read',{...g,expires_at:'2000-01-01'});});expect((await call(member,'company_capabilities')).data.actions).not.toContain('crm.read');expect((await permission({p_enabled:false})).error).toBeNull();expect(await rows('company_permission_grants')).toHaveLength(0);
 });
 it.each([{p_action:'billing.manage'},{p_action:'ads.approve'},{p_action:'ads.approve',p_budget_limit_cents:-1},{p_budget_limit_cents:100},{p_expires_at:'2000-01-01'},{p_expires_at:'garbage'},{p_enabled:'true'}])('rejects invalid delegation %j without writes',async args=>{expect((await permission(args)).error?.code).toBe('22023');expect(await rows('company_permission_grants')).toHaveLength(0);expect(await rows('audit_logs')).toHaveLength(0);});
 it('stores ads approval budget and expiry without widening the delegation scope',async()=>{
  const expiry=new Date(Date.now()+86400000).toISOString();expect((await permission({p_action:'ads.approve',p_budget_limit_cents:50000,p_expires_at:expiry})).error).toBeNull();expect((await rows('company_permission_grants'))[0]).toMatchObject({company_id:company,user_id:member,action:'ads.approve',budget_limit_cents:50000,expires_at:expiry,granted_by:owner});
 });
 it('denies archived-company management and delegation even to the workspace owner',async()=>{
  const invitation=await invite();expect(invitation.error).toBeNull();await store.run(async tx=>tx.put('companies',company,{id:company,workspace_id:workspace,archived_at:new Date().toISOString()}));
  expect((await permission()).error?.code).toBe('42501');expect((await call(owner,'company_roster')).error?.code).toBe('42501');expect((await call(owner,'change_company_member',{p_user_id:member,p_role:'reader'})).error?.code).toBe('42501');expect((await call(owner,'revoke_company_invitation',{p_invitation_id:invitation.data.id})).error?.code).toBe('42501');expect((await invite()).error?.code).toBe('42501');
 });
 it('denies tenant role escalation and rolls back staged invitation writes on persistence failure',async()=>{
  expect((await invite('guest@example.test','platform_admin')).error?.code).toBe('22023');expect((await call(owner,'change_company_member',{p_user_id:member,p_role:'platform_admin'})).error?.code).toBe('22023');
  const first=await invite();expect(first.error).toBeNull();const result=await firestoreClient('authenticated',owner,failOnAudit()).rpc('create_company_invitation',{p_company_id:company,p_email:'guest@example.test',p_role:'reader'});expect(result.error).not.toBeNull();expect(await rows('company_invitations')).toHaveLength(1);expect((await rows('company_invitations'))[0].revoked_at).toBeNull();expect(await rows('audit_logs')).toHaveLength(1);
 });
 it('rolls back acceptance memberships and token consumption when its audit write fails',async()=>{
  const invitation=await invite();expect(invitation.error).toBeNull();expect((await firestoreClient('authenticated',guest,failOnAudit()).rpc('accept_company_invitation',{p_token:invitation.data.token})).error).not.toBeNull();
  expect(await store.run(tx=>tx.get('company_members',company+'_'+guest))).toBeNull();expect(await store.run(tx=>tx.get('workspace_members',workspace+'_'+guest))).toBeNull();expect((await rows('company_invitations'))[0].accepted_at).toBeNull();expect((await accept(guest,invitation.data.token)).error).toBeNull();
 });
 it('rejects anonymous/service actors and has no platform-staff shortcut to tenant team management',async()=>{
  await store.run(async tx=>tx.put('platform_staff',guest,{user_id:guest,role:'platform_admin',active:true}));expect((await call(guest,'company_roster')).error?.code).toBe('42501');
  for(const actorRole of ['anon','service_role'] as const)expect((await firestoreClient(actorRole,null,store).rpc('company_roster',{p_company_id:company})).error?.code).toBe('42501');
 });
});
