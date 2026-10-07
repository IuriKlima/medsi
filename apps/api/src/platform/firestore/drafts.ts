import {randomUUID} from 'node:crypto';
import {draftImportSchema} from '@askadia/contracts';
import {audit,companyAccess,fail,hash,uuid,type FirestoreActor} from './access';
import type {DocumentTransaction,Row} from './store';

export const draftOperations=['import_local_drafts'];
const now=()=>new Date().toISOString();
export async function draftRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 if(name!=='import_local_drafts')return fail('FIRESTORE_OPERATION_PENDING','Unknown draft operation');
 const companyId=uuid(args.p_company_id),access=await companyAccess(tx,actor,companyId);
 if(Buffer.byteLength(JSON.stringify(args.p_payload??null),'utf8')>262144)fail('22023','Invalid import size');
 const parsed=draftImportSchema.safeParse(args.p_payload);if(!parsed.success)return fail('22023','Invalid local draft import');
 const payload=parsed.data;
 if((payload.contacts.length||payload.opportunities.length)&&!access.actions.includes('crm.write'))fail('42501','CRM permission required');
 if(payload.contents.length&&!access.actions.includes('marketing.write'))fail('42501','Marketing permission required');
 const counts={contacts:0,opportunities:0,contents:0,skipped:0};
 const mappingKey=(type:string,id:string)=>hash([companyId,payload.sourceCompanyId,type,id]);
 function remember(type:string,sourceId:string,recordId:string){tx.put('local_draft_imports',mappingKey(type,sourceId),{company_id:companyId,source_company_id:payload.sourceCompanyId,object_type:type,source_id:sourceId,record_id:recordId,imported_by:actor.id,imported_at:now()});}
 for(const item of payload.contacts){
  if(await tx.get('local_draft_imports',mappingKey('contact',item.id))){counts.skipped++;continue;}
  const phone=item.phone.trim()||null;
  if(phone&&!/^\+[1-9][0-9]{9,14}$/.test(phone))fail('22023','Invalid phone');
  const existing=phone?(await tx.list('contacts',[{field:'company_id',value:companyId},{field:'phone_e164',value:phone}]))[0]:null;
  const recordId=existing?.id??randomUUID();
  if(existing)counts.skipped++;else{
   tx.put('contacts',recordId,{id:recordId,company_id:companyId,name:item.name.trim(),phone_e164:phone,email:item.email.trim()||null,consent:false,opted_out:false,created_at:now()});counts.contacts++;
  }
  remember('contact',item.id,recordId);
 }
 for(const item of payload.opportunities){
  if(await tx.get('local_draft_imports',mappingKey('opportunity',item.id))){counts.skipped++;continue;}
  const mapping=await tx.get('local_draft_imports',mappingKey('contact',item.contactId)),contact=mapping?await tx.get('contacts',mapping.record_id):null;
  if(!contact||contact.company_id!==companyId)fail('22023','Contact not imported to this company');
  const id=randomUUID(),createdAt=now(),historyId=randomUUID();
  tx.put('opportunities',id,{id,company_id:companyId,contact_id:contact!.id,interest:item.interest,original_source:'local_import',stage:'new',created_at:createdAt,updated_at:createdAt});
  tx.put('stage_history',historyId,{id:historyId,company_id:companyId,opportunity_id:id,stage:'new',reason:'Rascunho local importado; etapa reiniciada para validação humana.',actor_id:actor.id,created_at:createdAt});
  remember('opportunity',item.id,id);counts.opportunities++;
 }
 for(const item of payload.contents){
  if(await tx.get('local_draft_imports',mappingKey('content',item.id))){counts.skipped++;continue;}
  const id=randomUUID();tx.put('editorial_drafts',id,{id,company_id:companyId,title:item.title.trim(),caption:item.caption,format:item.format,planned_date:item.date||null,version:1,status:'draft',created_by:actor.id,created_at:now()});remember('content',item.id,id);counts.contents++;
 }
 audit(tx,actor,access.company,'drafts.imported',{sourceCompanyId:payload.sourceCompanyId,...counts});return counts;
}
