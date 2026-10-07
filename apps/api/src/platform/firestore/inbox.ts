import {scopedRows} from './store';
import {queueScan,queueStates,queueHasMore} from './queue-scan';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {serviceSettingsSchema,quickReplySchema,inboxChannelSchema} from '@askadia/contracts';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,uuid,text,user,server,audit,hash,fail} from './access';
import {purchaseState} from './commerce';
export const inboxOperations=['read_service_policy','save_service_policy','save_contact_consent','inbox_record_opt_out','save_service_settings','save_quick_reply','take_inbox_conversation','release_inbox_conversation','reserve_inbox_dispatch','reserve_meta_dispatch','finish_inbox_dispatch','inbox_ai_context','inbox_prompt_context','inbox_auto_targets','inbox_auto_claim','inbox_auto_prepare','inbox_auto_finish','inbox_auto_observe_human'];
const now=()=>new Date().toISOString();
const key=(company:string,channel:string,thread:string)=>company+'_'+channel+'_'+hash(thread);
const list=(tx:DocumentTransaction,table:string,company:string)=>scopedRows(tx,table,[{field:'company_id',value:company}]);
export async function serviceProfile(tx:DocumentTransaction,company:string){const state=await tx.get('company_onboarding',company);if(!state||state.profile_version<1||state.confirmed_revision!==state.revision)return null;const facts=(await tx.get('company_profile_versions',company+'_'+state.profile_version))?.facts;if(!facts)return null;return Object.fromEntries(Object.entries(facts).filter(([field])=>['name','businessType','city','address','services','structure','hours','offers','channels','sales'].includes(field)));}
async function connected(tx:DocumentTransaction,company:string,channel:string,allowOfficial=false){return (await list(tx,'company_channels',company)).some(c=>c.status==='connected'&&(c.provider===(channel==='whatsapp'?'evolution':'meta')&&(channel!=='whatsapp'||c.remote_id==='askadia-'+company)||allowOfficial&&channel==='whatsapp'&&c.provider==='whatsapp_cloud'&&c.metadata?.webhookReady===true));}
async function cancelGenerating(tx:DocumentTransaction,company:string,thread?:string){for(const j of await tx.list('inbox_auto_jobs',[{field:'company_id',value:company},{field:'state',value:'generating'},...(thread?[{field:'thread',value:thread}]:[])],{limit:100}))tx.put('inbox_auto_jobs',j.id,{...j,state:'canceled',updated_at:now()});}
async function handoff(tx:DocumentTransaction,company:string,channel:string,thread:string,actor:string|null){const id=key(company,channel,thread),prior=await tx.get('inbox_handoffs',id),row={id,company_id:company,channel,thread,actor_id:actor,released_at:null,revision:(prior?.revision??0)+1,updated_at:now()};tx.put('inbox_handoffs',id,row);await cancelGenerating(tx,company,thread);return row;}
export async function inboxRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 if(name==='inbox_record_opt_out'){server(actor);const company=uuid(args.p_company_id),thread=text(args.p_thread,1,200);if(!await tx.get('companies',company))fail('42501','Company unavailable');const contacts=await list(tx,'contacts',company),links=await list(tx,'company_contact_channels',company);const contact=contacts.find(c=>c.phone_e164==='+'+thread.split('@')[0]||links.some(l=>l.contact_id===c.id&&l.remote_id===thread));if(contact)tx.put('contacts',contact.id,{...contact,consent:false,opted_out:true,consent_updated_at:now()});await handoff(tx,company,'whatsapp',thread,null);return null;}
 if(name.startsWith('inbox_auto_')){server(actor);return autoRpc(tx,name,args);}
 const company=uuid(args.p_company_id),actorId=user(actor),access=await companyAccess(tx,actor,company,name==='read_service_policy'?'crm.read':name==='inbox_prompt_context'?'marketing.write':'crm.write');
 if(name==='read_service_policy'){const state=await tx.get('company_onboarding',company),settings=await tx.get('company_service_settings',company+'_whatsapp'),policy=await tx.get('company_service_policies',company);return {profileVersion:state?.profile_version??0,revision:settings?.revision??0,policy,valid:Boolean(policy&&policy.revision===settings?.revision&&policy.profile_version===state?.profile_version&&state?.confirmed_revision===state?.revision)};}
 if(name==='save_service_policy'){
  await companyAccess(tx,actor,company,'marketing.write');
  const parsed=z.object({revision:z.number().int().positive(),profileVersion:z.number().int().positive(),timezone:z.string().min(1).max(100),hours:z.array(z.object({day:z.number().int().min(0).max(6),start:z.number().int().min(0).max(1439),end:z.number().int().min(1).max(1440)}).strict().refine(h=>h.start<h.end)).min(1).max(21),reviewed:z.literal(true)}).strict().safeParse(args.p_policy);
  if(!parsed.success)fail('22023','Review the business hours policy');const policy=parsed.data!,settings=await tx.get('company_service_settings',company+'_whatsapp'),state=await tx.get('company_onboarding',company);
  try{new Intl.DateTimeFormat('en-US',{timeZone:policy.timezone}).format();}catch{fail('22023','Invalid timezone');}
  if(settings?.revision!==policy.revision||state?.profile_version!==policy.profileVersion||!await serviceProfile(tx,company))fail('40001','Policy basis changed');
  const row={company_id:company,revision:policy.revision,profile_version:policy.profileVersion,timezone:policy.timezone,hours:policy.hours,approved_at:now(),approved_by:actorId};tx.put('company_service_policies',company,row);audit(tx,actor,access.company,'inbox.policy_reviewed',{revision:policy.revision,profileVersion:policy.profileVersion});return row;
 }
 if(name==='save_contact_consent'){
  const id=uuid(args.p_contact_id),contact=await tx.get('contacts',id);if(!contact||contact.company_id!==company)fail('42501','Contact unavailable');
  if(typeof args.p_consent!=='boolean'||typeof args.p_opt_out!=='boolean'||args.p_consent&&args.p_opt_out)fail('22023','Invalid consent');
  const evidence=text(args.p_evidence,2,500);const row={...contact,consent:args.p_consent,opted_out:args.p_opt_out,consent_evidence:evidence,consent_updated_at:now(),consent_actor:actorId};tx.put('contacts',id,row);await cancelGenerating(tx,company);audit(tx,actor,access.company,'crm.consent',{contactId:id,consent:row.consent,optedOut:row.opted_out});return row;
 }
 if(name==='save_service_settings'){
  await companyAccess(tx,actor,company,'marketing.write');const parsed=serviceSettingsSchema.safeParse(args.p_settings);if(!parsed.success)fail('22023','Invalid settings');const settings=parsed.data!,id=company+'_'+settings.channel,prior=await tx.get('company_service_settings',id);
  if((prior?.revision??0)!==settings.revision)fail('40001','Settings changed');
  if(settings.automatic&&(settings.channel!=='whatsapp'||settings.mode==='human'||!await serviceProfile(tx,company)||!await connected(tx,company,'whatsapp',true)))fail('22023','Automatic channel unavailable');
  if(settings.automatic&&!(await list(tx,'company_channels',company)).some(c=>c.provider==='whatsapp_cloud'&&c.status==='connected'&&c.metadata?.webhookReady)&&(await list(tx,'company_channels',company)).some(c=>c.provider==='evolution'&&c.metadata?.transport==='WHATSAPP-BAILEYS'))fail('22023','Official automatic channel unavailable');
  const row={...settings,flow:settings.flow??null,id,company_id:company,revision:(prior?.revision??0)+1,automatic:settings.automatic??false,automated_by:settings.automatic?actorId:prior?.automated_by??null,enabled_since:settings.automatic&&!prior?.automatic?now():prior?.enabled_since??null,updated_at:now()};
  tx.put('company_service_settings',id,row);await cancelGenerating(tx,company);audit(tx,actor,access.company,'inbox.settings',{channel:row.channel,revision:row.revision});return row;
 }
 if(name==='save_quick_reply'){
  await companyAccess(tx,actor,company,'marketing.write');const parsed=quickReplySchema.safeParse(args.p_reply);if(!parsed.success)fail('22023','Invalid reply');const reply=parsed.data!,prior=await tx.get('company_quick_replies',reply.id);if(prior&&prior.company_id!==company)fail('42501','Access denied');
  if(reply.remove){tx.remove('company_quick_replies',reply.id);return null;}const replies=await list(tx,'company_quick_replies',company);if(!prior&&replies.length>=100)fail('22023','Reply limit');if(replies.some(r=>r.id!==reply.id&&r.shortcut===reply.shortcut))fail('22023','Duplicate shortcut');tx.put('company_quick_replies',reply.id,{...reply,company_id:company});return null;
 }
 if(name==='take_inbox_conversation'||name==='release_inbox_conversation'){
  const channel=name==='release_inbox_conversation'?'whatsapp':inboxChannelSchema.parse(args.p_channel),thread=text(args.p_thread,1,200);
  if(name==='take_inbox_conversation'){
   if((await list(tx,'inbox_auto_jobs',company)).some(j=>j.thread===thread&&j.state==='dispatching'&&Date.parse(j.updated_at)>Date.now()-120000))fail('40001','Automatic reply in flight');return handoff(tx,company,channel,thread,actorId);
  }
  const id=key(company,channel,thread),prior=await tx.get('inbox_handoffs',id);if(prior)tx.put('inbox_handoffs',id,{...prior,actor_id:null,released_at:now(),revision:prior.revision+1,updated_at:now()});return null;
 }
 if(name==='reserve_inbox_dispatch'||name==='reserve_meta_dispatch'){
  const channel=name==='reserve_inbox_dispatch'?'whatsapp':text(args.p_channel),thread=text(args.p_thread,1,200),id=uuid(args.p_id),body=text(args.p_body,1,channel==='whatsapp'?6000:1000);
  if(!['whatsapp','instagram','facebook'].includes(channel)||(channel==='whatsapp'?!/^[0-9]{6,20}@(s\.whatsapp\.net|lid)$/.test(thread):!/^meta:[a-f0-9]{64}$/.test(thread)))fail('22023','Invalid dispatch');
  const h=await tx.get('inbox_handoffs',key(company,channel,thread));if(!h||h.actor_id!==actorId||h.released_at)fail('42501','Take over first');if(!await connected(tx,company,channel))fail('42501','Channel unavailable');
  const links=await list(tx,'company_contact_channels',company),contacts=await list(tx,'contacts',company),contact=contacts.find(c=>c.phone_e164==='+'+thread.split('@')[0]||links.some(l=>l.remote_id===thread&&l.contact_id===c.id));
  if(contact&&(contact.opted_out===true||contact.opt_out===true))fail('42501','Contact opted out');
  const prior=await tx.get('inbox_dispatches',id);if(prior){if(prior.company_id!==company||prior.actor_id!==actorId)fail('42501','Request unavailable');if(prior.thread!==thread||prior.body!==body||prior.channel!==channel)fail('40001','Request conflict');return false;}
  const rows=await list(tx,'inbox_dispatches',company);
  // An unconfirmed provider call must never be retried under a fresh request ID.
  if(rows.some(r=>r.thread===thread&&r.body===body&&['reserved','uncertain'].includes(r.state))||(await list(tx,'inbox_auto_jobs',company)).some(j=>j.thread===thread&&j.body===body&&['dispatching','uncertain'].includes(j.state)))return false;
  if(rows.filter(r=>Date.parse(r.created_at)>Date.now()-60000).length>=30)fail('22023','Dispatch rate limit');
  tx.put('inbox_dispatches',id,{id,company_id:company,channel,thread,actor_id:actorId,body,state:'reserved',provider_id:null,created_at:now(),updated_at:now()});return true;
 }
 if(name==='finish_inbox_dispatch'){
  const id=uuid(args.p_id),row=await tx.get('inbox_dispatches',id);if(!row||row.company_id!==company||row.actor_id!==actorId)fail('42501','Dispatch unavailable');if(!['sent','uncertain','failed'].includes(args.p_state))fail('22023','Invalid state');if(args.p_state==='sent'&&!args.p_provider_id)fail('22023','Provider confirmation required');if(row!.state!=='reserved')return null;
  tx.put('inbox_dispatches',id,{...row,state:args.p_state,provider_id:args.p_provider_id?text(args.p_provider_id,1,200):null,updated_at:now()});
  if(row!.provider==='whatsapp_cloud'&&args.p_state==='sent'){const messageId=company+'_'+hash(args.p_provider_id);tx.put('whatsapp_cloud_messages',messageId,{id:messageId,company_id:company,phone_id:row!.phone_id,thread:row!.thread,provider_id:args.p_provider_id,from_me:true,body:row!.body,kind:'text',time:now(),status:'accepted',created_at:now(),expires_at:new Date(Date.now()+30*86400000).toISOString()});}return null;
 }
 if(name==='inbox_ai_context'||name==='inbox_prompt_context'){
  if(!(await purchaseState(tx,actor,company)).aiAllowed)fail('P0402','Payment required before AI processing');const profile=await serviceProfile(tx,company);if(!profile)fail('22023','Confirm company profile first');if(name==='inbox_prompt_context'){const id=company+'_prompt_'+now().slice(0,10),usage=await tx.get('inbox_daily_usage',id);if((usage?.count??0)>=20)fail('22023','Daily account allowance exhausted');tx.put('inbox_daily_usage',id,{company_id:company,count:(usage?.count??0)+1});return profile;}
  const channel=inboxChannelSchema.parse(args.p_channel),settings=await tx.get('company_service_settings',company+'_'+channel);if(!settings||settings.mode==='human')fail('22023','Configure assistance first');const day=now().slice(0,10),id=company+'_'+day,counter=await tx.get('inbox_daily_usage',id);if((counter?.count??0)>=100)fail('22023','Daily account allowance exhausted');tx.put('inbox_daily_usage',id,{company_id:company,day,count:(counter?.count??0)+1});return {settings,profile};
 }
 return fail('FIRESTORE_OPERATION_PENDING','Unknown inbox operation');
}
/** A service window belongs to the official sender number that received it. */
export async function officialServiceWindow(tx:DocumentTransaction,company:string,phoneId:string,thread:string){
 return (await scopedRows(tx,'whatsapp_cloud_messages',[{field:'company_id',value:company},{field:'phone_id',value:phoneId},{field:'thread',value:thread}])).some(m=>!m.from_me&&Date.parse(m.expires_at)>Date.now()&&Date.parse(m.time)>=Date.now()-86400000&&Date.parse(m.time)<=Date.now()+60000);
}
/** Administrative automations require an explicit server-persisted policy and
 * contact consent. Missing/invalid hours, timezone or consent fail closed. */
export async function automationAllowed(tx:DocumentTransaction,company:string,settings:Row|null,thread?:string){
 if(!settings?.automatic||settings.mode==='human'||!settings.automated_by||!Number.isFinite(Date.parse(settings.enabled_since))||Date.parse(settings.enabled_since)>Date.now()+60000)return false;
 const actor:FirestoreActor={role:'authenticated',id:settings.automated_by};
 try{await companyAccess(tx,actor,company,'marketing.write');await companyAccess(tx,actor,company,'crm.write');if(!(await purchaseState(tx,actor,company)).aiAllowed)return false;}catch{return false;}
 if(!await connected(tx,company,'whatsapp',true)||!await serviceProfile(tx,company))return false;
 const channels=await list(tx,'company_channels',company),channel=channels.find(c=>c.provider==='whatsapp_cloud'&&c.status==='connected'&&c.metadata?.webhookReady)??channels.find(c=>c.provider==='evolution'&&c.status==='connected');if(channel?.metadata?.transport==='WHATSAPP-BAILEYS')return false;
 if(channel?.provider==='whatsapp_cloud'&&thread&&!await officialServiceWindow(tx,company,channel.remote_id,thread))return false;
 const policy=await tx.get('company_service_policies',company);if(!policy?.approved_at||policy.revision!==settings.revision||policy.profile_version!==(await tx.get('company_onboarding',company))?.profile_version)return false;
 try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:policy.timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),get=(type:string)=>parts.find(p=>p.type===type)?.value??'',day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday')),minute=Number(get('hour'))*60+Number(get('minute'));
  if(!Array.isArray(policy.hours)||!policy.hours.some((h:Row)=>h.day===day&&Number.isInteger(h.start)&&Number.isInteger(h.end)&&h.start>=0&&h.end<=1440&&h.start<h.end&&minute>=h.start&&minute<h.end))return false;
 }catch{return false;}
 if(thread){const links=await tx.list('company_contact_channels',[{field:'company_id',value:company},{field:'remote_id',value:thread}],{limit:1}),linked=links[0]?await tx.get('contacts',links[0].contact_id):null,contact=linked?.company_id===company?linked:(await tx.list('contacts',[{field:'company_id',value:company},{field:'whatsapp_jid',value:thread}],{limit:1}))[0]??(await tx.list('contacts',[{field:'company_id',value:company},{field:'phone_e164',value:'+'+thread.split('@')[0]}],{limit:1}))[0];if(!contact||contact.consent!==true||contact.opted_out===true||contact.opt_out===true)return false;}
 return true;
}
async function autoRpc(tx:DocumentTransaction,name:string,args:Row):Promise<unknown>{
 if(name==='inbox_auto_targets'){
  const jobs=await queueStates(tx,'inbox_auto_jobs',['generating','dispatching'],'state');for(const j of jobs)if(['generating','dispatching'].includes(j.state)&&Date.parse(j.updated_at)<Date.now()-120000)tx.put('inbox_auto_jobs',j.id,{...j,state:j.state==='dispatching'?'uncertain':'failed',updated_at:now()});
  const targets=[];for(const s of await queueScan(tx,'company_service_settings',[{field:'channel',value:'whatsapp'}],'targets'))if(s.channel==='whatsapp'&&await automationAllowed(tx,s.company_id,s)){const channel=(await list(tx,'company_channels',s.company_id)).find(c=>c.provider==='whatsapp_cloud'&&c.status==='connected'&&c.metadata?.webhookReady);targets.push(channel?{companyId:s.company_id,since:s.enabled_since,instance:'cloud-'+s.company_id,provider:'whatsapp_cloud',phoneId:channel.remote_id,actorId:s.automated_by}:{companyId:s.company_id,since:s.enabled_since,instance:'askadia-'+s.company_id,provider:'evolution'});}return args.p_paginated===true?{targets,hasMore:queueHasMore(tx,'company_service_settings','targets')}:targets;
 }
 const company=uuid(args.p_company_id);if(!await tx.get('companies',company))fail('42501','Company unavailable');
 const settings=await tx.get('company_service_settings',company+'_whatsapp'),message=text(args.p_message_id,1,200),id=company+'_'+hash(message),job=await tx.get('inbox_auto_jobs',id);
 if(name==='inbox_auto_claim'){
  const thread=text(args.p_thread,1,200),time=Date.parse(args.p_time);if(!/^[0-9]{6,20}@(s\.whatsapp\.net|lid)$/.test(thread)||!Number.isFinite(time)||time<=Date.parse(settings?.enabled_since)||time<Date.now()-300000||time>Date.now()+60000||job||!await automationAllowed(tx,company,settings,thread))return null;
  const h=await tx.get('inbox_handoffs',key(company,'whatsapp',thread));if(h&&(!h.released_at||time<=Date.parse(h.released_at)))return null;
  for(const state of ['generating','dispatching','uncertain'])if((await tx.list('inbox_auto_jobs',[{field:'company_id',value:company},{field:'thread',value:thread},{field:'state',value:state}],{limit:1})).length)return null;const jobs=await tx.list('inbox_auto_jobs',[{field:'company_id',value:company}],{limit:100,orderBy:'created_at',descending:true});if(jobs.filter(j=>j.created_at.slice(0,10)===now().slice(0,10)).length>=100)return null;
  const token=randomUUID(),profile=await tx.get('company_onboarding',company),channel=(await list(tx,'company_channels',company)).find(c=>c.provider==='whatsapp_cloud'&&c.status==='connected'&&c.metadata?.webhookReady);tx.put('inbox_auto_jobs',id,{id,company_id:company,message_id:message,thread,revision:settings!.revision,profile_version:profile!.profile_version,provider:channel?'whatsapp_cloud':'evolution',phone_id:channel?.remote_id??null,token,state:'generating',body:null,provider_id:null,handoff:false,created_at:now(),updated_at:now()});return {token,provider:channel?'whatsapp_cloud':'evolution',phoneId:channel?.remote_id??null,settings,profile:await serviceProfile(tx,company)};
 }
 if(name==='inbox_auto_observe_human'){
  const thread=text(args.p_thread,1,200),time=Date.parse(args.p_time);if(!Number.isFinite(time)||time<=Date.parse(settings?.enabled_since)||time>Date.now()+60000||!(settings?.automatic))return null;
  if((await tx.list('inbox_auto_jobs',[{field:'company_id',value:company},{field:'provider_id',value:message}],{limit:1})).length>0)return null;const h=await tx.get('inbox_handoffs',key(company,'whatsapp',thread));if(h&&(!h.released_at||Date.parse(h.released_at)>=time))return null;await handoff(tx,company,'whatsapp',thread,null);return null;
 }
 if(!job||job.token!==uuid(args.p_token))return name==='inbox_auto_prepare'?false:null;
 if(name==='inbox_auto_prepare'){
  if(job.state!=='generating')return false;
  const h=await tx.get('inbox_handoffs',key(company,'whatsapp',job.thread)),profile=await tx.get('company_onboarding',company),channel=(await list(tx,'company_channels',company)).find(c=>c.provider==='whatsapp_cloud'&&c.status==='connected'&&c.metadata?.webhookReady);
  if(job.provider==='whatsapp_cloud'&&channel?.remote_id!==job.phone_id){tx.put('inbox_auto_jobs',id,{...job,state:'canceled',updated_at:now()});return false;}
  if(Date.parse(job.updated_at)<Date.now()-120000||settings?.revision!==job.revision||profile?.profile_version!==job.profile_version||(h&&!h.released_at)||!await automationAllowed(tx,company,settings,job.thread)){tx.put('inbox_auto_jobs',id,{...job,state:'canceled',updated_at:now()});return false;}
  if(typeof args.p_handoff!=='boolean')fail('22023','Invalid handoff');tx.put('inbox_auto_jobs',id,{...job,state:'dispatching',body:text(args.p_body,1,job.provider==='whatsapp_cloud'?4096:6000),handoff:args.p_handoff,updated_at:now()});return true;
 }
 if(name==='inbox_auto_finish'){
  if(!['sent','failed','uncertain','canceled'].includes(args.p_state))fail('22023','Invalid state');if(!['generating','dispatching'].includes(job.state))return null;if(args.p_state==='sent'&&(job.state!=='dispatching'||!args.p_provider_id))fail('22023','Provider confirmation required');
  tx.put('inbox_auto_jobs',id,{...job,state:args.p_state,provider_id:args.p_provider_id?text(args.p_provider_id,1,200):null,updated_at:now()});if(job.provider==='whatsapp_cloud'&&args.p_state==='sent'){const outgoing=company+'_'+hash(args.p_provider_id);tx.put('whatsapp_cloud_messages',outgoing,{id:outgoing,company_id:company,phone_id:job.phone_id,thread:job.thread,provider_id:args.p_provider_id,from_me:true,body:job.body,kind:'text',time:now(),status:'accepted',created_at:now(),expires_at:new Date(Date.now()+30*86400000).toISOString()});}if(job.handoff&&args.p_state==='sent')await handoff(tx,company,'whatsapp',job.thread,null);return null;
 }
 return fail('FIRESTORE_OPERATION_PENDING','Unknown automation operation');
}
