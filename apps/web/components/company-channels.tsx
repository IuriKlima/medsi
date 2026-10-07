'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@askadia/ui';
import {CircleCheck,CircleDashed,RefreshCw} from 'lucide-react';
import {OfficialWhatsAppConnection} from './official-whatsapp-connection';
import {PaidAds} from './paid-ads';
import {MetaAuthorization} from './meta-authorization';
import {journeyApi,JourneyError} from '../lib/journey-api';
import {recoverMetaSelection,clearMetaSelection,metaSelectionStorage} from '../lib/meta-selection';
import styles from './journey.module.css';
import meta from './meta-connection.module.css';
type Channel={provider:'meta'|'evolution'|'whatsapp_cloud';status:string;name:string;metadata:Record<string,unknown>};
type Connections={channels:Channel[];canConnect:boolean;metaConfigured:boolean;evolutionConfigured:boolean;webhookConfigured:boolean};
type Page={id:string;name:string;instagramName?:string;instagramId?:string;canConnect?:boolean};
type PagesResponse={pages:Page[];instagramUnavailable?:boolean;missingPagePermission?:boolean};
export function CompanyChannels({companyId}:{companyId:string}){
 const [data,setData]=useState<Connections|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[qr,setQr]=useState<string|null>(null),[message,setMessage]=useState(''),[pages,setPages]=useState<Page[]>([]),[session,setSession]=useState('');
 const [pagesLoading,setPagesLoading]=useState(false),[pagesError,setPagesError]=useState(''),[instagramUnavailable,setInstagramUnavailable]=useState(false),[missingPagePermission,setMissingPagePermission]=useState(false),[search,setSearch]=useState('');
 const lock=useRef(false),selector=useRef<HTMLHeadingElement>(null);const base='companies/'+companyId+'/channels';
 const load=useCallback(async(signal?:AbortSignal)=>{const d=await journeyApi<Connections>(base,undefined,signal);if(!signal?.aborted)setData(d);},[base]);
 const loadPages=useCallback(async(id:string,refresh=false,signal?:AbortSignal)=>{
  setPagesLoading(true);setPagesError('');
  try{const result=await journeyApi<PagesResponse>(base+'/meta/pages',{sessionId:id,refresh},signal);if(!signal?.aborted){setPages(result.pages);setInstagramUnavailable(Boolean(result.instagramUnavailable));setMissingPagePermission(Boolean(result.missingPagePermission));}}
  catch(e){if(!signal?.aborted){setPages([]);const message=e instanceof Error?e.message:'Não foi possível carregar as Páginas.';setPagesError(message);if(e instanceof JourneyError&&e.status===409){clearMetaSelection(metaSelectionStorage(),companyId);setSession('');setError(message);const url=new URL(window.location.href);url.searchParams.delete('meta_session');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}}}
  finally{if(!signal?.aborted)setPagesLoading(false);}
 },[base,companyId]);
 useEffect(()=>{
  const c=new AbortController(),params=new URLSearchParams(window.location.search);setData(null);setPages([]);setSession('');setPagesError('');setSearch('');setError('');
  void load(c.signal).catch(e=>{if(!c.signal.aborted)setError(e.message);});
  if(params.get('meta_error'))setError('A autorização Meta não foi concluída. Tente conectar novamente.');
  const pending=recoverMetaSelection(metaSelectionStorage(),companyId,params.get('meta_session'));
  if(pending){setSession(pending);void loadPages(pending,false,c.signal);}else if(params.has('meta_session')){setError('A seleção de Página expirou. Conecte novamente para continuar.');const url=new URL(window.location.href);url.searchParams.delete('meta_session');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}
  return()=>c.abort();
 },[companyId,load,loadPages]);
 useEffect(()=>{if(session&&!pagesLoading&&data){selector.current?.scrollIntoView({block:'start',behavior:'smooth'});selector.current?.focus({preventScroll:true});}},[session,pagesLoading,Boolean(data)]);
 async function act(path:string,body:unknown={}){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   const r=await journeyApi<{url?:string;qr?:string|null;message?:string}>(base+'/'+path,body);
   if(r.url){const u=new URL(r.url);if(u.protocol!=='https:'||u.hostname!=='www.facebook.com')throw new Error('Destino de autorização inválido.');clearMetaSelection(metaSelectionStorage(),companyId);window.location.assign(u.href);return;}
   if(path==='evolution/connect')setQr(r.qr??null);if(r.message)setMessage(r.message);
   if(path==='evolution/status'){setQr(null);setMessage('Verificação concluída. O estado atualizado aparece abaixo.');}
   if(path==='meta/select'){setPages([]);setSession('');clearMetaSelection(metaSelectionStorage(),companyId);const cleaned=new URL(window.location.href);cleaned.searchParams.delete('meta_session');cleaned.searchParams.delete('meta_error');window.history.replaceState(null,'',cleaned.pathname+cleaned.search+cleaned.hash);setMessage('Página integrada a esta empresa.');}
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível conectar.');}finally{lock.current=false;setBusy(false);}
 }
 const channel=data?.channels.find(c=>c.provider==='meta'),connected=channel?.status==='connected';
 const matches=pages.filter(p=>(p.name+' '+(p.instagramName??'')+' '+p.id).toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
 return <section className={styles.moduleCard}><h2>Contas desta empresa</h2><p>Cada empresa autoriza seus próprios canais. O cadastro da empresa não cria uma instância de WhatsApp.</p>
  {error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status">{message}</p>}{!data&&!error&&<p>Consultando conexões…</p>}
  {data&&<><section className={styles.moduleCard}><h3>Facebook e Instagram</h3><span className="tag">{session?<><CircleDashed size={16}/>Escolha a Página abaixo</>:connected?<><CircleCheck size={16}/>Conectado</>:<><CircleDashed size={16}/>Autorize no Facebook para escolher a Página</>}</span>
   {connected&&<p>Conta autorizada: <strong>{channel.name}</strong></p>}
   {!data.metaConfigured&&<p>O aplicativo Meta e o domínio público HTTPS da MedSI precisam estar configurados para habilitar o login.</p>}
   {session&&<section className={meta.picker} aria-busy={pagesLoading} aria-label="Páginas autorizadas"><h4 ref={selector} tabIndex={-1}>Selecione a Página da empresa</h4><p>Escolha qual Página você quer integrar. Nenhuma Página é vinculada automaticamente.</p>
    {pagesLoading?<p role="status">Buscando suas Páginas autorizadas…</p>:pagesError?<p role="alert" className={meta.notice}>{pagesError}</p>:!pages.length?<div className={meta.notice}><strong>Nenhuma Página foi disponibilizada nesta autorização.</strong><p>{missingPagePermission?'A permissão para listar Páginas não foi concedida. Use o botão de conexão abaixo para revisar a autorização.':'Confira se o perfil do Facebook tem acesso à Página e se ela foi incluída na autorização. Você pode revisar os acessos no botão de conexão abaixo.'}</p></div>:<>
     <p>{pages.length} {pages.length===1?'Página disponível':'Páginas disponíveis'}</p>
     {pages.length>1&&<label className={meta.search}>Encontrar Página<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome da Página ou Instagram"/></label>}
     {instagramUnavailable&&<p className={meta.notice}>Os dados do Instagram não ficaram disponíveis nesta autorização. Você pode escolher sua Página do Facebook e revisar o acesso ao Instagram depois.</p>}
     <div className={meta.pages}>{matches.map(p=><article className={meta.page} key={p.id}><div><strong>{p.name}</strong><small>Página {p.id}</small><small>{p.instagramName?'@'+p.instagramName:p.instagramId?'Instagram profissional vinculado':instagramUnavailable?'Instagram não consultado':'Sem Instagram profissional vinculado'}</small>{p.canConnect===false&&<small>O Facebook precisa liberar acesso a esta Página. Revise a autorização abaixo.</small>}</div><Button disabled={busy||pagesLoading||!data.canConnect||p.canConnect===false} onClick={()=>void act('meta/select',{sessionId:session,pageId:p.id})}>Usar esta Página</Button></article>)}{!matches.length&&<p>Nenhuma Página corresponde à busca. Tente outro nome.</p>}</div>
    </>}
    <div className={meta.actions}><Button variant="outline" disabled={busy||pagesLoading||!data.canConnect} onClick={()=>void loadPages(session,true)}><RefreshCw size={15}/>Atualizar lista de Páginas</Button></div>
   </section>}
   <MetaAuthorization metadata={channel?.metadata} connected={connected} busy={busy||pagesLoading} canConnect={data.canConnect} configured={data.metaConfigured} onConnect={features=>void act('meta/start',{features})}/>
  </section><section className={styles.moduleCard}><OfficialWhatsAppConnection key={companyId} companyId={companyId} canConnect={data.canConnect} onChange={load}/></section><section className={styles.moduleCard}><h3>WhatsApp legado · Evolution</h3><span className="tag">{data.channels.some(c=>c.provider==='evolution'&&c.status==='connected')?<><CircleCheck size={16}/> Conectado</>:<><CircleDashed size={16}/> Não conectado</>}</span><p>{data.channels.find(c=>c.provider==='evolution')?.status==='connected'?'WhatsApp pareado.':data.channels.find(c=>c.provider==='evolution')?'Instância reservada · pareamento pendente.':'Nenhuma instância vinculada.'}</p><p>Ao conectar, criamos uma instância exclusiva para esta empresa. Reconexões reutilizam essa instância. Leia o QR code com o WhatsApp da empresa.</p><p>Veja as conversas na Caixa de entrada. Este pareamento utiliza transporte não oficial e não libera automação. Revise regras e encaminhamento em <a href={'/empresa/'+companyId+'/configuracao-atendimento'}>Configuração de Atendimento</a>.</p>{data.canConnect&&<div className={styles.actions}><Button disabled={busy||!data.evolutionConfigured} onClick={()=>void act('evolution/connect')}>{data.channels.some(c=>c.provider==='evolution'&&c.status==='connected')?'Reconectar WhatsApp':'Conectar WhatsApp / obter QR code'}</Button><Button variant="outline" disabled={busy||!data.evolutionConfigured} onClick={()=>void act('evolution/status')}>Verificar pareamento</Button></div>}{!data.evolutionConfigured&&<p>Servidor Evolution ainda não configurado.</p>}{qr&&<div><img src={qr} alt="QR code para parear o WhatsApp desta empresa" width={260} height={260}/><p>Após ler o código, clique em Verificar pareamento.</p></div>}</section><PaidAds companyId={companyId} connectionsOnly/></>}</section>;
}
