import {firebaseBackend} from '../../../lib/firebase/config';
import { NextResponse } from 'next/server';
import { serverSupabase } from '../../../lib/auth/server';
import { appOrigin,authConfigured,safeAuthDestination } from '../../../lib/auth/config';
export async function GET(request:Request){
  if(firebaseBackend())return NextResponse.redirect(appOrigin()+'/login');
  const url=new URL(request.url);
  const code=url.searchParams.get('code');
  if(authConfigured() && code){
    const client=await serverSupabase();
    const {error}=await client.auth.exchangeCodeForSession(code);
    if(!error) return NextResponse.redirect(appOrigin()+safeAuthDestination(url.searchParams.get('next')));
  }
  return NextResponse.redirect(appOrigin()+'/login?error=callback');
}
