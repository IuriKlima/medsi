import {subscriptionEntitlement} from './billing';
import {createHash,randomUUID} from 'node:crypto';
import type {DocumentTransaction,Row} from './store';
export type FirestoreActor={role:'authenticated'|'service_role'|'anon';id:string|null};
export const fail=(code:string,message:string):never=>{throw Object.assign(new Error(message),{code});};
export const text=(value:unknown,min=1,max=500)=>{if(typeof value!=='string'||value.trim().length<min||value.length>max)fail('22023','Invalid field');return (value as string).trim();};
export const uuid=(value:unknown)=>{const v=text(value,36,36);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))fail('22023','Invalid identifier');return v;};
export const hash=(value:unknown)=>createHash('sha256').update(stable(value)).digest('hex');
function stable(value:unknown):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(stable).join(',')+']';return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';}
export function user(actor:FirestoreActor){if(actor.role!=='authenticated'||!actor.id)fail('42501','Access denied');return actor.id!;}
export function server(actor:FirestoreActor){if(actor.role!=='service_role')fail('42501','Access denied');}
export const actions=['company.read','marketing.read','marketing.write','crm.read','crm.write','billing.manage','content.approve','strategy.approve','site.approve','ads.approve'];
const roleActions:Record<string,string[]>={admin:actions.filter(a=>!['billing.manage','ads.approve'].includes(a)),marketing:['company.read','marketing.read','marketing.write'],attendant:['company.read','crm.read','crm.write'],reader:['company.read','marketing.read'],support:['company.read','marketing.read'],approver:['company.read','marketing.read','content.approve','strategy.approve','site.approve']};
export async function companyAccess(tx:DocumentTransaction,actor:FirestoreActor,id:string,action='company.read'){
 const actorId=user(actor),company=await tx.get('companies',uuid(id));
 if(!company||company.archived_at)fail('42501','Access denied');
 const [owner,member]=await Promise.all([tx.get('workspace_members',company!.workspace_id+'_'+actorId),tx.get('company_members',id+'_'+actorId)]);
 let allowed=owner?.role==='owner'?[...actions]:[...(roleActions[String(member?.role)]??[])];
 // Revoked company members cannot retain a delegated grant.
 if(member){const grants=await tx.list('company_permission_grants',[{field:'company_id',value:id}]);allowed=[...new Set([...allowed,...grants.filter(g=>g.user_id===actorId&&(!g.expires_at||Date.parse(g.expires_at)>Date.now())).map(g=>String(g.action))])];}
 if(!allowed.includes(action))fail('42501','Access denied');
 return {company:company!,actions:allowed,owner:owner?.role==='owner',member};
}
export async function manager(tx:DocumentTransaction,actor:FirestoreActor,id:string){const access=await companyAccess(tx,actor,id);if(!access.owner&&access.member?.role!=='admin')fail('42501','Manager required');return access;}
export async function workspaceOwner(tx:DocumentTransaction,actor:FirestoreActor,id:string){const member=await tx.get('workspace_members',uuid(id)+'_'+user(actor));if(member?.role!=='owner')fail('42501','Workspace owner required');}
export function audit(tx:DocumentTransaction,actor:FirestoreActor,company:Row,action:string,details:Row={}){const id=randomUUID();tx.put('audit_logs',id,{id,workspace_id:company.workspace_id,company_id:company.id,actor_id:actor.id,action,details,created_at:new Date().toISOString()});}

export async function capabilities(tx:DocumentTransaction,actor:FirestoreActor,id:string){
 const access=await companyAccess(tx,actor,id),subscription=await tx.get('company_subscriptions',id),plan=subscription?.plan_id?await tx.get('plan_catalog',subscription.plan_id):null;
 const enabled=subscriptionEntitlement(subscription).live;
 return {companyId:id,actions:access.actions,subscription:{planId:subscription?.plan_id??null,status:subscription?.status??'draft',weeklySupport:subscription?.weekly_support??false,periodEnd:subscription?.current_period_end??null},features:enabled?(plan?.features??[]):[],quotas:plan?.quotas??{},billingEnabled:false};
}
