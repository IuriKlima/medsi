import {z} from 'zod';

export const brazilStates={AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'} as const;
export const normalizeCnpj=(value:string)=>value.toUpperCase().replace(/[./\s-]/g,'');
/** Receita Federal: twelve alphanumeric characters and two numeric check digits. */
export function validCnpj(value:string){
 const cnpj=normalizeCnpj(value);
 if(!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)||/^(.)\1{13}$/.test(cnpj))return false;
 const digit=(part:string)=>{let sum=0,weight=2;for(let i=part.length-1;i>=0;i--){sum+=(part.charCodeAt(i)-48)*weight;weight=weight===9?2:weight+1;}const mod=sum%11;return String(mod<2?0:11-mod);};
 return digit(cnpj.slice(0,12))===cnpj[12]&&digit(cnpj.slice(0,13))===cnpj[13];
}
export const cnpjSchema=z.string().trim().max(24).transform(normalizeCnpj).refine(validCnpj,'Confira os 14 caracteres e os dígitos do CNPJ.');
export const medicalSpecialties=['Clínica médica','Cardiologia','Dermatologia','Ginecologia e obstetrícia','Ortopedia e traumatologia','Pediatria','Psiquiatria','Oftalmologia','Endocrinologia e metabologia','Neurologia','Otorrinolaringologia','Clínica com várias especialidades'] as const;
export const logoStyles=['Minimalista','Acolhedor','Contemporâneo'] as const;
export const medicalIntakeSteps=['businessType','cnpj','address','specialty','history','logo','photos','website'] as const;
export type MedicalIntakeStep=typeof medicalIntakeSteps[number];
export const medicalIntakeLabels:Record<MedicalIntakeStep,string>={businessType:'Clínica ou consultório',cnpj:'CNPJ',address:'Endereço',specialty:'Especialidade',history:'Sua história',logo:'Sua marca',photos:'Fotos',website:'Site'};
export const medicalAnswerSchemas={
 businessType:z.object({value:z.enum(['clinic','medical_practice'])}).strict(),
 cnpj:z.object({value:cnpjSchema}).strict(),
 address:z.object({name:z.string().trim().min(2).max(100),addressLine:z.string().trim().min(5).max(500),city:z.string().trim().min(2).max(90),uf:z.string().refine(v=>Object.hasOwn(brazilStates,v),'Selecione o estado.'),postalCode:z.string().regex(/^\d{8}$/,'Informe o CEP com oito números.'),businessType:z.enum(['clinic','medical_practice'])}).strict(),
 specialty:z.object({values:z.array(z.string().trim().min(2).max(100)).min(1).max(20).refine(v=>new Set(v).size===v.length)}).strict(),
 history:z.discriminatedUnion('mode',[
  z.object({mode:z.literal('text'),text:z.string().trim().min(20).max(6000)}).strict(),
  z.object({mode:z.literal('pdf'),attachmentId:z.uuid()}).strict(),
 ]),
 logo:z.discriminatedUnion('mode',[
  z.object({mode:z.literal('upload'),attachmentId:z.uuid()}).strict(),
  z.object({mode:z.literal('create'),style:z.enum(logoStyles)}).strict(),
 ]),
 photos:z.object({mode:z.enum(['upload','skip']),attachmentIds:z.array(z.uuid()).max(12)}).strict().refine(v=>new Set(v.attachmentIds).size===v.attachmentIds.length&&(v.mode==='upload'?v.attachmentIds.length>0:v.attachmentIds.length===0),'Escolha as fotos ou continue sem fotos.'),
 website:z.discriminatedUnion('mode',[
  z.object({mode:z.literal('existing'),url:z.url().max(2000).refine(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Informe um endereço HTTPS público.')}).strict(),
  z.object({mode:z.literal('create')}).strict(),
 ]),
};
export type MedicalIntakeAnswers={ [K in MedicalIntakeStep]?:z.infer<typeof medicalAnswerSchemas[K]> };
const base={requestId:z.uuid(),revision:z.number().int().nonnegative()};
export const medicalIntakeRequestSchema=z.discriminatedUnion('step',[
 z.object({...base,step:z.literal('businessType'),answer:medicalAnswerSchemas.businessType}).strict(),
 z.object({...base,step:z.literal('cnpj'),answer:medicalAnswerSchemas.cnpj}).strict(),
 z.object({...base,step:z.literal('address'),answer:medicalAnswerSchemas.address}).strict(),
 z.object({...base,step:z.literal('specialty'),answer:medicalAnswerSchemas.specialty}).strict(),
 z.object({...base,step:z.literal('history'),answer:medicalAnswerSchemas.history}).strict(),
 z.object({...base,step:z.literal('logo'),answer:medicalAnswerSchemas.logo}).strict(),
 z.object({...base,step:z.literal('photos'),answer:medicalAnswerSchemas.photos}).strict(),
 z.object({...base,step:z.literal('website'),answer:medicalAnswerSchemas.website}).strict(),
 z.object({...base,step:z.literal('confirm'),answer:z.object({}).strict()}).strict(),
]);
export type MedicalIntake={version:1;answers:MedicalIntakeAnswers};
/** Read older profiles without rewriting their saved or confirmed version. */
export function medicalIntakeAnswersWithBusinessType(answers:MedicalIntakeAnswers={}):MedicalIntakeAnswers{
 if(answers.businessType||!medicalAnswerSchemas.address.safeParse(answers.address).success)return {...answers};
 return {...answers,businessType:{value:answers.address!.businessType}};
}
export function nextMedicalIntakeStep(intake:MedicalIntake|null|undefined){const answers=medicalIntakeAnswersWithBusinessType(intake?.answers);return medicalIntakeSteps.find(step=>!medicalAnswerSchemas[step].safeParse(answers[step]).success)??'review';}
export type CnpjLookupResult={status:'available'|'not_found'|'unavailable'|'unconfigured';source:string;sourceUrl:string;collectedAt:string|null;message:string;data:null|{cnpj:string;legalName:string;tradeName:string;addressLine:string;city:string;uf:string;postalCode:string;registrationStatus:string}};
