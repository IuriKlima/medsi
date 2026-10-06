import {randomUUID} from 'node:crypto';
import type {DocumentTransaction,Row} from './store';
import {fail,hash} from './access';

export const now=()=>new Date().toISOString();
export const scoped=(company:string)=>[{field:'company_id',value:company}];
export const confirmed=(state:Row|null)=>Boolean(state&&state.profile_version>0&&state.confirmed_revision===state.revision);
export const dayInClinic=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function dateAfter(days:number){return new Date(Date.parse(dayInClinic()+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);}

/** The per-profile anchor serializes creation, including an initially empty query. */
export async function anchor(tx:DocumentTransaction,company:string,version:number){
 const key=company+'_'+version;let row=await tx.get('company_journey_state',key);
 if(!row){row={company_id:company,profile_version:version,brief_id:randomUUID(),regional_id:randomUUID(),content_id:randomUUID(),recommendations_id:randomUUID()};tx.put('company_journey_state',key,row);}return row;
}
export async function context(tx:DocumentTransaction,company:string){
 const state=await tx.get('company_onboarding',company),version=state?.profile_version??0;
 const [profile,index,approvals]=await Promise.all([tx.get('company_profile_versions',company+'_'+version),tx.get('company_journey_state',company+'_'+version),tx.list('company_marketing_approvals',scoped(company))]);
 const get=(table:string,id:unknown)=>typeof id==='string'?tx.get(table,id):Promise.resolve(null);
 const [brief,regional,content,recommendations,items]=await Promise.all([get('company_strategy_briefs',index?.brief_id),get('company_regional_research',index?.regional_id),get('company_content_preparations',index?.content_id),get('company_launch_jobs',index?.recommendations_id),tx.list('company_calendar_items',scoped(company))]);
 return {company,state,version,facts:profile?.facts??{},confirmed:confirmed(state)&&Boolean(profile),index,brief,regional,content,recommendations,approvals:approvals.filter(a=>a.profile_version===version),items:items.filter(i=>brief&&i.brief_id===brief.id&&i.generation===brief.generation).sort((a,b)=>a.position-b.position)};
}
export type JourneyContext=Awaited<ReturnType<typeof context>>;
export function stages(ctx:JourneyContext){
 const result:Row[]=[],previous:{stage:number;token:string|null}[]=[];
 const regional=ctx.regional?{id:ctx.regional.id,status:ctx.regional.status,revision:ctx.regional.revision,profileVersion:ctx.version,data:ctx.regional.snapshot??null,error:ctx.regional.error??null}:{status:'pending',revision:0,profileVersion:ctx.version,data:null,error:null};
 const first=ctx.approvals.find(a=>a.stage===1&&!a.invalidated_at);
 const second=ctx.approvals.find(a=>a.stage===2&&!a.invalidated_at);
 const rec=ctx.recommendations;
 const recommendations=rec?.status==='completed'&&rec.brief_id===ctx.brief?.id&&rec.generation===ctx.brief?.generation&&rec.approval_token===second?.token?rec.output:null;
 const data=[{regional},ctx.brief?{id:ctx.brief.id,generation:ctx.brief.generation,output:ctx.brief.output??null,analysisCurrent:Boolean(first&&ctx.brief.competitor_review_token===first.token)}:null,ctx.items.map(i=>({id:i.id,date:i.planned_date??null,idea:i.idea,direction:i.direction,format:i.format})),recommendations?{whatsapp:recommendations.whatsapp,messages:recommendations.messages}:null,recommendations?.traffic??null];
 for(let stage=1;stage<=5;stage++){
  // The HTTP contract uses 32 hex characters. Native approvals use a canonical SHA-256 prefix.
  const basis=hash({profileVersion:ctx.version,stage,previous,data:data[stage-1]}).slice(0,32);
  const approval=ctx.approvals.find(a=>a.stage===stage&&!a.invalidated_at&&a.basis===basis);
  const approved=ctx.confirmed&&result.every(s=>s.approved)&&Boolean(approval);
  result.push({stage,basis,approved,approvedAt:approved?approval!.approved_at:null,data:data[stage-1]});previous.push({stage,token:approved?approval!.token:null});
 }return result;
}
export function approvalThrough(ctx:JourneyContext,n:number){const review=stages(ctx);if(!ctx.confirmed||!review.slice(0,n).every(s=>s.approved))fail('40001','Revise e aprove a versão atual das etapas anteriores.');return ctx.approvals.find(a=>a.stage===n&&!a.invalidated_at)!;}
export async function invalidate(tx:DocumentTransaction,company:string,version:number,from:number){
 for(const row of await tx.list('company_marketing_approvals',scoped(company)))if(row.profile_version===version&&row.stage>=from&&!row.invalidated_at)tx.put('company_marketing_approvals',row.id,{...row,invalidated_at:now()});
 const setup=await tx.get('company_setup',company);if(setup)tx.put('company_setup',company,{...setup,invalidated_at:now()});
}
export function validCalendar(items:Row[]){
 if(!items.length)fail('22023','O calendário ainda não está pronto.');
 const weeks=new Map<string,number>();
 for(const item of items){const value=item.planned_date;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value||value<dateAfter(7))fail('22023','Revise as datas: use pelo menos sete dias de antecedência.');
  const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));const week=date.toISOString().slice(0,10);weeks.set(week,(weeks.get(week)??0)+1);
 }
 if([...weeks.values()].some(n=>n>2))fail('22023','Use no máximo duas publicações por semana.');
}
