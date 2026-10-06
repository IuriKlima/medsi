import {randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it} from 'vitest';
import {beginCompany,createCompany} from '../apps/api/src/platform/firestore/identity';
import {MemoryStore} from './helpers/firestore-memory';
import type {FirestoreActor} from '../apps/api/src/platform/firestore/access';
import type {Row} from '../apps/api/src/platform/firestore/store';

describe('single customer clinic in native identity transactions',()=>{
 let store:MemoryStore,actor:FirestoreActor,workspace:string;
 beforeEach(async()=>{store=new MemoryStore();actor={role:'authenticated',id:randomUUID()};workspace=randomUUID();await store.run(async tx=>{tx.put('profiles',actor.id!,{id:actor.id});tx.put('workspaces',workspace,{id:workspace});tx.put('workspace_members',workspace+'_'+actor.id,{workspace_id:workspace,user_id:actor.id,role:'owner'});});});
 const begin=(args:Row={})=>store.run(tx=>beginCompany(tx,actor,{p_request_id:randomUUID(),...args}));
 const create=()=>store.run(tx=>createCompany(tx,actor,{p_workspace_id:workspace,p_name:'Outra clínica',p_segment:'clinic',p_city:'São Paulo',p_timezone:'America/Sao_Paulo'}));
 it('resumes a progressed clinic for new request IDs and direct creation without resetting its data',async()=>{
  const first=await begin();await store.run(async tx=>{const c=await tx.get('companies',first.companyId);tx.put('companies',first.companyId,{...c,name:'Clínica existente'});tx.put('company_onboarding',first.companyId,{revision:6,facts:{name:'preservado'}});});
  const results=await Promise.all([begin(),begin(),create()]);expect(results.map(r=>r.companyId??r.id)).toEqual([first.companyId,first.companyId,first.companyId]);
  expect(await store.run(tx=>tx.list('companies'))).toHaveLength(1);expect(await store.run(tx=>tx.get('company_onboarding',first.companyId))).toEqual({revision:6,facts:{name:'preservado'}});
 });
 it('serializes distinct first requests and keeps replay idempotent',async()=>{
  const request=randomUUID();const results=await Promise.all([begin({p_request_id:request}),begin(),begin({p_request_id:request}),create()]);expect(new Set(results.map(r=>r.companyId??r.id)).size).toBe(1);expect(await store.run(tx=>tx.list('companies'))).toHaveLength(1);
 });
 it('rejects foreign workspace IDs and never resumes another users clinic',async()=>{
  const foreign=randomUUID(),id=randomUUID();await store.run(async tx=>tx.put('companies',id,{id,workspace_id:foreign,archived_at:null,created_at:'2020-01-01'}));
  await expect(begin({p_workspace_id:foreign})).rejects.toMatchObject({code:'42501'});expect((await begin()).companyId).not.toBe(id);
 });
 it('resumes an invited clinic and rechecks membership on replay',async()=>{
  const company=randomUUID(),request=randomUUID();await store.run(async tx=>{tx.put('companies',company,{id:company,workspace_id:randomUUID(),archived_at:null,created_at:'2020-01-01'});tx.put('company_members',company+'_'+actor.id,{company_id:company,user_id:actor.id,role:'marketing'});});
  expect((await begin({p_request_id:request})).companyId).toBe(company);expect((await begin({p_request_id:request})).companyId).toBe(company);
  await store.run(async tx=>tx.remove('company_members',company+'_'+actor.id));await expect(begin({p_request_id:request})).rejects.toMatchObject({code:'42501'});
 });
 it('preserves staff creation and legacy records but excludes archived clinics',async()=>{
  await store.run(async tx=>tx.put('platform_staff',actor.id!,{active:true,role:'platform_admin'}));const first=await create(),second=await create();expect(first.id).not.toBe(second.id);
  await store.run(async tx=>{tx.put('platform_staff',actor.id!,{active:false,role:'platform_admin'});tx.put('companies',first.id,{...first,created_at:'2020-01-01',archived_at:'2021-01-01'});tx.put('companies',second.id,{...second,created_at:'2022-01-01'});});
  expect((await begin()).companyId).toBe(second.id);expect(await store.run(tx=>tx.list('companies'))).toHaveLength(2);
 });
});
