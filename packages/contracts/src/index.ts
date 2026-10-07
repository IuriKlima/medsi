import { z } from 'zod';

export const companySchema = z.object({
  id: z.uuid(), name: z.string().trim().min(2).max(100),
  segment: z.enum(['Clínica', 'Consultório médico', 'Academia', 'Estúdio', 'Outro']),
  city: z.string().trim().max(100).default(''),
  timezone: z.string().default('America/Sao_Paulo'), status: z.literal('draft'),
});
export type Company = z.infer<typeof companySchema>;
export const stages = ['Novo', 'Em atendimento', 'Qualificado', 'Encaminhado', 'Visita agendada', 'Compareceu', 'Matriculado', 'Perdido'] as const;
export const contactSchema = z.object({
  id: z.uuid(), companyId: z.uuid(), name: z.string().trim().min(2).max(100),
  phone: z.string().max(25), email: z.union([z.email(), z.literal('')]),
});
export const opportunitySchema = z.object({
  id: z.uuid(), companyId: z.uuid(), contactId: z.uuid(), interest: z.string().max(200),
  source: z.enum(['Manual', 'Site', 'Instagram', 'WhatsApp']), stage: z.enum(stages),
  history: z.array(z.object({ stage: z.enum(stages), at: z.iso.datetime(), reason: z.string().optional() })),
});
export type Contact = z.infer<typeof contactSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export const contentSchema = z.object({
  id: z.uuid(), companyId: z.uuid(), title: z.string().trim().min(3).max(160),
  format: z.enum(['Imagem', 'Carrossel', 'Vídeo']), caption: z.string().max(5000),
  date: z.string(), version: z.number().int().positive(),
  status: z.enum(['draft', 'review', 'approved']), approvedVersion: z.number().int().positive().nullable(),
});
export type ContentItem = z.infer<typeof contentSchema>;
export const localWorkspaceSchema = z.object({
  version: z.literal(1), companies: z.array(companySchema), activeCompanyId: z.string().nullable(),
  contacts: z.array(contactSchema), opportunities: z.array(opportunitySchema), contents: z.array(contentSchema),
});
export type LocalWorkspace = z.infer<typeof localWorkspaceSchema>;
export const plans = { basic: { priceCents: 49700 }, weekly: { priceCents: 100000 }, premium: { priceCents: null } } as const;
export const queues = ['messages', 'ai', 'media', 'publishing', 'metrics'] as const;
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`;
  throw new Error('Informe um telefone com DDD válido.');
}
export function reviseContent(item: ContentItem, changes: Pick<ContentItem, 'title' | 'caption' | 'date' | 'format'>): ContentItem {
  return contentSchema.parse({ ...item, ...changes, version: item.version + 1, status: 'draft', approvedVersion: null });
}

export * from './identity';

export * from './foundation';

export const draftImportSchema = z.object({
  sourceCompanyId:z.uuid(),
  contacts:z.array(contactSchema.extend({phone:z.string().max(25).transform((value,ctx)=>{try{return normalizePhone(value);}catch{ctx.addIssue({code:'custom',message:'Telefone inválido.'});return z.NEVER;}})})).max(100),
  opportunities:z.array(opportunitySchema).max(100),
  contents:z.array(contentSchema.extend({date:z.union([z.literal(''),z.iso.date()])})).max(30),
}).strict().superRefine((data,ctx)=>{
  for(const [kind,items] of Object.entries({contacts:data.contacts,opportunities:data.opportunities,contents:data.contents})){
    const ids=new Set<string>();
    for(const item of items){
      if(item.companyId!==data.sourceCompanyId||ids.has(item.id))ctx.addIssue({code:'custom',path:[kind],message:'Empresa de origem inconsistente ou identificador repetido.'});
      ids.add(item.id);
    }
  }
  const contacts=new Set(data.contacts.map(c=>c.id));
  if(data.opportunities.some(o=>!contacts.has(o.contactId)))ctx.addIssue({code:'custom',path:['opportunities'],message:'Inclua os contatos vinculados às oportunidades.'});
});
export const exportedDraftsSchema=z.object({company:companySchema,contents:z.array(contentSchema),contacts:z.array(contactSchema),opportunities:z.array(opportunitySchema)}).strict();
export type DraftImport=z.infer<typeof draftImportSchema>;
export type DraftImportResult={contacts:number;opportunities:number;contents:number;skipped:number};
export type EditorialDraft={id:string;company_id:string;title:string;caption:string;format:string;planned_date:string|null;version:number;status:'draft';created_at:string};

export * from './dashboard';

export * from './onboarding';

export * from './strategy';
export * from './calendar';
export * from './inbox';

export * from './service-flow';
export * from './meta';
export * from './campaigns';
export * from './site';
export * from './market';

export * from './launch';

export * from './instagram';

export * from './visual';

export * from './ad-execution';
export * from './commerce';
export * from './support';

export * from './journey-progress';

export function localStageLabel(stage:string){return stage==='Visita agendada'?'Consulta agendada':stage==='Matriculado'?'Conversão confirmada':stage;}

export * from './medical-intake';

export * from './regional-audience';
export * from './regional-topics';
export * from './regional-map';
export * from './competitor-relevance';
