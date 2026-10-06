import {randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it} from 'vitest';
import {medicalIntakeRequestSchema,medicalIntakeSteps,nextMedicalIntakeStep,type MedicalIntakeAnswers} from '../packages/contracts/src/medical-intake';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {MemoryStore} from './helpers/firestore-memory';

const address={name:'Consultório Fixture',addressLine:'Rua Exemplo, 10',city:'São Paulo',uf:'SP',postalCode:'01001000',businessType:'medical_practice' as const};
const legacy:MedicalIntakeAnswers={cnpj:{value:'11222333000181'},address,specialty:{values:['Cardiologia']},history:{mode:'text',text:'História profissional fictícia para teste isolado.'},logo:{mode:'create',style:'Minimalista'},photos:{mode:'skip',attachmentIds:[]},website:{mode:'create'}};
describe('Medical business type first',()=>{
 let store:MemoryStore,company:string,owner:string,workspace:string,client:ReturnType<typeof firestoreClient>;
 beforeEach(async()=>{
  store=new MemoryStore();company=randomUUID();owner=randomUUID();workspace=randomUUID();client=firestoreClient('authenticated',owner,store);
  await store.run(async tx=>{tx.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});tx.put('companies',company,{id:company,workspace_id:workspace,archived_at:null});tx.put('company_onboarding',company,{company_id:company,revision:0,profile_version:0,confirmed_revision:null,facts:{},medical_intake:{version:1,answers:{}}});});
 });
 const state=async()=>store.run(tx=>tx.get('company_onboarding',company));
 const save=async(step:string,answer:unknown)=>client.rpc('save_medical_intake',{p_company_id:company,p_request_id:randomUUID(),p_revision:(await state())!.revision,p_step:step,p_answer:answer});
 it('starts with an explicit choice and resumes legacy addresses without asking again',()=>{
  expect(medicalIntakeSteps[0]).toBe('businessType');expect(nextMedicalIntakeStep(null)).toBe('businessType');
  expect(nextMedicalIntakeStep({version:1,answers:legacy})).toBe('review');
  expect(medicalIntakeRequestSchema.safeParse({requestId:randomUUID(),revision:0,step:'businessType',answer:{value:'medical_practice'}}).success).toBe(true);
  expect(medicalIntakeRequestSchema.safeParse({requestId:randomUUID(),revision:0,step:'businessType',answer:{value:'hospital'}}).success).toBe(false);
 });
 it('rejects CNPJ before the choice without writing anything or starting paid work',async()=>{
  expect((await save('cnpj',legacy.cnpj)).error?.code).toBe('22023');expect((await state())!.revision).toBe(0);
  expect((await save('businessType',{value:'medical_practice'})).error).toBeNull();
  expect((await save('cnpj',legacy.cnpj)).error).toBeNull();
  for(const collection of ['company_visual_jobs','company_launch_jobs','company_subscriptions'])expect(await store.run(tx=>tx.list(collection))).toEqual([]);
 });
 it('rejects conflicting address type and preserves the explicit choice',async()=>{
  await save('businessType',{value:'medical_practice'});await save('cnpj',legacy.cnpj);
  expect((await save('address',{...address,businessType:'clinic'})).error?.code).toBe('22023');
  expect((await save('address',address)).error).toBeNull();
 });
 it('derives old saved types, preserves confirmed versions and reconfirms edits with new facts',async()=>{
  const approval=randomUUID(),facts={businessType:{value:'Consultório médico',status:'provided'}};
  await store.run(async tx=>{tx.put('company_onboarding',company,{...(await tx.get('company_onboarding',company)),revision:7,confirmed_revision:7,profile_version:1,facts,medical_intake:{version:1,answers:legacy}});tx.put('company_profile_versions',company+'_1',{company_id:company,version:1,facts});tx.put('company_marketing_approvals',approval,{id:approval,company_id:company,invalidated_at:null});});
  const read=await client.rpc('company_onboarding_read',{p_company_id:company});expect(read.error).toBeNull();expect((await state())!.revision).toBe(7);
  expect((await save('businessType',{value:'clinic'})).error).toBeNull();
  const edited=(await state())!;expect(edited.confirmed_revision).toBeNull();expect(edited.medical_intake.answers).toEqual({...legacy,businessType:{value:'clinic'},address:{...address,businessType:'clinic'}});
  expect((await store.run(tx=>tx.get('company_marketing_approvals',approval)))!.invalidated_at).toBeTruthy();
  expect((await store.run(tx=>tx.get('company_profile_versions',company+'_1')))!.facts).toEqual(facts);
  expect((await save('confirm',{})).error).toBeNull();expect((await state())!.facts.businessType.value).toBe('Clínica');
  expect((await store.run(tx=>tx.get('companies',company)))!.segment).toBe('clinic');
 });
 it('confirms a legacy practice using its saved address type and practice wording',async()=>{
  await store.run(async tx=>tx.put('company_onboarding',company,{...(await tx.get('company_onboarding',company)),medical_intake:{version:1,answers:legacy}}));
  expect((await save('confirm',{})).error).toBeNull();const saved=(await state())!;
  expect(saved.medical_intake.answers.businessType).toEqual({value:'medical_practice'});expect(saved.facts.brand.value).toContain('consultório');
 });
 it('keeps tenant authorization on the new first step',async()=>{
  const outsider=firestoreClient('authenticated',randomUUID(),store);
  expect((await outsider.rpc('save_medical_intake',{p_company_id:company,p_request_id:randomUUID(),p_revision:0,p_step:'businessType',p_answer:{value:'clinic'}})).error?.code).toBe('42501');
  expect((await state())!.revision).toBe(0);
 });
});
