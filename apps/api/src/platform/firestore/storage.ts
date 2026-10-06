import {createHash} from 'node:crypto';
import {firebaseBucket} from '../firebase-admin';
import type {DocumentStore,DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,fail,hash,uuid,audit} from './access';
const allowed=['image/png','image/jpeg','image/webp','application/pdf','video/mp4'];
const failure=(e:unknown)=>({data:null,error:{code:typeof e==='object'&&e&&'code'in e?String(e.code):'STORAGE_UNAVAILABLE',message:e instanceof Error?e.message:'Storage unavailable'}});
function validPath(bucket:string,path:string){if(bucket!=='company-assets'||path.length>500||!/^[0-9a-f-]{36}\/[A-Za-z0-9_./-]+$/i.test(path)||path.split('/').some(s=>!s||s==='.'||s==='..'))fail('42501','Invalid storage path');return uuid(path.split('/')[0]);}
export function firestoreStorage(store:DocumentStore,actor:FirestoreActor,bucket:string){
 const file=(path:string)=>firebaseBucket().file('medsi/'+bucket+'/'+path);
 async function authorize(path:string,action='marketing.read'){
  const company=validPath(bucket,path);return store.run(async tx=>{if(actor.role!=='service_role')await companyAccess(tx,actor,company,action);const object=await tx.get('storage_objects',hash(bucket+'/'+path));if(!object||object.status!=='ready'||object.company_id!==company)fail('42501','File unavailable');return object!;});
 }
 return {
  async upload(path:string,body:Buffer|ArrayBuffer|Uint8Array|Blob,options:{contentType?:string;upsert?:boolean}={}){
   try{
    const company=validPath(bucket,path),bytes=body instanceof Blob?Buffer.from(await body.arrayBuffer()):Buffer.from(body as Uint8Array),mime=options.contentType??'';
    if(options.upsert||!allowed.includes(mime)||!bytes.length||bytes.length>(mime==='video/mp4'?52428800:10485760))fail('22023','File type or size is not allowed');
    const digest=createHash('sha256').update(bytes).digest('hex'),key=hash(bucket+'/'+path);
    const reserved=await store.run(async tx=>{
     if(actor.role!=='service_role')await companyAccess(tx,actor,company,'marketing.write');else if(!await tx.get('companies',company))fail('42501','Company unavailable');
     const prior=await tx.get('storage_objects',key);if(prior&&(prior.sha256!==digest||prior.mime!==mime||prior.size!==bytes.length))fail('23505','Object already contains a different file');
     if(!prior)tx.put('storage_objects',key,{company_id:company,bucket,path,sha256:digest,mime,size:bytes.length,status:'pending',uploaded_by:actor.id,created_at:new Date().toISOString()});return prior?.status==='ready';
    });
    if(!reserved){
     try{await file(path).save(bytes,{resumable:false,contentType:mime,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},metadata:{metadata:{medsiSha256:digest}},timeout:45000});}
     catch(e){if(String((e as {code?:unknown}).code)!=='412')throw e;const [metadata]=await file(path).getMetadata();if(metadata.metadata?.medsiSha256!==digest)throw e;}
     await store.run(async tx=>{if(actor.role!=='service_role')await companyAccess(tx,actor,company,'marketing.write');const current=await tx.get('storage_objects',key);if(!current||current.sha256!==digest)fail('40001','Upload changed');tx.put('storage_objects',key,{...current,status:'ready'});});
    }
    return {data:{path},error:null};
   }catch(e){return failure(e);}
  },
  async download(path:string){try{const record=await authorize(path);const [metadata]=await file(path).getMetadata();if(Number(metadata.size)!==record.size||Number(metadata.size)>52428800)fail('22023','Invalid file size');const [bytes]=await file(path).download({validation:'crc32c'});if(createHash('sha256').update(bytes).digest('hex')!==record.sha256)fail('22023','File integrity check failed');await authorize(path);return {data:new Blob([new Uint8Array(bytes)],{type:record.mime}),error:null};}catch(e){return failure(e);}},
  async createSignedUrl(path:string,seconds:number){try{if(!Number.isInteger(seconds)||seconds<1||seconds>600)fail('22023','Invalid expiry');await authorize(path);const [url]=await file(path).getSignedUrl({version:'v4',action:'read',expires:Date.now()+seconds*1000});return {data:{signedUrl:url},error:null};}catch(e){return failure(e);}},
  async remove(paths:string[]){try{if(actor.role!=='service_role'||!Array.isArray(paths)||paths.length>100)fail('42501','Access denied');for(const path of paths){validPath(bucket,path);await file(path).delete({ignoreNotFound:true});await store.run(async tx=>tx.remove('storage_objects',hash(bucket+'/'+path)));}return {data:paths.map(name=>({name})),error:null};}catch(e){return failure(e);}}
 };
}
export async function recordAttachment(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 const company=uuid(args.p_company_id),id=uuid(args.p_id),access=await companyAccess(tx,actor,company,'marketing.write');
 const ext:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','application/pdf':'pdf'},mime=args.p_mime;
 if(!ext[mime]||args.p_path!==company+'/onboarding/'+id+'.'+ext[mime]||typeof args.p_name!=='string'||!args.p_name.trim()||args.p_name.length>180||!Number.isInteger(args.p_size)||args.p_size<1||args.p_size>10485760)fail('22023','Invalid attachment');
 const object=await tx.get('storage_objects',hash('company-assets/'+args.p_path));if(object?.status!=='ready'||object.company_id!==company||object.mime!==mime||object.size!==args.p_size)fail('42501','Stored file required');
 const prior=await tx.get('onboarding_attachments',id);if(prior){if(prior.company_id!==company||prior.object_path!==args.p_path)fail('42501','Attachment unavailable');return prior;}
 const record={id,company_id:company,name:args.p_name,mime,size:args.p_size,object_path:args.p_path,uploaded_by:actor.id,created_at:new Date().toISOString()};tx.put('onboarding_attachments',id,record);audit(tx,actor,access.company,'attachment.uploaded',{id,mime,size:args.p_size});return record;
}

