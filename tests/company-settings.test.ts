import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
vi.mock('../apps/web/lib/auth/server',()=>({serverSupabase:vi.fn()}));
vi.mock('../apps/web/components/company-journey',()=>({CompanyJourney:()=>null}));
vi.mock('../apps/web/node_modules/next/navigation',()=>({redirect:(url:string)=>{throw new Error('REDIRECT:'+url);},notFound:()=>{throw new Error('NOT_FOUND');}}));
import {serverSupabase} from '../apps/web/lib/auth/server';
import CompanyPage from '../apps/web/app/empresa/[id]/[[...section]]/page';
import DashboardPage from '../apps/web/app/dashboard/page';
import {allowedSettingsTabs,companyNavigation,companySettingsHref} from '../apps/web/lib/company-navigation';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));const React=require('react');
const company='12345678-1234-4234-8234-123456789abc';
const ownerActions=['company.read','marketing.read','marketing.write','crm.read','billing.manage'];
function client(actions:string[],options:{paid?:boolean;complete?:boolean;role?:string}={}){
 const rpc=vi.fn(async(name:string)=>({data:name==='company_capabilities'?{actions}:{aiAllowed:options.paid??true,setupComplete:options.complete??true},error:null}));
 const filters:Record<string,unknown>[]=[];
 const from=vi.fn((table:string)=>{const filter:Record<string,unknown>={table};filters.push(filter);const builder={select:()=>builder,eq:(key:string,value:string)=>{filter[key]=value;return builder;},is:()=>builder,maybeSingle:async()=>({data:table==='company_members'?{role:options.role??'marketing'}:{id:company,name:'Academia fictícia',timezone:'America/Sao_Paulo'},error:null})};return builder;});
 vi.mocked(serverSupabase).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'actor',email_confirmed_at:'confirmed',email:'test@example.com'}}})},rpc,from} as never);
 return {rpc,filters};
}
const open=(section:string,query:Record<string,string>={})=>CompanyPage({params:Promise.resolve({id:company,section:[section]}),searchParams:Promise.resolve(query)});
describe('Company settings stay scoped after consolidating navigation',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('React',React);});afterEach(()=>vi.unstubAllGlobals());
 it('orders the menu as requested without any Results screen',()=>{
  const navigation=companyNavigation(ownerActions,true);
  expect(navigation.map(group=>group.title)).toEqual(['Visão geral','Conteúdo','Aquisição','Campanhas','Planejamento','Conta']);
  expect(navigation.flatMap(group=>group.items).some(([id])=>id==='resultados')).toBe(false);
 });
 it('limits tabs to authorized actions, including both requirements for attendance',()=>{
  expect(allowedSettingsTabs(['company.read','crm.read'])).toEqual([]);
  expect(allowedSettingsTabs(['marketing.read','marketing.write']).map(tab=>tab.id)).toEqual(['perfil','site','integracoes']);
  expect(allowedSettingsTabs(ownerActions,true)).toHaveLength(6);
 });
 it('denies billing in the server page for a marketing member before loading purchase data',async()=>{
  const fixture=client(['company.read','marketing.read']);const page=await open('configuracoes',{aba:'assinatura'});
  expect(page.type).toBe('main');expect(fixture.rpc.mock.calls.map(args=>args[0])).toEqual(['company_capabilities']);
 });
 it('checks the authenticated membership before allowing the team tab to an admin',async()=>{
  const fixture=client(['company.read','marketing.read'],{role:'admin'});const page=await open('configuracoes',{aba:'equipe'});
  expect(page.props.children[1].props).toMatchObject({settingsTab:'equipe',manageTeam:true,userId:'actor',company:{id:company}});
  expect(fixture.filters).toContainEqual({table:'company_members',company_id:company,user_id:'actor'});
 });
 it('keeps OAuth selection parameters when redirecting old integration links',async()=>{
  client(ownerActions);await expect(open('integracoes',{meta_session:'opaque-meta',google_session:'opaque-google'})).rejects.toThrow('REDIRECT:'+companySettingsHref(company,'integracoes',new URLSearchParams({meta_session:'opaque-meta',google_session:'opaque-google'})));
 });
 it('does not turn the consolidated page into a bypass of the payment gate',async()=>{
  client(ownerActions,{paid:false,complete:false});await expect(open('configuracoes',{aba:'site'})).rejects.toThrow('REDIRECT:/comecar?empresa='+company);
  const page=await open('configuracoes',{aba:'integracoes'});expect(page.props.children[1].props.settingsTab).toBe('integracoes');
 });
 it('rejects unknown tabs and sends retired reporting links to the company overview',async()=>{
  client(ownerActions);await expect(open('configuracoes',{aba:'desconhecida'})).rejects.toThrow('NOT_FOUND');
  await expect(DashboardPage({searchParams:Promise.resolve({companyId:company})})).rejects.toThrow('REDIRECT:/empresa/'+company);
  await expect(DashboardPage({searchParams:Promise.resolve({companyId:'https://external.example'})})).rejects.toThrow('REDIRECT:/entrada');
 });
});
