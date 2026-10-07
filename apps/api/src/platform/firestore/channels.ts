import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {openChannel} from '../../onboarding/channel-vault';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,server,uuid,text,user,audit,fail} from './access';
export const channelOperations=['read_company_meta_server','read_channel_secret','begin_meta_session','consume_meta_session','save_meta_selection','read_meta_selection','save_company_channel','disconnect_company_channel'];
const now=()=>new Date().toISOString();
async function owner(tx:DocumentTransaction,actor:FirestoreActor,company:string){const access=await companyAccess(tx,actor,company);if(!access.owner)fail('42501','Owner required');return access;}
function decrypt(company:string,cipher:unknown):Row {try{return openChannel<Row>(company,text(cipher,10,200000));}catch{return fail('22023','Invalid encrypted channel material');}}
async function session(tx:DocumentTransaction,actor:FirestoreActor,id:string){const row=await tx.get('meta_sessions',id);if(!row||row.actor_id!==user(actor)||Date.parse(row.expires_at)<=Date.now())fail('42501','OAuth state unavailable');await owner(tx,actor,row!.company_id);return row!;}
/** Only the provider adapter supplies connected status. Vault material is stored
 * separately with company-bound AES-GCM AAD and never in channel query rows. */
export async function channelRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 if(name==='consume_meta_session'||name==='save_meta_selection'){
  const id=uuid(args.p_id),s=await session(tx,actor,id);
  if(name==='consume_meta_session'){if(s.consumed||s.state_hash!==text(args.p_hash,64,64))fail('42501','OAuth state unavailable');tx.put('meta_sessions',id,{...s,consumed:true});return s.company_id;}
  if(!s.consumed)fail('42501','OAuth state unavailable');const payload=decrypt(s.company_id,args.p_cipher);if(!Array.isArray(payload.pages)||!Array.isArray(payload.scopes)||payload.pages.length>1000)fail('22023','Invalid Meta selection');tx.put('meta_sessions',id,{...s,cipher:args.p_cipher});return null;
 }
 const company=uuid(args.p_company_id);
 if(name==='begin_meta_session'){
  await owner(tx,actor,company);const id=uuid(args.p_id),stateHash=text(args.p_hash,64,64);if(!/^[a-f0-9]{64}$/.test(stateHash))fail('22023','Invalid state');if(await tx.get('meta_sessions',id))fail('40001','OAuth request conflict');
  for(const s of await tx.list('meta_sessions',[{field:'company_id',value:company}]))if(s.actor_id===user(actor))tx.remove('meta_sessions',s.id);
  tx.put('meta_sessions',id,{id,company_id:company,actor_id:actor.id,state_hash:stateHash,cipher:null,consumed:false,expires_at:new Date(Date.now()+600000).toISOString()});return null;
 }
 if(name==='read_meta_selection'){const s=await session(tx,actor,uuid(args.p_id));if(s.company_id!==company||!s.consumed||!s.cipher)fail('42501','OAuth state unavailable');return s.cipher;}
 if(name==='save_company_channel'||name==='disconnect_company_channel'){
  const access=await owner(tx,actor,company),provider=text(args.p_provider);if(!['meta','evolution',...(name==='disconnect_company_channel'?['whatsapp_cloud']:[])].includes(provider))fail('22023','Invalid provider');
  const channels=await tx.list('company_channels',[{field:'company_id',value:company}]),prior=channels.find(c=>c.provider===provider);
  if(name==='disconnect_company_channel'){
   if(prior){tx.remove('channel_secrets',prior.id);tx.put('company_channels',prior.id,{...prior,status:'disconnected',metadata:{},updated_at:now()});}
   // Disconnect cancels generation. Calls already dispatched remain uncertain.
   for(const job of await tx.list('inbox_auto_jobs',[{field:'company_id',value:company}]))if(job.state==='generating')tx.put('inbox_auto_jobs',job.id,{...job,state:'canceled',updated_at:now()});
   audit(tx,actor,access.company,'channel.disconnected',{provider});return null;
  }
  const remote=text(args.p_remote,1,150),label=text(args.p_name,1,200),status=text(args.p_status);
  if(!['pending','connected','disconnected'].includes(status)||!args.p_metadata||Array.isArray(args.p_metadata)||typeof args.p_metadata!=='object'||JSON.stringify(args.p_metadata).length>12000)fail('22023','Invalid connection');
  const metadata=z.object({tasks:z.array(z.string().max(100)).max(100).optional(),scopes:z.array(z.string().max(100)).max(100).optional(),access:z.record(z.string(),z.boolean()).optional(),instagramId:z.string().regex(/^\d+$/).nullable().optional(),instagramName:z.string().max(200).nullable().optional(),expiresAt:z.iso.datetime().nullable().optional(),publishingReady:z.boolean().optional(),insightsReady:z.boolean().optional(),webhookReady:z.boolean().optional(),transport:z.string().max(100).optional(),connectionState:z.string().max(100).optional()}).strict().safeParse(args.p_metadata);if(!metadata.success)fail('22023','Invalid public channel metadata');
  const metadataKeys=['tasks','access','instagramId','instagramName','scopes','expiresAt','publishingReady','insightsReady','webhookReady','transport','connectionState'];if(Object.keys(args.p_metadata).some(k=>!metadataKeys.includes(k)))fail('22023','Invalid channel metadata');
  if(provider==='evolution'&&remote!=='askadia-'+company)fail('22023','Company instance required');
  const payload=status==='disconnected'?null:decrypt(company,args.p_cipher);
  let selected:Row|null=null;
  if(provider==='meta'&&status!=='disconnected'){
   const s=await session(tx,actor,uuid(args.p_session));if(s.company_id!==company||!s.consumed||!s.cipher)fail('42501','OAuth authorization required');
   const selection=decrypt(company,s.cipher);selected=(selection.pages as Row[]).find(p=>p.id===remote)??null;
   if(!selected||!selected.access_token||payload?.token!==selected.access_token||payload?.userToken!==selection.userToken)fail('42501','Select an authorized Page');
   // Metadata derives from provider evidence in the saved OAuth selection.
   if(JSON.stringify(args.p_metadata.scopes)!==JSON.stringify(selection.scopes)||args.p_metadata.instagramId!==(selected!.instagram_business_account?.id??null)||args.p_metadata.expiresAt!==selection.expiresAt)fail('22023','Channel evidence changed');
   tx.remove('meta_sessions',s.id);
  }
  if(provider==='evolution'&&status!=='disconnected'&&payload?.instance!==remote)fail('22023','Invalid instance material');
  if(provider==='evolution'&&status==='connected'&&args.p_metadata.connectionState!=='open')fail('22023','Provider connection confirmation required');
  // A shared provider remote ID must never bind to two tenants.
  const bindingId=provider+'_'+remote,binding=await tx.get('channel_remote_bindings',bindingId);if(binding&&binding.company_id!==company)fail('42501','Channel already assigned');
  const id=prior?.id??randomUUID(),row={id,company_id:company,provider,remote_id:remote,name:label,status,metadata:args.p_metadata,updated_at:now()};
  if(prior&&prior.remote_id!==remote)tx.remove('channel_remote_bindings',provider+'_'+prior.remote_id);tx.put('channel_remote_bindings',bindingId,{company_id:company,channel_id:id});tx.put('company_channels',id,row);
  if(status==='disconnected')tx.remove('channel_secrets',id);else tx.put('channel_secrets',id,{company_id:company,channel_id:id,cipher:args.p_cipher});audit(tx,actor,access.company,'channel.'+status,{provider,channelId:id});return row;
 }
 if(name==='read_company_meta_server'){
  server(actor);const requested=text(args.p_action);if(!['crm.read','crm.write','marketing.read','marketing.write','billing.manage'].includes(requested))fail('42501','Access denied');await companyAccess(tx,{role:'authenticated',id:uuid(args.p_actor)},company,requested);
 }else await owner(tx,actor,company);
 const provider=name==='read_company_meta_server'?'meta':text(args.p_provider);if(!['meta','evolution'].includes(provider))fail('22023','Invalid provider');
 const channel=(await tx.list('company_channels',[{field:'company_id',value:company}])).find(c=>c.provider===provider&&c.status==='connected');if(!channel)return null;
 const secret=await tx.get('channel_secrets',channel.id);if(!secret||secret.company_id!==company||secret.channel_id!==channel.id||typeof secret.cipher!=='string')return null;
 if(channel.metadata?.expiresAt&&(!Number.isFinite(Date.parse(channel.metadata.expiresAt))||Date.parse(channel.metadata.expiresAt)<=Date.now()))return null;
 return name==='read_company_meta_server'?{remote_id:channel.remote_id,metadata:channel.metadata??{},cipher:secret.cipher}:secret.cipher;
}
