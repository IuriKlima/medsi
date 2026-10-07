import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,server,user,text,uuid,hash,workspaceOwner,companyAccess,manager,audit,fail,capabilities,scopedRows} from './access';
const now=()=>new Date().toISOString();
async function currentCustomerCompany(tx:DocumentTransaction,actor:FirestoreActor){
 const actorId=user(actor),profile=await tx.get('profiles',actorId);
 if(!profile)fail('42501','Profile unavailable');
 // Every creation path writes the same profile document, so simultaneous
 // first-clinic transactions retry and observe the winning clinic.
 tx.put('profiles',actorId,{...profile,company_creation_checked_at:now()});
 if((await tx.get('platform_staff',actorId))?.active)return null;
 const workspaces=await scopedRows(tx,'workspace_members',[{field:'user_id',value:actorId},{field:'role',value:'owner'}]);
 const memberships=await scopedRows(tx,'company_members',[{field:'user_id',value:actorId}]);
 const candidates=new Map<string,Row>();
 for(const membership of workspaces.filter(m=>m.role==='owner'))for(const company of await scopedRows(tx,'companies',[{field:'workspace_id',value:membership.workspace_id}]))candidates.set(company.id,company);
 for(const membership of memberships){const company=await tx.get('companies',membership.company_id);if(company)candidates.set(company.id,company);}
 for(const company of [...candidates.values()].filter(c=>!c.archived_at).sort((a,b)=>String(a.created_at??'').localeCompare(String(b.created_at??''))||a.id.localeCompare(b.id))){
  try{await companyAccess(tx,actor,company.id);return company;}
  catch(error){if((error as {code?:string}).code!=='42501')throw error;}
 }
 return null;
}
export async function ensureIdentity(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 server(actor);const uid=text(args.p_uid,1,128),email=z.email().parse(args.p_email),name=text(args.p_name??'Usuário',1,100),key=hash(uid);
 const prior=await tx.get('firebase_identities',key);
 if(prior){if(prior.email!==email)tx.put('firebase_identities',key,{...prior,email});return prior.user_id as string;}
 const id=randomUUID();tx.put('firebase_identities',key,{firebase_uid:uid,user_id:id,email,created_at:now()});tx.put('profiles',id,{id,display_name:name,created_at:now()});return id;
}
export async function createWorkspace(tx:DocumentTransaction,actor:FirestoreActor,name:unknown){
 const actorId=user(actor);if(!await tx.get('profiles',actorId))fail('42501','Profile unavailable');
 const id=randomUUID();tx.put('workspaces',id,{id,name:text(name,2,100),created_at:now()});tx.put('workspace_members',id+'_'+actorId,{workspace_id:id,user_id:actorId,role:'owner',created_at:now()});return id;
}
export async function createCompany(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 const w=uuid(args.p_workspace_id);await workspaceOwner(tx,actor,w);
 const input=z.object({name:z.string().trim().min(2).max(100),segment:z.enum(['clinic','medical_practice','gym','studio','other']),city:z.string().max(100),timezone:z.string().min(1).max(100)}).parse({name:args.p_name,segment:args.p_segment,city:args.p_city,timezone:args.p_timezone});
 try{new Intl.DateTimeFormat('pt-BR',{timeZone:input.timezone});}catch{fail('22023','Invalid timezone');}
 const existing=await currentCustomerCompany(tx,actor);if(existing)return existing;
 const id=randomUUID(),company={id,workspace_id:w,...input,archived_at:null,created_at:now(),updated_at:now()};
 tx.put('companies',id,company);tx.put('company_members',id+'_'+user(actor),{company_id:id,user_id:actor.id,role:'admin',created_at:now()});
 tx.put('company_onboarding',id,{company_id:id,revision:0,facts:{},medical_intake:{version:1,answers:{}},location_confirmed:false,competitors_reviewed:false,references_reviewed:false,profile_version:0,confirmed_revision:null,created_at:now(),updated_at:now()});
 for(const [kind,daily_calls] of [['interpretation',40],['places',10],['strategy',2]] as const)tx.put('onboarding_provider_limits',id+'_'+kind,{company_id:id,kind,daily_calls});
 audit(tx,actor,company,'company.created');return company;
}
export async function beginCompany(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 const actorId=user(actor),request=uuid(args.p_request_id),requestKey=actorId+'_'+request,requested=args.p_workspace_id==null?null:uuid(args.p_workspace_id);
 const prior=await tx.get('company_creation_requests',requestKey);
 if(requested)await workspaceOwner(tx,actor,requested);
 if(prior){if(prior.requested_workspace!==requested)fail('40001','Request changed');await companyAccess(tx,actor,prior.company_id);return {companyId:prior.company_id,workspaceId:prior.workspace_id,resumed:true};}
 const existing=await currentCustomerCompany(tx,actor);
 if(existing){tx.put('company_creation_requests',requestKey,{actor_id:actorId,request_id:request,requested_workspace:requested,workspace_id:existing.workspace_id,company_id:existing.id,created_at:now()});return {companyId:existing.id,workspaceId:existing.workspace_id,resumed:true};}
 // A read of the profile serializes simultaneous first-workspace requests.
 const profile=await tx.get('profiles',actorId);if(!profile)fail('42501','Profile unavailable');
 let w=requested;
 if(!w){const memberships=await scopedRows(tx,'workspace_members',[{field:'user_id',value:actorId},{field:'role',value:'owner'}]);w=memberships.find(m=>m.role==='owner')?.workspace_id??await createWorkspace(tx,actor,'Minhas clínicas');}
 await workspaceOwner(tx,actor,w!);
 const workspace=await tx.get('workspaces',w!);tx.put('workspaces',w!,{...workspace,updated_at:now()});tx.put('profiles',actorId,{...profile,last_workspace_id:w});
 const companies=await scopedRows(tx,'companies',[{field:'workspace_id',value:w},{field:'name',value:'Nova clínica'}]);let company:Row|null=null;
 for(const c of companies){if(c.archived_at||c.name!=='Nova clínica')continue;const state=await tx.get('company_onboarding',c.id);if(state?.revision===0){company=c;break;}}
 company??=await createCompany(tx,actor,{p_workspace_id:w,p_name:'Nova clínica',p_segment:'clinic',p_city:'',p_timezone:'America/Sao_Paulo'});
 tx.put('company_creation_requests',requestKey,{actor_id:actorId,request_id:request,requested_workspace:requested,workspace_id:w,company_id:company.id,created_at:now()});return {companyId:company.id,workspaceId:w,resumed:false};
}
export async function identityRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 switch(name){
  case 'ensure_firebase_identity_server':return ensureIdentity(tx,actor,args);
  case 'create_workspace':return createWorkspace(tx,actor,args.p_name);
  case 'create_company':return createCompany(tx,actor,args);
  case 'begin_company_onboarding':return beginCompany(tx,actor,args);
  case 'company_capabilities':return capabilities(tx,actor,uuid(args.p_company_id));
  case 'update_company':{
   const access=await manager(tx,actor,uuid(args.p_company_id));
   const values=z.object({name:z.string().trim().min(2).max(100),segment:z.enum(['clinic','medical_practice','gym','studio','other']),city:z.string().max(100),timezone:z.string().max(100),archived:z.boolean()}).parse({name:args.p_name,segment:args.p_segment,city:args.p_city,timezone:args.p_timezone,archived:args.p_archived});
   try{new Intl.DateTimeFormat('pt-BR',{timeZone:values.timezone});}catch{fail('22023','Invalid timezone');}
   const {archived,...fields}=values,company:Row={...access.company,...fields,archived_at:archived?now():null,updated_at:now()};tx.put('companies',company.id,company);audit(tx,actor,company,'company.updated');return company;
  }
  case 'record_company_export':{const {company}=await manager(tx,actor,uuid(args.p_company_id));audit(tx,actor,company,'company.exported');return null;}
  default:return fail('FIRESTORE_OPERATION_PENDING','Esta operação ainda aguarda migração para o Firestore. Nenhuma alteração foi executada.');
 }
}
export const identityOperations=['ensure_firebase_identity_server','create_workspace','create_company','begin_company_onboarding','company_capabilities','update_company','record_company_export'];
