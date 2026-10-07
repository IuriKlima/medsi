import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {runOfficialCampaign,type OfficialCampaignJob} from '../apps/api/src/campaigns/delivery';
import {sealChannel} from '../apps/api/src/onboarding/channel-vault';
import type {SupabaseClient} from '@supabase/supabase-js';
const job:OfficialCampaignJob={id:'fixture-delivery',token:'fixture-token',companyId:'fixture-company',actorId:'fixture-owner',phone:'+5511999999999',phoneId:'123456789',body:'Mensagem administrativa fixture',transport:'whatsapp_cloud'};
beforeEach(()=>{vi.stubEnv('SECRETS_ENCRYPTION_KEY','c'.repeat(64));vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Network forbidden in fixtures')));});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const setup=(prepared=true)=>{const rpc=vi.fn(async(name:string)=>({data:name==='read_company_whatsapp_server'?{remote_id:job.phoneId,status:'connected',metadata:{webhookReady:true},cipher:sealChannel(job.companyId,{token:'fixture-token-never-sent',phoneId:job.phoneId,wabaId:'987654321'})}:name==='prepare_message_campaign'?prepared:true,error:null}));return {rpc,db:{rpc} as unknown as Pick<SupabaseClient,'rpc'>};};
describe('official relationship campaign executor — no provider calls',()=>{
 it('sends only after atomic preparation and records returned provider ID',async()=>{const {rpc,db}=setup(),send=vi.fn().mockResolvedValue({messages:[{id:'fixture-message-id'}]});await runOfficialCampaign(job,db,send);expect(send).toHaveBeenCalledOnce();expect(send).toHaveBeenCalledWith(job.phoneId,'messages','fixture-token-never-sent',expect.objectContaining({messaging_product:'whatsapp',to:'5511999999999',type:'text'}));expect(rpc).toHaveBeenLastCalledWith('finish_message_campaign',{p_id:job.id,p_token:job.token,p_sent:true,p_provider_id:'fixture-message-id'});});
 it('never sends after revoked preparation and records uncertainty after timeout',async()=>{const denied=setup(false),send=vi.fn();await runOfficialCampaign(job,denied.db,send);expect(send).not.toHaveBeenCalled();const {rpc,db}=setup();send.mockRejectedValue(new Error('Fixture timeout'));await expect(runOfficialCampaign(job,db,send)).rejects.toThrow('Fixture timeout');expect(rpc).toHaveBeenLastCalledWith('finish_message_campaign',{p_id:job.id,p_token:job.token,p_sent:false,p_provider_id:null});});
});
