import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {instagramUsername,instagramSnapshotSchema} from '@askadia/contracts';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,server,uuid,text,hash,fail,audit} from './access';
import {context,invalidate,now,scoped,digitalResearchCurrent} from './journey-state';
import {eligible,liveLease,due,retry,stale} from './regional';
import {channelRpc} from './channels';
import {providerRpc} from './providers';
import {purchaseState} from './commerce';
export const digitalOperations=['request_competitor_research','save_instagram_watch','select_competitor_instagram','retry_competitor_research','claim_instagram_watch_server','finish_instagram_watch_server','claim_competitor_research_server','finish_competitor_research_server'];
const after=(ms:number)=>new Date(Date.now()+ms).toISOString();
const handle=(value:unknown)=>{try{return instagramUsername(text(value,1,2000));}catch{return fail('22023','Invalid Instagram profile');}};
const candidate=z.object({username:z.string(),name:z.string().max(160),url:z.string(),context:z.string().max(300)}).strict();
async function authorization(tx:DocumentTransaction,job:Row){
 try{const actor:FirestoreActor={role:'authenticated',id:job.actor_id};await companyAccess(tx,actor,job.company_id,'marketing.write');if(!(await purchaseState(tx,actor,job.company_id)).aiAllowed)return null;if(job.place_id){const ctx=await context(tx,job.company_id),research=(await tx.list('company_competitor_research',scoped(job.company_id))).find(r=>r.place_id===job.place_id);if(!ctx.confirmed||!research||!digitalResearchCurrent(ctx,research)||research.selected_username!==job.username)return null;}const channel=await channelRpc(tx,{role:'service_role',id:null},'read_company_meta_server',{p_company_id:job.company_id,p_actor:job.actor_id,p_action:'marketing.write'});return typeof channel==='object'?channel:null;}catch(e){if((e as Row).code==='42501')return null;throw e;}
}
const channelValid=(channel:Row|null)=>Boolean(channel&&/^\d+$/.test(channel.metadata?.instagramId??'')&&channel.metadata?.scopes?.includes('instagram_basic')&&channel.metadata?.scopes?.includes('pages_read_engagement'));
export async function digitalRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 if(['request_competitor_research','save_instagram_watch','select_competitor_instagram','retry_competitor_research'].includes(name)){
  const company=uuid(args.p_company_id),access=await companyAccess(tx,actor,company,'marketing.write'),ctx=await context(tx,company);
  if(args.p_remove!==undefined&&typeof args.p_remove!=='boolean')fail('22023','Invalid removal');
  if(name==='request_competitor_research'){
   const place=text(args.p_place_id,1,200),id=hash({company,place}),prior=await tx.get('company_competitor_research',id),map=ctx.regional?.snapshot?.map;
   const places=prior?.origin==='user_confirmed_places_selection'&&ctx.state?.location_confirmed&&String(ctx.facts.competitorPlaceIds?.value??'').split('\n').includes(place)&&prior.city===ctx.facts.city?.value;
   const selected=places?{name:prior!.label}:map?.selectionConfirmed?[...map.competitors,...(map.reviewCandidates??[])].find((c:Row)=>c.id===place&&map.selectedIds.includes(place)):null;
   if(!ctx.confirmed||!selected)fail('40001','Confirme os concorrentes da pesquisa atual.');
   if(!(await eligible(tx,{company_id:company,actor_id:actor.id,profile_version:ctx.version})))fail('P0402','Perfil e plano ativos são necessários.');
   if(prior&&prior.status!=='selected'&&digitalResearchCurrent(ctx,prior))return prior;
   if(prior){for(const w of await tx.list('company_instagram_watches',scoped(company)))if(w.place_id===place)tx.remove('company_instagram_watches',w.id);await invalidate(tx,company,ctx.version,1);}
   const row={id,company_id:company,actor_id:actor.id,profile_version:ctx.version,regional_revision:places?null:ctx.regional!.revision,origin:places?'user_confirmed_places_selection':'regional_map_selection',label_source:places?'user_confirmed':'selected_map_label',place_id:place,label:selected.name,city:ctx.facts.city.value,status:'pending',candidates:[],selected_username:null,attempts:0,token:null,lease_until:null,next_attempt_at:now(),error:null,collected_at:null,confirmed_at:now(),created_at:prior?.created_at??now()};tx.put('company_competitor_research',id,row);audit(tx,actor,access.company,'digital.research.opted_in',{placeId:place});return row;
  }
  const research=name==='save_instagram_watch'?null:(await tx.list('company_competitor_research',scoped(company))).find(r=>r.place_id===args.p_place_id&&r.status!=='stale');
  if(name!=='save_instagram_watch'&&(!research||!digitalResearchCurrent(ctx,research)))fail('40001','Review current competitor first');
  if(name==='retry_competitor_research'){if(['ready','failed'].includes(research!.status))tx.put('company_competitor_research',research!.id,{...research,status:'pending',attempts:0,next_attempt_at:now(),error:null});return null;}
  const username=handle(args.p_username),label=research?.label??text(args.p_label,1,160),kind=research?'local':args.p_kind;if(!['local','inspiration'].includes(kind))fail('22023','Invalid profile kind');
  const watches=await tx.list('company_instagram_watches',scoped(company)),prior=watches.find(w=>w.username===username);
  if(research&&args.p_remove&&research.selected_username!==username)fail('40001','Profile link changed');
  if(research&&prior?.place_id&&prior.place_id!==research.place_id)fail('22023','Profile already linked to another competitor');
  if(!args.p_remove&&!prior&&watches.length>=10)fail('22023','Maximum of ten profiles');
  if(!args.p_remove&&prior&&prior.label===label&&prior.kind===kind&&prior.actor_id===actor.id&&(!research||prior.place_id===research.place_id)&&prior.status!=='paused')return null;
  await invalidate(tx,company,ctx.version,1);
  if(research)for(const w of watches)if(w.place_id===research.place_id&&w.username!==username)tx.remove('company_instagram_watches',w.id);
  if(args.p_remove){if(prior)tx.remove('company_instagram_watches',prior.id);for(const r of await tx.list('company_competitor_research',scoped(company)))if(r.selected_username===username)tx.put('company_competitor_research',r.id,{...r,selected_username:null});}
  else{const id=prior?.id??randomUUID();tx.put('company_instagram_watches',id,{...prior,id,company_id:company,actor_id:actor.id,username,label,kind,place_id:research?.place_id??prior?.place_id??null,status:'pending',token:null,lease_until:null,next_attempt_at:now(),snapshot:prior?.snapshot??null,previous:prior?.previous??null,error:null,created_at:prior?.created_at??now()});}
  if(research)tx.put('company_competitor_research',research.id,{...research,selected_username:args.p_remove?null:username});audit(tx,actor,access.company,args.p_remove?'digital.watch.removed':'digital.watch.opted_in',{username});return null;
 }
 server(actor);const watch=name.includes('instagram_watch'),table=watch?'company_instagram_watches':'company_competitor_research';
 if(name.startsWith('claim_')){
  const statuses=watch?['pending','available','unavailable','running']:['pending','running'];const jobs=(await Promise.all(statuses.map(status=>tx.list(table,[{field:'status',value:status}])))).flat();
  for(const job of jobs.filter(j=>watch?j.status==='running'?Date.parse(j.lease_until)<=Date.now():Date.parse(j.next_attempt_at)<=Date.now():due(j)).sort((a,b)=>a.next_attempt_at.localeCompare(b.next_attempt_at))){
   if(watch){const channel=await authorization(tx,job);if(!channelValid(channel)){tx.put(table,job.id,{...job,status:'unavailable',token:null,lease_until:null,next_attempt_at:after(3600000),error:'A consulta aguarda plano ativo, permissões e conexão de Instagram profissional Meta.'});continue;}const token=randomUUID(),reserved=await providerRpc(tx,{role:'authenticated',id:job.actor_id},'reserve_onboarding_provider',{p_company_id:job.company_id,p_request_id:token,p_kind:'interpretation'});if(!reserved){tx.put(table,job.id,{...job,next_attempt_at:after(3600000),error:'Limite de consulta digital indisponível.'});continue;}tx.put(table,job.id,{...job,status:'running',token,lease_until:after(120000),channel_basis:hash(channel)});return {id:job.id,token,companyId:job.company_id,username:job.username,channel};}
   const access=await eligible(tx,job);if(!access||!digitalResearchCurrent(access.ctx,job)){tx.put(table,job.id,stale(job));continue;}if(job.selected_username)continue;if(job.attempts>=3){tx.put(table,job.id,{...retry(job,'A pesquisa foi interrompida.'),status:'failed'});continue;}
   const token=randomUUID(),reserved=await providerRpc(tx,access.actor,'reserve_onboarding_provider',{p_company_id:job.company_id,p_request_id:token,p_kind:'interpretation'});if(!reserved){tx.put(table,job.id,{...job,next_attempt_at:after(3600000),error:'Limite de pesquisa indisponível.'});continue;}
   tx.put(table,job.id,{...job,status:'running',token,lease_until:after(120000),attempts:job.attempts+1,error:null});return {id:job.id,token,companyId:job.company_id,query:job.label,city:job.city};
  }return null;
 }
 const id=text(args.p_id,1,100),job=await tx.get(table,id);if(!liveLease(job,args.p_token))return false;
 if(watch){const channel=await authorization(tx,job!);if(!channelValid(channel)||hash(channel)!==job!.channel_basis){tx.put(table,id,{...job,status:'paused',token:null,lease_until:null,error:'A conexão ou as permissões mudaram.'});return false;}
  const parsed=args.p_snapshot===null?null:instagramSnapshotSchema.safeParse(args.p_snapshot);if(parsed&&(!parsed.success||parsed.data.username!==job!.username||Date.parse(parsed.data.collectedAt)>Date.now()+60000||JSON.stringify(parsed.data).length>40000))fail('22023','Invalid Instagram snapshot');
  await providerRpc(tx,{role:'authenticated',id:job!.actor_id},'finish_onboarding_provider',{p_company_id:job!.company_id,p_request_id:args.p_token,p_kind:'interpretation',p_outcome:parsed?'completed':'failed'});
  tx.put(table,id,{...job,status:parsed?'available':'unavailable',token:null,lease_until:null,snapshot:parsed?.data??job!.snapshot,previous:parsed?job!.snapshot:job!.previous,next_attempt_at:after(3600000),error:parsed?null:'Consulta indisponível; os dados anteriores foram preservados.'});return true;
 }
 const access=await eligible(tx,job!);if(!access||!digitalResearchCurrent(access.ctx,job!)){tx.put(table,id,stale(job!));return false;}
 const parsed=args.p_candidates===null?null:z.array(candidate).max(8).safeParse(args.p_candidates);if(parsed&&(!parsed.success||parsed.data.some(c=>handle(c.username)!==c.username||c.url!=='https://www.instagram.com/'+c.username+'/')||new Set(parsed.data.map(c=>c.username)).size!==parsed.data.length))fail('22023','Invalid candidate sources');
 await providerRpc(tx,access.actor,'finish_onboarding_provider',{p_company_id:job!.company_id,p_request_id:args.p_token,p_kind:'interpretation',p_outcome:parsed?'completed':'failed'});
 tx.put(table,id,parsed?{...job,status:'ready',candidates:parsed.data,collected_at:now(),token:null,lease_until:null,error:null}:{...retry(job!,'Não foi possível encontrar perfis; informe o @ ou tente novamente.'),next_attempt_at:after(300000)});return true;
}
