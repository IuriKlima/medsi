import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import type {INestApplication} from '@nestjs/common';
import {MemoryStore} from './helpers/firestore-memory';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import type {Row} from '../apps/api/src/platform/firestore/store';
import {AuthService,AuthGuard} from '../apps/api/src/identity/auth';
import {MedicalIntakeController} from '../apps/api/src/onboarding/medical-intake-controller';
import {OnboardingController} from '../apps/api/src/onboarding/controller';
import {PurchaseController} from '../apps/api/src/billing/controller';
import {LaunchController} from '../apps/api/src/onboarding/launch';
import {CalendarController} from '../apps/api/src/onboarding/calendar-controller';
const fixture=vi.hoisted(()=>({server:null as unknown}));
vi.mock('../apps/api/src/platform/service',()=>({serviceDatabase:()=>fixture.server}));
vi.mock('../apps/api/src/platform/firebase-auth',()=>({verifyFirebaseActor:vi.fn()}));
const store=new MemoryStore(),owners=[randomUUID(),randomUUID()],companies=[randomUUID(),randomUUID()];
const clients=owners.map(id=>firestoreClient('authenticated',id,store)),server=firestoreClient('service_role',null,store);
async function value<T=Row>(result:PromiseLike<{data:unknown;error:unknown}>):Promise<T>{const r=await result;if(r.error)throw r.error;return r.data as T;}
const strategy={positioning:'Fixture clínica',objectives:[{goal:'Informar serviços',metric:'Solicitações administrativas',suggestedTarget:'Proposta'}],calendar:Array.from({length:4},(_,i)=>({week:1+i,format:'imagem',theme:'Tema '+i,brief:'Pauta administrativa fictícia',needsClientVideo:false})),ads:[],keywords:Array.from({length:20},(_,i)=>'palavra '+i),unknowns:['Fontes ausentes nesta fixture']};
const suggestion={title:'Atendimento administrativo',objective:'Informar horários',audience:'Interessados com consentimento',steps:['Revisão humana'],message:'Rascunho',requirements:['Canal oficial autorizado'],successMetric:'A confirmar'};
describe('two fictitious clinics: HTTP and durable native journey (memory; no providers)',()=>{
 let app:INestApplication,origin:string;
 beforeAll(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));vi.stubEnv('DATABASE_PROVIDER','firestore');vi.stubEnv('CHECKOUT_MODE','test');vi.stubEnv('NODE_ENV','test');vi.stubEnv('CONTENT_AUTOPREP_ENABLED','false');vi.stubEnv('OPENAI_API_KEY','');fixture.server=server;
  await store.run(async tx=>{for(let n=0;n<2;n++){const w=randomUUID(),company=companies[n]!,owner=owners[n]!;tx.put('companies',company,{id:company,workspace_id:w,name:'Clínica fictícia '+n});tx.put('workspace_members',w+'_'+owner,{role:'owner'});tx.put('onboarding_provider_limits',company+'_strategy',{company_id:company,kind:'strategy',daily_calls:2});tx.put('company_onboarding',company,{id:company,company_id:company,revision:0,profile_version:0,confirmed_revision:null,facts:{},medical_intake:{version:1,answers:{businessType:{value:'clinic'}}}});}});
  const module=await Test.createTestingModule({controllers:[MedicalIntakeController,OnboardingController,PurchaseController,LaunchController,CalendarController],providers:[AuthGuard,{provide:AuthService,useValue:{verify:async(header:string)=>{const n=owners.findIndex(id=>header==='Bearer '+id);if(n<0)throw new Error('Invalid fixture actor');return {id:owners[n],email:'fixture'+n+'@example.test',client:clients[n]};}}}]}).compile();app=module.createNestApplication();app.useLogger(false);await app.listen(0,'127.0.0.1');origin=await app.getUrl();
 });
 afterAll(async()=>{await app?.close();vi.unstubAllEnvs();vi.useRealTimers();});
 async function request(n:number,suffix:string,body?:unknown,company=companies[n]!){const response=await fetch(origin+'/onboarding/companies/'+company+'/'+suffix,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+owners[n],'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json() as Row};}
 it('persists intake, reload, test access, evidence, strategy, current-month dates and reversible skipped traffic',async()=>{
  for(let n=0;n<2;n++){
   const answers:[string,unknown][]=[['cnpj',{value:'11222333000181'}],['address',{name:'Clínica fictícia '+n,addressLine:'Rua Fictícia, 10',city:'São Paulo',uf:'SP',postalCode:'01001000',businessType:'clinic'}],['specialty',{values:['Clínica geral']}],['history',{mode:'text',text:'Trajetória fictícia para teste administrativo.'}],['logo',{mode:'create',style:'Minimalista'}],['photos',{mode:'skip',attachmentIds:[]}],['website',{mode:'create'}],['confirm',{}]];
   for(const [step,answer] of answers){const current=await value(clients[n]!.rpc('company_onboarding_read',{p_company_id:companies[n]}));expect((await request(n,'intake',{requestId:randomUUID(),revision:current.state.revision,step,answer})).status).toBe(201);}
   const resumed=await value(clients[n]!.rpc('company_onboarding_read',{p_company_id:companies[n]}));expect(resumed.confirmedProfile.facts.name.value).toBe('Clínica fictícia '+n);
   const checkout=await request(n,'purchase/checkout',{requestId:randomUUID(),planId:'askadia_monthly'});expect(checkout.status).toBe(201);expect((await request(n,'purchase')).body.aiAllowed).toBe(false);
   expect((await request(n,'purchase/checkout/confirm',{checkoutId:checkout.body.id,outcome:'approved',accepted:true})).status).toBe(201);expect((await request(n,'purchase')).body.accessMode).toBe('test');
   expect((await request(n,'launch/planning-preferences',{postsPerMonth:4,maxPostsPerWeek:2})).status).toBe(201);
   const call=(name:string,args:Row={})=>value(clients[n]!.rpc(name,{p_company_id:companies[n],...args}));
   await call('request_regional_research');const regional=await value(server.rpc('claim_regional_research_server'));await value(server.rpc('finish_regional_research_server',{p_id:regional.id,p_token:regional.token,p_snapshot:{city:'São Paulo',uf:'SP',collectedAt:new Date().toISOString(),ibge:{state:'unavailable',data:null,sex:[],ages:[],sourceUrl:'https://servicodados.ibge.gov.br',message:'Fixture sem provedor'},trends:{state:'available',query:'clínica geral',geo:'BR-SP',region:'São Paulo',period:'today 3-m',rows:[],sourceUrl:'https://trends.google.com',message:'Fixture vazia'}}}));
   const approve=async(stage:number)=>{const current=(await request(n,'launch/journey')).body;expect((await request(n,'launch/approve',{stage,basis:current.stages[stage-1].basis,limitations:'Fixture: fontes ausentes reconhecidas'})).status).toBe(201);};
   await approve(1);const id=randomUUID();await call('start_company_strategy',{p_request_id:id});await call('finish_company_strategy',{p_request_id:id,p_output:strategy,p_model:'fixture-model'});await approve(2);await approve(3);
   const rec=await value(server.rpc('claim_company_launch_server'));await value(server.rpc('finish_company_launch_server',{p_id:rec.id,p_token:rec.token,p_output:{summary:'Fixture',whatsapp:[suggestion],messages:[suggestion],traffic:[suggestion],unknowns:[]}}));await approve(4);
   const journey=(await request(n,'launch/journey')).body;expect(journey.stages[2].data.every((i:Row)=>i.date.slice(0,7)===new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7))).toBe(true);
   expect((await request(n,'launch/traffic-preference',{mode:'skipped',basis:journey.stages[4].basis})).status).toBe(201);expect((await request(n,'purchase/finish',{})).status).toBe(201);expect((await request(n,'purchase')).body.setupComplete).toBe(true);
   expect((await request(n,'calendar')).body.items).toHaveLength(4);expect((await request(n,'launch/journey')).body.stages[4].status).toBe('skipped');
  }
  expect(await store.run(tx=>tx.list('company_subscriptions'))).toEqual([]);expect(await store.run(tx=>tx.list('company_ad_executions'))).toEqual([]);
 });
 it('rejects cross-clinic reads and writes; profile edit invalidates setup without destroying the old version',async()=>{
  expect((await request(0,'launch/journey',undefined,companies[1])).status).toBe(403);expect((await request(0,'launch/planning-preferences',{postsPerMonth:1,maxPostsPerWeek:1},companies[1])).status).toBe(403);
  const current=await value(clients[0]!.rpc('company_onboarding_read',{p_company_id:companies[0]}));expect((await request(0,'intake',{requestId:randomUUID(),revision:current.state.revision,step:'history',answer:{mode:'text',text:'Trajetória fictícia revisada.'}})).status).toBe(201);
  expect((await request(0,'purchase')).body.setupComplete).toBe(false);expect((await request(1,'purchase')).body.setupComplete).toBe(true);expect(await store.run(tx=>tx.get('company_profile_versions',companies[0]+'_1'))).not.toBeNull();
 });
});
