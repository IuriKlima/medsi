'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Button} from '@askadia/ui';
import {identityApi} from '../lib/identity-api';
import {invitationFromHash,legacyAccountDestination} from '../lib/account-navigation';

// Fragments are available only in the browser. Keep old invitation URLs usable
// without rendering the former workspace chooser to customers.
export function AccountEntry({email}:{email:string}){
 const [token,setToken]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const invite=invitationFromHash(window.location.hash);if(invite)setToken(invite);else window.location.replace(legacyAccountDestination(window.location.search));},[]);
 async function accept(){
  if(!token||busy)return;setBusy(true);setError('');
  try{const result=await identityApi<{companyId:string}>('invitations/accept','POST',{token});window.location.replace('/empresa/'+result.companyId);}
  catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível aceitar o convite.');setBusy(false);}
 }
 return <main className="internal-shell"><section className="panel internal-empty">{token?<><h1>Você recebeu um convite.</h1><p>Conectado como {email}. Ao aceitar, você receberá o acesso definido para esta clínica.</p>{error&&<p role="alert" className="form-error">{error}</p>}<div className="form-actions"><Link className="button button-outline" href="/entrada">Agora não</Link><Button onClick={()=>void accept()} disabled={busy}>{busy?'Aceitando…':'Aceitar convite'}</Button></div></>:<p role="status">Abrindo sua conta…</p>}</section></main>;
}
