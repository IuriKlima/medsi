import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {metaAccess} from '@askadia/contracts';
import {openChannel} from './channel-vault';
import {queuePollDelay} from '../platform/queue-polling';
import {databaseConfigured} from '../platform/config';
import {Body,Controller,Injectable,Param,Post,Req,UseGuards,BadRequestException,ServiceUnavailableException,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common';
import {z} from 'zod';
import {regionalCompetitorIdPattern,regionalMapRequestSchema,type ProfileFacts,type RegionalMapRequest,type RegionalProgress} from '@askadia/contracts';
import {AuthGuard,type AuthRequest} from '../identity/auth';
import {adsAccess,serviceDb} from '../campaigns/ads';
import {result} from '../identity/service';
import {collectRegionalMap} from './regional-map';
import {collectRegionalAudience} from './regional-providers';
export const regionalResearchConfigured=()=>process.env.REGIONAL_RESEARCH_ENABLED==='true'&&Boolean(databaseConfigured());
type RegionalJob={id:string;companyId:string;actorId:string;profileVersion:number;token:string;facts:ProfileFacts;map?:RegionalMapRequest};
/** Reads only tenant-bound server bridges. Provider tokens never enter research snapshots. */
export function regionalFacebookProvider(db:SupabaseClient,job:Pick<RegionalJob,'companyId'|'actorId'>){return async()=>{
 const [meta,ads]=await Promise.all([
  db.rpc('read_company_meta_server',{p_company_id:job.companyId,p_actor:job.actorId,p_action:'marketing.write'}),
  db.rpc('ad_credentials_server',{p_company_id:job.companyId,p_actor:job.actorId,p_provider:'meta',p_write:null})
 ]);
 const channel=result<{remote_id:string;cipher:string;metadata:{scopes?:string[];tasks?:string[];instagramId?:string;expiresAt?:string}}|null>(meta);
 const account=result<{status:string;account_id:string|null;source_page:string|null}|null>(ads);
 if(!channel||!account||account.status!=='connected')return null;
 if(!/^\d+$/.test(channel.remote_id)||!/^act_\d+$/.test(account.account_id??'')||account.source_page!==channel.remote_id)throw new Error('META_ACCOUNT_BINDING_UNAVAILABLE');
 const metadata=channel.metadata??{},access=metaAccess(metadata.scopes??[],metadata.instagramId??null,metadata.tasks??[]);
 if(!access.adsRead||metadata.expiresAt&&(!Number.isFinite(Date.parse(metadata.expiresAt))||Date.parse(metadata.expiresAt)<=Date.now()))throw new Error('META_READ_AUTHORIZATION_UNAVAILABLE');
 const secret=openChannel<{userToken?:string}>(job.companyId,channel.cipher);if(!secret.userToken)throw new Error('META_USER_AUTHORIZATION_UNAVAILABLE');
 const binding=createHash('sha256').update(JSON.stringify({page:channel.remote_id,account:account.account_id,cipher:channel.cipher,metadata})).digest('hex');
 return {account:account.account_id!,token:secret.userToken,binding};
};}
@Controller('onboarding/companies/:id')
@UseGuards(AuthGuard)
export class RegionalResearchController{
 @Post('regional-research/competitors') async select(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  await adsAccess(r,id,'marketing.write');const input=z.object({revision:z.number().int().positive(),ids:z.array(z.string().regex(regionalCompetitorIdPattern)).max(20)}).strict().safeParse(body);if(!input.success)throw new BadRequestException('Confira a seleção de concorrentes.');
  result(await r.actor.client.rpc('select_regional_competitors',{p_company_id:id,p_revision:input.data.revision,p_ids:input.data.ids}));return {ok:true};
 }
 @Post('regional-research') async request(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  await adsAccess(r,id,'marketing.write');const input=z.object({refresh:z.boolean().default(false),map:regionalMapRequestSchema.optional()}).strict().safeParse(body);
  if(!input.success)throw new BadRequestException('Confira a solicitação de coleta.');
  if(!regionalResearchConfigured())throw new ServiceUnavailableException('A análise regional aguarda ativação no servidor. As respostas da clínica estão salvas.');
  result(await r.actor.client.rpc('request_regional_research',{p_company_id:id,p_refresh:input.data.refresh,...(input.data.map?{p_map:input.data.map}:{})}));return {ok:true};
 }
}
@Injectable()
export class RegionalResearchWorker implements OnModuleInit,OnModuleDestroy{
 private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
 onModuleInit(){if(regionalResearchConfigured())this.timer=setTimeout(()=>void this.tick(),6000);}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 private async tick(){let job:RegionalJob|null=null;let failed=false;
  try{const db=serviceDb();job=result<RegionalJob|null>(await db.rpc('claim_regional_research_server'));if(job&&!this.stopped){const claimed=job;const progress=async(source:RegionalProgress['source'],state:RegionalProgress['state'])=>{if(process.env.DATABASE_PROVIDER==='firestore')result(await db.rpc('progress_regional_research_server',{p_id:claimed.id,p_token:claimed.token,p_source:source,p_state:state}));};
   const data=await collectRegionalAudience(job.facts,regionalFacebookProvider(db,job),fetch,undefined,progress);
   if(process.env.DATABASE_PROVIDER==='firestore'){await progress('map','running');const mapOptions={facts:job.facts,placesKey:process.env.GOOGLE_PLACES_SERVER_KEY,persistentEvidence:true};data.map=await collectRegionalMap(data.ibge.data?.municipalityId,job.map,fetch,mapOptions);await progress('map',data.map.state==='unavailable'?'unavailable':'completed');}result(await db.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:data}));}}
  catch{failed=true;if(job)await Promise.resolve(serviceDb().rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:null})).catch(()=>{});}
  finally{if(!this.stopped)this.timer=setTimeout(()=>void this.tick(),queuePollDelay(Boolean(job),failed,7000));}
 }
}
