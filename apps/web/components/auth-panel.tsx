'use client';
import {BrandWordmark,BrandContours} from './brand';

import Link from 'next/link';
import { useState,type FormEvent } from 'react';
import { ArrowRight,ArrowUpRight,LockKeyhole,ShieldCheck } from 'lucide-react';
import { Button } from '@askadia/ui';
import {readApiResponse} from '../lib/response';
export function AuthPanel({configured,callbackError=false,update=false,initialMode='login'}:{configured:boolean;callbackError?:boolean;update?:boolean;initialMode?:'login'|'signup'}){
  const [mode,setMode]=useState<'login'|'signup'|'recover'|'update'>(update?'update':initialMode);
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState(callbackError?'Este link expirou ou não pôde ser validado. Solicite um novo.':'');
  const [error,setError]=useState(callbackError);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setPending(true);setMessage('');setError(false);
    const fields=new FormData(event.currentTarget);const inviteToken=new URLSearchParams(window.location.hash.slice(1)).get('invite');
    try{
      const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:mode,...(mode!=='update'?{email:String(fields.get('email'))}:{}),...(mode!=='recover'?{password:String(fields.get('password'))}:{}),...(mode==='signup'?{name:String(fields.get('name')),...(inviteToken&&/^[a-f0-9]{64}$/.test(inviteToken)?{inviteToken}:{})}:{})})});
      const payload=await readApiResponse<{ok?:boolean;message:string}>(response);
      if(payload.ok){window.location.assign(/^#invite=[a-f0-9]{64}$/.test(window.location.hash)?'/workspace'+window.location.hash:'/entrada');return;}
      setMessage(payload.message);
    }catch(cause){setError(true);setMessage(cause instanceof Error?cause.message:'Não foi possível conectar. Tente novamente.');}
    finally{setPending(false);}
  }
  function change(next:typeof mode){setMode(next);setMessage('');setError(false);}
  return <main className="auth-shell"><section className="auth-story"><BrandContours/><Link className="brand" href="/"><BrandWordmark/></Link><div><span className="eyebrow">UM ESPAÇO PARA O PRÓXIMO PASSO</span><h1>Sua clínica<br/>em <span>sintonia.</span></h1><p>Marketing e atendimento para médicos e clínicas. Da primeira conversa ao próximo agendamento.</p></div><span className="auth-trust"><ShieldCheck size={17}/>Acesso por empresa. Decisões com responsabilidade.</span></section><section className="auth-side"><div className="auth-card"><span className="auth-symbol"><LockKeyhole size={24}/></span><span className="eyebrow">BEM-VINDO À MEDSI</span><h2>{mode==='signup'?'Comece seu próximo capítulo.':mode==='recover'?'Vamos recuperar seu acesso.':mode==='update'?'Uma nova senha para continuar.':'Seu espaço está aqui.'}</h2><p>{mode==='signup'?'Crie seu acesso. Cadastrar uma conta não contrata uma assinatura.':mode==='recover'?'Enviaremos instruções ao e-mail da sua conta.':mode==='update'?'Escolha uma senha com pelo menos 12 caracteres.':'Entre para acompanhar sua clínica, seus contatos e sua equipe.'}</p>
  {!configured && <div className="auth-unavailable"><ShieldCheck size={19}/><div><strong>Acesso conectado em preparação</strong><p>O ambiente de autenticação ainda precisa ser configurado. Por enquanto, você pode explorar a prévia local, sem criar uma conta.</p></div></div>}
  <form className="form" onSubmit={submit}><fieldset disabled={!configured||pending}>
    {mode==='signup' && <label>Seu nome<input name="name" required minLength={2} maxLength={100} autoComplete="name" placeholder="Como podemos chamar você?"/></label>}
    {mode!=='update' && <label>E-mail<input name="email" type="email" required autoComplete="email" placeholder="voce@clinica.com.br"/></label>}
    {mode!=='recover' && <label>Senha<input name="password" type="password" required minLength={mode==='login'?1:12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} placeholder={mode==='login'?'Sua senha':'Pelo menos 12 caracteres'}/></label>}
    {mode==='login' && <button type="button" className="text-button auth-recover" onClick={()=>change('recover')}>Esqueci minha senha</button>}
    <Button type="submit">{pending?'Aguarde…':mode==='signup'?'Começar grátis':mode==='recover'?'Enviar instruções':mode==='update'?'Salvar nova senha':'Entrar no meu espaço'}<ArrowRight size={16}/></Button>
  </fieldset></form>
  {message && <p className={error?'form-error':'auth-message'} role={error?'alert':'status'}>{message}</p>}
  {!update && <div className="auth-switch">{mode==='login'?<>Ainda não tem acesso? <button onClick={()=>change('signup')}>Começar grátis</button></>:<button onClick={()=>change('login')}>Voltar para entrar</button>}</div>}
  <Link className="auth-preview" href="/preview/onboarding">Testar o cadastro demonstrativo<ArrowUpRight size={14}/></Link><Link className="auth-preview" href="/preview">Abrir a prévia de rascunhos<ArrowUpRight size={14}/></Link>
  <p className="fine-print">As demonstrações não criam conta nem liberam pesquisa, assinatura ou entregas reais. Seus rascunhos anteriores continuam na prévia de rascunhos.</p>
  </div><div className="auth-bottom">PENSADO PARA CRESCER COM VOCÊ.</div></section></main>;
}
