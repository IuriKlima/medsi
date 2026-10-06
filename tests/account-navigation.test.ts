import {describe,expect,it} from 'vitest';
import {customerEntryDestination,legacyAccountDestination,invitationFromHash} from '../apps/web/lib/account-navigation';

describe('single clinic account navigation',()=>{
 it('starts onboarding only when there is no active clinic',()=>{
  expect(customerEntryDestination([])).toBe('/comecar');
  expect(customerEntryDestination([{id:'archived',created_at:'2026-01-01',archived_at:'2026-02-01'}])).toBe('/comecar');
 });
 it('resumes the oldest active clinic without displaying a selector for legacy accounts',()=>{
  const companies=[{id:'new',created_at:'2026-04-01'},{id:'old',created_at:'2026-01-01'},{id:'archived',created_at:'2025-01-01',archived_at:'2026-02-01'}];
  expect(customerEntryDestination(companies)).toBe('/empresa/old');
  expect(customerEntryDestination([...companies].reverse())).toBe('/empresa/old');
 });
 it('returns Meta authorization failures to the clinic integrations',()=>{
  expect(customerEntryDestination([{id:'clinic',created_at:'2026-01-01'}],true)).toBe('/empresa/clinic/configuracoes?aba=integracoes&meta_error=1');
 });
 it('preserves legacy team, subscription and import links while the company page verifies access',()=>{
  const id='10000000-0000-4000-8000-000000000001';
  expect(legacyAccountDestination('?companyId='+id+'&view=team')).toBe('/empresa/'+id+'/configuracoes?aba=equipe');
  expect(legacyAccountDestination('?companyId='+id+'&view=security')).toBe('/empresa/'+id+'/configuracoes?aba=equipe');
  expect(legacyAccountDestination('?companyId='+id+'&view=plan')).toBe('/empresa/'+id+'/configuracoes?aba=assinatura');
  expect(legacyAccountDestination('?companyId='+id+'&view=import')).toBe('/empresa/'+id+'/conteudo');
  expect(legacyAccountDestination('?companyId=https://attacker.test&view=team')).toBe('/entrada');
  expect(legacyAccountDestination('')).toBe('/entrada');
 });
 it('keeps valid invitation fragments for explicit acceptance without forwarding arbitrary destinations',()=>{
  const token='a'.repeat(64);
  expect(invitationFromHash('#invite='+token)).toBe(token);
  expect(invitationFromHash('#invite=invalid')).toBeNull();
  expect(invitationFromHash('#next=https://attacker.test')).toBeNull();
 });
});
