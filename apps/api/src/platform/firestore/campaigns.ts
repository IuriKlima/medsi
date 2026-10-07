import {scopedRows} from './store';
import {queueScan,queueStates,queueHasMore} from './queue-scan';
import {randomUUID} from 'node:crypto';
import {messageCampaignSchema,studentSchema,personalizeCampaign} from '@askadia/contracts';
import {z} from 'zod';
import type {DocumentTransaction,Row} from './store';
import {companyAccess,server,uuid,text,hash,fail,audit,type FirestoreActor} from './access';
import {purchaseState} from './commerce';
import {now} from './journey-state';
import {officialServiceWindow} from './inbox';
export const messageCampaignOperations=['management_ingestion_status','set_management_ingestion_key','ingest_management_students','register_campaign_contacts','revoke_campaign_contact','import_campaign_students','save_message_campaign','preview_message_campaign','activate_message_campaign','claim_message_campaign','prepare_message_campaign','finish_message_campaign'];
const list=(tx:DocumentTransaction,table:string,company:string)=>scopedRows(tx,table,[{field:'company_id',value:company}]);
async function access(tx:DocumentTransaction,actor:FirestoreActor,company:string){const a=await companyAccess(tx,actor,company,'marketing.write');await companyAccess(tx,actor,company,'crm.write');return a;}
function local(timezone:string){try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return {date:v.year+'-'+v.month+'-'+v.day,minutes:Number(v.hour)*60+Number(v.minute)};}catch{return fail('22023','Invalid clinic timezone');}}
function localDate(value:string,timezone:string){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
function event(c:Row,s:Row,company:Row){const day=local(company.timezone).date,absent=s.last_attendance?Math.floor((Date.parse(day)-Date.parse(localDate(s.last_attendance,company.timezone)))/86400000):null;if(c.trigger==='selected')return c.recipient_ids.includes(s.id)?{key:'selected:'+c.id,absent}:null;if(c.trigger==='birthday')return s.birthday?.slice(5)===day.slice(5)?{key:'birthday:'+day.slice(0,4),absent}:null;return absent!==null&&absent>=c.absence_days?{key:'absence:'+s.last_attendance,absent}:null;}
function period(c:Row,company:Row,time=true){const stamp=local(company.timezone),minutes=Number(c.send_time.slice(0,2))*60+Number(c.send_time.slice(3,5));return stamp.date>=c.start_date&&(!c.end_date||stamp.date<=c.end_date)&&(!time||stamp.minutes>=minutes&&stamp.minutes<minutes+60);}
async function eligible(tx:DocumentTransaction,c:Row,s:Row,company:Row,checkPeriod=true){if(s.company_id!==c.company_id||!s.consent||s.opted_out||Date.parse(s.updated_at)<Date.now()-c.max_data_age_days*86400000||c.active_only&&s.status!=='active'||c.tag&&c.tag!==s.tag)return false;for(const field of ['opted_out','opt_out'])if((await tx.list('contacts',[{field:'company_id',value:c.company_id},{field:'phone_e164',value:s.phone},{field,value:true}],{limit:1})).length)return false;return !checkPeriod||period(c,company,false);}
async function official(tx:DocumentTransaction,company:string){return (await list(tx,'company_channels',company)).find(c=>c.provider==='whatsapp_cloud'&&c.status==='connected'&&c.metadata?.webhookReady===true)??null;}
async function transport(tx:DocumentTransaction,company:string,phone:string,phoneId:string,ignoreDelivery?:string){
 for(const state of ['reserved','sending','uncertain'])if((await tx.list('message_campaign_deliveries',[{field:'company_id',value:company},{field:'phone',value:phone},{field:'state',value:state}],{limit:2})).some(d=>d.id!==ignoreDelivery))return false;
 const thread=phone.slice(1)+'@s.whatsapp.net',handoff=await tx.get('inbox_handoffs',company+'_whatsapp_'+hash(thread));if(handoff&&!handoff.released_at)return false;
 for(const [table,states] of [['inbox_auto_jobs',['generating','dispatching','uncertain']],['inbox_dispatches',['reserved','uncertain']]] as const)for(const state of states)if((await tx.list(table,[{field:'company_id',value:company},{field:'thread',value:thread},{field:'state',value:state}],{limit:1})).length)return false;
 return officialServiceWindow(tx,company,phoneId,thread);
}
async function candidates(tx:DocumentTransaction,c:Row,company:Row,approved=false){
 const result=[],students=approved?await queueScan(tx,'campaign_students',[{field:'company_id',value:c.company_id}],c.id):await list(tx,'campaign_students',c.company_id);
 for(const s of students){if(!await eligible(tx,c,s,company))continue;if(approved&&!c.approved_audience?.some((a:Row)=>a.id===s.id&&a.phone===s.phone))continue;const match=event(c,s,company);if(!match)continue;
  let delivered=false;for(const state of ['reserved','sending','uncertain','sent'])if((await tx.list('message_campaign_deliveries',[{field:'company_id',value:c.company_id},{field:'campaign_id',value:c.id},{field:'phone',value:s.phone},{field:'event_key',value:match.key},{field:'state',value:state}],{limit:1})).length)delivered=true;
  if(!delivered)result.push({student_id:s.id,name:s.name,phone:s.phone,days_absent:match.absent,event_key:match.key});
 }return result.sort((a,b)=>a.student_id.localeCompare(b.student_id));
}
async function cancel(tx:DocumentTransaction,company:string,predicate:(d:Row)=>boolean){for(const d of await tx.list('message_campaign_deliveries',[{field:'company_id',value:company},{field:'state',value:'reserved'}],{limit:100}))if(predicate(d))tx.put('message_campaign_deliveries',d.id,{...d,state:'canceled',lease_until:null,updated_at:now()});}
async function campaign(tx:DocumentTransaction,company:string,id:unknown){const row=await tx.get('message_campaigns',uuid(id));if(!row||row.company_id!==company)fail('42501','Campaign unavailable');return row!;}
async function execution(tx:DocumentTransaction,c:Row){if(c.status!=='active'||c.approved_revision!==c.revision)return null;try{const actor:FirestoreActor={role:'authenticated',id:c.approved_by};const a=await access(tx,actor,c.company_id);await companyAccess(tx,actor,c.company_id,'content.approve');const onboarding=await tx.get('company_onboarding',c.company_id);if(onboarding?.profile_version!==c.profile_version||onboarding?.confirmed_revision!==onboarding?.revision||!(await purchaseState(tx,actor,c.company_id)).aiAllowed)return null;const channel=await official(tx,c.company_id);if(!channel||channel.id!==c.approved_channel_id||channel.remote_id!==c.approved_phone_id)return null;return {actor,company:a.company,channel};}catch{return null;}}
export async function messageCampaignRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 if(['management_ingestion_status','set_management_ingestion_key','ingest_management_students'].includes(name))return managementRpc(tx,actor,name,args);
 if(!['claim_message_campaign','prepare_message_campaign','finish_message_campaign'].includes(name)){
  const company=uuid(args.p_company_id),a=await access(tx,actor,company);
  if(name==='register_campaign_contacts'){
   const ids=z.array(z.uuid()).min(1).max(500).safeParse(args.p_contacts);if(!ids.success)fail('22023','Select contacts');const evidence=text(args.p_evidence,5,500),result=[];
   for(const id of [...new Set(ids.data!)]){const contact=await tx.get('contacts',id);if(!contact||contact.company_id!==company||!/^\+[1-9][0-9]{7,14}$/.test(contact.phone_e164)||contact.opted_out||contact.opt_out)fail('42501','Consenting tenant contact required');const key=hash(company+'/'+contact!.phone_e164),index=await tx.get('campaign_recipient_keys',key),prior=index?await tx.get('campaign_students',index.recipient_id):null,sid=prior?.id??randomUUID();
    const row={...prior,id:sid,company_id:company,external_id:prior?.external_id??'crm:'+id,name:contact!.name,phone:contact!.phone_e164,birthday:prior?.birthday??null,last_attendance:prior?.last_attendance??null,status:prior?.status??'inactive',consent:true,opted_out:false,consent_evidence:evidence,consent_actor:actor.id,consent_at:now(),tag:prior?.tag??'',source:'crm',updated_at:now()};tx.put('campaign_students',sid,row);tx.put('campaign_recipient_keys',key,{company_id:company,recipient_id:sid});result.push(sid);
   }audit(tx,actor,a.company,'campaign.consent_recorded',{count:result.length,evidence});return result;
  }
  if(name==='revoke_campaign_contact'){const id=uuid(args.p_id),s=await tx.get('campaign_students',id);if(!s||s.company_id!==company)fail('42501','Recipient unavailable');tx.put('campaign_students',id,{...s,consent:false,opted_out:true,updated_at:now()});await cancel(tx,company,d=>d.student_id===id);audit(tx,actor,a.company,'campaign.consent_revoked',{recipientId:id});return null;}
  if(name==='import_campaign_students'){
   const parsed=z.array(studentSchema).min(1).max(500).safeParse(args.p_students);if(!parsed.success||!['csv','api','wellhub','totalpass'].includes(args.p_source??'csv'))fail('22023','Invalid import');const incoming=parsed.data!,prior=await list(tx,'campaign_students',company);if(new Set(incoming.map(s=>s.externalId)).size!==incoming.length||new Set(incoming.map(s=>s.phone)).size!==incoming.length)fail('22023','Duplicate recipients');
   for(const s of incoming){if(s.birthday&&s.birthday>local(a.company.timezone).date||s.lastAttendance&&Date.parse(s.lastAttendance)>Date.now()+300000)fail('22023','Invalid recipient dates');const old=prior.find(r=>r.external_id===s.externalId),phoneOwner=prior.find(r=>r.phone===s.phone);if(phoneOwner&&phoneOwner.id!==old?.id)fail('23505','Phone belongs to another recipient');const id=old?.id??randomUUID();if(old&&old.phone!==s.phone)tx.remove('campaign_recipient_keys',hash(company+'/'+old.phone));
    tx.put('campaign_students',id,{id,company_id:company,external_id:s.externalId,name:s.name,phone:s.phone,birthday:s.birthday,last_attendance:s.lastAttendance,status:s.status,consent:old?.opted_out?false:s.consent,opted_out:old?.opted_out??false,consent_evidence:s.consent?'Importação com autorização declarada':null,consent_actor:actor.id,consent_at:now(),tag:s.tag,source:args.p_source??'csv',updated_at:now()});tx.put('campaign_recipient_keys',hash(company+'/'+s.phone),{company_id:company,recipient_id:id});
   }audit(tx,actor,a.company,'campaign.recipients_imported',{count:incoming.length,source:args.p_source??'csv'});return incoming.length;
  }
  if(name==='save_message_campaign'){
   const parsed=messageCampaignSchema.safeParse(args.p_data);if(!parsed.success)fail('22023','Invalid campaign');const p=parsed.data!,old=await tx.get('message_campaigns',p.id);if(old&&old.company_id!==company)fail('42501','Campaign unavailable');if((old?.revision??0)!==p.revision)fail('40001','Campaign changed');for(const id of p.recipientIds){const s=await tx.get('campaign_students',id);if(!s||s.company_id!==company)fail('42501','Tenant recipients required');}
   const row={id:p.id,company_id:company,name:p.name,revision:p.revision+1,trigger:p.trigger,recipient_ids:[...new Set(p.recipientIds)],absence_days:p.absenceDays,send_time:p.sendTime,message:p.message,tag:p.tag,active_only:p.trigger==='selected'?false:p.activeOnly,start_date:p.startDate,end_date:p.endDate,max_data_age_days:p.maxDataAgeDays,daily_limit:p.dailyLimit,status:'draft',approved_by:null,created_at:old?.created_at??now(),updated_at:now()};if(old)tx.put('message_campaign_versions',old.id+'_'+old.revision,old);tx.put('message_campaigns',p.id,row);await cancel(tx,company,d=>d.campaign_id===p.id);return row;
  }
  const c=await campaign(tx,company,args.p_id);
  if(name==='preview_message_campaign'){const rows=await candidates(tx,c,a.company);return {revision:c.revision,total:rows.length,students:rows.slice(0,30),transport:'whatsapp_cloud',outsideWindowRequiresApprovedTemplate:true};}
  if(name==='activate_message_campaign'){
   if(c.revision!==args.p_revision||typeof args.p_active!=='boolean')fail('40001','Campaign changed');let approved:Row={};
   if(args.p_active){if(!c.end_date)fail('22023','Choose an explicit campaign end date');await companyAccess(tx,actor,company,'content.approve');const state=await tx.get('company_onboarding',company),channel=await official(tx,company);if(!state||state.confirmed_revision!==state.revision||!channel||!(await purchaseState(tx,actor,company)).aiAllowed)fail('40001','Confirmed profile, paid access and official connected channel required');const audience=[];for(const s of await list(tx,'campaign_students',company))if(await eligible(tx,c,s,a.company,false)&&(c.trigger!=='selected'||c.recipient_ids.includes(s.id)))audience.push({id:s.id,phone:s.phone});if(!audience.length)fail('22023','No consenting recipients');approved={approved_by:actor.id,approved_revision:c.revision,approved_audience:audience,approved_channel_id:channel!.id,approved_phone_id:channel!.remote_id,profile_version:state!.profile_version,approved_at:now()};const id=randomUUID();tx.put('message_campaign_approvals',id,{...c,...approved,id,campaign_id:c.id,status:'active'});}
   tx.put('message_campaigns',c.id,{...c,...approved,status:args.p_active?'active':'paused',approved_by:args.p_active?actor.id:null,updated_at:now()});if(!args.p_active)await cancel(tx,company,d=>d.campaign_id===c.id);audit(tx,actor,a.company,'campaign.activation',{campaignId:c.id,revision:c.revision,active:args.p_active});return null;
  }return fail('22023','Unknown campaign operation');
 }
 server(actor);
 if(name==='claim_message_campaign'){
  const result=(job:Row|null)=>args.p_paginated===true?{job,hasMore:queueHasMore(tx,'message_campaigns','claim')}:job;
  for(const d of await queueStates(tx,'message_campaign_deliveries',['sending','reserved'],'state'))if(Date.parse(d.lease_until)<=Date.now())tx.put('message_campaign_deliveries',d.id,{...d,state:d.state==='sending'?'uncertain':'canceled',error:d.state==='sending'?'provider_outcome_unknown':'reservation_expired',lease_until:null,updated_at:now()});
  for(const c of await queueScan(tx,'message_campaigns',[{field:'status',value:'active'}],'claim',1)){
   const run=await execution(tx,c);if(!run||!period(c,run.company))continue;const day=local(run.company.timezone).date;let recent=false,count=0;
   for(const state of ['reserved','sending','uncertain','sent']){const filters=[{field:'company_id',value:c.company_id},{field:'state',value:state}];const latest=await tx.list('message_campaign_deliveries',filters,{limit:1,orderBy:'created_at',descending:true});if(latest.some(d=>Date.parse(d.created_at)>Date.now()-60000))recent=true;const daily=await tx.list('message_campaign_deliveries',[...filters,{field:'campaign_id',value:c.id}],{limit:c.daily_limit,orderBy:'created_at',descending:true});count+=daily.filter(d=>localDate(d.created_at,run.company.timezone)===day).length;}
   if(recent||count>=c.daily_limit)continue;
   for(const s of await candidates(tx,c,run.company,true)){if(!await transport(tx,c.company_id,s.phone,run.channel.remote_id))continue;const key=hash(c.id+'/'+s.phone+'/'+s.event_key),prior=await tx.get('message_campaign_delivery_keys',key),old=prior?await tx.get('message_campaign_deliveries',prior.delivery_id):null;if(old&&old.state!=='canceled'||(old?.attempts??0)>=3&&old?.revision===c.revision)continue;
    const id=old?.id??randomUUID(),token=randomUUID(),body=personalizeCampaign(c.message,{name:s.name,daysAbsent:s.days_absent},run.company.name);const row={id,company_id:c.company_id,campaign_id:c.id,student_id:s.student_id,revision:c.revision,event_key:s.event_key,phone:s.phone,body,attempts:old?.revision===c.revision?(old!.attempts??0)+1:1,state:'reserved',claim_token:token,channel_id:run.channel.id,phone_id:run.channel.remote_id,lease_until:new Date(Date.now()+300000).toISOString(),provider_id:null,error:null,created_at:now(),updated_at:now()};tx.put('message_campaign_deliveries',id,row);tx.put('message_campaign_delivery_keys',key,{company_id:c.company_id,delivery_id:id});return result({id,token,companyId:c.company_id,actorId:c.approved_by,phone:s.phone,phoneId:run.channel.remote_id,body,transport:'whatsapp_cloud'});
   }
  }return result(null);
 }
 const id=uuid(args.p_id),d=await tx.get('message_campaign_deliveries',id);if(!d||d.claim_token!==args.p_token)return false;
 if(name==='finish_message_campaign'){if(d.state!=='sending')return false;const sent=args.p_sent===true&&typeof args.p_provider_id==='string'&&args.p_provider_id.length>0;tx.put('message_campaign_deliveries',id,{...d,state:sent?'sent':'uncertain',error:sent?null:'provider_outcome_unknown',provider_id:sent?text(args.p_provider_id,1,200):null,lease_until:null,updated_at:now()});return true;}
 if(d.state!=='reserved'||Date.parse(d.lease_until)<=Date.now())return false;const c=await tx.get('message_campaigns',d.campaign_id),run=c?await execution(tx,c):null,s=await tx.get('campaign_students',d.student_id);const match=c&&s&&run?event(c,s,run.company):null;
 if(!c||!run||!s||c.status!=='active'||c.revision!==d.revision||run.channel.id!==d.channel_id||run.channel.remote_id!==d.phone_id||!period(c,run.company)||s.phone!==d.phone||!await eligible(tx,c,s,run.company)||match?.key!==d.event_key||!c.approved_audience.some((a:Row)=>a.id===s.id&&a.phone===s.phone)||!await transport(tx,c.company_id,d.phone,run.channel.remote_id,d.id)){tx.put('message_campaign_deliveries',id,{...d,state:'canceled',error:'approval_consent_or_channel_changed',lease_until:null,updated_at:now()});return false;}
 tx.put('message_campaign_deliveries',id,{...d,state:'sending',updated_at:now(),lease_until:new Date(Date.now()+300000).toISOString()});return true;
}

// The public ingestion route supplies only a token hash. Resolve its tenant here;
// never accept a caller-selected company or expose credential/event collections.
async function managementRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 if(name==='ingest_management_students'){
  server(actor);
  const tokenHash=text(args.p_hash,64,64);if(!/^[a-f0-9]{64}$/.test(tokenHash))fail('42501','Invalid integration authorization');
  const binding=await tx.get('management_ingestion_key_hashes',tokenHash),key=binding?await tx.get('management_ingestion_keys',binding.company_id):null;
  if(!key||key.revoked_at||key.token_hash!==tokenHash||key.id!==binding?.key_id)fail('42501','Invalid integration authorization');
  const importer:FirestoreActor={role:'authenticated',id:key!.created_by};await access(tx,importer,key!.company_id);
  const event=uuid(args.p_event),observed=z.iso.datetime({offset:true}).safeParse(args.p_observed_at),bodyHash=text(args.p_body_hash,64,64);
  if(!observed.success||Date.parse(observed.data)>Date.now()+300000||Date.parse(observed.data)<Date.now()-86400000||!/^[a-f0-9]{64}$/.test(bodyHash))fail('22023','Invalid integration data');
  const eventKey=key!.company_id+'_'+key!.id+'_'+event,prior=await tx.get('management_ingestion_events',eventKey);
  if(prior){if(prior.body_hash!==bodyHash)fail('40001','Event changed');return {duplicate:true,imported:0};}
  if(key!.last_observed_at&&Date.parse(key!.last_observed_at)>Date.parse(observed.data!))fail('40001','Outdated snapshot');
  if((await list(tx,'management_ingestion_events',key!.company_id)).filter(e=>e.key_id===key!.id&&Date.parse(e.received_at)>Date.now()-60000).length>=10)fail('22023','Rate limit');
  const imported=await messageCampaignRpc(tx,importer,'import_campaign_students',{p_company_id:key!.company_id,p_students:args.p_students,p_source:'api'});
  const externalIds=new Set((args.p_students as Row[]).map(s=>s.externalId));for(const row of await list(tx,'campaign_students',key!.company_id))if(externalIds.has(row.external_id))tx.put('campaign_students',row.id,{...row,updated_at:observed.data!});
  tx.put('management_ingestion_events',eventKey,{company_id:key!.company_id,key_id:key!.id,event_id:event,body_hash:bodyHash,received_at:now()});
  tx.put('management_ingestion_keys',key!.company_id,{...key,last_received_at:now(),last_observed_at:observed.data!});return {duplicate:false,imported};
 }
 const company=uuid(args.p_company_id);
 if(name==='management_ingestion_status'){
  await companyAccess(tx,actor,company,'marketing.read');const key=await tx.get('management_ingestion_keys',company);
  return key?{id:key.id,active:!key.revoked_at,createdAt:key.created_at,lastReceivedAt:key.last_received_at,lastObservedAt:key.last_observed_at}:null;
 }
 const authorization=await access(tx,actor,company);if(!authorization.owner)fail('42501','Owner required');const prior=await tx.get('management_ingestion_keys',company);
 if(args.p_hash===null){if(prior){tx.put('management_ingestion_keys',company,{...prior,revoked_at:now()});tx.remove('management_ingestion_key_hashes',prior.token_hash);}}
 else{
  const tokenHash=text(args.p_hash,64,64),requestedId=uuid(args.p_id);if(!/^[a-f0-9]{64}$/.test(tokenHash))fail('22023','Invalid key');
  const binding=await tx.get('management_ingestion_key_hashes',tokenHash);if(binding&&binding.company_id!==company)fail('23505','Key already assigned');
  const id=prior?.id??requestedId;if(prior&&prior.token_hash!==tokenHash)tx.remove('management_ingestion_key_hashes',prior.token_hash);
  tx.put('management_ingestion_keys',company,{id,company_id:company,token_hash:tokenHash,created_by:actor.id,created_at:now(),revoked_at:null,last_received_at:prior?.last_received_at??null,last_observed_at:prior?.last_observed_at??null});
  tx.put('management_ingestion_key_hashes',tokenHash,{company_id:company,key_id:id});
 }
 audit(tx,actor,authorization.company,'management.key_changed',{revoked:args.p_hash===null});return null;
}
