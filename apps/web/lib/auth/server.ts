import 'server-only';
import {firebaseBackend} from '../firebase/config';
import {firebaseServerClient} from '../firebase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authConfig } from './config';
export async function serverSupabase(){
  if(firebaseBackend())return firebaseServerClient();
  const cookieStore=await cookies();
  const {url,key}=authConfig();
  return createServerClient(url,key,{
    cookieOptions:{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'},
    cookies:{
      getAll(){return cookieStore.getAll();},
      setAll(values){try{for(const {name,value,options} of values) cookieStore.set(name,value,options);}catch{/* Server Components cannot mutate cookies. Proxy refreshes the session. */}},
    },
  });
}
