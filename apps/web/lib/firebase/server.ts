import 'server-only';
import {cookies} from 'next/headers';
import type {SupabaseClient} from '@supabase/supabase-js';
import {adminFirebaseAuth} from './admin';
import {firebaseServerApiKey} from './server-config';
import {appOrigin} from '../auth/config';
export const FIREBASE_SESSION_COOKIE='medsi_session';
type User={id:string;email:string;email_confirmed_at:string;user_metadata?:{name?:string}};
type Bootstrap={user:User;staff:Record<string,unknown>|null;profile:Record<string,unknown>|null;companies:Record<string,unknown>[];companyMemberships?:Record<string,unknown>[]};
class FirebaseAccessUnavailable extends Error {
 constructor(quota=false){super(quota?'O banco de dados atingiu a cota disponível. Aguarde a liberação da cota para entrar.':'O acesso aos dados está temporariamente indisponível. Tente novamente em instantes.');}
}
async function firebaseIdentity(token:string):Promise<Bootstrap|null>{
 try{
  const response=await fetch((process.env.API_INTERNAL_URL||process.env.API_ORIGIN||'http://127.0.0.1:4000')+'/identity',{headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
  if(response.status===401)return null;
  if(!response.ok){const value=await response.json().catch(()=>null) as {code?:unknown}|null;throw new FirebaseAccessUnavailable(value?.code==='FIRESTORE_QUOTA_EXCEEDED');}
  const value=await response.json() as Bootstrap;
  return {...value,user:{...value.user,email_confirmed_at:'verified-by-api',user_metadata:{name:typeof value.profile?.display_name==='string'?value.profile.display_name:undefined}}};
 }catch(error){if(error instanceof FirebaseAccessUnavailable)throw error;throw new FirebaseAccessUnavailable();}
}
export async function firebaseServerClient():Promise<SupabaseClient>{
 const cookieStore=await cookies(),token=cookieStore.get(FIREBASE_SESSION_COOKIE)?.value;
 let request:Promise<Bootstrap|null>|undefined;
 function bootstrap(){if(!request)request=token?firebaseIdentity(token):Promise.resolve(null);return request;}
 function query(table:string){
  let fields='*',sort:string|undefined,one=false,maxRows:number|undefined;
  const filters:{key:string;value:unknown}[]=[];
  const builder={
   select(value='*'){fields=value;return builder;},
   eq(key:string,value:unknown){filters.push({key,value});return builder;},
   is(key:string,value:unknown){filters.push({key,value});return builder;},
   order(key:string){sort=key;return builder;},
   limit(value:number){maxRows=value;return builder;},
   maybeSingle(){one=true;return builder;},
   then(resolve:(v:unknown)=>unknown,reject?:(e:unknown)=>unknown){return (async()=>{
    try{
     if(maxRows!==undefined&&(!Number.isSafeInteger(maxRows)||maxRows<0))throw new Error('Invalid row limit');
     const data=await bootstrap();if(!data)return {data:null,error:{message:'Unauthenticated'}};
     // These views contain only records authorized by the API for this session.
     let rows=table==='platform_staff'?(data.staff?[data.staff]:[]):table==='companies'?data.companies:table==='company_members'?(data.companyMemberships??[]):table==='profiles'?(data.profile?[data.profile]:[]):null;
     if(table==='company_onboarding'){
      const company=filters.find(f=>f.key==='company_id')?.value;
      const result=await rpc('company_onboarding_read',{p_company_id:company});
      if(result.error)throw new Error('Onboarding unavailable');
      const state=(result.data as {state?:Record<string,unknown>}|null)?.state;
      if(!state||state.company_id!==company)throw new Error('Invalid company snapshot');
      rows=[state];
     }
     if(!rows)throw new Error('Unsupported server view');
     rows=rows.filter(row=>filters.every(f=>row[f.key]===f.value));
     if(sort){const key=sort;rows=[...rows].sort((a,b)=>String(a[key]).localeCompare(String(b[key])));}
     if(maxRows!==undefined)rows=rows.slice(0,maxRows);
     if(fields!=='*'){const keys=fields.split(',').map(v=>v.trim());rows=rows.map(row=>Object.fromEntries(keys.map(k=>[k,row[k]])));}
     if(one&&rows.length>1)throw new Error('Ambiguous server view');
     return {data:one?rows[0]??null:rows,error:null};
    }catch{return {data:null,error:{message:'Não foi possível carregar o acesso conectado.'}};}
   })().then(resolve,reject);}
  };
  return builder;
 }
 async function rpc(name:string,args:Record<string,unknown>={}){
  const failure=(code:string)=>({data:null,error:{code,message:'Não foi possível consultar os dados deste acesso.'}});
  if(!token)return failure('42501');
  if(name!=='company_capabilities'&&name!=='company_purchase_state'&&name!=='company_onboarding_read')return failure('FIRESTORE_OPERATION_PENDING');
  const company=args.p_company_id;
  if(typeof company!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(company)||Object.keys(args).some(key=>key!=='p_company_id'))return failure('22023');
  // Route only supported reads to endpoints that verify the user and clinic again.
  const path=name==='company_capabilities'?'/operations/companies/'+company+'/capabilities':'/onboarding/companies/'+company+(name==='company_purchase_state'?'/purchase':'');
  try{
   const response=await fetch((process.env.API_INTERNAL_URL||process.env.API_ORIGIN||'http://127.0.0.1:4000')+path,{headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
   if(!response.ok)return failure(response.status===401||response.status===403?'42501':'API_UNAVAILABLE');
   return {data:await response.json() as unknown,error:null};
  }catch{return failure('API_UNAVAILABLE');}
 }
 return {from:query,rpc,auth:{
  async getUser(){const data=await bootstrap();return {data:{user:data?.user??null},error:null};},
  async getSession(){return {data:{session:token?{access_token:token}:null},error:null};},
  async signOut(){cookieStore.delete(FIREBASE_SESSION_COOKIE);return {error:null};}
 }} as unknown as SupabaseClient;
}
async function authRest(operation:string,payload:Record<string,unknown>){
 const key=firebaseServerApiKey();if(!key)throw new Error('Firebase Auth não configurado');
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+operation+'?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),cache:'no-store'});
 const data=await response.json() as {idToken?:string;error?:unknown};
 if(!response.ok||data.error)throw new Error('Firebase authentication request failed');return data;
}
export async function firebaseAuthAction(input:{action:string;email?:string;password?:string;name?:string;inviteToken?:string}){
 const {action,email,password,name,inviteToken}=input;
 if(action==='logout'){(await cookies()).delete(FIREBASE_SESSION_COOKIE);return {status:200,body:{ok:true}};}
 if(action==='recover'){if(!email)return {status:400,body:{message:'Informe seu e-mail.'}};await authRest('sendOobCode',{requestType:'PASSWORD_RESET',email,continueUrl:appOrigin()+'/login'}).catch(()=>{});return {status:200,body:{message:'Se houver uma conta elegível, você receberá as instruções de recuperação.'}};}
 if(action==='update')return {status:400,body:{message:'Use o link de recuperação enviado pelo Firebase para definir sua nova senha.'}};
 if(!email||!password||action==='signup'&&password.length<12)return {status:400,body:{message:'Informe e-mail e senha válidos. Novas senhas precisam de 12 caracteres.'}};
 try{
  if(action==='signup'){
   const account=await authRest('signUp',{email,password,displayName:name??'Usuário',returnSecureToken:true});
   if(!account.idToken)throw new Error('Missing signup token');
   await authRest('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:account.idToken,continueUrl:appOrigin()+(inviteToken?'/workspace#invite='+inviteToken:'/login')});
   return {status:200,body:{message:'Confira seu e-mail para confirmar o acesso antes de entrar.'}};
  }
  const signed=await authRest('signInWithPassword',{email,password,returnSecureToken:true});if(!signed.idToken)throw new Error('Missing token');
  const auth=adminFirebaseAuth(),verified=await auth.verifyIdToken(signed.idToken,true);if(!verified.email_verified||Date.now()/1000-verified.auth_time>300)throw new Error('Unverified or stale login');
  // A valid Firebase password alone does not mean the clinic database is available.
  if(!await firebaseIdentity(signed.idToken))throw new Error('Identity unavailable');
  const expiresIn=5*24*60*60*1000,session=await auth.createSessionCookie(signed.idToken,{expiresIn});
  (await cookies()).set(FIREBASE_SESSION_COOKIE,session,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:expiresIn/1000});
  return {status:200,body:{ok:true}};
 }catch(error){if(error instanceof FirebaseAccessUnavailable)return {status:503,body:{message:error.message}};return {status:action==='signup'?400:401,body:{message:action==='signup'?'Não foi possível concluir o cadastro. Confira os dados e a configuração de acesso.':'Não foi possível entrar. Confira seus dados e a confirmação de e-mail.'}};}
}
