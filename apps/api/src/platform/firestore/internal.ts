import {randomUUID} from 'node:crypto';
import {fail,text,user,uuid,type FirestoreActor} from './access';
import type {DocumentTransaction,Row} from './store';

export const internalOperations=['company_assignment_roster','set_company_assignment','internal_portfolio','start_internal_access','end_internal_access','internal_company_context','internal_onboarding_context','record_followup_meeting'];
type StaffRole='platform_admin'|'support';
async function staffRole(tx:DocumentTransaction,actor:FirestoreActor):Promise<StaffRole>{
 const staff=await tx.get('platform_staff',user(actor));
 if(staff?.active!==true||!['platform_admin','support'].includes(staff.role))return fail('42501','Staff access required');
 return staff.role as StaffRole;
}
async function assigned(tx:DocumentTransaction,actor:FirestoreActor,companyId:string,role:StaffRole){
 return role==='platform_admin'||(await tx.list('company_assignments',[{field:'company_id',value:companyId},{field:'staff_id',value:actor.id}])).length>0;
}
function platformAudit(tx:DocumentTransaction,actor:FirestoreActor,companyId:string,action:string,sessionId:string|null=null,details:Row={}){
 const id=randomUUID();tx.put('platform_audit',id,{id,actor_id:actor.id,company_id:companyId,session_id:sessionId,action,details,created_at:new Date().toISOString()});
}
/** Explicit internal reads only. This does not grant ordinary company membership or write access. */
export async function requireInternalSession(tx:DocumentTransaction,actor:FirestoreActor,sessionId:string,companyId?:string):Promise<{session:Row;company:Row;role:StaffRole}>{
 const actorId=user(actor),role=await staffRole(tx,actor),session=await tx.get('internal_access_sessions',uuid(sessionId));
 if(!session||session.operator_id!==actorId||session.ended_at||!(Date.parse(session.expires_at)>Date.now())||(companyId!==undefined&&session.company_id!==uuid(companyId)))return fail('42501','Internal session unavailable');
 const company=await tx.get('companies',session.company_id);
 if(!company||!await assigned(tx,actor,company.id,role))return fail('42501','Internal session unavailable');
 return {session,company,role};
}
const newest=(a:Row,b:Row)=>String(b.created_at??'').localeCompare(String(a.created_at??''));
async function companyContext(tx:DocumentTransaction,actor:FirestoreActor,sessionId:string){
 const {session,company,role}=await requireInternalSession(tx,actor,sessionId);
 const [subscription,members,history]=await Promise.all([tx.get('company_subscriptions',company.id),tx.list('company_members',[{field:'company_id',value:company.id}]),tx.list('audit_logs',[{field:'company_id',value:company.id}],{orderBy:'created_at',descending:true,limit:30})]);
 const team:Row[]=[];
 for(const member of members){const profile=await tx.get('profiles',member.user_id);if(profile)team.push({display_name:profile.display_name??null,role:member.role});}
 team.sort((a,b)=>String(a.display_name).localeCompare(String(b.display_name)));
 return {session,company,subscription:subscription?{planId:subscription.plan_id??null,status:subscription.status,weeklySupport:subscription.weekly_support??false,periodEnd:subscription.current_period_end??null}:{status:'draft'},team,history:history.sort(newest).slice(0,30).map(h=>({action:h.action,actor_id:h.actor_id,created_at:h.created_at})),operatorRole:role,scope:'read_only'};
}
async function onboardingContext(tx:DocumentTransaction,actor:FirestoreActor,sessionId:string){
 const {company}=await requireInternalSession(tx,actor,sessionId);if(company.archived_at)fail('42501','Archived company');
 const [profile,versions,meetings]=await Promise.all([tx.get('company_onboarding',company.id),tx.list('company_profile_versions',[{field:'company_id',value:company.id}]),tx.list('company_followup_meetings',[{field:'company_id',value:company.id}])]);
 return {companyId:company.id,profile,confirmedProfile:versions.sort((a,b)=>Number(b.version)-Number(a.version))[0]??null,meetings:meetings.sort(newest)};
}
function meetingDate(value:unknown){
 const date=text(value,10,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)fail('22023','Invalid meeting date');return date;
}
export async function internalRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 const actorId=user(actor);
 if(name==='end_internal_access'){
  const id=uuid(args.p_session_id),session=await tx.get('internal_access_sessions',id);
  // Ending one's own session remains possible after staff access was revoked.
  if(session&&session.operator_id===actorId&&!session.ended_at){tx.put('internal_access_sessions',id,{...session,ended_at:new Date().toISOString()});platformAudit(tx,actor,session.company_id,'internal_access.ended',id);}
  return null;
 }
 if(name==='internal_company_context')return companyContext(tx,actor,uuid(args.p_session_id));
 if(name==='internal_onboarding_context')return onboardingContext(tx,actor,uuid(args.p_session_id));
 if(name==='record_followup_meeting'){
  const sessionId=uuid(args.p_session_id),{company}=await requireInternalSession(tx,actor,sessionId);if(company.archived_at)fail('42501','Archived company');
  const requestId=uuid(args.p_request_id),payload={company_id:company.id,operator_id:actorId,request_id:requestId,meeting_date:meetingDate(args.p_date),participants:text(args.p_participants,2,1000),decisions:text(args.p_decisions,2,6000),next_actions:text(args.p_next_actions,2,6000)};
  const key=actorId+'_'+requestId,existing=await tx.get('company_followup_meetings',key);
  if(existing){if(Object.entries(payload).some(([key,value])=>existing[key]!==value))fail('22023','Meeting request conflict');return existing;}
  const meeting={id:randomUUID(),...payload,session_id:sessionId,created_at:new Date().toISOString()};tx.put('company_followup_meetings',key,meeting);platformAudit(tx,actor,company.id,'followup.meeting_recorded',sessionId,{meetingId:meeting.id});return meeting;
 }
 const role=await staffRole(tx,actor);
 if(name==='internal_portfolio'){
  const search=args.p_search===undefined?'':text(args.p_search,0,100),offset=args.p_offset??0;
  if(!Number.isInteger(offset)||offset<0||offset>100000)fail('22023','Invalid pagination');
  const matches=(company:Row)=>String(company.name).toLocaleLowerCase().includes(search.toLocaleLowerCase()),companies:Row[]=[];
  if(role==='support'){
   const assignments=await tx.list('company_assignments',[{field:'staff_id',value:actorId}]);
   for(const companyId of new Set(assignments.map(a=>a.company_id))){const company=await tx.get('companies',companyId);if(company&&matches(company))companies.push(company);}
  }else{
   // Exact legacy totals and name search require scanning companies; each query is bounded.
   let afterId:string|undefined;
   for(;;){const page=await tx.list('companies',[],{limit:500,...(afterId?{afterId}:{})});companies.push(...page.filter(matches));if(page.length<500)break;afterId=page[page.length-1]!.id;}
  }
  companies.sort((a,b)=>newest(a,b)||String(a.id).localeCompare(String(b.id)));
  const rows:Row[]=[];
  for(const c of companies.slice(offset,offset+30)){const workspace=await tx.get('workspaces',c.workspace_id);if(!workspace)continue;const sub=await tx.get('company_subscriptions',c.id);rows.push({id:c.id,name:c.name,city:c.city??null,segment:c.segment??null,workspace_id:c.workspace_id,archived_at:c.archived_at??null,created_at:c.created_at,workspace_name:workspace.name??null,subscription_status:sub?.status??'draft',plan_id:sub?.plan_id??null,weekly_support:sub?.weekly_support??false});}
  return {role,companies:rows,total:companies.length,offset,pageSize:30};
 }
 const companyId=uuid(args.p_company_id);
 if(name==='company_assignment_roster'){
  if(role!=='platform_admin')fail('42501','Platform admin required');
  const [staff,assignments]=await Promise.all([tx.list('platform_staff',[{field:'active',value:true},{field:'role',value:'support'}]),tx.list('company_assignments',[{field:'company_id',value:companyId}])]);
  const rows:Row[]=[];for(const s of staff){const profile=await tx.get('profiles',s.user_id);if(profile)rows.push({user_id:s.user_id,display_name:profile.display_name??null,assigned:assignments.some(a=>a.staff_id===s.user_id)});}
  return rows.sort((a,b)=>String(a.display_name).localeCompare(String(b.display_name)));
 }
 if(name==='set_company_assignment'){
  if(role!=='platform_admin')fail('42501','Platform admin required');
  const staffId=uuid(args.p_staff_id),company=await tx.get('companies',companyId),staff=await tx.get('platform_staff',staffId);
  if(!company)fail('22023','Company unavailable');if(staff?.active!==true||staff.role!=='support')fail('22023','Support member unavailable');if(typeof args.p_assigned!=='boolean')fail('22023','Invalid assignment');
  const key=companyId+'_'+staffId,existing=await tx.get('company_assignments',key);
  if(args.p_assigned){if(!existing)tx.put('company_assignments',key,{company_id:companyId,staff_id:staffId,assigned_by:actorId,created_at:new Date().toISOString()});}
  else {tx.remove('company_assignments',key);for(const session of await tx.list('internal_access_sessions',[{field:'company_id',value:companyId},{field:'operator_id',value:staffId}]))if(!session.ended_at)tx.put('internal_access_sessions',session.id,{...session,ended_at:new Date().toISOString()});}
  platformAudit(tx,actor,companyId,'assignment.changed',null,{staffId,assigned:args.p_assigned});return null;
 }
 if(name==='start_internal_access'){
  if(!await tx.get('companies',companyId)||!await assigned(tx,actor,companyId,role))fail('42501','Access denied');
  const reason=text(args.p_reason,8,500),id=randomUUID(),now=Date.now();
  tx.put('internal_access_sessions',id,{id,company_id:companyId,operator_id:actorId,reason,started_at:new Date(now).toISOString(),expires_at:new Date(now+30*60*1000).toISOString(),ended_at:null});platformAudit(tx,actor,companyId,'internal_access.started',id);return id;
 }
 return fail('FIRESTORE_OPERATION_PENDING','Internal operation unavailable');
}
