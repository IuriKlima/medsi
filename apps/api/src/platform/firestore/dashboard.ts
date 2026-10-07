import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {importSchema} from '@askadia/contracts';
import {audit,companyAccess,fail,hash,text,user,uuid,type FirestoreActor} from './access';
import {requireInternalSession} from './internal';
import {scopedRows,type DocumentTransaction,type Row} from './store';
import type {DashboardRaw} from '../../dashboard/engine';

export const dashboardOperations=['dashboard_read','dashboard_import','dashboard_set_keywords','dashboard_record_export'];
const scope=(companyId:string)=>[{field:'company_id',value:companyId}];
const now=()=>new Date().toISOString();
const keywordSchema=z.object({services:z.array(z.enum(['musculação','pilates','funcional','spinning','dança','personal','24 horas','totalpass','wellhub'])).max(20),neighborhood:z.string().max(100)});

/** Internal sessions authorize these dashboard reads only, never companyAccess or writes. */
async function access(tx:DocumentTransaction,actor:FirestoreActor,companyId:string,internalSession:unknown){
 const actorId=user(actor),company=await tx.get('companies',companyId);
 if(!company||company.archived_at) return fail('42501','Dashboard access denied');
 let memberAccess:Awaited<ReturnType<typeof companyAccess>>|null=null;
 try{memberAccess=await companyAccess(tx,actor,companyId);}catch(error){if((error as Row).code!=='42501')throw error;}
 const owner=memberAccess?.owner===true,actions=memberAccess?.actions??[];
 const permission=memberAccess?.member?(await tx.list('dashboard_permissions',[...scope(companyId),{field:'user_id',value:actorId}],{limit:1}))[0]:null;
 const permissions={digital:owner||actions.includes('marketing.read'),finance:owner||permission?.financial_details===true,writeDigital:owner||actions.includes('marketing.write'),writeFinance:owner||(permission?.financial_details===true&&permission.manage_costs===true)};
 // A supplied session is relevant only where it supplies otherwise absent read access.
 if(internalSession!==null&&internalSession!==undefined&&(!permissions.digital||!permissions.finance)){
  try{const internal=await requireInternalSession(tx,actor,uuid(internalSession),companyId);permissions.digital=true;if(internal.role==='platform_admin')permissions.finance=true;}catch(error){if((error as Row).code!=='42501')throw error;}
 }
 return {company,permissions,crm:owner||(memberAccess?.member?.role!=='attendant'&&actions.includes('crm.read'))};
}
async function read(tx:DocumentTransaction,actor:FirestoreActor,companyId:string,internalSession:unknown):Promise<DashboardRaw>{
 const allowed=await access(tx,actor,companyId,internalSession),{company,permissions}=allowed;
 if(!permissions.digital&&!permissions.finance)return fail('42501','Dashboard access denied');
 const [facts,imports,opportunities,keywords]=await Promise.all([scopedRows(tx,'dashboard_facts',scope(companyId),10001),scopedRows(tx,'dashboard_imports',scope(companyId),10001),allowed.crm?scopedRows(tx,'opportunities',scope(companyId),10001):[],permissions.digital?tx.get('dashboard_keyword_profiles',companyId):null]);
 if(facts.length>10000||imports.length>10000||opportunities.length>10000)fail('54000','Dashboard aggregation requires pagination above 10000 records');
 const visible=(row:Row)=>row.domain==='finance'?permissions.finance:permissions.digital;
 const coverage=new Map<string,Row>();
 for(const row of imports.filter(visible).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))){const key=hash([row.source,row.domain,row.coverage_start,row.coverage_end]);if(!coverage.has(key))coverage.set(key,row);}
 return {company:{id:company.id,name:company.name,city:company.city,segment:company.segment,timezone:company.timezone},keywordProfile:keywords?{services:keywords.services,neighborhood:keywords.neighborhood,confirmedAt:keywords.confirmed_at,revision:keywords.revision}:null,
  facts:facts.filter(visible).map(row=>({source:row.source,revision:row.revision,payload:row.payload,updatedAt:row.updated_at})),
  coverage:[...coverage.values()].map(row=>({source:row.source,domain:row.domain,start:row.coverage_start,end:row.coverage_end,complete:row.complete,updatedAt:row.created_at,note:row.note})),
  crm:allowed.crm?opportunities.map(row=>({id:row.id,contactId:row.contact_id,createdAt:row.created_at,stage:row.stage,source:row.original_source})):null,permissions};
}
export async function dashboardRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 if(!dashboardOperations.includes(name))return fail('FIRESTORE_OPERATION_PENDING','Unknown dashboard operation');
 const companyId=uuid(args.p_company_id);
 if(name==='dashboard_read')return read(tx,actor,companyId,args.p_internal_session);
 const {company,permissions}=await access(tx,actor,companyId,name==='dashboard_record_export'?args.p_internal_session:null);
 if(name==='dashboard_import'){
  if(args.p_document?.domain==='finance'?!permissions.writeFinance:!permissions.writeDigital)fail('42501','Dashboard import access denied');
  if(Buffer.byteLength(JSON.stringify(args.p_document??null),'utf8')>2000000)fail('22023','Invalid import size');
  const parsed=importSchema.safeParse(args.p_document);if(!parsed.success)return fail('22023','Invalid dashboard import');
  const document=parsed.data,checksum=hash(document),batchKey=hash([companyId,checksum]),existingBatch=await tx.get('dashboard_imports',batchKey);
  if(existingBatch)return {id:existingBatch.id,duplicate:true,written:0};
  const batchId=randomUUID(),createdAt=now();let written=0;
  tx.put('dashboard_imports',batchKey,{id:batchId,company_id:companyId,source:document.source,domain:document.domain,checksum,actor_id:actor.id,coverage_start:document.coverageStart,coverage_end:document.coverageEnd,complete:document.coverage==='complete',note:document.note,created_at:createdAt});
  for(const record of document.records){
   const key=hash([companyId,document.source,record.kind,record.id]),prior=await tx.get('dashboard_facts',key);
   if(prior&&hash(prior.payload)===hash(record))continue;
   const revision=(prior?.revision??0)+1;
   const row={company_id:companyId,source:document.source,kind:record.kind,external_id:record.id,domain:document.domain,occurred_on:record.date,payload:record,revision,import_id:batchId,updated_at:createdAt};
   tx.put('dashboard_facts',key,row);
   tx.put('dashboard_fact_revisions',key+'_'+revision,{company_id:companyId,source:document.source,kind:record.kind,external_id:record.id,revision,payload:record,import_id:batchId,created_at:createdAt});written++;
  }
  audit(tx,actor,company,'dashboard.imported',{importId:batchId,written,domain:document.domain,source:document.source});return {id:batchId,duplicate:false,written};
 }
 if(name==='dashboard_set_keywords'){
  if(!permissions.writeDigital)fail('42501','Marketing permission required');
  const parsed=keywordSchema.safeParse({services:args.p_services,neighborhood:args.p_neighborhood??''});if(!parsed.success)return fail('22023','Invalid confirmed services');
  const prior=await tx.get('dashboard_keyword_profiles',companyId),{services,neighborhood}=parsed.data;
  tx.put('dashboard_keyword_profiles',companyId,{company_id:companyId,services,neighborhood,confirmed_by:actor.id,confirmed_at:now(),revision:(prior?.revision??0)+1});audit(tx,actor,company,'dashboard.keywords_confirmed',{services,neighborhood});return null;
 }
 if(!permissions.finance)fail('42501','Financial export permission required');
 if(args.p_filters?.companyId!==companyId||args.p_snapshot?.company?.id!==companyId)fail('22023','Export company mismatch');
 if(Buffer.byteLength(JSON.stringify(args.p_snapshot),'utf8')>2000000)fail('22023','Export too large');
 const id=randomUUID(),method=text(args.p_method,1,500),sessionId=args.p_internal_session===undefined||args.p_internal_session===null?null:uuid(args.p_internal_session);
 // Session attribution is evidence: even an owner cannot attach another operator's session.
 if(sessionId)await requireInternalSession(tx,actor,sessionId,companyId);
 tx.put('dashboard_exports',id,{id,company_id:companyId,actor_id:actor.id,internal_session_id:sessionId,filters:args.p_filters,method_version:method,snapshot:args.p_snapshot,created_at:now()});audit(tx,actor,company,'dashboard.exported',{exportId:id,method});return id;
}
