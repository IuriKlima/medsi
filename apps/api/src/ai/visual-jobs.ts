import {trackBackgroundTask} from '../background/tasks';
import {agentModelsConfigured} from './models';
import {databaseConfigured} from '../platform/config';
import {randomUUID} from 'node:crypto';
import {BadRequestException,Body,Controller,Get,Injectable,Param,Post,Req,ServiceUnavailableException,UseGuards,type OnModuleDestroy,type OnModuleInit} from '@nestjs/common';
import {visualJobRequest} from '@askadia/contracts';
import {AuthGuard,type AuthRequest} from '../identity/auth';
import {result} from '../identity/service';
import {adsAccess,serviceDb} from '../campaigns/ads';
import {createVisual,type VisualRequest} from './images';

export const visualJobsConfigured=()=>process.env.VISUAL_JOBS_ENABLED!=='false'&&Boolean(agentModelsConfigured('image')&&databaseConfigured());
@Controller('onboarding/companies/:id/visual-jobs')
@UseGuards(AuthGuard)
export class VisualJobsController{
 @Get() async read(@Req() r:AuthRequest,@Param('id') company:string){const cap=await adsAccess(r,company);const jobs=await r.actor.client.from('company_visual_jobs').select('id,kind,plan_id,campaign_index,source_attachment_id,status,instructions,ratio,result_attachment_id,error,created_at').eq('company_id',company).order('created_at',{ascending:false}).limit(100);if(jobs.error?.code==='PGRST205'||jobs.error?.code==='42P01')throw new ServiceUnavailableException('A edição de imagens aguarda a atualização do banco da MedSI.');return {jobs:result(jobs),available:visualJobsConfigured(),canEdit:cap.actions.includes('marketing.write')};}
 @Post() async create(@Req() r:AuthRequest,@Param('id') company:string,@Body() body:unknown){await adsAccess(r,company,'marketing.write');const input=visualJobRequest.safeParse(body);if(!input.success)throw new BadRequestException('Escolha os materiais e descreva a edição.');if(!visualJobsConfigured())throw new ServiceUnavailableException('A geração de imagens ainda não está disponível.');return {id:result(await r.actor.client.rpc('enqueue_visual_job',{p_company_id:company,p_data:input.data}))};}
}
type Job={id:string;companyId:string;token:string;request:VisualRequest;references:{id:string;name:string;mime:string;path:string}[]};
@Injectable()
export class VisualJobs implements OnModuleInit,OnModuleDestroy{
 private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
 onModuleInit(){if(visualJobsConfigured())this.timer=setTimeout(()=>trackBackgroundTask(this,()=>this.tick()),8000);}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 private async tick(){let job:Job|null=null;try{
  const db=serviceDb();job=result<Job|null>(await db.rpc('claim_visual_job_server'));if(!job||this.stopped)return;
  const references=[];for(const ref of job.references){if(!ref.path.startsWith(job.companyId+'/'))throw new Error('Invalid company material');const file=await db.storage.from('company-assets').download(ref.path);if(file.error||!file.data||file.data.size>10485760)throw new Error('Material unavailable');references.push({name:ref.name,mime:ref.mime,bytes:Buffer.from(await file.data.arrayBuffer())});}
  const image=await createVisual(job.request,references);const attachmentId=randomUUID(),ext='png',path=job.companyId+'/onboarding/'+attachmentId+'.'+ext;
  const uploaded=await db.storage.from('company-assets').upload(path,image.bytes,{contentType:image.mime,upsert:false});if(uploaded.error)throw new Error('Image storage unavailable');
  const accepted=result<boolean>(await db.rpc('finish_visual_job_server',{p_id:job.id,p_token:job.token,p_result:{attachmentId,mime:image.mime,size:image.bytes.length,model:image.model,quality:image.quality,dimensions:image.size,usage:image.usage}}));
  if(!accepted)await db.storage.from('company-assets').remove([path]);
 }catch{if(job)await Promise.resolve(serviceDb().rpc('finish_visual_job_server',{p_id:job.id,p_token:job.token,p_result:null})).catch(()=>{});}
 finally{if(!this.stopped)this.timer=setTimeout(()=>trackBackgroundTask(this,()=>this.tick()),7000);}}
}
