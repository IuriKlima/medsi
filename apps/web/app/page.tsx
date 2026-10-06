import { ArrowRight, CalendarDays, Check, Globe2, MessageCircle, Sparkles, Target, Users } from 'lucide-react';
import Link from 'next/link';
import { BrandContours, BrandWordmark } from '../components/brand';
import { MarketingShell, ProductPreview, SectionHeading, FinalCta, Faq, marketingMetadata, signupHref } from '../components/marketing-site';
import s from './home.module.css';

export const metadata = marketingMetadata('Marketing e atendimento para médicos e clínicas', 'Transforme o que sua clínica tem de melhor em estratégia, conteúdo e relacionamento. Conheça a MedSI, o marketing com IA pensado para médicos e clínicas.', '/');

export default function HomePage() {
  return <MarketingShell>
    <section className={s.hero}>
      <div className={s.heroCopy}>
        <span className={s.eyebrow}><span className={s.dot}/>PARA MÉDICOS E CLÍNICAS</span>
        <h1>Sua clínica<br/>em <span>sintonia.</span></h1>
        <p>Marketing e atendimento com IA, conectados à rotina da sua clínica. Organize sua presença digital, acolha cada contato e acompanhe o próximo agendamento com sua equipe.</p>
        <div className={s.actions}><Link className={s.primary} href={signupHref}>Começar grátis <ArrowRight size={18}/></Link><a className={s.textLink} href="#como-funciona">Veja como funciona <ArrowRight size={16}/></a></div>
        <p className={s.microcopy}>Comece pelo cadastro. Sem cobrança automática.</p>
      </div>
      <ProductPreview/>
    </section>
    <section className={s.brandStatement} aria-label="MedSI: sua clínica em sintonia">
      <BrandContours/>
      <div><BrandWordmark/><p>Sua clínica em sintonia.</p></div>
      <span>Da primeira conversa<br/>ao próximo agendamento.</span>
    </section>
    <div className={s.proofStrip}><span>MARKETING E ATENDIMENTO EM SINTONIA</span><p><Target size={18}/> Estratégia</p><p><CalendarDays size={18}/> Conteúdo</p><p><MessageCircle size={18}/> Atendimento</p><p><Users size={18}/> Relacionamento</p></div>
    <section id="solucao" className={s.section}>
      <SectionHeading eyebrow="FEITO PARA QUEM CUIDA DE PESSOAS" title="Seu marketing também precisa de um plano." description="Entre consultas, equipe e gestão, sobra pouco espaço para decidir o que postar, acompanhar cada interessado e manter tudo em movimento. A MedSI organiza esse trabalho com você."/>
      <div className={s.benefitGrid}>
        <article><span className={s.featureIcon}><Target size={23}/></span><h3>Saiba o que fazer primeiro.</h3><p>Uma estratégia construída com as informações da sua clínica, seus objetivos e o contexto do seu negócio.</p><Link href="/lp/marketing-medico">Conhecer a solução de marketing <ArrowRight size={16}/></Link></article>
        <article><span className={s.featureIcon}><Sparkles size={23}/></span><h3>Mostre o valor do seu espaço.</h3><p>Ideias, legendas, roteiros e artes orientados pela sua identidade visual. Um calendário para transformar intenção em rotina.</p><a href="#como-funciona">Entender o processo <ArrowRight size={16}/></a></article>
        <article><span className={s.featureIcon}><MessageCircle size={23}/></span><h3>Dê continuidade ao interesse.</h3><p>Conversas e oportunidades organizadas para sua equipe saber quem chegou, o que precisa e qual é o próximo passo.</p><Link href="/lp/atendimento-medico">Conhecer atendimento e CRM <ArrowRight size={16}/></Link></article>
      </div>
    </section>
    <section id="como-funciona" className={s.workflowSection}>
      <div className={s.workflowInner}>
        <div><span className={s.eyebrow}>UMA JORNADA. CADA ETAPA NO SEU LUGAR.</span><h2>Você conhece sua clínica.<br/><span>A MedSI transforma isso em direção.</span></h2><p>O ponto de partida é uma conversa. Depois, você acompanha a preparação e decide o que segue adiante.</p><Link href={signupHref} className={s.lightButton}>Dar o primeiro passo <ArrowRight size={17}/></Link></div>
        <ol className={s.steps}>{[
          ['Conte a sua história', 'Apresente especialidades, público, objetivos, fotos e identidade visual.'],
          ['Escolha seu plano', 'Depois da conversa gratuita, confirme seu plano para liberar a IA.'],
          ['Revise a estratégia', 'Receba uma proposta com posicionamento, temas e ações para sua clínica.'],
          ['Dê vida ao calendário', 'Acompanhe textos e artes, grave os roteiros e envie os vídeos editados.'],
          ['Aprove e acompanhe', 'Revise cada peça e organize as próximas ações com a sua equipe.'],
        ].map(([title,body],i)=><li key={title}><span>0{i+1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
      </div>
    </section>
    <section className={s.section}>
      <SectionHeading eyebrow="SUA OPERAÇÃO DE MARKETING, CONECTADA" title="Do conteúdo que chama atenção à conversa que aproxima."/>
      <div className={s.solutionGrid}>
        <article className={s.solutionWide}><div><span className={s.eyebrow}>CONTEÚDO COM IDENTIDADE</span><h3>Sua clínica.<br/>Seu jeito de se apresentar.</h3><p>As informações confirmadas, as referências e as imagens do seu espaço orientam a criação. Você revisa o resultado e mantém a palavra final.</p><ul className={s.checks}><li><Check size={16}/> Estratégia e calendário editorial</li><li><Check size={16}/> Textos, artes e roteiros com IA</li><li><Check size={16}/> Revisão e aprovação por publicação</li></ul></div><div className={s.creativeSample} aria-label="Exemplo ilustrativo de uma publicação"><span>CLÍNICA HORIZONTE · EXEMPLO</span><div className={s.creativeOrbit}/><strong>Informação<br/>que aproxima.<br/><em>Cuidado.</em></strong><small>CONTEÚDO COM A IDENTIDADE DA SUA CLÍNICA</small></div></article>
        <article><MessageCircle size={26}/><h3>Atendimento com contexto.</h3><p>Conecte o WhatsApp, configure seu assistente com as informações da clínica e assuma a conversa quando precisar.</p><Link href="/lp/atendimento-medico">Explorar atendimento <ArrowRight size={16}/></Link></article>
        <article><Globe2 size={26}/><h3>Uma página para apresentar seu espaço.</h3><p>Crie e edite o site da clínica, confira no desktop e no celular e publique a versão revisada. Domínio próprio depende da configuração de DNS e HTTPS.</p><Link href={signupHref}>Conhecer a plataforma <ArrowRight size={16}/></Link></article>
      </div>
    </section>
    <section className={s.controlSection}><span className={s.featureIcon}><Check size={24}/></span><div><span className={s.eyebrow}>INTELIGÊNCIA ARTIFICIAL. DECISÕES SUAS.</span><h2>A IA prepara.<br/>Você dá a direção.</h2><p>A estratégia passa pela sua revisão. As peças têm aprovação própria. Atendimento automático e campanhas exigem configuração e ativação. Sua equipe continua no controle da operação.</p></div><Link className={s.secondary} href="/sobre">Conheça a MedSI <ArrowRight size={16}/></Link></section>
    <Faq items={[
      ['A MedSI atende médicos e clínicas?', 'Sim. A plataforma foi pensada para consultórios médicos e clínicas que precisam organizar estratégia, conteúdo e atendimento administrativo. Você pode cadastrar mais de uma empresa, mantendo informações e permissões separadas.'],
      ['Preciso saber criar conteúdo ou usar IA?', 'A jornada começa com uma conversa sobre o negócio. A MedSI usa as informações confirmadas para preparar a estratégia e os materiais. Sua participação é revisar, ajustar e aprovar o que representa a clínica.'],
      ['A MedSI substitui atendimento médico ou agenda clínica?', 'Não. O assistente apoia informações administrativas e solicitações de agendamento. A equipe confirma horários e conduz questões clínicas. Integrações com agendas e sistemas de saúde precisam de configuração e homologação.'],
      ['Quem grava e edita os vídeos?', 'A MedSI prepara os roteiros. Sua equipe grava, edita e envia o arquivo final no calendário para revisão e aprovação.'],
      ['A MedSI publica e ativa anúncios sozinha?', 'Não. O calendário organiza datas e aprovações; a publicação automática nas redes ainda está em evolução. Campanhas pagas são propostas para revisão, e sua execução depende das integrações e contas autorizadas. Não há ativação de anúncios ou verba automática.'],
      ['Como começo? O cadastro gera cobrança?', 'Crie seu acesso, confirme seu e-mail e cadastre a clínica. O cadastro não contrata uma assinatura nem gera cobrança automática. Recursos de IA estão sujeitos à disponibilidade e aos limites configurados para sua empresa.'],
    ]}/>
    <FinalCta title="O próximo capítulo da sua clínica começa com um plano." description="Apresente sua clínica ou consultório. Organize sua comunicação e dê continuidade a cada contato."/>
  </MarketingShell>;
}
