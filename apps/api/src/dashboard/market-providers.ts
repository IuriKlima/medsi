/** Read-only adapters. Fixed hosts, bounded requests, no provider errors or credentials returned. */
import {distanceMeters,type Demographics,type PlaceOption,type SearchRanking} from '@askadia/contracts';
type Transport=typeof fetch;
type Point={latitude:number;longitude:number};
type Place={id?:string;displayName?:{text?:string};formattedAddress?:string;location?:Point;businessStatus?:string;addressComponents?:{longText:string;shortText:string;types:string[]}[];attributions?:{provider:string;providerUri:string}[]};
const validPoint=(p?:Point):p is Point=>Boolean(p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180);
async function json(url:string,init:RequestInit,transport:Transport){const r=await transport(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('REGIONAL_PROVIDER_UNAVAILABLE');return r.json();}
export class GoogleLocalAdapter{
 constructor(private key:string,private transport:Transport=fetch){}
 async location(placeId:string){if(!/^[\w-]{5,200}$/.test(placeId))throw new Error('INVALID_PLACE');const p=await json('https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId),{headers:{'X-Goog-Api-Key':this.key,'X-Goog-FieldMask':'id,location,addressComponents'}},this.transport) as Place;if(!validPoint(p.location))throw new Error('LOCATION_UNAVAILABLE');return {center:p.location,city:p.addressComponents?.find(a=>a.types?.includes('administrative_area_level_2'))?.longText??'',uf:p.addressComponents?.find(a=>a.types?.includes('administrative_area_level_1'))?.shortText??''};}
 async competitors(center:Point,radius:number,ownId:string){
  const data=await json('https://places.googleapis.com/v1/places:searchNearby',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':this.key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.attributions'},body:JSON.stringify({includedTypes:['doctor','medical_clinic'],maxResultCount:20,rankPreference:'DISTANCE',languageCode:'pt-BR',locationRestriction:{circle:{center,radius}}})},this.transport) as {places?:Place[]};
  if(data.places!==undefined&&!Array.isArray(data.places))throw new Error('INVALID_PLACES');
  const ids=new Set<string>();const list:PlaceOption[]=[];
  for(const p of data.places??[]){if(!p.id||p.id===ownId||ids.has(p.id)||!validPoint(p.location)||distanceMeters(center,p.location)>radius||p.businessStatus==='CLOSED_PERMANENTLY')continue;ids.add(p.id);list.push({id:p.id,name:p.displayName?.text??'Estabelecimento',address:p.formattedAddress??'',...p.location,url:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.displayName?.text??'Clínica')+'&query_place_id='+encodeURIComponent(p.id),attributions:(p.attributions??[]).map(a=>({displayName:a.provider,uri:a.providerUri?.startsWith('https://')?a.providerUri:''}))});}
  return {places:list,limited:(data.places?.length??0)>=20};
 }
}
type Municipality={id:number;nome:string;microrregiao?:{mesorregiao:{UF:{sigla:string}}};'regiao-imediata'?:{'regiao-intermediaria':{UF:{sigla:string}}}};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function matchMunicipality(rows:Municipality[],city:string,uf:string){const matches=rows.filter(r=>norm(r.nome)===norm(city)&&(!uf||(r.microrregiao?.mesorregiao.UF.sigla??r['regiao-imediata']?.['regiao-intermediaria'].UF.sigla)===uf));return matches.length===1?matches[0]:null;}
export function parseDemographics(input:unknown,municipalityId:string,uf:string,now=new Date()):Demographics{
 if(!Array.isArray(input))throw new Error('INVALID_IBGE');
 const result:Demographics={municipalityId,municipality:'',uf,year:'',population:null,areaKm2:null,density:null,collectedAt:now.toISOString(),sourceUrl:'https://sidra.ibge.gov.br/tabela/4714'};
 for(const id of ['93','6318','614']){const field=input.find(v=>v.id===id);const series=field?.resultados?.flatMap((r:{series:unknown[]})=>r.series).find((s:{localidade:{id:string}})=>s.localidade?.id===municipalityId);if(!series)throw new Error('INVALID_IBGE_LOCALITY');const years=Object.keys(series.serie??{}).filter(y=>/^\d{4}$/.test(y)).sort();const year=years.at(-1);if(!year||(result.year&&result.year!==year))throw new Error('INVALID_IBGE_YEAR');result.year=year;result.municipality=series.localidade.nome;const raw=series.serie[year];const value=typeof raw==='string'&&/^\d+(\.\d+)?$/.test(raw)?Number(raw):null;result[id==='93'?'population':id==='6318'?'areaKm2':'density']=value;}
 return result;
}
export class IbgeAdapter{
 constructor(private transport:Transport=fetch){}
 async municipality(city:string,uf:string){const rows=await json('https://servicodados.ibge.gov.br/api/v1/localidades/'+(/^[A-Z]{2}$/.test(uf)?'estados/'+uf+'/municipios':'municipios'),{},this.transport) as Municipality[];if(!Array.isArray(rows))throw new Error('INVALID_IBGE');return matchMunicipality(rows,city,uf);}
 async demographics(id:string,uf:string){if(!/^\d{7}$/.test(id))throw new Error('INVALID_MUNICIPALITY');return parseDemographics(await json('https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/-1/variaveis/93%7C6318%7C614?localidades='+encodeURIComponent('N6['+id+']'),{},this.transport),id,uf);}
}
/** Optional independent provider, NOT the official Google Trends alpha API. */
export class SerpApiTrendsAdapter{
 constructor(private key:string,private transport:Transport=fetch){}
 async related(geo:string,query:string){if(!/^BR-[A-Z]{2}$/.test(geo))throw new Error('INVALID_REGION');const params=new URLSearchParams({engine:'google_trends',data_type:'RELATED_QUERIES',q:query,geo,date:'today 3-m',hl:'pt-BR',api_key:this.key});const data=await json('https://serpapi.com/search.json?'+params,{},this.transport) as {related_queries?:{top?:{query:string;extracted_value:number}[]};error?:string};if(data.error||!data.related_queries||!Array.isArray(data.related_queries.top))throw new Error('TRENDS_NO_DATA');const ids=new Set<string>();const rows:SearchRanking[]=[];for(const item of data.related_queries.top){if(typeof item.query!=='string'||!Number.isFinite(item.extracted_value)||item.extracted_value<0||item.extracted_value>100||ids.has(norm(item.query)))continue;ids.add(norm(item.query));rows.push({term:item.query.slice(0,200),interest:item.extracted_value});}return rows.sort((a,b)=>b.interest-a.interest).slice(0,20);}
}
