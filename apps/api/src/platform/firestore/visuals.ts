import {randomUUID} from 'node:crypto';
import {visualJobRequest} from '@askadia/contracts';
import type {DocumentTransaction,Row} from './store';
import {companyAccess,server,uuid,fail,hash,text,audit,type FirestoreActor} from './access';
import {context,approvalThrough,now} from './journey-state';
import {eligible,due,liveLease,retry,stale} from './regional';
import {purchaseState} from './commerce';
export const visualOperations=['enqueue_visual_job','enqueue_brand_logo','claim_visual_job_server','finish_visual_job_server'];
const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
async function references(tx:DocumentTransaction,company:string,ids:string[]){const refs=[];for(const id of ids){const ref=await tx.get('onboarding_attachments',uuid(id));const object=ref?await tx.get('storage_objects',hash('company-assets/'+ref.object_path)):null;if(!ref||ref.company_id!==company||!extensions[ref.mime]||object?.status!=='ready'||object.company_id!==company||object.mime!==ref.mime||object.size!==ref.size)fail('42501','Company image required');refs.push({id,name:ref!.name,mime:ref!.mime,path:ref!.object_path});}return refs;}
async function matching(tx:DocumentTransaction,job:Row){const access=await eligible(tx,job);if(!access)return null;
 if(job.auto_setup_token){const setup=await tx.get('company_setup',job.company_id);try{if(!setup||setup.invalidated_at||setup.profile_version!==job.profile_version||approvalThrough(access.ctx,5).token!==job.auto_setup_token)return null;}catch{return null;}}
 if(job.kind==='campaign_creative'){if(access.ctx.traffic?.mode==='skipped')return null;let approved;try{approved=approvalThrough(access.ctx,5);}catch{return null;}const plan=await tx.get('company_paid_plans',job.plan_id);if(!plan||plan.company_id!==job.company_id||plan.profile_version!==job.profile_version||plan.status!=='ready'||hash(plan.output)!==job.plan_hash||approved.token!==job.approval_token)return null;return {...access,campaign:plan.output.campaigns[job.campaign_index]};}return {...access,campaign:null};}
export async function visualRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 if(name==='enqueue_visual_job'||name==='enqueue_brand_logo'){
  const company=uuid(args.p_company_id);await companyAccess(tx,actor,company,'marketing.write');const ctx=await context(tx,company);if(!ctx.confirmed)fail('22023','Confirm profile first');if(!(await purchaseState(tx,actor,company)).aiAllowed)fail('P0402','Ative o plano antes de gerar imagens.');
  const logo=name==='enqueue_brand_logo';let request:Row;
  if(logo){request={id:uuid(args.p_id??args.p_request_id),kind:'brand_logo',instructions:text(args.p_instructions??'',0,2000),ratio:'1:1',references:[],sourceId:null,planId:null,campaignIndex:null};if(ctx.facts.name?.status!=='provided'||ctx.facts.logoPreference?.status!=='provided'||ctx.facts.logoPreference?.value!=='create')fail('22023','Logo generation must be requested in the confirmed profile');}
  else {const parsed=visualJobRequest.safeParse(args.p_data);if(!parsed.success)fail('22023','Invalid visual request');request=parsed.data!;}
  const prior=await tx.get('company_visual_jobs',request.id);if(prior){if(prior.company_id!==company||prior.actor_id!==actor.id||hash(prior.request)!==hash(request))fail('40001','Request changed');return prior.id;}
  const jobs=await tx.list('company_visual_jobs',[{field:'company_id',value:company}]);if(jobs.filter(j=>Date.parse(j.created_at)>Date.now()-86400000).length>=30)fail('22023','Daily allowance exhausted');
  const ids=[...new Set([...(request.sourceId?[request.sourceId]:[]),...request.references])];await references(tx,company,ids);
  let plan:Row|null=null,token:string|null=null;if(request.kind==='campaign_creative'){if(ctx.traffic?.mode==='skipped')fail('40001','Traffic was skipped');token=approvalThrough(ctx,5).token;plan=await tx.get('company_paid_plans',request.planId);if(!plan||plan.company_id!==company||plan.profile_version!==ctx.version||plan.status!=='ready'||!plan.output?.campaigns?.[request.campaignIndex])fail('22023','Current campaign required');}
  tx.put('company_visual_jobs',request.id,{id:request.id,company_id:company,actor_id:actor.id,profile_version:ctx.version,kind:request.kind,source_attachment_id:request.sourceId,plan_id:request.planId,campaign_index:request.campaignIndex,instructions:request.instructions,ratio:request.ratio,reference_ids:ids,request,plan_hash:plan?hash(plan.output):null,approval_token:token,status:'pending',attempts:0,token:null,lease_until:null,next_attempt_at:now(),result_attachment_id:null,error:null,created_at:now(),updated_at:now()});return request.id;
 }
 server(actor);
 if(name==='claim_visual_job_server'){
  for(const setup of await tx.list('company_setup')){
   if(setup.invalidated_at)continue;const ctx=await context(tx,setup.company_id);if(!ctx.confirmed||ctx.version!==setup.profile_version||ctx.facts.logoPreference?.status!=='provided'||ctx.facts.logoPreference?.value!=='create')continue;
   let approval;try{approval=approvalThrough(ctx,5);}catch{continue;}const prior=await tx.list('company_visual_jobs',[{field:'company_id',value:setup.company_id}]);if(prior.some(job=>job.kind==='brand_logo'&&job.profile_version===ctx.version))continue;
   const id=randomUUID();try{await visualRpc(tx,{role:'authenticated',id:setup.approved_by},'enqueue_brand_logo',{p_company_id:setup.company_id,p_id:id,p_instructions:ctx.facts.brand?.status==='provided'?ctx.facts.brand.value.slice(0,2000):''});const job=await tx.get('company_visual_jobs',id);tx.put('company_visual_jobs',id,{...job,auto_setup_token:approval.token});}catch(e){if(!['42501','22023','40001','P0402'].includes(String((e as {code?:string}).code)))throw e;}
  }
  for(const plan of await tx.list('company_paid_plans',[{field:'status',value:'ready'}])){
   const ctx=await context(tx,plan.company_id);if(ctx.version!==plan.profile_version||ctx.traffic?.mode==='skipped')continue;try{approvalThrough(ctx,5);}catch{continue;}
   const existing=await tx.list('company_visual_jobs',[{field:'company_id',value:plan.company_id}]);
   for(const [index,campaign] of (plan.output?.campaigns??[]).entries())if(!existing.some(j=>j.plan_id===plan.id&&j.campaign_index===index)){
    const refs=(await tx.list('onboarding_attachments',[{field:'company_id',value:plan.company_id}])).filter(a=>extensions[a.mime]&&!existing.some(j=>j.result_attachment_id===a.id)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,5).map(a=>a.id);
    try{await visualRpc(tx,{role:'authenticated',id:plan.actor_id},'enqueue_visual_job',{p_company_id:plan.company_id,p_data:{id:randomUUID(),kind:'campaign_creative',sourceId:null,planId:plan.id,campaignIndex:index,instructions:'',ratio:campaign.provider==='meta'?'4:5':'16:9',references:refs}});}catch(e){if(!['42501','22023','40001','P0402'].includes(String((e as {code?:string}).code)))throw e;}
   }
  }
  const jobs=[...await tx.list('company_visual_jobs',[{field:'status',value:'pending'}]),...await tx.list('company_visual_jobs',[{field:'status',value:'running'}])];
  for(const job of jobs.filter(due).sort((a,b)=>a.created_at.localeCompare(b.created_at))){const access=await matching(tx,job);if(!access){tx.put('company_visual_jobs',job.id,stale(job));continue;}if(job.attempts>=3){tx.put('company_visual_jobs',job.id,{...retry(job,'Limite de tentativas atingido.'),status:'failed'});continue;}
   const attempts=await tx.list('company_visual_attempts',[{field:'company_id',value:job.company_id}]);if(attempts.filter(a=>Date.parse(a.created_at)>Date.now()-86400000).length>=36){tx.put('company_visual_jobs',job.id,{...retry(job,'Limite diário de geração atingido.'),status:'failed'});continue;}
   let refs;try{refs=await references(tx,job.company_id,job.reference_ids);}catch{tx.put('company_visual_jobs',job.id,{...job,status:'failed',error:'Material indisponível.',updated_at:now()});continue;}
   const token=randomUUID(),attempt=randomUUID();tx.put('company_visual_attempts',attempt,{id:attempt,company_id:job.company_id,actor_id:job.actor_id,created_at:now()});tx.put('company_visual_jobs',job.id,{...job,status:'running',token,attempts:job.attempts+1,lease_until:new Date(Date.now()+300000).toISOString(),error:null,updated_at:now()});return {id:job.id,companyId:job.company_id,token,request:{kind:job.kind,ratio:job.ratio,instructions:job.instructions,facts:access.ctx.facts,campaign:access.campaign},references:refs};
  }return null;
 }
 const id=uuid(args.p_id),job=await tx.get('company_visual_jobs',id);if(!liveLease(job,args.p_token))return false;const access=await matching(tx,job!);if(!access){tx.put('company_visual_jobs',id,stale(job!));return false;}
 if(args.p_result===null){tx.put('company_visual_jobs',id,retry(job!,'O provedor não concluiu a imagem. O original foi preservado.'));return true;}
 const result=args.p_result,asset=uuid(result?.attachmentId),ext=extensions[result?.mime];if(!ext||!Number.isInteger(result.size)||result.size<1||result.size>10485760)fail('22023','Invalid image');const path=job!.company_id+'/onboarding/'+asset+'.'+ext,object=await tx.get('storage_objects',hash('company-assets/'+path));
 if(!object||object.company_id!==job!.company_id||object.status!=='ready'||object.mime!==result.mime||object.size!==result.size)fail('22023','Stored image required');if(await tx.get('onboarding_attachments',asset))fail('23505','Attachment already used');
 tx.put('onboarding_attachments',asset,{id:asset,company_id:job!.company_id,name:job!.kind==='brand_logo'?'Proposta de logo':job!.kind==='site_image'?'Foto editada':'Criativo da campanha',mime:result.mime,size:result.size,object_path:path,uploaded_by:job!.actor_id,created_at:now()});
 tx.put('company_visual_jobs',id,{...job,status:'completed',token:null,lease_until:null,result_attachment_id:asset,model:text(result.model,1,100),provider_usage:result.usage??null,image_quality:result.quality??null,image_size:result.dimensions??null,error:null,updated_at:now()});audit(tx,access.actor,(await companyAccess(tx,access.actor,job!.company_id)).company,'visual.completed',{jobId:id,attachmentId:asset,kind:job!.kind});return true;
}
