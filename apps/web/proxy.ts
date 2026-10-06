import {firebaseBackend} from './lib/firebase/config';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authConfig,authConfigured } from './lib/auth/config';
import {isApplicationHost} from './lib/app-hosts';
export async function proxy(request:NextRequest){
  const path=request.nextUrl.pathname;
  if(path==='/clinicas'||path.startsWith('/clinicas/')){
    const target=request.nextUrl.clone();
    target.pathname=path==='/clinicas'?'/entrada':path.replace(/^\/clinicas\//,'/empresa/');
    return NextResponse.redirect(target);
  }
  if(request.nextUrl.pathname==='/'){
    const host=request.headers.get('host')?.split(':')[0]?.toLowerCase();
    if(host&&!isApplicationHost(host)){
      const target=request.nextUrl.clone();target.pathname='/api/sites/domain';target.search='';target.searchParams.set('host',host);return NextResponse.rewrite(target);
    }
    return NextResponse.next();
  }
  let response=NextResponse.next({request});
  if(!authConfigured()) return response;
  if(firebaseBackend()){response.headers.set('Cache-Control','private, no-store');return response;}
  const {url,key}=authConfig();
  const client=createServerClient(url,key,{
    cookieOptions:{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'},
    cookies:{
      getAll:()=>request.cookies.getAll(),
      setAll(values){
        for(const {name,value} of values) request.cookies.set(name,value);
        response=NextResponse.next({request});
        for(const {name,value,options} of values) response.cookies.set(name,value,options);
      },
    },
  });
  // Validate with the Auth server, refreshing cookies when needed.
  await client.auth.getUser();
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config={matcher:['/','/clinicas/:path*','/comecar','/empresa/:path*','/entrada','/api/onboarding/:path*','/api/connections/:path*','/dashboard/:path*','/resultados/:path*','/api/dashboard/:path*','/workspace/:path*','/api/identity/:path*','/auth/update-password','/admin/:path*','/acompanhamento/carteira/:path*','/operacao/:path*','/api/operations/:path*']};
