'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,ArrowRight,Check,CheckCheck,FileText,ImagePlus,UploadCloud} from 'lucide-react';
import {medicalIntakeAnswersWithBusinessType,brazilStates,cnpjSchema,logoStyles,medicalAnswerSchemas,medicalIntakeLabels,medicalIntakeSteps,medicalSpecialties,nextMedicalIntakeStep,type CnpjLookupResult,type MedicalIntakeAnswers,type MedicalIntakeStep,type OnboardingAttachment,type OnboardingSnapshot} from '@askadia/contracts';
import {BrandWordmark} from './brand';
import {HelpChat} from './help-chat';
import {journeyApi,JourneyError} from '../lib/journey-api';
import s from './medical-onboarding.module.css';

export type MedicalOnboardingProps={companyId:string;summaryOnly?:boolean;immersive?:boolean;readOnly?:boolean;onConfirmed?:(data:OnboardingSnapshot)=>void;onExit?:()=>void;api?:typeof journeyApi;uploadFile?:(companyId:string,file:File)=>Promise<OnboardingAttachment>;demo?:boolean};
function intakeCopy(type:'clinic'|'medical_practice'|undefined){
 const clinic=type==='clinic',of=clinic?'da sua clínica':'do seu consultório',your=clinic?'Sua clínica':'Seu consultório';
 const titles:Record<MedicalIntakeStep|'review',string>={businessType:'Você atende em uma clínica ou em um consultório?',cnpj:'Qual é o CNPJ '+of+'?',address:'Este é o endereço '+of+'?',specialty:clinic?'Quais especialidades sua clínica oferece?':'Qual é a sua especialidade?',history:clinic?'Vamos conhecer a história da sua clínica.':'Queremos conhecer sua trajetória.',logo:your+' já tem um logo?',photos:'Vamos conhecer o espaço '+of+'?',website:your+' já tem um site?',review:'Tudo certo com o cadastro '+of+'?'};
 const descriptions:Record<MedicalIntakeStep|'review',string>={businessType:'Escolha o tipo de atendimento para adaptarmos as próximas perguntas ao seu negócio.',cnpj:'Vamos buscar os dados cadastrais '+of+' para facilitar seu início.',address:'Confira as informações e ajuste o endereço de atendimento '+of+'.',specialty:clinic?'Selecione as especialidades da equipe. Você também pode escrever outra opção.':'Selecione uma ou mais opções da sua atuação. Você também pode escrever outra especialidade.',history:clinic?'Conte como a clínica começou, a experiência da equipe e seus diferenciais. Se preferir, envie o currículo do responsável em PDF.':'Envie seu currículo em PDF ou conte sua formação, experiência e trajetória no consultório.',logo:'Envie a marca '+of+' ou deixe a MedSI preparar uma proposta para você.',photos:'Fotos reais ajudam a criar uma comunicação com a identidade '+of+'.',website:'Se ainda não tiver, prepararemos um rascunho para '+(clinic?'sua clínica':'seu consultório')+' após as aprovações.',review:'Confira suas respostas. Primeiro vamos conhecer o público da região; depois, você aprova cada etapa do plano.'};
 return {titles,descriptions,of,your,clinic};
}
const emptyAddress={name:'',addressLine:'',city:'',uf:'',postalCode:''};

async function defaultUpload(companyId:string,file:File):Promise<OnboardingAttachment>{
 const r=await fetch('/api/onboarding/companies/'+companyId+'/attachments/'+crypto.randomUUID(),{method:'POST',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)},body:file});
 const value=await r.json();if(!r.ok)throw new Error(value.message??'Não foi possível enviar o arquivo.');return value;
}
export function MedicalOnboarding({companyId,summaryOnly=false,immersive=false,readOnly=false,onConfirmed,onExit,api=journeyApi,uploadFile=defaultUpload,demo=false}:MedicalOnboardingProps){
 const [data,setData]=useState<OnboardingSnapshot|null>(null),[answers,setAnswers]=useState<MedicalIntakeAnswers>({}),[active,setActive]=useState<MedicalIntakeStep|'review'>('businessType');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uploadStatus,setUploadStatus]=useState(''),[lookup,setLookup]=useState<CnpjLookupResult|null>(null),[other,setOther]=useState(''),[editing,setEditing]=useState(false),[conflict,setConflict]=useState(false);
 const alive=useRef(true),lock=useRef(false),heading=useRef<HTMLHeadingElement>(null),pending=useRef<{key:string;id:string}|null>(null);
 const base='companies/'+companyId;
 const applySnapshot=useCallback((value:OnboardingSnapshot)=>{setData(value);setAnswers(medicalIntakeAnswersWithBusinessType(value.state.medical_intake?.answers));setActive(value.state.confirmed_revision===value.state.revision?'review':nextMedicalIntakeStep(value.state.medical_intake));setConflict(false);},[]);
 const load=useCallback(async(signal?:AbortSignal)=>{const value=await api<OnboardingSnapshot>(base,undefined,signal);if(!signal?.aborted&&alive.current)applySnapshot(value);},[api,base,applySnapshot]);
 useEffect(()=>{alive.current=true;const c=new AbortController();void load(c.signal).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível retomar o cadastro.');});return()=>{alive.current=false;c.abort();};},[load]);
 useEffect(()=>{heading.current?.focus({preventScroll:true});setUploadStatus('');setOther('');},[active]);
 const set=<K extends MedicalIntakeStep>(key:K,value:MedicalIntakeAnswers[K])=>setAnswers(a=>({...a,[key]:value}));
 const completed=Boolean(data&&data.state.confirmed_revision===data.state.revision&&!editing);
 const canWrite=!readOnly&&Boolean(data?.capabilities.actions.includes('marketing.write'));
 const disabled=busy||!canWrite||conflict;
 const total=medicalIntakeSteps.length+1;
 const selected=active==='review'?medicalIntakeSteps.length:medicalIntakeSteps.indexOf(active);
 const businessType=answers.businessType?.value;
 const {titles,descriptions,of,your,clinic}=intakeCopy(businessType);
 const labels={...medicalIntakeLabels,history:clinic?'História da clínica':'Sua trajetória',specialty:clinic?'Especialidades':'Especialidade'};
 const address=answers.address??{...emptyAddress,businessType:businessType??'clinic'};
 const currentAttachments=data?.attachments??[];
 const attachmentName=(id:string)=>currentAttachments.find(a=>a.id===id)?.name??'Arquivo salvo';
 const go=(step:MedicalIntakeStep|'review')=>{if(busy)return;setActive(step);setEditing(true);setError('');};
 async function upload(files:File[]){
  if(lock.current||!files.length||!canWrite||active==='review')return;
  const step=active;lock.current=true;setBusy(true);setError('');const saved:OnboardingAttachment[]=[],failures:string[]=[];
  try{
   if(step==='photos'&&(files.length+(answers.photos?.attachmentIds.length??0)>12))throw new Error('Selecione até 12 fotos.');
   for(const [index,file] of files.entries()){
    if(!alive.current)return;
    setUploadStatus('Enviando '+(index+1)+' de '+files.length+' · '+file.name);
    try{
     const allowed=step==='history'?['application/pdf']:['image/jpeg','image/png','image/webp'];
     if(!allowed.includes(file.type)||file.size<1||file.size>10485760)throw new Error('formato não aceito ou arquivo acima de 10 MB');
     saved.push(await uploadFile(companyId,file));
    }catch(e){failures.push(file.name+': '+(e instanceof Error?e.message:'falha no envio'));}
   }
   if(!alive.current)return;
   setData(d=>d?{...d,attachments:[...d.attachments,...saved.filter(a=>!d.attachments.some(v=>v.id===a.id))]}:d);
   if(saved.length){
    if(step==='history')set('history',{mode:'pdf',attachmentId:saved[0]!.id});
    if(step==='logo')set('logo',{mode:'upload',attachmentId:saved[0]!.id});
    if(step==='photos')set('photos',{mode:'upload',attachmentIds:[...new Set([...(answers.photos?.attachmentIds??[]),...saved.map(a=>a.id)])]});
   }
   setUploadStatus(saved.length+' arquivo(s) enviado(s).'+(demo?' Prévia: nenhum arquivo saiu do navegador.':''));
   if(failures.length)setError('Não enviados: '+failures.join('; '));
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Não foi possível enviar.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function submit(){
  if(!data||lock.current||disabled)return;
  const step=active==='review'?'confirm':active;
  if(step==='businessType'&&!answers.businessType){setError('Escolha Clínica ou Consultório médico para continuar.');return;}
  const value=step==='confirm'?{}:answers[step];
  const parsed=step==='confirm'?{success:true as const,data:{}}:medicalAnswerSchemas[step].safeParse(value);
  if(!parsed.success){setError(parsed.error.issues[0]?.message??'Complete sua resposta para continuar.');return;}
  lock.current=true;setBusy(true);setError('');
  let found:CnpjLookupResult|null=null;
  try{
   if(step==='cnpj'){
    const cnpj=cnpjSchema.parse(answers.cnpj?.value);
    try{found=await api<CnpjLookupResult>(base+'/cnpj',{cnpj,requestId:crypto.randomUUID()});}
    catch(e){if(e instanceof JourneyError&&[401,403].includes(e.status))throw e;found={status:'unavailable',source:'Consulta de CNPJ',sourceUrl:'https://brasilapi.com.br/docs#tag/CNPJ',collectedAt:null,data:null,message:'A consulta não concluiu. Você pode preencher os dados manualmente e continuar.'};}
   }
   const key=JSON.stringify({companyId,step,answer:parsed.data,revision:data.state.revision});
   if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
   const saved=await api<OnboardingSnapshot>(base+'/intake',{requestId:pending.current.id,revision:data.state.revision,step,answer:parsed.data});
   if(!alive.current)return;
   pending.current=null;setData(saved);setAnswers(medicalIntakeAnswersWithBusinessType(saved.state.medical_intake?.answers));setEditing(false);
   if(step==='cnpj'){
    setLookup(found);
    if(found?.data){const d=found.data;setAnswers(a=>({...a,address:a.address??{name:d.tradeName||d.legalName.slice(0,100),addressLine:d.addressLine,city:d.city,uf:d.uf,postalCode:d.postalCode,businessType:a.businessType?.value??'clinic'}}));}
   }
   setActive(nextMedicalIntakeStep(saved.state.medical_intake));
   if(step==='confirm'){setActive('review');if(onConfirmed)onConfirmed(saved);}
  }catch(e){
   if(!alive.current)return;
   if(e instanceof JourneyError&&e.status===409){setConflict(true);pending.current=null;}
   setError(e instanceof Error?e.message:'Não foi possível salvar. Sua resposta permanece no formulário.');
  }finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const fileInput=(label:string,pdf=false,multiple=false)=><label className={s.upload}><UploadCloud size={28}/><strong>{label}</strong><span>{pdf?'PDF':'PNG, JPEG ou WebP'} · até 10 MB por arquivo</span><input aria-label={label} type="file" multiple={multiple} accept={pdf?'application/pdf':'image/png,image/jpeg,image/webp'} disabled={disabled} onChange={e=>{void upload(Array.from(e.target.files??[]));e.target.value='';}}/></label>;
 const choice=(label:string,chosen:boolean,action:()=>void)=><button key={label} type="button" className={s.choice} aria-pressed={chosen} disabled={disabled} onClick={action}><span className={s.check}>{chosen&&<Check size={16}/>}</span>{label}</button>;
 function answerSummary(step:MedicalIntakeStep){
  const a=answers;
  if(step==='businessType')return a.businessType?.value==='clinic'?'Clínica':a.businessType?.value==='medical_practice'?'Consultório médico':'Escolha pendente';
  if(step==='cnpj')return a.cnpj?.value??'Ainda não informado';
  if(step==='address')return a.address?[a.address.name,a.address.addressLine,a.address.city+' / '+a.address.uf,'CEP '+a.address.postalCode].join(' · '):'Ainda não confirmado';
  if(step==='specialty')return a.specialty?.values.join(', ')??'Ainda não informada';
  if(step==='history')return a.history?.mode==='pdf'?attachmentName(a.history.attachmentId):a.history?.text??'Ainda não informada';
  if(step==='logo')return a.logo?.mode==='upload'?attachmentName(a.logo.attachmentId):a.logo?'Criar proposta · '+a.logo.style:'Escolha pendente';
  if(step==='photos')return a.photos?.mode==='upload'?a.photos.attachmentIds.length+' foto(s) selecionada(s)':a.photos?'Sem fotos neste momento':'Escolha pendente';
  return a.website?.mode==='existing'?a.website.url:a.website?'Criar um rascunho de site':'Escolha pendente';
 }
 if(summaryOnly)return <section><h3>{businessType?'Cadastro '+of:'Cadastro médico'}</h3>{!data?<p role={error?'alert':'status'}>{error||'Carregando cadastro…'}</p>:<><div className={s.summary}>{data.state.medical_intake?medicalIntakeSteps.map(step=><article key={step}><strong>{labels[step]}</strong><p>{answerSummary(step)}</p></article>):(['name','city','address','services','history'] as const).map(key=><article key={key}><p>{data.state.facts[key]?.value??'Não informado'}</p></article>)}</div>{canWrite&&<Link href={'/empresa/'+companyId+'/onboarding'}>Revisar cadastro →</Link>}</>}</section>;
 return <section className={s.root+(immersive?' '+s.immersive:'')} aria-label="Cadastro médico da MedSI">
  <aside className={s.sidebar}><Link href="/" aria-label="MedSI, início"><BrandWordmark/></Link><div><span className={s.eyebrow}>SEU PRÓXIMO CAPÍTULO</span><h2>Vamos conhecer<br/>quem cuida.</h2><p>Poucas perguntas.<br/>Um plano com a sua identidade.</p></div><ol aria-label="Etapas do cadastro">{medicalIntakeSteps.map((step,index)=><li key={step} aria-current={active===step?'step':undefined}><span>{medicalAnswerSchemas[step].safeParse(answers[step]).success?<Check size={14}/>:index+1}</span>{labels[step]}</li>)}</ol><small><CheckCheck size={16}/>Respostas salvas a cada etapa</small></aside>
  <div className={s.main}>
   <header className={s.header}><div className={s.mobileBrand}><BrandWordmark/></div><span className={s.company}>{data?.state.medical_intake?.answers.address?.name??data?.state.facts.name?.value??'Seu cadastro'}</span><div>{!demo&&<HelpChat companyId={companyId}/>}<Link href="/entrada">Minha conta</Link></div></header>
   {demo&&<p className={s.demo}>PRÉVIA INTERATIVA · Dados fictícios · Nenhum arquivo enviado ou serviço externo acionado</p>}
   {!data?<div className={s.loading} role={error?'alert':'status'}><p>{error||'Retomando suas respostas…'}</p>{error&&<button onClick={()=>{setError('');void load().catch(e=>setError(e.message));}}>Tentar novamente</button>}</div>:<>
    <div className={s.scroll}>
     <form id="medical-intake-form" className={s.card} onSubmit={e=>{e.preventDefault();void submit();}}>
      <span className={s.eyebrow}>{completed?'PERFIL CONFIRMADO':String(selected+1).padStart(2,'0')+' / '+String(total).padStart(2,'0')+' · '+(active==='review'?'REVISÃO':labels[active].toUpperCase())}</span>
      <h1 ref={heading} tabIndex={-1}>{titles[active]}</h1><p className={s.description}>{descriptions[active]}</p>
      {active==='businessType'&&<div className={s.businessChoices} aria-label="Tipo de estabelecimento">{choice('Clínica',businessType==='clinic',()=>set('businessType',{value:'clinic'}))}{choice('Consultório médico',businessType==='medical_practice',()=>set('businessType',{value:'medical_practice'}))}</div>}
      {active==='cnpj'&&<><label className={s.field}>CNPJ<input aria-label="CNPJ" value={answers.cnpj?.value??''} onChange={e=>set('cnpj',{value:e.target.value.toUpperCase()})} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={18} placeholder="00.000.000/0001-00" disabled={disabled}/></label><p className={s.note}>Aceitamos o formato numérico e o alfanumérico. Você confere os dados antes de confirmar.</p></>}
      {active==='address'&&<>
       {lookup&&<p className={s.source} role="status">{lookup.message}{lookup.status==='available'&&<> <a href={lookup.sourceUrl} target="_blank" rel="noreferrer">{lookup.source}</a></>}</p>}
       <label className={s.field}>{clinic?'Nome da clínica':'Nome do consultório'}<input value={address.name} onChange={e=>set('address',{...address,name:e.target.value})} maxLength={100} disabled={disabled} autoComplete="organization"/></label>
       <label className={s.field}>Endereço, número, complemento e bairro<input value={address.addressLine} onChange={e=>set('address',{...address,addressLine:e.target.value})} maxLength={500} disabled={disabled} autoComplete="street-address"/></label>
       <div className={s.addressRow}><label className={s.field}>Cidade<input value={address.city} onChange={e=>set('address',{...address,city:e.target.value})} maxLength={90} disabled={disabled} autoComplete="address-level2"/></label><label className={s.field}>Estado<select value={address.uf} onChange={e=>set('address',{...address,uf:e.target.value})} disabled={disabled} autoComplete="address-level1"><option value="">UF</option>{Object.entries(brazilStates).map(([uf,name])=><option key={uf} value={uf}>{uf} · {name}</option>)}</select></label><label className={s.field}>CEP<input value={address.postalCode} onChange={e=>set('address',{...address,postalCode:e.target.value.replace(/\D/g,'')})} inputMode="numeric" maxLength={8} disabled={disabled} autoComplete="postal-code"/></label></div>
      </>}
      {active==='specialty'&&<>
       <div className={s.specialties} aria-label="Especialidades">{[...medicalSpecialties,...(answers.specialty?.values??[]).filter(v=>!medicalSpecialties.includes(v as typeof medicalSpecialties[number]))].map(value=>choice(value,answers.specialty?.values.includes(value)??false,()=>{const values=answers.specialty?.values??[];set('specialty',{values:values.includes(value)?values.filter(v=>v!==value):[...values,value]});}))}</div>
       <label className={s.field}>Outra especialidade<div className={s.addRow}><input value={other} onChange={e=>setOther(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(other.trim().length>=2){set('specialty',{values:[...new Set([...(answers.specialty?.values??[]),other.trim()])]});setOther('');}}}} disabled={disabled} maxLength={100} placeholder="Escreva sua especialidade"/><button type="button" disabled={disabled||other.trim().length<2} onClick={()=>{set('specialty',{values:[...new Set([...(answers.specialty?.values??[]),other.trim()])]});setOther('');}}>Adicionar</button></div></label>
      </>}
      {active==='history'&&<>
       <div className={s.choices}>{choice(clinic?'Quero contar a história da clínica':'Quero contar minha história',answers.history?.mode==='text',()=>set('history',{mode:'text',text:''}))}{choice(clinic?'Enviar currículo do responsável':'Prefiro enviar meu currículo',answers.history?.mode!=='text',()=>set('history',undefined))}</div>
       {answers.history?.mode==='text'?<label className={s.field}>{clinic?'História e equipe da clínica':'Sua trajetória'}<textarea value={answers.history.text} onChange={e=>set('history',{mode:'text',text:e.target.value})} rows={6} maxLength={6000} disabled={disabled} placeholder={clinic?'Conte como a clínica começou, a experiência da equipe e o que diferencia o atendimento.':'Conte sua formação, experiência, como começou seu consultório e o que diferencia seu atendimento.'}/><small>{answers.history.text.length}/6000</small></label>:<>{fileInput(clinic?'Enviar currículo do responsável em PDF':'Enviar meu currículo em PDF',true)}{currentAttachments.some(a=>a.mime==='application/pdf')&&<label className={s.field}>Ou escolher um currículo salvo<select disabled={disabled} value={answers.history?.mode==='pdf'?answers.history.attachmentId:''} onChange={e=>{if(e.target.value)set('history',{mode:'pdf',attachmentId:e.target.value});}}><option value="">Escolher arquivo</option>{currentAttachments.filter(a=>a.mime==='application/pdf').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}{answers.history?.mode==='pdf'&&<p className={s.file}><FileText size={18}/>{attachmentName(answers.history.attachmentId)}</p>}</>}
       <p className={s.note}>{clinic?'Use o currículo profissional do responsável pela clínica.':'Use seu currículo profissional.'} Não inclua prontuários ou informações de pacientes.</p>
      </>}
      {active==='logo'&&<>
       <div className={s.choices}>{choice('Tenho um logo',answers.logo?.mode!=='create',()=>set('logo',undefined))}{choice('Criar um logo para mim',answers.logo?.mode==='create',()=>set('logo',{mode:'create',style:'Minimalista'}))}</div>
       {answers.logo?.mode==='create'?<><p className={s.subheading}>Qual estilo combina com você?</p><div className={s.choices}>{logoStyles.map(style=>choice(style,answers.logo?.mode==='create'&&answers.logo.style===style,()=>set('logo',{mode:'create',style})))}</div><p className={s.note}>Após confirmar o plano, a MedSI prepara uma proposta de logo para sua revisão. {your} terá uma identidade própria.</p></>:<>{fileInput('Enviar meu logo')}{currentAttachments.some(a=>a.mime.startsWith('image/'))&&<label className={s.field}>Ou escolher uma imagem salva<select disabled={disabled} value={answers.logo?.mode==='upload'?answers.logo.attachmentId:''} onChange={e=>{if(e.target.value)set('logo',{mode:'upload',attachmentId:e.target.value});}}><option value="">Escolher imagem</option>{currentAttachments.filter(a=>a.mime.startsWith('image/')).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}{answers.logo?.mode==='upload'&&<p className={s.file}><ImagePlus size={18}/>{attachmentName(answers.logo.attachmentId)}</p>}</>}
      </>}
      {active==='photos'&&<>
       <div className={s.choices}>{choice('Quero enviar fotos',answers.photos?.mode==='upload',()=>set('photos',{mode:'upload',attachmentIds:answers.photos?.attachmentIds??[]}))}{choice('Continuar sem fotos',answers.photos?.mode==='skip',()=>set('photos',{mode:'skip',attachmentIds:[]}))}</div>
       {answers.photos?.mode==='upload'&&<>{fileInput('Enviar fotos '+of,false,true)}<ul className={s.files}>{answers.photos.attachmentIds.map(id=><li key={id}><ImagePlus size={16}/><span>{attachmentName(id)}</span><button type="button" disabled={disabled} onClick={()=>set('photos',{mode:'upload',attachmentIds:answers.photos!.attachmentIds.filter(v=>v!==id)})}>Retirar da seleção</button></li>)}</ul></>}
       <p className={s.note}>Recepção, consultório e fachada são boas referências. Até 12 fotos; você pode adicionar materiais depois.</p>
      </>}
      {active==='website'&&<>
       <div className={s.choices}>{choice('Já tenho um site',answers.website?.mode==='existing',()=>set('website',{mode:'existing',url:''}))}{choice('Criar um site para mim',answers.website?.mode==='create',()=>set('website',{mode:'create'}))}</div>
       {answers.website?.mode==='existing'&&<label className={s.field}>Endereço do site<input type="url" value={answers.website.url} onChange={e=>set('website',{mode:'existing',url:e.target.value})} maxLength={2000} disabled={disabled} autoComplete="url" placeholder={clinic?'https://suaclinica.com.br':'https://seuconsultorio.com.br'}/></label>}
       {answers.website?.mode==='create'&&<p className={s.source}>Vamos preparar o site com suas informações e materiais após a aprovação das etapas da estratégia. Você revisa antes de publicar.</p>}
      </>}
      {active==='review'&&<>
       {data.state.medical_intake?<div className={s.summary}>{medicalIntakeSteps.map(step=><article key={step}><div><strong>{labels[step]}</strong>{canWrite&&<button type="button" disabled={busy} onClick={()=>go(step)}>Editar</button>}</div><p>{answerSummary(step)}</p></article>)}</div>:<div className={s.summary}>{(['name','city','address','services','history'] as const).map(key=><article key={key}><p>{data.state.facts[key]?.value??'Não informado'}</p></article>)}</div>}
       {completed&&<p className={s.source}><CheckCheck size={18}/>Perfil confirmado · versão {data.state.profile_version}</p>}
       {!completed&&<p className={s.note}>A análise mostrará dados disponíveis do IBGE, estimativas de público da Meta e pesquisas do Google Trends, com fonte e recorte geográfico. O cadastro não gera cobrança.</p>}
      </>}
      {error&&<div className={s.error} role="alert">{error}{conflict&&<button type="button" onClick={()=>void load().then(()=>setError('')).catch(e=>setError(e.message))}>Recarregar as respostas salvas</button>}</div>}
      {uploadStatus&&<p className={s.note} role="status">{uploadStatus}</p>}
      {!canWrite&&<p className={s.note}>Você pode acompanhar o cadastro. Para responder, peça acesso ao responsável {of}.</p>}
     </form>
    </div>
    <footer className={s.footer}><div className={s.progress}><span>{completed?'Cadastro concluído':(selected+1)+' de '+total}</span><div role="progressbar" aria-label="Progresso do cadastro" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed?total:selected}><i style={{width:(completed?100:selected/total*100)+'%'}}/></div><small>{busy?'Salvando…':'Salvo a cada etapa'}</small></div><div className={s.actions}>
     {selected>0&&!busy&&!completed&&<button type="button" className={s.back} disabled={busy} onClick={()=>go(medicalIntakeSteps[selected-1]!)}><ArrowLeft size={18}/><span>Voltar</span></button>}
     {completed?<>{canWrite&&<button className={s.back} type="button" onClick={()=>go('businessType')}>Atualizar cadastro</button>}{onExit?<button className={s.primary} type="button" onClick={onExit}>Continuar<ArrowRight size={18}/></button>:<Link className={s.primary} href={'/comecar?empresa='+companyId}>Continuar<ArrowRight size={18}/></Link>}</>:canWrite&&<button className={s.primary} type="submit" form="medical-intake-form" disabled={disabled}>{busy?'Aguarde…':active==='cnpj'?'Buscar CNPJ':active==='address'?'Confirmar endereço':active==='review'?'Confirmar e continuar':'Continuar'}<ArrowRight size={18}/></button>}
    </div></footer>
   </>}
  </div>
 </section>;
}
