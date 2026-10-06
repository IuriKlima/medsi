import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const apiRequire=createRequire(resolve('apps/api/package.json'));
const {Firestore}=apiRequire('firebase-admin/firestore');
import {firestoreStore,type DocumentStore,type Row} from '../apps/api/src/platform/firestore/store';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {hash} from '../apps/api/src/platform/firestore/access';

import {MemoryStore} from './helpers/firestore-memory';

type Client=ReturnType<typeof firestoreClient>;
async function data<T>(request:PromiseLike<{data:unknown;error:unknown}>){const result=await request;if(result.error)throw result.error;return result.data as T;}
function scenarios(label:string,make:()=>Promise<{store:DocumentStore;close?:()=>Promise<void>}>){
 describe(label,()=>{
  let store:DocumentStore,close:(()=>Promise<void>)|undefined,a:Client,b:Client,admin:Client,actor:string,other:string,company:string;
  beforeAll(async()=>{const created=await make();store=created.store;close=created.close;admin=firestoreClient('service_role',null,store);
   const suffix=randomUUID();actor=await data<string>(admin.rpc('ensure_firebase_identity_server',{p_uid:'a-'+suffix,p_email:'same@example.test',p_name:'Clínica A'}));other=await data<string>(admin.rpc('ensure_firebase_identity_server',{p_uid:'b-'+suffix,p_email:'same@example.test',p_name:'Clínica B'}));
   a=firestoreClient('authenticated',actor,store);b=firestoreClient('authenticated',other,store);
   company=(await data<{companyId:string}>(a.rpc('begin_company_onboarding',{p_request_id:randomUUID()}))).companyId;
  },60000);
  afterAll(async()=>{await close?.();});
  it('creates independent UUIDs and cannot invoke trusted identity RPC as a user',async()=>{expect(actor).not.toBe(other);expect((await a.rpc('ensure_firebase_identity_server',{p_uid:'forged',p_email:'x@example.test',p_name:'X'})).error?.code).toBe('42501');});
  it('creates workspace, clinic and membership atomically and resumes untouched drafts',async()=>{const created=await data<{companyId:string}>(a.rpc('begin_company_onboarding',{p_request_id:randomUUID()}));expect(created.companyId).toBe(company);const rows=await data<Row[]>(a.from('companies').select('*'));expect(rows).toHaveLength(1);expect(rows[0].segment).toBe('clinic');});
  it('does not expose another clinic or private storage metadata',async()=>{expect(await data(b.from('companies').select('*'))).toEqual([]);expect((await b.rpc('company_onboarding_read',{p_company_id:company})).error?.code).toBe('42501');expect((await a.from('storage_objects').select('*')).error?.code).toBe('FIRESTORE_OPERATION_PENDING');});
  it('rejects skipped questions and stale revisions without partial writes',async()=>{const result=await a.rpc('save_medical_intake',{p_company_id:company,p_request_id:randomUUID(),p_revision:0,p_step:'specialty',p_answer:{values:['Cardiologia']}});expect(result.error?.code).toBe('22023');expect((await data<Row>(a.rpc('company_onboarding_read',{p_company_id:company}))).state.revision).toBe(0);});
  it('serializes simultaneous writes and rejects conflicting request reuse',async()=>{
   const request=randomUUID(),args={p_company_id:company,p_request_id:request,p_revision:0,p_step:'businessType',p_answer:{value:'medical_practice'}};
   const results=await Promise.all([a.rpc('save_medical_intake',args),a.rpc('save_medical_intake',args)]);expect(results.every(r=>!r.error)).toBe(true);
   expect((await a.rpc('save_medical_intake',{...args,p_answer:{value:'clinic'}})).error?.code).toBe('40001');
   expect((await a.rpc('save_medical_intake',{...args,p_request_id:randomUUID()})).error?.code).toBe('40001');
  });
  it('confirms the medical profile without inventing regional data or payment',async()=>{
   const answers=[['cnpj',{value:'11222333000181'}],['address',{name:'Consultório Teste',addressLine:'Rua Exemplo, 10',city:'São Paulo',uf:'SP',postalCode:'01001000',businessType:'medical_practice'}],['specialty',{values:['Cardiologia']}],['history',{mode:'text',text:'História profissional informada para este teste local.'}],['logo',{mode:'create',style:'Minimalista'}],['photos',{mode:'skip',attachmentIds:[]}],['website',{mode:'create'}],['confirm',{}]];
   for(const [step,answer] of answers){const state=await data<Row>(a.rpc('company_onboarding_read',{p_company_id:company}));await data(a.rpc('save_medical_intake',{p_company_id:company,p_request_id:randomUUID(),p_revision:state.state.revision,p_step:step,p_answer:answer}));}
   const snapshot=await data<Row>(a.rpc('company_onboarding_read',{p_company_id:company}));expect(snapshot.state.profile_version).toBe(1);expect(snapshot.state.confirmed_revision).toBe(snapshot.state.revision);expect(snapshot.confirmedProfile.facts.audience.status).toBe('deferred');expect((await data<Row>(a.rpc('company_purchase_state',{p_company_id:company}))).aiAllowed).toBe(false);
  });
  it('rejects references to a file from another clinic',async()=>{const id=randomUUID();await store.run(async tx=>tx.put('onboarding_attachments',id,{id,company_id:randomUUID(),mime:'application/pdf'}));const snapshot=await data<Row>(a.rpc('company_onboarding_read',{p_company_id:company}));expect((await a.rpc('save_medical_intake',{p_company_id:company,p_request_id:randomUUID(),p_revision:snapshot.state.revision,p_step:'history',p_answer:{mode:'pdf',attachmentId:id}})).error?.code).toBe('42501');});
  it('invalidates approval and address confirmation when the CNPJ changes',async()=>{
   const approval=randomUUID();await store.run(async tx=>tx.put('company_marketing_approvals',approval,{id:approval,company_id:company,profile_version:1,stage:1,basis:'old',invalidated_at:null}));
   const state=await data<Row>(a.rpc('company_onboarding_read',{p_company_id:company}));await data(a.rpc('save_medical_intake',{p_company_id:company,p_request_id:randomUUID(),p_revision:state.state.revision,p_step:'cnpj',p_answer:{value:'04252011000110'}}));
   const changed=await data<Row>(a.rpc('company_onboarding_read',{p_company_id:company}));expect(changed.state.confirmed_revision).toBeNull();expect(changed.state.medical_intake.answers.address).toBeUndefined();expect(changed.state.location_confirmed).toBe(false);expect((await store.run(tx=>tx.get('company_marketing_approvals',approval)))?.invalidated_at).toBeTruthy();
  });
  it('requires a completed private upload before recording an attachment',async()=>{const id=randomUUID();expect((await a.rpc('record_onboarding_attachment',{p_company_id:company,p_id:id,p_name:'CV.pdf',p_mime:'application/pdf',p_size:100,p_path:company+'/onboarding/'+id+'.pdf'})).error?.code).toBe('42501');});
  it('fails closed on operations not yet ported and on anonymous access',async()=>{expect((await a.rpc('start_content_run',{p_company_id:company})).error?.code).toBe('FIRESTORE_OPERATION_PENDING');expect((await a.rpc('approve_marketing_stage',{p_company_id:company,p_stage:1,p_basis:'fake'})).error?.code).toBe('40001');expect((await firestoreClient('anon',null,store).from('companies').select('*')).error?.code).toBe('42501');});
  it('checks revocation again on each operation',async()=>{
   const staffId=randomUUID();await store.run(async tx=>{tx.put('profiles',staffId,{id:staffId,display_name:'Atendente'});tx.put('company_members',company+'_'+staffId,{company_id:company,user_id:staffId,role:'marketing'});});
   const staff=firestoreClient('authenticated',staffId,store);expect((await staff.rpc('company_onboarding_read',{p_company_id:company})).error).toBeNull();
   await store.run(async tx=>tx.remove('company_members',company+'_'+staffId));expect((await staff.rpc('company_onboarding_read',{p_company_id:company})).error?.code).toBe('42501');
  });
  it('reserves a CNPJ lookup once and enforces its persisted daily limit',async()=>{
   await store.run(async tx=>tx.put('onboarding_provider_limits',company+'_places',{company_id:company,kind:'places',daily_calls:1}));
   const request=randomUUID(),args={p_company_id:company,p_request_id:request,p_kind:'places'};
   expect(await data(a.rpc('reserve_onboarding_provider',args))).toBe(true);expect(await data(a.rpc('reserve_onboarding_provider',args))).toBe(false);
   expect(await data(a.rpc('reserve_onboarding_provider',{...args,p_request_id:randomUUID()}))).toBe(false);
   expect((await b.rpc('finish_onboarding_provider',{...args,p_outcome:'completed'})).error?.code).toBe('42501');
   expect((await a.rpc('finish_onboarding_provider',{...args,p_outcome:'completed'})).error).toBeNull();
  });
  it('does not reserve paid AI work without active access',async()=>{expect((await a.rpc('reserve_onboarding_provider',{p_company_id:company,p_request_id:randomUUID(),p_kind:'strategy'})).error?.code).toBe('P0402');});
  it('denies another clinic upload before touching the cloud bucket',async()=>{const result=await b.storage.from('company-assets').upload(company+'/onboarding/'+randomUUID()+'.pdf',Buffer.from('%PDF-test'),{contentType:'application/pdf'});expect(result.error).toBeTruthy();});
  it('denies anonymous document reads when running against the emulator',async()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)return;const response=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/demo-medsi/databases/(default)/documents/medsi/v1/companies/'+company);expect(response.status).toBe(403);});
  it('canonicalizes fingerprints independently from object key order',()=>{expect(hash({b:2,a:1})).toBe(hash({a:1,b:2}));});
 });
}
scenarios('Firestore domain transactions (isolated memory)',async()=>({store:new MemoryStore()}));
if(process.env.FIRESTORE_EMULATOR_HOST){
 if(!process.env.FIRESTORE_EMULATOR_HOST.startsWith('127.0.0.1:')&&!process.env.FIRESTORE_EMULATOR_HOST.startsWith('localhost:'))throw new Error('Firestore tests require a local emulator');
 scenarios('Firestore native SDK and local emulator',async()=>{
  const db=new Firestore({projectId:'demo-medsi'});
  return {store:firestoreStore(db),close:async()=>{await db.terminate();}};
 });
}

