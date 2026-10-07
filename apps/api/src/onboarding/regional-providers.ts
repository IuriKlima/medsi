import {z} from 'zod';
import {brazilStates,type AudienceEstimate,type PopulationGroup,type RegionalAudience,type ProfileFacts} from '@askadia/contracts';
import {IbgeAdapter} from '../dashboard/market-providers';
import {collectRegionalTopics} from './regional-topics';
import {metaGraph} from '../inbox/meta';
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const category=z.object({id:z.number(),nome:z.string(),nivel:z.number()});
const metadataSchema=z.object({id:z.literal(9514),classificacoes:z.array(z.object({id:z.number(),nome:z.string(),categorias:z.array(category)}))});
const seriesSchema=z.array(z.object({
 id:z.string(),
 resultados:z.array(z.object({
  classificacoes:z.array(z.object({id:z.string(),categorias:z.record(z.string(),z.string())})),
  series:z.array(z.object({localidade:z.object({id:z.string(),nome:z.string()}),serie:z.record(z.string(),z.string())})),
 })),
}));
async function json(url:string,transport:typeof fetch){const response=await transport(url,{signal:AbortSignal.timeout(18000),redirect:'error',headers:{Accept:'application/json'}});if(!response.ok)throw new Error('PUBLIC_PROVIDER_UNAVAILABLE');const text=await response.text();if(text.length>4000000)throw new Error('PUBLIC_RESPONSE_TOO_LARGE');return JSON.parse(text) as unknown;}
export class CensusAudienceAdapter{
 constructor(private transport:typeof fetch=fetch){}
 async breakdown(municipalityId:string,population:number,year:string){
  if(!/^\d{7}$/.test(municipalityId))throw new Error('INVALID_MUNICIPALITY');
  const metadata=metadataSchema.parse(await json('https://servicodados.ibge.gov.br/api/v3/agregados/9514/metadados',this.transport));
  const sex=metadata.classificacoes.find(c=>norm(c.nome)==='sexo'),age=metadata.classificacoes.find(c=>norm(c.nome)==='idade');
  const sexTotal=sex?.categorias.find(c=>norm(c.nome)==='total'),ageTotal=age?.categorias.find(c=>norm(c.nome)==='total');
  if(!sex||!age||!sexTotal||!ageTotal)throw new Error('IBGE_CLASSIFICATION_UNAVAILABLE');
  const ageGroups=age.categorias.filter(c=>c.nivel===1&&(/^\d+ a \d+ anos$/.test(c.nome)||/^\d+ anos ou mais$/.test(c.nome)));
  if(!ageGroups.length)throw new Error('IBGE_AGE_GROUPS_UNAVAILABLE');
  const query=metadata.classificacoes.map(c=>{
   const ids=c.id===sex.id?c.categorias.map(v=>v.id):c.id===age.id?[ageTotal.id,...ageGroups.map(v=>v.id)]:[c.categorias.find(v=>norm(v.nome)==='total')?.id];
   if(ids.some(v=>v===undefined))throw new Error('IBGE_TOTAL_UNAVAILABLE');
   return c.id+'['+ids.join(',')+']';
  }).join('|');
  const url='https://servicodados.ibge.gov.br/api/v3/agregados/9514/periodos/'+year+'/variaveis/93?'+new URLSearchParams({localidades:'N6['+municipalityId+']',classificacao:query});
  const data=seriesSchema.parse(await json(url,this.transport)).find(v=>v.id==='93');
  if(!data)throw new Error('IBGE_POPULATION_UNAVAILABLE');
  const rows=data.resultados.map(r=>{
   const serie=r.series.find(s=>s.localidade.id===municipalityId),raw=serie?.serie[year];
   const count=raw&&/^\d+$/.test(raw)?Number(raw):null;
   return {sex:Object.keys(r.classificacoes.find(c=>c.id===String(sex.id))?.categorias??{})[0],age:Object.keys(r.classificacoes.find(c=>c.id===String(age.id))?.categorias??{})[0],count};
  });
  const sexes:PopulationGroup[]=sex.categorias.filter(c=>c.id!==sexTotal.id).map(c=>({label:c.nome,count:rows.find(r=>r.sex===String(c.id)&&r.age===String(ageTotal.id))?.count??NaN}));
  const ages:PopulationGroup[]=ageGroups.map(c=>({label:c.nome,count:rows.find(r=>r.sex===String(sexTotal.id)&&r.age===String(c.id))?.count??NaN}));
  // Refuse incomplete or overlapping categories rather than normalizing invented percentages.
  if([...sexes,...ages].some(v=>!Number.isSafeInteger(v.count)||v.count<0)||sexes.reduce((n,v)=>n+v.count,0)!==population||ages.reduce((n,v)=>n+v.count,0)!==population)throw new Error('IBGE_INCOMPLETE_BREAKDOWN');
  const bands=[{label:'0 a 19 anos',count:0},{label:'20 a 39 anos',count:0},{label:'40 a 59 anos',count:0},{label:'60 anos ou mais',count:0}];
  for(const a of ages){const min=Number(a.label.match(/^\d+/)?.[0]);bands[min<20?0:min<40?1:min<60?2:3]!.count+=a.count;}
  return {sex:sexes,ages:bands};
 }
}
type Graph=<T>(path:string,token:string,params?:Record<string,string>)=>Promise<T>;
const estimateSchema=z.object({estimate_ready:z.boolean(),users_lower_bound:z.number().int().nonnegative().safe().optional(),users_upper_bound:z.number().int().nonnegative().safe().optional()});
export function parseAudienceEstimate(input:unknown,label:string):AudienceEstimate{
 const payload=z.object({data:z.union([estimateSchema,z.array(estimateSchema).length(1)])}).parse(input);
 const estimate=Array.isArray(payload.data)?payload.data[0]!:payload.data;
 if(!estimate.estimate_ready)return {label,lower:null,upper:null};
 if(estimate.users_lower_bound===undefined||estimate.users_upper_bound===undefined||estimate.users_lower_bound>estimate.users_upper_bound)throw new Error('META_ESTIMATE_INCOMPLETE');
 return {label,lower:estimate.users_lower_bound,upper:estimate.users_upper_bound};
}
export class FacebookAudienceAdapter{
 constructor(private graph:Graph=metaGraph){}
 async audience(city:string,uf:string,account:string,token:string){
  if(!/^act_\d+$/.test(account)||!Object.hasOwn(brazilStates,uf))throw new Error('META_ACCOUNT_UNAVAILABLE');
  const response=await this.graph<{data:{key:string;name:string;country_code:string;region?:string}[]}>('search',token,{type:'adgeolocation',location_types:'["city"]',q:city,country_code:'BR',limit:'100'});
  const matches=response.data.filter(r=>/^\d+$/.test(r.key)&&r.country_code==='BR'&&norm(r.name)===norm(city)&&norm(r.region??'')===norm(brazilStates[uf as keyof typeof brazilStates]));
  if(matches.length!==1)throw new Error('META_CITY_AMBIGUOUS');
  const cityKey=matches[0]!.key;
  const cuts=[{label:'Público adulto · 18 anos ou mais',extra:{}},{label:'18 a 34 anos',extra:{age_min:18,age_max:34}},{label:'35 a 54 anos',extra:{age_min:35,age_max:54}},{label:'55 anos ou mais',extra:{age_min:55}},{label:'Homens · 18 anos ou mais',extra:{genders:[1]}},{label:'Mulheres · 18 anos ou mais',extra:{genders:[2]}}];
  const outcomes=await Promise.allSettled(cuts.map(async cut=>parseAudienceEstimate(await this.graph(account+'/reachestimate',token,{fields:'estimate_ready,users_lower_bound,users_upper_bound',targeting_spec:JSON.stringify({geo_locations:{cities:[{key:cityKey}]},age_min:18,publisher_platforms:['facebook'],...cut.extra})}),cut.label)));
  if(outcomes[0]?.status==='rejected')throw new Error('META_ESTIMATE_UNAVAILABLE');
  const estimates=outcomes.map((r,i)=>r.status==='fulfilled'?r.value:{label:cuts[i]!.label,lower:null,upper:null});
  return {cityKey,estimates};
 }
}
type FacebookConnection={account:string;token:string};
type FacebookProvider=()=>Promise<FacebookConnection|null>;
export async function collectRegionalAudience(facts:ProfileFacts,facebook:FacebookProvider=async()=>null,transport:typeof fetch=fetch,graph:Graph=metaGraph,onProgress?:(source:'ibge'|'facebook'|'google'|'x',state:'running'|'completed'|'unavailable')=>Promise<void>):Promise<RegionalAudience>{
 const fullCity=facts.city?.value??'',uf=(facts.uf?.value??fullCity.match(/(?:[-,/]\s*)([A-Z]{2})$/)?.[1]??'').toUpperCase(),city=fullCity.replace(/\s*[-,/]\s*[A-Z]{2}$/,'').trim();
 const services=facts.services?.value?.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean)??[];
 const query=services.map(s=>s+' '+city).join('; ');
 if(!city||!Object.hasOwn(brazilStates,uf))throw new Error('CONFIRMED_REGION_REQUIRED');
 const result:RegionalAudience={city,uf,collectedAt:new Date().toISOString(),
  ibge:{state:'unavailable',data:null,sex:[],ages:[],sourceUrl:'https://sidra.ibge.gov.br/tabela/9514',message:'Não foi possível consultar o IBGE. Nenhum valor foi estimado.'},
  facebook:{state:'unconfigured',estimates:[],sourceUrl:'https://www.facebook.com/business/ads',message:'Conecte uma conta de anúncios Meta autorizada para consultar estimativas municipais. Nenhum anúncio foi criado.',cityKey:null},
    trends:{state:'unconfigured',query,geo:'BR-'+uf,region:'Estado '+uf,period:'Últimos 3 meses',rows:[],sourceUrl:'https://trends.google.com/trends/explore?'+new URLSearchParams({geo:'BR-'+uf,date:'today 3-m',q:query,hl:'pt-BR'}),message:'A coleta de Trends depende do provedor configurado. O link oficial permite consultar o estado; não há dados municipais inventados.'}
 };
 await Promise.all([
  (async()=>{await onProgress?.('ibge','running');try{const adapter=new IbgeAdapter(transport);const town=await adapter.municipality(city,uf);if(!town)return;const summary=await adapter.demographics(String(town.id),uf);result.ibge={...result.ibge,state:'available',data:summary,message:'Censo '+summary.year+' · município inteiro. Não representa somente o bairro ou o raio da clínica.'};if(summary.population!==null){try{const breakdown=await new CensusAudienceAdapter(transport).breakdown(String(town.id),summary.population,summary.year);result.ibge={...result.ibge,...breakdown};}catch{result.ibge.message+=' Distribuição por sexo e idade indisponível nesta coleta.';}}}catch{/* Source remains unavailable, never zero. */}finally{await onProgress?.('ibge',result.ibge.state==='available'?'completed':'unavailable');}})(),
  (async()=>{await onProgress?.('facebook','running');try{const context=await facebook();if(context){const audience=await new FacebookAudienceAdapter(graph).audience(city,uf,context.account,context.token);const current=await facebook();if(!current||current.account!==context.account||current.token!==context.token)throw new Error('META_CONTEXT_CHANGED');const ready=audience.estimates[0]?.lower!==null;result.facebook={...result.facebook!,...audience,state:ready?'available':'pending',message:ready?'Estimativas da Meta para pessoas adultas elegíveis a anúncios no Facebook neste município. Não são população residente nem quantidade de pacientes; os recortes não devem ser somados.':'A Meta ainda não calculou uma estimativa para este recorte.'};}}catch{result.facebook={...result.facebook!,state:'unavailable',estimates:[],cityKey:null,message:'Estimativas indisponíveis. Confira a conexão Meta, a conta de anúncios e o acesso de leitura. Nenhum anúncio foi criado.'};}await onProgress?.('facebook',result.facebook?.state==='available'||result.facebook?.state==='pending'?'completed':'unavailable');})(),
  (async()=>{const collected=await collectRegionalTopics(facts,transport,onProgress);result.specialties=collected.specialties;result.topics=collected.topics;result.trends=collected.trends;})()
 ]);
 result.collectedAt=new Date().toISOString();return result;
}
