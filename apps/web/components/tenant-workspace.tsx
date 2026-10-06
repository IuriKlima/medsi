'use client';
import {HelpChat} from './help-chat';
import {BrandWordmark} from './brand';

import Link from 'next/link';
import {identityApi as api} from '../lib/identity-api';
import { journeyApi } from '../lib/journey-api';
import { CompanyPlan } from './company-plan';
import { DraftImportPanel } from './draft-import';
import { CompanyDelegations } from './company-delegations';
import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import { Archive,ArrowRight,ArrowUpRight,Building2,Check,ChevronDown,Copy,FileText,LogOut,Plus,RefreshCw,Settings2,ShieldCheck,Users,X,Menu,CreditCard } from 'lucide-react';
import { Button,Modal } from '@askadia/ui';
import { companyRoles,roleLabels,type CompanyRecord,type CompanyTeam,type IdentitySnapshot,type MemberRecord } from '@askadia/contracts';
const segmentLabels={clinic:'Clínica',medical_practice:'Consultório médico',gym:'Academia (legado)',studio:'Estúdio (legado)',other:'Outro'};
type ModalType='workspace'|'company'|'edit'|'invite'|'member'|'archive'|'accept'|null;
const auditLabels:Record<string,string>={'company.created':'Empresa criada','company.updated':'Perfil da empresa atualizado','member.invited':'Convite criado','member.joined':'Convite aceito','member.removed':'Membro removido','member.role_changed':'Permissão alterada','invitation.revoked':'Convite revogado','company.export_requested':'Exportação de perfil solicitada'};
export function TenantWorkspace({userId,email,staffRole}:{userId:string;email:string;staffRole?:string|null}){
  const [mobileOpen,setMobileOpen]=useState(false);
  const [snapshot,setSnapshot]=useState<IdentitySnapshot|null>(null);
  const [workspaceId,setWorkspaceId]=useState('');
  const [companyId,setCompanyId]=useState('');
  const [view,setView]=useState<'companies'|'team'|'security'|'plan'|'import'>('companies');
  const [team,setTeam]=useState<CompanyTeam|null>(null);
  const [archived,setArchived]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [modal,setModal]=useState<ModalType>(null);
  const [target,setTarget]=useState<CompanyRecord|null>(null);
  const [member,setMember]=useState<MemberRecord|null>(null);
  const [inviteLink,setInviteLink]=useState('');
  const [invitationToken,setInvitationToken]=useState('');
  const [formError,setFormError]=useState('');
  const refreshId=useRef(0);
  const beginRequest=useRef<string|null>(null),beginBusy=useRef(false);
  const selection=useRef({workspaceId:'',companyId:''});
  const storage='askadia.selection.'+userId;
  const refresh=useCallback(async()=>{
    const requestId=++refreshId.current;
    try{
      const result=await api<IdentitySnapshot>();
      if(requestId!==refreshId.current)return;
      setSnapshot(result);setError('');
      let saved=selection.current;
      const params=new URLSearchParams(window.location.search);const linked=result.companies.find(c=>c.id===params.get('companyId'));
      if(linked){saved={workspaceId:linked.workspace_id,companyId:linked.id};const page=params.get('view');if(page==='team'||page==='security'||page==='plan'||page==='import')setView(page);window.history.replaceState(null,'','/workspace'+window.location.hash);}
      if(!saved.workspaceId){try{saved=JSON.parse(localStorage.getItem(storage)||'{}');}catch{saved={workspaceId:'',companyId:''};}}
      const nextWorkspace=result.workspaces.find(w=>w.id===saved.workspaceId)?.id??result.workspaces[0]?.id??'';
      const available=result.companies.filter(c=>c.workspace_id===nextWorkspace && !c.archived_at);
      const nextCompany=available.find(c=>c.id===saved.companyId)?.id??available[0]?.id??'';
      selection.current={workspaceId:nextWorkspace,companyId:nextCompany};setWorkspaceId(nextWorkspace);setCompanyId(nextCompany);
      try{localStorage.setItem(storage,JSON.stringify(selection.current));}catch{/* Selection is optional; never business data. */}
    }catch(cause){if(requestId===refreshId.current){setSnapshot(null);setTeam(null);setError(cause instanceof Error?cause.message:'Não foi possível carregar.');}}
    finally{if(requestId===refreshId.current)setLoading(false);}
  },[storage]);
  useEffect(()=>{
    void refresh();
    const onFocus=()=>{setTeam(null);void refresh();};
    window.addEventListener('focus',onFocus);
    const token=new URLSearchParams(window.location.hash.slice(1)).get('invite');
    if(token && /^[a-f0-9]{64}$/.test(token)){setInvitationToken(token);setModal('accept');}
    return ()=>{refreshId.current++;window.removeEventListener('focus',onFocus);};
  },[refresh]);
  const company=snapshot?.companies.find(c=>c.id===companyId);
  const workspace=snapshot?.workspaces.find(w=>w.id===workspaceId);
  const owner=snapshot?.workspaceMemberships.some(m=>m.workspace_id===workspaceId&&m.role==='owner')??false;
  const role=snapshot?.companyMemberships.find(m=>m.company_id===companyId)?.role;
  const manager=owner||role==='admin';
  useEffect(()=>{
    setTeam(null);
    if(!companyId||!manager||(view!=='team'&&view!=='security'))return;
    const controller=new AbortController();
    api<CompanyTeam>('companies/'+companyId+'/team','GET',undefined,controller.signal).then(result=>{if(!controller.signal.aborted && selection.current.companyId===companyId)setTeam(result);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Não foi possível carregar a equipe.');});
    return ()=>controller.abort();
  },[companyId,manager,view,snapshot]);
  function choose(nextWorkspace:string,nextCompany:string){
    selection.current={workspaceId:nextWorkspace,companyId:nextCompany};
    setTeam(null);setWorkspaceId(nextWorkspace);setCompanyId(nextCompany);setModal(null);setInviteLink('');setError('');
    try{localStorage.setItem(storage,JSON.stringify(selection.current));}catch{/* The selector can remain in memory when storage is unavailable. */}
  }
  async function beginCompany(){if(beginBusy.current)return;beginBusy.current=true;setBusy(true);setError('');beginRequest.current??=crypto.randomUUID();try{const r=await journeyApi<{companyId:string}>('companies',{requestId:beginRequest.current,workspaceId:workspaceId||null});window.location.assign('/comecar?empresa='+r.companyId);}catch(e){setError(e instanceof Error?e.message:'Não foi possível iniciar.');setBusy(false);beginBusy.current=false;}}
  function open(value:ModalType,record?:CompanyRecord){setFormError('');setNotice('');setInviteLink('');setTarget(record??null);setModal(value);}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setFormError('');
    const fields=new FormData(event.currentTarget);
    const get=(key:string)=>String(fields.get(key)||'').trim();
    try{
      if(modal==='workspace'){
        const {id}=await api<{id:string}>('workspaces','POST',{name:get('name')});
        selection.current={workspaceId:id,companyId:''};setNotice('Área de trabalho criada.');
      }else if(modal==='company'){
        const result=await api<CompanyRecord>('companies','POST',{workspaceId,name:get('name'),segment:get('segment'),city:get('city'),timezone:get('timezone')});
        selection.current={workspaceId,companyId:result.id};setNotice('Empresa criada em rascunho. Nenhuma assinatura ativada.');
      }else if(modal==='edit'&&target){
        await api('companies/'+target.id,'PATCH',{name:get('name'),segment:get('segment'),city:get('city'),timezone:get('timezone'),archived:Boolean(target.archived_at)});
        setNotice('Perfil atualizado e alteração registrada.');
      }else if(modal==='archive'&&target){
        await api('companies/'+target.id,'PATCH',{name:target.name,segment:target.segment,city:target.city,timezone:target.timezone,archived:!target.archived_at});
        setNotice(target.archived_at?'Empresa restaurada.':'Empresa arquivada. Os dados foram preservados.');
      }else if(modal==='invite'){
        const result=await api<{token:string;expires_at:string}>('companies/'+companyId+'/invitations','POST',{email:get('email'),role:get('role')});
        setInviteLink(window.location.origin+'/login#invite='+result.token);
        setNotice('Convite criado. Compartilhe o link com a pessoa indicada; nenhum e-mail foi enviado.');
        await refresh();return;
      }else if(modal==='member'&&member){
        await api('companies/'+companyId+'/members/'+member.user_id,'PATCH',{role:get('role')==='remove'?null:get('role')});
        setNotice('Acesso atualizado. A alteração foi registrada.');
      }else if(modal==='accept'){
        const result=await api<{companyId:string}>('invitations/accept','POST',{token:invitationToken});
        const updated=await api<IdentitySnapshot>();
        const invited=updated.companies.find(c=>c.id===result.companyId);
        selection.current={workspaceId:invited?.workspace_id??'',companyId:result.companyId};
        window.location.assign('/empresa/'+result.companyId);return;
      }
      setModal(null);await refresh();
    }catch(cause){setFormError(cause instanceof Error?cause.message:'Não foi possível salvar.');}
    finally{setBusy(false);}
  }
  async function revoke(id:string){
    setBusy(true);
    try{await api('companies/'+companyId+'/invitations/'+id+'/revoke','POST',{});setNotice('Convite revogado.');await refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível revogar.');}finally{setBusy(false);}
  }
  async function exportCompany(){
    try{
      const result=await api('companies/'+companyId+'/export','POST',{});
      const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='medsi-perfil-clinica.json';link.click();URL.revokeObjectURL(url);setNotice('Perfil exportado. A solicitação foi registrada.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Exportação indisponível.');}
  }
  async function signOut(){
    setBusy(true);
    try{const result=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});if(!result.ok)throw new Error('Não foi possível sair. Tente novamente.');window.location.assign('/login');}
    catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível sair.');setBusy(false);}
  }
  const companies=snapshot?.companies.filter(c=>c.workspace_id===workspaceId&&Boolean(c.archived_at)===archived)??[];
  return <div className="tenant-shell">{mobileOpen&&<button className="tenant-menu-backdrop" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)}/>}<aside className={"tenant-sidebar "+(mobileOpen?"tenant-sidebar-open":"")}><Link className="brand" href="/workspace"><BrandWordmark/></Link><label className="tenant-workspace-label">ÁREA DE TRABALHO<select aria-label="Área de trabalho" value={workspaceId} onChange={e=>choose(e.target.value,snapshot?.companies.find(c=>c.workspace_id===e.target.value&&!c.archived_at)?.id??'')}><option value="" disabled>Selecione uma área</option>{snapshot?.workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><nav aria-label="Gestão do workspace"><button className={'nav-item '+(view==='companies'?'active':'')} onClick={()=>{setView('companies');setMobileOpen(false);}}><Building2 size={18}/>Empresas</button>{companyId&&<Link href={'/empresa/'+companyId} className="nav-item"><ArrowRight size={18}/>Abrir empresa</Link>}{manager&&<><button className={'nav-item '+(view==='team'?'active':'')} onClick={()=>{setView('team');setMobileOpen(false);}}><Users size={18}/>Equipe e convites</button><button className={'nav-item '+(view==='security'?'active':'')} onClick={()=>{setView('security');setMobileOpen(false);}}><ShieldCheck size={18}/>Acessos e histórico</button></>}{owner&&<button className={'nav-item '+(view==='plan'?'active':'')} onClick={()=>{setView('plan');setMobileOpen(false);}}><CreditCard size={18}/>Assinatura</button>}<Link className="nav-item" href="/entrada">Trocar contexto</Link></nav><div className="tenant-sidebar-bottom">{staffRole&&<Link href={staffRole==="platform_admin"?"/admin":"/acompanhamento/carteira"} className="nav-item"><Users size={17}/>Operação MedSI</Link>}<div className="form-note"><ShieldCheck size={17}/><span>Dados conectados. A permissão é conferida em cada operação.</span></div><Link href="/preview" className="nav-item"><ArrowUpRight size={17}/>Abrir prévia local</Link><button className="nav-item" disabled={busy} onClick={signOut}><LogOut size={17}/>Sair da conta</button><small>{email}</small></div></aside>
  <div className="tenant-main"><header className="tenant-topbar"><button className="icon-button tenant-mobile-menu" aria-label="Abrir navegação" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)}><Menu size={20}/></button><span>{workspace?.name??'Seu workspace'}</span><div><ShieldCheck size={14}/>Sessão autenticada</div><HelpChat key={companyId||'account'} companyId={companyId||undefined}/></header><main className="tenant-content"><div className="page-heading"><div><div className="page-eyebrow">SEU ESPAÇO, COM MAIS POSSIBILIDADES</div><h1>{view==='companies'?'Cada empresa, seu próprio espaço.':view==='team'?'As pessoas certas. Os acessos certos.':view==='plan'?'Seu plano. Com tudo às claras.':view==='import'?'Do rascunho ao seu espaço.':'Confiança em cada decisão.'}</h1><p>{view==='companies'?'Organize suas empresas sem misturar dados, acessos ou assinaturas.':view==='team'?'Convide sua equipe e escolha o que cada pessoa pode fazer.':'Permissões explícitas e um histórico das ações importantes.'}</p></div><Button variant="outline" onClick={()=>{setLoading(true);void refresh();}} disabled={loading||busy}><RefreshCw size={15}/>Atualizar</Button></div>
  {error&&<div className="error-banner" role="alert">{error}</div>}{notice&&<div className="tenant-notice" role="status"><Check size={16}/>{notice}<button onClick={()=>setNotice('')} aria-label="Fechar aviso"><X size={15}/></button></div>}
  {loading&&!snapshot?<section className="panel tenant-loading" role="status">Carregando suas empresas…</section>:!snapshot?<section className="panel"><div className="empty"><ShieldCheck size={30}/><h3>Seu espaço não pôde ser carregado.</h3><p>Confira a conexão e tente atualizar. Dados anteriores foram retirados da tela para proteger seu acesso.</p></div></section>:<>
    {company&&<div className="active-company-strip"><span className="company-avatar">{company.name.slice(0,2).toUpperCase()}</span><div><small>EMPRESA ATIVA</small><strong>{company.name}</strong></div><span className="tag">{owner?'Proprietário':role?roleLabels[role]:'Gestão do workspace · sem acesso operacional'}</span><label><span className="sr-only">Empresa ativa</span><select aria-label="Empresa ativa" value={companyId} onChange={e=>choose(workspaceId,e.target.value)}>{snapshot.companies.filter(c=>c.workspace_id===workspaceId&&!c.archived_at).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown size={14}/></label></div>}
    {view==='companies'&&<><div className="toolbar"><div className="segmented"><button className={!archived?'selected':''} onClick={()=>setArchived(false)}>Em operação</button><button className={archived?'selected':''} onClick={()=>setArchived(true)}>Arquivadas</button></div><div className="row"><Button variant="outline" onClick={()=>open('workspace')}><Plus size={15}/>Nova área de trabalho</Button>{owner&&<Button disabled={busy} onClick={()=>void beginCompany()}><Plus size={15}/>Adicionar empresa</Button>}</div></div>
    {!snapshot.workspaces.length?<section className="panel"><div className="empty"><span className="empty-icon"><Building2 size={26}/></span><h3>Vamos cadastrar sua empresa.</h3><p>Vamos conhecer seu negócio em uma conversa. O espaço da empresa será criado automaticamente, sem contratação.</p><Button disabled={busy} onClick={()=>void beginCompany()}>Cadastrar minha empresa<ArrowRight size={16}/></Button></div></section>:!companies.length?<section className="panel"><div className="empty"><span className="empty-icon"><Building2 size={25}/></span><h3>{archived?'Nenhuma empresa arquivada.':'Vamos cadastrar sua empresa.'}</h3><p>{owner?'Criar uma empresa gera um rascunho, sem ativar assinatura.':'As empresas aparecem aqui quando seu acesso é concedido.'}</p>{owner&&!archived&&<Button disabled={busy} onClick={()=>void beginCompany()}>Adicionar empresa<Plus size={15}/></Button>}</div></section>:<div className="tenant-company-grid">{companies.map(c=>{
      const cRole=snapshot.companyMemberships.find(m=>m.company_id===c.id)?.role;const canManage=owner||cRole==='admin';
      return <article className={'panel tenant-company-card '+(c.id===companyId?'company-selected':'')} key={c.id}><div className="row"><span className="profile-large">{c.name.slice(0,2).toUpperCase()}</span><span className="tag">{c.archived_at?'Arquivada':'Rascunho · sem contratação'}</span></div><h2>{c.name}</h2><p>{segmentLabels[c.segment]}{c.city?' · '+c.city:''}</p><div className="tenant-company-role"><ShieldCheck size={14}/>{owner?'Proprietário':cRole?roleLabels[cRole]:'Gestão do workspace'}</div><div className="company-card-actions">{!c.archived_at&&<Link className="button button-primary" href={'/empresa/'+c.id}>Abrir empresa<ArrowRight size={14}/></Link>}{!c.archived_at&&<Button variant={c.id===companyId?'ghost':'outline'} onClick={()=>choose(workspaceId,c.id)}>{c.id===companyId?<><Check size={14}/>Selecionada</>:'Selecionar'}</Button>}{canManage&&<><Button variant="ghost" onClick={()=>window.location.assign('/empresa/'+c.id+'/perfil')} aria-label={'Editar '+c.name}><Settings2 size={16}/></Button><Button variant="ghost" onClick={()=>open('archive',c)} aria-label={(c.archived_at?'Restaurar ':'Arquivar ')+c.name}><Archive size={16}/></Button></>}</div></article>;
    })}</div>}<div className="info-note"><ShieldCheck size={17}/><p>O plano básico custa R$ 497/mês por empresa. A contratação ainda não está habilitada nesta etapa. Nenhuma cobrança é iniciada ao cadastrar ou restaurar uma empresa.</p></div></>}
    {view==='import'&&((owner||role==='admin'||role==='marketing')&&company?<DraftImportPanel key={company.id} companyId={company.id} companyName={company.name}/>:<section className="panel internal-empty"><h2>Selecione uma empresa de destino.</h2></section>)}
    {view==='plan'&&(owner&&company?<CompanyPlan key={company.id} companyId={company.id}/>:<section className="panel internal-empty"><h2>Selecione uma empresa para consultar o plano.</h2></section>)}
    {(view==='team'||view==='security')&&(!company?<section className="panel"><div className="empty"><Building2 size={28}/><h3>Selecione uma empresa para continuar.</h3><p>Equipe e histórico são específicos de cada empresa.</p><Button variant="outline" onClick={()=>setView('companies')}>Ver empresas</Button></div></section>:!manager?<section className="panel"><div className="empty"><ShieldCheck size={28}/><h3>Este espaço é reservado à administração.</h3><p>Seu perfil atual é {role?roleLabels[role]:'gestor do workspace'}. Solicite ao administrador qualquer mudança de acesso.</p></div></section>:!team?<section className="panel tenant-loading" role="status">Carregando permissões…</section>:view==='team'?<>
      <div className="section-heading"><h2>Equipe de {company.name}</h2><Button onClick={()=>open('invite')} disabled={busy}><Plus size={15}/>Convidar pessoa</Button></div><section className="panel table-panel"><table><thead><tr><th>Pessoa</th><th>Permissão</th><th>Acesso</th></tr></thead><tbody>{team.members.map(m=><tr key={m.user_id}><td><strong>{m.display_name}</strong>{m.user_id===userId&&<small>Você</small>}</td><td>{roleLabels[m.role]}</td><td><Button variant="outline" size="small" onClick={()=>{setMember(m);open('member');}}>Gerenciar acesso</Button></td></tr>)}</tbody></table></section>
      <CompanyDelegations key={company.id} companyId={company.id} members={team.members} owner={owner}/><div className="section-heading"><h2>Convites</h2><span className="muted-caption">Até 100 convites mais recentes</span></div><section className="panel invitation-list">{team.invitations.length?team.invitations.map(inv=><div key={inv.id}><span><strong>{inv.email}</strong><small>{roleLabels[inv.role]} · {inv.accepted_at?'Aceito':inv.revoked_at?'Revogado':new Date(inv.expires_at)<new Date()?'Expirado':'Válido até '+new Date(inv.expires_at).toLocaleDateString('pt-BR')}</small></span>{!inv.accepted_at&&!inv.revoked_at&&new Date(inv.expires_at)>new Date()&&<Button variant="outline" size="small" disabled={busy} onClick={()=>void revoke(inv.id)}>Revogar</Button>}</div>):<div className="empty"><Users size={23}/><h3>Sua equipe começa com um convite.</h3><p>O link será válido por 7 dias e somente para o e-mail informado.</p></div>}</section>
    </>:<><section className="panel access-principles"><ShieldCheck size={26}/><div><h2>Gerenciar não significa acessar tudo.</h2><p>O proprietário acessa suas empresas e delega permissões. Gerentes de marketing e atendentes têm escopos distintos; contratação e pagamento pertencem ao proprietário.</p></div>{(owner||role==='admin')&&<Button variant="outline" onClick={exportCompany}><FileText size={15}/>Exportar perfil</Button>}</section><div className="section-heading"><h2>Histórico de acessos e alterações</h2><span className="muted-caption">Últimos 50 registros</span></div><section className="panel audit-list">{team.audit.length?team.audit.map(record=><div key={record.id}><span className="audit-dot"/><span><strong>{auditLabels[record.action]??record.action}</strong><small>{new Date(record.created_at).toLocaleString('pt-BR',{timeZone:company.timezone})} · {record.actor_id===userId?'Você':team.members.find(m=>m.user_id===record.actor_id)?.display_name??'Membro anterior'}</small></span></div>):<div className="empty"><p>Nenhum registro disponível para seu perfil.</p></div>}</section></>)}
  </>}
  </main></div>
  <Modal open={modal!==null} onOpenChange={value=>{if(!value&&!busy)setModal(null);}} title={modal==='workspace'?'Um espaço para suas empresas.':modal==='company'?'Apresente sua empresa.':modal==='edit'?'O perfil da sua empresa.':modal==='invite'?'Crescer também é compartilhar.':modal==='member'?'Cada pessoa, o acesso certo.':modal==='accept'?'Você recebeu um convite.':target?.archived_at?'Restaurar esta empresa?':'Arquivar esta empresa?'} description={modal==='accept'?'O acesso será concedido somente se este convite corresponder ao seu e-mail confirmado.':modal==='workspace'?'Uma área de trabalho organiza empresas e seus responsáveis.':modal==='company'?'Cadastro em rascunho. Nenhuma assinatura será ativada.':'As alterações são verificadas no servidor e registradas no histórico.'}>
  {inviteLink?<div className="invite-created"><span className="empty-icon"><Check size={24}/></span><h3>Convite pronto para compartilhar.</h3><p>O destinatário deve entrar com o e-mail convidado. Este link expira em 7 dias e só pode ser aceito uma vez.</p><label className="form">Link do convite<input readOnly value={inviteLink} aria-label="Link do convite"/></label><Button onClick={async()=>{try{await navigator.clipboard.writeText(inviteLink);setNotice('Link copiado.');}catch{setFormError('Selecione o link e copie manualmente.');}}}><Copy size={15}/>Copiar link</Button><p className="fine-print">Nenhum e-mail foi enviado. Por segurança, o link completo é exibido apenas nesta tela.</p>{formError&&<p className="form-error" role="alert">{formError}</p>}</div>:<form className="form" onSubmit={submit}><fieldset disabled={busy}>
    {(modal==='workspace'||modal==='company'||modal==='edit')&&<label>{modal==='workspace'?'Nome da área':'Nome da empresa'}<input name="name" required minLength={2} maxLength={100} defaultValue={target?.name} placeholder={modal==='workspace'?'Ex.: Grupo Movimento':'Ex.: Clínica Movimento'}/></label>}
    {(modal==='company'||modal==='edit')&&<><div className="form-row"><label>Segmento<select name="segment" defaultValue={target?.segment??'clinic'}><option value="clinic">Clínica</option><option value="medical_practice">Consultório médico</option>{target?.segment==='gym'&&<option value="gym">Academia (legado)</option>}{target?.segment==='studio'&&<option value="studio">Estúdio (legado)</option>}<option value="other">Outro</option></select></label><label>Cidade<input name="city" maxLength={100} defaultValue={target?.city} placeholder="Ex.: São Paulo"/></label></div><label>Fuso horário<select name="timezone" defaultValue={target?.timezone??'America/Sao_Paulo'}><option>America/Sao_Paulo</option><option>America/Manaus</option><option>America/Rio_Branco</option><option>America/Noronha</option><option>America/Cuiaba</option><option>America/Belem</option></select></label></>}
    {modal==='invite'&&<><label>E-mail da pessoa<input name="email" type="email" required maxLength={254} placeholder="pessoa@empresa.com.br"/></label><label>Permissão<select name="role" defaultValue="marketing">{companyRoles.filter(r=>r==='marketing'||r==='attendant').map(r=><option value={r} key={r}>{roleLabels[r]}</option>)}</select></label><div className="form-note"><ShieldCheck size={17}/><span>O gerente cuida do marketing e o atendente do CRM. Aprovações e acesso adicional ao CRM são delegados pelo proprietário após o aceite.</span></div></>}
    {modal==='member'&&<><p>{member?.display_name}</p><label>Permissão<select name="role" defaultValue={member?.role}>{companyRoles.map(r=><option value={r} key={r}>{roleLabels[r]}</option>)}<option value="remove">Remover acesso desta empresa</option></select></label><div className="form-note"><ShieldCheck size={17}/><span>A mudança vale nas próximas operações. A empresa deve manter pelo menos um administrador.</span></div></>}
    {modal==='archive'&&<div className="form-note"><Archive size={20}/><span>{target?.archived_at?'A empresa voltará à lista de empresas disponíveis. Nenhuma assinatura será ativada.':'A empresa sai da lista principal e o acesso aos dados operacionais é bloqueado. O histórico é preservado e você pode restaurá-la. Arquivar não cancela contratos ou cobranças.'}</span></div>}
    {modal==='accept'&&<div className="form-note"><Users size={20}/><span>Você está conectado como {email}. Ao aceitar, receberá a permissão definida no convite para uma empresa específica.</span></div>}
    {formError&&<p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><Button type="button" variant="outline" onClick={()=>setModal(null)}>Cancelar</Button><Button type="submit">{busy?'Salvando…':modal==='invite'?'Gerar convite':modal==='accept'?'Aceitar convite':modal==='archive'?target?.archived_at?'Restaurar empresa':'Arquivar empresa':'Salvar'}<ArrowRight size={15}/></Button></div>
  </fieldset></form>}</Modal></div>;
}
