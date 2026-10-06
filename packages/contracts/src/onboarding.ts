import { z } from 'zod';
export const profileKeys=['name','city','businessType','address','services','audience','objective','structure','hours','offers','sales','history','budget','brand','channels','video','management','competitors','references','placeId','competitorPlaceIds','cnpj','uf','curriculumAttachmentId','logoPreference','logoAttachmentId','clinicPhotoIds','websitePreference','websiteUrl'] as const;
export type ProfileKey=typeof profileKeys[number];
export const factInputSchema=z.object({value:z.string().trim().max(6000).nullable(),status:z.enum(['provided','unknown','deferred'])}).strict().refine(f=>f.status!=='provided'||Boolean(f.value),'Informe o valor ou marque como desconhecido.');
export type FactInput=z.infer<typeof factInputSchema>;
export type ProfileFact=FactInput & {source:'user'|'existing'|'assistant_suggestion';updatedAt:string;actorId:string|null};
export type ProfileFacts=Partial<Record<ProfileKey,ProfileFact>>;
export const profilePatchSchema=z.partialRecord(z.enum(profileKeys),factInputSchema);
export const onboardingActions=['reply','confirm_location','review_competitors','review_references','edit','confirm','reopen'] as const;
export const onboardingReplySchema=z.object({requestId:z.uuid(),revision:z.number().int().min(0),message:z.string().trim().min(1).max(6000),answers:profilePatchSchema.default({}),action:z.enum(onboardingActions).default('reply')}).strict();
export const beginCompanySchema=z.object({requestId:z.uuid(),workspaceId:z.uuid().nullable().default(null)}).strict();
export const interviewKeys=['services','audience','objective','structure','hours','offers','sales','history','budget','brand','channels','video','management'] as const;
export const essentialKeys=['name','city','businessType','services','audience','objective'] as const;
export const labels:Record<ProfileKey,string>={name:'Nome da clínica ou consultório',city:'Cidade e região atendida',businessType:'Tipo de negócio',address:'Endereço',services:'Especialidades e serviços',audience:'Público desejado',objective:'Objetivo e capacidade',structure:'Estrutura e diferenciais',hours:'Horários e períodos ociosos',offers:'Valores, convênios e condições',sales:'Atendimento e agendamento',history:'Histórico de marketing',budget:'Orçamento de anúncios',brand:'Identidade e materiais',channels:'Site e canais',video:'Produção de vídeos',management:'Sistema de gestão',competitors:'Concorrentes locais',references:'Referências de comunicação',placeId:'Local selecionado no Google',competitorPlaceIds:'Locais concorrentes selecionados',cnpj:'CNPJ',uf:'Estado',curriculumAttachmentId:'Currículo PDF',logoPreference:'Preferência de logo',logoAttachmentId:'Logo anexado',clinicPhotoIds:'Fotos da clínica',websitePreference:'Preferência de site',websiteUrl:'Endereço do site'};
export const questions:Record<string,string>={
 identity:'Qual é o nome da sua clínica ou consultório?' ,
 city:'Em qual cidade fica sua clínica? Se puder, informe também o estado.',businessType:'Que tipo de negócio é o seu: clínica, consultório médico ou outra atividade de saúde?',
 location:'Vamos confirmar a localização da empresa. Informe o endereço ou a região atendida. Você pode conferir as opções no Google ou continuar manualmente.',
 competitors:'Agora vamos conhecer os concorrentes locais. Revise os resultados da pesquisa ou indique quem disputa o mesmo público na sua região.',
 references:'Quais marcas ou empresas você admira, mesmo de outras regiões? Conte o que gosta na comunicação, oferta, estética ou atendimento delas.',
 services:'Quais especialidades, consultas e serviços sua clínica ou consultório oferece?',audience:'Quem você quer atrair? Conte sobre o público, suas necessidades e principais objeções.',objective:'Qual é o principal objetivo do marketing agora? Se souber, inclua uma meta e quantas pessoas sua equipe consegue atender.',
 structure:'O que diferencia sua empresa? Conte sobre instalações, equipe, acessibilidade e diferenciais verificáveis. Informe também a identificação profissional autorizada: nome, CRM/UF e RQE quando aplicável, e responsável técnico da clínica. Não envie dados de pacientes.',hours:'Quais são os horários de funcionamento e os períodos que precisam de mais movimento?',offers:'Quais valores, convênios e condições de atendimento podemos informar? Inclua apenas dados que sua equipe autorizou divulgar. O que não souber fica pendente.',sales:'Como funciona o atendimento de uma pessoa interessada? Conte quem responde, em quais horários, como ela solicita uma consulta e quem confirma o agendamento.',history:'O que sua clínica ou consultório já fez de marketing? Conte o que funcionou e o que gostaria de mudar.',budget:'Existe um orçamento disponível para anúncios? Informar um valor aqui não autoriza nenhum gasto.',brand:'Como sua marca deve se apresentar? Conte sobre cores, estilo e tom de voz. Você pode anexar logo, fotos e materiais autorizados agora ou depois.',channels:'Sua empresa tem site, Instagram, Facebook ou WhatsApp? Informe os endereços ou diga quais ainda precisa criar. Conecte as contas no painel desta etapa para autorizar o acesso.',video:'Sua equipe consegue gravar vídeos? Quem seria responsável e com qual frequência? Conteúdos estáticos também são uma opção.',management:'Qual sistema de gestão sua empresa utiliza? Essa informação ajuda a planejar uma futura integração, sem conectar nada automaticamente.',review:'Confira o resumo do seu negócio. Corrija o que precisar e confirme apenas as informações que podem orientar o trabalho dos agentes.',complete:'Seu perfil está confirmado. Vamos revisar os concorrentes e aprovar sua estratégia por etapas. Depois das aprovações, a MedSI prepara as entregas.'};
export type OnboardingState={medical_intake?:import('./medical-intake').MedicalIntake|null;company_id:string;revision:number;facts:ProfileFacts;location_confirmed:boolean;competitors_reviewed:boolean;references_reviewed:boolean;confirmed_revision:number|null;profile_version:number;updated_at:string};
export function onboardingStep(s:OnboardingState):string{
 if(s.confirmed_revision===s.revision)return 'complete';
 if(s.facts.name?.status!=='provided')return 'identity';
 if(s.facts.city?.status!=='provided')return 'city';
 if(!s.location_confirmed)return 'location';
 if(s.facts.businessType?.status!=='provided')return 'businessType';if(!s.competitors_reviewed)return 'competitors';if(!s.references_reviewed)return 'references';
 return interviewKeys.find(k=>!s.facts[k])??'review';
}
export function missingEssentials(facts:ProfileFacts){return essentialKeys.filter(k=>facts[k]?.status!=='provided'||!facts[k]?.value?.trim());}
export type OnboardingMessage={id:string;role:'user'|'assistant';body:string;created_at:string;actor_id:string|null;request_id:string|null};
export type OnboardingAttachment={id:string;company_id:string;name:string;mime:string;size:number;object_path:string;created_at:string};
export type OnboardingSnapshot={state:OnboardingState;messages:OnboardingMessage[];attachments:OnboardingAttachment[];capabilities:{actions:string[]};confirmedProfile:{version:number;facts:ProfileFacts;confirmed_at:string}|null;provider:{mode:'guided'|'configured';message:string;aiAllowed?:boolean};step:string;question:string};
export type PlaceOption={id:string;name:string;address:string;latitude:number|null;longitude:number|null;url:string;attributions:{displayName:string;uri:string}[];details?:PlaceDetails};
export type PlaceSearchResult={status:'available'|'unconfigured'|'unavailable';places:PlaceOption[];message:string;radius:number|null;center?:{latitude:number;longitude:number};mapKey?:string};

// Conservative fallback: only explicit labelled facts or a clear name/city pair.
// Free text for the current topic is saved intact. No model output is simulated.
export function guidedAnswers(step:string,message:string):Partial<Record<ProfileKey,FactInput>>{
 const answer:Partial<Record<ProfileKey,FactInput>>={};
 const normalized=message.trim().toLocaleLowerCase('pt-BR');
 const status=/^(não sei|nao sei|não tenho|nao tenho|não tenho referências|sem referências)$/i.test(normalized)?'unknown':/^(responder depois|depois|pular)$/i.test(normalized)?'deferred':'provided';
 const fact:FactInput={value:status==='provided'?message.trim():null,status};
 const topic=step==='identity'?'name':step==='location'?'address':step;
 if(profileKeys.includes(topic as ProfileKey))answer[topic as ProfileKey]=fact;
 if(step==='identity'&&status==='provided'){
  const locationOnly=message.trim().match(/^(?:no centro de|na cidade de|na região de|em|fica em|fica no centro de|estamos em)\s+([^;\n:]{2,100})\.?$/i);
  const pair=message.match(/^(.{2,100}?)\s+(?:em|na cidade de)\s+(.{2,100}?)\.?$/i)??message.match(/^([^,;\n]{2,100})[,;]\s*([^,;\n]{2,100})$/);
  if(locationOnly){delete answer.name;answer.city={value:locationOnly[1]!.trim(),status:'provided'};}
  else if(pair){answer.name={value:pair[1]!.trim(),status:'provided'};answer.city={value:pair[2]!.trim(),status:'provided'};}
 }
 const aliases:Record<string,ProfileKey>={nome:'name',cidade:'city',região:'city',tipo:'businessType',serviços:'services',modalidades:'services',especialidades:'services',convênios:'offers',público:'audience',objetivo:'objective',horários:'hours',preços:'offers',site:'channels',referências:'references'};
 for(const line of message.split(/[;\n]/)){const match=line.trim().match(/^([^:]{2,30}):\s*(.+)$/);if(match){const key=aliases[match[1]!.toLocaleLowerCase('pt-BR')];if(key)answer[key]={value:match[2]!.trim(),status:'provided'};}}
 for(const key of ['name','city','businessType'] as const){if((answer[key]?.value?.length??0)>100)delete answer[key];}
 return answer;
}

export type PlaceDetails={businessType:string|null;phone:string|null;website:string|null;hours:string[];rating:number|null;reviewCount:number|null;businessStatus:string|null;collectedAt:string};
export type CompetitorResearch={id:string;place_id:string;label:string;city:string;status:'pending'|'running'|'ready'|'failed'|'stale';candidates:import('./instagram').InstagramCandidate[];error:string|null;collected_at:string|null;selected_username:string|null};
