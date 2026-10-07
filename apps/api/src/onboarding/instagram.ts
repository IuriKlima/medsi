import {trackBackgroundTask} from '../background/tasks';
import {agentModelsConfigured} from '../ai/models';
import {databaseConfigured} from '../platform/config';
import {BadRequestException,Body,Controller,Get,Injectable,Param,Post,Req,ServiceUnavailableException,UseGuards,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common';
import {z} from 'zod';
import {instagramUsername,type PurchaseState,type OnboardingSnapshot} from '@askadia/contracts';
import {AuthGuard,type AuthRequest} from '../identity/auth';
import {result} from '../identity/service';
import {adsAccess,serviceDb} from '../campaigns/ads';
import {openChannel} from './channels';
import {inspectInstagram,searchInstagram} from './instagram-provider';
function parse<T>(schema:z.ZodType<T>,body:unknown){const data=schema.safeParse(body);if(!data.success)throw new BadRequestException('Confira os dados do perfil.');return data.data;}
export const instagramWatchConfigured=()=>process.env.INSTAGRAM_MONITOR_ENABLED==='true'&&Boolean(databaseConfigured()&&process.env.SECRETS_ENCRYPTION_KEY&&process.env.META_GRAPH_API_VERSION);
@Controller('onboarding/companies/:id/instagram')
@UseGuards(AuthGuard)
export class InstagramController{
 @Get() async read(@Req() r:AuthRequest,@Param('id') company:string){const cap=await adsAccess(r,company);const rows=await r.actor.client.from('company_instagram_watches').select('id,username,label,kind,status,error,next_attempt_at,snapshot,previous,place_id').eq('company_id',company).order('created_at');if(rows.error?.code==='PGRST205'||rows.error?.code==='42P01')throw new ServiceUnavailableException('O analisador aguarda a atualização do banco de dados da MedSI.');const purchase=result<PurchaseState>(await r.actor.client.rpc('company_purchase_state',{p_company_id:company}));const research=result(await r.actor.client.from('company_competitor_research').select('id,place_id,label,city,status,candidates,error,collected_at,selected_username').eq('company_id',company).neq('status','stale').order('confirmed_at'));return {research,aiAllowed:purchase.aiAllowed,discoveryAvailable:competitorResearchConfigured(),watches:result(rows),canEdit:cap.actions.includes('marketing.write'),monitoringAvailable:instagramWatchConfigured(),searchAvailable:purchase.aiAllowed&&agentModelsConfigured('search')};}
 @Post('search') async search(@Req() r:AuthRequest,@Param('id') company:string,@Body() body:unknown){await adsAccess(r,company,'marketing.write');const input=parse(z.object({requestId:z.uuid(),query:z.string().trim().min(2).max(300),local:z.boolean()}).strict(),body);if(!process.env.OPENAI_API_KEY)throw new ServiceUnavailableException('A busca por nome aguarda o provedor. Você pode informar o @ diretamente.');const profile=result<OnboardingSnapshot>(await r.actor.client.rpc('company_onboarding_read',{p_company_id:company}));const reserved=result<boolean>(await r.actor.client.rpc('reserve_onboarding_provider',{p_company_id:company,p_request_id:input.requestId,p_kind:'interpretation'}));if(!reserved)throw new BadRequestException('Esta busca já foi utilizada.');
  try{const profiles=await searchInstagram(input.query,input.local?profile.state.facts.city?.value??'':'');result(await r.actor.client.rpc('finish_onboarding_provider',{p_company_id:company,p_request_id:input.requestId,p_kind:'interpretation',p_outcome:'completed'}));return {profiles};}catch{await r.actor.client.rpc('finish_onboarding_provider',{p_company_id:company,p_request_id:input.requestId,p_kind:'interpretation',p_outcome:'failed'});throw new ServiceUnavailableException('Não foi possível consultar os perfis. Informe o @ ou tente novamente.');}
 }
 @Post('select') async select(@Req() r:AuthRequest,@Param('id') company:string,@Body() body:unknown){await adsAccess(r,company,'marketing.write');const input=parse(z.object({profile:z.string().max(2000),label:z.string().trim().min(1).max(160),kind:z.enum(['local','inspiration']),remove:z.boolean().default(false),placeId:z.string().min(1).max(200).optional()}).strict(),body);let username:string;try{username=instagramUsername(input.profile);}catch{throw new BadRequestException('Informe o @ ou o endereço de um perfil no Instagram.');}if(input.placeId)result(await r.actor.client.rpc('select_competitor_instagram',{p_company_id:company,p_place_id:input.placeId,p_username:username,p_remove:input.remove}));else result(await r.actor.client.rpc('save_instagram_watch',{p_company_id:company,p_username:username,p_label:input.label,p_kind:input.kind,p_remove:input.remove}));return {ok:true};}
 @Post('research') async research(@Req() r:AuthRequest,@Param('id') company:string,@Body() body:unknown){await adsAccess(r,company,'marketing.write');const input=parse(z.object({placeId:z.string().min(1).max(200)}).strict(),body);return result(await r.actor.client.rpc('request_competitor_research',{p_company_id:company,p_place_id:input.placeId}));}
 @Post('retry') async retry(@Req() r:AuthRequest,@Param('id') company:string,@Body() body:unknown){await adsAccess(r,company,'marketing.write');const input=parse(z.object({placeId:z.string().min(1).max(200)}).strict(),body);result(await r.actor.client.rpc('retry_competitor_research',{p_company_id:company,p_place_id:input.placeId}));return {ok:true};}
}
type WatchJob={id:string;companyId:string;token:string;username:string;channel:{cipher:string;metadata:{instagramId:string;scopes?:string[];expiresAt?:string}}};
@Injectable()
export class InstagramMonitor implements OnModuleInit,OnModuleDestroy{
 private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
 onModuleInit(){if(instagramWatchConfigured())this.timer=setTimeout(()=>trackBackgroundTask(this,()=>this.tick()),10000);}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 private async tick(){let job:WatchJob|null=null;
  try{const db=serviceDb();job=result<WatchJob|null>(await db.rpc('claim_instagram_watch_server'));if(job){const m=job.channel.metadata;if(m.expiresAt&&Date.parse(m.expiresAt)<=Date.now()||!m.scopes?.includes('instagram_basic')||!m.scopes.includes('pages_read_engagement'))throw new Error('Authorization unavailable');const token=openChannel<{token:string;userToken?:string}>(job.companyId,job.channel.cipher);const snapshot=await inspectInstagram(m.instagramId,token.userToken||token.token,job.username);result(await db.rpc('finish_instagram_watch_server',{p_id:job.id,p_token:job.token,p_snapshot:snapshot}));}}
  catch{if(job)await Promise.resolve(serviceDb().rpc('finish_instagram_watch_server',{p_id:job.id,p_token:job.token,p_snapshot:null})).catch(()=>{});}
  finally{if(!this.stopped)this.timer=setTimeout(()=>trackBackgroundTask(this,()=>this.tick()),15000);}
 }
}

export const competitorResearchConfigured=()=>process.env.CONTENT_AUTOPREP_ENABLED!=='false'&&Boolean(databaseConfigured()&&agentModelsConfigured('search'));
type ResearchJob={id:string;companyId:string;token:string;query:string;city:string};
@Injectable()
export class CompetitorResearchWorker implements OnModuleInit,OnModuleDestroy{
 private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
 onModuleInit(){if(competitorResearchConfigured())this.timer=setTimeout(()=>trackBackgroundTask(this,()=>this.tick()),5000);}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 private async tick(){let job:ResearchJob|null=null;
  try{const db=serviceDb();job=result<ResearchJob|null>(await db.rpc('claim_competitor_research_server'));if(job){const candidates=await searchInstagram(job.query,job.city);result(await db.rpc('finish_competitor_research_server',{p_id:job.id,p_token:job.token,p_candidates:candidates}));}}
  catch{if(job)await Promise.resolve(serviceDb().rpc('finish_competitor_research_server',{p_id:job.id,p_token:job.token,p_candidates:null})).catch(()=>{});}
  finally{if(!this.stopped)this.timer=setTimeout(()=>trackBackgroundTask(this,()=>this.tick()),5000);}
 }
}
