'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {BarChart3,MapPin,RefreshCw,Users} from 'lucide-react';
import {Button} from '@askadia/ui';
import {regionalPointSchema} from '@askadia/contracts';
import type {PopulationGroup,RegionalReview,VisualJob,RegionalMapRequest,RegionalPoint,RegionalMap as MapData,TopicSource} from '@askadia/contracts';
import {journeyApi} from '../lib/journey-api';
import {PreparationStatus} from './preparation-status';
import {RegionalMap} from './regional-map';
import s from './regional-audience.module.css';
const number=(v:number|null|undefined)=>v===null||v===undefined?'Indisponível':v.toLocaleString('pt-BR');
export function RegionalAudienceReview({companyId,review,available,write,onChanged,onDirtyChange,address}:{companyId:string;review:RegionalReview;available:boolean;write:boolean;onChanged:()=>Promise<void>;onDirtyChange?:(value:boolean)=>void;address?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[localDirty,setLocalDirty]=useState(false);
 const dirtyChanged=useCallback((dirty:boolean)=>{setLocalDirty(dirty);onDirtyChange?.(dirty);},[onDirtyChange]);const lock=useRef(false);
 const request=useCallback(async(refresh=false,map?:RegionalMapRequest)=>{if(lock.current||!available||!write)return;lock.current=true;setBusy(true);setError('');try{await journeyApi('companies/'+companyId+'/regional-research',{refresh,...(map?{map}:{})});await onChanged();}catch(e){setError(e instanceof Error?e.message:'Não foi possível iniciar a coleta.');}finally{lock.current=false;setBusy(false);}},[available,companyId,onChanged,write]);
 useEffect(()=>{if(review.revision===0&&available&&write)void request();},[review.revision,available,write,request]);
 const data=review.data,collecting=review.revision>0&&['pending','running'].includes(review.status);
 async function select(ids:string[]){if(lock.current||!write)return;lock.current=true;setBusy(true);setError('');try{await journeyApi('companies/'+companyId+'/regional-research/competitors',{revision:review.revision,ids});await onChanged();}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a seleção.');}finally{lock.current=false;setBusy(false);}}
 return <section className={s.root} aria-label="Público da região">
  <header><div><span className={s.eyebrow}>01 · PÚBLICO DA REGIÃO</span><h3>{data?<><MapPin size={22}/>{data.city} · {data.uf}</>:'Conheça o contexto do seu atendimento.'}</h3><p>Público local, concorrentes escolhidos por você e assuntos relacionados às suas especialidades.</p></div>{write&&<Button variant="outline" disabled={busy||localDirty||!available||collecting} onClick={()=>void request(Boolean(review.id))}><RefreshCw size={15}/>{busy?'Solicitando…':data?'Atualizar coleta':'Iniciar coleta'}</Button>}</header>
  {!available&&<p className="info-note">A análise regional aguarda ativação no servidor. Seu cadastro está salvo.</p>}{error&&<p className="error-banner" role="alert">{error}</p>}
  {localDirty&&<p className="info-note">Confirme o ponto/raio e salve a seleção antes de atualizar ou aprovar a pesquisa.</p>}{available&&review.revision===0&&!busy&&!error&&<p className="info-note">A pesquisa ainda não foi iniciada.{!write?' O responsável pela conta pode iniciar a coleta.':''}</p>}
  {available&&collecting&&<PreparationStatus title="Preparando a análise da sua região" detail="Consultando as fontes para o município e as especialidades do seu cadastro. Cada fonte terá seu resultado ou sua limitação registrados." progress={review.progress??[]}/>}
  {busy&&!collecting&&<PreparationStatus title="Salvando sua escolha" detail="Registrando a solicitação e atualizando a versão da pesquisa."/>}{review.error&&<p className="info-note">{review.error}</p>}
  {data&&<>
   <p className={s.timestamp}>Coleta: {new Date(data.collectedAt).toLocaleString('pt-BR')} · versão {review.revision}. Uma nova coleta ou seleção exige nova aprovação.</p>
   <div className={s.dashboard} aria-label="Indicadores da região">
    <article><Users size={19}/><small>IBGE · população municipal</small><strong>{number(data.ibge.data?.population)}</strong><span>Censo {data.ibge.data?.year??'indisponível'} · município inteiro</span></article>
    <article><BarChart3 size={19}/><small>Google Trends · consultas relacionadas</small><strong>{data.trends.state==='available'?number(data.trends.rows.length):'Indisponível'}</strong><span>Consultas retornadas · recorte estadual</span></article>
    <article><MapPin size={19}/><small>Concorrentes selecionados</small><strong>{data.map?.selectionConfirmed?data.map.selectedIds.length:'A selecionar'}</strong><span>Raio {data.map?.radiusM?data.map.radiusM/1000+' km':'a confirmar'} · OpenStreetMap</span></article>
   </div>
   <div className={s.researchGrid}>
    <article className={s.source}><header><h4>Seu território de atendimento</h4><span className={s.sourceTag}>Mapa e concorrentes</span></header>{address&&<p><strong>Endereço confirmado:</strong> {address}</p>}{data.map?<MapReview key={review.id+'_'+review.revision} data={data.map} disabled={!write||busy||collecting} onSearch={map=>void request(true,map)} onSave={ids=>void select(ids)} onDirtyChange={dirtyChanged}/>:<p>Atualize a coleta para incluir o mapa e escolher os concorrentes nesta pesquisa.</p>}</article>
    <article className={s.source}><header><h4>Pesquisas e assuntos relacionados</h4><span className={s.sourceTag}>Fontes e períodos</span></header><p>{data.specialties?.join(' · ')??data.trends.query}</p>
     <section><h5>Google Trends · interesse relativo</h5><p>{data.trends.message}</p><small>{data.trends.region} · {data.trends.period}</small>{data.trends.rows.length>0&&<ol className={s.trends}>{data.trends.rows.slice(0,20).map((row,i)=><li key={row.term+i}><span>{row.term}</span><div><i style={{width:row.interest+'%'}}/></div><strong>{row.interest}</strong></li>)}</ol>}<a href={data.trends.sourceUrl} target="_blank" rel="noreferrer">Consultar Google Trends ↗</a></section>
     {data.topics&&<><Topics title="Google Trends · pesquisas em crescimento" source={data.topics.google}/></>}
    </article>
   </div>
   <div className={s.researchGrid}>
    <article className={s.source}><header><h4>Perfil da população · IBGE</h4><span className={s.sourceTag}>Município</span></header><p>{data.ibge.message}</p>{data.ibge.data&&<><div className={s.stats}><div><small>Área territorial</small><strong>{number(data.ibge.data.areaKm2)} <em>km²</em></strong></div><div><small>Densidade municipal</small><strong>{number(data.ibge.data.density)} <em>hab./km²</em></strong></div></div><div className={s.breakdowns}><PopulationBars title="Faixas etárias" groups={data.ibge.ages} total={data.ibge.data.population}/><PopulationBars title="Sexo informado no Censo" groups={data.ibge.sex} total={data.ibge.data.population}/></div></>}<a href={data.ibge.sourceUrl} target="_blank" rel="noreferrer">Consultar o IBGE ↗</a></article>
    
   </div>
  </>}
 </section>;
}
function Topics({title,source}:{title:string;source:TopicSource}){return <section className={s.topic}><h5>{title}</h5><p>{source.message}</p><small>{source.region} · {source.period}</small>{source.rows.length>0&&<ul>{source.rows.slice(0,20).map((row,i)=><li key={row.sourceUrl+i}><a href={row.sourceUrl} target="_blank" rel="noreferrer">{row.term}</a><small>{row.specialty} · {row.metricLabel}{row.metricValue===null?'':' · '+number(row.metricValue)}</small></li>)}</ul>}<a href={source.sourceUrl} target="_blank" rel="noreferrer">Consultar a fonte ↗</a></section>;}
function MapReview({data,disabled,onSearch,onSave,onDirtyChange}:{data:MapData;disabled:boolean;onSearch:(input:RegionalMapRequest)=>void;onSave:(ids:string[])=>void;onDirtyChange?: (dirty:boolean)=>void}){
 const [latInput,setLatInput]=useState(data.center?String(data.center.lat):''),[lngInput,setLngInput]=useState(data.center?String(data.center.lng):'');
 const point=useMemo(()=>{if(!latInput.trim()||!lngInput.trim())return null;const parsed=regionalPointSchema.safeParse({lat:Number(latInput),lng:Number(lngInput)});return parsed.success?parsed.data:null;},[latInput,lngInput]);
 const setPoint=(p:RegionalPoint)=>{setLatInput(String(p.lat));setLngInput(String(p.lng));};
 const [radius,setRadius]=useState<RegionalMapRequest['radiusM']>(data.radiusM),[ids,setIds]=useState(data.selectedIds);
 const mapDirty=(!point&&Boolean(latInput.trim()||lngInput.trim()))||JSON.stringify(point)!==JSON.stringify(data.center)||radius!==data.radiusM;
 const selectionDirty=JSON.stringify([...ids].sort())!==JSON.stringify([...data.selectedIds].sort());
 useEffect(()=>{onDirtyChange?.(mapDirty||selectionDirty);return()=>onDirtyChange?.(false);},[mapDirty,selectionDirty,onDirtyChange]);
 const toggle=(id:string)=>setIds(current=>current.includes(id)?current.filter(v=>v!==id):current.length<20?[...current,id]:current);
 return <><p>{data.message}</p><RegionalMap data={data} point={point} radiusM={radius} selected={ids} onPoint={setPoint} onToggle={toggle} disabled={disabled}/><div className={s.mapControls}><label>Raio de atendimento<select value={radius} disabled={disabled} onChange={e=>setRadius(Number(e.target.value) as RegionalMapRequest['radiusM'])}>{[1000,3000,5000,10000].map(r=><option key={r} value={r}>{r/1000} km</option>)}</select></label><label>Latitude<input type="number" min={-34} max={6} step="any" value={latInput} disabled={disabled} onChange={e=>setLatInput(e.target.value)}/></label><label>Longitude<input type="number" min={-74} max={-28} step="any" value={lngInput} disabled={disabled} onChange={e=>setLngInput(e.target.value)}/></label></div>
  <Button variant="outline" disabled={disabled||!point||!mapDirty&&data.locationConfirmed&&data.state==='available'} onClick={()=>{if(point)onSearch({center:point,radiusM:radius});}}>Confirmar localização e buscar</Button><p className={s.scope}>O ponto é confirmado por você. O círculo orienta a busca de estabelecimentos; IBGE e Facebook continuam representando o município.</p>
  {data.locationConfirmed&&<><h5>Quais são seus concorrentes? · {ids.length}/20</h5>{mapDirty?<p>Confirme o novo ponto ou raio para atualizar esta lista antes de selecionar.</p>:<><div className={s.competitors}>{data.competitors.map(c=><label key={c.id}><input type="checkbox" checked={ids.includes(c.id)} disabled={disabled||!ids.includes(c.id)&&ids.length>=20} onChange={()=>toggle(c.id)}/><span><strong>{c.name}</strong><small>{c.address||'Endereço não informado na fonte'} · {(c.distanceM/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} km</small><a href={c.sourceUrl} target="_blank" rel="noreferrer">Ver cadastro na fonte ↗</a></span></label>)}</div>{data.competitors.length===0&&<p>{data.state==='available'?'Nenhum estabelecimento retornado por esta fonte neste raio. Isso não comprova ausência de concorrência.':'A lista de estabelecimentos está indisponível nesta coleta.'}</p>}<Button disabled={disabled||data.selectionConfirmed&&!selectionDirty} onClick={()=>onSave(ids)}>{data.selectionConfirmed&&!selectionDirty?'Seleção salva':ids.length?'Confirmar concorrentes selecionados':'Confirmar sem concorrentes selecionados'}</Button></>}</>}
 </>;
}
function PopulationBars({title,groups,total}:{title:string;groups:PopulationGroup[];total:number|null}){
 return <section><h5>{title}</h5>{groups.length?groups.map(group=><div key={group.label} className={s.bar}><div><span>{group.label}</span><strong>{number(group.count)}{total!==null&&total>0?' · '+(group.count/total*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':''}</strong></div><div aria-hidden="true"><i style={{width:total&&total>0?Math.min(100,group.count/total*100)+'%':'0%'}}/></div></div>):<p>Distribuição indisponível nesta coleta.</p>}</section>;
}
export function MedicalBrandStatus({companyId}:{companyId:string}){
 const [jobs,setJobs]=useState<VisualJob[]>([]),[available,setAvailable]=useState(true),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();let timer:ReturnType<typeof setTimeout>;let enabled=true,delay=300000;
  async function read(){try{if(document.hidden)return;const r=await journeyApi<{jobs:VisualJob[];available:boolean}>('companies/'+companyId+'/visual-jobs',undefined,c.signal);if(!c.signal.aborted){const brands=r.jobs.filter(j=>j.kind==='brand_logo');enabled=r.available;delay=brands.some(j=>j.status==='pending'||j.status==='running')?15000:300000;setJobs(brands);setAvailable(r.available);setError('');}}catch{delay=300000;if(!c.signal.aborted)setError('Não foi possível consultar a proposta de logo.');}finally{if(!c.signal.aborted&&enabled)timer=setTimeout(()=>void read(),document.hidden?60000:delay);}}
  void read();return()=>{c.abort();clearTimeout(timer);};
 },[companyId]);
 if(!jobs.length&&!error)return null;
 return <aside className={s.brand}><strong>Sua identidade visual</strong>{error?<p>{error}</p>:jobs.slice(0,1).map(job=><div key={job.id}>{job.status==='completed'&&job.result_attachment_id?<><p>Sua proposta de logo está pronta para revisão.</p><a target="_blank" rel="noreferrer" href={'/api/onboarding/companies/'+companyId+'/attachments/'+job.result_attachment_id}>Abrir proposta de logo ↗</a></>:<p>{!available?'A geração do logo aguarda a configuração do provedor.':job.error??(job.status==='running'?'Preparando sua proposta de logo…':'Sua proposta de logo está na fila de criação.')}</p>}<small>Rascunho da identidade da clínica; a geração não publica nenhum material.</small></div>)}</aside>;
}
