import {afterEach,describe,expect,it,vi} from 'vitest';
import {createCompanyInputSchema} from '../packages/contracts/src/identity';
import {parseStudentsCsv,personalizeCampaign} from '../packages/contracts/src/campaigns';
import {keywordCandidates} from '../packages/contracts/src/dashboard/trends';
import {publicSiteOrigin} from '../apps/web/lib/public-site';
import {guidedAnswers} from '../packages/contracts/src/onboarding';
describe('MedSI medical positioning with legacy compatibility',()=>{
 afterEach(()=>vi.unstubAllEnvs());
 it('accepts clinics and medical practices while retaining existing segment values',()=>{
  for(const segment of ['clinic','medical_practice','gym','studio','other'])expect(createCompanyInputSchema.safeParse({workspaceId:'10000000-0000-4000-8000-000000000001',name:'Cadastro fictício',segment,city:'São Paulo'}).success).toBe(true);
 });
 it('imports current and legacy CSV layouts identically without granting consent',()=>{
  const row='1;Contato fictício;+5511999999999;;;ativo;nao;';
  const current='id_paciente;nome;telefone;nascimento;ultimo_atendimento;situacao;autoriza_mensagens;grupo\n';
  const legacy='id_aluno;nome;telefone;nascimento;ultima_presenca;situacao;autoriza_mensagens;grupo\n';
  expect(parseStudentsCsv(current+row)).toEqual(parseStudentsCsv(legacy+row));expect(parseStudentsCsv(current+row)[0]?.consent).toBe(false);
  expect(personalizeCampaign('Olá {{nome}}, {{ clinica }} / {{academia}}',{name:'Ana',daysAbsent:null},'Clínica Teste')).toBe('Olá Ana, Clínica Teste / Clínica Teste');
 });
 it('uses confirmed medical services without inventing demand or fitness offers',()=>{
  const terms=keywordCandidates({segment:'clinic',city:'São Paulo',services:['Cardiologia'],confirmed:true});
  expect(terms).toHaveLength(20);expect(terms[0]?.term).toBe('cardiologia em São Paulo');expect(terms.every(t=>!t.measured)).toBe(true);
  expect(terms.map(t=>t.term).join(' ')).not.toMatch(/matrícula|aula experimental|academia/);
  expect(guidedAnswers('services','Especialidades: Cardiologia').services?.value).toBe('Cardiologia');
 });
 it('never invents a MedSI production domain and honors configured origins',()=>{
  vi.stubEnv('PUBLIC_SITE_URL','');vi.stubEnv('WEB_ORIGIN','');expect(publicSiteOrigin()).toBeUndefined();
  vi.stubEnv('WEB_ORIGIN','https://deployment.example/path');expect(publicSiteOrigin()).toBe('https://deployment.example');
  vi.stubEnv('PUBLIC_SITE_URL','https://medsi.example');expect(publicSiteOrigin()).toBe('https://medsi.example');
  vi.stubEnv('PUBLIC_SITE_URL','javascript:alert(1)');expect(publicSiteOrigin()).toBeUndefined();
 });
});
