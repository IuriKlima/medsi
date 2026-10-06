import {queuePollDelay} from '../platform/queue-polling';
import {databaseConfigured} from '../platform/config';
import {loadCurriculum} from './curriculum';
import {carouselReference} from './carousel-reference';
import {Injectable,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common';
import type {CalendarItem,ProfileFacts} from '@askadia/contracts';
import {serviceDb} from '../campaigns/ads';
import {generateStrategy} from './strategy';
import {detailCalendar,designCreative} from './content';
export const contentPreparationConfigured=()=>process.env.CONTENT_AUTOPREP_ENABLED!=='false'&&Boolean(databaseConfigured()&&process.env.OPENAI_API_KEY);
type Job={id:string;companyId:string;token:string;runId:string;kind:'strategy'|'details'|'design';frame:number;today:string;context:{competitorEvidence?:unknown;facts:ProfileFacts;items:CalendarItem[];item:CalendarItem;materials?:{id:string}[]}};
@Injectable()
export class ContentPreparation implements OnModuleInit,OnModuleDestroy{
 private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
 onModuleInit(){if(contentPreparationConfigured())this.timer=setTimeout(()=>void this.tick(),7000);}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 private async tick(){const db=serviceDb();let job:Job|null=null;let failed=false;
 try{
  const claimed=await db.rpc('claim_content_preparation_server');if(claimed.error)throw new Error('Preparation queue unavailable');job=claimed.data as Job|null;
  if(job){let output:unknown;
   if(job.kind==='strategy')output=await generateStrategy(job.context.facts,'',job.today.slice(0,7),job.context.competitorEvidence,await loadCurriculum(db,job.companyId,job.context.facts));
   else if(job.kind==='details')output=await detailCalendar(job.context);
   else{
    const references:{mime:string;data:string;name:string;description?:unknown}[]=[];let total=0;
    for(const ref of job.context.materials??[]){const asset=await db.from('onboarding_attachments').select('mime,size,name,object_path,visual_description').eq('company_id',job.companyId).eq('id',ref.id).single();if(asset.error||!asset.data)throw new Error('Reference unavailable');total+=asset.data.size;if(total>12582912||references.length>=5)throw new Error('Reference size limit');const image=await db.storage.from('company-assets').download(asset.data.object_path);if(image.error||!image.data)throw new Error('Reference download failed');references.push({mime:asset.data.mime,name:asset.data.name,description:asset.data.visual_description,data:Buffer.from(await image.data.arrayBuffer()).toString('base64')});}
    const image=await designCreative(job.context,job.frame,[...references,...await carouselReference(db,job.companyId,job.context.item,job.frame)]);const ext='png';
    const stored=await db.storage.from('company-assets').upload(job.companyId+'/generated/'+job.runId+'.'+ext,image.bytes,{contentType:image.mime,upsert:false});if(stored.error)throw new Error('Creative storage failed');output={mime:image.mime,model:image.model};
   }
   const saved=await db.rpc('finish_content_preparation_server',{p_id:job.id,p_token:job.token,p_result:output});if(saved.error)throw new Error('Preparation persistence failed');
  }
 }catch{failed=true;if(job)await Promise.resolve(db.rpc('finish_content_preparation_server',{p_id:job.id,p_token:job.token,p_result:null})).catch(()=>{});}
 finally{if(!this.stopped)this.timer=setTimeout(()=>void this.tick(),queuePollDelay(Boolean(job),failed,5000));}
 }
}
