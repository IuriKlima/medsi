import {randomUUID} from 'node:crypto';
import {type FirestoreActor,companyAccess,server,uuid,text,hash,audit,fail} from './access';
import type {DocumentTransaction,Row} from './store';
import {context,confirmed,now,scoped} from './journey-state';
export const socialPublicationOperations=['create_social_publication','edit_social_publication','approve_social_publication','control_social_publication','claim_social_publication_server','social_publication_context_server','social_publication_guard_server','social_publication_step_server','finish_social_publication_server','prepare_social_media_context_server','record_social_media_server','read_social_media_server'];
const table='company_social_publications';
const expiry=()=>new Date(Date.now()+300000).toISOString();
const live=(row:Row)=>Date.parse(row.lease_until??'')>Date.now();
export const SOCIAL_MEDIA_CONVERSION='instagram-jpeg-v1-sharp-0.35.4';
async function media(tx:DocumentTransaction,company:string,asset:Row,original=false){
 const object=await tx.get('storage_objects',hash('company-assets/'+asset.object_path));if(!object||object.company_id!==company||object.status!=='ready'||!['image/jpeg','image/png','image/webp','video/mp4'].includes(object.mime)||!asset.object_path.startsWith(company+'/')||! /^[a-f0-9]{64}$/.test(object.sha256))throw fail('22023','Verified private creative required');
 const key=hash({company,creativeId:asset.id,sourceSha:object.sha256,conversion:SOCIAL_MEDIA_CONVERSION}),derivative=await tx.get('social_media_assets',key);
 if(!original&&object.mime!=='video/mp4'){
  if(derivative){const converted=await tx.get('storage_objects',hash('company-assets/'+derivative.object_path));if(converted?.company_id!==company||converted.status!=='ready'||converted.mime!=='image/jpeg'||converted.sha256!==derivative.sha256)throw fail('40001','Prepared JPEG unavailable');return {asset,object:converted,original:object,key,objectPath:derivative.object_path,preparedId:derivative.id};}
  if(object.mime!=='image/jpeg')throw fail('22023','Prepare private JPEG derivative before publication');
 }
 return {asset,object,original:object,key,objectPath:asset.object_path,preparedId:null};
}
async function sources(tx:DocumentTransaction,company:string,itemId:string,creativeId:string,original=false){
 const [state,item,creative,video,channels]=await Promise.all([tx.get('company_onboarding',company),tx.get('company_calendar_items',itemId),tx.get('company_creatives',creativeId),tx.get('company_final_videos',creativeId),tx.list('company_channels',scoped(company))]);
 if(!confirmed(state)||!item||item.company_id!==company||item.profile_version!==state!.profile_version||item.approved_revision!==item.revision||item.status!=='approved')throw fail('40001','Approve current calendar content first');
 const ctx=await context(tx,company);if(!ctx.brief||ctx.brief.status!=='approved'||!ctx.items.some(i=>i.id===itemId&&i.revision===item.revision))throw fail('40001','Calendar generation changed');
 const asset=creative??video;if(!asset||asset.company_id!==company||asset.item_id!==itemId||asset.revision!==item.revision)throw fail('40001','Approved creative required');
 const primary=await media(tx,company,asset,original);const selected=[primary];
 if(item.format==='carrossel'&&!original){
  const count=item.details?.slides?.length??0;if(count<2||count>10||asset.frame!==0)throw fail('22023','Carousel requires 2 to 10 image frames and an approved cover');
  const all=(await tx.list('company_creatives',scoped(company))).filter(a=>a.item_id===itemId&&a.revision===item.revision).sort((a,b)=>String(b.created_at??'').localeCompare(String(a.created_at??''))||String(b.id).localeCompare(String(a.id)));
  for(let frame=1;frame<count;frame++){const next=all.find(a=>a.frame===frame);if(!next)throw fail('40001','All approved carousel frames are required');selected.push(await media(tx,company,next));}
  if(selected.some(m=>m.object.mime!=='image/jpeg'))throw fail('22023','Carousel requires prepared JPEG frames');
 }
 const channel=channels.find(c=>c.provider==='meta'&&c.status==='connected'&&c.metadata?.publishingReady&&c.metadata?.scopes?.includes('instagram_content_publish')&&/^\d+$/.test(c.metadata?.instagramId??''));
 if(!channel||channel.metadata.expiresAt&&Date.parse(channel.metadata.expiresAt)<=Date.now())throw fail('40001','Connect an authorized Instagram professional account');
 return {item,asset,object:primary.object,objectPath:primary.objectPath,original:primary.original,key:primary.key,channel,profileVersion:state!.profile_version,media:selected.map(m=>({creativeId:m.asset.id,frame:m.asset.frame??0,objectPath:m.objectPath,assetSha256:m.object.sha256,sourceSha256:m.original.sha256,mime:m.object.mime,preparedId:m.preparedId}))};
}
async function valid(tx:DocumentTransaction,row:Row){
 if(row.desired!=='run'||row.approved_revision!==row.revision||row.approved_hash!==hash(row.snapshot)||!row.approved_by||!row.provider_fetch_approved)return false;
 try{await companyAccess(tx,{role:'authenticated',id:row.approved_by},row.company_id,'content.approve');const s=await sources(tx,row.company_id,row.item_id,row.creative_id);return s.profileVersion===row.profile_version&&s.channel.id===row.snapshot.channelId&&s.channel.remote_id===row.snapshot.pageId&&s.channel.metadata.instagramId===row.snapshot.instagramId&&s.object.sha256===row.snapshot.assetSha256&&s.objectPath===row.snapshot.objectPath&&hash(s.media)===hash(row.snapshot.media)&&s.item.revision===row.snapshot.itemRevision&&hash(s.item.details)===row.snapshot.contentHash;}catch{return false;}
}
async function lease(tx:DocumentTransaction,args:Row){const row=await tx.get(table,uuid(args.p_id));return row&&row.lease_token===args.p_token&&live(row)?row:null;}
export async function socialPublicationRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<unknown>{
 if(['create_social_publication','edit_social_publication','approve_social_publication','control_social_publication'].includes(name)){
  const company=uuid(args.p_company_id),id=uuid(args.p_id),cap=await companyAccess(tx,actor,company,['create_social_publication','edit_social_publication'].includes(name)?'marketing.write':'content.approve');
  const row=await tx.get(table,id);
  if(name==='create_social_publication'){
   const itemId=uuid(args.p_item_id),creativeId=uuid(args.p_creative_id),caption=text(args.p_caption,1,2200),scheduledAt=text(args.p_scheduled_at,20,40);if(!Number.isFinite(Date.parse(scheduledAt))||Date.parse(scheduledAt)<Date.now()+300000)throw fail('22023','Schedule five minutes ahead');
   const s=await sources(tx,company,itemId,creativeId),snapshot={channelId:s.channel.id,pageId:s.channel.remote_id,instagramId:s.channel.metadata.instagramId,itemRevision:s.item.revision,contentHash:hash(s.item.details),objectPath:s.objectPath,assetSha256:s.object.sha256,mime:s.object.mime,media:s.media,format:s.item.format==='carrossel'?'carousel':s.object.mime==='video/mp4'?'reels':'image',caption,scheduledAt};
   if(row){if(row.company_id!==company||row.item_id!==itemId||row.creative_id!==creativeId||hash(row.snapshot)!==hash(snapshot))throw fail('40001','Publication request conflict');return row;}
   // One publication intent per calendar revision and account. The anchor also
   // serializes independent request IDs so retries cannot create duplicate posts.
   const key=hash({company,itemId,revision:s.item.revision,instagram:snapshot.instagramId}),prior=await tx.get('social_publication_keys',key);if(prior)throw fail('40001','This content revision already has a publication intent');
   const draft={id,company_id:company,item_id:itemId,creative_id:creativeId,profile_version:s.profileVersion,revision:1,snapshot,status:'draft',desired:'run',approved_revision:null,approved_hash:null,approved_by:null,approved_at:null,provider_fetch_approved:false,remote:{},attempts:0,lease_token:null,lease_until:null,next_attempt_at:scheduledAt,error:null,created_at:now(),updated_at:now()};tx.put('social_publication_keys',key,{company_id:company,publication_id:id});tx.put(table,id,draft);audit(tx,actor,cap.company,'social.draft',{publicationId:id,account:snapshot.instagramId});return draft;
  }
  if(!row||row.company_id!==company||row.revision!==args.p_revision)throw fail('40001','Publication changed');
  if(name==='edit_social_publication'){if(!['draft','approved','paused','blocked'].includes(row.status)||live(row)||Object.keys(row.remote??{}).length)throw fail('40001','Started provider operations require a newly reviewed content revision');const caption=text(args.p_caption,1,2200),scheduledAt=text(args.p_scheduled_at,20,40);if(!Number.isFinite(Date.parse(scheduledAt))||Date.parse(scheduledAt)<Date.now()+300000)throw fail('22023','Schedule five minutes ahead');const s=await sources(tx,company,row.item_id,row.creative_id);if(hash(s.media)!==hash(row.snapshot.media)||s.profileVersion!==row.profile_version||s.item.revision!==row.snapshot.itemRevision)throw fail('40001','Approved source version changed');const revised={...row,snapshot:{...row.snapshot,caption,scheduledAt},revision:row.revision+1,status:'draft',desired:'run',approved_revision:null,approved_hash:null,approved_by:null,approved_at:null,provider_fetch_approved:false,next_attempt_at:scheduledAt,error:null,updated_at:now()};tx.put(table,id,revised);audit(tx,actor,cap.company,'social.revised',{publicationId:id,revision:revised.revision});return revised;}
  if(name==='approve_social_publication'){
   if(args.p_provider_fetch!==true)throw fail('22023','Explicit temporary provider asset access approval required');
   if(row.status!=='draft'||Date.parse(row.snapshot.scheduledAt)<Date.now()+300000)throw fail('40001','Review publication and future schedule');
   const next={...row,status:'approved',approved_revision:row.revision,approved_hash:hash(row.snapshot),approved_by:actor.id,approved_at:now(),provider_fetch_approved:true};if(!await valid(tx,next))throw fail('40001','Content or Instagram account changed');tx.put(table,id,next);audit(tx,actor,cap.company,'social.approved',{publicationId:id,revision:row.revision,snapshot:row.snapshot,temporaryProviderFetch:true});return next;
  }
  if(!['pause','cancel','revoke'].includes(args.p_action))throw fail('22023','Invalid control');if(row.status==='published')throw fail('40001','Published media cannot be retracted by this operation');
  // An in-flight publish can have succeeded remotely. Keep it reconcilable;
  // revocation stops further mutation but cannot undo an already accepted post.
  const uncertain=Boolean(row.remote?.publishStarted);const next={...row,desired:args.p_action==='cancel'?'cancel':'pause',status:uncertain?'reconciling':args.p_action==='cancel'?'cancelled':'paused',approved_revision:null,provider_fetch_approved:false,next_attempt_at:now(),updated_at:now()};tx.put(table,id,next);audit(tx,actor,cap.company,'social.'+args.p_action,{publicationId:id,revision:row.revision,remoteOutcomePending:uncertain});return next;
 }
 server(actor);
 if(['prepare_social_media_context_server','record_social_media_server','read_social_media_server'].includes(name)){
  const company=uuid(args.p_company_id),customer:FirestoreActor={role:'authenticated',id:uuid(args.p_actor)};await companyAccess(tx,customer,company,name==='read_social_media_server'?'marketing.read':'marketing.write');
  if(name==='read_social_media_server'){const row=await tx.get('social_media_assets',text(args.p_id,64,64));if(row?.company_id!==company)throw fail('42501','Media unavailable');return row;}
  const s=await sources(tx,company,uuid(args.p_item_id),uuid(args.p_creative_id),true);
  if(name==='prepare_social_media_context_server'){let requiredCreativeIds:string[]=[];if(s.item.format==='carrossel'&&s.asset.frame===0){const count=s.item.details?.slides?.length??0;if(count<2||count>10)throw fail('22023','Use 2 to 10 carousel frames');const frames=(await tx.list('company_creatives',scoped(company))).filter(a=>a.item_id===s.item.id&&a.revision===s.item.revision).sort((a,b)=>String(b.created_at??'').localeCompare(String(a.created_at??''))||String(b.id).localeCompare(String(a.id)));requiredCreativeIds=Array.from({length:count-1},(_,i)=>frames.find(a=>a.frame===i+1)?.id);if(requiredCreativeIds.some(id=>!id))throw fail('40001','All carousel frames required');}return {requiredCreativeIds,key:s.key,sourceSha256:s.original.sha256,sourceMime:s.original.mime,sourcePath:s.asset.object_path,targetPath:company+'/social/'+s.key+'.jpg'};}
  if(args.p_source_sha256!==s.original.sha256||args.p_id!==s.key)throw fail('40001','Source creative changed');const path=company+'/social/'+s.key+'.jpg',object=await tx.get('storage_objects',hash('company-assets/'+path));if(!object||object.company_id!==company||object.status!=='ready'||object.mime!=='image/jpeg')throw fail('40001','Stored derivative required');
  const prepared={id:s.key,company_id:company,item_id:s.item.id,creative_id:s.asset.id,source_sha256:s.original.sha256,object_path:path,sha256:object.sha256,mime:'image/jpeg',conversion:SOCIAL_MEDIA_CONVERSION,created_at:now()};const prior=await tx.get('social_media_assets',s.key);if(prior&&prior.sha256!==prepared.sha256)throw fail('40001','Immutable derivative conflict');tx.put('social_media_assets',s.key,prior??prepared);return prior??prepared;
 }
 if(name==='claim_social_publication_server'){
  const rows=await tx.list(table);for(const row of rows.sort((a,b)=>String(a.next_attempt_at).localeCompare(String(b.next_attempt_at)))){
   if(!['approved','processing','reconciling'].includes(row.status)||live(row)||Date.parse(row.next_attempt_at)>Date.now())continue;if(row.attempts>=8){if(!row.error)tx.put(table,row.id,{...row,status:row.remote?.publishStarted||row.remote?.containerStarted&&!row.remote?.containerId||Object.keys(row.remote??{}).some(k=>/^child\d+Started$/.test(k)&&!row.remote[k.replace('Started','Id')])?'reconciling':'blocked',error:'Automatic observation limit reached. Manual provider review is required.',updated_at:now()});continue;}
   const reconcile=Boolean(row.remote?.publishStarted||row.remote?.containerStarted&&!row.remote?.containerId||Object.keys(row.remote??{}).some(k=>/^child\d+Started$/.test(k)&&!row.remote[k.replace('Started','Id')]));if(!reconcile&&!await valid(tx,row)){tx.put(table,row.id,{...row,status:'stale',error:'Approval, content or account changed',updated_at:now()});continue;}
   const claimed={...row,lease_token:randomUUID(),lease_until:expiry(),attempts:row.attempts+1,updated_at:now()};tx.put(table,row.id,claimed);return {...claimed,reconcileOnly:reconcile};
  }return null;
 }
 const row=await lease(tx,args);if(name==='social_publication_guard_server'){if(!row||!await valid(tx,row))return false;tx.put(table,row.id,{...row,lease_until:expiry()});return true;}
 if(!row){if(name==='finish_social_publication_server')return false;throw fail('40001','Lease expired');}
 if(name==='social_publication_context_server'){
  const channel=await tx.get('company_channels',row.snapshot.channelId),secret=await tx.get('channel_secrets',row.snapshot.channelId);if(!channel||channel.company_id!==row.company_id||channel.status!=='connected'||channel.remote_id!==row.snapshot.pageId||channel.metadata?.instagramId!==row.snapshot.instagramId||!secret||secret.company_id!==row.company_id||secret.channel_id!==channel.id||!secret.cipher)throw fail('40001','Instagram account unavailable');return {cipher:secret.cipher,metadata:channel.metadata,snapshot:row.snapshot};
 }
 if(name==='social_publication_step_server'){
  const step=text(args.p_step);if(!['container','publish',...Array.from({length:10},(_,i)=>'child'+i)].includes(step))throw fail('22023','Invalid step');const key=row.id+'_'+row.revision+'_'+step,prior=await tx.get('social_publication_steps',key);
  if(args.p_result){const result=text(args.p_result,1,100);if(!/^\d+$/.test(result)||!prior||prior.external_id&&prior.external_id!==result)throw fail('40001','Invalid provider result');tx.put('social_publication_steps',key,{...prior,status:'done',external_id:result});tx.put(table,row.id,{...row,remote:{...row.remote,[step==='container'?'containerId':step==='publish'?'mediaId':step+'Id']:result}});return {status:'saved'};}
  if(prior?.status==='done')return {status:'done',id:prior.external_id};if(prior)return {status:'reconcile'};if(!await valid(tx,row))throw fail('40001','Approval changed');
  tx.put('social_publication_steps',key,{company_id:row.company_id,publication_id:row.id,revision:row.revision,step,status:'started',external_id:null,created_at:now()});tx.put(table,row.id,{...row,remote:{...row.remote,[step==='container'?'containerStarted':step==='publish'?'publishStarted':step+'Started']:true}});return {status:'execute'};
 }
 if(name==='finish_social_publication_server'){
  const state=args.p_status;if(!['processing','published','blocked','reconciling','stale'].includes(state))throw fail('22023','Invalid status');if(state==='published'&&!(row.remote.mediaId||args.p_observed==='PUBLISHED'&&row.remote.containerId&&row.remote.publishStarted))throw fail('40001','Confirmed provider publication required');
  const status=state==='processing'&&!await valid(tx,row)?'stale':state;tx.put(table,row.id,{...row,status,lease_token:null,lease_until:null,next_attempt_at:new Date(Date.now()+(status==='reconciling'?60000:30000)).toISOString(),error:args.p_error?text(args.p_error,1,500):null,observed:args.p_observed??null,updated_at:now()});const company=await tx.get('companies',row.company_id);if(company)audit(tx,{role:'authenticated',id:row.approved_by},company,'social.execution',{publicationId:row.id,status,observed:args.p_observed??null});return true;
 }
 return fail('FIRESTORE_OPERATION_PENDING','Organic publication operation unavailable');
}
