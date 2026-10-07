import {randomUUID} from 'node:crypto';
import type {DocumentTransaction,Row} from './store';
import {server,hash,uuid,type FirestoreActor} from './access';
import {context,approvalThrough,now,dayInClinic} from './journey-state';
import {eligible,due,liveLease,retry,stale} from './regional';
import {contentRpc} from './content';
export const productionOperations=['claim_content_production_server','finish_content_production_server'];
const table='company_content_production_jobs';
/** Seed deterministic units from approved setup. The existing API content worker is
 * the sole executor; retries use fresh content request IDs and never reuse images. */
async function seed(tx:DocumentTransaction){
 for(const setup of await tx.list('company_setup')){
  if(setup.invalidated_at)continue;const company=setup.company_id,ctx=await context(tx,company);let token:string;try{token=approvalThrough(ctx,5).token;}catch{continue;}
  if(!ctx.brief||ctx.brief.status!=='approved'||ctx.version!==setup.profile_version)continue;
  const base={company_id:company,profile_version:ctx.version,actor_id:setup.actor_id??setup.approved_by??ctx.brief.approved_by,brief_id:ctx.brief.id,generation:ctx.brief.generation,approval_token:token};if(!base.actor_id)continue;
  const units:Row[]=ctx.items.some(i=>!i.details)?[{kind:'details',item_id:null,frame:0}]:[];
  const assets=await tx.list('company_creatives',[{field:'company_id',value:company}]);
  for(const item of ctx.items.filter(i=>i.details&&i.format!=='video'))for(let frame=0;frame<(item.format==='carrossel'?item.details.slides.length:1);frame++)if(!assets.some(a=>a.item_id===item.id&&a.revision===item.revision&&a.frame===frame))units.push({kind:'design',item_id:item.id,revision:item.revision,frame});
  for(const unit of units){const id=hash({...base,...unit});if(!await tx.get(table,id))tx.put(table,id,{...base,...unit,id,status:'pending',attempts:0,token:null,lease_until:null,next_attempt_at:now(),created_at:now(),updated_at:now()});}
 }
}
async function valid(tx:DocumentTransaction,job:Row){const access=await eligible(tx,job);if(!access)return null;const setup=await tx.get('company_setup',job.company_id);if(!setup||setup.invalidated_at||setup.profile_version!==job.profile_version)return null;try{if(approvalThrough(access.ctx,5).token!==job.approval_token||access.ctx.brief?.id!==job.brief_id||access.ctx.brief?.generation!==job.generation)return null;}catch{return null;}if(job.kind==='design'&&!access.ctx.items.some(i=>i.id===job.item_id&&i.revision===job.revision))return null;return access;}
export async function productionRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 server(actor);
 if(name==='claim_content_production_server'){
  await seed(tx);const jobs=[...await tx.list(table,[{field:'status',value:'pending'}]),...await tx.list(table,[{field:'status',value:'running'}])];
  for(const job of jobs.filter(due).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.frame-b.frame)){
   const access=await valid(tx,job);if(!access){tx.put(table,job.id,stale(job));continue;}if(job.attempts>=3){tx.put(table,job.id,{...retry(job,'A produção não foi concluída. Retome manualmente.'),status:'failed'});continue;}
   if(job.kind==='design'&&job.frame>0){const cover=(await tx.list('company_creatives',[{field:'company_id',value:job.company_id}])).some(a=>a.item_id===job.item_id&&a.revision===job.revision&&a.frame===0);if(!cover)continue;}
   const attachments=(await tx.list('onboarding_attachments',[{field:'company_id',value:job.company_id}])).filter(a=>['image/png','image/jpeg','image/webp'].includes(a.mime)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));let total=0;const materials:string[]=[];for(const ref of attachments){if(materials.length<5&&total+ref.size<=12582912){materials.push(ref.id);total+=ref.size;}}
   const runId=randomUUID(),token=randomUUID();let snapshot:Row;
   try{snapshot=await contentRpc(tx,access.actor,'start_content_run',{p_company_id:job.company_id,p_request_id:runId,p_kind:job.kind,p_item_id:job.item_id,p_frame:job.frame,p_materials:materials});}catch(e){if((e as {code?:string}).code==='40001')continue;tx.put(table,job.id,{...job,status:'failed',error:'Limite de produção ou materiais inválidos. Revise no calendário.',updated_at:now()});continue;}
   tx.put(table,job.id,{...job,status:'running',attempts:job.attempts+1,run_id:runId,token,lease_until:new Date(Date.now()+300000).toISOString(),error:null,updated_at:now()});return {id:job.id,companyId:job.company_id,token,runId,kind:job.kind,frame:job.frame,today:dayInClinic(),context:snapshot};
  }return null;
 }
 const id=String(args.p_id),job=await tx.get(table,id);if(!liveLease(job,args.p_token))return false;uuid(args.p_token);const access=await valid(tx,job!);if(!access){tx.put(table,id,stale(job!));return false;}
 const result=args.p_result,saved:Row=await contentRpc(tx,access.actor,job!.kind==='details'?'finish_content_details':'finish_content_design',{p_company_id:job!.company_id,p_request_id:job!.run_id,p_items:result?.items??null,p_mime:result?.mime??null,p_model:result?.model??null});
 tx.put(table,id,saved.status==='stale'?stale(job!):saved.status==='completed'?{...job,status:'completed',token:null,lease_until:null,error:null,updated_at:now()}:retry(job!,'O provedor não concluiu a produção. Tente retomar.'));return saved;
}
