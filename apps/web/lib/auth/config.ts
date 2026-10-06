import {firebaseBackend} from '../firebase/config';
import {firebaseServerAuthConfigured} from '../firebase/server-config';
export function authConfigured(){if(firebaseBackend())return firebaseServerAuthConfigured()&&Boolean(process.env.FIREBASE_PROJECT_ID&&(process.env.DATABASE_PROVIDER==='firestore'||process.env.DATABASE_URL||process.env.CLOUD_SQL_CONNECTION_NAME&&process.env.DATABASE_USER&&process.env.DATABASE_NAME));return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY));}
export function authConfig(){
  if(!authConfigured()) throw new Error('Autenticação não configurada.');
  return {url:process.env.SUPABASE_URL!,key:(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)!};
}
export function appOrigin(){return process.env.WEB_ORIGIN || 'http://127.0.0.1:3000';}
export {safeAuthDestination} from './destination';
