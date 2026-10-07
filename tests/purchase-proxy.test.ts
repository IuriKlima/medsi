import {afterEach,describe,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({user:true}));
vi.mock('../apps/web/lib/auth/server',()=>({serverSupabase:async()=>({auth:{getUser:async()=>({data:{user:auth.user?{id:'owner',email_confirmed_at:'confirmed'}:null},error:null}),getSession:async()=>({data:{session:{access_token:'fixture-session'}}})}})}));
vi.mock('../apps/web/lib/auth/config',()=>({appOrigin:()=> 'https://example.test',authConfigured:()=>true}));
import {GET,POST} from '../apps/web/app/api/onboarding/[...path]/route';
const company='10000000-0000-4000-8000-000000000001',execution='20000000-0000-4000-8000-000000000001';
const request=(method:string,path:string,origin='https://example.test')=>new Request('https://example.test/api/onboarding/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({requestId:execution,planId:'askadia_semiannual'})}:{})});
const context=(path:string)=>({params:Promise.resolve({path:path.split('/')})});
afterEach(()=>{vi.unstubAllGlobals();auth.user=true;});
describe('Authenticated browser bridge for checkout and guided marketing',()=>{
 it('forwards exact purchase, strategy and creative routes with verified user session',async()=>{
  const calls=vi.fn(async()=>new Response(JSON.stringify({ok:true}),{status:200}));vi.stubGlobal('fetch',calls);
  for(const suffix of ['purchase','purchase/billing','launch','launch/journey','instagram','visual-jobs','ads/executions']){const path='companies/'+company+'/'+suffix;expect((await GET(request('GET',path),context(path))).status).toBe(200);}
  for(const suffix of ['purchase/checkout','purchase/billing/customer','purchase/billing/reconcile','purchase/billing/cancel','purchase/checkout/confirm','purchase/finish','launch/approve','launch/resume','instagram/select','instagram/search','instagram/retry','places/review','visual-jobs','ads/executions/'+execution+'/approve']){const path='companies/'+company+'/'+suffix;expect((await POST(request('POST',path),context(path))).status).toBe(200);}
  expect(calls.mock.calls).toHaveLength(21);expect(calls).toHaveBeenLastCalledWith(expect.stringContaining('/onboarding/companies/'+company+'/ads/executions/'+execution+'/approve'),expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer fixture-session'})}));
 });
 it('forwards integrated optional traffic, marketing facts, official channels and versioned publication routes',async()=>{
  const calls=vi.fn(async()=>new Response(JSON.stringify({ok:true}),{status:200}));vi.stubGlobal('fetch',calls);
  for(const suffix of ['marketing-facts','inbox/policy','whatsapp-cloud/status','social-publications']){const path='companies/'+company+'/'+suffix;expect((await GET(request('GET',path),context(path))).status).toBe(200);}
  for(const suffix of ['regional-research/competitors','launch/planning-preferences','launch/traffic-preference','marketing-facts','instagram/research','inbox/policy','inbox/consent','inbox/opt-out','whatsapp-cloud/connect','social-publications','social-publications/'+execution+'/approve','social-publications/'+execution+'/control','social-publications/'+execution+'/edit']){const path='companies/'+company+'/'+suffix;expect((await POST(request('POST',path),context(path))).status).toBe(200);}
  expect(calls).toHaveBeenCalledTimes(17);
 });
 it('streams private publication preview bytes with verified authorization',async()=>{
  const path='companies/'+company+'/social-publications/media/'+'a'.repeat(64),bytes=new Uint8Array([255,216,255,217]);const calls=vi.fn(async()=>new Response(bytes,{headers:{'Content-Type':'image/jpeg'}}));vi.stubGlobal('fetch',calls);
  const response=await GET(request('GET',path),context(path));expect(response.status).toBe(200);expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);expect(response.headers.get('Cache-Control')).toBe('private, no-store');
 });
 it('rejects unauthenticated, cross-origin and unlisted server operations before forwarding',async()=>{
  const calls=vi.fn();vi.stubGlobal('fetch',calls);const path='companies/'+company+'/purchase/checkout';
  expect((await POST(request('POST',path,'https://foreign.test'),context(path))).status).toBe(403);auth.user=false;expect((await POST(request('POST',path),context(path))).status).toBe(401);auth.user=true;
  for(const suffix of ['purchase/activate','purchase/billing/customer/extra','purchase/billing/activate','purchase/checkout/confirm/extra','purchase/complete_test_checkout_server','ads/executions/'+execution+'/activate']){const p='companies/'+company+'/'+suffix;expect((await POST(request('POST',p),context(p))).status).toBe(404);}
  expect(calls).not.toHaveBeenCalled();
 });
});
