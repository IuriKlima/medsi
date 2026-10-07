import {afterEach,describe,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({rpc:vi.fn(),upload:vi.fn(),details:vi.fn(),design:vi.fn()}));
vi.mock('../apps/api/src/campaigns/ads',()=>({serviceDb:()=>({rpc:fixture.rpc,storage:{from:()=>({upload:fixture.upload})}})}));
vi.mock('../apps/api/src/onboarding/content',()=>({detailCalendar:fixture.details,designCreative:fixture.design}));
vi.mock('../apps/api/src/onboarding/carousel-reference',()=>({carouselReference:async()=>[]}));
import {ContentPreparation} from '../apps/api/src/onboarding/content-preparation';
const job={id:'fixture-job',companyId:'fixture-company',token:'fixture-token',runId:'fixture-run',kind:'details',frame:0,context:{facts:{},items:[]}};
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('native content worker — provider fixtures only',()=>{
 it('falls back from strategy queue to native text production and persists provider output',async()=>{
  vi.stubEnv('DATABASE_PROVIDER','firestore');fixture.rpc.mockImplementation(async(name:string)=>({data:name==='claim_content_production_server'?job:null,error:null}));fixture.details.mockResolvedValue({items:[],model:'fixture'});
  const worker=new ContentPreparation();worker.onModuleDestroy();await (worker as unknown as {tick():Promise<void>}).tick();
  expect(fixture.details).toHaveBeenCalledWith(job.context);expect(fixture.rpc).toHaveBeenCalledWith('finish_content_production_server',{p_id:job.id,p_token:job.token,p_result:{items:[],model:'fixture'}});
 });
 it('stores generated images privately before linking and returns recoverable provider failures',async()=>{
  vi.stubEnv('DATABASE_PROVIDER','firestore');fixture.rpc.mockImplementation(async(name:string)=>({data:name==='claim_content_production_server'?{...job,kind:'design',context:{facts:{},item:{id:'fixture-item'},materials:[]}}:null,error:null}));fixture.design.mockResolvedValue({bytes:Buffer.from('fixture'),mime:'image/png',model:'fixture'});fixture.upload.mockResolvedValue({error:null});
  const worker=new ContentPreparation();worker.onModuleDestroy();await (worker as unknown as {tick():Promise<void>}).tick();expect(fixture.upload).toHaveBeenCalledWith('fixture-company/generated/fixture-run.png',Buffer.from('fixture'),{contentType:'image/png',upsert:false});expect(fixture.rpc).toHaveBeenCalledWith('finish_content_production_server',expect.objectContaining({p_result:{mime:'image/png',model:'fixture'}}));
  fixture.design.mockRejectedValue(new Error('Fixture timeout'));await (worker as unknown as {tick():Promise<void>}).tick();expect(fixture.rpc).toHaveBeenLastCalledWith('finish_content_production_server',{p_id:job.id,p_token:job.token,p_result:null});
 });
});
