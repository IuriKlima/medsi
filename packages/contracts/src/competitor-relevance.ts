import type {ProfileFacts} from './onboarding';
import type {RegionalCompetitor,RegionalMap} from './regional-map';
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// Explicit synonyms, not inferred qualifications. Unknown services require a literal evidence match.
const groups=[
 ['cardiologia','cardiologista','cardiology','cardiologist'],['pediatria','pediatra','pediatrics','paediatrics','pediatrician'],
 ['dermatologia','dermatologista','dermatology','dermatologist'],['odontologia','odontologico','odontologica','odontologista','dentista','dentist','dental clinic','dentistry'],
 ['fisioterapia','fisioterapeuta','physiotherapy','physiotherapist'],['psicologia','psicologo','psicologa','psychology','psychologist'],
 ['psiquiatria','psiquiatra','psychiatry','psychiatrist'],['ginecologia','ginecologista','gynaecology','gynecology'],
 ['obstetricia','obstetra','obstetrics'],['ortopedia','ortopedista','orthopaedics','orthopedics'],['neurologia','neurologista','neurology'],
 ['oftalmologia','oftalmologista','ophthalmology','ophthalmologist'],['otorrinolaringologia','otorrinolaringologista','otolaryngology'],
 ['endocrinologia','endocrinologista','endocrinology'],['urologia','urologista','urology'],['gastroenterologia','gastroenterologista','gastroenterology'],
 ['geriatria','geriatra','geriatrics'],['oncologia','oncologista','oncology'],['pneumologia','pneumologista','pulmonology'],
 ['reumatologia','reumatologista','rheumatology'],['nefrologia','nefrologista','nephrology'],['nutricao','nutricionista','nutrition','dietitian'],
 ['clinica geral','clinico geral','general practice','general practitioner'],['medicina de familia','family medicine'],
 ['eletrocardiograma','electrocardiogram'],['ecocardiograma','echocardiogram'],['ultrassonografia','ultrasound'],['mamografia','mammography'],
].map(g=>g.map(normalize));
const generic=new Set(['clinica','clinica medica','consultorio','consultorio medico','hospital','doctor','doctors','clinic','medical clinic','health','saude','consultas','consulta','atendimento','multiespecialidade','multiespecialidades']);
const includes=(value:string,term:string)=>term.length>=4&&!generic.has(term)&&(' '+value+' ').includes(' '+term+' ');
const groupsIn=(value:string)=>groups.filter(g=>g.some(alias=>includes(value,alias)));
export function assessCompetitor(candidate:RegionalCompetitor,facts:ProfileFacts):NonNullable<RegionalCompetitor['relevance']>{
 const services=facts.services?.status==='provided'&&facts.services.source!=='assistant_suggestion'?(facts.services.value??'').split(/[,;\n]/).map(s=>s.trim()).filter(Boolean).slice(0,30):[];
 const evidence=[...(candidate.evidence??[]),{kind:'name' as const,value:candidate.name,sourceUrl:candidate.sourceUrl},{kind:'category' as const,value:candidate.category,sourceUrl:candidate.sourceUrl}].filter(e=>e.value&&e.sourceUrl===candidate.sourceUrl);
 const normalized=evidence.map(e=>({e,value:normalize(e.value)})).filter(({value})=>!/(^| )(nao|sem|not|no) /.test(value));
 const requested=services.flatMap(service=>{const known=groupsIn(normalize(service));return known.length>1?known.map(g=>g[0]!):[service];});
 const matchedServices=[...new Set(requested.filter(service=>{const term=normalize(service),aliases=groupsIn(term).flat();return normalized.some(({value})=>includes(value,term)||aliases.some(alias=>includes(value,alias)));}))];
 const supporting=normalized.filter(({value})=>matchedServices.some(service=>{const term=normalize(service);return includes(value,term)||groupsIn(term).flat().some(alias=>includes(value,alias));})).map(({e})=>e);
 if(matchedServices.length)return {status:'compatible',matchedServices:matchedServices.map(s=>s.slice(0,200)),evidence:supporting.slice(0,30),reason:('A fonte menciona '+matchedServices.join(', ')+'. Confira o cadastro antes de selecionar.').slice(0,500)};
 const other=normalized.filter(({value})=>groupsIn(value).length).map(({e})=>e);
 if(services.length&&other.length)return {status:'incompatible',matchedServices:[],evidence:other.slice(0,30),reason:'A fonte informa outra especialidade, sem correspondência com os serviços do cadastro.'};
 return {status:'ambiguous',matchedServices:[],evidence:[],reason:services.length?'Sem evidência suficiente dos serviços do cadastro. Proximidade e nome genérico não confirmam compatibilidade.':'Confirme as especialidades e os serviços do cadastro para avaliar a compatibilidade.'};
}
export function classifyRegionalMap(map:RegionalMap,facts:ProfileFacts):RegionalMap{
 const own=normalize(facts.name?.value??''),seen=new Set<string>(),competitors:RegionalCompetitor[]=[],reviewCandidates:RegionalCompetitor[]=[];
 for(const c of [...map.competitors,...(map.reviewCandidates??[])]){
  if(seen.has(c.id)||own&&normalize(c.name)===own)continue;seen.add(c.id);
  const relevance=assessCompetitor(c,facts),candidate={...c,relevance};
  if(relevance.status==='compatible')competitors.push(candidate);else if(relevance.status==='ambiguous')reviewCandidates.push(candidate);
 }
 const confirmedCandidateIds=(map.confirmedCandidateIds??[]).filter(id=>reviewCandidates.some(c=>c.id===id));
 const selectedIds=map.selectedIds.filter(id=>competitors.some(c=>c.id===id)||confirmedCandidateIds.includes(id));
 return {...map,competitors,reviewCandidates,confirmedCandidateIds,selectedIds,selectionConfirmed:map.selectionConfirmed&&selectedIds.length===map.selectedIds.length};
}
