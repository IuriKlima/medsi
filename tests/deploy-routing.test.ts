import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import {NextRequest} from '../apps/web/node_modules/next/server';
import {unstable_doesMiddlewareMatch,getRedirectUrl,getRewrittenUrl} from '../apps/web/node_modules/next/experimental/testing/server';
vi.mock('../apps/web/lib/auth/config',()=>({authConfigured:()=>true,authConfig:()=>({url:'https://fixture.test',key:'fixture'})}));
import {proxy,config} from '../apps/web/proxy';
import {productionConfigurationIssues} from '../apps/api/src/platform/production-config';
const id='10000000-0000-4000-8000-000000000001';
function request(host:string,path='/',extra:Record<string,string>={}){return new NextRequest('https://'+host+path,{headers:{host,...extra}});}
afterEach(()=>vi.unstubAllEnvs());
describe('MedSI deployment routing',()=>{
 beforeEach(()=>{vi.stubEnv('WEB_ORIGIN','https://medsi.example.test');vi.stubEnv('APP_HOSTNAMES','');vi.stubEnv('DATABASE_PROVIDER','firestore');});
 it('serves the application on its canonical domain, www and explicit Easypanel alias',async()=>{
  vi.stubEnv('APP_HOSTNAMES',' MedSI-App.fixture.easypanel.host , other.example.test');
  for(const host of ['medsi.example.test','www.medsi.example.test','MEDSI-APP.fixture.easypanel.host','other.example.test','localhost:3000','127.0.0.1:3000'])expect(getRewrittenUrl(await proxy(request(host)))).toBeNull();
 });
 it('keeps foreign and customer hosts in the published-site lookup without trusting forwarded host',async()=>{
  vi.stubEnv('APP_HOSTNAMES','medsi-app.fixture.easypanel.host,*.easypanel.host,https://foreign.test,malformed/path');
  for(const host of ['customer.example.test','other.easypanel.host','foreign.test','medsi.example.test.attacker.test']){
   const response=await proxy(request(host,'/',{'x-forwarded-host':'medsi.example.test'}));
   const target=new URL(getRewrittenUrl(response)!);expect(target.pathname).toBe('/api/sites/domain');expect(target.searchParams.get('host')).toBe(host);
  }
 });
 it('reproduces the reported misrouting with a local WEB_ORIGIN and resolves it with the deployed origin',async()=>{
  const host='medsi-app.fixture.easypanel.host';vi.stubEnv('WEB_ORIGIN','http://127.0.0.1:3000');
  expect(getRewrittenUrl(await proxy(request(host)))).toContain('/api/sites/domain');
  vi.stubEnv('WEB_ORIGIN','https://'+host);expect(getRewrittenUrl(await proxy(request(host)))).toBeNull();
 });
 it('does not route application pages through the customer-site endpoint and preserves private caching',async()=>{
  const response=await proxy(request('medsi.example.test','/empresa/'+id));expect(getRewrittenUrl(response)).toBeNull();expect(response.headers.get('Cache-Control')).toBe('private, no-store');
 });
 it('redirects clinic links and nested sections to the existing authenticated route, retaining query parameters',async()=>{
  for(const [source,target] of [['/clinicas','/entrada'],['/clinicas/'+id,'/empresa/'+id],['/clinicas/'+id+'/configuracoes?aba=equipe&tag=a&tag=b','/empresa/'+id+'/configuracoes?aba=equipe&tag=a&tag=b']]){
   expect(unstable_doesMiddlewareMatch({config,nextConfig:{},url:'https://medsi.example.test'+source})).toBe(true);
   const response=await proxy(request('medsi.example.test',source));
   expect(response.status).toBe(307);expect(getRedirectUrl(response)).toBe('https://medsi.example.test'+target);
  }
 });
});
describe('Production startup diagnostics',()=>{
 beforeEach(()=>{
  for(const [name,value] of Object.entries({NODE_ENV:'production',DATABASE_PROVIDER:'firestore',WEB_ORIGIN:'https://medsi.example.test',FIREBASE_PROJECT_ID:'fixture',FIREBASE_STORAGE_BUCKET:'fixture.test',FIREBASE_AUTH_EMULATOR_HOST:'',FIREBASE_STORAGE_EMULATOR_HOST:'',FIRESTORE_EMULATOR_HOST:'',SECRETS_ENCRYPTION_KEY:'a'.repeat(64),SUPABASE_URL:'',SUPABASE_ANON_KEY:'',SUPABASE_PUBLISHABLE_KEY:'',DATABASE_URL:'',CLOUD_SQL_CONNECTION_NAME:''}))vi.stubEnv(name,value);
 });
 it('keeps Firestore production blocked even when environment fields are filled',()=>{
  expect(productionConfigurationIssues()).toEqual([expect.stringContaining('Firestore migration is incomplete')]);
 });
 it('reports every missing requirement without revealing any configured secret',()=>{
  vi.stubEnv('WEB_ORIGIN','http://127.0.0.1:3000');vi.stubEnv('FIREBASE_PROJECT_ID','');vi.stubEnv('FIREBASE_STORAGE_BUCKET','');vi.stubEnv('SECRETS_ENCRYPTION_KEY','fixture-secret-do-not-print');
  const issues=productionConfigurationIssues().join('\n');
  for(const name of ['WEB_ORIGIN','FIREBASE_PROJECT_ID','FIREBASE_STORAGE_BUCKET','SECRETS_ENCRYPTION_KEY','Firestore migration'])expect(issues).toContain(name);
  expect(issues).not.toContain('fixture-secret-do-not-print');
 });
 it('rejects credential-bearing and path-bearing origins and all Firebase emulators in production',()=>{
  for(const origin of ['https://user:private@medsi.example.test','https://medsi.example.test/login','https://medsi.example.test?query=value']){vi.stubEnv('WEB_ORIGIN',origin);expect(productionConfigurationIssues().join()).toContain('WEB_ORIGIN');}
  for(const name of ['FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST']){vi.stubEnv(name,'127.0.0.1:9000');expect(productionConfigurationIssues().join()).toContain('emuladores');vi.stubEnv(name,'');}
 });
 it('preserves the previous configured provider and local development behavior',()=>{
  vi.stubEnv('DATABASE_PROVIDER','supabase');vi.stubEnv('SUPABASE_URL','https://fixture.supabase.co');vi.stubEnv('SUPABASE_ANON_KEY','fixture-public');expect(productionConfigurationIssues()).toEqual([]);
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('DATABASE_PROVIDER','firestore');expect(productionConfigurationIssues()).toEqual([]);
 });
 it('stops the production runner before starting services if NODE_ENV was overridden',()=>{
  // Four subprocesses each retain their own five-second deadline.
  for(const value of ['development','test','production ','']){
   const result=spawnSync(process.execPath,['scripts/start-production.mjs'],{env:{...process.env,NODE_ENV:value},encoding:'utf8',timeout:5000});
   expect(result.status).toBe(1);expect(result.stderr).toContain('exige NODE_ENV=production');expect(result.stdout).toBe('');
  }
 },25_000);
});
