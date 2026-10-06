'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@askadia/ui';
import {MapPin} from 'lucide-react';
import type {FactInput,OnboardingSnapshot,PlaceOption,PlaceSearchResult,ProfileKey} from '@askadia/contracts';
import {journeyApi} from '../lib/journey-api';
import {PlacesMap} from './places-map';
import styles from './journey.module.css';
type Props={companyId:string;data:OnboardingSnapshot;disabled:boolean;onSend:(message:string,action:'confirm_location',answers?:Partial<Record<ProfileKey,FactInput>>)=>Promise<boolean>;onSaved:(data:OnboardingSnapshot)=>void};
export function OnboardingPlaces({companyId,data,disabled,onSend,onSaved}:Props){
 const [radius,setRadius]=useState(3000),[search,setSearch]=useState<PlaceSearchResult|null>(null),[selected,setSelected]=useState<string[]>([]),[map,setMap]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const pending=useRef<{key:string;id:string}|null>(null);const mounted=useRef(true),lock=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const kind=data.step==='location'?'location':'competitors';const facts=data.state.facts;
 const canSearch=data.capabilities.actions.includes('marketing.write');
 const queryKey=JSON.stringify([companyId,kind,facts.name?.value,facts.city?.value,facts.address?.value,facts.businessType?.value,facts.placeId?.value,radius]);
 useEffect(()=>{
  if(!canSearch)return;const controller=new AbortController();setLoading(true);setError('');setSearch(null);setSelected([]);
  const timer=setTimeout(()=>{void journeyApi<PlaceSearchResult>('companies/'+companyId+'/places',{requestId:crypto.randomUUID(),kind,radius},controller.signal).then(value=>{if(!controller.signal.aborted){setSearch(value);const previous=(facts.competitorPlaceIds?.value??'').split('\n');setSelected(kind==='competitors'?value.places.filter(p=>previous.includes(p.id)).map(p=>p.id):[]);}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Pesquisa indisponível. Você pode continuar manualmente.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},250);
  return()=>{clearTimeout(timer);controller.abort();};
 // The serialized key covers all inputs; unrelated answers must not repeat a paid Places request.
 },[queryKey,refresh,canSearch]);
 function toggle(id:string){if(kind==='location'){setSelected([id]);return;}setSelected(values=>values.includes(id)?values.filter(v=>v!==id):values.length<10?[...values,id]:values);}
 async function confirm(place:PlaceOption){
  const answers:Partial<Record<ProfileKey,FactInput>>={placeId:{value:place.id,status:'provided'}};
  const fill=(key:ProfileKey,value:string|null|undefined)=>{if(value?.trim()&&!facts[key]?.value)answers[key]={value:value.slice(0,6000),status:'provided'};};
  fill('address',place.address);fill('businessType',place.details?.businessType?.slice(0,100));fill('hours',place.details?.hours.join('\n'));
  fill('channels',[place.details?.website&&'Site: '+place.details.website,place.details?.phone&&'Telefone comercial: '+place.details.phone].filter(Boolean).join('\n'));
  await onSend('Conferi este estabelecimento e confirmo os dados comerciais exibidos.','confirm_location',answers);
 }
 async function review(){
  if(disabled||lock.current)return;lock.current=true;setSaving(true);setError('');
  const places=search?.places.filter(p=>selected.includes(p.id)).map(p=>({placeId:p.id,label:p.name.slice(0,160)}))??[];
  const key=JSON.stringify([companyId,data.state.revision,places]);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  try{const saved=await journeyApi<OnboardingSnapshot>('companies/'+companyId+'/places/review',{requestId:pending.current.id,revision:data.state.revision,places});if(mounted.current){pending.current=null;onSaved(saved);}}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Não foi possível salvar a seleção.');}finally{lock.current=false;if(mounted.current)setSaving(false);}
 }
 const blocked=disabled||saving;const chosen=search?.places.find(p=>p.id===selected[0]);
 return <section className={styles.placePanel}><div className={styles.cardHeading}><MapPin size={18}/><strong>{kind==='location'?'Encontre sua clínica':'Concorrentes próximos'}</strong><Button variant="outline" disabled={blocked||loading} onClick={()=>setRefresh(v=>v+1)}>{loading?'Pesquisando no Google…':'Pesquisar novamente'}</Button></div>
 {kind==='competitors'&&<label>Raio da pesquisa<select value={radius} disabled={blocked||loading} onChange={e=>setRadius(Number(e.target.value))}>{[1000,3000,5000,10000,20000].map(r=><option key={r} value={r}>{r/1000} km</option>)}</select></label>}
 {error&&<p role="alert" className="error-banner">{error}</p>}{loading&&<p role="status">{kind==='location'?'Procurando '+facts.name?.value+' em '+facts.city?.value+'…':'Pesquisando clínicas e negócios semelhantes na região…'}</p>}
 {search&&<><p role="status">{search.message}</p>{search.status==='available'&&<><p className={styles.attribution}>Google Maps · consulta atual · resultados por relevância e distância</p>{search.places.length===0&&<p>Nenhum local encontrado. Você pode corrigir o nome ou a cidade em Revisar perfil, ou informar os dados na conversa.</p>}
 {search.mapKey&&search.places.length>0&&<div className={styles.actions}><Button variant={map?'outline':'default'} onClick={()=>setMap(false)}>Lista e dados</Button><Button variant={map?'default':'outline'} onClick={()=>setMap(true)}>Mapa</Button></div>}
 {map&&<PlacesMap search={search} selected={selected} disabled={blocked} onSelect={toggle}/>}
 <div className={styles.places}>{(map?kind==='location'&&chosen?[chosen]:search.places.filter(p=>selected.includes(p.id)):search.places).map(p=><article key={p.id}><h3>{p.name}</h3><p>{p.address}</p><PlaceInformation place={p}/><a href={p.url} target="_blank" rel="noreferrer">Ver no Google Maps ↗</a>{p.attributions.map((a,i)=><small key={i}>{a.uri?<a href={a.uri} target="_blank" rel="noreferrer">{a.displayName}</a>:a.displayName}</small>)}
 {kind==='location'?<><p><small>Confira os dados antes de confirmar. Respostas que você já informou serão preservadas.</small></p><Button disabled={blocked} variant="outline" onClick={()=>void confirm(p)}>É minha clínica, confirmar dados</Button></>:<label><input type="checkbox" checked={selected.includes(p.id)} disabled={blocked||(!selected.includes(p.id)&&selected.length>=10)} onChange={()=>toggle(p.id)}/>Confirmo este concorrente</label>}</article>)}</div></> }</>}
 {kind==='location'?<Button variant="outline" disabled={blocked||loading} onClick={()=>void onSend('Confirmo manualmente a cidade ou o endereço informado.','confirm_location')}>Não encontrei, continuar com os dados informados</Button>:<><p>{selected.length} de 10 selecionados. Os nomes confirmados e os vínculos dos locais ficarão salvos para a pesquisa no Instagram.</p>{!data.provider.aiAllowed&&<p>A busca de perfis começa após a confirmação do plano e aparece na primeira etapa da Estratégia.</p>}<Button disabled={blocked||loading} onClick={()=>void review()}>{saving?'Salvando…':selected.length?'Salvar concorrentes e continuar':'Continuar com pesquisa pendente'}</Button></>}
 </section>;
}
export function PlaceInformation({place}:{place:PlaceOption}){const d=place.details;if(!d)return null;return <><p>{d.businessType}{d.businessStatus==='CLOSED_TEMPORARILY'?' · Temporariamente fechado':''}</p>{d.phone&&<p>Telefone: {d.phone}</p>}{d.website&&<p><a href={d.website} target="_blank" rel="noreferrer">Site do estabelecimento ↗</a></p>}{d.rating!==null&&<p>Avaliação no Google: {d.rating.toLocaleString('pt-BR')} / 5{d.reviewCount!==null?' · '+d.reviewCount+' avaliações':''}</p>}{d.hours.length>0&&<details><summary>Horários de funcionamento</summary>{d.hours.map(h=><div key={h}>{h}</div>)}</details>}</>;}
