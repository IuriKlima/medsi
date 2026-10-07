'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {MapPin,RefreshCw} from 'lucide-react';
import {Button} from '@askadia/ui';
import {regionalPointSchema} from '@askadia/contracts';
import type {RegionalReview,VisualJob,RegionalMapRequest,RegionalPoint,RegionalMap as MapData} from '@askadia/contracts';
import {journeyApi} from '../lib/journey-api';
import {PreparationStatus} from './preparation-status';
import {RegionalMap} from './regional-map';
import s from './regional-audience.module.css';
export function RegionalAudienceReview({companyId,review,available,write,onChanged,onDirtyChange,address}:{companyId:string;review:RegionalReview;available:boolean;write:boolean;onChanged:()=>Promise<void>;onDirtyChange?:(value:boolean)=>void;address?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[localDirty,setLocalDirty]=useState(false);
 const dirtyChanged=useCallback((dirty:boolean)=>{setLocalDirty(dirty);onDirtyChange?.(dirty);},[onDirtyChange]);const lock=useRef(false);
 const request=useCallback(async(refresh=false,map?:RegionalMapRequest)=>{if(lock.current||!available||!write)return;lock.current=true;setBusy(true);setError('');try{await journeyApi('companies/'+companyId+'/regional-research',{refresh,...(map?{map}:{})});await onChanged();}catch(e){setError(e instanceof Error?e.message:'Não foi possível iniciar a coleta.');}finally{lock.current=false;setBusy(false);}},[available,companyId,onChanged,write]);
 useEffect(()=>{if(review.revision===0&&available&&write)void request();},[review.revision,available,write,request]);
 const data=review.data,collecting=review.revision>0&&['pending','running'].includes(review.status);
 async function select(ids:string[],confirmedIds:string[]){if(lock.current||!write)return;lock.current=true;setBusy(true);setError('');try{await journeyApi('companies/'+companyId+'/regional-research/competitors',{revision:review.revision,ids,confirmedIds});await onChanged();}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a seleção.');}finally{lock.current=false;setBusy(false);}}
 return <section className={s.root} aria-label="Público da região">
  <header><div><span className={s.eyebrow}>01 · PÚBLICO DA REGIÃO</span><h3>{data?<><MapPin size={22}/>{data.city} · {data.uf}</>:'Conheça o contexto do seu atendimento.'}</h3><p>Público local, concorrentes escolhidos por você e assuntos relacionados às suas especialidades.</p></div>{write&&<Button variant="outline" disabled={busy||localDirty||!available||collecting} onClick={()=>void request(Boolean(review.id))}><RefreshCw size={15}/>{busy?'Solicitando…':data?'Atualizar coleta':'Iniciar coleta'}</Button>}</header>
  {!available&&<p className="info-note">A análise regional aguarda ativação no servidor. Seu cadastro está salvo.</p>}{error&&<p className="error-banner" role="alert">{error}</p>}
  {localDirty&&<p className="info-note">Confirme o ponto/raio e salve a seleção antes de atualizar ou aprovar a pesquisa.</p>}{available&&review.revision===0&&!busy&&!error&&<p className="info-note">A pesquisa ainda não foi iniciada.{!write?' O responsável pela conta pode iniciar a coleta.':''}</p>}
  {available&&collecting&&<PreparationStatus title="Preparando a análise da sua região" detail="Consultando as fontes para o município e as especialidades do seu cadastro. Cada fonte terá seu resultado ou sua limitação registrados." progress={review.progress??[]}/>}
  {busy&&!collecting&&<PreparationStatus title="Salvando sua escolha" detail="Registrando a solicitação e atualizando a versão da pesquisa."/>}{review.error&&<p className="info-note">{review.error}</p>}
  {data&&<>
   <p className={s.timestamp}>Coleta: {new Date(data.collectedAt).toLocaleString('pt-BR')} · versão {review.revision}. Uma nova coleta ou seleção exige nova aprovação.</p>
   {data.map?<MapReview companyId={companyId} profileVersion={review.profileVersion} key={companyId+'_'+review.profileVersion+'_'+review.id+'_'+review.revision} data={data.map} address={address} disabled={!write||busy||collecting} onSearch={map=>void request(true,map)} onSave={(ids,confirmedIds)=>void select(ids,confirmedIds)} onDirtyChange={dirtyChanged}/>:<p>Atualize a coleta para incluir o mapa e escolher os concorrentes nesta pesquisa.</p>}
  </>}
 </section>;
}
function MapReview({companyId,profileVersion,data,address,disabled,onSearch,onSave,onDirtyChange}:{companyId:string;profileVersion?:number;data:MapData;address?:string;disabled:boolean;onSearch:(input:RegionalMapRequest)=>void;onSave:(ids:string[],confirmedIds:string[])=>void;onDirtyChange?: (dirty:boolean)=>void}){
 const [latInput,setLatInput]=useState(data.center?String(data.center.lat):''),[lngInput,setLngInput]=useState(data.center?String(data.center.lng):'');
 const point=useMemo(()=>{if(!latInput.trim()||!lngInput.trim())return null;const parsed=regionalPointSchema.safeParse({lat:Number(latInput),lng:Number(lngInput)});return parsed.success?parsed.data:null;},[latInput,lngInput]);
 const manuallyEdited=useRef(false);const setPoint=(p:RegionalPoint)=>{manuallyEdited.current=true;setLatInput(String(p.lat));setLngInput(String(p.lng));};
 const [preview,setPreview]=useState<MapData|null>(null),[previewMessage,setPreviewMessage]=useState('');
 const previewRequest=useRef<Promise<{map:MapData|null;message:string}>|null>(null);
 useEffect(()=>{if(data.center||disabled||!profileVersion)return;let active=true;previewRequest.current??=journeyApi('companies/'+companyId+'/regional-research/map-preview',{requestId:crypto.randomUUID(),profileVersion});void previewRequest.current.then(result=>{if(!active||manuallyEdited.current)return;setPreviewMessage(result.message);if(result.map?.center){setPreview(result.map);setLatInput(String(result.map.center.lat));setLngInput(String(result.map.center.lng));}}).catch(error=>{if(active)setPreviewMessage(error instanceof Error?error.message:'Não foi possível localizar o endereço. Marque o ponto no mapa.');});return()=>{active=false;};},[companyId,profileVersion,data.center,disabled]);
 const [radius,setRadius]=useState<RegionalMapRequest['radiusM']>(data.radiusM),[ids,setIds]=useState(data.selectedIds);
 const mapDirty=(!point&&Boolean(latInput.trim()||lngInput.trim()))||JSON.stringify(point)!==JSON.stringify(data.center)||radius!==data.radiusM;
 const selectionDirty=JSON.stringify([...ids].sort())!==JSON.stringify([...data.selectedIds].sort());
 useEffect(()=>{onDirtyChange?.(mapDirty||selectionDirty);return()=>onDirtyChange?.(false);},[mapDirty,selectionDirty,onDirtyChange]);
 const toggle=(id:string)=>setIds(current=>current.includes(id)?current.filter(v=>v!==id):current.length<20?[...current,id]:current);
 const [focus,setFocus]=useState<{id:string;nonce:number}|undefined>();
 const display=preview??data,compatible=display.competitors.filter(c=>c.relevance?.status==='compatible'),ambiguous=[...(display.reviewCandidates??[]),...display.competitors.filter(c=>!c.relevance||c.relevance.status==='ambiguous')];
 const maySelect=!disabled&&data.locationConfirmed&&!mapDirty;
 const mapped={...display,competitors:[...compatible,...ambiguous.filter(c=>ids.includes(c.id)||focus?.id===c.id)]};
 const row=(c:MapData['competitors'][number],needsConfirmation=false)=><div key={c.id} className={s.competitorRow}>
  <label><input type="checkbox" aria-label={(needsConfirmation?'Confirmo a compatibilidade de ':'Selecionar ')+c.name} checked={ids.includes(c.id)} disabled={!maySelect||!ids.includes(c.id)&&ids.length>=20} onChange={()=>toggle(c.id)}/><span><strong>{c.name}</strong><small>{c.address||'Endereço não informado'} · {(c.distanceM/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} km</small><small>{c.relevance?.reason??'Sem evidência suficiente. Confirme os serviços antes de selecionar.'}</small>{needsConfirmation&&<small>Ao selecionar, confirmo que os serviços deste local são compatíveis com meu cadastro.</small>}{c.relevance?.evidence.map((e,i)=><small key={e.kind+i}>Evidência da fonte: {e.value}</small>)}</span></label>
  <div className={s.rowActions}><button type="button" onClick={()=>setFocus({id:c.id,nonce:Date.now()})}>Ver no mapa</button>{ids.includes(c.id)&&<button type="button" disabled={!maySelect} onClick={()=>toggle(c.id)}>Remover</button>}<a href={c.sourceUrl} target="_blank" rel="noreferrer">Ver fonte ↗</a></div>
 </div>;
 return <div className={s.researchGrid}>
  <article className={s.source}><header><h4>Seu território de atendimento</h4></header>{address&&<p><strong>Endereço confirmado:</strong> {address}</p>}<p>{previewMessage||data.message}</p>
   <RegionalMap data={mapped} point={point} radiusM={radius} selected={ids} focus={focus} onPoint={setPoint} onToggle={id=>{if(maySelect&&compatible.some(c=>c.id===id))toggle(id);}} disabled={disabled}/>
   <div className={s.mapControls}><label>Raio de atendimento<select value={radius} disabled={disabled} onChange={e=>setRadius(Number(e.target.value) as RegionalMapRequest['radiusM'])}>{[1000,3000,5000,10000].map(r=><option key={r} value={r}>{r/1000} km</option>)}</select></label><label>Latitude<input type="number" min={-34} max={6} step="any" value={latInput} disabled={disabled} onChange={e=>{manuallyEdited.current=true;setLatInput(e.target.value);}}/></label><label>Longitude<input type="number" min={-74} max={-28} step="any" value={lngInput} disabled={disabled} onChange={e=>{manuallyEdited.current=true;setLngInput(e.target.value);}}/></label></div>
   <Button variant="outline" disabled={disabled||!point||!mapDirty&&data.locationConfirmed&&data.state==='available'} onClick={()=>{if(point)onSearch({center:point,radiusM:radius});}}>Confirmar localização e buscar</Button><p className={s.scope}>Confira o ponto do endereço. A seleção considera os serviços do cadastro e as evidências de cada estabelecimento.</p>
  </article>
  <aside className={s.source} aria-label="Lista de concorrentes"><header><h4>Concorrentes</h4><span>{ids.length}/20 selecionados</span></header>
   {mapDirty||!data.locationConfirmed?<p>Confirme o ponto e o raio antes de salvar os concorrentes.</p>:null}
   <div className={s.competitors}>{compatible.map(c=>row(c))}</div>
   {!compatible.length&&<p role="status">{display.state==='available'?'Nenhum concorrente com compatibilidade comprovada nesta pesquisa.':'A pesquisa de concorrentes ainda não está disponível.'}</p>}
   {ambiguous.length>0&&<section className={s.ambiguous}><h5>A confirmar · {ambiguous.length}</h5><p>Estes locais não têm evidência suficiente dos seus serviços. Confira a fonte antes de confirmar.</p><div className={s.competitors}>{ambiguous.map(c=>row(c,true))}</div></section>}
   <Button disabled={!maySelect||data.selectionConfirmed&&!selectionDirty} onClick={()=>onSave(ids,ids.filter(id=>ambiguous.some(c=>c.id===id)))}>{data.selectionConfirmed&&!selectionDirty?'Seleção salva':ids.length?'Salvar concorrentes selecionados':'Confirmar sem concorrentes selecionados'}</Button>
  </aside>
 </div>;
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
