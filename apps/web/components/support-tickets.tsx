'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,RefreshCw,Send,Ticket} from 'lucide-react';
import {supportProtocol,supportStatusLabels,supportStatuses,type SupportDetail,type SupportStatus,type SupportTicket} from '@askadia/contracts';
import {connectedApi} from '../lib/api-client';
import s from './help-chat.module.css';

export function SupportTickets({team=false,initialDetail}:{team?:boolean;initialDetail?:SupportDetail}){
 const [rows,setRows]=useState<SupportTicket[]>([]),[detail,setDetail]=useState<SupportDetail|null>(initialDetail??null),[selected,setSelected]=useState(initialDetail?.ticket.id??''),[offset,setOffset]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false),request=useRef<{id:string;text:string}|null>(null),generation=useRef(0);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const current=++generation.current;
  try{const value=selected?await connectedApi<SupportDetail>('support/tickets/'+selected,{signal}):await connectedApi<SupportTicket[]>('support/tickets?team='+team+'&offset='+offset,{signal});if(signal?.aborted||current!==generation.current)return;if(selected)setDetail(value as SupportDetail);else setRows(value as SupportTicket[]);setError('');}
  catch(e){if(!signal?.aborted&&current===generation.current){setDetail(null);setRows([]);setError(e instanceof Error?e.message:'Não foi possível consultar os chamados.');}}
  finally{if(!signal?.aborted&&current===generation.current)setLoading(false);}
 },[selected,team,offset]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);void refresh(controller.signal);const interval=setInterval(()=>{if(document.visibilityState==='visible'&&!lock.current)void refresh(controller.signal);},30000);return()=>{controller.abort();clearInterval(interval);generation.current++;};},[refresh]);
 async function reply(event:FormEvent){event.preventDefault();if(lock.current||!detail||!message.trim())return;lock.current=true;setBusy(true);setError('');generation.current++;const text=message.trim();if(request.current?.text!==text)request.current={id:crypto.randomUUID(),text};try{const result=await connectedApi<SupportDetail>('support/tickets/'+detail.ticket.id+'/reply',{method:'POST',body:{requestId:request.current.id,message:text}});setDetail(result);setMessage('');request.current=null;}catch(e){setError(e instanceof Error?e.message:'Não foi possível enviar a resposta.');}finally{lock.current=false;setBusy(false);}}
 async function status(status:SupportStatus){if(lock.current||!detail)return;lock.current=true;setBusy(true);setError('');generation.current++;try{setDetail(await connectedApi<SupportDetail>('support/tickets/'+detail.ticket.id+'/status',{method:'POST',body:{status,version:detail.ticket.version}}));}catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o chamado.');}finally{lock.current=false;setBusy(false);}}
 return <section className={s.tickets} aria-label={team?'Chamados dos clientes':'Meus chamados'}>
  <div className={s.ticketToolbar}>{selected?<button type="button" disabled={busy} onClick={()=>{setSelected('');setDetail(null);setMessage('');request.current=null;}}><ArrowLeft size={16}/>Todos os chamados</button>:<strong><Ticket size={17}/>{team?'Chamados dos clientes':'Meus chamados'}</strong>}<button type="button" aria-label="Atualizar chamados" disabled={busy||loading} onClick={()=>void refresh()}><RefreshCw size={16}/></button></div>
  {error&&<p className={s.error} role="alert">{error}</p>}
  {loading&&<p role="status">Carregando chamados…</p>}
  {!loading&&!selected&&!error&&<><div className={s.ticketList}>{rows.length?rows.map(ticket=><button type="button" key={ticket.id} onClick={()=>{setDetail(null);setSelected(ticket.id);}}><small>{supportProtocol(ticket.number)} · {team&&ticket.status==='waiting_customer'?'Aguardando cliente':supportStatusLabels[ticket.status]}</small><strong>{ticket.subject}</strong><span>{ticket.company_name??'Minha conta'}</span><small>Atualizado em {new Date(ticket.updated_at).toLocaleString('pt-BR')}</small></button>):<p>Nenhum chamado nesta página.</p>}</div><div className={s.ticketToolbar}><button type="button" disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-20))}>Anterior</button><span>Página {offset/20+1}</span><button type="button" disabled={rows.length<20} onClick={()=>setOffset(n=>n+20)}>Próxima</button></div></>}
  {selected&&detail&&<>
   <header className={s.ticketHeading}><small>{supportProtocol(detail.ticket.number)} · {detail.ticket.company_name??'Minha conta'}</small><h3>{detail.ticket.subject}</h3>{team?<label>Status<select value={detail.ticket.status} disabled={busy} onChange={e=>void status(e.target.value as SupportStatus)}>{supportStatuses.map(status=><option key={status} value={status}>{status==='waiting_customer'?'Aguardando cliente':supportStatusLabels[status]}</option>)}</select></label>:<span className={s.status}>{supportStatusLabels[detail.ticket.status]}</span>}</header>
   {detail.ticket.transcript.length>0&&<details className={s.shared}><summary>Conversa de ajuda compartilhada pelo cliente</summary>{detail.ticket.transcript.map((m,i)=><p key={i}><strong>{m.role==='user'?'Cliente':'Central de ajuda'}:</strong> {m.text}</p>)}</details>}
   <div className={s.replies} aria-label="Histórico do chamado">{detail.messages.map(item=><article key={item.id} data-author={item.author_kind}><small>{item.author_kind==='staff'?'Equipe MedSI':'Cliente'} · {new Date(item.created_at).toLocaleString('pt-BR')}</small><p>{item.body}</p></article>)}</div>
   <form className={s.replyForm} onSubmit={reply}><label>Responder ao chamado<textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={4000} required rows={3} disabled={busy} placeholder="Escreva sua resposta…"/></label><button className={s.primary} disabled={busy||!message.trim()} type="submit">{busy?'Salvando…':'Enviar resposta'}<Send size={15}/></button><small>As respostas ficam neste chamado. Uma nova mensagem reabre um chamado resolvido.</small></form>
  </>}
 </section>;
}
