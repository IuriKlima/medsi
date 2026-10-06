import {randomUUID} from 'node:crypto';
import {launchRecommendationsSchema} from '@askadia/contracts';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,server,uuid,fail} from './access';
import {purchaseState} from './commerce';
import {providerRpc} from './providers';
import {strategyRpc} from './strategy';
import {anchor,context,approvalThrough,now,dayInClinic,type JourneyContext} from './journey-state';
import {eligible,due,liveLease,retry,stale} from './regional';

export const preparationOperations=['enqueue_content_preparation','claim_content_preparation_server','finish_content_preparation_server','enqueue_company_launch','claim_company_launch_server','finish_company_launch_server'];
export async function queuePreparation(tx:DocumentTransaction,ctx:JourneyContext,kind:'strategy'|'recommendations',actorId:string){
 const actor:FirestoreActor={role:'authenticated',id:actorId};await companyAccess(tx,actor,ctx.company,'marketing.write');
 if(!(await purchaseState(tx,actor,ctx.company)).aiAllowed)fail('P0402','Ative o plano antes de gerar propostas.');
 const approved=approvalThrough(ctx,kind==='strategy'?1:2),index=await anchor(tx,ctx.company,ctx.version),table=kind==='strategy'?'company_content_preparations':'company_launch_jobs',id=kind==='strategy'?index.content_id:index.recommendations_id,prior=await tx.get(table,id);
 const hasStrategy=kind==='strategy'&&ctx.brief?.output&&ctx.brief.competitor_review_token===approved.token;
 if(prior&&prior.approval_token===approved.token&&prior.generation===(ctx.brief?.generation??0)&&['pending','running','completed'].includes(prior.status))return prior;
 const row={id,company_id:ctx.company,profile_version:ctx.version,kind,actor_id:actorId,brief_id:ctx.brief?.id??null,generation:ctx.brief?.generation??0,approval_token:approved.token,status:hasStrategy?'completed':'pending',stage:hasStrategy?'strategy_review':'strategy',output:null,error:null,attempts:0,token:null,lease_until:null,run_id:null,next_attempt_at:now(),created_at:prior?.created_at??now(),updated_at:now()};tx.put(table,id,row);return row;
}
function matching(ctx:JourneyContext,job:Row,kind:string){try{const approved=approvalThrough(ctx,kind==='strategy'?1:2);return approved.token===job.approval_token&&(kind==='strategy'||ctx.brief?.id===job.brief_id&&ctx.brief?.generation===job.generation);}catch{return false;}}
export async function preparationRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 const kind=name.includes('content_preparation')?'strategy':'recommendations',table=kind==='strategy'?'company_content_preparations':'company_launch_jobs';
 if(name.startsWith('enqueue_')){
  const company=uuid(args.p_company_id);await companyAccess(tx,actor,company,'marketing.write');const ctx=await context(tx,company);
  // Resuming before stage 2 may queue the diagnosis, but never recommendations prematurely.
  if(kind==='recommendations'&&!ctx.approvals.some(a=>a.stage===2&&!a.invalidated_at))return null;
  return queuePreparation(tx,ctx,kind,actor.id!);
 }
 server(actor);
 if(name.startsWith('claim_')){
  const jobs=[...await tx.list(table,[{field:'status',value:'pending'}]),...await tx.list(table,[{field:'status',value:'running'}])];
  for(const job of jobs.filter(due).sort((a,b)=>a.created_at.localeCompare(b.created_at))){
   if(job.kind!==kind)continue;
   const access=await eligible(tx,job);if(!access||!matching(access.ctx,job,kind)){tx.put(table,job.id,stale(job));continue;}
   if(job.attempts>=3){tx.put(table,job.id,{...retry(job,'A geração não foi concluída. Retome a preparação.'),status:'failed'});continue;}
   const token=randomUUID(),runId=randomUUID();
   if(kind==='strategy'){
    const ctx=access.ctx;
    if(ctx.brief?.output&&ctx.brief.competitor_review_token===job.approval_token){tx.put(table,job.id,{...job,status:'completed',stage:'strategy_review',token:null,lease_until:null,updated_at:now()});continue;}
    // A manual request has the same lock and quota as the worker. Never overwrite its result.
    if(ctx.brief?.status==='generating'&&Date.parse(ctx.brief.updated_at)>Date.now()-300000)continue;
    let started:Row;
    try{const result=await strategyRpc(tx,access.actor,'start_company_strategy',{p_company_id:job.company_id,p_request_id:runId});if(!result)fail('40001','Strategy request unavailable');started=result!;}catch(e){if((e as {code?:string}).code!=='40001')throw e;tx.put(table,job.id,{...job,status:'failed',error:'Limite de geração atingido. Tente novamente mais tarde.',updated_at:now()});continue;}
    tx.put(table,job.id,{...job,status:'running',token,run_id:runId,generation:started.generation,brief_id:started.id,lease_until:new Date(Date.now()+300000).toISOString(),attempts:job.attempts+1,error:null,updated_at:now()});
    return {id:job.id,companyId:job.company_id,token,runId,kind:'strategy',frame:0,today:dayInClinic(),context:{facts:started.facts,competitorEvidence:started.competitorEvidence,items:[],item:null}};
   }
   tx.put(table,job.id,{...job,status:'running',token,lease_until:new Date(Date.now()+300000).toISOString(),attempts:job.attempts+1,error:null,updated_at:now()});
   return {id:job.id,companyId:job.company_id,token,kind:'recommendations',facts:access.ctx.facts,strategy:access.ctx.brief!.output};
  }return null;
 }
 const id=uuid(args.p_id),job=await tx.get(table,id);if(!liveLease(job,args.p_token))return false;
 const access=await eligible(tx,job!);if(!access||!matching(access.ctx,job!,kind)){tx.put(table,id,stale(job!));return false;}
 if(kind==='strategy'){
  const result=args.p_result;
  if(result!==null&&(typeof result!=='object'||!result||!('output' in result)))fail('22023','Invalid strategy result');
  const saved=await strategyRpc(tx,access.actor,'finish_company_strategy',{p_company_id:job!.company_id,p_request_id:job!.run_id,p_output:result?.output??null,p_model:result?.model??null,p_response_id:result?.responseId??null});
  await providerRpc(tx,access.actor,'finish_onboarding_provider',{p_company_id:job!.company_id,p_request_id:job!.run_id,p_kind:'strategy',p_outcome:result?'completed':'failed',p_usage:result?.usage??null});
  tx.put(table,id,saved?.status==='stale'?stale(job!):result?{...job,status:'completed',stage:'strategy_review',token:null,lease_until:null,error:null,updated_at:now()}:retry(job!,'A proposta não foi gerada. Tente retomar.'));return saved;
 }
 if(args.p_output===null){tx.put(table,id,retry(job!,'As recomendações não foram geradas. Tente retomar.'));return false;}
 const parsed=launchRecommendationsSchema.safeParse(args.p_output);if(!parsed.success||JSON.stringify(args.p_output).length>100000)fail('22023','Invalid recommendations');
 tx.put(table,id,{...job,status:'completed',output:parsed.data,token:null,lease_until:null,error:null,updated_at:now()});return true;
}
