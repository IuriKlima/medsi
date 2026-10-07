import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,uuid,text,fail,audit} from './access';
import {purchaseState} from './commerce';
import {context,stages,approvalThrough,invalidate,now,validCalendar} from './journey-state';
import {approveBrief} from './strategy';
import {queuePreparation} from './preparation';
import {planningPreferencesSchema,proposeCurrentMonthDates} from '../../onboarding/planning';
import {dayInClinic} from './journey-state';

export const journeyOperations=['read_marketing_journey','approve_marketing_stage','finish_company_setup','move_calendar_date','set_traffic_preference','set_planning_preferences'];
export async function journeyRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 const company=uuid(args.p_company_id),access=await companyAccess(tx,actor,company,name==='read_marketing_journey'?'marketing.read':name==='move_calendar_date'?'marketing.write':'strategy.approve');
 const ctx=await context(tx,company),review=stages(ctx);
 if(name==='read_marketing_journey'&&ctx.regional?.progress)review[0]!.data.regional.progress=ctx.regional.progress;
 if(name==='read_marketing_journey')return {profileVersion:ctx.version,confirmed:ctx.confirmed,canApprove:access.actions.includes('strategy.approve'),stages:review,planning:ctx.planning,strategy:ctx.brief?{id:ctx.brief.id,status:ctx.brief.status,profile_version:ctx.version,generation:ctx.brief.generation,created_at:ctx.brief.created_at,output:ctx.brief.output??null}:null};
 if(!ctx.confirmed)fail('40001','Confirme o perfil atual antes de continuar.');
 if(name==='move_calendar_date'){
  const id=uuid(args.p_item),date=z.iso.date().safeParse(args.p_date),item=ctx.items.find(i=>i.id===id);if(!date.success)fail('22023','Data inválida.');
  if(!item||item.revision!==args.p_revision)fail('40001','Atualize o calendário antes de editar.');
  if(item!.planned_date===date.data)return null;
  const next={...item,planned_date:date.data,revision:item!.revision+1,approved_revision:null,approved_by:null,updated_at:now()};
  await invalidate(tx,company,ctx.version,3);tx.put('company_calendar_items',id,next);audit(tx,actor,access.company,'calendar.date.changed',{itemId:id,revision:next.revision});return null;
 }
 if(!(await purchaseState(tx,actor,company)).aiAllowed)fail('P0402','O acesso ao plano expirou.');
 if(name==='set_planning_preferences'){
  const parsed=planningPreferencesSchema.safeParse(args.p_settings);if(!parsed.success)fail('22023','Confira a quantidade e frequência de publicações.');
  try{proposeCurrentMonthDates(dayInClinic().slice(0,7),dayInClinic(),parsed.data!.postsPerMonth,parsed.data!.maxPostsPerWeek);}catch(e){fail('22023',(e as Error).message);}
  if(JSON.stringify(parsed.data)===JSON.stringify(ctx.planning))return null;
  await invalidate(tx,company,ctx.version,2);tx.put('company_planning_preferences',company+'_'+ctx.version,{company_id:company,profile_version:ctx.version,settings:parsed.data,updated_at:now(),changed_by:actor.id});
  if(ctx.brief)tx.put('company_strategy_briefs',ctx.brief.id,{...ctx.brief,status:'superseded',output:null,updated_at:now()});
  audit(tx,actor,access.company,'planning.preferences.changed',parsed.data);return null;
 }
 if(name==='set_traffic_preference'){
  approvalThrough(ctx,4);
  if(!['skipped','planned'].includes(args.p_mode))fail('22023','Escolha se deseja planejar o tráfego ou pular por enquanto.');
  if(args.p_basis!==review[4]!.basis)fail('40001','A proposta mudou. Atualize a versão atual.');
  if(ctx.traffic?.mode===args.p_mode&&(args.p_mode!=='skipped'||review[4]!.approved))return null;
  await invalidate(tx,company,ctx.version,5);
  tx.put('company_traffic_preferences',company+'_'+ctx.version,{company_id:company,profile_version:ctx.version,mode:args.p_mode,changed_by:actor.id,updated_at:now()});
  if(args.p_mode==='skipped'){
   const next=stages(await context(tx,company))[4]!,id=company+'_'+ctx.version+'_5';
   const approval={id,company_id:company,profile_version:ctx.version,stage:5,basis:next.basis,token:randomUUID(),snapshot:{status:'skipped',spendingAuthorized:false},approved_by:actor.id,approved_at:now(),invalidated_at:null};
   tx.put('company_marketing_approvals',id,approval);tx.put('company_marketing_approval_history',approval.token,approval);
  }
  audit(tx,actor,access.company,'traffic.preference.changed',{mode:args.p_mode,profileVersion:ctx.version});return null;
 }
 if(name==='finish_company_setup'){
  approvalThrough(ctx,5);validCalendar(ctx.items,ctx.planning);
  const prior=await tx.get('company_setup',company),bases=review.map(s=>s.basis);
  if(prior&&!prior.invalidated_at&&prior.profile_version===ctx.version&&JSON.stringify(prior.bases)===JSON.stringify(bases))return {...await purchaseState(tx,actor,company),nextPath:'/empresa/'+company+'/preparacao'};
  const row={company_id:company,profile_version:ctx.version,bases,approved_by:actor.id,completed_at:now(),invalidated_at:null};tx.put('company_setup',company,row);audit(tx,actor,access.company,'setup.completed',{profileVersion:ctx.version});return {...await purchaseState(tx,actor,company),nextPath:'/empresa/'+company+'/preparacao'};
 }
 const stage=args.p_stage;
 if(!Number.isInteger(stage)||stage<1||stage>5||typeof args.p_basis!=='string'||!/^[a-f0-9]{32}$/.test(args.p_basis))fail('22023','Etapa inválida.');
 const displayed=review[stage-1]!;if(displayed.basis!==args.p_basis)fail('40001','A proposta mudou. Atualize e revise a versão atual.');
 if(stage>1)approvalThrough(ctx,stage-1);
 if(displayed.approved)return null;
 let snapshot:Row|Row[]|null=displayed.data;
 if(stage===1){
  if(ctx.regional?.status!=='ready'||!ctx.regional.snapshot)fail('22023','Aguarde a pesquisa regional.');
  const note=text(args.p_limitations??'',0,1000),data=ctx.regional!.snapshot;
  if(data.map&&!data.map.selectionConfirmed)fail('22023','Confirme a localização e sua seleção de concorrentes antes de aprovar.');
  const sources:[string,{state:string}|undefined][]=[['IBGE',data.ibge],['Facebook · público estimado',data.facebook],['Google Trends · interesse',data.trends],['Google Trends · em crescimento',data.topics?.google],['Facebook · assuntos',data.topics?.facebook],['X · assuntos recentes',data.topics?.x],['Mapa e concorrentes',data.map]];
  const gaps=[...sources.filter(([,s])=>s?.state!=='available').map(([label])=>label),...ctx.digital.profiles.filter(p=>!p.snapshot).map(p=>'Instagram @'+p.username)];
  if(gaps.length&&!note)fail('22023','Reconheça as fontes indisponíveis antes de aprovar.');
  snapshot={regional:displayed.data.regional,limitations:note,unavailableSources:gaps,digital:ctx.digital,profiles:ctx.digital.profiles};
 }
 if(stage===2)await approveBrief(tx,actor,ctx,ctx.brief?.id,ctx.brief?.generation);
 if(stage===3||stage===5)validCalendar(ctx.items,ctx.planning);
 if(stage===4&&(!displayed.data?.whatsapp?.length||!displayed.data?.messages?.length)||stage===5&&!displayed.data?.length)fail('22023','Aguarde as recomendações antes de aprovar.');
 await invalidate(tx,company,ctx.version,stage);
 const id=company+'_'+ctx.version+'_'+stage;
 const previous=await tx.get('company_marketing_approvals',id);
 if(previous?.token&&!await tx.get('company_marketing_approval_history',previous.token))tx.put('company_marketing_approval_history',previous.token,previous);
 const approval={id,company_id:company,profile_version:ctx.version,stage,basis:displayed.basis,token:randomUUID(),snapshot,approved_by:actor.id,approved_at:now(),invalidated_at:null};
 tx.put('company_marketing_approvals',id,approval);tx.put('company_marketing_approval_history',approval.token,approval);
 audit(tx,actor,access.company,'marketing.stage.approved',{stage,profileVersion:ctx.version,basis:displayed.basis});
 if(stage<=2){
  const updated=await context(tx,company),writer=access.actions.includes('marketing.write')?actor.id:stage===1?ctx.regional?.actor_id:ctx.brief?.requested_by;
  // Approval permission does not grant write permission. A revoked writer cannot generate work.
  if(writer)try{await queuePreparation(tx,updated,stage===1?'strategy':'recommendations',writer);}catch(e){if(!['42501','P0402'].includes((e as {code?:string}).code??''))throw e;}
 }
 return null;
}
