import {databaseConfigured,firebaseBackend} from './config';

/** Report setting names only. Never include credentials in startup errors. */
export function productionConfigurationIssues():string[]{
 const env=process.env;
 if(env.NODE_ENV!=='production')return [];
 const issues:string[]=[];
 try {
  const origin=new URL(env.WEB_ORIGIN||'');
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error();
 } catch {issues.push('WEB_ORIGIN deve ser a origem HTTPS publica da MedSI, sem caminho.');}
 if(firebaseBackend()){
  if(!databaseConfigured())issues.push('Configure FIREBASE_PROJECT_ID e a conexao do provedor de banco selecionado.');
  if(!env.FIREBASE_STORAGE_BUCKET)issues.push('FIREBASE_STORAGE_BUCKET precisa apontar para um bucket privado existente.');
  if(env.FIREBASE_AUTH_EMULATOR_HOST||env.FIREBASE_STORAGE_EMULATOR_HOST||env.FIRESTORE_EMULATOR_HOST)issues.push('Remova as variaveis de emuladores Firebase em producao.');
 }else if(!env.SUPABASE_URL?.startsWith('https://')||!(env.SUPABASE_ANON_KEY||env.SUPABASE_PUBLISHABLE_KEY)){
  issues.push('Configure SUPABASE_URL HTTPS e SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY.');
 }
 if(!/^[a-f0-9]{64}$/i.test(env.SECRETS_ENCRYPTION_KEY??''))issues.push('SECRETS_ENCRYPTION_KEY deve conter 64 caracteres hexadecimais; preserve a chave existente.');
 if(env.DATABASE_PROVIDER==='firestore')issues.push('Firestore migration is incomplete: production remains blocked until business workflows are ported and verified.');
 return issues;
}
