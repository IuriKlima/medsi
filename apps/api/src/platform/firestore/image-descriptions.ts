import {randomUUID} from 'node:crypto';
import {describableImageTypes,visualDescriptionSchema} from '../../onboarding/image-description-schema';
import {companyAccess,fail,hash,server,text,uuid,type FirestoreActor} from './access';
import type {DocumentTransaction,Row} from './store';

export const imageDescriptionOperations=['claim_image_description_server','finish_image_description_server'];
const table='onboarding_attachments',leaseMs=300000;
const now=()=>new Date().toISOString();
async function source(tx:DocumentTransaction,row:Row){
 if(!describableImageTypes.includes(row.mime)||!Number.isInteger(row.size)||row.size<1||row.size>10485760||typeof row.object_path!=='string'||!row.object_path.startsWith(row.company_id+'/onboarding/')||row.object_path.split('/').some((part:string)=>!part||part==='.'||part==='..'))return null;
 try{await companyAccess(tx,{role:'authenticated',id:row.uploaded_by},row.company_id,'marketing.read');}catch(e){if((e as {code?:string}).code==='42501')return null;throw e;}
 const object=await tx.get('storage_objects',hash('company-assets/'+row.object_path));
 if(!object||object.status!=='ready'||object.company_id!==row.company_id||object.mime!==row.mime||object.size!==row.size||typeof object.sha256!=='string')return null;
 return hash({company:row.company_id,path:row.object_path,mime:row.mime,size:row.size,sha256:object.sha256,uploader:row.uploaded_by});
}
export async function imageDescriptionRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 server(actor);
 if(name==='claim_image_description_server'){
  const candidates=new Map<string,Row>();
  for(const status of ['pending','processing'])for(const row of await tx.list(table,[{field:'description_status',value:status}]))candidates.set(row.id,row);
  // Terminal failures and ready history must never exhaust the queue query bound.
  for(const attempts of [0,1,2])for(const row of await tx.list(table,[{field:'description_status',value:'failed'},{field:'description_attempts',value:attempts}]))candidates.set(row.id,row);
  // Attachments predating queue defaults require an explicit bounded backfill;
  // polling must not scan every image to find documents without a status field.
  for(const row of [...candidates.values()].sort((a,b)=>(a.description_attempts??0)-(b.description_attempts??0)||String(a.created_at).localeCompare(String(b.created_at)))){
   if(row.description_updated_at&&Date.parse(row.description_updated_at)+leaseMs>Date.now())continue;
   if((row.description_attempts??0)>=3){if(row.description_status==='processing')tx.put(table,row.id,{...row,description_status:'failed',description_token:null,description_source:null,description_updated_at:now()});continue;}
   const fingerprint=await source(tx,row);if(!fingerprint)continue;
   const token=randomUUID();tx.put(table,row.id,{...row,description_status:'processing',description_attempts:(row.description_attempts??0)+1,description_token:token,description_source:fingerprint,description_updated_at:now()});
   return {id:row.id,companyId:row.company_id,path:row.object_path,mime:row.mime,token};
  }return null;
 }
 if(name!=='finish_image_description_server')return fail('22023','Invalid image description operation');
 const company=uuid(args.p_company_id),id=uuid(args.p_id),token=uuid(args.p_token),row=await tx.get(table,id);
 if(!row||row.company_id!==company||row.description_status!=='processing'||row.description_token!==token||!(Date.parse(row.description_updated_at)+leaseMs>Date.now()))return false;
 const fingerprint=await source(tx,row);if(!fingerprint||fingerprint!==row.description_source){tx.put(table,id,{...row,description_status:'failed',description_token:null,description_source:null,description_updated_at:now()});return false;}
 const parsed=args.p_description===null?null:visualDescriptionSchema.safeParse(args.p_description);
 if(parsed&&(!parsed.success||JSON.stringify(args.p_description).length>12000))fail('22023','Invalid description');
 const description=parsed?.success?parsed.data:null,model=description?text(args.p_model,1,120):null;
 tx.put(table,id,{...row,description_status:description?'ready':'failed',visual_description:description,description_model:model,description_token:null,description_source:null,description_updated_at:now()});return true;
}
