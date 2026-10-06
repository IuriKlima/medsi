'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,Check,CalendarDays,Image,MessageCircle,Globe,RefreshCw} from 'lucide-react';
import {Button} from '@askadia/ui';
import type {OnboardingSnapshot,CalendarItem} from '@askadia/contracts';
import {journeyApi} from '../lib/journey-api';
import {publicationStage} from '../lib/publication-workflow';
import {LoadState} from './load-state';
import {OverviewBi} from './overview-bi';
import s from './journey.module.css';
type Calendar={current:{id:string;generation:number;status:string}|null;items:CalendarItem[];assets:{item_id:string;revision:number;frame:number}[];videos:{item_id:string;revision:number}[];preparation:{status:string}|null};
type Channels={channels:{provider:string;status:string}[]};
type Site={site:{draft:{whatsapp:string}|null;published:unknown;slug:string|null}|null;hostingConfigured:boolean};
export function CompanyOverview({companyId,profile}:{companyId:string;profile:OnboardingSnapshot}){
 const base='/empresa/'+companyId;
 const [calendar,setCalendar]=useState<Calendar|null>(null),[channels,setChannels]=useState<Channels|null>(null),[site,setSite]=useState<Site|null>(null),[loading,setLoading]=useState(true),[failures,setFailures]=useState<string[]>([]),[attempt,setAttempt]=useState(0);
 const load=useCallback(async(signal:AbortSignal)=>{
  const results=await Promise.allSettled([journeyApi<Calendar>('companies/'+companyId+'/calendar',undefined,signal),journeyApi<Channels>('companies/'+companyId+'/channels',undefined,signal),journeyApi<Site>('companies/'+companyId+'/site',undefined,signal)]);
  if(signal.aborted)return;
  const [cal,con,web]=results;
  setCalendar(cal.status==='fulfilled'?cal.value:null);setChannels(con.status==='fulfilled'?con.value:null);setSite(web.status==='fulfilled'?web.value:null);
  setFailures(results.flatMap((result,index)=>result.status==='rejected'?['calendário','conexões','site'][index]!:[]));setLoading(false);
 },[companyId]);
 useEffect(()=>{const c=new AbortController();setLoading(true);void load(c.signal);return()=>c.abort();},[load,attempt]);
 const complete=profile.step==='complete',preparing=['pending','running'].includes(calendar?.preparation?.status??'');
 const current=calendar?.current,items=calendar?.items.filter(i=>i.brief_id===current?.id&&i.generation===current?.generation)??[];
 const review=items.filter(i=>calendar&&publicationStage(i,calendar.assets,calendar.videos)===2).length;
 const missingVideo=items.filter(i=>i.format==='video'&&!calendar?.videos.some(v=>v.item_id===i.id&&v.revision===i.revision)).length;
 const approved=items.filter(i=>i.status==='approved'&&i.approved_revision===i.revision).length;
 const next=!complete?{title:'Complete o perfil da sua empresa',body:'Retome a conversa de onde parou. As informações confirmadas orientam toda a criação.',label:'Continuar conversa',area:'onboarding'}:!calendar?{title:'Continue de onde parou',body:'Consulte o calendário para acompanhar o planejamento. Você também pode acessar os materiais e as conexões abaixo.',label:'Abrir calendário',area:'conteudo'}:preparing?{title:'Suas publicações estão sendo preparadas',body:'A IA está organizando estratégia, textos e artes. Você pode acompanhar o trabalho no calendário.',label:'Acompanhar preparação',area:'conteudo'}:current?.status==='review'?{title:'Sua estratégia está pronta para revisão',body:'Confira o diagnóstico, as metas e as ideias antes de aprovar. Os rascunhos já podem ser vistos no calendário.',label:'Revisar estratégia',area:'estrategia'}:current?.status==='approved'?{title:review?'Revise as publicações prontas':'Continue a produção do calendário',body:review?review+' publicações têm material pronto para sua revisão. Cada peça é aprovada separadamente.':'Veja os textos, envie os vídeos editados e revise as artes da sua empresa.',label:'Abrir calendário',area:'conteudo'}:{title:'Prepare a estratégia da empresa',body:'Transforme o perfil confirmado em objetivos, ações e um calendário de conteúdo.',label:'Abrir estratégia',area:'estrategia'};
 const tasks=[
  {title:'Informações da empresa',body:complete?'Perfil confirmado · versão '+profile.confirmedProfile?.version:'Conclua e confirme a conversa inicial.',done:complete,area:'perfil'},
  {title:'Identidade visual e fotos',body:profile.attachments.length+' materiais enviados. Logo e fotos reais orientam o designer.',done:profile.attachments.some(a=>a.mime.startsWith('image/')),area:'perfil'},
  {title:'Revisão da estratégia',body:current?.status==='approved'?'Estratégia aprovada.':current?.status==='review'?'A proposta aguarda sua avaliação.':loading?'Consultando planejamento…':calendar?'Prepare sua primeira estratégia.':'Não foi possível consultar o planejamento.',done:current?.status==='approved',area:'estrategia'},
  {title:'Produção e aprovação',body:calendar?(items.length?approved+' de '+items.length+' peças aprovadas'+(missingVideo?' · '+missingVideo+' vídeos aguardam upload':''):'A preparação criará as primeiras ideias.'):'Consulte o calendário para acompanhar as peças.',done:items.length>0&&approved===items.length,area:'conteudo'},
  {title:'Canais da empresa',body:channels?channels.channels.filter(c=>c.status==='connected').length+' conexões autorizadas. Confira os acessos por canal.':'Consulte a situação em Integrações.',done:Boolean(channels?.channels.some(c=>c.status==='connected')),area:'integracoes'},
  {title:'Site da clínica',body:site?.site?.published?'Site publicado. Confira o endereço e o HTTPS.':site?.site?.draft?!site.site.draft.whatsapp?'Informe o WhatsApp, revise a página e publique.':'Revise a prévia e publique quando estiver pronta.':site?'Gere sua página com as informações e fotos da empresa.':'Consulte a prévia e a situação do site.',done:Boolean(site?.site?.published),area:'site'}
 ];
 return <><OverviewBi companyId={companyId} canResearch={profile.capabilities.actions.includes('marketing.write')} confirmed={complete}/>{loading?<LoadState label="Consultando as próximas ações…"/>:<section className={s.focusCard}><div><span className={s.eyebrow}>PRÓXIMO PASSO</span><h2>{next.title}</h2><p>{next.body}</p><Link className="button button-primary" href={base+'/'+next.area}>{next.label}<ArrowRight size={16}/></Link></div><div className={s.focusIcon}><CalendarDays size={42}/></div></section>}
 {failures.length>0&&<div className={s.notice} role="status">Não foi possível consultar: {failures.join(', ')}. As outras áreas continuam disponíveis. <Button size="small" variant="outline" onClick={()=>setAttempt(v=>v+1)}><RefreshCw size={14}/>Atualizar</Button></div>}
 <div className={s.shortcutGrid}>{[{Icon:CalendarDays,label:'Calendário',detail:calendar?items.length+' ideias na estratégia':'Planejamento e peças',area:'conteudo'},{Icon:Image,label:'Materiais da marca',detail:profile.attachments.length+' arquivos',area:'perfil'},{Icon:MessageCircle,label:'Conexões',detail:'Atendimento e canais',area:'integracoes'},{Icon:Globe,label:'Meu site',detail:site?.site?.published?'Publicado':'Prévia e endereço',area:'site'}].map(({Icon,label,detail,area})=><Link key={area} href={base+'/'+area}><Icon size={21}/><strong>{label}</strong><small>{detail}</small></Link>)}</div>
 <section className={s.moduleCard}><div className={s.cardHeading}><div><h2>Organize os próximos passos</h2><p>As pendências abaixo usam as informações atuais desta empresa.</p></div></div><div className={s.taskList}>{tasks.map(t=><Link key={t.title} href={base+'/'+t.area}><span className={t.done?s.taskDone:s.taskPending}>{t.done?<Check size={17}/>:<ArrowRight size={17}/>}</span><span><strong>{t.title}</strong><small>{t.body}</small></span><span className={s.taskLabel}>{t.done?'Revisar':'Abrir'}</span></Link>)}</div></section></>;
}
