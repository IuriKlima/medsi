import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {afterAll,describe,expect,it,vi} from 'vitest';
import {CompanyJourney} from '../apps/web/components/company-journey';
import {AuthPanel} from '../apps/web/components/auth-panel';
import {allowedSettingsTabs} from '../apps/web/lib/company-navigation';
const require=createRequire(resolve('apps/web/package.json')),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
vi.stubGlobal('React',React);afterAll(()=>vi.unstubAllGlobals());
describe('visible clinic journey entry points',()=>{
 it('opens the regional map workflow from the competitors menu, not only Instagram',()=>{
  const html=renderToStaticMarkup(<CompanyJourney company={{id:'10000000-0000-4000-8000-000000000001',name:'Clínica fictícia',timezone:'America/Sao_Paulo'}} area="concorrentes" actions={['marketing.read','marketing.write']} email="fixture@example.test" userId="fixture"/>);
  expect(html).toContain('Mapa e concorrentes da região');expect(html).toContain('Carregando a pesquisa regional');
 });
 it('offers the current medical intake preview separately from legacy browser drafts when authentication is unavailable',()=>{
  const html=renderToStaticMarkup(<AuthPanel configured={false}/>);
  expect(html).toContain('href="/preview/onboarding"');expect(html).toContain('Testar o cadastro demonstrativo');expect(html).toContain('prévia de rascunhos');
 });
 it('allows an authorized clinic to configure attendance while completing the strategy',()=>{
  expect(allowedSettingsTabs(['marketing.read','marketing.write','crm.read','crm.write']).find(t=>t.id==='atendimento')?.setup).toBe(true);
  expect(allowedSettingsTabs(['marketing.read']).some(t=>t.id==='atendimento')).toBe(false);
 });
});
