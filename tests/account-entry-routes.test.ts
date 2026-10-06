import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
vi.mock('../apps/web/lib/auth/server',()=>({serverSupabase:vi.fn()}));
vi.mock('../apps/web/lib/auth/config',()=>({authConfigured:()=>true}));
vi.mock('../apps/web/components/tenant-workspace',()=>({TenantWorkspace:()=>null}));
vi.mock('../apps/web/components/account-entry',()=>({AccountEntry:()=>null}));
vi.mock('../apps/web/node_modules/next/navigation',()=>({redirect:(url:string)=>{throw new Error('REDIRECT:'+url);}}));
import {serverSupabase} from '../apps/web/lib/auth/server';
import Entry from '../apps/web/app/entrada/page';
import Workspace from '../apps/web/app/workspace/page';
import {AccountEntry} from '../apps/web/components/account-entry';
import {TenantWorkspace} from '../apps/web/components/tenant-workspace';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url)),React=require('react');
function client(companies:unknown[]=[],staff:unknown=null,confirmed=true){
 const from=vi.fn((table:string)=>{const query={select:()=>query,eq:()=>query,is:()=>query,order:async()=>({data:companies,error:null}),maybeSingle:async()=>({data:table==='platform_staff'?staff:null,error:null})};return query;});
 vi.mocked(serverSupabase).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'actor',email_confirmed_at:confirmed?'confirmed':null,email:'test@example.test'}}})},from} as never);
}
describe('customer entry routes preserve staff and invitation access',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('React',React);});afterEach(()=>vi.unstubAllGlobals());
 it('takes the customer directly to the oldest clinic, including legacy multiple records',async()=>{
  client([{id:'new',created_at:'2026-04-01'},{id:'old',created_at:'2026-01-01'}]);await expect(Entry({searchParams:Promise.resolve({})})).rejects.toThrow('REDIRECT:/empresa/old');
 });
 it('routes a first account to onboarding and Meta errors to the clinic settings',async()=>{
  client();await expect(Entry({searchParams:Promise.resolve({})})).rejects.toThrow('REDIRECT:/comecar');
  client([{id:'clinic'}]);await expect(Entry({searchParams:Promise.resolve({meta_error:'1'})})).rejects.toThrow('REDIRECT:/empresa/clinic/configuracoes?aba=integracoes&meta_error=1');
 });
 it('retains the staff administration and portfolio entry',async()=>{
  client([],{active:true,role:'platform_admin'});await expect(Entry({searchParams:Promise.resolve({})})).rejects.toThrow('REDIRECT:/admin');
  client([],{active:true,role:'support'});await expect(Entry({searchParams:Promise.resolve({})})).rejects.toThrow('REDIRECT:/acompanhamento/carteira');
 });
 it('uses the fragment-aware invitation bridge instead of a workspace selector for customers',async()=>{
  client();expect((await Workspace()).type).toBe(AccountEntry);
  client([],{active:false,role:'platform_admin'});expect((await Workspace()).type).toBe(AccountEntry);
  client([],{active:true,role:'platform_admin'});expect((await Workspace()).type).toBe(TenantWorkspace);
 });
 it('requires confirmed authentication on both entry paths',async()=>{
  client([],null,false);await expect(Entry({searchParams:Promise.resolve({})})).rejects.toThrow('REDIRECT:/login');await expect(Workspace()).rejects.toThrow('REDIRECT:/login');
 });
});
