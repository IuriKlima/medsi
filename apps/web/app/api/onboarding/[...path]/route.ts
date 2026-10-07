import { NextResponse } from 'next/server';
import { serverSupabase } from '../../../../lib/auth/server';
import { appOrigin,authConfigured } from '../../../../lib/auth/config';
const uuid='[a-fA-F0-9-]{36}';
const allowed:Record<string,RegExp[]>={
GET:[new RegExp('^companies/'+uuid+'/(marketing-facts|inbox/policy)$'),new RegExp('^companies/'+uuid+'/social-publications(/media/[a-f0-9]{64})?$'),new RegExp('^companies/'+uuid+'/whatsapp-cloud/(status|threads|messages)$'),new RegExp('^companies/'+uuid+'/(purchase(/billing)?|launch(/journey)?|instagram|visual-jobs|ads/executions)$'),new RegExp('^companies/'+uuid+'/(overview|market)$'),new RegExp('^companies/'+uuid+'/site$'),new RegExp('^companies/'+uuid+'/ads(/(accounts|hierarchy))?$'),new RegExp('^companies/'+uuid+'/inbox/meta/(threads|messages)$'),new RegExp('^companies/'+uuid+'/crm/contacts/'+uuid+'/history$'),new RegExp('^companies/'+uuid+'/campaigns/recipients$'),new RegExp('^companies/'+uuid+'/management$'),new RegExp('^companies/'+uuid+'/campaigns$'),new RegExp('^companies/'+uuid+'/inbox(/(threads|messages|media))?$'),new RegExp('^companies/'+uuid+'(/(channels|calendar|videos/'+uuid+'|creatives/'+uuid+'|strategy|crm|attachments/'+uuid+'))?$'),new RegExp('^access/'+uuid+'$')],
POST:[new RegExp('^companies/'+uuid+'/marketing-facts$'),new RegExp('^companies/'+uuid+'/social-publications(/'+uuid+'/(approve|control|edit))?$'),new RegExp('^companies/'+uuid+'/whatsapp-cloud/(connect|takeover|send|disconnect)$'),new RegExp('^companies/'+uuid+'/(cnpj|intake|regional-research(/competitors)?)$'),new RegExp('^companies/'+uuid+'/(purchase/(checkout(/confirm)?|finish|billing/(customer|reconcile|cancel))|launch/(approve|resume|traffic-preference|planning-preferences)|instagram/(search|select|retry|research)|visual-jobs|ads/executions/'+uuid+'/(approve|edit|control))$'),new RegExp('^companies/'+uuid+'/market$'),new RegExp('^companies/'+uuid+'/site/(generate|save|publish|domain|subdomain|verify-domain)$'),new RegExp('^companies/'+uuid+'/ads/(google/start|select|disconnect|propose)$'),new RegExp('^companies/'+uuid+'/inbox/meta/(takeover|send)$'),new RegExp('^companies/'+uuid+'/campaigns/recipients/(register|revoke)$'),new RegExp('^companies/'+uuid+'/strategy/edit$'),new RegExp('^companies/'+uuid+'/management/key$'),new RegExp('^companies/'+uuid+'/campaigns/(save|preview|activation|students/import)$'),new RegExp('^companies/'+uuid+'/inbox/(settings|policy|consent|opt-out|quick-replies|generate-prompt|crm-sync|release|takeover|suggest|preview|send|media-send)$'),/^companies$/,new RegExp('^companies/'+uuid+'/(channels/meta/start|channels/meta/pages|channels/meta/select|channels/evolution/connect|channels/evolution/status|channels/disconnect|calendar/prepare|calendar/generate|calendar/plan-dates|calendar/date|calendar/video/'+uuid+'/'+uuid+'|calendar/edit|calendar/approve|calendar/design|answers|places(/review)?|website|strategy|strategy/generate|strategy/approve|crm/contacts|crm/stage|crm/conversations|crm/mode|crm/notes|attachments/'+uuid+')$'),new RegExp('^access/'+uuid+'/meetings$')],
};
async function forward(request:Request,context:{params:Promise<{path:string[]}>}){
  const path=(await context.params).path.join('/');
  if(!allowed[request.method]?.some(pattern=>pattern.test(path)))return NextResponse.json({message:'Rota não disponível.'},{status:404});
  if(request.method!=='GET'&&request.headers.get('origin')!==appOrigin())return NextResponse.json({message:'Origem não autorizada.'},{status:403});
  if(!authConfigured())return NextResponse.json({message:'Acesso conectado indisponível.'},{status:503});
  const client=await serverSupabase();
  const {data:verified,error}=await client.auth.getUser();
  if(error||!verified.user?.email_confirmed_at)return NextResponse.json({message:'Faça login para continuar.'},{status:401});
  const {data}=await client.auth.getSession();
  if(!data.session)return NextResponse.json({message:'Sessão expirada.'},{status:401});
  const isVideo=path.includes('/calendar/video/');
  const isFile=isVideo||path.includes('/attachments/')||path.includes('/creatives/')||path.includes('/social-publications/media/');
  const maxSize=isVideo?52428800:path.endsWith('/inbox/media-send')?12*1024*1024:isFile?10485760:262144;
  let body:Uint8Array|undefined;
  if(request.method!=='GET'&&request.body){const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maxSize){await reader.cancel();return NextResponse.json({message:'Solicitação muito grande.'},{status:413});}chunks.push(part.value);}body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}}finally{reader.releaseLock();}}
  const query=new URL(request.url).search;
  try{
    const response=await fetch((process.env.API_INTERNAL_URL||'http://127.0.0.1:4000')+'/onboarding/'+path+query,{
      method:request.method,headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':isFile?(request.headers.get('content-type')??'application/octet-stream'):'application/json','X-File-Name':request.headers.get('x-file-name')??'','X-Revision':request.headers.get('x-revision')??''},
      body:body as BodyInit|undefined,cache:'no-store',signal:AbortSignal.timeout(isVideo?120000:path.endsWith('/calendar/design')?270000:path.endsWith('/calendar/generate')?110000:path.endsWith('/strategy/generate')||path.endsWith('/calendar/plan-dates')?60000:path.endsWith('/market')||path.includes('/ads/')||path.endsWith('/site/generate')?120000:path.endsWith('/overview')||path.includes('/channels/')||path.includes('/inbox/')||path.endsWith('/history')?60000:20000),
    });
    if(isFile&&request.method==='GET'&&response.ok)return new Response(response.body,{status:response.status,headers:{'Content-Type':response.headers.get('content-type')??'application/octet-stream','Content-Disposition':response.headers.get('content-disposition')??'attachment','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    return NextResponse.json(await response.json(),{status:response.status,headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({message:'Não foi possível acessar o servidor.'},{status:503});}
}
export const GET=forward;
export const POST=forward
