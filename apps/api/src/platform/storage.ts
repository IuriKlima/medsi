import {firebaseBucket} from './firebase-admin';
import type {DbRole,SqlExecutor} from './postgres';
type Context={role:DbRole;actorId:string|null;executor:SqlExecutor};
const failure=(cause:unknown)=>({data:null,error:{code:typeof cause==='object'&&cause&&'code'in cause?String(cause.code):'STORAGE_UNAVAILABLE',message:cause instanceof Error?cause.message:'Storage unavailable'}});
const denied=()=>Object.assign(new Error('Access denied'),{code:'42501'});
function validate(bucket:string,path:string){
 if(bucket!=='company-assets'||path.length>500||!/^[a-f0-9-]{36}\/[A-Za-z0-9_./-]+$/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw denied();
}
export function firebaseStorage(context:Context,bucket:string){
 const physical=(path:string)=>firebaseBucket().file('medsi/'+bucket+'/'+path);
 async function canRead(path:string){validate(bucket,path);await context.executor.run(context.role,context.actorId,async db=>{const allowed=await db.query('select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path]);if(!allowed.rows.length)throw denied();});}
 return {
  async upload(path:string,body:Buffer|ArrayBuffer|Uint8Array|Blob,options:{contentType?:string;upsert?:boolean}={}){
   let written=false;
   try{
    validate(bucket,path);if(options.upsert)throw new Error('Overwriting private materials is not supported');
    const bytes=body instanceof Blob?Buffer.from(await body.arrayBuffer()):Buffer.from(body as Uint8Array);
    if(!bytes.length||bytes.length>52428800)throw new Error('File size limit exceeded');
    await context.executor.run(context.role,context.actorId,async db=>{
     if(context.role!=='service_role'){const cap=await db.query<{actions:string[]}>("select public.company_capabilities($1)->'actions' as actions",[path.split('/')[0]]);if(!cap.rows[0]?.actions?.includes('marketing.write'))throw denied();}
     const rules=await db.query<{file_size_limit:string|null;allowed_mime_types:string[]|null}>('select file_size_limit,allowed_mime_types from storage.buckets where id=$1',[bucket]);const rule=rules.rows[0];if(!rule||rule.file_size_limit&&bytes.length>Number(rule.file_size_limit)||rule.allowed_mime_types&&!rule.allowed_mime_types.includes(options.contentType??''))throw new Error('File type or size is not allowed');
     await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3::jsonb)',[bucket,path,JSON.stringify({size:bytes.length,mimetype:options.contentType})]);
     await physical(path).save(bytes,{resumable:false,contentType:options.contentType,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},timeout:45000});written=true;
    });
    return {data:{path},error:null};
   }catch(e){if(written)await physical(path).delete().catch(()=>{});const code=typeof e==='object'&&e&&'code'in e?String(e.code):'';if(['23505','412'].includes(code))return {data:null,error:{code,message:'The resource already exists'}};return failure(e);}
  },
  async download(path:string){try{await canRead(path);const file=physical(path);const [meta]=await file.getMetadata();if(Number(meta.size)>52428800)throw new Error('File size limit exceeded');const [bytes]=await file.download({validation:'crc32c'});if(bytes.length>52428800)throw new Error('File size limit exceeded');return {data:new Blob([new Uint8Array(bytes)],{type:meta.contentType??'application/octet-stream'}),error:null};}catch(e){return failure(e);}},
  async createSignedUrl(path:string,seconds:number){try{if(!Number.isInteger(seconds)||seconds<1||seconds>600)throw new Error('Invalid download expiry');await canRead(path);const [url]=await physical(path).getSignedUrl({version:'v4',action:'read',expires:Date.now()+seconds*1000});return {data:{signedUrl:url},error:null};}catch(e){return failure(e);}},
  async remove(paths:string[]){try{if(context.role!=='service_role'||!Array.isArray(paths)||paths.length>100)throw denied();for(const path of paths){validate(bucket,path);await physical(path).delete({ignoreNotFound:true});await context.executor.run(context.role,context.actorId,db=>db.query('delete from storage.objects where bucket_id=$1 and name=$2',[bucket,path]));}return {data:paths.map(name=>({name})),error:null};}catch(e){return failure(e);}}
 };
}
