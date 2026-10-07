import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {type FirestoreActor,audit,fail,manager,text,user,uuid,workspaceOwner} from './access';
import type {DocumentTransaction,Row} from './store';

const roles=['admin','marketing','approver','attendant','reader','support'];
const delegable=['crm.read','crm.write','content.approve','strategy.approve','site.approve','ads.approve'];
const now=()=>new Date().toISOString();
const tokenHash=(token:string)=>createHash('sha256').update(token,'utf8').digest('hex');
const memberKey=(company:string,actor:string)=>company+'_'+actor;
const grantKey=(company:string,actor:string,action:string)=>memberKey(company,actor)+'_'+action;
const role=(value:unknown)=>{if(typeof value!=='string'||!roles.includes(value))fail('22023','Invalid role');return value as string;};

/** Every mutation reads/writes the company so membership and invitation changes
 * share SQL's company lock boundary, including concurrent last-admin changes. */
function lockCompany(tx:DocumentTransaction,company:Row){tx.put('companies',company.id,company);}

async function roster(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 const {company}=await manager(tx,actor,uuid(args.p_company_id));
 const members=await tx.list('company_members',[{field:'company_id',value:company.id}]);
 const result:Row[]=[];
 for(const member of members){const profile=await tx.get('profiles',member.user_id);if(profile)result.push({user_id:member.user_id,role:member.role,display_name:profile.display_name??''});}
 return result;
}
async function invite(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 const {company}=await manager(tx,actor,uuid(args.p_company_id)),invitedRole=role(args.p_role);
 const email=text(args.p_email,3,254).toLowerCase();if(email.indexOf('@')<1)fail('22023','Invalid invitation');
 lockCompany(tx,company);
 const created=now();
 for(const invitation of await tx.list('company_invitations',[{field:'company_id',value:company.id},{field:'email',value:email}])){
  if(!invitation.accepted_at&&!invitation.revoked_at)tx.put('company_invitations',invitation.id,{...invitation,revoked_at:created});
 }
 const id=randomUUID(),token=randomBytes(32).toString('hex'),expires_at=new Date(Date.parse(created)+7*86400000).toISOString();
 tx.put('company_invitations',id,{id,company_id:company.id,email,role:invitedRole,token_hash:tokenHash(token),invited_by:user(actor),expires_at,accepted_at:null,revoked_at:null,created_at:created});
 audit(tx,actor,company,'member.invited',{invitationId:id,role:invitedRole});
 return {id,token,expires_at};
}
async function accept(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 const actorId=user(actor),token=text(args.p_token,64,64);if(!/^[a-f0-9]{64}$/.test(token))fail('22023','Invalid invitation token');
 // Only the server identity bridge writes these records, after Firebase verifies
 // the session and the current user's email. Never trust a caller-supplied email.
 const identities=await tx.list('firebase_identities',[{field:'user_id',value:actorId}]);
 const identity=identities.length===1?identities[0]:null;
 const email=typeof identity?.email==='string'?identity.email.toLowerCase():null;
 if(!email||!await tx.get('profiles',actorId))fail('42501','Verified email required');
 const invitations=await tx.list('company_invitations',[{field:'token_hash',value:tokenHash(token)}]);
 const invitation=invitations.length===1?invitations[0]:null;
 if(!invitation||invitation.email!==email||invitation.revoked_at||invitation.accepted_at||!Number.isFinite(Date.parse(invitation.expires_at))||Date.parse(invitation.expires_at)<=Date.now())fail('42501','Invitation unavailable');
 const company=await tx.get('companies',invitation!.company_id);
 if(!company||company.archived_at)fail('42501','Company unavailable');
 const [issuer,issuerWorkspace]=await Promise.all([tx.get('company_members',memberKey(company!.id,invitation!.invited_by)),tx.get('workspace_members',memberKey(company!.workspace_id,invitation!.invited_by))]);
 if(issuer?.role!=='admin'&&issuerWorkspace?.role!=='owner')fail('42501','Invitation unavailable');
 if(await tx.get('company_members',memberKey(company!.id,actorId)))fail('23505','Already a member');
 const invitedRole=role(invitation!.role),workspaceKey=memberKey(company!.workspace_id,actorId),workspaceMembership=await tx.get('workspace_members',workspaceKey),created=now();
 lockCompany(tx,company!);
 if(!workspaceMembership)tx.put('workspace_members',workspaceKey,{workspace_id:company!.workspace_id,user_id:actorId,role:'member',created_at:created});
 tx.put('company_members',memberKey(company!.id,actorId),{company_id:company!.id,user_id:actorId,role:invitedRole,created_at:created});
 tx.put('company_invitations',invitation!.id,{...invitation,accepted_at:created});
 audit(tx,actor,company!,'member.joined',{invitationId:invitation!.id,role:invitedRole});
 return company!.id;
}
async function revoke(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 const {company}=await manager(tx,actor,uuid(args.p_company_id)),id=uuid(args.p_invitation_id),invitation=await tx.get('company_invitations',id);
 if(!invitation||invitation.company_id!==company.id||invitation.accepted_at)fail('22023','Invitation unavailable');
 lockCompany(tx,company);tx.put('company_invitations',id,{...invitation,revoked_at:now()});audit(tx,actor,company,'invitation.revoked',{invitationId:id});return null;
}
async function changeMember(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 const {company}=await manager(tx,actor,uuid(args.p_company_id)),actorId=uuid(args.p_user_id),nextRole=args.p_role===null?null:role(args.p_role),key=memberKey(company.id,actorId),member=await tx.get('company_members',key);
 if(!member)fail('22023','Member unavailable');
 if(member!.role==='admin'&&nextRole!=='admin'&&(await tx.list('company_members',[{field:'company_id',value:company.id},{field:'role',value:'admin'}])).length<=1)fail('22023','Keep at least one administrator');
 lockCompany(tx,company);
 if(nextRole===null){
  tx.remove('company_members',key);
  // SQL's FK ON DELETE CASCADE prevents a later rejoin reviving old grants.
  for(const grant of await tx.list('company_permission_grants',[{field:'company_id',value:company.id},{field:'user_id',value:actorId}]))tx.remove('company_permission_grants',grantKey(company.id,actorId,grant.action));
  const revoked=now();for(const invitation of await tx.list('company_invitations',[{field:'company_id',value:company.id},{field:'invited_by',value:actorId}]))if(!invitation.accepted_at&&!invitation.revoked_at)tx.put('company_invitations',invitation.id,{...invitation,revoked_at:revoked});
 }else tx.put('company_members',key,{...member,role:nextRole});
 audit(tx,actor,company,nextRole===null?'member.removed':'member.role_changed',{userId:actorId,previousRole:member!.role,role:nextRole});return null;
}
async function permission(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 const companyId=uuid(args.p_company_id),company=await tx.get('companies',companyId);if(!company||company.archived_at)fail('42501','Only owner delegates permissions');
 await workspaceOwner(tx,actor,company!.workspace_id);
 const actorId=uuid(args.p_user_id);if(!await tx.get('company_members',memberKey(companyId,actorId)))fail('22023','Member unavailable');
 const action=text(args.p_action,1,100),enabled=args.p_enabled,budget=args.p_budget_limit_cents??null,expiry=args.p_expires_at??null;
 if(typeof enabled!=='boolean'||!delegable.includes(action))fail('22023','Invalid delegation');
 if(expiry!==null&&(typeof expiry!=='string'||!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now()))fail('22023','Invalid expiry');
 if(budget!==null&&(!Number.isSafeInteger(budget)||budget<0||action!=='ads.approve'))fail('22023','Invalid budget limit');
 if(enabled&&action==='ads.approve'&&budget===null)fail('22023','Budget limit required');
 lockCompany(tx,company!);
 const key=grantKey(companyId,actorId,action);
 if(enabled)tx.put('company_permission_grants',key,{company_id:companyId,user_id:actorId,action,budget_limit_cents:budget,expires_at:expiry,granted_by:user(actor),created_at:now()});
 else tx.remove('company_permission_grants',key);
 audit(tx,actor,company!,'permission.changed',{userId:actorId,permission:action,enabled,budgetLimitCents:budget});return null;
}
export const teamOperations=['company_roster','create_company_invitation','accept_company_invitation','revoke_company_invitation','change_company_member','set_company_permission'];
export async function teamRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 switch(name){
  case 'company_roster':return roster(tx,actor,args);
  case 'create_company_invitation':return invite(tx,actor,args);
  case 'accept_company_invitation':return accept(tx,actor,args);
  case 'revoke_company_invitation':return revoke(tx,actor,args);
  case 'change_company_member':return changeMember(tx,actor,args);
  case 'set_company_permission':return permission(tx,actor,args);
  default:return fail('FIRESTORE_OPERATION_PENDING','Esta operação ainda aguarda migração para o Firestore.');
 }
}
