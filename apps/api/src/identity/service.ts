import { HttpException, BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedActor } from './auth';
import type { CompanyRole } from '@askadia/contracts';
import type { PostgrestError } from '@supabase/supabase-js';
export function result<T>(value:{data:T|null;error:PostgrestError|null}):T {
  if(value.error){
    if(value.error.code==='8'||value.error.code==='FIRESTORE_QUOTA_EXCEEDED')throw new ServiceUnavailableException({code:'FIRESTORE_QUOTA_EXCEEDED',message:'O banco de dados atingiu a cota disponível. Aguarde a liberação da cota para continuar.'});
    if(value.error.code==='FIRESTORE_OPERATION_PENDING')throw new ServiceUnavailableException('Esta funcionalidade ainda está sendo adaptada ao Firestore. Seus dados salvos foram preservados.');
    if(value.error.code==='P0402')throw new HttpException('Escolha e confirme um plano para liberar o processamento com IA desta empresa.',402);
    if(value.error.message==='OAuth state unavailable')throw new ConflictException('A autorização da Meta expirou ou já foi utilizada. Conecte novamente para escolher a Página.');
    if(value.error.code==='42501') throw new ForbiddenException('Você não tem permissão para esta ação ou o acesso não está mais disponível.');
    if(value.error.message==='Daily account allowance exhausted') throw new BadRequestException('O limite diário de IA desta conta foi atingido. Tente novamente no próximo dia.');
    if(value.error.message==='Strategy usage allowance unavailable') throw new BadRequestException('O limite de geração de estratégia desta empresa precisa ser habilitado pela administração.');
    if(value.error.message==='Content allowance exhausted') throw new BadRequestException('O limite diário de geração de conteúdo foi atingido. Tente novamente no próximo dia.');
    if(value.error.message==='No pending content') throw new BadRequestException('As ideias desta estratégia já foram detalhadas. Atualize o calendário.');
    if(value.error.message==='Final media required') throw new BadRequestException('Gere ou envie todos os arquivos da peça antes de aprovar.');
    if(['Content changed','Run changed','Request already used','Generation running','Approve the current strategy first'].includes(value.error.message)) throw new ConflictException('A geração já começou ou a versão mudou. Atualize o calendário e confira a estratégia aprovada.');
    if(['Strategy not ready','Suggestions not ready'].includes(value.error.message))throw new ConflictException('A proposta ainda está sendo preparada. Aguarde a atualização da etapa antes de aprovar.');
    if(value.error.message==='Generation already running')throw new ConflictException('A estratégia já está sendo gerada. Aguarde a proposta aparecer para revisão.');
    if(value.error.message==='Proposal changed; review current version')throw new ConflictException('A proposta foi atualizada. Revise a versão exibida antes de aprovar.');
    if(value.error.message==='Approve previous stages first')throw new ConflictException('Conclua a aprovação da etapa anterior para continuar.');
    if(value.error.message==='Review missing competitor data explicitly')throw new BadRequestException('Registre as limitações dos dados de concorrentes antes de continuar.');
    if(value.error.message==='Plan dates at least seven days ahead')throw new BadRequestException('Ajuste as datas do calendário para pelo menos sete dias à frente antes de aprovar.');
    if(value.error.message==='A análise mudou. Gere um novo diagnóstico.')throw new ConflictException('A análise de concorrentes mudou. Peça para refazer o diagnóstico antes de aprovar.');
    if(value.error.message==='A coleta mudou. Revise os dados atualizados antes de aprovar.')throw new ConflictException('A coleta dos concorrentes mudou. Revise os dados atualizados antes de aprovar.');
    if(value.error.message==='Atualize as primeiras datas para reservar sete dias de produção e revisão.')throw new BadRequestException(value.error.message);
    if(value.error.code==='40001') throw new ConflictException('O perfil mudou em outra sessão. Atualize a conversa antes de salvar novamente.');
    if(value.error.code==='23505') throw new ConflictException('Este registro já existe.');
    if(['22023','23514','23502','22P02'].includes(value.error.code)) throw new BadRequestException('Dados inválidos. Confira os campos e os requisitos desta ação.');
    throw new ServiceUnavailableException('Não foi possível acessar os dados. Verifique a configuração e as migrações.');
  }
  return value.data as T;
}
@Injectable()
export class IdentityService {
  async snapshot(actor:AuthenticatedActor) {
    const c=actor.client;
    const responses=await Promise.all([
      c.from('workspaces').select('id,name,created_at').order('created_at'),
      c.from('companies').select('*').order('created_at'),
      c.from('workspace_members').select('*').eq('user_id',actor.id),
      c.from('company_members').select('*').eq('user_id',actor.id),
      c.from('platform_staff').select('user_id,role,active').eq('user_id',actor.id).maybeSingle(),
      c.from('profiles').select('id,display_name').eq('id',actor.id).maybeSingle(),
    ]);
    return {user:{id:actor.id,email:actor.email},staff:result(responses[4]!),profile:result(responses[5]!),workspaces:result(responses[0]!),companies:result(responses[1]!),workspaceMemberships:result(responses[2]!),companyMemberships:result(responses[3]!)};
  }
  async workspace(actor:AuthenticatedActor,name:string) {return result(await actor.client.rpc('create_workspace',{p_name:name}));}
  async requireManager(actor:AuthenticatedActor,companyId:string) {
    // Metadata is read through the user's JWT and RLS, then permission checked explicitly.
    const company=result<{workspace_id:string}|null>(await actor.client.from('companies').select('workspace_id').eq('id',companyId).maybeSingle());
    if(!company) throw new ForbiddenException('Empresa indisponível.');
    const [member,owner]=await Promise.all([
      actor.client.from('company_members').select('role').eq('company_id',companyId).eq('user_id',actor.id).maybeSingle(),
      actor.client.from('workspace_members').select('role').eq('workspace_id',company.workspace_id).eq('user_id',actor.id).maybeSingle(),
    ]);
    if(result<{role:string}|null>(member)?.role!=='admin' && result<{role:string}|null>(owner)?.role!=='owner') throw new ForbiddenException('Permissão de administração necessária.');
  }
  async createCompany(actor:AuthenticatedActor,input:{workspaceId:string;name:string;segment:string;city:string;timezone:string}) {
    const membership=result<{role:string}|null>(await actor.client.from('workspace_members').select('role').eq('workspace_id',input.workspaceId).eq('user_id',actor.id).maybeSingle());
    if(membership?.role!=='owner') throw new ForbiddenException('Somente o proprietário pode criar empresas.');
    return result(await actor.client.rpc('create_company',{p_workspace_id:input.workspaceId,p_name:input.name,p_segment:input.segment,p_city:input.city,p_timezone:input.timezone}).single());
  }
  async updateCompany(actor:AuthenticatedActor,id:string,input:{name:string;segment:string;city:string;timezone:string;archived:boolean}) {
    await this.requireManager(actor,id);
    return result(await actor.client.rpc('update_company',{p_company_id:id,p_name:input.name,p_segment:input.segment,p_city:input.city,p_timezone:input.timezone,p_archived:input.archived}).single());
  }
  async team(actor:AuthenticatedActor,id:string) {
    await this.requireManager(actor,id);
    const [members,invitations,audit]=await Promise.all([
      actor.client.rpc('company_roster',{p_company_id:id}),
      actor.client.from('company_invitations').select('id,email,role,expires_at,accepted_at,revoked_at').eq('company_id',id).order('created_at',{ascending:false}).limit(100),
      actor.client.from('audit_logs').select('id,action,created_at,actor_id,details').eq('company_id',id).order('created_at',{ascending:false}).limit(50),
    ]);
    return {members:result(members),invitations:result(invitations),audit:result(audit)};
  }
  async invite(actor:AuthenticatedActor,id:string,email:string,role:CompanyRole) {
    await this.requireManager(actor,id);
    return result(await actor.client.rpc('create_company_invitation',{p_company_id:id,p_email:email,p_role:role}));
  }
  async revoke(actor:AuthenticatedActor,id:string,invitationId:string) {
    await this.requireManager(actor,id);
    result(await actor.client.rpc('revoke_company_invitation',{p_company_id:id,p_invitation_id:invitationId}));
    return {ok:true};
  }
  async changeMember(actor:AuthenticatedActor,id:string,userId:string,role:CompanyRole|null) {
    await this.requireManager(actor,id);
    result(await actor.client.rpc('change_company_member',{p_company_id:id,p_user_id:userId,p_role:role}));
    return {ok:true};
  }
  async accept(actor:AuthenticatedActor,token:string) {return {companyId:result(await actor.client.rpc('accept_company_invitation',{p_token:token}))};}
  async exportMetadata(actor:AuthenticatedActor,id:string) {
    await this.requireManager(actor,id);
    const company=result(await actor.client.from('companies').select('*').eq('id',id).is('archived_at',null).maybeSingle());
    if(!company) throw new ForbiddenException('Empresa indisponível.');
    result(await actor.client.rpc('record_company_export',{p_company_id:id}));
    return {exportedAt:new Date().toISOString(),scope:'company_metadata',company};
  }
}
