import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {profilePatchSchema,onboardingReplySchema,missingEssentials,interviewKeys,questions,type OnboardingState,type ProfileFacts} from '@askadia/contracts';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,companyAccess,uuid,hash,audit,fail,user} from './access';
import {onboardingSnapshot} from './onboarding';
import {now,confirmed} from './journey-state';

export const marketingProfileOperations=['save_company_marketing_facts','save_company_onboarding','review_onboarding_competitors'];
export const marketingFactKeys=['audience','objective','structure','hours','offers','sales','budget','brand','channels','video','management','references'] as const;
export const marketingFactsRequest=z.object({requestId:z.uuid(),revision:z.number().int().nonnegative(),facts:profilePatchSchema}).strict().refine(v=>Object.keys(v.facts).length>0&&Object.keys(v.facts).every(k=>marketingFactKeys.includes(k as typeof marketingFactKeys[number])),'Informe somente fatos de marketing.');
const editable=['name','city','businessType','address','services','history','competitors','placeId',...marketingFactKeys];
function publicChannels(value:string){
 for(const match of value.matchAll(/https?:\/\/[^\s,;]+/gi)){let url:URL;try{url=new URL(match[0]);}catch{fail('22023','Invalid public profile URL');}if(url!.protocol!=='https:'||url!.username||url!.password||url!.port||url!.search||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(url!.hostname)||/\.(local|internal|localhost|test|example|invalid)$/i.test(url!.hostname))fail('22023','Use perfis públicos HTTPS sem credenciais ou parâmetros.');}
}
async function invalidateDerived(tx:DocumentTransaction,company:string){
 for(const a of await tx.list('company_marketing_approvals',[{field:'company_id',value:company}]))if(!a.invalidated_at)tx.put('company_marketing_approvals',a.id,{...a,invalidated_at:now()});
 const setup=await tx.get('company_setup',company);if(setup)tx.put('company_setup',company,{...setup,invalidated_at:now()});
 const site=await tx.get('company_sites',company);if(site?.approval)tx.put('company_sites',company,{...site,approval:null});
}
async function view(tx:DocumentTransaction,actor:FirestoreActor,company:string){const snapshot=await onboardingSnapshot(tx,actor,company),state=snapshot.state as OnboardingState;let step:string;
 if(confirmed(state))step='complete';else if(!state.location_confirmed)step='location';else if(!state.competitors_reviewed)step='competitors';else if(!state.references_reviewed)step='references';else step=interviewKeys.find(k=>!state.facts[k]||state.facts[k]?.status==='deferred')??'review';
 return {...snapshot,step,question:questions[step]};
}
async function commitProfile(tx:DocumentTransaction,actor:FirestoreActor,company:Row,state:Row,next:Row,reason:string){
 const version=state.profile_version+1;next.profile_version=version;next.confirmed_revision=next.revision;
 tx.put('company_profile_versions',company.id+'_'+version,{id:randomUUID(),company_id:company.id,version,facts:next.facts,confirmed_by:actor.id,confirmed_at:now(),created_at:now()});
 tx.put('companies',company.id,{...company,name:next.facts.name?.value??company.name,city:next.facts.city?.value??company.city,updated_at:now()});
 const id=randomUUID();tx.put('company_profile_impacts',id,{id,company_id:company.id,from_version:state.profile_version,to_version:version,reason,created_at:now()});
}
export async function marketingProfileRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 const id=uuid(args.p_company_id),access=await companyAccess(tx,actor,id,'marketing.write'),state=await tx.get('company_onboarding',id);if(!state)fail('22023','Onboarding unavailable');
 if(state!.profile_version<1)fail('22023','Conclua o cadastro médico antes dos fatos de marketing.');
 let request:string,revision:number,patch:Row={},action='edit',source='user',message='Confirmei os fatos de marketing desta versão.',places:{placeId:string;label:string}[]|null=null;
 if(name==='save_company_marketing_facts'){
  const input=marketingFactsRequest.safeParse({requestId:args.p_request_id,revision:args.p_revision,facts:args.p_facts});if(!input.success)fail('22023','Confira os fatos de marketing.');request=input.data!.requestId;revision=input.data!.revision;patch=input.data!.facts;
  if(!confirmed(state))fail('40001','Confirme o cadastro médico antes de atualizar o marketing.');action='confirm';
 }else if(name==='save_company_onboarding'){
  const input=onboardingReplySchema.safeParse({requestId:args.p_request_id,revision:args.p_revision,message:args.p_message,answers:args.p_patch,action:args.p_action});if(!input.success)fail('22023','Invalid onboarding answer');request=input.data!.requestId;revision=input.data!.revision;patch=input.data!.answers;action=input.data!.action;message=input.data!.message;
  if(!['user','assistant_suggestion'].includes(args.p_source))fail('22023','Invalid fact origin');source=args.p_source;
  if(Object.keys(patch).some(k=>!editable.includes(k)))fail('22023','Atualize documentos e identidade no cadastro médico.');
 }else{
  const input=z.object({requestId:z.uuid(),revision:z.number().int().nonnegative(),places:z.array(z.object({placeId:z.string().regex(/^[\w-]{5,200}$/),label:z.string().trim().min(1).max(160)}).strict()).max(10)}).strict().safeParse({requestId:args.p_request_id,revision:args.p_revision,places:args.p_places});if(!input.success)fail('22023','Confira os concorrentes selecionados.');request=input.data!.requestId;revision=input.data!.revision;places=input.data!.places;
  if(!state!.location_confirmed)fail('22023','Confirme a localização primeiro.');if(new Set(places.map(p=>p.placeId)).size!==places.length||places.some(p=>p.placeId===state!.facts.placeId?.value))fail('22023','Duplicate or own establishment');
  action='review_competitors';message=places.length?'Confirmei os nomes e IDs dos concorrentes selecionados.':'Continuar com pesquisa de concorrentes pendente.';patch={competitors:{value:places.length?places.map(p=>p.label).join('\n'):null,status:places.length?'provided':'deferred'},competitorPlaceIds:{value:places.length?places.map(p=>p.placeId).join('\n'):null,status:places.length?'provided':'deferred'}};
 }
 const key=id+'_'+request!,fingerprint=hash({name,revision:revision!,patch,action,source,places,message}),prior=await tx.get('marketing_profile_requests',key);
 if(prior){if(prior.actor_id!==user(actor)||prior.fingerprint!==fingerprint)fail('40001','Request changed');return view(tx,actor,id);}
 if(state!.revision!==revision!)fail('40001','Profile changed');
 const facts:ProfileFacts=structuredClone(state!.facts??{});for(const [key,value] of Object.entries(patch)){if(['channels','references'].includes(key)&&value.value)publicChannels(value.value);if(key==='placeId'&&value.value&&!/^[\w-]{5,200}$/.test(value.value))fail('22023','Invalid place ID');facts[key as keyof ProfileFacts]={...value,source,actorId:actor.id,updatedAt:now()} as ProfileFacts[keyof ProfileFacts];}
 const next:Row={...state!,facts,revision:state!.revision+1,confirmed_revision:null,updated_at:now()};
 if(['city','address','placeId'].some(k=>patch[k]&&hash(patch[k])!==hash({value:state!.facts[k]?.value,status:state!.facts[k]?.status})))next.location_confirmed=false;
 if(action==='confirm_location'){if(!facts.city?.value&&!facts.address?.value)fail('22023','Informe a localização.');next.location_confirmed=true;}
 if(action==='review_competitors')next.competitors_reviewed=true;
 if(action==='review_references')next.references_reviewed=true;
 if(action==='confirm'){
  if(name==='save_company_onboarding'&&(missingEssentials(facts).length||!next.location_confirmed))fail('22023','Complete os fatos essenciais e confirme a localização.');
  if(source==='assistant_suggestion')fail('22023','Confirme pessoalmente os fatos antes de criar uma versão.');await commitProfile(tx,actor,access.company,state!,next,'Fatos de marketing atualizados: revisar propostas e materiais.');
 }
 if(places){const old=await tx.list('company_competitor_research',[{field:'company_id',value:id}]);for(const row of old)if(row.origin==='user_confirmed_places_selection'&&!places.some(p=>p.placeId===row.place_id))tx.put('company_competitor_research',row.id,{...row,status:'stale',token:null,lease_until:null});
  for(const place of places){const existing=old.find(p=>p.place_id===place.placeId),rowId=existing?.id??hash({company:id,place:place.placeId});tx.put('company_competitor_research',rowId,{...existing,id:rowId,company_id:id,place_id:place.placeId,label:place.label,city:facts.city?.value??'',actor_id:actor.id,origin:'user_confirmed_places_selection',label_source:'user_confirmed',profile_version:state!.profile_version,regional_revision:null,status:'selected',candidates:[],selected_username:null,attempts:0,token:null,lease_until:null,next_attempt_at:now(),error:null,confirmed_at:now(),collected_at:null});}
 }
 await invalidateDerived(tx,id);tx.put('company_onboarding',id,next);tx.put('marketing_profile_requests',key,{company_id:id,actor_id:actor.id,fingerprint,created_at:now()});
 const messageId=randomUUID();tx.put('onboarding_messages',messageId,{id:messageId,company_id:id,role:'user',body:message,actor_id:actor.id,request_id:request!,created_at:now()});audit(tx,actor,access.company,'profile.marketing_updated',{revision:next.revision,profileVersion:next.profile_version,fields:Object.keys(patch),confirmed:action==='confirm',origin:places?'user_confirmed_places_selection':source});return view(tx,actor,id);
}
