import {queueScan,queueStates} from './queue-scan';
import {randomUUID} from 'node:crypto';
import {siteContentSchema,siteDomain} from '@askadia/contracts';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,server,uuid,fail,hash,audit} from './access';
import {confirmed,now,context,approvalThrough} from './journey-state';
import {purchaseState} from './commerce';

export const siteOperations=['reserve_site_generation','save_company_site','approve_company_site','publish_company_site','set_site_domain','set_site_slug','verify_site_domain_server','read_published_site_server','enqueue_company_site','claim_company_site_server','finish_company_site_server'];
const blank=(company:string)=>({company_id:company,slug:null,revision:0,profile_version:null,draft:null,published:null,published_revision:null,published_at:null,approval:null,updated_at:now()});
// Keep evidence for the public snapshot separate from approval of the editable draft.
function publishedApproval(site:Row|null){
 const approval=site?.published_approval??site?.approval;
 if(!site?.published||!approval||approval.revoked_at||approval.revision!==site.published_revision||approval.hash!==hash(site.published)||site.approval?.revision===site.published_revision&&site.approval.revoked_at)return null;
 return approval;
}
async function profile(tx:DocumentTransaction,company:string,version:unknown){const state=await tx.get('company_onboarding',company);if(!confirmed(state)||state?.profile_version!==version||!await tx.get('company_profile_versions',company+'_'+version))fail('40001','Confirme a versão atual do perfil.');}
async function materials(tx:DocumentTransaction,company:string,content:Row){for(const id of [...content.images,...(content.logo?[content.logo]:[])]){const file=await tx.get('onboarding_attachments',id);if(file?.company_id!==company||!['image/png','image/jpeg','image/webp'].includes(file.mime)||typeof file.object_path!=='string'||!file.object_path.startsWith(company+'/'))fail('42501','Company materials required');}}
export async function siteRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 if(name==='read_published_site_server'){
  server(actor);let company:string|null=null;
  if(args.p_company_id)company=uuid(args.p_company_id);
  else if(args.p_slug){const reservation=await tx.get('site_address_reservations','slug_'+args.p_slug);company=reservation?.company_id??null;}
  else if(args.p_hostname){let hostname:string;try{hostname=siteDomain(args.p_hostname);}catch{return null;}const reservation=await tx.get('site_address_reservations','domain_'+hostname);company=reservation?.company_id??null;if(company){const d=await tx.get('company_site_domains',company);if(d?.hostname!==hostname||!d.dns_verified_at||!d.routing_configured_at)return null;}}
  if(!company)return null;const [s,c]=await Promise.all([tx.get('company_sites',company),tx.get('companies',company)]);return publishedApproval(s)&&c&&!c.archived_at?{companyId:company,content:s!.published,revision:s!.published_revision}:null;
 }
 if(['claim_company_site_server','finish_company_site_server'].includes(name))return siteJobRpc(tx,actor,name,args);
 const company=uuid(args.p_company_id);
 if(name==='verify_site_domain_server'){
  server(actor);await companyAccess(tx,{role:'authenticated',id:uuid(args.p_actor)},company,'billing.manage');const d=await tx.get('company_site_domains',company),s=await tx.get('company_sites',company);
  if(!d||d.hostname!==args.p_hostname||d.verification_token!==args.p_token)fail('40001','Domain changed');
  if(args.p_routed){const approval=publishedApproval(s);if(!approval)fail('42501','Publication approval required');await profile(tx,company,approval.profile_version);}
  tx.put('company_site_domains',company,{...d,dns_verified_at:now(),routing_configured_at:args.p_routed?now():d!.routing_configured_at});return true;
 }
 const action=['approve_company_site','publish_company_site'].includes(name)?'site.approve':['set_site_domain','set_site_slug'].includes(name)?'billing.manage':'marketing.write';
 const access=await companyAccess(tx,actor,company,action),s=await tx.get('company_sites',company)??blank(company);
 if(name==='enqueue_company_site'){
  await profile(tx,company,args.p_profile_version);if(s.revision!==args.p_revision)fail('40001','Site changed');
  const id=uuid(args.p_id),prior=await tx.get('company_site_jobs',id);if(prior){if(prior.company_id!==company||prior.actor_id!==actor.id)fail('42501','Access denied');return prior;}
  if(typeof args.p_feedback!=='string'||args.p_feedback.length>2000)fail('22023','Invalid feedback');
  await siteRpc(tx,actor,'reserve_site_generation',{p_company_id:company,p_id:id});
  const pending=[];for(const status of ['pending','running'])pending.push(...await tx.list('company_site_jobs',[{field:'company_id',value:company},{field:'profile_version',value:args.p_profile_version},{field:'expected_revision',value:s.revision},{field:'status',value:status}],{limit:1}));if(pending.length)fail('40001','Site generation already pending');
  const row={id,company_id:company,actor_id:actor.id,profile_version:args.p_profile_version,expected_revision:s.revision,feedback:args.p_feedback,status:'pending',attempts:0,token:null,lease_until:null,next_attempt_at:now(),error:null,created_at:now(),updated_at:now()};tx.put('company_site_jobs',id,row);return row;
 }
 if(name==='reserve_site_generation'){
  if(!(await purchaseState(tx,actor,company)).aiAllowed)fail('P0402','Ative o plano antes de gerar o site.');
  const id=uuid(args.p_id),key=company+'_'+id,prior=await tx.get('site_generation_runs',key);if(prior)return false;
  const day=now().slice(0,10),counterKey=company+'_site_'+day,counter=await tx.get('provider_daily_usage',counterKey),limit=await tx.get('onboarding_provider_limits',company+'_site');
  if((counter?.count??0)>=(limit?.daily_calls??5))fail('22023','Daily site allowance exhausted');
  tx.put('provider_daily_usage',counterKey,{company_id:company,kind:'site',day,count:(counter?.count??0)+1});tx.put('site_generation_runs',key,{id,company_id:company,actor_id:actor.id,created_at:now()});return true;
 }
 if(name==='save_company_site'){
  await profile(tx,company,args.p_profile_version);if(s.revision!==args.p_revision)fail('40001','Site changed');const parsed=siteContentSchema.safeParse(args.p_content);if(!parsed.success||JSON.stringify(args.p_content).length>40000)fail('22023','Invalid site');const content=parsed.data!;if(new Set(content.images).size!==content.images.length||content.images.includes(content.logo??''))fail('22023','Invalid image selection');await materials(tx,company,content);
  const row={...s,draft:content,profile_version:args.p_profile_version,revision:s.revision+1,published_approval:publishedApproval(s),approval:null,updated_at:now()};tx.put('company_sites',company,row);tx.put('company_site_versions',company+'_'+row.revision,{company_id:company,revision:row.revision,profile_version:row.profile_version,content,created_at:now(),actor_id:actor.id});audit(tx,actor,access.company,'site.saved',{revision:row.revision});return row;
 }
 if(['approve_company_site','publish_company_site'].includes(name)){
  if(s.revision!==args.p_revision||!s.draft)fail('40001','Site changed');
  if(name==='approve_company_site'){
   await profile(tx,company,s.profile_version);await materials(tx,company,s.draft);if(!s.draft.whatsapp)fail('22023','Confirm WhatsApp before publishing');
   const approval={revision:s.revision,profile_version:s.profile_version,hash:hash(s.draft),actor_id:actor.id,approved_at:now(),revoked_at:null};tx.put('company_sites',company,{...s,approval});audit(tx,actor,access.company,'site.approved',{revision:s.revision});return approval;
  }
  if(typeof args.p_publish!=='boolean')fail('22023','Invalid publication');
  if(args.p_publish){await profile(tx,company,s.profile_version);await materials(tx,company,s.draft);if(!s.approval||s.approval.revoked_at||s.approval.revision!==s.revision||s.approval.hash!==hash(s.draft))fail('42501','Approve this site version before publishing');}
  tx.put('company_sites',company,{...s,published:args.p_publish?s.draft:null,published_revision:args.p_publish?s.revision:null,published_at:args.p_publish?now():null,published_approval:args.p_publish?s.approval:null,approval:args.p_publish?s.approval:s.approval?{...s.approval,revoked_at:now()}:null});audit(tx,actor,access.company,args.p_publish?'site.published':'site.unpublished',{revision:s.revision});return true;
 }
 if(name==='set_site_domain'||name==='set_site_slug'){
  const domain=name==='set_site_domain',prior:Row|null=domain?await tx.get('company_site_domains',company):s,old=domain?prior?.hostname:s.slug;
  let value=args[domain?'p_hostname':'p_slug'];if(domain&&value!==null){try{value=siteDomain(value);}catch{fail('22023','Invalid domain');}}
  if(!domain&&(typeof value!=='string'||!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(value)||['www','app','api','admin','mail','sites','panel','easypanel','login','auth','support','suporte','status','medsi','askadia'].includes(value)))fail('22023','Invalid subdomain');
  const prefix=domain?'domain_':'slug_';if(value){const reservation=await tx.get('site_address_reservations',prefix+value);if(reservation&&reservation.company_id!==company)fail('23505','Address already reserved');}
  if(old&&old!==value)tx.remove('site_address_reservations',prefix+old);if(value)tx.put('site_address_reservations',prefix+value,{company_id:company});
  if(domain){if(value===null)tx.remove('company_site_domains',company);else if(old!==value)tx.put('company_site_domains',company,{company_id:company,hostname:value,verification_token:randomUUID(),dns_verified_at:null,routing_configured_at:null,created_at:now()});}
  else tx.put('company_sites',company,{...s,slug:value});audit(tx,actor,access.company,'site.address_requested',{kind:domain?'domain':'slug',value});return true;
 }
 return fail('FIRESTORE_OPERATION_PENDING','Site operation pending');
}

/** Uses the existing API launch poller; no second business executor is introduced. */
async function siteJobRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 server(actor);
 async function eligible(job:Row){
  const delegated:FirestoreActor={role:'authenticated',id:job.actor_id};
  try{await companyAccess(tx,delegated,job.company_id,'marketing.write');await profile(tx,job.company_id,job.profile_version);if(!(await purchaseState(tx,delegated,job.company_id)).aiAllowed)return null;if(job.auto_setup_token){const setup=await tx.get('company_setup',job.company_id),ctx=await context(tx,job.company_id);if(!setup||setup.invalidated_at||setup.profile_version!==job.profile_version||!(await purchaseState(tx,delegated,job.company_id)).setupComplete||approvalThrough(ctx,5).token!==job.auto_setup_token)return null;}const s=await tx.get('company_sites',job.company_id);if((s?.revision??0)!==job.expected_revision)return null;return delegated;}catch{return null;}
 }
 const finish=(job:Row,status:string,error:string|null)=>({...job,status,error,token:null,lease_until:null,updated_at:now()});
 if(name==='claim_company_site_server'){
  for(const setup of await queueScan(tx,'company_setup',[],'sites-seed',1)){
   if(setup.invalidated_at)continue;
   const company=setup.company_id,ctx=await context(tx,company),key=company+'_'+ctx.version;
   if(!ctx.confirmed||setup.profile_version!==ctx.version||ctx.facts.websitePreference?.status!=='provided'||ctx.facts.websitePreference?.value!=='create'||await tx.get('company_site_auto_seeds',key))continue;
   const delegated:FirestoreActor={role:'authenticated',id:setup.approved_by};
   try{
    const purchase=await purchaseState(tx,delegated,company);if(!purchase.aiAllowed||!purchase.setupComplete)continue;const approved=approvalThrough(ctx,5),existing=await tx.get('company_sites',company);
    if(existing?.draft&&existing.profile_version===ctx.version)continue;
    let existingJob=false;for(const status of ['pending','running','completed'])if((await tx.list('company_site_jobs',[{field:'company_id',value:company},{field:'profile_version',value:ctx.version},{field:'status',value:status}],{limit:1})).length)existingJob=true;if(existingJob)continue;
    const digest=hash({company,version:ctx.version,kind:'requested-site'}),id=digest.slice(0,8)+'-'+digest.slice(8,12)+'-4'+digest.slice(13,16)+'-8'+digest.slice(17,20)+'-'+digest.slice(20,32);
    const job=await siteRpc(tx,delegated,'enqueue_company_site',{p_company_id:company,p_id:id,p_revision:existing?.revision??0,p_profile_version:ctx.version,p_feedback:''});
    tx.put('company_site_jobs',id,{...(job as Row),auto_setup_token:approved.token});tx.put('company_site_auto_seeds',key,{company_id:company,profile_version:ctx.version,job_id:id,approval_token:approved.token,created_at:now()});
   }catch(e){if(!['42501','22023','40001','P0402'].includes(String((e as {code?:string}).code)))throw e;}
  }
  const jobs=await queueStates(tx,'company_site_jobs',['pending','running']);
  for(const job of jobs.sort((a,b)=>a.created_at.localeCompare(b.created_at))){
   if(Date.parse(job.next_attempt_at)>Date.now()||job.status==='running'&&Date.parse(job.lease_until)>Date.now())continue;
   if(!await eligible(job)){tx.put('company_site_jobs',job.id,finish(job,'stale','Perfil, permissão ou acesso mudou. Solicite novamente.'));continue;}
   if(job.attempts>=3){tx.put('company_site_jobs',job.id,finish(job,'failed','A geração não foi concluída. Solicite novamente.'));continue;}
   const token=randomUUID(),s=await tx.get('company_sites',job.company_id),p=await tx.get('company_profile_versions',job.company_id+'_'+job.profile_version);
   tx.put('company_site_jobs',job.id,{...job,status:'running',attempts:job.attempts+1,token,lease_until:new Date(Date.now()+300000).toISOString(),updated_at:now()});
   return {id:job.id,companyId:job.company_id,token,kind:'site',facts:p!.facts,previous:s?.draft??null,feedback:job.feedback};
  }return null;
 }
 const id=uuid(args.p_id),job=await tx.get('company_site_jobs',id);if(!job||job.status!=='running'||job.token!==args.p_token||Date.parse(job.lease_until)<=Date.now())return false;
 const delegated=await eligible(job);if(!delegated){tx.put('company_site_jobs',id,finish(job,'stale','Perfil, permissão ou acesso mudou.'));return false;}
 if(args.p_output===null){tx.put('company_site_jobs',id,{...finish(job,job.attempts>=3?'failed':'pending','Não foi possível gerar o site. O rascunho foi preservado.'),next_attempt_at:new Date(Date.now()+30000*2**job.attempts).toISOString()});return false;}
 const saved=await siteRpc(tx,delegated,'save_company_site',{p_company_id:job.company_id,p_revision:job.expected_revision,p_profile_version:job.profile_version,p_content:args.p_output});tx.put('company_site_jobs',id,{...finish(job,'completed',null),result_revision:(saved as Row).revision});return true;
}
