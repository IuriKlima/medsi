import {z} from 'zod';
import {regionalCompetitorUrl,regionalDistance,regionalMapRequestSchema,regionalPointSchema,type ProfileFacts,type RegionalMap,type RegionalMapRequest,type RegionalPoint} from '@askadia/contracts';
const point=z.object({lat:z.number().finite(),lon:z.number().finite()});
const elements=z.object({remark:z.string().optional(),elements:z.array(z.object({type:z.enum(['node','way','relation']),id:z.number().int().positive(),lat:z.number().optional(),lon:z.number().optional(),center:point.optional(),tags:z.record(z.string(),z.string()).optional()})).max(2000)});
async function read(url:string,transport:typeof fetch,body?:string){
 const response=await transport(url,{method:body?'POST':'GET',body,redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json','User-Agent':'MedSI/1.0 regional research',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})}});
 if(!response.ok)throw Error('MAP_PROVIDER_UNAVAILABLE');const reader=response.body?.getReader();if(!reader)throw Error('EMPTY_MAP_RESPONSE');let size=0,text='';const decoder=new TextDecoder();
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>2000000)throw Error('MAP_RESPONSE_TOO_LARGE');text+=decoder.decode(next.value,{stream:true});}text+=decoder.decode();return JSON.parse(text) as unknown;}finally{await reader.cancel().catch(()=>{});}
}
/** A municipal viewport is navigation only, never the address of the clinic. */
async function viewport(id:string,transport:typeof fetch):Promise<RegionalPoint|null>{
 if(!/^\d{7}$/.test(id))return null;
 const data=await read('https://servicodados.ibge.gov.br/api/v3/malhas/municipios/'+id+'?formato=application/vnd.geo+json&qualidade=minima',transport) as {features?:{geometry?:{coordinates?:unknown}}[]};
 const pending:unknown[]=[];for(const f of data.features??[])pending.push(f.geometry?.coordinates);
 let minLng=Infinity,maxLng=-Infinity,minLat=Infinity,maxLat=-Infinity,visited=0,points=0;
 while(pending.length){
  if(++visited>250000)return null;
  const value=pending.pop();if(!Array.isArray(value))continue;
  if(value.length>=2&&typeof value[0]==='number'&&typeof value[1]==='number'){
   const lng=value[0] as number,lat=value[1] as number;
   if(!Number.isFinite(lng)||!Number.isFinite(lat)||lng< -74||lng> -28||lat< -34||lat>6)continue;
   minLng=Math.min(minLng,lng);maxLng=Math.max(maxLng,lng);minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);points++;continue;
  }
  if(pending.length+value.length>250000)return null;
  for(const child of value)pending.push(child);
 }
 if(!points)return null;
 const lng=(minLng+maxLng)/2,lat=(minLat+maxLat)/2;
 return lat>=-34&&lat<=6&&lng>=-74&&lng<=-28?{lat,lng}:null;
}
type GooglePlace={id?:string;displayName?:{text?:string};formattedAddress?:string;location?:{latitude?:number;longitude?:number};rating?:number;userRatingCount?:number;nationalPhoneNumber?:string;websiteUri?:string;businessStatus?:string;types?:string[];primaryTypeDisplayName?:{text?:string}};
const healthTypes=new Set(['doctor','medical_clinic','hospital','dentist','dental_clinic','physiotherapist','psychologist','skin_care_clinic','chiropractor','medical_center','general_hospital','health']);
const excludedTypes=new Set(['pharmacy','drugstore','store','beauty_salon','gym']);
const placeMask='places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.businessStatus,places.types,places.primaryTypeDisplayName';
const normalized=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const httpUrl=(v?:string)=>{try{const u=new URL(v??'');return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&u.href.length<=500?u.href:null;}catch{return null;}};
export type RegionalMapOptions={facts?:ProfileFacts;placesKey?:string;maxSpecialties?:number;persistentEvidence?:boolean};
async function google(path:string,key:string,mask:string,transport:typeof fetch,body?:unknown){
 const response=await transport('https://places.googleapis.com/v1/'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':mask},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Error('PLACES_UNAVAILABLE');return await response.json() as unknown;
}
const valid=(l?:{latitude?:number;longitude?:number})=>{const p={lat:l?.latitude,lng:l?.longitude};return regionalPointSchema.safeParse(p).success?p as RegionalPoint:null;};
/** Locate the clinic from the address the customer already confirmed. Never guesses from the city alone. */
async function locateAddress(facts:ProfileFacts,key:string,transport:typeof fetch):Promise<RegionalPoint|null>{
 const placeId=facts.placeId?.status==='provided'?facts.placeId.value?.trim():undefined;
 if(placeId&&/^[\w-]{5,200}$/.test(placeId)){try{const p=await google('places/'+encodeURIComponent(placeId),key,'id,location',transport) as GooglePlace;const point=p.id===placeId?valid(p.location):null;if(point)return point;}catch{/* Fall back to the confirmed address. */}}
 const address=facts.address?.status==='provided'&&facts.address.source!=='assistant_suggestion'?facts.address.value?.trim():'';
 if(!address||address.length<6)return null;
 const city=facts.city?.status==='provided'?facts.city.value?.trim()??'':'';
 const textQuery=[address,normalized(address).includes(normalized(city.replace(/\s*[-,/]\s*[A-Za-z]{2}$/,'')))?'':city].filter(Boolean).join(', ').slice(0,400);
 const data=await google('places:searchText',key,'places.id,places.location',transport,{textQuery,languageCode:'pt-BR',regionCode:'BR',pageSize:1}) as {places?:GooglePlace[]};
 return valid(data.places?.[0]?.location);
}
function confirmedSpecialties(facts:ProfileFacts|undefined,limit:number){
 const services=facts?.services?.status==='provided'&&facts.services.source!=='assistant_suggestion'?facts.services.value??'':'';
 const seen=new Set<string>();return services.split(/[,;\n]/).map(v=>v.trim().slice(0,160)).filter(v=>{const k=normalized(v);if(!k||seen.has(k))return false;seen.add(k);return true;}).slice(0,limit);
}
/** Text Search per confirmed specialty, biased to the circle and filtered to it. Results are candidates; the customer decides. */
async function googleCompetitors(center:RegionalPoint,radiusM:number,facts:ProfileFacts|undefined,key:string,transport:typeof fetch,limit:number){
 const specialties=confirmedSpecialties(facts,limit);const businessType=facts?.businessType?.value?.trim();
 const queries=specialties.length?specialties.map(s=>({specialty:s as string|null,text:s+' consultório clínica'})):[{specialty:null,text:businessType||'clínica médica consultório'}];
 const ownId=facts?.placeId?.value?.trim(),ownName=normalized(facts?.name?.value??'');
 const found=new Map<string,RegionalMap['competitors'][number]>();let answered=0;
 await Promise.all(queries.map(async q=>{
  let data:{places?:GooglePlace[]};
  try{data=await google('places:searchText',key,placeMask,transport,{textQuery:q.text,languageCode:'pt-BR',regionCode:'BR',pageSize:20,locationBias:{circle:{center:{latitude:center.lat,longitude:center.lng},radius:radiusM}}}) as {places?:GooglePlace[]};answered++;}catch{return;}
  for(const p of data.places??[]){
   const point=valid(p.location),name=p.displayName?.text?.trim();if(!p.id||!/^[\w-]{5,200}$/.test(p.id)||!name||!point||p.businessStatus==='CLOSED_PERMANENTLY')continue;
   const types=p.types??[];if(!types.some(t=>healthTypes.has(t))||types.some(t=>excludedTypes.has(t)&&!healthTypes.has(t)))continue;
   if(p.id===ownId||ownName&&normalized(name)===ownName)continue;
   const distanceM=regionalDistance(center,point);if(distanceM>radiusM)continue;
   const id='google/'+p.id,prior=found.get(id);if(prior){if(!prior.specialty&&q.specialty)prior.specialty=q.specialty;continue;}
   found.set(id,{id,name:name.slice(0,200),address:(p.formattedAddress??'').slice(0,500),lat:point.lat,lng:point.lng,distanceM:Math.round(distanceM),category:(p.primaryTypeDisplayName?.text??types[0]??'').slice(0,200),sourceUrl:regionalCompetitorUrl(id),
    specialty:q.specialty,rating:typeof p.rating==='number'&&p.rating>=0&&p.rating<=5?p.rating:null,reviewCount:Number.isSafeInteger(p.userRatingCount)&&p.userRatingCount!>=0?p.userRatingCount!:null,phone:p.nationalPhoneNumber?.slice(0,40)??null,website:httpUrl(p.websiteUri)});
  }
 }));
 if(!answered)throw Error('PLACES_UNAVAILABLE');
 return {specialties,competitors:[...found.values()].sort((a,b)=>a.distanceM-b.distanceM||a.id.localeCompare(b.id)).slice(0,50)};
}
async function osmCompetitors(center:RegionalPoint,radiusM:number,transport:typeof fetch){
 const {lat,lng}=center,around='(around:'+radiusM+','+lat+','+lng+')';
 const query='[out:json][timeout:20];(nwr["healthcare"~"^(doctor|clinic|hospital|dentist|physiotherapist|psychotherapist|psychologist)$"]'+around+';nwr["amenity"~"^(doctors|clinic|hospital|dentist)$"]'+around+';);out center tags;';
 const parsed=elements.parse(await read('https://overpass-api.de/api/interpreter',transport,new URLSearchParams({data:query}).toString()));
 if(parsed.remark)throw Error('MAP_PROVIDER_INCOMPLETE');
 const seen=new Set<string>(),list:RegionalMap['competitors']=[];
 for(const place of parsed.elements){const tags=place.tags??{},name=tags.name?.trim(),lat=place.lat??place.center?.lat,lng=place.lon??place.center?.lon,category=tags.healthcare??tags.amenity??'';
  if(!name||!['doctor','clinic','hospital','dentist','physiotherapist','psychotherapist','psychologist','doctors'].includes(category)||lat===undefined||lng===undefined||!regionalPointSchema.safeParse({lat,lng}).success)continue;
  const distanceM=regionalDistance(center,{lat,lng}),id=place.type+'/'+place.id;if(distanceM>radiusM||seen.has(id))continue;seen.add(id);
  list.push({id,name:name.slice(0,200),address:[tags['addr:street'],tags['addr:housenumber'],tags['addr:suburb'],tags['addr:city']].filter(Boolean).join(', ').slice(0,500),lat,lng,distanceM:Math.round(distanceM),category:category.slice(0,200),sourceUrl:regionalCompetitorUrl(id)});
 }
 return list.sort((a,b)=>a.distanceM-b.distanceM||a.id.localeCompare(b.id)).slice(0,50);
}
export async function collectRegionalMap(municipalityId:string|undefined,request:RegionalMapRequest|undefined,transport:typeof fetch=fetch,options:RegionalMapOptions={}):Promise<RegionalMap>{
 const input=request?regionalMapRequestSchema.parse(request):undefined,key=options.persistentEvidence?undefined:options.placesKey?.trim();
 const result:RegionalMap={state:'pending',center:input?.center??null,viewport:null,radiusM:input?.radiusM??3000,locationConfirmed:Boolean(input),selectionConfirmed:false,...(input?{centerSource:'customer' as const}:{}),competitors:[],selectedIds:[],sourceUrl:'https://www.openstreetmap.org/copyright',message:'Marque e confirme a localização do seu atendimento para pesquisar estabelecimentos próximos. O centro do município serve apenas para navegar no mapa.'};
 if(!input){
  try{result.viewport=municipalityId?await viewport(municipalityId,transport):null;}catch{/* A missing map must not invent a coordinate. */}
  // The pin comes from the address confirmed in the profile. The customer can still move it and search again.
  if(key&&options.facts){try{const located=await locateAddress(options.facts,key,transport);if(located){result.center=located;result.locationConfirmed=true;result.centerSource='address';}}catch{/* Without a match, the customer marks the point manually. */}}
  if(!result.center)return result;
 }
 const center=result.center!,radiusM=result.radiusM,where=(result.centerSource==='address'?'do endereço do seu cadastro':'do ponto que você confirmou');
 if(key){
  try{const g=await googleCompetitors(center,radiusM,options.facts,key,transport,options.maxSpecialties??5);
   result.competitors=g.competitors;result.state='available';result.provider='google';result.sourceUrl='https://www.google.com/maps';
   result.message='Clínicas e consultórios encontrados no Google'+(g.specialties.length?' para '+g.specialties.join(', '):'')+', até '+radiusM/1000+' km '+where+'. A busca por especialidade é feita pelo Google e não confirma a área de atuação de cada local. Escolha somente os concorrentes relevantes. Distância em linha reta.';
   return result;
  }catch{/* Fall back to OpenStreetMap below. */}
 }
 try{
  result.competitors=await osmCompetitors(center,radiusM,transport);result.state='available';result.provider='osm';
  result.message='Estabelecimentos de saúde cadastrados no OpenStreetMap, até '+radiusM/1000+' km '+where+'. Escolha somente os concorrentes relevantes para suas especialidades. Cobertura colaborativa, possivelmente incompleta; distância em linha reta, não tempo de viagem.'+(key?' O Google Places não respondeu nesta coleta.':'');
 }catch{result.state='unavailable';result.message='Não foi possível consultar os estabelecimentos. A localização foi preservada. Falha na fonte não significa ausência de concorrentes.';}
 return result;
}
