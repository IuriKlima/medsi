import {detailedPostSchema} from '@askadia/contracts';
import {z} from 'zod';
import {respectsWeeklyLimit,weekStart} from '../../onboarding/seasonal';
import type {DocumentTransaction,Predicate,Row} from './store';
import {companyAccess,fail,hash,uuid,text,audit,scopedRows,type FirestoreActor} from './access';
import {context,approvalThrough,invalidate,now,dayInClinic,type JourneyContext} from './journey-state';
import {purchaseState} from './commerce';
export const contentOperations=['start_content_run','finish_content_details','finish_content_design','edit_calendar_item','approve_calendar_item','finish_calendar_video','start_calendar_dates','finish_calendar_dates','move_calendar_date'];
const dates=z.iso.date();
const imageTypes:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
function current(ctx:JourneyContext,item?:Row|null){return ctx.confirmed&&ctx.brief?.status==='approved'&&ctx.brief.approved_generation===ctx.brief.generation&&(!item||item.company_id===ctx.company&&item.brief_id===ctx.brief.id&&item.generation===ctx.brief.generation&&item.profile_version===ctx.version);}
function details(value:unknown){const parsed=detailedPostSchema.safeParse(value);if(!parsed.success||JSON.stringify(value).length>24000)fail('22023','Invalid content');return parsed.data!;}
function date(value:unknown){const parsed=dates.safeParse(value);if(!parsed.success||parsed.data<dayInClinic()||Date.parse(parsed.data)>Date.now()+400*86400000)fail('22023','Invalid date');return parsed.data!;}
function history(tx:DocumentTransaction,item:Row,actor:FirestoreActor){tx.put('company_calendar_history',item.id+'_'+item.revision,{...item,item_id:item.id,actor_id:actor.id,saved_at:now()});}
function weekly(ctx:JourneyContext,updates:Row[]){const ids=new Set(updates.map(i=>i.id)),weeks=new Set(updates.filter(i=>i.planned_date).map(i=>weekStart(i.planned_date)));const dates=[...ctx.items.filter(i=>!ids.has(i.id)),...updates].filter(i=>i.planned_date&&weeks.has(weekStart(i.planned_date))).map(i=>i.planned_date);if(!respectsWeeklyLimit(dates,[],ctx.planning.maxPostsPerWeek))fail('22023','Respeite a frequência semanal escolhida.');}
async function media(tx:DocumentTransaction,company:string,path:string,mime:string,size?:number){const object=await tx.get('storage_objects',hash('company-assets/'+path));if(!object||object.company_id!==company||object.status!=='ready'||object.mime!==mime||size!==undefined&&object.size!==size)fail('22023','Stored media required');return object!;}
async function itemFor(tx:DocumentTransaction,ctx:JourneyContext,id:unknown,revision:unknown){const item=await tx.get('company_calendar_items',uuid(id));if(!item||!current(ctx,item)||item.revision!==revision)fail('40001','Content changed');return item!;}
export async function contentRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 const company=uuid(args.p_company_id),access=await companyAccess(tx,actor,company,name==='approve_calendar_item'?'content.approve':'marketing.write'),ctx=await context(tx,company);
 if(name==='start_content_run'||name==='start_calendar_dates'){
  if(!(await purchaseState(tx,actor,company)).aiAllowed)fail('P0402','Ative o plano antes de produzir conteúdo.');
  if(!current(ctx))fail('40001','Approve the current strategy first');
  const isDates=name==='start_calendar_dates',kind=isDates?'dates':args.p_kind,id=uuid(isDates?args.p_id:args.p_request_id),table=isDates?'calendar_date_runs':'company_content_runs';
  if(!['dates','details','design'].includes(kind))fail('22023','Invalid run');
  if(!isDates)approvalThrough(ctx,5);
  if(await tx.get(table,id))fail('40001','Request already used');
  const today=now().slice(0,10),tomorrow=new Date(Date.parse(today+'T00:00:00.000Z')+86400000).toISOString().slice(0,10);
  const daily:Predicate[]=[{field:'kind',value:kind},{field:'created_at',op:'>=',value:today},{field:'created_at',op:'<',value:tomorrow}];
  const companyLimit=kind==='details'?3:kind==='dates'?4:36,actorLimit=kind==='design'?72:kind==='details'?9:12;
  const runs=await tx.list(table,[{field:'company_id',value:company},...daily],{limit:companyLimit,orderBy:'created_at'});
  if(runs.length>=companyLimit)fail('22023','Daily allowance exhausted');
  const actorRuns=await tx.list(table,[{field:'actor_id',value:actor.id},...daily],{limit:actorLimit,orderBy:'created_at'});if(actorRuns.length>=actorLimit)fail('22023','Daily user allowance exhausted');
  let snapshot:Row,frame=0,itemId:string|null=null;
  if(kind==='design'){
   frame=args.p_frame??0;if(!Number.isInteger(frame)||frame<0||frame>5)fail('22023','Invalid frame');
   const item=await tx.get('company_calendar_items',uuid(args.p_item_id));
   if(!item||!current(ctx,item)||!item.details||item.format==='video'||item.format==='imagem'&&frame!==0||item.format==='carrossel'&&frame>=item.details.slides.length)fail('22023','Review content before design');itemId=item!.id;
   const ids=z.array(z.uuid()).max(5).safeParse(args.p_materials??[]);if(!ids.success)fail('22023','Invalid materials');const materials=[];
   for(const id of [...new Set(ids.data!)]){const ref=await tx.get('onboarding_attachments',id);if(!ref||ref.company_id!==company||!imageTypes[ref.mime])fail('42501','Company materials required');await media(tx,company,ref!.object_path,ref!.mime,ref!.size);materials.push(ref);}
   snapshot={facts:ctx.facts,item:item!,materials};
  }else{
   const items=ctx.items.filter(i=>kind==='dates'?!i.planned_date:!i.details);if(!items.length)fail('22023','No pending content');snapshot={facts:ctx.facts,briefId:ctx.brief!.id,generation:ctx.brief!.generation,items};
   if(isDates){const month=dates.safeParse(args.p_month);if(!month.success||!month.data.endsWith('-01')||month.data<dayInClinic().slice(0,7)+'-01'||Date.parse(month.data)>Date.now()+366*86400000)fail('22023','Invalid planning month');snapshot.month=month.data;snapshot.planning=ctx.planning;snapshot.existingDates=ctx.items.filter(i=>i.planned_date).map(i=>i.planned_date);}
  }
  const active:Predicate[]=[{field:'company_id',value:company},{field:'kind',value:kind},{field:'status',value:'running'},{field:'lease_until',op:'>',value:now()},...(kind==='design'?[{field:'item_id',value:itemId},{field:'frame',value:frame}]:[])];
  if((await tx.list(table,active,{limit:1,orderBy:'lease_until'})).length)fail('40001','Generation running');
  tx.put(table,id,{id,company_id:company,actor_id:actor.id,kind,item_id:itemId,frame,snapshot,profile_version:ctx.version,approval_token:kind==='dates'?null:approvalThrough(ctx,5).token,status:'running',lease_until:new Date(Date.now()+300000).toISOString(),created_at:now(),updated_at:now()});return snapshot;
 }
 if(name.startsWith('finish_content_')||name==='finish_calendar_dates'){
  const isDates=name==='finish_calendar_dates',table=isDates?'calendar_date_runs':'company_content_runs',id=uuid(isDates?args.p_id:args.p_request_id),run=await tx.get(table,id),kind=isDates?'dates':name==='finish_content_details'?'details':'design';
  if(!run||run.company_id!==company||run.actor_id!==actor.id||run.kind!==kind)fail('42501','Run unavailable');
  if(run!.status!=='running')return {status:run!.status};
  let valid=current(ctx)&&(!isDates||hash(run!.snapshot.planning)===hash(ctx.planning))&&run!.profile_version===ctx.version&&Date.parse(run!.lease_until)>Date.now();if(!isDates){try{valid=valid&&approvalThrough(ctx,5).token===run!.approval_token;}catch{valid=false;}}
  const finish=(status:string)=>{tx.put(table,id,{...run,status,model:status==='completed'&&!isDates?text(args.p_model,1,100):null,lease_until:null,updated_at:now()});return {status};};if(!valid)return finish('stale');
  const value=isDates?args.p_dates:kind==='details'?args.p_items:args.p_mime;if(value===null)return finish('failed');
  if(kind==='design'){
   const item=await tx.get('company_calendar_items',run!.item_id);if(!item||!current(ctx,item)||item.revision!==run!.snapshot.item.revision)return finish('stale');
   const ext=imageTypes[args.p_mime];if(!ext)fail('22023','Invalid image');const path=company+'/generated/'+id+'.'+ext;await media(tx,company,path,args.p_mime);
   tx.put('company_creatives',id,{id,company_id:company,item_id:item!.id,revision:item!.revision,frame:run!.frame,mime:args.p_mime,object_path:path,model:text(args.p_model,1,100),created_at:now()});tx.put('company_calendar_items',item!.id,{...item,status:'draft',approved_revision:null,approved_by:null,updated_at:now()});return finish('completed');
  }
  const schema=isDates?z.array(z.object({id:z.uuid(),date:dates}).strict()):z.array(z.object({id:z.uuid(),details:detailedPostSchema}).strict());const parsed=schema.safeParse(value);
  if(!parsed.success||JSON.stringify(value).length>200000||parsed.data.length!==run!.snapshot.items.length||new Set(parsed.data.map(x=>x.id)).size!==parsed.data.length)fail('22023','Invalid output');
  const updates:Row[]=[];
  for(const entry of parsed.data!){const expected=run!.snapshot.items.find((x:Row)=>x.id===entry.id);if(!expected)fail('22023','Unexpected content');const item=await tx.get('company_calendar_items',entry.id);if(!item||!current(ctx,item)||item.revision!==expected.revision||isDates&&item.planned_date)return finish('stale');
   if('date'in entry){const planned=date(entry.date);if(planned.slice(0,7)!==run!.snapshot.month.slice(0,7))fail('22023','Invalid month');updates.push({...item,planned_date:planned,revision:item!.revision+1,status:item!.details?'draft':'idea',approved_revision:null,approved_by:null});}else updates.push({...item,details:details(entry.details),revision:item!.revision+1,status:'draft',approved_revision:null,approved_by:null});
  }
  if(isDates)weekly(ctx,updates);
  for(const item of updates){tx.put('company_calendar_items',item.id,{...item,updated_at:now()});history(tx,item,actor);}if(isDates)await invalidate(tx,company,ctx.version,3);return finish('completed');
 }
 const item=await itemFor(tx,ctx,args.p_id??args.p_item,args.p_revision);
 if(name==='edit_calendar_item'||name==='move_calendar_date'){
  const next={...item,planned_date:args.p_date===null&&name==='edit_calendar_item'?null:date(args.p_date),revision:item.revision+1,status:item.details?'draft':'idea',approved_revision:null,approved_by:null,updated_at:now(),...(name==='edit_calendar_item'?{details:details(args.p_details),status:'draft'}:{})};if(next.planned_date)weekly(ctx,[next]);history(tx,item,actor);history(tx,next,actor);tx.put('company_calendar_items',item.id,next);await invalidate(tx,company,ctx.version,3);return next;
 }
 if(name==='finish_calendar_video'){
  if(item.format!=='video'||!item.details)fail('22023','Review video content');const id=uuid(args.p_upload),path=company+'/final-video/'+id+'.mp4';if(!Number.isInteger(args.p_size)||args.p_size<12||args.p_size>52428800)fail('22023','Invalid video');await media(tx,company,path,'video/mp4',args.p_size);
  const prior=await tx.get('company_final_videos',id);if(prior){if(prior.company_id!==company||prior.item_id!==item.id||prior.revision!==item.revision)fail('40001','Upload changed');return prior;}
  const row={id,company_id:company,item_id:item.id,revision:item.revision,object_path:path,size:args.p_size,name:text(args.p_name,1,150),created_by:actor.id,created_at:now()};tx.put('company_final_videos',id,row);tx.put('company_calendar_items',item.id,{...item,status:'draft',approved_revision:null,approved_by:null});return row;
 }
 if(name==='approve_calendar_item'){
  if(!item.details)fail('22023','Review content first');const creatives=await scopedRows(tx,'company_creatives',[{field:'company_id',value:company},{field:'item_id',value:item.id},{field:'revision',value:item.revision}]);
  const videos=await scopedRows(tx,'company_final_videos',[{field:'company_id',value:company},{field:'item_id',value:item.id},{field:'revision',value:item.revision}]);
  if(item.format==='video'){if(!videos.length)fail('22023','Final video required');}
  else {const count=item.format==='carrossel'?Math.max(2,item.details.slides.length):1;for(let frame=0;frame<count;frame++)if(!creatives.some(r=>r.frame===frame))fail('22023','Final creative required');}
  history(tx,item,actor);const next={...item,status:'approved',approved_revision:item.revision,approved_by:actor.id,approved_at:now()};tx.put('company_calendar_items',item.id,next);tx.put('company_calendar_approvals',item.id+'_'+item.revision+'_'+hash([...creatives,...videos].map(r=>r.id).sort()).slice(0,16),{...next,assets:[...creatives,...videos].map(r=>r.id),approval_actor_id:actor.id});history(tx,next,actor);audit(tx,actor,access.company,'calendar.approved',{itemId:item.id,revision:item.revision});return next;
 }
 return fail('22023','Invalid content operation');
}
