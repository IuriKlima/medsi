import {firebaseBackend} from '../../../lib/firebase/config';
import {firebaseAuthAction} from '../../../lib/firebase/server';
import { authRequestSchema } from '@askadia/contracts';
import { NextResponse } from 'next/server';
import { serverSupabase } from '../../../lib/auth/server';
import { appOrigin,authConfigured } from '../../../lib/auth/config';
export async function POST(request:Request){
  if(request.headers.get('origin')!==appOrigin()) return NextResponse.json({message:'Origem não autorizada.'},{status:403});
  if(!authConfigured()) return NextResponse.json({message:'O acesso conectado ainda não foi configurado.'},{status:503});
  const raw=await request.text();
  if(raw.length>4096) return NextResponse.json({message:'Solicitação inválida.'},{status:413});
  let parsed;
  try{parsed=authRequestSchema.safeParse(JSON.parse(raw));}catch{return NextResponse.json({message:'Dados inválidos.'},{status:400});}
  if(!parsed.success) return NextResponse.json({message:'Confira os campos.'},{status:400});
  if(firebaseBackend()){const result=await firebaseAuthAction(parsed.data);return NextResponse.json(result.body,{status:result.status});}
  const {action,email,password,name,inviteToken}=parsed.data;
  const client=await serverSupabase();
  if(action==='logout'){const {error}=await client.auth.signOut();return NextResponse.json(error?{message:'Não foi possível sair. Tente novamente.'}:{ok:true},{status:error?503:200});}
  if(action==='recover'){
    if(!email) return NextResponse.json({message:'Informe seu e-mail.'},{status:400});
    await client.auth.resetPasswordForEmail(email,{redirectTo:appOrigin()+'/auth/callback?next=/auth/update-password'});
    return NextResponse.json({message:'Se houver uma conta elegível, você receberá as instruções de recuperação.'});
  }
  if(action==='update'){
    const {data}=await client.auth.getUser();
    if(!data.user) return NextResponse.json({message:'Abra um link de recuperação válido.'},{status:401});
    if(!password || password.length<12) return NextResponse.json({message:'Use pelo menos 12 caracteres.'},{status:400});
    const {error}=await client.auth.updateUser({password});
    return NextResponse.json(error ? {message:'Não foi possível atualizar a senha. Solicite um novo link.'}:{ok:true},{status:error?400:200});
  }
  if(!email || !password || (action==='signup' && password.length<12)) return NextResponse.json({message:'Informe e-mail e senha válidos. Novas senhas precisam de 12 caracteres.'},{status:400});
  if(action==='signup'){
    const {error}=await client.auth.signUp({email,password,options:{data:{name:name??'Usuário'},emailRedirectTo:appOrigin()+'/auth/callback'+(inviteToken?'?next='+encodeURIComponent('/workspace#invite='+inviteToken):'')}});
    return NextResponse.json(error ? {message:'Não foi possível criar a conta. Verifique os dados ou tente mais tarde.'}:{message:'Confira seu e-mail para confirmar o acesso antes de entrar.'},{status:error?400:200});
  }
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error || !data.user?.email_confirmed_at) return NextResponse.json({message:'Não foi possível entrar. Confira seus dados e a confirmação de e-mail.'},{status:401});
  return NextResponse.json({ok:true});
}
