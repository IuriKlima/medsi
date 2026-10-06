'use client';
import {useCallback,useRef,useState} from 'react';
import Link from 'next/link';
import {medicalIntakeSteps,nextMedicalIntakeStep,type MedicalIntakeAnswers,type OnboardingSnapshot,type OnboardingAttachment} from '@askadia/contracts';
import {MedicalOnboarding} from '../../../components/medical-onboarding';
import type {journeyApi} from '../../../lib/journey-api';
const companyId='00000000-0000-4000-8000-000000000000';
function initial():OnboardingSnapshot{return {state:{company_id:companyId,revision:0,facts:{},medical_intake:{version:1,answers:{}},location_confirmed:false,competitors_reviewed:false,references_reviewed:false,confirmed_revision:null,profile_version:0,updated_at:new Date().toISOString()},messages:[],attachments:[],capabilities:{actions:['marketing.write','marketing.read']},confirmedProfile:null,provider:{mode:'guided',message:'Demonstração local. Nenhuma consulta ou geração real.',aiAllowed:false},step:'businessType',question:''};}
export default function OnboardingPreview(){
 const state=useRef(initial());const [done,setDone]=useState(false),[version,setVersion]=useState(0);
 const api:typeof journeyApi=useCallback(async<T,>(path:string,body?:unknown):Promise<T>=>{
  if(path.endsWith('/cnpj'))return {status:'available',source:'Fixture local de demonstração',sourceUrl:'https://brasilapi.com.br/docs#tag/CNPJ',collectedAt:new Date().toISOString(),message:'Dados fictícios para testar a experiência. Nenhuma consulta externa foi realizada.',data:{cnpj:'11222333000181',legalName:'Clínica Exemplo',tradeName:'Clínica Exemplo',addressLine:'Rua de Exemplo, 100 · Centro',city:'São Paulo',uf:'SP',postalCode:'01001000',registrationStatus:'Demonstração'}} as T;
  if(path.endsWith('/intake')){
   const b=body as {step:typeof medicalIntakeSteps[number]|'confirm';answer:unknown};const current=state.current;
   current.state.revision++;
   if(b.step==='confirm'){current.state.confirmed_revision=current.state.revision;current.state.profile_version++;current.confirmedProfile={version:current.state.profile_version,facts:{},confirmed_at:new Date().toISOString()};current.step='complete';}
   else{const answers={...current.state.medical_intake!.answers,[b.step]:b.answer} as MedicalIntakeAnswers;if(b.step==='businessType'&&answers.address&&answers.businessType)answers.address={...answers.address,businessType:answers.businessType.value};if(b.step==='cnpj'&&current.state.medical_intake!.answers.cnpj?.value!==answers.cnpj?.value)delete answers.address;current.state.medical_intake={version:1,answers};current.state.confirmed_revision=null;current.step=nextMedicalIntakeStep(current.state.medical_intake);}
  }
  return structuredClone(state.current) as T;
 },[]);
 const upload=useCallback(async(_id:string,file:File):Promise<OnboardingAttachment>=>{const result={id:crypto.randomUUID(),company_id:companyId,name:file.name,mime:file.type,size:file.size,object_path:'local-preview-only',created_at:new Date().toISOString()};state.current.attachments.push(result);return result;},[]);
 if(done)return <main style={{maxWidth:720,margin:'12vh auto',padding:32}}><p className="page-eyebrow">DEMONSTRAÇÃO LOCAL · DADOS FICTÍCIOS</p><h1>Cadastro concluído.</h1><p>No fluxo real, a confirmação do plano libera a coleta regional. A primeira aba mostra o IBGE, as estimativas disponíveis do Facebook e o interesse de busca do Google Trends, com fonte, data e recorte.</p><p>Depois da sua aprovação, o sistema continua com diagnóstico, calendário, relacionamento e tráfego pago.</p><button className="button button-primary" onClick={()=>{state.current=initial();setVersion(v=>v+1);setDone(false);}}>Testar novamente</button> <Link href="/preview">Voltar à prévia do painel</Link></main>;
 return <MedicalOnboarding key={version} companyId={companyId} immersive api={api} uploadFile={upload} demo onConfirmed={()=>setDone(true)}/>;
}
