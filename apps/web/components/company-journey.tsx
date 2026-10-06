'use client';
import {HelpChat} from './help-chat';
import {MetaBillingNotice} from './meta-billing-notice';
import {MarketingTasks} from './marketing-tasks';
import {LaunchPreparation} from './launch-preparation';
import {InstagramProfiles} from './instagram-profiles';

import {BrandWordmark,BrandMark} from './brand';

import {CompanyOverview} from './company-overview';
import {LoadState} from './load-state';
import {GuidedStrategy} from './guided-strategy';
import {CampaignsPanel} from './campaigns-panel';

import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { ArrowRight,Building2,Menu,X,LayoutDashboard,Compass,CalendarDays,Megaphone,Users,MessageCircle,SlidersHorizontal } from 'lucide-react';
import { type OnboardingSnapshot } from '@askadia/contracts';
import { EditorialCalendar } from './editorial-calendar';
import {InboxPanel} from './inbox-panel';
import { CrmPanel } from './crm-panel';
import { OnboardingChat } from './onboarding-chat';
import { DraftImportPanel } from './draft-import';
import { journeyApi } from '../lib/journey-api';
import styles from './journey.module.css';
import {CompanySettings} from './company-settings';
import {companyNavigation,type CompanySettingsTab} from '../lib/company-navigation';
const navigationIcons:Record<string,typeof LayoutDashboard>={inicio:LayoutDashboard,estrategia:Compass,conteudo:CalendarDays,campanhas:Megaphone,crm:Users,atendimento:MessageCircle,'configuracao-atendimento':SlidersHorizontal,configuracoes:SlidersHorizontal};
const titles:Record<string,string>={configuracoes:'Minha conta',preparacao:'Preparação da operação',concorrentes:'Concorrentes no Instagram',inicio:'Visão geral',agentes:'Agentes da sua empresa.',estrategia:'Estratégia',conteudo:'Calendário e publicações',campanhas:'Campanhas',crm:'CRM',atendimento:'Conversas da sua empresa.','configuracao-atendimento':'Configuração de Atendimento.',integracoes:'Integrações',site:'Meu site.',assinatura:'Assinatura da empresa.'};
export function CompanyJourney({company,area,actions,email,calendarDay,settingsTab='perfil',manageTeam=false,userId,internalHref}:{internalHref?:string;calendarDay?:string;company:{id:string;name:string;timezone:string};area:string;actions:string[];email:string;settingsTab?:CompanySettingsTab;manageTeam?:boolean;userId:string}){
 const [data,setData]=useState<OnboardingSnapshot|null>(null),[error,setError]=useState(''),[mobile,setMobile]=useState(false);
 const marketing=actions.includes('marketing.read'),write=actions.includes('marketing.write'),billing=actions.includes('billing.manage');
 const [reload,setReload]=useState(0);

 const [leaving,setLeaving]=useState(false),[logoutError,setLogoutError]=useState('');
 async function signOut(){setLeaving(true);setLogoutError('');try{const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});if(!response.ok)throw new Error('Não foi possível sair. Tente novamente.');window.location.assign('/login');}catch(cause){setLogoutError(cause instanceof Error?cause.message:'Não foi possível sair.');setLeaving(false);}}
 const menuButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!mobile)return;document.getElementById('company-navigation')?.querySelector<HTMLAnchorElement>('a')?.focus();const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMobile(false);requestAnimationFrame(()=>menuButton.current?.focus());}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[mobile]);
 const base='/empresa/'+company.id;
 useEffect(()=>{if(!marketing)return;setError('');const c=new AbortController();journeyApi<OnboardingSnapshot>('companies/'+company.id,undefined,c.signal).then(r=>{if(!c.signal.aborted)setData(r);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[company.id,marketing,reload]);
 const complete=data?.step==='complete';const interviewing=area==='onboarding';
 const nav=companyNavigation(actions,manageTeam);
 const href=(key:string)=>base+(key==='inicio'?'':'/'+key);
 return <div className={styles.shell}><a className={styles.skipLink} href="#company-content">Pular para o conteúdo</a>
  {mobile&&<button className={styles.scrim} aria-label="Fechar menu" onClick={()=>{setMobile(false);requestAnimationFrame(()=>menuButton.current?.focus());}}/>}
  <aside id="company-navigation" className={styles.sidebar} data-open={mobile}><div className={styles.brandRow}><Link href="/" className="brand"><BrandWordmark/></Link><button className={styles.mobileButton} aria-label="Fechar menu" onClick={()=>setMobile(false)}><X size={20}/></button></div><div className={styles.context}><Building2 size={18}/><span><small>MINHA CLÍNICA</small><strong>{data?.state.facts.name?.value??company.name}</strong></span></div><nav aria-label="Navegação da empresa" onClick={()=>setMobile(false)}>{nav.map(g=><div className={styles.navGroup} key={g.title}><small>{g.title}</small>{g.items.map(([key,label])=>{const Icon=navigationIcons[key!]??Compass;return <Link key={key} href={href(key!)} aria-current={area===key?'page':undefined}><Icon size={17} aria-hidden="true"/><span>{label}</span></Link>;})}</div>)}</nav><footer><small>{email}</small>{internalHref&&<Link href={internalHref}>Voltar à operação MedSI</Link>}<button className="button button-outline" disabled={leaving} onClick={()=>void signOut()}>{leaving?'Saindo…':'Sair da conta'}</button>{logoutError&&<p role="alert">{logoutError}</p>}</footer></aside>
  <div className={styles.main} inert={mobile}><header className={styles.topbar}><button ref={menuButton} className={styles.mobileButton} aria-expanded={mobile} aria-controls="company-navigation" aria-label="Abrir menu" onClick={()=>setMobile(true)}><Menu size={22}/></button><span>{company.name}</span><small>{billing?'Proprietário':marketing?'Marketing':'Atendente'} · acesso verificado</small><HelpChat key={company.id} companyId={company.id} aboveComposer={area==='atendimento'||area==='onboarding'}/></header><main id="company-content" tabIndex={-1} className={area==='atendimento'?styles.inboxContent:styles.content}>
   {marketing&&!interviewing&&<MarketingTasks companyId={company.id} area={area==='configuracoes'?settingsTab==='atendimento'?'configuracao-atendimento':settingsTab:area}/>}
   {interviewing?<OnboardingChat companyId={company.id} readOnly={!write}/>:<>{area!=='atendimento'&&<div className={styles.pageHeading}><p className="page-eyebrow">{marketing?'SUA AGÊNCIA DE MARKETING COM IA':'SUA OPERAÇÃO COMERCIAL'}</p><h1>{titles[area]??'Sua empresa.'}</h1></div>}{area!=='atendimento'&&error&&<LoadState error={error} retry={()=>setReload(v=>v+1)}/>}
   {area==='inicio'&&!data&&!error&&<LoadState label="Carregando a visão geral…"/>}{area==='inicio'&&data&&<MetaBillingNotice companyId={company.id}/>}
   {area==='inicio'&&data&&<CompanyOverview key={company.id} companyId={company.id} profile={data}/>}
   {area==='agentes'&&<><section className={styles.nextAction}><div className={styles.orb}><BrandMark/></div><div><h2>Conhecer minha empresa</h2><p>Converse, consulte o histórico e atualize as informações que orientam os agentes.</p><Link className="button button-primary" href={base+'/onboarding'}>{complete?'Consultar e atualizar':'Continuar onboarding'}<ArrowRight size={16}/></Link></div></section><section className={styles.moduleCard}><h2>Estratégia e tráfego pago · OpenAI</h2><p>A estratégia começa pelo perfil confirmado. Publicação e orçamento continuam sujeitos às aprovações autorizadas.</p><Link href={base+'/estrategia'}>Preparar o planejamento</Link><h2>Design · GPT Image 2.5 Sunburst</h2><p>Fotos, carrosséis e criativos usam a OpenAI. A geração depende do fluxo de criação, do limite da empresa e da disponibilidade do provedor.</p><Link href={base+'/conteudo'}>Abrir conteúdo</Link></section></>}
   {area==='preparacao'&&<LaunchPreparation companyId={company.id}/>}
   {area==='concorrentes'&&<InstagramProfiles companyId={company.id}/>}
   {area==='estrategia'&&<GuidedStrategy companyId={company.id} data={data} write={write} approve={actions.includes('strategy.approve')}/>}
   {area==='conteudo'&&<><EditorialCalendar day={calendarDay} key={company.id} companyId={company.id} write={write} approve={actions.includes('content.approve')}/><details className={styles.moduleCard}><summary>Acervo e importação de rascunhos anteriores</summary><DraftImportPanel companyId={company.id} companyName={company.name}/></details></>}
   {area==='configuracoes'&&<CompanySettings company={company} tab={settingsTab} actions={actions} manageTeam={manageTeam} userId={userId} profile={data}/>}
   {area==='crm'&&<CrmPanel companyId={company.id} inbox={false} write={actions.includes('crm.write')}/>}
   {area==='atendimento'&&<InboxPanel key={company.id} companyId={company.id} companyName={company.name}/>}
   {area==='campanhas'&&<CampaignsPanel key={company.id} companyId={company.id} profile={data?.confirmedProfile} crm={actions.includes('crm.read')}/>}

   </>}
  </main></div>
 </div>;
}
