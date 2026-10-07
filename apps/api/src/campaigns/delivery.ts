import {serviceDatabase} from '../platform/service';
import {databaseConfigured,firestoreBackend} from '../platform/config';
import {Injectable,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common';
import {type SupabaseClient} from '@supabase/supabase-js';
import {evolutionRequest} from '../onboarding/channels';
import {record} from '../inbox/evolution';
import {cloudConfigured,cloudGraph,type CloudCredentials} from '../inbox/whatsapp-cloud';
import {openChannel} from '../onboarding/channel-vault';
export type OfficialCampaignJob={id:string;token:string;companyId:string;actorId:string;phone:string;phoneId:string;body:string;transport:'whatsapp_cloud'};
export async function runOfficialCampaign(job:OfficialCampaignJob,db:Pick<SupabaseClient,'rpc'>,send=cloudGraph){
 const response=await db.rpc('read_company_whatsapp_server',{p_company_id:job.companyId,p_actor:job.actorId,p_action:'crm.write'});const row=response.data as {remote_id:string;status:string;metadata:{webhookReady?:boolean};cipher:string}|null;if(response.error||!row||row.remote_id!==job.phoneId||row.status!=='connected'||!row.metadata.webhookReady)return;const credentials=openChannel<CloudCredentials>(job.companyId,row.cipher);if(credentials.phoneId!==job.phoneId)return;
 const prepared=await db.rpc('prepare_message_campaign',{p_id:job.id,p_token:job.token});if(prepared.error||prepared.data!==true)return;let providerId:string|null=null;try{const sent=await send<{messages?:{id:string}[]}>(job.phoneId,'messages',credentials.token,{messaging_product:'whatsapp',recipient_type:'individual',to:job.phone.slice(1),type:'text',text:{preview_url:false,body:job.body}});providerId=sent.messages?.[0]?.id??null;}finally{await db.rpc('finish_message_campaign',{p_id:job.id,p_token:job.token,p_sent:Boolean(providerId),p_provider_id:providerId});}
}
let lastPoll=0;
export function campaignDeliveryReady(){return process.env.MESSAGE_CAMPAIGNS_ENABLED==='true'&&Date.now()-lastPoll<90000;}
@Injectable()
export class CampaignDelivery implements OnModuleInit,OnModuleDestroy{
 private db:SupabaseClient|undefined;private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
 onModuleInit(){if(process.env.MESSAGE_CAMPAIGNS_ENABLED!=='true'||!databaseConfigured()||(firestoreBackend()?!cloudConfigured():!process.env.EVOLUTION_API_URL||!process.env.EVOLUTION_API_KEY))return;this.db=serviceDatabase();this.timer=setTimeout(()=>void this.tick(),5000);}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 private async rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const r=await this.db!.rpc(name,args);if(r.error)throw new Error('Campaign storage unavailable');return r.data as T;}
 private async tick(){try{const job=await this.rpc<{id:string;token:string;companyId:string;instance:string;phone:string;body:string}|null>('claim_message_campaign');lastPoll=Date.now();if(job&&!this.stopped&&firestoreBackend()){await runOfficialCampaign(job as unknown as OfficialCampaignJob,this.db!);return;}if(job&&!this.stopped&&job.instance==='askadia-'+job.companyId&&/^\+[1-9][0-9]{7,14}$/.test(job.phone)){const live=await evolutionRequest('/instance/connectionState/'+encodeURIComponent(job.instance));if(record(live.instance).state==='open'&&await this.rpc<boolean>('prepare_message_campaign',{p_id:job.id,p_token:job.token})){let providerId:string|null=null;try{const sent=await evolutionRequest('/message/sendText/'+encodeURIComponent(job.instance),{number:job.phone.slice(1),text:job.body});const id=record(sent.key).id;if(typeof id==='string')providerId=id;}finally{await this.rpc('finish_message_campaign',{p_id:job.id,p_token:job.token,p_sent:Boolean(providerId),p_provider_id:providerId});}}}}catch{/* Do not log contact data or retry an uncertain send. */}finally{if(!this.stopped)this.timer=setTimeout(()=>void this.tick(),15000);}}
}
