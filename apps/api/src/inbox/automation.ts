import {serviceDatabase} from '../platform/service';
import {databaseConfigured} from '../platform/config';
import {Injectable,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common';
import {type SupabaseClient} from '@supabase/supabase-js';
import type {ServiceSettings} from '@askadia/contracts';
import {draftServiceReply} from './assistant';
import {decodeThread,evolutionChats,evolutionMessages,record} from './evolution';
import {evolutionRequest} from '../onboarding/channels';
export function automationConfigured(){return process.env.INBOX_AUTOMATION_ENABLED==='true'&&Boolean(databaseConfigured()&&process.env.EVOLUTION_API_URL&&process.env.EVOLUTION_API_KEY);}
let lastPoll=0;
export function automationReady(){return automationConfigured()&&Date.now()-lastPoll<90000;}
@Injectable()
export class InboxAutomation implements OnModuleInit,OnModuleDestroy{
 private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;private db:SupabaseClient|undefined;
 onModuleInit(){if(!automationConfigured())return;this.db=serviceDatabase();this.timer=setTimeout(()=>void this.tick(),3000);}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 private async rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const r=await this.db!.rpc(name,args);if(r.error)throw new Error('Automatic service database unavailable');return r.data as T;}
 private async tick(){try{const targets=await this.rpc<{companyId:string;since:string;instance:string}[]>('inbox_auto_targets');lastPoll=Date.now();for(const target of targets){if(this.stopped)break;try{await this.company(target);}catch{/* A failing company never blocks the other companies. No payloads in logs. */}}}catch{lastPoll=0;}finally{if(!this.stopped)this.timer=setTimeout(()=>void this.tick(),15000);}}
 private async company(target:{companyId:string;since:string;instance:string}){
 if(target.instance!=='askadia-'+target.companyId)return;
 const live=await evolutionRequest('/instance/connectionState/'+encodeURIComponent(target.instance));if(record(live.instance).state!=='open')return;
 const chats=(await evolutionChats(target.instance)).filter(c=>!c.group&&c.time&&Date.parse(c.time)>Math.max(Date.parse(target.since),Date.now()-300000)).slice(0,30);
 for(const chat of chats){if(this.stopped)return;const jid=decodeThread(chat.id),history=await evolutionMessages(target.instance,jid,1),last=history.messages.at(-1);if(!last?.time||Date.parse(last.time)<=Date.parse(target.since))continue;
 if(last.fromMe){await this.rpc('inbox_auto_observe_human',{p_company_id:target.companyId,p_thread:jid,p_message_id:last.id,p_time:last.time});continue;}
 // Observe phone/operator messages since activation even if a new inbound followed them.
 const outgoing=[...history.messages].reverse().find(m=>m.fromMe&&m.time&&Date.parse(m.time)>Date.parse(target.since));if(outgoing)await this.rpc('inbox_auto_observe_human',{p_company_id:target.companyId,p_thread:jid,p_message_id:outgoing.id,p_time:outgoing.time});
 const job=await this.rpc<{token:string;settings:ServiceSettings;profile:unknown}|null>('inbox_auto_claim',{p_company_id:target.companyId,p_thread:jid,p_message_id:last.id,p_time:last.time});if(!job)continue;
 const args={p_company_id:target.companyId,p_message_id:last.id,p_token:job.token};let dispatching=false;
 try{
 const draft=last.kind==='text'?await draftServiceReply(job.settings,job.profile,history.messages):{text:'Recebemos seu arquivo. Vou encaminhar para nossa equipe analisar e continuar o atendimento.',handoff:true};
 if(/\b(atendente|humano|pessoa real)\b/i.test(last.body))draft.handoff=true;
 const latest=(await evolutionMessages(target.instance,jid,1)).messages.at(-1);if(latest?.id!==last.id||this.stopped){await this.rpc('inbox_auto_finish',{...args,p_state:'canceled',p_provider_id:null});continue;}
 const ready=await this.rpc<boolean>('inbox_auto_prepare',{...args,p_body:draft.text,p_handoff:draft.handoff});if(!ready)continue;
 dispatching=true;const sent=await evolutionRequest('/message/sendText/'+encodeURIComponent(target.instance),{number:jid,text:draft.text});const providerId=record(sent.key).id;if(typeof providerId!=='string')throw new Error('Unconfirmed dispatch');await this.rpc('inbox_auto_finish',{...args,p_state:'sent',p_provider_id:providerId});
 }catch{await this.rpc('inbox_auto_finish',{...args,p_state:dispatching?'uncertain':'failed',p_provider_id:null}).catch(()=>{});}
 }
 }
}
