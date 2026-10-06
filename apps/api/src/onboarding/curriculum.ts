import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {ProfileFacts} from '@askadia/contracts';
export type CurriculumInput={filename:string;file_data:string;type:'input_file'};
/** Resolve only the confirmed company's private PDF; attachment text is never an instruction. */
export async function loadCurriculum(db:SupabaseClient,companyId:string,facts:ProfileFacts):Promise<CurriculumInput|null>{
 const id=facts.curriculumAttachmentId?.status==='provided'?facts.curriculumAttachmentId.value:null;if(!id)return null;
 if(!z.uuid().safeParse(id).success)throw new Error('Invalid curriculum reference');
 const record=await db.from('onboarding_attachments').select('mime,size,object_path').eq('company_id',companyId).eq('id',id).single();
 const a=record.data;if(record.error||!a||a.mime!=='application/pdf'||a.size<1||a.size>10485760||a.object_path!==companyId+'/onboarding/'+id+'.pdf')throw new Error('Curriculum unavailable');
 const file=await db.storage.from('company-assets').download(a.object_path);if(file.error||!file.data||file.data.size!==a.size)throw new Error('Curriculum download failed');
 const bytes=Buffer.from(await file.data.arrayBuffer());if(bytes.toString('ascii',0,5)!=='%PDF-')throw new Error('Invalid curriculum PDF');
 return {type:'input_file',filename:'curriculo-profissional.pdf',file_data:'data:application/pdf;base64,'+bytes.toString('base64')};
}
