import { contactSchema, contentSchema, localWorkspaceSchema, normalizePhone, opportunitySchema, type ContentItem, type LocalWorkspace, type Opportunity } from '@askadia/contracts';
export const storageKey = 'askadia.workspace.v1';
export function emptyWorkspace(): LocalWorkspace { return { version: 1, companies: [], activeCompanyId: null, contacts: [], opportunities: [], contents: [] }; }
export function readWorkspace(raw: string | null): LocalWorkspace { return raw ? localWorkspaceSchema.parse(JSON.parse(raw)) : emptyWorkspace(); }
export function addLead(state: LocalWorkspace, companyId: string, fields: { name: string; phone: string; email: string; interest: string }) {
  if (!state.companies.some(c => c.id === companyId)) throw new Error('Selecione uma empresa válida.');
  const phone = normalizePhone(fields.phone);
  const existing = phone ? state.contacts.find(c => c.companyId === companyId && c.phone === phone) : undefined;
  const contact = existing ?? contactSchema.parse({ id: crypto.randomUUID(), companyId, name: fields.name, phone, email: fields.email });
  const opportunity = opportunitySchema.parse({ id: crypto.randomUUID(), companyId, contactId: contact.id, interest: fields.interest, source: 'Manual', stage: 'Novo', history: [{ stage: 'Novo', at: new Date().toISOString() }] });
  return { ...state, contacts: existing ? state.contacts : [...state.contacts, contact], opportunities: [...state.opportunities, opportunity] };
}
export function moveOpportunity(state: LocalWorkspace, companyId: string, id: string, stage: Opportunity['stage'], reason?: string) {
  const item = state.opportunities.find(o => o.id === id && o.companyId === companyId);
  if (!item) throw new Error('Oportunidade não encontrada nesta empresa.');
  if (stage === 'Matriculado') throw new Error('A conversão exige autenticação e evidência operacional. Disponível na etapa de CRM conectado.');
  if (stage === 'Perdido' && !reason?.trim()) throw new Error('Informe o motivo da perda.');
  if (item.stage === stage) return state;
  return { ...state, opportunities: state.opportunities.map(o => o.id !== id ? o : opportunitySchema.parse({ ...o, stage, history: [...o.history, { stage, at: new Date().toISOString(), reason }] })) };
}
export function approveContent(state: LocalWorkspace, companyId: string, id: string, version: number): LocalWorkspace {
  const item = state.contents.find(c => c.id === id && c.companyId === companyId);
  if (!item || item.version !== version || item.status !== 'review') throw new Error('Esta versão não está disponível para revisão.');
  return { ...state, contents: state.contents.map(c => c.id === id ? contentSchema.parse({ ...c, status: 'approved', approvedVersion: version }) : c) };
}
export function saveContent(state: LocalWorkspace, companyId: string, item: ContentItem): LocalWorkspace {
  if (item.companyId !== companyId || !state.companies.some(c => c.id === companyId)) throw new Error('Empresa inválida.');
  const existing = state.contents.find(c => c.id === item.id);
  if (existing && existing.companyId !== companyId) throw new Error('Conteúdo de outra empresa.');
  return { ...state, contents: existing ? state.contents.map(c => c.id === item.id ? contentSchema.parse(item) : c) : [...state.contents, contentSchema.parse(item)] };
}

