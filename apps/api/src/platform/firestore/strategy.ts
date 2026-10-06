import {randomUUID} from 'node:crypto';
import {strategyOutputSchema} from '@askadia/contracts';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,uuid,text,fail,audit} from './access';
import {purchaseState} from './commerce';
import {providerRpc} from './providers';
import {anchor,context,approvalThrough,invalidate,now,dateAfter,type JourneyContext} from './journey-state';

export const strategyOperations=['prepare_company_strategy','start_company_strategy','finish_company_strategy','edit_company_strategy','approve_company_strategy','strategy_feedback'];
function output(value:unknown){const result=strategyOutputSchema.safeParse(value);if(!result.success||JSON.stringify(value).length>100000)fail('22023','Confira o formato da estratégia.');return result.data!;}
async function history(tx:DocumentTransaction,brief:Row){tx.put('company_strategy_versions',brief.id+'_'+brief.generation,{...brief,saved_at:now()});}
export async function prepare(tx:DocumentTransaction,actor:FirestoreActor,company:string){
 await companyAccess(tx,actor,company,'marketing.write');const ctx=await context(tx,company);if(!ctx.confirmed)fail('22023','Confirme o perfil antes de preparar a estratégia.');
 const index=await anchor(tx,company,ctx.version),prior=await tx.get('company_strategy_briefs',index.brief_id);if(prior)return prior;
 const brief={id:index.brief_id,company_id:company,profile_version:ctx.version,status:'draft',generation:0,facts:ctx.facts,output:null,requested_by:actor.id,request_id:null,competitor_review_token:null,approved_by:null,approved_generation:null,created_at:now(),updated_at:now()};tx.put('company_strategy_briefs',brief.id,brief);return brief;
}
export async function materializeCalendar(tx:DocumentTransaction,ctx:JourneyContext){
 const brief=ctx.brief!;if(!brief?.output)fail('22023','Estratégia indisponível.');
 if(ctx.items.length)return;
 const first=new Date(dateAfter(7)+'T12:00:00Z');first.setUTCDate(first.getUTCDate()+(7-first.getUTCDay()+1)%7);
 // These are editable date proposals, never a publishing schedule or content approval.
 for(const [position,idea] of output(brief.output).calendar.entries()){
  const date=new Date(first);date.setUTCDate(date.getUTCDate()+Math.floor(position/2)*7+(position%2)*2);const id=randomUUID();
  tx.put('company_calendar_items',id,{id,company_id:ctx.company,brief_id:brief.id,profile_version:ctx.version,generation:brief.generation,position,week:idea.week,format:idea.format,idea:idea.theme,direction:idea.brief,needs_client_video:idea.needsClientVideo,planned_date:date.toISOString().slice(0,10),revision:1,status:'idea',details:null,approved_revision:null,approved_by:null,created_at:now(),updated_at:now()});
 }
}
export async function approveBrief(tx:DocumentTransaction,actor:FirestoreActor,ctx:JourneyContext,id:unknown,generation:unknown){
 await companyAccess(tx,actor,ctx.company,'strategy.approve');const first=approvalThrough(ctx,1),brief=ctx.brief;
 if(!brief||brief.id!==id||brief.generation!==generation||!['review','approved'].includes(brief.status)||!brief.output||brief.competitor_review_token!==first.token)fail('40001','Atualize a estratégia antes de aprovar.');
 if(brief!.status!=='approved')tx.put('company_strategy_briefs',brief!.id,{...brief,status:'approved',approved_by:actor.id,approved_generation:generation,approved_at:now(),updated_at:now()});
 await materializeCalendar(tx,ctx);return null;
}
export async function strategyRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 const company=uuid(args.p_company_id);const access=await companyAccess(tx,actor,company,name==='approve_company_strategy'?'strategy.approve':'marketing.write');
 if(name==='prepare_company_strategy')return prepare(tx,actor,company);
 const ctx=await context(tx,company);
 if(name==='approve_company_strategy')return approveBrief(tx,actor,ctx,uuid(args.p_brief_id),args.p_generation);
 if(name==='start_company_strategy'){
  if(!(await purchaseState(tx,actor,company)).aiAllowed)fail('P0402','Ative o plano antes de gerar a estratégia.');
  const first=approvalThrough(ctx,1),request=uuid(args.p_request_id),brief=await prepare(tx,actor,company);
  if(brief.status==='generating'&&Date.parse(brief.updated_at)>Date.now()-300000)fail('40001','A estratégia já está em geração. Aguarde.');
  if(!await providerRpc(tx,actor,'reserve_onboarding_provider',{p_company_id:company,p_request_id:request,p_kind:'strategy'}))fail('40001','Solicitação repetida ou limite diário atingido. Tente novamente mais tarde.');
  await invalidate(tx,company,ctx.version,2);
  const next={...brief,status:'generating',request_id:request,requested_by:actor.id,generation:brief.generation+1,output:null,model:null,response_id:null,feedback:'',competitor_review_token:first.token,approved_by:null,approved_generation:null,created_at:now(),updated_at:now()};tx.put('company_strategy_briefs',brief.id,next);
  audit(tx,actor,access.company,'strategy.started',{briefId:brief.id,generation:next.generation});return {...next,competitorEvidence:first.snapshot};
 }
 const brief=ctx.brief;
 if(!brief)fail('40001','Atualize a estratégia.');
 if(name==='strategy_feedback'){
  if(brief!.request_id!==uuid(args.p_request)||brief!.requested_by!==actor.id||brief!.status!=='generating')fail('40001','Solicitação de estratégia expirada.');
  tx.put('company_strategy_briefs',brief!.id,{...brief,feedback:text(args.p_feedback??'',0,3000)});return null;
 }
 if(name==='finish_company_strategy'){
  const request=uuid(args.p_request_id);
  if(brief!.request_id!==request||brief!.requested_by!==actor.id||brief!.status!=='generating')return {status:'stale'};
  const first=ctx.approvals.find(a=>a.stage===1&&!a.invalidated_at);
  let current=true;try{approvalThrough(ctx,1);}catch{current=false;}
  if(!current||first?.token!==brief!.competitor_review_token||!(await purchaseState(tx,actor,company)).aiAllowed){tx.put('company_strategy_briefs',brief!.id,{...brief,status:'superseded',updated_at:now()});return {status:'stale'};}
  const parsed=args.p_output===null?null:output(args.p_output),model=parsed?text(args.p_model,1,100):null,responseId=parsed&&args.p_response_id?text(args.p_response_id,1,200):null;
  const next={...brief,output:parsed,status:parsed?'review':'failed',model,response_id:responseId,updated_at:now()};tx.put('company_strategy_briefs',brief!.id,next);await history(tx,next);audit(tx,actor,access.company,'strategy.finished',{briefId:brief!.id,generation:brief!.generation,status:next.status});return next;
 }
 if(name==='edit_company_strategy'){
  approvalThrough(ctx,1);if(brief!.id!==uuid(args.p_id)||brief!.generation!==args.p_generation||!['review','approved'].includes(brief!.status))fail('40001','Atualize a estratégia antes de editar.');
  const parsed=output(args.p_output);await invalidate(tx,company,ctx.version,2);
  const next={...brief,status:'review',output:parsed,generation:brief!.generation+1,model:'human-edit',request_id:null,response_id:null,approved_by:null,approved_generation:null,updated_at:now()};tx.put('company_strategy_briefs',brief!.id,next);await history(tx,next);audit(tx,actor,access.company,'strategy.edited',{briefId:brief!.id,generation:next.generation});return next;
 }
 return fail('22023','Invalid strategy operation');
}
