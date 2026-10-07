import {invalidateCompetitorSelection} from './competitor-invalidation';
import {purchaseState} from './commerce';
export {purchaseState} from './commerce';
import {randomUUID} from 'node:crypto';
import {medicalIntakeAnswersWithBusinessType,medicalAnswerSchemas,medicalIntakeSteps,medicalIntakeRequestSchema,type MedicalIntakeAnswers,type MedicalIntakeStep} from '@askadia/contracts';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,user,uuid,hash,companyAccess,capabilities,audit,fail,scopedRows} from './access';
const now=()=>new Date().toISOString();
async function validAnswer(tx:DocumentTransaction,company:string,step:MedicalIntakeStep,value:unknown){
 const parsed=medicalAnswerSchemas[step].safeParse(value);if(!parsed.success)fail('22023','Invalid medical answer');
 const answer=parsed.data as Row;
 const ids=step==='history'&&answer.mode==='pdf'||step==='logo'&&answer.mode==='upload'?[answer.attachmentId]:step==='photos'?answer.attachmentIds:[];
 for(const id of ids){const file=await tx.get('onboarding_attachments',uuid(id));if(!file||file.company_id!==company||(step==='history'?file.mime!=='application/pdf':!['image/png','image/jpeg','image/webp'].includes(file.mime)))fail('42501','Company attachment required');}
 return answer;
}
export async function onboardingSnapshot(tx:DocumentTransaction,actor:FirestoreActor,id:string){
 await companyAccess(tx,actor,id,'marketing.read');const state=await tx.get('company_onboarding',id);if(!state)fail('22023','Onboarding unavailable');
 const [messages,attachments,versions,cap]=await Promise.all([scopedRows(tx,'onboarding_messages',[{field:'company_id',value:id}]),scopedRows(tx,'onboarding_attachments',[{field:'company_id',value:id}]),tx.list('company_profile_versions',[{field:'company_id',value:id}],{limit:1,orderBy:'version',descending:true}),capabilities(tx,actor,id)]);
 const confirmed=state!.profile_version>0&&state!.confirmed_revision===state!.revision;
 return {state,step:confirmed?'confirmed':'review',question:confirmed?'Cadastro confirmado.':'Complete o cadastro médico.',messages:messages.sort((a,b)=>a.created_at.localeCompare(b.created_at)),attachments:attachments.sort((a,b)=>a.created_at.localeCompare(b.created_at)),confirmedProfile:versions.sort((a,b)=>b.version-a.version)[0]??null,capabilities:cap};
}
export async function saveMedicalIntake(tx:DocumentTransaction,actor:FirestoreActor,args:Row){
 const id=uuid(args.p_company_id),{company}=await companyAccess(tx,actor,id,'marketing.write');
 const parsed=medicalIntakeRequestSchema.safeParse({requestId:args.p_request_id,revision:args.p_revision,step:args.p_step,answer:args.p_answer});if(!parsed.success)fail('22023','Invalid intake request');
 const input=parsed.data!,state=await tx.get('company_onboarding',id);if(!state)fail('22023','Onboarding unavailable');
 const key=id+'_'+input.requestId,fp=hash({step:input.step,answer:input.answer,revision:input.revision}),prior=await tx.get('medical_intake_requests',key);
 if(prior){if(prior.actor_id!==user(actor)||prior.fingerprint!==fp)fail('40001','Request changed');return onboardingSnapshot(tx,actor,id);}
 if(input.revision!==state!.revision)fail('40001','Profile changed');
 const answers:MedicalIntakeAnswers=medicalIntakeAnswersWithBusinessType(structuredClone(state!.medical_intake?.answers??{}));
 for(const step of medicalIntakeSteps){if(step===input.step)break;await validAnswer(tx,id,step,answers[step]);}
 const next:Row={...state!,revision:state!.revision+1,confirmed_revision:null as number|null,updated_at:now()};
 if(input.step==='confirm'){
  const a=answers as Required<MedicalIntakeAnswers>;
  const type=a.businessType.value,identity=type==='clinic'?'da clínica':'do consultório';
  const values:Row={cnpj:a.cnpj.value,name:a.address.name,city:a.address.city+' - '+a.address.uf,uf:a.address.uf,businessType:type==='clinic'?'Clínica':'Consultório médico',address:a.address.addressLine+' · CEP '+a.address.postalCode,services:a.specialty.values.join(', '),history:a.history.mode==='text'?a.history.text:'História profissional fornecida no currículo PDF privado. Usar o documento, sem inventar qualificações.',curriculumAttachmentId:a.history.mode==='pdf'?a.history.attachmentId:null,logoPreference:a.logo.mode,logoAttachmentId:a.logo.mode==='upload'?a.logo.attachmentId:null,brand:a.logo.mode==='create'?'Criar proposta de logo com estilo '+a.logo.style+'. Identidade própria '+identity+'; sujeita a revisão.':'Usar o logo anexado e preservar a identidade '+identity+'.',clinicPhotoIds:JSON.stringify(a.photos.attachmentIds),websitePreference:a.website.mode,websiteUrl:a.website.mode==='existing'?a.website.url:null,channels:a.website.mode==='existing'?'Site: '+a.website.url:'Criação automática de rascunho de site solicitada; publicação depende de revisão.'};
  const facts:Row={...state!.facts};for(const [k,value] of Object.entries(values))facts[k]={value,status:value===null?'unknown':'provided',source:'user',actorId:actor.id,updatedAt:now()};
  for(const k of ['audience','objective','structure','hours','offers','sales','budget','video','management','competitors','references'])facts[k]??={value:null,status:'deferred',source:'user',actorId:actor.id,updatedAt:now()};
  next.facts=facts;next.profile_version=state!.profile_version+1;next.confirmed_revision=next.revision;next.location_confirmed=true;
  tx.put('company_profile_versions',id+'_'+next.profile_version,{id:randomUUID(),company_id:id,version:next.profile_version,facts,confirmed_by:actor.id,created_at:now()});
  tx.put('companies',id,{...company,name:a.address.name,city:a.address.city+' - '+a.address.uf,segment:type,updated_at:now()});
  if(state!.profile_version>0){const impact=randomUUID();tx.put('company_profile_impacts',impact,{id:impact,company_id:id,from_version:state!.profile_version,to_version:next.profile_version,reason:'Cadastro médico atualizado: revisar estratégia e materiais.',created_at:now()});}
 }else{
  await validAnswer(tx,id,input.step,input.answer);
  if(input.step==='address'&&input.answer.businessType!==answers.businessType?.value)fail('22023','O tipo do endereço deve corresponder à primeira resposta.');
  if(input.step==='businessType'&&answers.address)answers.address={...answers.address,businessType:input.answer.value};
  if(input.step==='cnpj'&&hash(answers.cnpj??null)!==hash(input.answer)){delete answers.address;next.location_confirmed=false;}
  if(state!.profile_version>0&&['businessType','cnpj','address','specialty'].includes(input.step)&&hash(answers[input.step]??null)!==hash(input.answer))await invalidateCompetitorSelection(tx,id,next);
  Object.assign(answers,{[input.step]:input.answer});
 }
 // Every profile edit invalidates downstream approvals, including legacy rows
 // without a profile version, while preserving the approval evidence.
 const approvals=await scopedRows(tx,'company_marketing_approvals',[{field:'company_id',value:id}]);for(const approval of approvals)tx.put('company_marketing_approvals',approval.id,{...approval,invalidated_at:now()});
 next.medical_intake={version:1,answers};tx.put('company_onboarding',id,next);
 tx.put('medical_intake_requests',key,{company_id:id,request_id:input.requestId,actor_id:actor.id,fingerprint:fp,created_at:now()});
 const messageId=randomUUID();tx.put('onboarding_messages',messageId,{id:messageId,company_id:id,role:'user',body:input.step==='confirm'?'Confirmei as informações do cadastro médico.':'Resposta salva no cadastro médico: '+input.step,actor_id:actor.id,request_id:input.requestId,created_at:now()});
 audit(tx,actor,company,input.step==='confirm'?'profile.confirmed':'medical_intake.updated',{step:input.step,revision:next.revision,version:next.profile_version});return onboardingSnapshot(tx,actor,id);
}
export const onboardingOperations=['company_onboarding_read','company_purchase_state','save_medical_intake'];
export async function onboardingRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 const id=uuid(args.p_company_id);
 if(name==='company_onboarding_read')return onboardingSnapshot(tx,actor,id);
 if(name==='company_purchase_state')return purchaseState(tx,actor,id);
 if(name==='save_medical_intake')return saveMedicalIntake(tx,actor,args);
 return fail('FIRESTORE_OPERATION_PENDING','Operação ainda não migrada para Firestore.');
}
