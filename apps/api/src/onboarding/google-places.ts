import {distanceMeters,type OnboardingSnapshot,type PlaceOption,type PlaceSearchResult} from '@askadia/contracts';

type GooglePlace={id?:string;displayName?:{text?:string};formattedAddress?:string;location?:{latitude:number;longitude:number};googleMapsUri?:string;attributions?:{provider?:string;providerUri?:string}[];primaryTypeDisplayName?:{text?:string};nationalPhoneNumber?:string;internationalPhoneNumber?:string;websiteUri?:string;regularOpeningHours?:{weekdayDescriptions?:string[]};rating?:number;userRatingCount?:number;businessStatus?:string};
const fields=['id','displayName','formattedAddress','location','googleMapsUri','attributions','primaryTypeDisplayName','nationalPhoneNumber','internationalPhoneNumber','websiteUri','regularOpeningHours','rating','userRatingCount','businessStatus'];
const publicUrl=(value?:string)=>{try{const u=new URL(value??'');return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
function point(p:GooglePlace){const l=p.location;return l&&Number.isFinite(l.latitude)&&Number.isFinite(l.longitude)&&Math.abs(l.latitude)<=90&&Math.abs(l.longitude)<=180?l:undefined;}
function option(p:GooglePlace):PlaceOption{
 const location=point(p);
 return {id:p.id!,name:p.displayName?.text??'Estabelecimento',address:p.formattedAddress??'',latitude:location?.latitude??null,longitude:location?.longitude??null,
  url:publicUrl(p.googleMapsUri)??'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.displayName?.text??'Estabelecimento')+'&query_place_id='+encodeURIComponent(p.id!),
  attributions:(p.attributions??[]).map(a=>({displayName:a.provider??'',uri:publicUrl(a.providerUri)??''})),
  details:{businessType:p.primaryTypeDisplayName?.text??null,phone:p.nationalPhoneNumber??p.internationalPhoneNumber??null,website:publicUrl(p.websiteUri),hours:p.regularOpeningHours?.weekdayDescriptions??[],rating:typeof p.rating==='number'?p.rating:null,reviewCount:typeof p.userRatingCount==='number'?p.userRatingCount:null,businessStatus:p.businessStatus??null,collectedAt:new Date().toISOString()}};
}
/** Live Places responses stay in the request/UI. Only IDs and client-confirmed facts are persisted. */
export class GooglePlacesAdapter{
 constructor(private readonly key:string,private readonly transport:typeof fetch=fetch){}
 private async request(path:string,mask:string,body?:unknown){
  const response=await this.transport('https://places.googleapis.com/v1/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Goog-Api-Key':this.key,'X-Goog-FieldMask':mask},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Google Places unavailable');return response.json();
 }
 async detail(id:string):Promise<PlaceOption>{
  if(!/^[\w-]{5,200}$/.test(id))throw new Error('Invalid place ID');
  const p=await this.request('places/'+encodeURIComponent(id)+'?languageCode=pt-BR&regionCode=BR',fields.join(',')) as GooglePlace;
  if(p.id!==id)throw new Error('Place mismatch');return option(p);
 }
 async search(snapshot:OnboardingSnapshot,kind:'location'|'competitors',radius:number):Promise<PlaceSearchResult>{
  const facts=snapshot.state.facts;let center:{latitude:number;longitude:number}|undefined;
  if(kind==='competitors'&&facts.placeId?.value){const own=await this.detail(facts.placeId.value);if(own.latitude!==null&&own.longitude!==null)center={latitude:own.latitude,longitude:own.longitude};else throw new Error('Location unavailable');}
  const query=kind==='location'?[facts.name?.value,facts.city?.value]:[facts.businessType?.value??'clínica',facts.city?.value,facts.address?.value];
  const data=await this.request('places:searchText',fields.map(f=>'places.'+f).join(','),{textQuery:query.filter(Boolean).join(' '),languageCode:'pt-BR',regionCode:'BR',pageSize:20,...(center?{locationBias:{circle:{center,radius}}}:{})}) as {places?:GooglePlace[]};
  if(data.places!==undefined&&!Array.isArray(data.places))throw new Error('Invalid places');
  const ids=new Set<string>();const places=(data.places??[]).flatMap(p=>{
   if(!p.id||!p.displayName?.text||ids.has(p.id)||p.businessStatus==='CLOSED_PERMANENTLY')return [];ids.add(p.id);
   if(kind==='competitors'){
    if(p.id===facts.placeId?.value)return [];
    if(!facts.placeId?.value&&p.displayName.text.toLocaleLowerCase('pt-BR')===facts.name?.value?.toLocaleLowerCase('pt-BR'))return [];
    const location=point(p);if(center&&(!location||distanceMeters(center,location)>radius))return [];
   }
   return [option(p)];
  });
  return {status:'available',places,radius:center?radius:null,...(center?{center}:{}),message:kind==='location'?'Encontrei estas opções. Confira qual é sua clínica e os dados do cadastro.':center?'Concorrentes encontrados dentro do raio escolhido. Selecione até 10 para acompanhar.':'Sugestões pela cidade. Confirme o local no Google para pesquisar por distância.',...(process.env.GOOGLE_MAPS_BROWSER_KEY?{mapKey:process.env.GOOGLE_MAPS_BROWSER_KEY}:{})};
 }
}
export async function places(snapshot:OnboardingSnapshot,kind:'location'|'competitors',radius=3000):Promise<PlaceSearchResult>{
 const key=process.env.GOOGLE_PLACES_SERVER_KEY;if(!key)return {status:'unconfigured',places:[],radius:null,message:'A pesquisa de locais ainda não está configurada. Informe os dados manualmente e continue.'};
 return new GooglePlacesAdapter(key).search(snapshot,kind,radius);
}
