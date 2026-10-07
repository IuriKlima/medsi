import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
const db=vi.hoisted(()=>({rpc:vi.fn(),open:vi.fn(),details:vi.fn()}));
vi.mock('../apps/api/src/platform/service',()=>({serviceDatabase:()=>{db.open();return {rpc:db.rpc};}}));
vi.mock('../apps/api/src/platform/postgres',()=>({closePostgres:vi.fn()}));
vi.mock('../apps/api/src/onboarding/content',()=>({detailCalendar:db.details,designCreative:vi.fn()}));
import {createWorkerRuntime,BackgroundRunner} from '../apps/api/src/background/bootstrap';
import {backgroundHandlers} from '../apps/api/src/background/registry';
import {ContentPreparation} from '../apps/api/src/onboarding/content-preparation';
import {LaunchPreparation} from '../apps/api/src/onboarding/launch';
import {automationReady} from '../apps/api/src/inbox/automation';
import {campaignDeliveryReady} from '../apps/api/src/campaigns/delivery';
import {AppModule,HealthController} from '../apps/api/src/app';

const runners:BackgroundRunner[]=[];
beforeEach(()=>{
 vi.useFakeTimers();vi.clearAllMocks();
 for(const [key,value] of Object.entries({NODE_ENV:'test',BACKGROUND_EXECUTOR:'worker',DATABASE_PROVIDER:'supabase',SUPABASE_URL:'https://fixture.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-key',EVOLUTION_API_URL:'https://fixture.test',EVOLUTION_API_KEY:'fixture-key',CONTENT_AUTOPREP_ENABLED:'false',VISUAL_JOBS_ENABLED:'false',REGIONAL_RESEARCH_ENABLED:'false',INSTAGRAM_MONITOR_ENABLED:'false',IMAGE_DESCRIPTIONS_ENABLED:'false',ADS_EXECUTION_ENABLED:'false',INSTAGRAM_PUBLICATION_ENABLED:'false',ASAAS_RECONCILIATION_ENABLED:'false',INBOX_AUTOMATION_ENABLED:'true',MESSAGE_CAMPAIGNS_ENABLED:'true'}))vi.stubEnv(key,value);
 db.rpc.mockImplementation(async(name:string)=>({data:name==='inbox_auto_targets'?[]:null,error:null}));
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Provider/network calls forbidden in runtime fixtures');}));
});
afterEach(async()=>{await Promise.all(runners.splice(0).map(runner=>runner.onModuleDestroy()));vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
function keep(runner:BackgroundRunner){runners.push(runner);return runner;}
describe('dedicated worker reuses the API durable handlers',()=>{
 it('registers 13 existing processors, with 11 eligible to move and two explicitly API-owned',()=>{
  expect(backgroundHandlers).toHaveLength(13);expect(backgroundHandlers.filter(handler=>handler.apiOnly).map(handler=>handler.id)).toEqual(['campaign-delivery','inbox-automation']);
  expect(backgroundHandlers.find(handler=>handler.id==='content-preparation-and-production')?.processor).toBe(ContentPreparation);
  expect(backgroundHandlers.find(handler=>handler.id==='launch-and-site-preparation')?.processor).toBe(LaunchPreparation);
 });
 it('starts disabled by default without database access, even with configured providers',()=>{
  const runner=keep(createWorkerRuntime());runner.onModuleInit();expect(runner.health()).toMatchObject({mode:'disabled',processing:false});expect(db.open).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
 });
 it('exposes accurate background ownership through the booted Nest health controller',async()=>{
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();const app=module.createNestApplication({logger:false});
  try{await app.init();expect(app.get(HealthController).health().backgroundExecution).toMatchObject({role:'api',executor:'worker',verification:'configuration-only',processing:true});}
  finally{await app.close();}expect(vi.getTimerCount()).toBe(0);
 });
 it('dry-run reports owner and configuration without claims or providers',async()=>{
  const runner=keep(createWorkerRuntime('dry-run'));runner.onModuleInit();await vi.advanceTimersByTimeAsync(60000);
  expect(runner.health().handlers.filter(handler=>handler.owner==='api').map(handler=>handler.id)).toEqual(['campaign-delivery','inbox-automation']);
  expect(db.open).not.toHaveBeenCalled();expect(db.rpc).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('keeps the messaging API readiness gates functioning after other jobs move to worker',async()=>{
  const api=keep(new BackgroundRunner('api')),worker=keep(createWorkerRuntime('enabled'));api.onModuleInit();worker.onModuleInit();await vi.advanceTimersByTimeAsync(5000);
  expect(api.health().handlers.filter(handler=>handler.polling).map(handler=>handler.id)).toEqual(['campaign-delivery','inbox-automation']);
  expect(worker.health().processing).toBe(false);expect(automationReady()).toBe(true);expect(campaignDeliveryReady()).toBe(true);
  expect(db.rpc.mock.calls.map(([name])=>name)).toEqual(['inbox_auto_targets','claim_message_campaign']);expect(fetch).not.toHaveBeenCalled();
 });
 it('disabled ownership stops even API-owned messaging handlers',()=>{
  vi.stubEnv('BACKGROUND_EXECUTOR','disabled');const api=keep(new BackgroundRunner('api'));api.onModuleInit();expect(api.health().processing).toBe(false);expect(db.open).not.toHaveBeenCalled();
 });
 it('refuses implicit worker ownership and rejects production before scheduling anything',()=>{
  vi.stubEnv('BACKGROUND_EXECUTOR','api');expect(()=>createWorkerRuntime('enabled')).toThrow('BACKGROUND_EXECUTOR=worker');
  vi.stubEnv('NODE_ENV','production');for(const mode of ['disabled','dry-run','enabled'] as const)expect(()=>createWorkerRuntime(mode)).toThrow('Production worker disabled');
  expect(db.open).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
 });
 it.each([false,true])('runs the existing content claim and finish lifecycle, draining provider failure=%s',async fail=>{
  for(const [key,value] of Object.entries({CONTENT_AUTOPREP_ENABLED:'true',OPENAI_API_KEY:'fixture-key',OPENAI_MODEL_ANALYSIS:'fixture-model',OPENAI_MODEL_COPY:'fixture-model',OPENAI_MODEL_IMAGE:'fixture-model',OPENAI_MODEL_ORCHESTRATOR:'',OPENAI_MODEL_SITE:'',OPENAI_MODEL_SEARCH:''}))vi.stubEnv(key,value);
  const job={id:'fixture-job',companyId:'fixture-company',token:'fixture-lease',kind:'details',context:{facts:{},items:[]}},output={items:[],model:'fixture-model'};
  db.rpc.mockImplementation(async(name:string)=>({data:name==='claim_content_preparation_server'?job:null,error:null}));
  let finish:()=>void=()=>{};db.details.mockImplementation(()=>new Promise((resolve,reject)=>{finish=()=>fail?reject(new Error('Fixture provider unavailable')):resolve(output);}));
  const worker=keep(createWorkerRuntime('enabled'));worker.onModuleInit();await vi.advanceTimersByTimeAsync(7000);
  expect(db.details).toHaveBeenCalledWith(job.context);const closing=worker.onModuleDestroy();expect(worker.health().status).toBe('stopping');finish();await closing;
  expect(db.rpc).toHaveBeenLastCalledWith('finish_content_preparation_server',{p_id:job.id,p_token:job.token,p_result:fail?null:output});
  await vi.advanceTimersByTimeAsync(60000);expect(db.rpc.mock.calls.filter(([name])=>name==='claim_content_preparation_server')).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);expect(fetch).not.toHaveBeenCalled();
 });
 it.each([{rpc:'inbox_auto_targets',initial:3000,field:'targets',value:[],flag:'MESSAGE_CAMPAIGNS_ENABLED'},{rpc:'claim_message_campaign',initial:5000,field:'job',value:null,flag:'INBOX_AUTOMATION_ENABLED'}])('continues bounded Firestore pages promptly for $rpc, then resumes idle polling',async scenario=>{
  for(const [key,value] of Object.entries({DATABASE_PROVIDER:'firestore',FIREBASE_PROJECT_ID:'fixture-project',SECRETS_ENCRYPTION_KEY:'a'.repeat(64),META_GRAPH_API_VERSION:'v26.0',WHATSAPP_CLOUD_APP_SECRET:'fixture-secret',WHATSAPP_CLOUD_VERIFY_TOKEN:'fixture-token',[scenario.flag]:'false'}))vi.stubEnv(key,value);
  let pages=0;db.rpc.mockImplementation(async()=>({data:{[scenario.field]:scenario.value,hasMore:++pages<41},error:null}));
  const api=keep(new BackgroundRunner('api'));api.onModuleInit();await vi.advanceTimersByTimeAsync(scenario.initial+40000);
  expect(pages).toBe(41);expect(db.rpc).toHaveBeenCalledWith(scenario.rpc,{p_paginated:true});expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(14999);expect(pages).toBe(41);await vi.advanceTimersByTimeAsync(1);expect(pages).toBe(42);
  await api.onModuleDestroy();await vi.advanceTimersByTimeAsync(60000);expect(pages).toBe(42);expect(vi.getTimerCount()).toBe(0);
 });
});
