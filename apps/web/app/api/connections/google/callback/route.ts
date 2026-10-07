import {NextResponse} from 'next/server';
import {serverSupabase} from '../../../../../lib/auth/server';
import {appOrigin} from '../../../../../lib/auth/config';
export async function GET(request:Request){
 const url=new URL(request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code');
 const fail=()=>NextResponse.redirect(new URL('/entrada?google_error=1',appOrigin()));
 if(!state||!code||url.searchParams.has('error'))return fail();
 const client=await serverSupabase();const {data:verified,error}=await client.auth.getUser();if(error||!verified.user)return fail();const {data}=await client.auth.getSession();if(!data.session)return fail();
 try{const response=await fetch((process.env.API_INTERNAL_URL||'http://127.0.0.1:4000')+'/onboarding/channels/google/callback',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({state,code}),signal:AbortSignal.timeout(60000),cache:'no-store'});if(!response.ok)return fail();const r=await response.json() as {companyId:string};if(!/^[a-f0-9-]{36}$/.test(r.companyId))return fail();const onboarding=await client.from('company_onboarding').select('revision,confirmed_revision').eq('company_id',r.companyId).maybeSingle();if(onboarding.error||!onboarding.data)return fail();if(onboarding.data&&onboarding.data.revision!==onboarding.data.confirmed_revision)return NextResponse.redirect(new URL('/comecar?empresa='+r.companyId+'&google_connected=1',appOrigin()));const destination='integracoes';return NextResponse.redirect(new URL('/empresa/'+r.companyId+'/'+destination+'?google_connected=1',appOrigin()));}catch{return fail();}
}
