'use client';
import {MedicalOnboarding,type MedicalOnboardingProps} from './medical-onboarding';
import {HelpChat} from './help-chat';
import Link from 'next/link';
import {CompanyChannels} from './company-channels';
import {OnboardingPlaces} from './onboarding-places';
import { useCallback,useEffect,useRef,useState } from 'react';
import { ArrowUp,Paperclip,Check,RefreshCw,MessageCircle,ClipboardList,ArrowLeft,UserRound,CheckCheck } from 'lucide-react';
import { Button } from '@askadia/ui';
import { essentialKeys,interviewKeys,labels,missingEssentials,profileKeys,type FactInput,type OnboardingSnapshot,type ProfileKey,type ProfileFacts,type onboardingActions } from '@askadia/contracts';
import { journeyApi,JourneyError } from '../lib/journey-api';
import styles from './journey.module.css';
import chat from './onboarding-chat.module.css';
import {BrandMark,BrandWordmark} from './brand';
export function LegacyOnboardingChat({companyId,readOnly=false,summaryOnly=false,immersive=false,onExit,onConfirmed}:{companyId:string;readOnly?:boolean;summaryOnly?:boolean;immersive?:boolean;onExit?:()=>void;onConfirmed?:(data:OnboardingSnapshot)=>void}){
 const [uploadProgress,setUploadProgress]=useState('');
 const [data,setData]=useState<OnboardingSnapshot|null>(null),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[showSummary,setShowSummary]=useState(summaryOnly);
 const [website,setWebsite]=useState(''),[websiteResult,setWebsiteResult]=useState<{message:string;facts:{key:ProfileKey;value:string;source:string}[]}|null>(null),[readingWebsite,setReadingWebsite]=useState(false);
 const viewport=useRef<HTMLElement>(null),scroller=useRef<HTMLDivElement>(null),answer=useRef<HTMLTextAreaElement>(null);
 const alive=useRef(true),lock=useRef(false),end=useRef<HTMLDivElement>(null),pending=useRef<{fingerprint:string;requestId:string}|null>(null);
 const load=useCallback(async(signal?:AbortSignal)=>{const r=await journeyApi<OnboardingSnapshot>('companies/'+companyId,undefined,signal);if(!signal?.aborted&&alive.current)setData(r);},[companyId]);
 useEffect(()=>{alive.current=true;const c=new AbortController();load(c.signal).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>{alive.current=false;c.abort();};},[load]);
 useEffect(()=>{if(!immersive)return;const resize=()=>viewport.current?.style.setProperty('--chat-height',(window.visualViewport?.height??window.innerHeight)+'px');resize();window.visualViewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);return()=>{window.visualViewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize);};},[immersive]);
 useEffect(()=>{if(!data)return;const frame=requestAnimationFrame(()=>{if(showSummary){scroller.current?.scrollTo({top:0});return;}if(immersive&&scroller.current&&end.current){const container=scroller.current;container.scrollTo({top:end.current.getBoundingClientRect().top-container.getBoundingClientRect().top+container.scrollTop-24,behavior:'auto'});}else end.current?.scrollIntoView({block:'nearest',behavior:'smooth'});});return()=>cancelAnimationFrame(frame);},[data,showSummary,immersive]);
 useEffect(()=>{if(!immersive||!answer.current)return;answer.current.style.height='auto';answer.current.style.height=Math.min(answer.current.scrollHeight+2,112)+'px';},[text,immersive]);
 async function send(message:string,action:typeof onboardingActions[number]='reply',answers:Partial<Record<ProfileKey,FactInput>>={}){
  if(!data||lock.current||readOnly)return false;lock.current=true;setBusy(true);setError('');
  const fingerprint=JSON.stringify({companyId,revision:data.state.revision,message,action,answers});if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,requestId:crypto.randomUUID()};
  try{const r=await journeyApi<OnboardingSnapshot>('companies/'+companyId+'/answers',{requestId:pending.current.requestId,revision:data.state.revision,message,action,answers});if(!alive.current)return false;setData(r);setText('');if(action==='reopen')setShowSummary(false);pending.current=null;if(action==='confirm'){if(onConfirmed)onConfirmed(r);else window.location.assign('/comecar?empresa='+companyId);}return true;}
  catch(e){if(!alive.current)return false;if(e instanceof JourneyError&&e.status===409){try{await load();}catch{/* Keep the original conflict and the user's correction visible. */}pending.current=null;}setError(e instanceof Error?e.message:'Não foi possível salvar. Sua resposta continua no campo.');return false;}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function readWebsite(){if(readingWebsite||busy)return;setReadingWebsite(true);setError('');try{const r=await journeyApi<NonNullable<typeof websiteResult>>('companies/'+companyId+'/website',{url:website,requestId:crypto.randomUUID()});if(alive.current)setWebsiteResult(r);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Não foi possível consultar.');}finally{if(alive.current)setReadingWebsite(false);}}
 async function upload(files:File[]){if(lock.current||!files.length)return;lock.current=true;setBusy(true);setError('');const failures:string[]=[];let saved=0;try{for(const [i,file] of files.entries()){if(!alive.current)break;setUploadProgress('Enviando '+(i+1)+' de '+files.length+' · '+file.name);try{if(file.size>10485760)throw new Error('limite de 10 MB');const response=await fetch('/api/onboarding/companies/'+companyId+'/attachments/'+crypto.randomUUID(),{method:'POST',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)},body:file});const r=await response.json();if(!response.ok)throw new Error(r.message??'falha no envio');saved++;}catch(e){failures.push(file.name+': '+(e instanceof Error?e.message:'falha no envio'));}}if(alive.current){await load();setUploadProgress(saved+' de '+files.length+' arquivo(s) enviado(s).');if(failures.length)setError('Não enviados: '+failures.join('; '));}}catch{if(alive.current)setError('Os envios concluídos foram salvos. Atualize a página para consultar os materiais.');}finally{lock.current=false;if(alive.current)setBusy(false);}}

 const stage=data?.step==='complete'?5:!data?.state.location_confirmed?0:!data.state.competitors_reviewed?1:!data.state.references_reviewed?2:data.step==='review'?4:3;
 const stepNames=['Localização','Concorrentes','Referências','Seu negócio','Confirmação'];
 if(!data)return <section ref={viewport} className={immersive?chat.loading:'panel internal-empty'} role={error?'alert':'status'}><BrandMark/><p>{error||'Retomando a conversa…'}</p>{error&&<Button onClick={()=>{setError('');void load().catch(e=>setError(e.message));}}>Tentar novamente</Button>}</section>;
 const completed=interviewKeys.filter(k=>data.state.facts[k]).length;
 const optional=!essentialKeys.includes(data.step as typeof essentialKeys[number])&&data.step!=='identity';
 const canConfirm=missingEssentials(data.state.facts).length===0&&data.state.location_confirmed&&data.state.competitors_reviewed&&data.state.references_reviewed;
 const lastMessage=data.messages.at(-1);
 const includesQuestion=lastMessage?.role==='assistant'&&lastMessage.body.includes(data.question);
 const history=includesQuestion?data.messages.slice(0,-1):data.messages;
 const active=data.step!=='complete'&&!readOnly;
 const tools=<>
   {(data.step==='location'||data.step==='competitors')&&<OnboardingPlaces companyId={companyId} data={data} disabled={busy||readOnly} onSend={send} onSaved={value=>{setData(value);setText('');setError('');}}/>}
   {data.step==='channels'&&data.provider.aiAllowed&&<div className={styles.placePanel}><h3>Aproveitar informações do seu site</h3><p>As sugestões só entram no perfil depois de você conferir. Se não tiver site, informe na conversa para registrar a necessidade de criação.</p><label className="form">Endereço público do site<input type="url" placeholder="https://suaempresa.com.br" value={website} onChange={e=>{setWebsite(e.target.value);setWebsiteResult(null);}} maxLength={2000}/></label><Button variant="outline" disabled={busy||readingWebsite||!website} onClick={readWebsite}>{readingWebsite?'Consultando…':'Consultar site'}</Button>{websiteResult&&<><p role="status">{websiteResult.message}</p>{websiteResult.facts.map((f,i)=><article className={styles.brief} key={i}><div><h3>{labels[f.key]}</h3><p>{f.value}</p><a href={f.source} target="_blank" rel="noreferrer">Ver fonte</a><Button disabled={busy} variant="outline" size="small" onClick={()=>void send('Conferi esta informação sugerida pelo site: '+f.source,'edit',{[f.key]:{value:f.value+'\nFonte conferida: '+f.source,status:'provided'}})}>Conferi e quero usar</Button></div></article>)}</>}</div>}
   {data.step==='references'&&<p className={styles.provider}>Os concorrentes locais já ficam salvos. A busca dos perfis no Instagram e a análise aparecerão na primeira etapa da Estratégia, após confirmar seu plano. Aqui, conte quais marcas inspiram você ou informe os perfis que já conhece.</p>}
   {(data.step==='channels'||data.step==='review'||(typeof window!=='undefined'&&new URLSearchParams(window.location.search).has('meta_session')))&&<div className={styles.placePanel}><h2>Conecte suas contas durante a conversa</h2><p>Autorize as contas que deseja usar. Cada provedor pode pedir login, seleção de conta ou leitura do QR code. A preparação continua se alguma conexão ficar pendente.</p><CompanyChannels companyId={companyId}/></div>}
   {data.step==='references'&&<Button variant="outline" disabled={busy} onClick={()=>void send(data.state.facts.references?'Concluí a revisão das referências.':'Não tenho referências.','review_references',data.state.facts.references?{}:{references:{value:null,status:'unknown'}})}>Concluir referências e continuar</Button>}

 </>;
 const materials=<>{data.attachments.length>0&&<div className={styles.attachments}><strong>Materiais da empresa</strong>{data.attachments.map(a=><a key={a.id} href={'/api/onboarding/companies/'+companyId+'/attachments/'+a.id} target="_blank" rel="noreferrer"><Paperclip size={13}/>{a.name}</a>)}</div>}</>;
 const attachmentInput=<input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" disabled={busy||readOnly} aria-label="Anexar materiais da empresa" onChange={e=>{const files=Array.from(e.target.files??[]);if(files.length)void upload(files);e.target.value='';}}/>;
 return <section ref={viewport} className={immersive?chat.immersive:styles.onboarding} aria-label="Conversa de cadastro com a MedSI">
  {immersive&&<aside className={chat.sidebar}>
   <Link href="/" className={chat.brand} aria-label="MedSI, início"><BrandWordmark/></Link>
   <div className={chat.selectedConversation}><span><MessageCircle size={20}/></span><div><strong>Vamos conhecer seu negócio</strong><small>{data.state.facts.name?.value??'Sua conversa com a MedSI'}</small></div></div>
   <p className={chat.sidebarLabel}>NOSSA CONVERSA</p>
   <ol className={chat.stages} aria-label="Etapas do cadastro">{stepNames.map((name,i)=><li key={name} aria-current={stage===i?'step':undefined} data-done={stage>i}><span>{stage>i?<Check size={14}/>:i+1}</span><div>{name}{stage===i&&<small>Estamos aqui</small>}</div></li>)}</ol>
   <div className={chat.sidebarBottom}><p><CheckCheck size={17}/>Suas respostas ficam salvas</p><small>Depois da conversa, você escolhe seu plano e revisa a estratégia.</small><Link href="/entrada"><UserRound size={16}/>Minha conta</Link></div>
  </aside>}
  <div className={immersive?chat.main:undefined}>
   {immersive?<header className={chat.header}>
    {onExit&&<button className={chat.iconButton} onClick={onExit} aria-label="Voltar ao próximo passo"><ArrowLeft size={20}/></button>}
    <span className={chat.avatar}><BrandMark/></span><div className={chat.contact}><h1>MedSI</h1><p>{busy?'Salvando suas informações…':showSummary?'Revise as informações da sua empresa':'Seu assistente de marketing'}</p></div>
    <HelpChat companyId={companyId} aboveComposer/><button className={chat.reviewButton} aria-label={showSummary?'Ver conversa':'Revisar perfil'} onClick={()=>setShowSummary(v=>!v)} aria-pressed={showSummary}><ClipboardList size={18}/><span>{showSummary?'Ver conversa':'Revisar perfil'}</span></button><Link className={chat.accountButton} href="/entrada" aria-label="Minha conta"><UserRound size={20}/></Link>
   </header>:<><header className={styles.chatHeader}><div><p className="page-eyebrow">CONHECER MINHA EMPRESA</p><h1>{data.state.facts.name?.value??'Vamos cadastrar sua empresa.'}</h1><p>Uma conversa para colocar seu marketing em movimento.</p></div><Button variant="outline" onClick={()=>setShowSummary(v=>!v)}>{showSummary?'Ver conversa':'Revisar perfil'}</Button></header><ol className={styles.steps} aria-label="Etapas do cadastro">{stepNames.map((name,i)=><li key={name} aria-current={stage===i?'step':undefined} data-done={stage>i}>{stage>i?<Check size={13}/>:i+1}<span>{name}</span></li>)}</ol></>}
   {immersive&&<div className={chat.mobileStage}>Etapa {Math.min(stage+1,5)} de 5 · {stepNames[Math.min(stage,4)]}<span>{stage===3?completed+' de '+interviewKeys.length+' assuntos':'Respostas salvas'}</span></div>}
   <div ref={scroller} className={immersive?chat.scrollArea:undefined} tabIndex={immersive?0:undefined} aria-label={showSummary?'Revisão do perfil':'Histórico da conversa'}>
    <div className={immersive?chat.conversation:undefined}>
     <p className={immersive?chat.systemMessage:styles.provider}>{data.provider.message}</p>
     {showSummary?<><h2 className={chat.summaryTitle}>Seu negócio, do seu jeito</h2><p className={styles.provider}>Confira o que conversamos. Você pode corrigir qualquer informação.</p><ProfileSummary facts={data.state.facts} disabled={busy||readOnly} onSave={(key,fact)=>send('Atualização de '+labels[key],'edit',{[key]:fact})}/>{materials}{data.state.facts.placeId?.value&&<p className={styles.provider}><a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(data.state.facts.name?.value??'Estabelecimento')+'&query_place_id='+encodeURIComponent(data.state.facts.placeId.value)} target="_blank" rel="noreferrer">Ver local selecionado no Google Maps</a></p>}{data.state.facts.competitorPlaceIds?.value&&<div className={styles.attachments}>{data.state.facts.competitorPlaceIds.value.split('\n').map((id,i)=><a key={id} href={'https://www.google.com/maps/search/?api=1&query=Estabelecimento&query_place_id='+encodeURIComponent(id)} target="_blank" rel="noreferrer">Concorrente selecionado {i+1}</a>)}</div>}</>:<>
      <div className={immersive?chat.messages:styles.messages} role="log" aria-label="Mensagens da conversa" aria-live="polite" aria-relevant="additions text">
       {history.map(m=><article key={m.id} className={m.role==='user'?styles.userMessage:styles.agentMessage}><small>{m.role==='user'?'Você':'MedSI'}</small><p>{m.body}</p>{immersive&&m.role==='user'&&<span className={chat.saved}><CheckCheck size={14}/><span className="sr-only">Resposta salva</span></span>}</article>)}
       <div ref={end}/><article className={styles.agentMessage}><small>MedSI</small><p>{includesQuestion?lastMessage.body:data.question}</p></article>
      </div>
      {active&&<div className={immersive?chat.tools:undefined}>{tools}</div>}
      {materials}
     </>}
     {(data.step==='review'||showSummary)&&!canConfirm&&<p className="info-note">Ainda falta confirmar localização, concorrentes e referências, além de: {missingEssentials(data.state.facts).map(k=>labels[k]).join(', ')||'revisar as etapas da conversa'}.</p>}
    </div>
   </div>
   <div className={immersive?chat.footer:undefined}>
    {error&&<div className={immersive?chat.error:'error-banner'} role="alert">{error}</div>}
    {uploadProgress&&<p className={chat.uploadStatus} role="status">{uploadProgress}</p>}
    {active&&<>
     {canConfirm&&(showSummary||data.step==='review')?<div className={immersive?chat.confirm:styles.confirmBar}><p>Está tudo certo com o perfil da sua empresa?</p><Button disabled={busy} onClick={()=>void send('Confirmo o perfil da minha empresa para orientar os agentes.','confirm')}>Confirmar perfil<Check size={16}/></Button></div>:!showSummary&&<form className={immersive?chat.composer:styles.composer} onSubmit={e=>{e.preventDefault();if(text.trim())void send(text.trim());}}>
      {optional&&<div className={immersive?chat.quickReplies:styles.quickReplies}><button type="button" disabled={busy} onClick={()=>void send('Não sei')}>Não sei</button><button type="button" disabled={busy} onClick={()=>void send('Não tenho')}>Não tenho</button><button type="button" disabled={busy} onClick={()=>void send('Responder depois')}>Responder depois</button>{canConfirm&&<button type="button" disabled={busy} onClick={()=>setShowSummary(true)}>Revisar e concluir<Check size={13}/></button>}</div>}
      <label htmlFor="onboarding-answer" className={immersive?'sr-only':undefined}>{data.step==='review'?'Quais informações da empresa você quer atualizar?':data.question}</label>
      <div className={immersive?chat.inputRow:undefined}>
       {immersive&&<label className={chat.attachButton} title="Anexar material"><Paperclip size={22}/>{attachmentInput}</label>}
       <textarea ref={answer} id="onboarding-answer" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(immersive&&e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(text.trim()&&!busy)void send(text.trim());}}} rows={immersive?1:3} maxLength={6000} required readOnly={busy} placeholder="Digite sua mensagem…"/>
       {immersive?<button className={chat.sendButton} type="submit" disabled={busy||!text.trim()} aria-label={busy?'Salvando resposta':'Enviar mensagem'}><ArrowUp size={20}/></button>:<div className={styles.composerActions}><label className={styles.upload}><Paperclip size={17}/>Anexar material{attachmentInput}</label><Button type="submit" disabled={busy||!text.trim()}>{busy?'Salvando…':'Enviar'}<ArrowUp size={16}/></Button></div>}
      </div>
     </form>}
     {showSummary&&!canConfirm&&<button className={chat.backToChat} onClick={()=>setShowSummary(false)}><ArrowLeft size={16}/>Continuar a conversa</button>}
    </>}
    {data.step==='complete'&&<div className={immersive?chat.confirm:styles.confirmBar}><div><strong>Perfil confirmado · versão {data.state.profile_version}</strong>{!immersive&&<p>Atualizações geram uma nova versão e sinalizam a revisão do planejamento.</p>}</div>{!readOnly&&<Button disabled={busy} variant="outline" onClick={()=>void send('Quero atualizar as informações da empresa.','reopen')}><RefreshCw size={15}/>Atualizar pela conversa</Button>}{onExit?<Button onClick={onExit}>Continuar<Check size={16}/></Button>:<Link className="button button-primary" href={'/empresa/'+companyId+'/estrategia'}>Revisar minha estratégia</Link>}{!readOnly&&<label className={styles.upload}><Paperclip size={17}/>Adicionar materiais{attachmentInput}</label>}</div>}
    {readOnly&&data.step!=='complete'&&<p className={chat.readOnly}>Você pode acompanhar esta conversa. Para responder, peça acesso ao responsável pela empresa.</p>}
   </div>
  </div>
 </section>;
}
export function ProfileSummary({facts,disabled=true,onSave}:{facts:ProfileFacts;disabled?:boolean;onSave?:(key:ProfileKey,fact:FactInput)=>Promise<boolean>}){
 const [editing,setEditing]=useState<ProfileKey|null>(null),[value,setValue]=useState(''),[status,setStatus]=useState<FactInput['status']>('provided');
 return <div className={styles.summary}>{profileKeys.filter(k=>k!=='placeId'&&k!=='competitorPlaceIds').map(key=><article key={key}><div className={styles.cardHeading}><h3>{labels[key]}</h3>{!disabled&&<button onClick={()=>{setEditing(key);setValue(facts[key]?.value??'');setStatus(facts[key]?.status??'provided');}}>Corrigir</button>}</div>{editing===key?<form className="form" onSubmit={async e=>{e.preventDefault();const saved=await onSave?.(key,{value:status==='provided'?value:null,status});if(saved)setEditing(null);}}><label className="sr-only" htmlFor={'edit-'+key}>{labels[key]}</label><textarea id={'edit-'+key} value={value} onChange={e=>setValue(e.target.value)} maxLength={['name','city','businessType'].includes(key)?100:6000} required={status==='provided'} disabled={disabled||status!=='provided'}/><select aria-label={'Situação de '+labels[key]} value={status} onChange={e=>setStatus(e.target.value as FactInput['status'])}><option value="provided">Informado</option><option value="unknown">Não sei / não tenho</option><option value="deferred">Responder depois</option></select><div className="row"><Button size="small" disabled={disabled} type="submit">Salvar correção</Button><Button size="small" variant="ghost" onClick={()=>setEditing(null)} type="button">Cancelar</Button></div></form>:<><p>{facts[key]?.status==='provided'?facts[key]?.value:facts[key]?.status==='unknown'?'Declarado desconhecido ou não disponível':facts[key]?.status==='deferred'?'Responder depois':'Não informado'}</p>{facts[key]&&<small>Origem: {facts[key]?.source==='existing'?'cadastro existente':facts[key]?.source==='assistant_suggestion'?'interpretação a conferir':'informado na conversa'}</small>}</>}</article>)}</div>;
}

export function OnboardingChat(props:MedicalOnboardingProps){return <MedicalOnboarding key={props.companyId} {...props}/>;}
