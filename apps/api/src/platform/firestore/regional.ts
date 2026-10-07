import {classifyRegionalMap,regionalMapSchema,regionalMapRequestSchema,regionalDistance,regionalCompetitorUrl} from '@askadia/contracts';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,server,uuid,fail,audit} from './access';
import {purchaseState} from './commerce';
import {anchor,context,invalidate,now} from './journey-state';

export const regionalOperations=['request_regional_research','select_regional_competitors','claim_regional_research_server','progress_regional_research_server','finish_regional_research_server'];
const source=z.enum(['available','unconfigured','unavailable','pending','forbidden']);
const url=z.string().url().max(2000).refine(v=>new URL(v).protocol==='https:');
const positive=z.number().finite().nonnegative();
const group=z.object({label:z.string().max(150),count:positive});
const topic=z.object({state:source,query:z.string().max(3000),region:z.string().max(200),period:z.string().max(100),message:z.string().max(2000),sourceUrl:url,rows:z.array(z.object({term:z.string().max(500),specialty:z.string().max(100),metricLabel:z.string().max(200),metricValue:z.number().finite().nonnegative().nullable(),sourceUrl:url})).max(100)});
const schema=z.object({specialties:z.array(z.string().max(100)).max(20).optional(),topics:z.object({google:topic,facebook:topic.optional(),x:topic.optional()}).optional(),map:regionalMapSchema.optional(),city:z.string().min(1).max(200),uf:z.string().regex(/^[A-Z]{2}$/),collectedAt:z.iso.datetime(),
 ibge:z.object({state:source,data:z.object({municipalityId:z.string(),municipality:z.string(),uf:z.string(),year:z.string().regex(/^\d{4}$/),population:positive.nullable(),areaKm2:positive.nullable(),density:positive.nullable(),collectedAt:z.iso.datetime(),sourceUrl:url}).nullable(),sex:z.array(group).max(10),ages:z.array(group).max(150),sourceUrl:url,message:z.string().max(2000)}),
 facebook:z.object({state:source,estimates:z.array(z.object({label:z.string().max(150),lower:positive.nullable(),upper:positive.nullable()})).max(30),sourceUrl:url,message:z.string().max(2000),cityKey:z.string().nullable()}).optional(),
 trends:z.object({state:source,query:z.string().max(1000),geo:z.string(),region:z.string().max(200),period:z.string().max(100),rows:z.array(z.object({term:z.string().max(500),interest:positive.max(100)})).max(100),sourceUrl:url,message:z.string().max(2000)})});
export async function eligible(tx:DocumentTransaction,job:Row){
 const actor:FirestoreActor={role:'authenticated',id:job.actor_id};
 try{await companyAccess(tx,actor,job.company_id,'marketing.write');const ctx=await context(tx,job.company_id);if(!ctx.confirmed||ctx.version!==job.profile_version||!(await purchaseState(tx,actor,job.company_id)).aiAllowed)return null;return {actor,ctx};}catch(e){if((e as {code?:string}).code==='42501')return null;throw e;}
}
export function due(job:Row){return job.status==='pending'&&Date.parse(job.next_attempt_at??job.created_at)<=Date.now()||job.status==='running'&&Date.parse(job.lease_until)<=Date.now();}
export function liveLease(job:Row|null,token:unknown){return Boolean(job&&job.status==='running'&&job.token===token&&Date.parse(job.lease_until)>Date.now());}
export function retry(job:Row,message:string){return {...job,status:job.attempts>=3?'failed':'pending',token:null,lease_until:null,next_attempt_at:new Date(Date.now()+60000).toISOString(),error:message,updated_at:now()};}
export function stale(job:Row){return {...job,status:'stale',token:null,lease_until:null,error:'O perfil, acesso ou aprovação mudou. Retome com a versão atual.',updated_at:now()};}
export async function regionalRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 if(name==='select_regional_competitors'){
  const company=uuid(args.p_company_id),access=await companyAccess(tx,actor,company,'marketing.write'),ctx=await context(tx,company);
  if(!(await purchaseState(tx,actor,company)).aiAllowed)fail('P0402','Ative seu plano antes de continuar.');
  const job=ctx.regional;if(!ctx.confirmed||!job||job.status!=='ready'||job.revision!==args.p_revision)fail('40001','Atualize a pesquisa antes de selecionar os concorrentes.');
  const raw=regionalMapSchema.safeParse(job!.snapshot?.map),map=raw.success?regionalMapSchema.safeParse(classifyRegionalMap(raw.data,ctx.facts)):raw,ids=z.array(z.string()).max(20).safeParse(args.p_ids),ack=z.array(z.string()).max(20).safeParse(args.p_confirmed_ids??[]);
  if(!map.success||!map.data.locationConfirmed||!ids.success||new Set(ids.data).size!==ids.data.length||!ack.success||new Set(ack.data).size!==ack.data.length||ack.data.some(id=>!ids.data.includes(id)||!map.data.reviewCandidates?.some(c=>c.id===id))||ids.data.some(id=>!map.data.competitors.some(c=>c.id===id)&&!(ack.data.includes(id)&&map.data.reviewCandidates?.some(c=>c.id===id))))fail('22023','Selecione somente estabelecimentos desta pesquisa e confirme a localização.');
  const selected=ids.data!.slice().sort();if(map.data!.selectionConfirmed&&JSON.stringify([...map.data!.selectedIds].sort())===JSON.stringify(selected)&&JSON.stringify([...(map.data!.confirmedCandidateIds??[])].sort())===JSON.stringify([...ack.data!].sort()))return null;
  await invalidate(tx,company,ctx.version,1);if(!await tx.get('company_regional_research_versions',job!.id+'_'+job!.revision))tx.put('company_regional_research_versions',job!.id+'_'+job!.revision,job!);
  const next={...job,revision:job!.revision+1,snapshot:{...job!.snapshot,map:{...map.data,selectedIds:selected,confirmedCandidateIds:ack.data!.slice().sort(),selectionConfirmed:true}},updated_at:now()};
  tx.put('company_regional_research',job!.id,next);tx.put('company_regional_research_versions',job!.id+'_'+next.revision,next);audit(tx,actor,access.company,'regional.competitors.selected',{revision:next.revision,selectedIds:selected,confirmedCandidateIds:ack.data});return null;
 }
 if(name==='request_regional_research'){
  const company=uuid(args.p_company_id),access=await companyAccess(tx,actor,company,'marketing.write'),ctx=await context(tx,company);
  if(!(await purchaseState(tx,actor,company)).aiAllowed)fail('P0402','Ative o plano antes de consultar as fontes.');
  if(!ctx.confirmed||ctx.facts.businessType?.status!=='provided')fail('22023','Confirme o perfil médico primeiro.');
  if(args.p_refresh!==undefined&&typeof args.p_refresh!=='boolean')fail('22023','Invalid refresh');
  const index=await anchor(tx,company,ctx.version),prior=await tx.get('company_regional_research',index.regional_id);
  const input=args.p_map===undefined?null:regionalMapRequestSchema.safeParse(args.p_map);if(input&&!input.success)fail('22023','Confira o ponto e o raio de atendimento.');
  const map=input?.data??prior?.map_config??null,changed=JSON.stringify(map)!==JSON.stringify(prior?.map_config??null);
  if(prior&&['pending','running'].includes(prior.status)){if(changed)fail('40001','Aguarde a coleta atual antes de alterar o mapa.');return prior;}
  if(prior?.status==='ready'&&!args.p_refresh&&!changed)return prior;
  if(prior&&Date.parse(prior.updated_at)>Date.now()-(changed?30000:300000))fail('22023',changed?'Aguarde trinta segundos antes de alterar o mapa.':'Aguarde cinco minutos antes de atualizar a pesquisa.');
  if(prior&&!await tx.get('company_regional_research_versions',prior.id+'_'+prior.revision))tx.put('company_regional_research_versions',prior.id+'_'+prior.revision,prior);
  await invalidate(tx,company,ctx.version,1);
  const row={id:index.regional_id,company_id:company,profile_version:ctx.version,actor_id:actor.id,status:'pending',revision:(prior?.revision??0)+1,snapshot:null,map_config:map,progress:[],error:null,attempts:0,token:null,lease_until:null,next_attempt_at:now(),created_at:prior?.created_at??now(),updated_at:now()};
  tx.put('company_regional_research',row.id,row);audit(tx,actor,access.company,'regional.requested',{profileVersion:ctx.version,revision:row.revision});return row;
 }
 server(actor);
 if(name==='claim_regional_research_server'){
  // Query each status separately so unrelated completed history cannot exhaust the queue scan.
  const jobs=[...await tx.list('company_regional_research',[{field:'status',value:'pending'}]),...await tx.list('company_regional_research',[{field:'status',value:'running'}])];
  for(const job of jobs.filter(due).sort((a,b)=>a.created_at.localeCompare(b.created_at))){
   const access=await eligible(tx,job);if(!access){tx.put('company_regional_research',job.id,stale(job));continue;}
   if(job.attempts>=3){tx.put('company_regional_research',job.id,{...retry(job,'As fontes não responderam. Tente atualizar a pesquisa.'),status:'failed'});continue;}
   const token=randomUUID();tx.put('company_regional_research',job.id,{...job,status:'running',progress:[],token,lease_until:new Date(Date.now()+180000).toISOString(),attempts:job.attempts+1,updated_at:now()});
   return {id:job.id,token,companyId:job.company_id,actorId:job.actor_id,profileVersion:job.profile_version,facts:access.ctx.facts,map:job.map_config??undefined};
  }return null;
 }
 const id=uuid(args.p_id),job=await tx.get('company_regional_research',id);
 if(!liveLease(job,args.p_token))return false;
 const access=await eligible(tx,job!);if(!access){tx.put('company_regional_research',id,stale(job!));return false;}
 if(name==='progress_regional_research_server'){
  const source=z.enum(['ibge','facebook','google','x','map']).safeParse(args.p_source),state=z.enum(['running','completed','unavailable']).safeParse(args.p_state);if(!source.success||!state.success)fail('22023','Invalid regional progress');
  const previous=(job!.progress??[]).find((v:Row)=>v.source===source.data);if(previous?.state===state.data)return true;
  if(previous&&previous.state!=='running')return false;
  tx.put('company_regional_research',id,{...job,progress:[...(job!.progress??[]).filter((v:Row)=>v.source!==source.data),{source:source.data,state:state.data,updatedAt:now()}]});return true;
 }
 if(args.p_snapshot===null){tx.put('company_regional_research',id,retry(job!,'Não foi possível concluir a coleta. Tente novamente.'));return false;}
 const parsed=schema.safeParse(args.p_snapshot);if(!parsed.success||JSON.stringify(args.p_snapshot).length>200000)fail('22023','Invalid regional evidence');
 const data=parsed.data!,fullCity=String(access.ctx.facts.city?.value??''),city=fullCity.replace(/\s*[-,/]\s*[A-Z]{2}$/,'').trim(),uf=String(access.ctx.facts.uf?.value??fullCity.match(/[-,/]\s*([A-Z]{2})$/)?.[1]??'').toUpperCase();
 const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 if(normalize(data.city)!==normalize(city)||data.uf!==uf||data.trends.geo!=='BR-'+uf||Date.parse(data.collectedAt)>Date.now()+60000)fail('22023','Regional evidence scope changed');
 // IBGE aggregate series qualify municipality names as City (UF); retain that source label.
 const censusCity=normalize(data.ibge.data?.municipality??'');
 const censusCityMatches=censusCity===normalize(city)||censusCity===normalize(city+' ('+uf+')');
 if(data.ibge.state==='available'&&(!data.ibge.data||data.ibge.data.uf!==uf||!censusCityMatches))fail('22023','Invalid census scope');
 if(data.ibge.state!=='available'&&(data.ibge.data||data.ibge.sex.length||data.ibge.ages.length)||data.facebook&&!['available','pending'].includes(data.facebook.state)&&data.facebook.estimates.some(e=>e.lower!==null||e.upper!==null)||data.trends.state!=='available'&&data.trends.rows.length)fail('22023','Unavailable evidence must not contain metrics');
 if(data.facebook?.state==='available'&&(!data.facebook.cityKey||!data.facebook.estimates.some(e=>e.lower!==null&&e.upper!==null)))fail('22023','Missing provider evidence');
 if(data.facebook?.estimates.some(e=>(e.lower===null)!==(e.upper===null)||e.lower!==null&&e.upper!==null&&e.lower>e.upper))fail('22023','Invalid audience range');
 if(data.ibge.data?.population!==null&&data.ibge.data?.population!==undefined&&[data.ibge.sex,data.ibge.ages].some(groups=>groups.length&&groups.reduce((total,g)=>total+g.count,0)!==data.ibge.data!.population))fail('22023','Census totals do not match');
 if(data.topics){const specialties=String(access.ctx.facts.services?.value??'').split(/[,;\n]/).map(v=>normalize(v));for(const topic of Object.values(data.topics)){if(topic.state!=='available'&&topic.rows.length)fail('22023','Unavailable topics cannot contain metrics');if(topic.rows.some(r=>!specialties.includes(normalize(r.specialty))))fail('22023','Topic specialty changed');}}
 if(job!.map_config&&!data.map)fail('22023','Requested map evidence is missing');
 if(data.map){
  const map=data.map,expected=job!.map_config?.center??null;
  if(map.selectionConfirmed||map.selectedIds.length||map.confirmedCandidateIds?.length)fail('22023','Competitor selection requires customer confirmation');
  // Without a customer point, the server may locate the confirmed address; a customer point always wins.
  const fromAddress=!job!.map_config&&map.centerSource==='address'&&Boolean(map.center)&&map.locationConfirmed;
  if(job!.map_config&&map.centerSource==='address'||!fromAddress&&(map.center?.lat!==expected?.lat||map.center?.lng!==expected?.lng||map.locationConfirmed!==Boolean(job!.map_config))||map.radiusM!==(job!.map_config?.radiusM??3000)||map.state==='available'&&!map.center)fail('22023','Map scope changed');
  const candidates=[...map.competitors,...(map.reviewCandidates??[])];
  if(map.state!=='available'&&candidates.length||candidates.length>50||new Set(candidates.map(c=>c.id)).size!==candidates.length||candidates.some(c=>!map.center||regionalDistance(map.center,c)>map.radiusM+1||Math.abs(c.distanceM-regionalDistance(map.center,c))>1||c.sourceUrl!==regionalCompetitorUrl(c.id)))fail('22023','Invalid competitor scope');
  data.map=classifyRegionalMap(map,access.ctx.facts);
 }
 const completed={...job,status:'ready',snapshot:data,error:null,token:null,lease_until:null,updated_at:now()};
 tx.put('company_regional_research',id,completed);tx.put('company_regional_research_versions',id+'_'+job!.revision,completed);return true;
}
