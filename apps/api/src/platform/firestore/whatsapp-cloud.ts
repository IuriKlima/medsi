import {automationAllowed,officialServiceWindow} from './inbox';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,server,uuid,text,user,hash,audit,fail} from './access';
import {openChannel} from '../../onboarding/channel-vault';
export const whatsappCloudOperations=['inbox_cloud_messages_server','save_whatsapp_cloud_channel_server','read_company_whatsapp_server','ingest_whatsapp_cloud_server','read_whatsapp_cloud_inbox','reserve_whatsapp_cloud_dispatch'];
const now=()=>new Date().toISOString();
const list=(tx:DocumentTransaction,table:string,company:string)=>tx.list(table,[{field:'company_id',value:company}]);
const digits=z.string().regex(/^[1-9][0-9]{5,19}$/);
export async function whatsappCloudRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 if(name==='ingest_whatsapp_cloud_server'){
  server(actor);const parsed=z.object({phoneId:digits,wabaId:digits,messageId:z.string().min(1).max(200),peer:digits,time:z.iso.datetime(),body:z.string().max(6000),kind:z.string().max(50),name:z.string().max(150)}).strict().safeParse(args.p_event);if(!parsed.success)fail('22023','Invalid WhatsApp event');const e=parsed.data!,binding=await tx.get('channel_remote_bindings','whatsapp_cloud_'+e.phoneId);if(!binding)return {ignored:true};
  const channel=await tx.get('company_channels',binding.channel_id);if(!channel||channel.company_id!==binding.company_id||channel.provider!=='whatsapp_cloud'||channel.status==='disconnected'||channel.metadata?.wabaId!==e.wabaId)return {ignored:true};
  const company=channel.company_id,id=company+'_'+hash(e.messageId),prior=await tx.get('whatsapp_cloud_messages',id);if(prior)return {duplicate:true};const timestamp=Date.parse(e.time);if(timestamp>Date.now()+60000||timestamp<Date.now()-30*86400000)fail('22023','WhatsApp event time unavailable');
  const peer=e.peer,thread=peer+'@s.whatsapp.net',contactKey=company+'_'+hash(thread),link=await tx.get('company_contact_channels',contactKey);let contact=link?await tx.get('contacts',link.contact_id):(await list(tx,'contacts',company)).find(c=>c.phone_e164==='+'+peer);
  if(contact&&contact.company_id!==company)fail('42501','Contact unavailable');
  if(!contact){const contactId=randomUUID();contact={id:contactId,company_id:company,name:e.name||'Contato WhatsApp',phone_e164:'+'+peer,email:null,consent:false,opted_out:false,created_at:now()};tx.put('contacts',contactId,contact);}
  if(!(await list(tx,'opportunities',company)).some(o=>o.contact_id===contact!.id)){const opportunityId=randomUUID();tx.put('opportunities',opportunityId,{id:opportunityId,company_id:company,contact_id:contact.id,interest:'Contato recebido pelo WhatsApp oficial',original_source:'whatsapp',stage:'new',created_at:now()});}
  const optOut=/\b(stop|unsubscribe|cancelar mensagens|n[aã]o (quero|desejo) (mais )?(receber|mensagens)|pare de (enviar|mandar))\b/i.test(e.body);if(optOut)tx.put('contacts',contact.id,{...contact,consent:false,opted_out:true,consent_updated_at:now()});
  tx.put('whatsapp_cloud_messages',id,{id,company_id:company,phone_id:e.phoneId,thread,provider_id:e.messageId,from_me:false,body:e.body,kind:e.kind,time:e.time,status:'received',created_at:now(),expires_at:new Date(Date.now()+30*86400000).toISOString()});
  if(!link?.last_message_at||timestamp>=Date.parse(link.last_message_at))tx.put('company_contact_channels',contactKey,{id:contactKey,company_id:company,contact_id:contact.id,channel:'whatsapp',remote_id:thread,last_message_at:e.time,last_preview:e.kind==='text'?e.body.slice(0,1000):'[Arquivo recebido]',updated_at:now()});
  // A signed inbound event confirms delivery to this application's configured webhook.
  tx.put('company_channels',channel.id,{...channel,status:'connected',metadata:{...channel.metadata,webhookReady:true,lastWebhookAt:now()},updated_at:now()});
  if(optOut){const handoff=company+'_whatsapp_'+hash(thread),h=await tx.get('inbox_handoffs',handoff);tx.put('inbox_handoffs',handoff,{id:handoff,company_id:company,channel:'whatsapp',thread,actor_id:null,released_at:null,revision:(h?.revision??0)+1,updated_at:now()});for(const job of await list(tx,'inbox_auto_jobs',company))if(job.thread===thread&&job.state==='generating')tx.put('inbox_auto_jobs',job.id,{...job,state:'canceled',updated_at:now()});}
  return {received:true};
 }
 const company=uuid(args.p_company_id);
 if(name==='save_whatsapp_cloud_channel_server'){
  server(actor);const requested:FirestoreActor={role:'authenticated',id:uuid(args.p_actor)},access=await companyAccess(tx,requested,company,'billing.manage');if(!access.owner)fail('42501','Owner required');
  const phone=digits.parse(args.p_phone_id),waba=digits.parse(args.p_waba_id),label=text(args.p_name,1,200),cipher=text(args.p_cipher,10,200000);let payload:Row;
  try{payload=openChannel<Row>(company,cipher);}catch{return fail('22023','Invalid encrypted channel material');}if(!payload.token||payload.phoneId!==phone||payload.wabaId!==waba||args.p_verified!==true||args.p_platform!=='CLOUD_API')fail('22023','Official provider verification required');
  const key='whatsapp_cloud_'+phone,binding=await tx.get('channel_remote_bindings',key);if(binding&&binding.company_id!==company)fail('42501','Phone already assigned');const prior=(await list(tx,'company_channels',company)).find(c=>c.provider==='whatsapp_cloud'),id=prior?.id??randomUUID();
  const row={id,company_id:company,provider:'whatsapp_cloud',remote_id:phone,name:label,status:prior?.remote_id===phone&&prior.metadata?.webhookReady?'connected':'pending',metadata:{wabaId:waba,transport:'WHATSAPP-CLOUD-API',webhookReady:prior?.remote_id===phone&&prior.metadata?.webhookReady===true,verifiedAt:now()},updated_at:now()};
  if(prior&&prior.remote_id!==phone)tx.remove('channel_remote_bindings','whatsapp_cloud_'+prior.remote_id);tx.put('channel_remote_bindings',key,{company_id:company,channel_id:id});tx.put('company_channels',id,row);tx.put('channel_secrets',id,{company_id:company,channel_id:id,cipher});audit(tx,requested,access.company,'channel.whatsapp_cloud_verified',{channelId:id,phoneId:phone});return row;
 }
 if(name==='read_company_whatsapp_server'){
  server(actor);const action=text(args.p_action);if(!['crm.read','crm.write','billing.manage'].includes(action))fail('42501','Access denied');await companyAccess(tx,{role:'authenticated',id:uuid(args.p_actor)},company,action);
  const channel=(await list(tx,'company_channels',company)).find(c=>c.provider==='whatsapp_cloud'&&c.status!=='disconnected');if(!channel)return null;const secret=await tx.get('channel_secrets',channel.id);if(secret?.company_id!==company||secret?.channel_id!==channel.id)return null;return {remote_id:channel.remote_id,status:channel.status,metadata:channel.metadata,cipher:secret.cipher};
 }
 if(name==='inbox_cloud_messages_server'){server(actor);const settings=await tx.get('company_service_settings',company+'_whatsapp');if(!await automationAllowed(tx,company,settings,args.p_thread??undefined))return [];}else await companyAccess(tx,actor,company,name==='reserve_whatsapp_cloud_dispatch'?'crm.write':'crm.read');
 if(name==='inbox_cloud_messages_server'){const thread=args.p_thread?text(args.p_thread,1,200):null;return (await list(tx,'whatsapp_cloud_messages',company)).filter(m=>Date.parse(m.expires_at)>Date.now()&&(!thread||m.thread===thread)).sort((a,b)=>String(a.time).localeCompare(String(b.time))).slice(-100).map(m=>({id:m.provider_id,thread:m.thread,body:m.body,fromMe:m.from_me,time:m.time,kind:m.kind,status:m.status}));}
 if(name==='read_whatsapp_cloud_inbox'){
  const thread=args.p_thread?text(args.p_thread,1,200):null,messages=(await list(tx,'whatsapp_cloud_messages',company)).filter(m=>Date.parse(m.expires_at)>Date.now()&&(!thread||m.thread===thread)).sort((a,b)=>String(a.time).localeCompare(String(b.time)));
  if(thread)return messages.slice(-100).map(m=>({id:m.provider_id,body:m.body,fromMe:m.from_me,time:m.time,kind:m.kind,status:m.status}));
  const latest=new Map<string,Row>();for(const m of messages)latest.set(m.thread,m);const contacts=await list(tx,'contacts',company);return [...latest.values()].map(m=>({id:Buffer.from(m.thread).toString('base64url'),channel:'whatsapp',name:contacts.find(c=>c.phone_e164==='+'+m.thread.split('@')[0])?.name??'Contato WhatsApp',preview:m.body,time:m.time,unread:0,group:false})).sort((a,b)=>b.time.localeCompare(a.time));
 }
 if(name==='reserve_whatsapp_cloud_dispatch'){
  const id=uuid(args.p_id),thread=text(args.p_thread,1,200),body=text(args.p_body,1,4096);if(!/^[1-9][0-9]{5,19}@s\.whatsapp\.net$/.test(thread))fail('22023','Invalid WhatsApp recipient');const actorId=user(actor),handoff=await tx.get('inbox_handoffs',company+'_whatsapp_'+hash(thread));if(!handoff||handoff.actor_id!==actorId||handoff.released_at)fail('42501','Take over first');
  const channel=(await list(tx,'company_channels',company)).find(c=>c.provider==='whatsapp_cloud'&&c.status==='connected'&&c.metadata?.webhookReady);if(!channel)fail('42501','Official WhatsApp channel unavailable');
  if(!await officialServiceWindow(tx,company,channel!.remote_id,thread))fail('22023','WhatsApp customer service window closed');const contact=(await list(tx,'contacts',company)).find(c=>c.phone_e164==='+'+thread.split('@')[0]);if(contact?.opted_out||contact?.opt_out)fail('42501','Contact opted out');
  const prior=await tx.get('inbox_dispatches',id);if(prior){if(prior.company_id!==company||prior.actor_id!==actorId)fail('42501','Dispatch unavailable');if(prior.thread!==thread||prior.body!==body||prior.provider!=='whatsapp_cloud')fail('40001','Request conflict');return false;}
  const dispatches=await list(tx,'inbox_dispatches',company);if(dispatches.some(d=>d.thread===thread&&d.body===body&&['reserved','uncertain'].includes(d.state))||(await list(tx,'inbox_auto_jobs',company)).some(j=>j.thread===thread&&j.body===body&&['dispatching','uncertain'].includes(j.state)))return false;if(dispatches.filter(d=>Date.parse(d.created_at)>Date.now()-60000).length>=30)fail('22023','Dispatch rate limit');tx.put('inbox_dispatches',id,{id,company_id:company,channel:'whatsapp',provider:'whatsapp_cloud',phone_id:channel!.remote_id,thread,actor_id:actorId,body,state:'reserved',provider_id:null,created_at:now(),updated_at:now()});return true;
 }
 return fail('FIRESTORE_OPERATION_PENDING','Unknown official WhatsApp operation');
}
