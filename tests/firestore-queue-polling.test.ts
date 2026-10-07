import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../apps/api/src/platform/firebase-auth',()=>({verifyFirebaseActor:vi.fn()}));
const fake=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../apps/api/src/campaigns/ads',()=>({serviceDb:()=>({rpc:fake.rpc}),adsAccess:vi.fn()}));
vi.mock('../apps/api/src/onboarding/regional-providers',()=>({collectRegionalAudience:vi.fn(async()=>({fixture:true,ibge:{data:null}}))}));
vi.mock('../apps/api/src/onboarding/regional-map',()=>({collectRegionalMap:vi.fn(async()=>({state:'pending',center:null,viewport:null,radiusM:3000,locationConfirmed:false,selectionConfirmed:false,competitors:[],selectedIds:[],sourceUrl:'https://www.openstreetmap.org/copyright',message:'Fixture de mapa sem consulta externa'}))}));
import {RegionalResearchWorker} from '../apps/api/src/onboarding/regional-research';
import {ContentPreparation} from '../apps/api/src/onboarding/content-preparation';
import {LaunchPreparation} from '../apps/api/src/onboarding/launch';
const workers=[{name:'regional',create:()=>new RegionalResearchWorker(),start:6000,normal:7000},{name:'strategy',create:()=>new ContentPreparation(),start:7000,normal:5000},{name:'recommendations',create:()=>new LaunchPreparation(),start:8000,normal:7000}];
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();for(const [key,value] of Object.entries({DATABASE_PROVIDER:'firestore',FIREBASE_PROJECT_ID:'fixture',REGIONAL_RESEARCH_ENABLED:'true',CONTENT_AUTOPREP_ENABLED:'true',OPENAI_API_KEY:'fixture',OPENAI_MODEL_STRATEGY:'fixture-strategy',OPENAI_MODEL_COPY:'fixture-copy',OPENAI_MODEL_IMAGE:'fixture-image',OPENAI_MODEL_ORCHESTRATOR:'fixture-orchestrator',OPENAI_MODEL_SITE:'fixture-site',SUPABASE_URL:'https://fixture.test',SUPABASE_SERVICE_ROLE_KEY:'fixture'}))vi.stubEnv(key,value);fake.rpc.mockResolvedValue({data:null,error:null});});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllEnvs();});
describe('Firestore queue read budget — no real provider calls',()=>{
 it.each(workers)('$name waits a minute before reading an empty Firestore queue again',async spec=>{
  const worker=spec.create();worker.onModuleInit();await vi.advanceTimersByTimeAsync(spec.start);expect(fake.rpc.mock.calls.filter(([name])=>!['claim_company_site_server','claim_content_production_server'].includes(name))).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(59000);expect(fake.rpc.mock.calls.filter(([name])=>!['claim_company_site_server','claim_content_production_server'].includes(name))).toHaveLength(1);await vi.advanceTimersByTimeAsync(1000);expect(fake.rpc.mock.calls.filter(([name])=>!['claim_company_site_server','claim_content_production_server'].includes(name))).toHaveLength(2);worker.onModuleDestroy();
 });
 it.each(workers)('$name backs off for five minutes on failure and resumes the empty-queue cadence',async spec=>{
  fake.rpc.mockResolvedValueOnce({data:null,error:{code:'8',message:'Quota exceeded'}});const worker=spec.create();worker.onModuleInit();await vi.advanceTimersByTimeAsync(spec.start);
  await vi.advanceTimersByTimeAsync(299000);expect(fake.rpc.mock.calls.filter(([name])=>!['claim_company_site_server','claim_content_production_server'].includes(name))).toHaveLength(1);await vi.advanceTimersByTimeAsync(1000);expect(fake.rpc.mock.calls.filter(([name])=>!['claim_company_site_server','claim_content_production_server'].includes(name))).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(60000);expect(fake.rpc.mock.calls.filter(([name])=>!['claim_company_site_server','claim_content_production_server'].includes(name))).toHaveLength(3);worker.onModuleDestroy();
 });
 it.each(workers)('$name preserves polling for the existing SQL backend',async spec=>{
  vi.stubEnv('DATABASE_PROVIDER','supabase');const worker=spec.create();worker.onModuleInit();await vi.advanceTimersByTimeAsync(spec.start+spec.normal);expect(fake.rpc.mock.calls.filter(([name])=>!['claim_company_site_server','claim_content_production_server'].includes(name))).toHaveLength(2);worker.onModuleDestroy();
 });
 it('continues promptly after actual work and then slows down when the queue is empty',async()=>{
  fake.rpc.mockResolvedValueOnce({data:{id:'fixture-job',token:'fixture-token',facts:{},companyId:'fixture-company'},error:null}).mockResolvedValueOnce({data:true,error:null});
  const reads=()=>fake.rpc.mock.calls.filter(([name])=>name==='claim_regional_research_server').length;
  const worker=new RegionalResearchWorker();worker.onModuleInit();await vi.advanceTimersByTimeAsync(6000);expect(reads()).toBe(1);
  expect(fake.rpc).toHaveBeenCalledWith('finish_regional_research_server',expect.objectContaining({p_snapshot:expect.objectContaining({map:expect.objectContaining({state:'pending'})})}));
  const progress=fake.rpc.mock.calls.filter(([name])=>name==='progress_regional_research_server');expect(progress.map(([,args])=>args.p_state)).toEqual(['running','completed']);expect(progress.every(([,args])=>args.p_token==='fixture-token')).toBe(true);
  await vi.advanceTimersByTimeAsync(7000);expect(reads()).toBe(2);const calls=fake.rpc.mock.calls.length;
  await vi.advanceTimersByTimeAsync(59000);expect(reads()).toBe(2);expect(fake.rpc).toHaveBeenCalledTimes(calls);
  await vi.advanceTimersByTimeAsync(1000);expect(reads()).toBe(3);worker.onModuleDestroy();
 });
});
