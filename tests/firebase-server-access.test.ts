import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
const session=vi.hoisted(()=>({value:'fixture-session'}));
vi.mock('server-only',()=>({}));
vi.mock('../apps/web/node_modules/next/headers',()=>({cookies:async()=>({get:()=>session.value?{value:session.value}:undefined})}));
vi.mock('../apps/web/node_modules/next/navigation',()=>({redirect:(url:string)=>{throw new Error('REDIRECT:'+url);}}));
vi.mock('../apps/web/lib/firebase/admin',()=>({adminFirebaseAuth:vi.fn()}));
vi.mock('../apps/web/lib/auth/config',()=>({authConfigured:()=>true,appOrigin:()=> 'http://127.0.0.1:3000'}));
vi.mock('../apps/web/lib/auth/server',async()=>({serverSupabase:(await import('../apps/web/lib/firebase/server')).firebaseServerClient}));
vi.mock('../apps/web/components/purchase-journey',()=>({PurchaseJourney:()=>null}));
import {firebaseServerClient} from '../apps/web/lib/firebase/server';
import Start from '../apps/web/app/comecar/page';
import {GET as googleCallback} from '../apps/web/app/api/connections/google/callback/route';
import {GET as metaCallback} from '../apps/web/app/api/connections/meta/callback/route';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const company='12345678-1234-4234-8234-123456789abc';
const other='22345678-1234-4234-8234-123456789abc';
let companies:Record<string,unknown>[]=[];
let capabilityStatus=200;
let onboardingStatus=200;
let confirmedRevision:number|null=2;
const requests:{path:string;authorization:string|null}[]=[];
const purchase={companyId:company,aiAllowed:false,setupComplete:false,testCheckoutEnabled:false};
const open=(empresa?:string)=>Start({searchParams:Promise.resolve({empresa})});
describe('Firebase server access used by the real onboarding page',()=>{
 beforeEach(()=>{
  session.value='fixture-session';companies=[];capabilityStatus=200;onboardingStatus=200;confirmedRevision=2;requests.length=0;
  vi.stubEnv('API_INTERNAL_URL','http://api.fixture.test');vi.stubGlobal('React',require('react'));
  vi.stubGlobal('fetch',async(input:string,init:RequestInit)=>{
   const path=new URL(input).pathname,authorization=new Headers(init.headers).get('authorization');requests.push({path,authorization});
   if(authorization!=='Bearer fixture-session')return Response.json({message:'unauthorized'},{status:401});
   if(path==='/identity')return Response.json({user:{id:'actor',email:'doctor@example.test'},staff:null,profile:{id:'actor',display_name:'Dra. Ana'},companies,companyMemberships:[{company_id:company,user_id:'actor',role:'admin'}]});
   if(path==='/operations/companies/'+company+'/capabilities')return Response.json(capabilityStatus===200?{actions:['company.read']}:{message:'private details must not leak'},{status:capabilityStatus});
   if(path==='/onboarding/channels/google/callback'||path==='/onboarding/channels/meta/callback')return Response.json({companyId:company,sessionId:other});
   if(path==='/onboarding/companies/'+company)return Response.json(onboardingStatus===200?{state:{company_id:company,revision:3,confirmed_revision:confirmedRevision},messages:[]}:{message:'private details'},{status:onboardingStatus});
   if(path==='/onboarding/companies/'+other)return Response.json({message:'private details'},{status:403});
   if(path==='/onboarding/companies/'+company+'/purchase')return Response.json(purchase);
   throw new Error('Unexpected fixture request');
  });
 });
 afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

 it('exposes only the current actor membership supplied by the authenticated identity endpoint',async()=>{
  const client=await firebaseServerClient();
  expect(await client.from('company_members').select('role').eq('company_id',company).eq('user_id','actor').maybeSingle()).toMatchObject({data:{role:'admin'},error:null});
  expect(await client.from('company_members').select('role').eq('company_id',other).maybeSingle()).toMatchObject({data:null,error:null});
 });
 it('loads onboarding revisions via the company-authorized API for OAuth return routing',async()=>{
  const client=await firebaseServerClient();
  expect(await client.from('company_onboarding').select('revision,confirmed_revision').eq('company_id',company).maybeSingle()).toEqual({data:{revision:3,confirmed_revision:2},error:null});
  expect(requests).toContainEqual({path:'/onboarding/companies/'+company,authorization:'Bearer fixture-session'});
 });
 it('does not read onboarding without a valid company scope or expose another clinic',async()=>{
  const client=await firebaseServerClient();
  expect((await client.from('company_onboarding').select('*')).error).toBeTruthy();
  expect((await client.from('company_onboarding').select('*').eq('company_id','../other')).error).toBeTruthy();
  expect(requests.every(r=>r.path==='/identity')).toBe(true);
  const denied=await client.from('company_onboarding').select('*').eq('company_id',other).maybeSingle();
  expect(denied.data).toBeNull();expect(denied.error).toBeTruthy();expect(JSON.stringify(denied)).not.toContain('private details');
 });

 for(const [provider,callback] of [['google',googleCallback],['meta',metaCallback]] as const){
  it(provider+' callback resumes an unconfirmed profile',async()=>{
   const response=await callback(new Request('http://127.0.0.1:3000/api/connections/'+provider+'/callback?state=fixture&code=fixture'));
   expect(response.headers.get('location')).toContain('/comecar?empresa='+company);
  });
  it(provider+' callback enters integrations only for a confirmed profile',async()=>{
   confirmedRevision=3;
   const response=await callback(new Request('http://127.0.0.1:3000/api/connections/'+provider+'/callback?state=fixture&code=fixture'));
   expect(response.headers.get('location')).toContain('/empresa/'+company+'/integracoes?');
  });
  it(provider+' callback fails closed if the onboarding read is unavailable',async()=>{
   onboardingStatus=503;
   const response=await callback(new Request('http://127.0.0.1:3000/api/connections/'+provider+'/callback?state=fixture&code=fixture'));
   expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/entrada?'+provider+'_error=1');
  });
 }
 it('opens onboarding for a verified user without a clinic instead of crashing on limit',async()=>{
  const page=await open();expect(page.props).toMatchObject({companyId:undefined,clientName:'Dra.'});
  expect(requests).toEqual([{path:'/identity',authorization:'Bearer fixture-session'}]);
 });
 it('resumes the oldest active authorized clinic after filtering and ordering',async()=>{
  companies=[{id:other,archived_at:null,created_at:'2026-10-02'},{id:'archived',archived_at:'2026-01-01',created_at:'2025-01-01'},{id:company,archived_at:null,created_at:'2026-09-01'}];
  await expect(open()).rejects.toThrow('REDIRECT:/comecar?empresa='+company);
  const client=await firebaseServerClient();const result=await client.from('companies').select('id').is('archived_at',null).order('created_at').limit(1);
  expect(result).toMatchObject({data:[{id:company}],error:null});
 });
 it('checks the selected clinic through the authenticated API before showing onboarding',async()=>{
  const page=await open(company);expect(page.props.companyId).toBe(company);
  expect(requests).toContainEqual({path:'/operations/companies/'+company+'/capabilities',authorization:'Bearer fixture-session'});
 });
 it('denies a clinic when the API rejects access without leaking its response',async()=>{
  capabilityStatus=403;const client=await firebaseServerClient();const result=await client.rpc('company_capabilities',{p_company_id:company});
  expect(result.data).toBeNull();expect(result.error?.code).toBe('42501');expect(JSON.stringify(result)).not.toContain('private details');
  expect((await open(company)).type).toBe('main');
 });
 it('reads the real purchase endpoint without inventing paid access',async()=>{
  const client=await firebaseServerClient();expect(await client.rpc('company_purchase_state',{p_company_id:company})).toMatchObject({data:purchase,error:null});
  expect(requests).toEqual([{path:'/onboarding/companies/'+company+'/purchase',authorization:'Bearer fixture-session'}]);
 });
 it('rejects unsupported mutations and invalid identifiers before contacting the API',async()=>{
  const client=await firebaseServerClient();
  expect((await client.rpc('approve_marketing_stage',{p_company_id:company})).error?.code).toBe('FIRESTORE_OPERATION_PENDING');
  expect((await client.rpc('company_capabilities',{p_company_id:'../other'})).error?.code).toBe('22023');
  expect(requests).toEqual([]);
 });
 it('redirects an anonymous visitor and refuses protected RPC reads without a session',async()=>{
  session.value='';await expect(open()).rejects.toThrow('REDIRECT:/login');
  const client=await firebaseServerClient();expect((await client.rpc('company_capabilities',{p_company_id:company})).error?.code).toBe('42501');expect(requests).toEqual([]);
 });
 it('returns no data for a failed API request instead of granting default capabilities',async()=>{
  vi.stubGlobal('fetch',async()=>{throw new Error('secret internal failure');});
  const client=await firebaseServerClient();const result=await client.rpc('company_capabilities',{p_company_id:company});
  expect(result.data).toBeNull();expect(result.error).toBeTruthy();expect(JSON.stringify(result)).not.toContain('secret internal failure');
 });
});