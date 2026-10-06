import {serviceDatabase} from '../platform/service';
import {databaseConfigured} from '../platform/config';
import {Injectable,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common';
import {type SupabaseClient} from '@supabase/supabase-js';
import {evolutionRequest} from '../onboarding/channels';
import {record} from '../inbox/evolution';
let lastPoll=0;
export function campaignDeliveryReady(){return process.env.MESSAGE_CAMPAIGNS_ENABLED==='true'&&Date.now()-lastPoll<90000;}
@Injectable()
export class CampaignDelivery implements OnModuleInit,OnModuleDestroy{
 private db:SupabaseClient|undefined;private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
 onModuleInit(){if(process.env.MESSAGE_CAMPAIGNS_ENABLED!=='true'||!databaseConfigured()||!process.env.EVOLUTION_API_URL||!process.env.EVOLUTION_API_KEY)return;this.db=serviceDatabase();this.timer=setTimeout(()=>void this.tick(),5000);}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 private async rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const r=await this.db!.rpc(name,args);if(r.error)throw new Error('Campaign storage unavailable');return r.data as T;}
 private async tick(){try{const job=await this.rpc<{id:string;token:string;companyId:string;instance:string;phone:string;body:string}|null>('claim_message_campaign');lastPoll=Date.now();if(job&&!this.stopped&&job.instance==='askadia-'+job.companyId&&/^\+[1-9][0-9]{7,14}$/.test(job.phone)){const live=await evolutionRequest('/instance/connectionState/'+encodeURIComponent(job.instance));if(record(live.instance).state==='open'&&await this.rpc<boolean>('prepare_message_campaign',{p_id:job.id,p_token:job.token})){let providerId:string|null=null;try{const sent=await evolutionRequest('/message/sendText/'+encodeURIComponent(job.instance),{number:job.phone.slice(1),text:job.body});const id=record(sent.key).id;if(typeof id==='string')providerId=id;}finally{await this.rpc('finish_message_campaign',{p_id:job.id,p_token:job.token,p_sent:Boolean(providerId),p_provider_id:providerId});}}}}catch{/* Do not log contact data or retry an uncertain send. */}finally{if(!this.stopped)this.timer=setTimeout(()=>void this.tick(),15000);}}
}
