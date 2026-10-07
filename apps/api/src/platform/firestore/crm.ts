import {automationAllowed} from './inbox';
import {randomUUID} from 'node:crypto';
import type {DocumentTransaction,Predicate,Row} from './store';
import {type FirestoreActor,companyAccess,uuid,text,user,audit,hash,fail,scopedRows} from './access';
export const crmOperations=['save_crm_contact','move_crm_opportunity','open_company_conversation','set_conversation_mode','add_conversation_note','claim_company_reply','sync_whatsapp_crm'];
const now=()=>new Date().toISOString();
export async function scoped(tx:DocumentTransaction,table:string,id:string,company:string){const row=await tx.get(table,id);if(!row||row.company_id!==company)fail('42501','Record unavailable');return row!;}
export async function crmRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 const company=uuid(args.p_company_id),actorId=user(actor),access=await companyAccess(tx,actor,company,'crm.write'),rows=(table:string,filters:Predicate[])=>scopedRows(tx,table,[{field:'company_id',value:company},...filters]);
 if(name==='save_crm_contact'){
  const request=uuid(args.p_request_id),input={name:text(args.p_name,2,150),phone:text(args.p_phone??'',0,20),email:text(args.p_email??'',0,254),interest:text(args.p_interest??'',0,2000)};
  if(input.phone&&!/^\+[1-9][0-9]{7,14}$/.test(input.phone))fail('22023','Invalid phone');
  if(input.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))fail('22023','Invalid email');
  const key=company+'_'+request,prior=await tx.get('crm_requests',key),basis=hash(input);
  if(prior){if(prior.actor_id!==actorId||prior.basis!==basis)fail('40001','Request conflict');return prior.result;}
  let contact=input.phone?(await tx.list('contacts',[{field:'company_id',value:company},{field:'phone_e164',value:input.phone}],{limit:1}))[0]:undefined;
  if(!contact){const id=randomUUID();contact={id,company_id:company,name:input.name,phone_e164:input.phone||null,email:input.email||null,consent:false,opted_out:false,created_at:now()};tx.put('contacts',id,contact);}
  let opportunity=(await rows('opportunities',[{field:'contact_id',value:contact.id}])).filter(o=>o.contact_id===contact!.id&&!['lost','enrolled'].includes(o.stage)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
  if(!opportunity){const id=randomUUID();opportunity={id,company_id:company,contact_id:contact.id,interest:input.interest,original_source:'manual',stage:'new',created_at:now()};tx.put('opportunities',id,opportunity);}
  const result={contact,opportunity};tx.put('crm_requests',key,{company_id:company,request_id:request,actor_id:actorId,basis,result});audit(tx,actor,access.company,'crm.contact_saved',{contactId:contact.id,opportunityId:opportunity.id});return result;
 }
 if(name==='move_crm_opportunity'){
  const id=uuid(args.p_id),row=await scoped(tx,'opportunities',id,company),stage=text(args.p_stage),reason=text(args.p_reason,2,2000);
  if(!['new','in_progress','qualified','referred','scheduled','attended','enrolled','lost'].includes(stage))fail('22023','Invalid stage');if(row.stage===stage)return row;
  const next={...row,stage,updated_at:now()},history=randomUUID();tx.put('opportunities',id,next);tx.put('stage_history',history,{id:history,company_id:company,opportunity_id:id,stage,reason,actor_id:actorId,created_at:now()});return next;
 }
 if(name==='open_company_conversation'){
  const contact=uuid(args.p_contact_id);await scoped(tx,'contacts',contact,company);
  const prior=(await rows('company_conversations',[{field:'contact_id',value:contact}])).find(c=>c.contact_id===contact&&c.mode!=='closed');if(prior)return prior;
  const id=randomUUID(),row={id,company_id:company,contact_id:contact,mode:'human',assigned_to:actorId,revision:1,triage_summary:null,created_at:now(),updated_at:now()};tx.put('company_conversations',id,row);return row;
 }
 if(name==='set_conversation_mode'){
  const id=uuid(args.p_id),row=await scoped(tx,'company_conversations',id,company);if(row.revision!==args.p_revision)fail('40001','Conversation changed');if(!['human','closed'].includes(args.p_mode))fail('22023','Invalid mode');
  const next={...row,mode:args.p_mode,assigned_to:actorId,revision:row.revision+1,updated_at:now()};tx.put('company_conversations',id,next);
  for(const job of await rows('company_reply_jobs',[{field:'conversation_id',value:id}]))if(job.conversation_id===id&&['pending','claimed'].includes(job.state))tx.put('company_reply_jobs',job.id,{...job,state:'canceled'});
  audit(tx,actor,access.company,'conversation.'+args.p_mode,{conversationId:id,revision:next.revision});return next;
 }
 if(name==='add_conversation_note'){
  const conversation=uuid(args.p_id),row=await scoped(tx,'company_conversations',conversation,company),id=uuid(args.p_request_id),body=text(args.p_body,1,6000);
  if(row.mode!=='human'||row.assigned_to!==actorId)fail('42501','Take over the conversation first');
  const prior=await tx.get('company_conversation_notes',id);if(prior){if(prior.company_id!==company||prior.conversation_id!==conversation||prior.actor_id!==actorId)fail('42501','Request unavailable');if(prior.body!==body)fail('40001','Request conflict');return prior;}
  const note={id,company_id:company,conversation_id:conversation,actor_id:actorId,body,created_at:now()};tx.put('company_conversation_notes',id,note);return note;
 }
 if(name==='claim_company_reply'){
  const id=uuid(args.p_job_id),job=await scoped(tx,'company_reply_jobs',id,company),conversation=await scoped(tx,'company_conversations',job.conversation_id,company),profile=await tx.get('company_onboarding',company);
  if(job.state!=='pending')return null;
  if(conversation.mode!=='ai'||conversation.revision!==job.conversation_revision||profile?.profile_version!==job.profile_version||profile?.confirmed_revision!==profile?.revision){tx.put('company_reply_jobs',id,{...job,state:'canceled'});return null;}
  const settings=await tx.get('company_service_settings',company+'_whatsapp'),links=await rows('company_contact_channels',[{field:'contact_id',value:conversation.contact_id}]),link=links.find(l=>l.contact_id===conversation.contact_id);
  if(!link||!await automationAllowed(tx,company,settings,link.remote_id)){tx.put('company_reply_jobs',id,{...job,state:'canceled'});return null;}
  const claimed={...job,state:'claimed',claimed_by:actorId,claimed_at:now()};tx.put('company_reply_jobs',id,claimed);return claimed;
 }
 if(name==='sync_whatsapp_crm')return syncWhatsapp(tx,actor,company,args.p_contacts);
 return fail('FIRESTORE_OPERATION_PENDING','Unknown CRM operation');
}
async function syncWhatsapp(tx:DocumentTransaction,actor:FirestoreActor,company:string,input:unknown){
 if(!Array.isArray(input)||input.length>200)fail('22023','Invalid contacts');
 if(!(await tx.list('company_channels',[{field:'company_id',value:company},{field:'provider',value:'evolution'},{field:'status',value:'connected'},{field:'remote_id',value:'askadia-'+company}],{limit:1})).length)fail('42501','Channel unavailable');
 let added=0,linked=0;
 for(const item of input as Row[]){
  const jid=text(item.jid,1,200),name=text(item.name,1,150),preview=text(item.preview??'',0,1000);
  if(!/^[0-9]{6,20}@(s\.whatsapp\.net|lid)$/.test(jid)||item.time&&!Number.isFinite(Date.parse(item.time)))fail('22023','Invalid contact');
  const phone=/^[1-9][0-9]{7,14}@s\.whatsapp\.net$/.test(jid)?'+'+jid.split('@')[0]:null,id=company+'_'+hash(jid),prior=await tx.get('company_contact_channels',id);
  let contact=prior?await scoped(tx,'contacts',prior.contact_id,company):undefined;
  if(!contact&&phone)contact=(await tx.list('contacts',[{field:'company_id',value:company},{field:'phone_e164',value:phone}],{limit:1}))[0];
  if(!contact){const contactId=randomUUID();contact={id:contactId,company_id:company,name,phone_e164:phone,email:null,consent:false,opted_out:false,created_at:now()};tx.put('contacts',contactId,contact);added++;}
  tx.put('company_contact_channels',id,{id,company_id:company,contact_id:contact.id,channel:'whatsapp',remote_id:jid,last_message_at:item.time??null,last_preview:preview,updated_at:now()});
  if(!(await tx.list('opportunities',[{field:'company_id',value:company},{field:'contact_id',value:contact.id}],{limit:1})).length){const opportunityId=randomUUID();tx.put('opportunities',opportunityId,{id:opportunityId,company_id:company,contact_id:contact.id,interest:'Contato recebido pelo WhatsApp',original_source:'whatsapp',stage:'new',created_at:now()});}linked++;
 }return {added,linked};
}
