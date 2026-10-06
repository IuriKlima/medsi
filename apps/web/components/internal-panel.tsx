'use client';
import {SupportTickets} from './support-tickets';
import helpStyles from './help-chat.module.css';
import {BrandWordmark} from './brand';

import Link from 'next/link';
import { FollowupPanel } from './followup-panel';
import { useCallback,useEffect,useState,type FormEvent } from 'react';
import { ArrowLeft,ArrowRight,Building2,RefreshCw,ShieldCheck,Users } from 'lucide-react';
import { Button,Modal } from '@askadia/ui';
import type { InternalContext,Portfolio,PortfolioCompany } from '@askadia/contracts';
import { connectedApi } from '../lib/api-client';

const statusLabels:Record<string,string>={draft:'Sem contratação',pending:'Aguardando pagamento',active:'Ativa',past_due:'Pagamento pendente',canceled:'Cancelada',suspended:'Suspensa'};
export function InternalDenied({unavailable=false}:{unavailable?:boolean}){
  return <main className="internal-shell"><Link className="brand" href="/workspace"><BrandWordmark/></Link><section className="panel internal-empty"><ShieldCheck size={30}/><h1>{unavailable?'A operação ainda está sendo configurada.':'Este espaço é da equipe MedSI.'}</h1><p>{unavailable?'A estrutura de acesso interno ainda não está disponível no banco.':'Seu usuário não possui a permissão interna necessária. Convites de empresas não concedem administração da plataforma.'}</p><Link className="button button-outline" href="/workspace">Voltar às minhas empresas</Link></section></main>;
}
export function PortfolioPanel({admin,email}:{admin:boolean;email:string}){
  const [data,setData]=useState<Portfolio|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  const [assignment,setAssignment]=useState<PortfolioCompany|null>(null);
  const [target,setTarget]=useState<PortfolioCompany|null>(null),[busy,setBusy]=useState(false),[formError,setFormError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setData(null);setError('');
    connectedApi<Portfolio>('portfolio?search='+encodeURIComponent(query)+'&offset='+offset,{signal:controller.signal})
      .then(r=>{if(!controller.signal.aborted)setData(r);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[query,offset,revision]);
  async function start(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!target)return;setBusy(true);setFormError('');
    try{
      const {sessionId}=await connectedApi<{sessionId:string}>('access',{method:'POST',body:{companyId:target.id,reason:String(new FormData(event.currentTarget).get('reason')??'')}});
      window.location.assign('/operacao/'+sessionId);
    }catch(e){setFormError(e instanceof Error?e.message:'Acesso indisponível.');setBusy(false);}
  }
  return <main className="internal-shell">
    <header className="internal-header"><Link className="brand" href="/workspace"><BrandWordmark/></Link><Link className="button button-outline" href="/workspace">Minhas empresas</Link></header>
    <div className="page-heading"><div><div className="page-eyebrow">OPERAÇÃO MEDSI</div><h1>{admin?'Cada cliente. Uma visão clara.':'Sua carteira de acompanhamento.'}</h1><p>{admin?'Empresas, situação comercial e acessos internos auditados.':'Somente empresas atribuídas a você aparecem nesta carteira.'}</p></div><Button variant="outline" onClick={()=>setRevision(v=>v+1)} disabled={loading}><RefreshCw size={16}/>Atualizar</Button></div>
    <div className="info-note"><ShieldCheck size={17}/><p>Operador: {email}. Abrir um cliente registra seu acesso e não concede aprovação de publicação ou orçamento.</p></div>
    <form className="internal-search form" onSubmit={e=>{e.preventDefault();setOffset(0);setQuery(search);}}><label>Buscar empresa<input value={search} maxLength={100} onChange={e=>setSearch(e.target.value)} placeholder="Nome da empresa"/></label><Button type="submit">Buscar</Button></form>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    {loading?<section className="panel tenant-loading" role="status">Carregando carteira…</section>:data&&<>
      <div className="section-heading"><h2>{data.total} {data.total===1?'empresa':'empresas'}</h2><span className="tag">{admin?'Administração geral':'Acompanhamento'}</span></div>
      {!data.companies.length?<section className="panel internal-empty"><Building2 size={30}/><h2>Nenhuma empresa nesta seleção.</h2><p>{query?'Tente outro nome.':'A carteira aparece quando houver empresas e vínculos autorizados.'}</p></section>:<div className="tenant-company-grid">{data.companies.map(c=><article className="panel tenant-company-card" key={c.id}><div className="row"><Building2 size={22}/><span className="tag">{c.archived_at?'Arquivada':statusLabels[c.subscription_status]??c.subscription_status}</span></div><h2>{c.name}</h2><p>{c.workspace_name} · {c.city||'Cidade não informada'}</p><div className="tenant-company-role">{c.plan_id??'Sem plano'}{c.weekly_support?' · Acompanhamento contratado':''}</div><Button variant="outline" onClick={()=>{setTarget(c);setFormError('');}}>Abrir contexto<ArrowRight size={15}/></Button>{admin&&<Button variant="ghost" onClick={()=>setAssignment(c)}><Users size={15}/>Carteira</Button>}</article>)}</div>}
      <div className="internal-pagination"><Button variant="outline" disabled={!offset||loading} onClick={()=>setOffset(Math.max(0,offset-30))}>Anterior</Button><span>Página {Math.floor(offset/30)+1}</span><Button variant="outline" disabled={offset+30>=data.total||loading} onClick={()=>setOffset(offset+30)}>Próxima</Button></div>
    </>}
    <section className={helpStyles.teamPanel}><h2>Central de chamados</h2><p>Responda aos clientes e acompanhe os pedidos da sua carteira. As respostas ficam disponíveis no chat de ajuda do cliente.</p><SupportTickets team/></section>
    <Modal open={Boolean(assignment)} onOpenChange={v=>{if(!v)setAssignment(null);}} title={"Carteira de "+(assignment?.name??"empresa")} description="Acesso restrito à equipe interna de acompanhamento.">{assignment&&<AssignmentEditor key={assignment.id} companyId={assignment.id}/>}</Modal>
    <Modal open={Boolean(target)} onOpenChange={value=>{if(!value&&!busy)setTarget(null);}} title={'Acessar '+(target?.name??'empresa')} description="Seu nome permanece na auditoria. A sessão dura até 30 minutos e pode ser encerrada antes."><form className="form" onSubmit={start}><label>Motivo do acesso<textarea name="reason" required minLength={8} maxLength={500} rows={3} placeholder="Ex.: revisar configuração com o cliente"/></label>{formError&&<p className="form-error" role="alert">{formError}</p>}<Button type="submit" disabled={busy}>{busy?'Abrindo…':'Abrir painel interno'}</Button></form></Modal>
  </main>;
}
export function InternalCompanyPanel({sessionId,email}:{sessionId:string;email:string}){
  const [data,setData]=useState<InternalContext|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    try{const result=await connectedApi<InternalContext>('access/'+sessionId,{signal});if(!signal?.aborted){setData(result);setError('');}}
    catch(e){if(!signal?.aborted){setData(null);setError(e instanceof Error?e.message:'Sessão indisponível.');}}
  },[sessionId]);
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);const onFocus=()=>{setData(null);void refresh(controller.signal);};window.addEventListener('focus',onFocus);return()=>{controller.abort();window.removeEventListener('focus',onFocus);};},[refresh]);
  useEffect(()=>{if(!data)return;const timer=setTimeout(()=>{setData(null);setError('Esta sessão interna expirou. Abra uma nova sessão pela carteira.');},Math.max(0,Date.parse(data.session.expires_at)-Date.now()));return()=>clearTimeout(timer);},[data]);
  async function end(){setBusy(true);try{await connectedApi('access/'+sessionId+'/end',{method:'POST',body:{}});window.location.assign(data?.operatorRole==='platform_admin'?'/admin':'/acompanhamento/carteira');}catch(e){setError(e instanceof Error?e.message:'Não foi possível encerrar.');setBusy(false);}}
  return <main className="internal-shell"><div className="internal-banner"><ShieldCheck size={20}/><div><strong>Acesso interno · {data?.company.name??'empresa'}</strong><p>Operador real: {email} · Consulta supervisionada</p></div><Button variant="outline" onClick={end} disabled={busy}><ArrowLeft size={15}/>Encerrar e voltar à carteira</Button></div>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    {!data?!error&&<div className="tenant-loading" role="status">Conferindo acesso…</div>:<>
      <div className="page-heading"><div><div className="page-eyebrow">CONTEXTO DO CLIENTE</div><h1>{data.company.name}</h1><p>{data.company.city||'Cidade não informada'} · {data.company.timezone}</p></div><Button variant="outline" onClick={()=>{setData(null);void refresh();}}>Atualizar</Button></div>
      <div className="internal-summary"><section className="panel"><h2>Assinatura</h2><strong>{statusLabels[data.subscription.status]??data.subscription.status}</strong><p>{data.subscription.planId??'Nenhum plano contratado'}</p></section><section className="panel"><h2>Contexto do acesso</h2><p>{data.session.reason}</p><p>Expira às {new Date(data.session.expires_at).toLocaleTimeString('pt-BR',{timeZone:data.company.timezone})}</p></section></div>
      <div className="section-heading"><h2><Users size={18}/> Equipe da empresa</h2></div><section className="panel invitation-list">{data.team.map((m,i)=><div key={i}><strong>{m.display_name}</strong><span className="tag">{m.role}</span></div>)}</section>
      <div className="section-heading"><h2>Histórico recente</h2></div><section className="panel audit-list">{data.history.map((entry,i)=><div key={i}><span className="audit-dot"/><span><strong>{entry.action}</strong><small>{new Date(entry.created_at).toLocaleString('pt-BR',{timeZone:data.company.timezone})} · Ator {entry.actor_id}</small></span></div>)}</section>
      <FollowupPanel sessionId={sessionId}/><div className="info-note"><ShieldCheck size={18}/><p>Este painel permite consultar o contexto. Os encontros são registrados abaixo, com decisões e responsáveis. Administração financeira depende de módulo autorizado. A sessão interna não aprova conteúdo nem autoriza gastos.</p></div>
    </>}
  </main>;
}

function AssignmentEditor({companyId}:{companyId:string}){
  const [staff,setStaff]=useState<{user_id:string;display_name:string;assigned:boolean}[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{const controller=new AbortController();connectedApi<{user_id:string;display_name:string;assigned:boolean}[]>('companies/'+companyId+'/assignments',{signal:controller.signal}).then(r=>{if(!controller.signal.aborted)setStaff(r);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[companyId]);
  async function toggle(id:string,assigned:boolean){
    setBusy(true);setError('');
    try{await connectedApi('companies/'+companyId+'/assignments',{method:'POST',body:{staffId:id,assigned}});setStaff(rows=>rows?.map(s=>s.user_id===id?{...s,assigned}:s)??null);}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível alterar a carteira.');}finally{setBusy(false);}
  }
  return <div className="assignment-editor">{error&&<p className="form-error" role="alert">{error}</p>}{staff===null?!error&&<p role="status">Carregando equipe interna…</p>:!staff.length?<p>Nenhum profissional de acompanhamento provisionado na equipe interna.</p>:staff.map(s=><div className="assignment-row" key={s.user_id}><span><strong>{s.display_name}</strong><small>{s.assigned?'Faz parte desta carteira':'Sem vínculo com esta empresa'}</small></span><Button variant="outline" size="small" disabled={busy} onClick={()=>void toggle(s.user_id,!s.assigned)}>{s.assigned?'Remover da carteira':'Atribuir empresa'}</Button></div>)}<p className="form-note">Remover o vínculo encerra as sessões internas dessa pessoa na empresa. Atribuir uma carteira não contrata acompanhamento nem concede aprovação do cliente.</p></div>;
}
