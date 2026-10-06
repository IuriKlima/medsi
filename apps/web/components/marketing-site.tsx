import {publicSiteOrigin} from '../lib/public-site';
import {BrandWordmark,BrandMark} from './brand';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, Check, ChevronRight, CircleCheck, MessageCircle, Sparkles, Target } from 'lucide-react';
import s from '../app/home.module.css';

export const signupHref='/login?modo=cadastro';
export function marketingMetadata(title:string,description:string,path:string):Metadata {
  const origin=publicSiteOrigin();
  return {title:`MedSI — ${title}`,description,...(origin?{alternates:{canonical:origin+path}}:{}),openGraph:{title:`MedSI — ${title}`,description,...(origin?{url:origin+path}:{}),siteName:'MedSI',locale:'pt_BR',type:'website'}};
}
export function MarketingShell({children,focused=false}:{children:ReactNode;focused?:boolean}) {
  return <div className={s.site}><a href="#conteudo" className={s.skip}>Pular para o conteúdo</a>
    <header className={s.header}><div className={s.headerInner}>
      <Link href="/" className={s.brand} aria-label="MedSI, início"><BrandWordmark/></Link>
      {!focused&&<nav className={s.nav} aria-label="Navegação principal"><a href="/#solucao">A solução</a><a href="/#como-funciona">Como funciona</a><Link href="/planos">Planos</Link><Link href="/sobre">Sobre</Link><Link href="/contato">Contato</Link></nav>}
      <div className={s.headerActions}><Link href="/login" className={s.loginLink}>Entrar</Link><Link href={signupHref} className={s.headerCta}>Começar grátis <ArrowRight size={16}/></Link></div>
    </div>{!focused&&<nav className={s.mobileNav} aria-label="Navegação no celular"><a href="/#solucao">Solução</a><a href="/#como-funciona">Como funciona</a><Link href="/planos">Planos</Link><Link href="/sobre">Sobre</Link><Link href="/contato">Contato</Link><Link href="/suporte">Suporte</Link></nav>}</header>
    <main id="conteudo">{children}</main>
    <footer className={s.footer}><div className={s.footerTop}><div><Link href="/" className={s.brand}><BrandWordmark/></Link><p>Sua clínica em sintonia.<br/>Marketing e atendimento para médicos e clínicas.</p></div><nav aria-label="Soluções"><strong>Soluções</strong><Link href="/lp/marketing-medico">Marketing para clínicas</Link><Link href="/lp/atendimento-medico">Atendimento e relacionamento</Link><a href="/#como-funciona">Como funciona</a></nav><nav aria-label="Institucional"><strong>MedSI</strong><Link href="/sobre">Sobre nós</Link><Link href="/contato">Contato</Link><Link href="/suporte">Central de suporte</Link></nav><nav aria-label="Sua conta"><strong>Seu próximo passo</strong><Link href={signupHref}>Começar grátis</Link><Link href="/login">Entrar no sistema</Link></nav></div><div className={s.footerBottom}><span>© {new Date().getFullYear()} MedSI.</span><span>Feita para quem cuida de pessoas.</span></div></footer>
  </div>;
}
export function SectionHeading({eyebrow,title,description}:{eyebrow:string;title:string;description?:string}){return <div className={s.sectionHeading}><span className={s.eyebrow}>{eyebrow}</span><h2>{title}</h2>{description&&<p>{description}</p>}</div>;}
export function FinalCta({title='Dê o próximo passo com a sua clínica.',description='Organize o marketing e o relacionamento com a inteligência da MedSI.',label='Começar grátis'}:{title?:string;description?:string;label?:string}){return <section className={s.finalCta}><span className={s.eyebrow}>SEU NEGÓCIO NO CENTRO. A IA AO SEU LADO.</span><h2>{title}</h2><p>{description}</p><Link className={s.primary} href={signupHref}>{label}<ArrowRight size={18}/></Link><small>Cadastro sem cobrança automática.</small></section>;}
export function Faq({items,title='Antes do primeiro passo.'}:{items:[string,string][];title?:string}){return <section className={s.faq} id="perguntas"><div><span className={s.eyebrow}>PERGUNTAS FREQUENTES</span><h2>{title}</h2><Link href="/suporte" className={s.textLink}>Visitar central de suporte <ArrowRight size={16}/></Link></div><div className={s.questions}>{items.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>;}

export function ProductPreview({kind='marketing'}:{kind?:'marketing'|'inbox'}) {
  return <figure className={s.productFigure}><div className={s.productWindow}>
    <div className={s.windowBar}><div><i/><i/><i/></div><span>Seu espaço na MedSI</span><span className={s.windowMark}><BrandMark/></span></div>
    <div className={s.productBody}><aside className={s.previewNav} aria-hidden="true"><BrandMark/><Target size={18}/><CalendarDays size={18}/><MessageCircle size={18}/></aside><div className={s.previewMain}><div className={s.previewHeading}><span>CLÍNICA HORIZONTE</span><span>Seu negócio</span></div>
      {kind==='marketing'?<><h3>Sua clínica em sintonia.</h3><div className={s.previewNext}><span className={s.previewSpark}><Sparkles size={20}/></span><div><strong>Estratégia pronta para revisar</strong><p>Uma direção construída para a sua clínica.</p></div><ChevronRight size={18}/></div><div className={s.previewCalendarTitle}><strong>Seu calendário de conteúdo</strong><span>Esta semana</span></div><div className={s.previewDays}>{['SEG','TER','QUA','QUI','SEX'].map((day,i)=><div key={day}><small>{day}</small><span>{14+i}</span>{i===1?<div className={s.miniPost}><Sparkles size={18}/><b>Cuidado.<br/>Informação.</b><small>Imagem · Revisar</small></div>:i===3?<div className={s.miniVideo}><span>▶</span><b>Conheça<br/>nosso espaço</b><small>Vídeo · Criar</small></div>:<i/>}</div>)}</div><div className={s.previewBottom}><CircleCheck size={15}/><span>Planejar</span><ChevronRight size={12}/><span>Criar</span><ChevronRight size={12}/><span>Revisar</span></div></>:
      <><h3>Cada conversa tem um próximo passo.</h3><div className={s.chatDemo}><div className={s.chatContact}><span>MA</span><div><strong>Marina</strong><small>Interessada em conhecer a clínica</small></div><span className={s.onlineDot}/></div><div className={s.bubble}>Olá! Como solicito uma consulta?</div><div className={s.bubbleReply}>Olá, Marina! Para qual especialidade? Nossa equipe confirma os horários disponíveis.</div><div className={s.chatSuggestion}><Sparkles size={15}/> Resposta ilustrativa · revisar antes de enviar</div></div><div className={s.miniPipeline}><span>Novo contato</span><ChevronRight size={13}/><strong>Em atendimento</strong><ChevronRight size={13}/><span>Agendamento</span></div></>}
    </div></div>
  </div><div className={s.floatingNote}><span><Check size={16}/></span><div><strong>{kind==='marketing'?'Sua marca. Sua aprovação.':'IA e equipe na mesma conversa.'}</strong><small>{kind==='marketing'?'A MedSI prepara. Você decide.':'Você assume quando precisar.'}</small></div></div><figcaption>Exemplo ilustrativo da experiência. Nenhum dado de cliente.</figcaption></figure>;
}
