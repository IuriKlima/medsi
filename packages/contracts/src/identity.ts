import { z } from 'zod';
export const companyRoles = ['admin','marketing','approver','attendant','reader','support'] as const;
export const companyRoleSchema = z.enum(companyRoles);
export type CompanyRole = z.infer<typeof companyRoleSchema>;
export const roleLabels: Record<CompanyRole,string> = { admin:'Administrador da empresa',marketing:'Gerente de marketing',approver:'Aprovador',attendant:'Atendente',reader:'Leitor',support:'Acompanhamento' };
export const createWorkspaceSchema = z.object({ name:z.string().trim().min(2).max(100) }).strict();
const timezone = z.string().max(80).refine(v => { try { new Intl.DateTimeFormat('pt-BR',{timeZone:v}); return true; } catch { return false; } },'Fuso inválido');
export const createCompanyInputSchema = z.object({
  workspaceId:z.uuid(), name:z.string().trim().min(2).max(100),
  segment:z.enum(['clinic','medical_practice','gym','studio','other']), city:z.string().trim().max(100),
  timezone:timezone.default('America/Sao_Paulo'),
}).strict();
export const updateCompanyInputSchema = createCompanyInputSchema.omit({workspaceId:true}).extend({archived:z.boolean()}).strict();
export const invitationInputSchema = z.object({ email:z.email().max(254).transform(v=>v.trim().toLowerCase()),role:companyRoleSchema }).strict();
export const memberInputSchema = z.object({ role:companyRoleSchema.nullable() }).strict();
export const acceptInvitationSchema = z.object({ token:z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type WorkspaceRecord = { id:string; name:string; created_at:string };
export type CompanyRecord = { id:string; workspace_id:string; name:string; segment:'clinic'|'medical_practice'|'gym'|'studio'|'other';city:string;timezone:string;status:string;archived_at:string|null;created_at:string };
export type WorkspaceMembership = { workspace_id:string;user_id:string;role:'owner'|'member' };
export type CompanyMembership = { company_id:string;user_id:string;role:CompanyRole };
export type IdentitySnapshot = { user:{id:string;email:string};workspaces:WorkspaceRecord[];companies:CompanyRecord[];workspaceMemberships:WorkspaceMembership[];companyMemberships:CompanyMembership[] };
export type MemberRecord = {user_id:string;role:CompanyRole;display_name:string};
export type InvitationRecord = {id:string;email:string;role:CompanyRole;expires_at:string;accepted_at:string|null;revoked_at:string|null};
export type AuditRecord = {id:string;action:string;created_at:string;actor_id:string;details:Record<string,unknown>};
export type CompanyTeam = {members:MemberRecord[];invitations:InvitationRecord[];audit:AuditRecord[]};

export const authRequestSchema=z.object({action:z.enum(['login','signup','recover','update','logout']),email:z.email().max(254).optional(),password:z.string().max(128).optional(),name:z.string().trim().min(2).max(100).optional(),inviteToken:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
