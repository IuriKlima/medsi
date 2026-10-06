import {z} from 'zod';
import {brazilStates,type ProfileFacts,type RegionalAudience,type RegionalTopics,type TopicRow,type TopicSource} from '@askadia/contracts';

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// Search operators are never accepted from profile fields; each X term is quoted.
const literal=(value:string)=>value.replace(/\b(?:OR|AND|NOT)\b/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const termSchema=z.string().trim().min(1).max(300);
const rowSchema=z.object({query:termSchema,value:z.string().optional(),extracted_value:z.number().finite().nonnegative().optional()});
const trendsSchema=z.object({search_parameters:z.object({q:z.string().optional(),geo:z.string().optional(),date:z.string().optional()}).optional(),related_queries:z.object({top:z.array(z.unknown()).max(100).optional(),rising:z.array(z.unknown()).max(100).optional()}).optional(),error:z.string().optional()});
const metric=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const postSchema=z.object({id:z.string().regex(/^\d{1,25}$/),text:z.string().min(1).max(25000),created_at:z.string().datetime(),lang:z.string().optional(),referenced_tweets:z.array(z.object({type:z.string(),id:z.string()})).optional(),public_metrics:z.object({like_count:metric.optional(),reply_count:metric.optional(),retweet_count:metric.optional(),quote_count:metric.optional()}).optional()});
const postsSchema=z.object({data:z.array(z.unknown()).max(100).optional(),meta:z.object({result_count:z.number().int().nonnegative().optional()}).optional()}).refine(v=>v.data!==undefined||v.meta?.result_count===0);

async function readJson(url:URL,transport:typeof fetch,headers:Record<string,string>={}){
 const response=await transport(url.toString(),{headers:{Accept:'application/json',...headers},redirect:'error',signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error('TOPIC_PROVIDER_UNAVAILABLE');
 if(Number(response.headers.get('content-length'))>1_000_000){await response.body?.cancel();throw new Error('TOPIC_RESPONSE_TOO_LARGE');}
 const reader=response.body?.getReader();if(!reader)throw new Error('TOPIC_RESPONSE_EMPTY');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_000_000){await reader.cancel();throw new Error('TOPIC_RESPONSE_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
async function boundedMap<T,R>(values:T[],task:(value:T)=>Promise<R>):Promise<PromiseSettledResult<R>[]>{
 const result:PromiseSettledResult<R>[]=[];let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,values.length)},async()=>{while(cursor<values.length){const index=cursor++;try{result[index]={status:'fulfilled',value:await task(values[index]!)};}catch{result[index]={status:'rejected',reason:'TOPIC_PROVIDER_UNAVAILABLE'};}}}));
 return result;
}
const trendsLink=(query:string,geo:string)=>'https://trends.google.com/trends/explore?'+new URLSearchParams({q:query,geo,date:'today 3-m',hl:'pt-BR'});
const xQuery=(specialty:string,city:string)=>'"'+literal(specialty)+'" "'+literal(city)+'" lang:pt -is:retweet';
function cappedRows<T>(groups:T[][]):T[]{
 const all=groups.flat();if(all.length<=100)return all;
 // Give every specialty a turn when evidence exceeds the snapshot budget.
 const result:T[]=[];for(let index=0;result.length<100;index++){let added=false;for(const group of groups){const row=group[index];if(row!==undefined){result.push(row);added=true;if(result.length===100)break;}}if(!added)break;}
 return result;
}

/** Read-only evidence collection. The caller supplies the versioned, confirmed profile. */
export async function collectRegionalTopics(facts:ProfileFacts,transport:typeof fetch=fetch,onProgress?:(source:'google'|'x',state:'running'|'completed'|'unavailable')=>Promise<void>):Promise<{specialties:string[];topics:RegionalTopics;trends:RegionalAudience['trends']}>{
 const fullCity=facts.city?.status==='provided'?facts.city.value??'':'';
 const suffix=fullCity.match(/\s*[-,/]\s*([A-Za-z]{2})$/)?.[1]?.toUpperCase();
 const uf=(facts.uf?.status==='provided'?facts.uf.value:suffix)?.trim().toUpperCase()??'';
 const city=fullCity.replace(/\s*[-,/]\s*[A-Za-z]{2}$/,'').trim();
 if(!city||city.length>120||!literal(city)||!Object.hasOwn(brazilStates,uf)||(suffix&&suffix!==uf)||facts.city?.source==='assistant_suggestion')throw new Error('CONFIRMED_REGION_REQUIRED');
 const services=facts.services?.status==='provided'&&facts.services.source!=='assistant_suggestion'?facts.services.value??'':'';
 const seen=new Set<string>();const specialties=services.split(/[,;\n]/).map(value=>value.trim()).filter(value=>{const key=normalize(value);if(!key||seen.has(key))return false;seen.add(key);return true;});
 if(specialties.length>20||specialties.some(value=>value.length>160||!literal(value)))throw new Error('INVALID_CONFIRMED_SPECIALTIES');
 const geo='BR-'+uf,query=specialties.map(value=>literal(value)+' '+literal(city)).join('; ');
 const region='Consultas com '+city+'; recorte estadual '+uf;
 const base:TopicSource={state:'unconfigured',query,region,period:'Últimos 3 meses',message:'',sourceUrl:trendsLink(query,geo),rows:[]};
 const topics:RegionalTopics={
  google:{...base,message:'Google Trends depende do provedor configurado. Consultas citam o município, mas o recorte é estadual; não mede buscas apenas de moradores.'},
  
  
 };
 const trends:RegionalAudience['trends']={...topics.google,geo,rows:[]};
 const serpKey=process.env.SERPAPI_API_KEY?.trim(),xToken=process.env.X_BEARER_TOKEN?.trim();
 async function google(){
  if(!serpKey||!specialties.length){await onProgress?.('google','unavailable');return;}
  await onProgress?.('google','running');
  const outcomes=await boundedMap(specialties,async specialty=>{
   const q=literal(specialty)+' '+literal(city),sourceUrl=trendsLink(q,geo);
   const url=new URL('https://serpapi.com/search.json');url.search=new URLSearchParams({engine:'google_trends',data_type:'RELATED_QUERIES',q,geo,date:'today 3-m',hl:'en',api_key:serpKey!}).toString();
   const data=trendsSchema.parse(await readJson(url,transport));const scope=data.search_parameters;
   if(scope&&((scope.q!==undefined&&scope.q!==q)||(scope.geo!==undefined&&scope.geo!==geo)||(scope.date!==undefined&&scope.date!=='today 3-m')))throw new Error('TOPIC_SCOPE_MISMATCH');
   const rows:TopicRow[]=[];const top:RegionalAudience['trends']['rows']=[];const seenRows=new Set<string>();
   for(const raw of data.related_queries?.rising??[]){const parsed=rowSchema.safeParse(raw);if(!parsed.success)continue;const row=parsed.data,key=normalize(row.query);if(seenRows.has(key))continue;
    const breakout=row.value?.toLowerCase()==='breakout';const growth=row.extracted_value??(row.value&&/^\+?[\d,]+(?:\.\d+)?%$/.test(row.value)?Number(row.value.replace(/[+,%]/g,'')):undefined);
    if(!breakout&&(growth===undefined||!Number.isFinite(growth)))continue;
    seenRows.add(key);rows.push({term:row.query,specialty,metricLabel:breakout?'Breakout':'crescimento (%)',metricValue:breakout?null:growth!,sourceUrl});
   }
   const topSeen=new Set<string>();for(const raw of data.related_queries?.top??[]){const parsed=rowSchema.safeParse(raw);if(!parsed.success)continue;const row=parsed.data,interest=row.extracted_value??(row.value&&/^\d+(?:\.\d+)?$/.test(row.value)?Number(row.value):undefined);if(interest===undefined||interest>100||topSeen.has(normalize(row.query)))continue;topSeen.add(normalize(row.query));top.push({term:specialty+' · '+row.query,interest});}
   return {rows:rows.slice(0,10),top:top.slice(0,10)};
  });
  const successful=outcomes.filter(outcome=>outcome.status==='fulfilled');
  topics.google.rows=cappedRows(successful.map(outcome=>outcome.value.rows));trends.rows=cappedRows(successful.map(outcome=>outcome.value.top));
  topics.google.state=successful.length?'available':'unavailable';
  trends.state=successful.length?'available':'unavailable';
  const partial=successful.length<specialties.length?' Coleta parcial: '+successful.length+' de '+specialties.length+' especialidades consultadas.':'';
  topics.google.message='Google Trends via SerpApi: consultas com a cidade no recorte estadual '+uf+'. Crescimento percentual e Breakout são sinais relativos; não são volume absoluto nem contagem de moradores.'+(topics.google.rows.length?'':' Nenhuma consulta em alta validada nesta coleta.')+partial;
  trends.message='Interesse relativo de 0 a 100 em consultas com a cidade no recorte estadual '+uf+'. Não mede volume absoluto nem apenas moradores; não comparar pontuações de consultas diferentes.'+partial;
  await onProgress?.('google',successful.length?'completed':'unavailable');
 }
 async function x(){
  if(!xToken||!specialties.length){await onProgress?.('x','unavailable');return;}
  await onProgress?.('x','running');const start=Date.now()-7*86400000+60000;
  const outcomes=await boundedMap(specialties,async specialty=>{
   const url=new URL('https://api.x.com/2/tweets/search/recent');url.search=new URLSearchParams({query:xQuery(specialty,city),max_results:'25',start_time:new Date(start).toISOString(),'tweet.fields':'created_at,public_metrics,lang,referenced_tweets'}).toString();
   const data=postsSchema.parse(await readJson(url,transport,{Authorization:'Bearer '+xToken}));const rows:TopicRow[]=[];
   for(const raw of data.data??[]){const parsed=postSchema.safeParse(raw);if(!parsed.success)continue;const post=parsed.data,time=Date.parse(post.created_at),text=' '+normalize(post.text)+' ';
    if(time<start||time>Date.now()+1000||(post.lang&&post.lang!=='pt')||post.referenced_tweets?.some(ref=>ref.type==='retweeted')||!text.includes(' '+normalize(literal(city))+' ')||!text.includes(' '+normalize(literal(specialty))+' '))continue;
    const metrics=post.public_metrics?Object.values(post.public_metrics):[];const sum=metrics.reduce<number>((total,value)=>total+(value??0),0);
    rows.push({term:post.text.slice(0,260),specialty,metricLabel:'interações na amostra',metricValue:metrics.length&&Number.isSafeInteger(sum)?sum:null,sourceUrl:'https://x.com/i/web/status/'+post.id});
   }
   return rows.slice(0,25);
  });
  const successful=outcomes.filter(outcome=>outcome.status==='fulfilled');const seenPosts=new Set<string>();
  topics.x.rows=cappedRows(successful.map(outcome=>outcome.value.filter(row=>{if(seenPosts.has(row.sourceUrl))return false;seenPosts.add(row.sourceUrl);return true;})));
  topics.x.state=topics.x.rows.length?'available':successful.length?'pending':'unavailable';
  topics.x.message='Amostra de menções públicas recentes à cidade e à especialidade no X, até 25 publicações por consulta. Interações disponíveis são somadas por publicação; não são crescimento, ranking municipal nem quantidade de moradores.'+(topics.x.rows.length?'':' Nenhuma publicação válida disponível nesta coleta.')+(successful.length<specialties.length?' Coleta parcial: '+successful.length+' de '+specialties.length+' especialidades consultadas.':'');
  await onProgress?.('x',successful.length?'completed':'unavailable');
 }
 await Promise.all([google(),x()]);return {specialties,topics,trends};
}
