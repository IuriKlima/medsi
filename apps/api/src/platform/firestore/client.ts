import {commerceRpc,commerceOperations} from './commerce';
import {journeyRpc,journeyOperations} from './journey';
import {regionalRpc,regionalOperations} from './regional';
import {strategyRpc,strategyOperations} from './strategy';
import {preparationRpc,preparationOperations} from './preparation';
import {contentRpc,contentOperations} from './content';
import {visualRpc,visualOperations} from './visuals';
import {productionRpc,productionOperations} from './production';
import {billingRpc,billingOperations} from './billing';
import {channelRpc,channelOperations} from './channels';
import {crmRpc,crmOperations} from './crm';
import {inboxRpc,inboxOperations} from './inbox';
import {siteRpc,siteOperations} from './sites';
import {advertisingRpc,advertisingOperations} from './advertising';
import {whatsappCloudRpc,whatsappCloudOperations} from './whatsapp-cloud';
import {socialPublicationRpc,socialPublicationOperations} from './social-publication';
import {marketingProfileRpc,marketingProfileOperations} from './marketing-profile';
import {messageCampaignRpc,messageCampaignOperations} from './campaigns';
import {digitalRpc,digitalOperations} from './digital';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {DocumentStore,DocumentTransaction,Row} from './store';
import {firestoreStore} from './store';
import {type FirestoreActor,user,companyAccess,workspaceOwner,fail} from './access';
import {identityRpc,identityOperations} from './identity';
import {onboardingRpc,onboardingOperations} from './onboarding';
import {providerRpc,providerOperations} from './providers';
import {firestoreStorage,recordAttachment} from './storage';
import {databaseError,type DatabaseResult} from '../database-client';
type Filter={column:string;op:string;value:unknown};
const handlers=[{operations:identityOperations,rpc:identityRpc},{operations:onboardingOperations,rpc:onboardingRpc},{operations:providerOperations,rpc:providerRpc},{operations:commerceOperations,rpc:commerceRpc},{operations:journeyOperations.filter(name=>name!=='move_calendar_date'),rpc:journeyRpc},{operations:regionalOperations,rpc:regionalRpc},{operations:strategyOperations,rpc:strategyRpc},{operations:preparationOperations,rpc:preparationRpc},{operations:contentOperations,rpc:contentRpc},{operations:visualOperations,rpc:visualRpc},{operations:productionOperations,rpc:productionRpc},{operations:billingOperations,rpc:billingRpc},{operations:channelOperations,rpc:channelRpc},{operations:crmOperations,rpc:crmRpc},{operations:inboxOperations,rpc:inboxRpc},{operations:siteOperations,rpc:siteRpc},{operations:advertisingOperations,rpc:advertisingRpc},{operations:digitalOperations,rpc:digitalRpc},{operations:messageCampaignOperations,rpc:messageCampaignRpc},{operations:marketingProfileOperations,rpc:marketingProfileRpc},{operations:socialPublicationOperations,rpc:socialPublicationRpc},{operations:whatsappCloudOperations,rpc:whatsappCloudRpc}];
export const firestoreOperations=[...handlers.flatMap(handler=>handler.operations),'record_onboarding_attachment'];
const companyTables:Record<string,string>={company_onboarding:'marketing.read',onboarding_messages:'marketing.read',onboarding_attachments:'marketing.read',company_profile_versions:'marketing.read',company_profile_impacts:'marketing.read',company_subscriptions:'company.read',company_marketing_approvals:'marketing.read',company_strategy_briefs:'marketing.read',company_content_preparations:'marketing.read',company_content_production_jobs:'marketing.read',company_launch_jobs:'marketing.read',company_regional_research:'marketing.read',company_calendar_items:'marketing.read',company_visual_jobs:'marketing.read',company_creatives:'marketing.read',company_final_videos:'marketing.read'};
for(const table of ['company_social_publications','company_calendar_approvals','company_site_jobs','company_calendar_history','company_content_runs','calendar_date_runs','company_sites','company_site_domains','company_site_versions','company_instagram_watches','company_competitor_research','company_ad_connections','company_paid_plans','company_ad_executions','company_ad_plan_seeds'])companyTables[table]='marketing.read';
for(const table of ['contacts','opportunities','stage_history','company_conversations','company_conversation_notes','company_reply_jobs','company_service_settings','company_quick_replies','inbox_handoffs','inbox_dispatches','inbox_auto_jobs','company_contact_channels','company_service_policies'])companyTables[table]='crm.read';
const field=(v:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(v))fail('22023','Invalid field');return v;};
export async function readRows(tx:DocumentTransaction,actor:FirestoreActor,table:string,filters:Filter[]){
 const eq=(key:string)=>filters.find(f=>f.column===key&&f.op==='eq')?.value;
 // Workers may read only explicitly clinic-scoped onboarding materials.
 if(actor.role==='service_role'&&['onboarding_attachments','company_creatives'].includes(table)){
  const company=eq('company_id');if(typeof company!=='string'||!await tx.get('companies',company))fail('42501','Company scope required');return tx.list(table,[{field:'company_id',value:company}]);
 }
 const actorId=user(actor);
 if(['campaign_students','message_campaigns','message_campaign_deliveries','message_campaign_approvals','message_campaign_versions'].includes(table)){const company=eq('company_id');if(typeof company!=='string')fail('42501','Company scope required');await companyAccess(tx,actor,company as string,'marketing.read');await companyAccess(tx,actor,company as string,'crm.read');return tx.list(table,[{field:'company_id',value:company}]);}
 if(table==='company_channels'){const company=eq('company_id');if(typeof company!=='string')fail('42501','Company scope required');let allowed=false;for(const action of ['marketing.read','crm.read'])try{await companyAccess(tx,actor,company as string,action);allowed=true;break;}catch{/* Try the other scoped capability. */}if(!allowed)fail('42501','Access denied');return tx.list(table,[{field:'company_id',value:company}]);}
 if(table==='profiles')return [await tx.get(table,actorId)].filter((r):r is Row=>Boolean(r));
 if(table==='platform_staff')return [await tx.get(table,actorId)].filter((r):r is Row=>Boolean(r));
 if(table==='workspace_members')return tx.list(table,[{field:'user_id',value:actorId}]);
 if(table==='company_members')return tx.list(table,[{field:'user_id',value:actorId}]);
 if(table==='workspaces'){
  const memberships=await tx.list('workspace_members',[{field:'user_id',value:actorId}]);return (await Promise.all(memberships.map(m=>tx.get(table,m.workspace_id)))).filter((r):r is Row=>Boolean(r));
 }
 if(table==='companies'){
  const [workspaces,memberships]=await Promise.all([tx.list('workspace_members',[{field:'user_id',value:actorId}]),tx.list('company_members',[{field:'user_id',value:actorId}])]);
  const companies=new Map<string,Row>();
  for(const m of memberships){const company=await tx.get(table,m.company_id);if(company)companies.set(company.id,company);}
  for(const w of workspaces.filter(w=>w.role==='owner')){await workspaceOwner(tx,actor,w.workspace_id);for(const company of await tx.list(table,[{field:'workspace_id',value:w.workspace_id}]))companies.set(company.id,company);}
  return [...companies.values()].filter(c=>!c.archived_at);
 }
 if(table==='plan_catalog')return tx.list(table);
 if(companyTables[table]){const company=eq('company_id');if(typeof company!=='string')fail('42501','Company scope required');await companyAccess(tx,actor,company as string,companyTables[table]);return tx.list(table,[{field:'company_id',value:company}]);}
 return fail('FIRESTORE_OPERATION_PENDING','Esta consulta ainda aguarda migração para o Firestore.');
}
export class FirestoreQuery implements PromiseLike<DatabaseResult>{
 private filters:Filter[]=[];private fields='*';private orders:{column:string;ascending:boolean}[]=[];private max=1000;private offset=0;private cardinality='many';private count=false;private head=false;
 constructor(private store:DocumentStore,private actor:FirestoreActor,private table:string|null,private procedure?:{name:string;args:Row}){}
 select(fields='*',options?:{count?:string;head?:boolean}){if(fields!=='*')fields.split(',').forEach(f=>field(f.trim()));this.fields=fields;this.count=options?.count==='exact';this.head=options?.head===true;return this;}
 private filter(column:string,op:string,value:unknown){field(column);this.filters.push({column,op,value});return this;}
 eq(column:string,value:unknown){return this.filter(column,'eq',value);}
 neq(column:string,value:unknown){return this.filter(column,'neq',value);}
 is(column:string,value:unknown){return this.filter(column,'is',value);}
 in(column:string,value:unknown[]){if(!Array.isArray(value)||value.length>1000)fail('22023','Invalid filter');return this.filter(column,'in',value);}
 lt(column:string,value:unknown){return this.filter(column,'lt',value);}
 lte(column:string,value:unknown){return this.filter(column,'lte',value);}
 gt(column:string,value:unknown){return this.filter(column,'gt',value);}
 gte(column:string,value:unknown){return this.filter(column,'gte',value);}
 order(column:string,options?:{ascending?:boolean}){this.orders.push({column:field(column),ascending:options?.ascending!==false});return this;}
 limit(n:number){if(!Number.isInteger(n)||n<0||n>1000)fail('22023','Invalid query limit');this.max=n;return this;}
 range(from:number,to:number){if(!Number.isInteger(from)||from<0||!Number.isInteger(to)||to<from)fail('22023','Invalid query range');this.offset=from;return this.limit(to-from+1);}
 single(){this.cardinality='one';return this;}
 maybeSingle(){this.cardinality='optional';return this;}
 private async execute():Promise<DatabaseResult>{
  try{return await this.store.run(async tx=>{
   if(this.procedure){const {name,args}=this.procedure;const handler=handlers.find(handler=>handler.operations.includes(name));const data=handler?await handler.rpc(tx,this.actor,name,args):name==='record_onboarding_attachment'?await recordAttachment(tx,this.actor,args):fail('FIRESTORE_OPERATION_PENDING','Esta operação ainda aguarda migração para o Firestore.');return {data,error:null};}
   let rows=await readRows(tx,this.actor,this.table!,this.filters);
   rows=rows.filter(row=>this.filters.every(f=>{const a=row[f.column],b=f.value;if(f.op==='eq'||f.op==='is')return a===b;if(f.op==='neq')return a!==b;if(f.op==='in')return (b as unknown[]).includes(a);if(f.op==='lt')return a<(b as never);if(f.op==='lte')return a<=(b as never);if(f.op==='gt')return a>(b as never);return a>=(b as never);}));
   const count=this.count?rows.length:undefined;
   for(const order of [...this.orders].reverse())rows.sort((a,b)=>(a[order.column]===b[order.column]?0:a[order.column]<b[order.column]?-1:1)*(order.ascending?1:-1));
   rows=rows.slice(this.offset,this.offset+this.max);
   if(this.fields!=='*'){const fields=this.fields.split(',').map(v=>v.trim());rows=rows.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]])));}
   if(this.cardinality!=='many'&&(rows.length>1||this.cardinality==='one'&&rows.length!==1))fail('PGRST116','Expected one document');
   return {data:this.head?null:this.cardinality==='many'?rows:rows[0]??null,error:null,count};
  });}catch(error){return {data:null,error:databaseError(error)};}
 }
 then<T=DatabaseResult,U=never>(yes?:((value:DatabaseResult)=>T|PromiseLike<T>)|null,no?:((reason:unknown)=>U|PromiseLike<U>)|null):PromiseLike<T|U>{return this.execute().then(yes,no);}
}
export function firestoreClient(role:FirestoreActor['role'],id:string|null,store:DocumentStore=firestoreStore()):SupabaseClient{
 const actor={role,id};return {from:(table:string)=>new FirestoreQuery(store,actor,field(table)),rpc:(name:string,args:Row={})=>new FirestoreQuery(store,actor,null,{name:field(name),args}),storage:{from:(bucket:string)=>firestoreStorage(store,actor,bucket)}} as unknown as SupabaseClient;
}
