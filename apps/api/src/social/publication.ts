import {BadRequestException,Body,Controller,Get,Injectable,Param,Post,Req,ServiceUnavailableException,UseGuards,type OnModuleDestroy,type OnModuleInit,Res} from '@nestjs/common';
import {z} from 'zod';
import {prepareSocialPublicationMedia} from './media';
import {AuthGuard,type AuthRequest} from '../identity/auth';
import {result} from '../identity/service';
import {serviceDatabase} from '../platform/service';
import {databaseConfigured,firestoreBackend} from '../platform/config';
import {openChannel} from '../onboarding/channels';
import {metaGraph} from '../inbox/meta';
import type {Row} from '../platform/firestore/store';
export const socialPublicationConfigured=()=>firestoreBackend()&&databaseConfigured()&&process.env.INSTAGRAM_PUBLICATION_ENABLED==='true'&&Boolean(process.env.SECRETS_ENCRYPTION_KEY&&/^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION??''));
export interface InstagramPublicationProvider {create(snapshot:Row,url:string):Promise<string>;status(container:string):Promise<string>;publish(instagram:string,container:string):Promise<string>;child?(instagram:string,url:string):Promise<string>;carousel?(snapshot:Row,children:string[]):Promise<string>}
/** Official Facebook Login Graph endpoints. No generic HTTP URL, arbitrary
 * provider account or user supplied media URL is accepted by this adapter. */
export class InstagramPublisher implements InstagramPublicationProvider {
 constructor(private token:string,private graph=metaGraph){}
 async create(snapshot:Row,url:string){const r=await this.graph<{id:string}>(snapshot.instagramId+'/media',this.token,{},snapshot.format==='reels'?{media_type:'REELS',video_url:url,caption:snapshot.caption}:{image_url:url,caption:snapshot.caption});if(!/^\d+$/.test(r.id??''))throw new Error('Container outcome uncertain');return r.id;}
 async child(instagram:string,url:string){const r=await this.graph<{id:string}>(instagram+'/media',this.token,{}, {image_url:url,is_carousel_item:true});if(!/^\d+$/.test(r.id??''))throw new Error('Child outcome uncertain');return r.id;}
 async carousel(snapshot:Row,children:string[]){const r=await this.graph<{id:string}>(snapshot.instagramId+'/media',this.token,{}, {media_type:'CAROUSEL',children:children.join(','),caption:snapshot.caption});if(!/^\d+$/.test(r.id??''))throw new Error('Carousel outcome uncertain');return r.id;}
 async status(container:string){const r=await this.graph<{status_code:string}>(container,this.token,{fields:'status_code'});if(!['IN_PROGRESS','FINISHED','ERROR','EXPIRED','PUBLISHED'].includes(r.status_code))throw new Error('Unknown container status');return r.status_code;}
 async publish(instagram:string,container:string){const r=await this.graph<{id:string}>(instagram+'/media_publish',this.token,{}, {creation_id:container});if(!/^\d+$/.test(r.id??''))throw new Error('Publish outcome uncertain');return r.id;}
}
export type PublicationDependencies={rpc:(name:string,args:Row)=>Promise<unknown>;assetUrl:(snapshot:Row)=>Promise<string>;provider?:InstagramPublicationProvider};
export async function runSocialPublication(job:Row,dependencies?:PublicationDependencies){
 const db=dependencies?null:serviceDatabase();const deps:PublicationDependencies=dependencies??{rpc:async(name,args)=>result(await db!.rpc(name,args)),assetUrl:async(snapshot)=>{const signed=await db!.storage.from('company-assets').createSignedUrl(snapshot.objectPath,600);if(signed.error||!signed.data)throw new Error('Private asset URL unavailable');return signed.data.signedUrl;}};
 const params={p_id:job.id,p_token:job.lease_token},guard=async()=>{if(!await deps.rpc('social_publication_guard_server',params))throw new Error('Publication approval changed');},finish=(status:string,error:string|null=null,observed:string|null=null)=>deps.rpc('finish_social_publication_server',{...params,p_status:status,p_error:error,p_observed:observed});
 let mutationStarted=Boolean(Object.keys(job.remote??{}).some(k=>k.endsWith('Started')));
 try{
  if(job.remote?.mediaId){await finish('published',null,'PUBLISHED');return;}
  const binding=await deps.rpc('social_publication_context_server',params) as Row;const provider=deps.provider??new InstagramPublisher(openChannel<{token:string}>(job.company_id,binding.cipher).token),snapshot=binding.snapshot;
  let container=job.remote?.containerId as string|undefined;
  if(!container){
   if(job.reconcileOnly||job.remote?.containerStarted){await finish('reconciling','Container creation outcome is unknown. Review the Instagram account; a second container will not be created automatically.');return;}
   const children:string[]=[];let url='';if(snapshot.format==='carousel'){if(!provider.child||!provider.carousel)throw new Error('Carousel adapter unavailable');for(const [index,asset] of snapshot.media.entries()){const key='child'+index;let child=job.remote?.[key+'Id'];if(!child){await guard();const assetUrl=await deps.assetUrl({...snapshot,...asset});await guard();const childStep=await deps.rpc('social_publication_step_server',{...params,p_step:key}) as Row;if(childStep.status==='reconcile'){await finish('reconciling','Carousel child creation is uncertain. No duplicate child will be created.');return;}if(childStep.status==='done')child=childStep.id;else{mutationStarted=true;child=await provider.child(snapshot.instagramId,assetUrl);await deps.rpc('social_publication_step_server',{...params,p_step:key,p_result:child});}}children.push(child);const status=await provider.status(child);if(status!=='FINISHED'){await finish(['ERROR','EXPIRED','PUBLISHED'].includes(status)?'blocked':'processing','Waiting for carousel image processing.',status);return;}}}else{await guard();url=await deps.assetUrl(snapshot);}await guard();const step=await deps.rpc('social_publication_step_server',{...params,p_step:'container'}) as Row;
   if(step.status==='reconcile'){await finish('reconciling','Container creation requires manual reconciliation.');return;}
   if(step.status==='done')container=step.id;else{mutationStarted=true;container=snapshot.format==='carousel'?await provider.carousel!(snapshot,children):await provider.create(snapshot,url);await deps.rpc('social_publication_step_server',{...params,p_step:'container',p_result:container});}
  }
  const state=await provider.status(container!);
  if(state==='PUBLISHED'){
   // Only our durably started publish can authorize treating this observation
   // as completion. The queue never resubmits an uncertain publish request.
   if(job.remote?.publishStarted){await finish('published',null,state);return;}
   await finish('blocked','Container was published externally; confirm the result in Instagram.',state);return;
  }
  if(job.remote?.publishStarted){await finish('reconciling','Publication response is uncertain. No duplicate publish request will be sent.',state);return;}
  if(['ERROR','EXPIRED'].includes(state)){await finish('blocked','Instagram rejected or expired the container. Create a newly reviewed content revision.',state);return;}
  if(state!=='FINISHED'){await finish('processing',null,state);return;}
  await guard();const step=await deps.rpc('social_publication_step_server',{...params,p_step:'publish'}) as Row;
  if(step.status==='reconcile'){await finish('reconciling','Publication outcome requires observation; no duplicate request will be sent.');return;}
  if(step.status==='done'){await finish('published');return;}
  // Approval is checked after reserving the durable mutation and immediately
  // before the external request. Revocation cannot undo provider acceptance.
  await guard();mutationStarted=true;const media=await provider.publish(snapshot.instagramId,container!);await deps.rpc('social_publication_step_server',{...params,p_step:'publish',p_result:media});await finish('published',null,'PUBLISHED');
 }catch{await finish(mutationStarted?'reconciling':'blocked',mutationStarted?'The provider did not confirm the outcome. Reconciliation is required; nothing will be resent automatically.':'Publication unavailable. Review permissions, approval, private asset access and provider configuration.');}
}
@Injectable()
export class SocialPublicationWorker implements OnModuleInit,OnModuleDestroy {
 private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
 onModuleInit(){if(socialPublicationConfigured())this.timer=setTimeout(()=>void this.tick(),15000);}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 private async tick(){try{const job=result<Row|null>(await serviceDatabase().rpc('claim_social_publication_server'));if(job&&!this.stopped)await runSocialPublication(job);}catch{/* Durable leases recover on restart; provider responses and secrets are not logged. */}finally{if(!this.stopped)this.timer=setTimeout(()=>void this.tick(),15000);}}
}
@Controller('onboarding/companies/:id/social-publications')
@UseGuards(AuthGuard)
export class SocialPublicationController {
 @Get() async read(@Req() r:AuthRequest,@Param('id') company:string){if(!z.uuid().safeParse(company).success)throw new BadRequestException();const items=result(await r.actor.client.from('company_social_publications').select('*').eq('company_id',company).order('created_at',{ascending:false}).limit(100));const channels=result<Row[]>(await r.actor.client.from('company_channels').select('remote_id,name,metadata,status,provider').eq('company_id',company));const connected=channels.find(c=>c.provider==='meta'&&c.status==='connected');return {items,account:connected?{instagramId:connected.metadata?.instagramId??null,name:connected.metadata?.instagramName??connected.name,pageId:connected.remote_id,ready:Boolean(connected.metadata?.publishingReady&&connected.metadata?.scopes?.includes('instagram_content_publish')&&connected.metadata?.instagramId)}:null,enabled:socialPublicationConfigured(),formats:['jpeg_image','jpeg_carousel','mp4_reels'],temporaryProviderAssetAccessSeconds:600};}
 @Post() async create(@Req() r:AuthRequest,@Param('id') company:string,@Body() body:unknown){const p=z.object({id:z.uuid(),itemId:z.uuid(),creativeId:z.uuid(),caption:z.string().min(1).max(2200),scheduledAt:z.iso.datetime()}).strict().safeParse(body);if(!p.success||!z.uuid().safeParse(company).success)throw new BadRequestException();await prepareSocialPublicationMedia(company,r.actor.id,p.data.itemId,p.data.creativeId);return result(await r.actor.client.rpc('create_social_publication',{p_company_id:company,p_id:p.data.id,p_item_id:p.data.itemId,p_creative_id:p.data.creativeId,p_caption:p.data.caption,p_scheduled_at:p.data.scheduledAt}));}
 @Get('media/:media') async media(@Req() r:AuthRequest,@Param('id') company:string,@Param('media') id:string,@Res() response:{setHeader:(name:string,value:string)=>unknown;send:(bytes:Buffer)=>unknown}){if(!z.uuid().safeParse(company).success||! /^[a-f0-9]{64}$/.test(id))throw new BadRequestException();const db=serviceDatabase(),record=result<Row>(await db.rpc('read_social_media_server',{p_company_id:company,p_actor:r.actor.id,p_id:id}));const file=await db.storage.from('company-assets').download(record.object_path);if(file.error||!file.data)throw new ServiceUnavailableException();response.setHeader('Content-Type','image/jpeg');response.setHeader('Cache-Control','private, no-store');response.setHeader('X-Content-Type-Options','nosniff');response.send(Buffer.from(await file.data.arrayBuffer()));}
 @Post(':publication/edit') async edit(@Req() r:AuthRequest,@Param('id') company:string,@Param('publication') id:string,@Body() body:unknown){const p=z.object({revision:z.number().int().positive(),caption:z.string().min(1).max(2200),scheduledAt:z.iso.datetime()}).strict().safeParse(body);if(!p.success||!z.uuid().safeParse(company).success||!z.uuid().safeParse(id).success)throw new BadRequestException();return result(await r.actor.client.rpc('edit_social_publication',{p_company_id:company,p_id:id,p_revision:p.data.revision,p_caption:p.data.caption,p_scheduled_at:p.data.scheduledAt}));}
 @Post(':publication/approve') async approve(@Req() r:AuthRequest,@Param('id') company:string,@Param('publication') id:string,@Body() body:unknown){const p=z.object({revision:z.number().int().positive(),allowTemporaryProviderAssetAccess:z.literal(true)}).strict().safeParse(body);if(!p.success||!z.uuid().safeParse(company).success||!z.uuid().safeParse(id).success)throw new BadRequestException();if(!socialPublicationConfigured())throw new ServiceUnavailableException('Configure official Instagram publishing and private asset access before approving execution.');return result(await r.actor.client.rpc('approve_social_publication',{p_company_id:company,p_id:id,p_revision:p.data.revision,p_provider_fetch:p.data.allowTemporaryProviderAssetAccess}));}
 @Post(':publication/control') async control(@Req() r:AuthRequest,@Param('id') company:string,@Param('publication') id:string,@Body() body:unknown){const p=z.object({revision:z.number().int().positive(),action:z.enum(['pause','cancel','revoke'])}).strict().safeParse(body);if(!p.success||!z.uuid().safeParse(company).success||!z.uuid().safeParse(id).success)throw new BadRequestException();return result(await r.actor.client.rpc('control_social_publication',{p_company_id:company,p_id:id,p_revision:p.data.revision,p_action:p.data.action}));}
}
