import { keywordCandidates,aggregateAds,calculateFinance,compareMetric,comparisonPeriod,dashboardFactSchema,dateInZone,engagement,methodVersion,safeSum,trendGroups,within,type AdFact,type Coverage,type DashboardFact,type DashboardQuery,type Metric,type PaymentFact } from '@askadia/contracts';
export type DashboardRaw={
 company:{id:string;name:string;city:string;segment:string;timezone:string};
 keywordProfile?:{services:string[];neighborhood:string;confirmedAt:string;revision:number}|null;
 permissions:{digital:boolean;finance:boolean;writeDigital:boolean;writeFinance:boolean};
 facts:{source:string;revision:number;payload:unknown;updatedAt:string}[];
 coverage:Coverage[];
 crm:null|{id:string;contactId:string;createdAt:string;stage:string;source:string}[];
};
function metricUnavailable(metric:Metric,reason:string):Metric{return {...metric,value:null,state:'no_basis',reason};}
function buildPeriod(raw:DashboardRaw,q:DashboardQuery,now=new Date()){
 if(q.companyId!==raw.company.id)throw new Error('Empresa do snapshot incompatível.');
 if(q.timezone!==raw.company.timezone)throw new Error('Use o fuso configurado da empresa.');
 const errors:string[]=[];let invalidFinance=false;
 const parsed=raw.facts.flatMap(f=>{const parsed=dashboardFactSchema.safeParse(f.payload);if(!parsed.success){const kind=f.payload&&typeof f.payload==='object'&&'kind' in f.payload?f.payload.kind:'';if(['payment','refund','cost'].includes(String(kind)))invalidFinance=true;errors.push('Registro incompatível na fonte '+f.source+'; revisão da importação necessária.');return [];}return [{...f,payload:parsed.data}];});
 const financialSources=[...new Set(parsed.filter(f=>['payment','refund'].includes(f.payload.kind)).map(f=>f.source))];
 const financialAmbiguous=financialSources.length>1;
 const allFacts=parsed.map(f=>f.payload);
 const matching=(r:DashboardFact)=>{
  if(!within(r.date,q.start,q.end))return false;
  if(r.kind==='ads')return (q.channel==='all'||q.channel===r.provider)&&(!q.account||r.accountId===q.account)&&(!q.campaign||r.campaignId===q.campaign);
  return true;
 };
 const ads=allFacts.filter((f):f is AdFact=>f.kind==='ads'&&matching(f));
 const adGroups=[...new Set(ads.map(a=>[a.provider,a.accountId,a.timezone,a.dateBasis,a.clickType].join('|')))].map(key=>{
  const rows=ads.filter(a=>[a.provider,a.accountId,a.timezone,a.dateBasis,a.clickType].join('|')===key);
  return {key,provider:rows[0]!.provider,accountId:rows[0]!.accountId,timezone:rows[0]!.timezone,dateBasis:rows[0]!.dateBasis,clickType:rows[0]!.clickType,rows,...aggregateAds(rows)};
 });
 const adKeys=ads.map(a=>[a.provider,a.accountId,a.campaignId,a.date].join('|'));
 const adsOverlap=new Set(adKeys).size!==adKeys.length;
 if(adsOverlap)errors.push('Relatórios de anúncio sobrepostos para a mesma conta/campanha/data. Consolidação de mídia suspensa até conciliação.');
 const adTimezones=new Set(ads.map(a=>a.timezone));
 const adsComparable=!adsOverlap&&(!ads.length||(adTimezones.size===1&&adTimezones.has(q.timezone)));
 if(!adsComparable)errors.push('A mídia está agrupada no fuso da conta. O consolidado no fuso da empresa está indisponível; consulte as contas separadas.');
 const payments=allFacts.filter((f):f is PaymentFact=>f.kind==='payment');
 const firsts=new Map<string,PaymentFact>();
 if(payments.some(p=>p.classification==='acquisition'&&p.acquisitionDate!==p.date))errors.push('Aquisição com data diferente do primeiro pagamento declarado: não incluída como novo cliente. Importe o primeiro pagamento histórico para comprovar a aquisição.');
 for(const p of payments.filter(p=>p.classification==='acquisition'&&p.customerHistoryKnown&&!p.customerPreexisting&&p.acquisitionDate&&p.acquisitionDate===p.date&&p.netCents>0).sort((a,b)=>a.date.localeCompare(b.date))){
  if(!firsts.has(p.customerId))firsts.set(p.customerId,p);
 }
 const customers=[...firsts.values()].filter(p=>within(p.acquisitionDate!,q.start,q.end)&&(q.channel==='all'||p.channel===q.channel)&&(!q.campaign||p.campaignId===q.campaign)&&!q.account);
 const customerIds=new Set(customers.map(c=>c.customerId));
 const observationEnd=q.mode==='cohort'?q.observationEnd??q.end:q.end;
 const eligible=payments.filter(p=>customerIds.has(p.customerId)&&within(p.date,q.start,observationEnd));
 const attributed=eligible.filter(p=>p.channel!=='unknown'&&Boolean(p.evidence));
 const mediaAttributed=attributed.filter(p=>p.channel==='meta_ads'||p.channel==='google_ads');
 const refunds=allFacts.filter((f):f is Extract<DashboardFact,{kind:'refund'}>=>f.kind==='refund'&&within(f.date,q.start,observationEnd));
 const net=(rows:PaymentFact[])=>safeSum(rows.map(p=>p.netCents))-safeSum(refunds.filter(r=>rows.some(p=>p.id===r.paymentId)).map(r=>r.cents));
 const refundInvalid=refunds.some(r=>{const parent=payments.find(p=>p.id===r.paymentId);return !parent||r.date<parent.date||(parent.variableCostCents!==null&&safeSum(allFacts.filter(x=>x.kind==='refund'&&x.paymentId===r.paymentId).map(x=>x.kind==='refund'?x.variableCostReversalCents??0:0))>parent.variableCostCents)||safeSum(allFacts.filter(x=>x.kind==='refund'&&x.paymentId===r.paymentId).map(x=>x.kind==='refund'?x.cents:0))>parent.netCents;});
 if(refundInvalid)errors.push('Há estorno sem recebimento correspondente ou acima do valor recebido. Concilie antes de calcular retorno.');
 const costRows=allFacts.filter((f):f is Extract<DashboardFact,{kind:'cost'}>=>f.kind==='cost'&&within(f.date,q.start,q.end)&&(q.channel==='all'||f.channel===q.channel)&&(!q.campaign||f.campaignId===q.campaign)&&!q.account);
 const mediaManual=costRows.filter(c=>c.category==='media');
 const other=costRows.filter(c=>c.category==='other_acquisition');
 let media=ads.length&&adsComparable?safeSum(ads.map(a=>a.spendCents)):mediaManual.length?safeSum(mediaManual.map(c=>c.cents)):null;
 if(ads.length&&mediaManual.length)errors.push('Mídia manual não foi somada aos anúncios, para evitar duplicação. O card usa a coleta de anúncios.');
 if(!adsComparable)media=null;
 const complete=raw.coverage.some(c=>c.domain==='finance'&&c.complete&&c.start<=q.start&&c.end>=observationEnd);
 const financeHasData=!invalidFinance&&(payments.length>0||complete)&&raw.permissions.finance&&!financialAmbiguous&&!refundInvalid&&!q.account;
 if(q.account)errors.push('Receitas e clientes não possuem vínculo verificável com a conta de anúncios; indicadores financeiros indisponíveis neste recorte.');
 const variableKnown=attributed.every(p=>p.variableCostCents!==null)&&refunds.filter(r=>attributed.some(p=>p.id===r.paymentId)).every(r=>r.variableCostReversalCents!==null);
 const latest=raw.coverage.filter(c=>c.domain==='finance').map(c=>c.updatedAt).sort().at(-1)??null;
 const bases={mediaCents:media,otherAcquisitionCents:other.length?safeSum(other.map(c=>c.cents)):null,
  newCustomers:financeHasData?customers.length:null,mediaCustomers:financeHasData?customers.filter(p=>(p.channel==='meta_ads'||p.channel==='google_ads')&&p.evidence).length:null,
  attributedNetCents:financeHasData?net(attributed):null,mediaAttributedNetCents:financeHasData?net(mediaAttributed):null,
  variableCostCents:financeHasData&&variableKnown?safeSum(attributed.map(p=>p.variableCostCents??0))-safeSum(refunds.filter(r=>attributed.some(p=>p.id===r.paymentId)).map(r=>r.variableCostReversalCents??0)):null,
  scopeComplete:complete&&!costRows.some(c=>c.estimated)&&(!ads.length||raw.coverage.some(c=>c.domain==='digital'&&c.complete&&c.start<=q.start&&c.end>=q.end))};
 let metrics=calculateFinance(bases,'Importação declarada; atribuição informada pela fonte',latest);
 metrics=metrics.map(m=>m.id==='media'?{...m,source:ads.length?'Relatórios de anúncios importados':'Lançamentos de mídia importados',updatedAt:raw.coverage.filter(c=>c.domain===(ads.length?'digital':'finance')).map(c=>c.updatedAt).sort().at(-1)??null}:m);
 if(costRows.some(c=>c.estimated))metrics=metrics.map(m=>m.value!==null&&['media','cac','cac_media','roi','roas'].includes(m.id)?{...m,state:'estimated',reason:'Custos incluem estimativa declarada; confira o critério de rateio.'}:m);
 metrics=metrics.map(m=>m.value===null&&m.state==='no_basis'&&!raw.coverage.some(c=>c.domain===(m.id==='media'?'digital':'finance'))?{...m,state:'no_history',reason:'Nenhum histórico compatível foi importado para esta fonte.'}:m);
 if(q.mode==='cohort'){
  metrics=metrics.map(m=>['cac','cac_media','roi','roas'].includes(m.id)?metricUnavailable(m,'Rateio de aquisição para a coorte ainda não informado; custos do período não são assumidos como custos da coorte.'):m);
  errors.push('Coorte: receita observada até '+observationEnd+'. Custos sem rateio defensável não geram CAC/ROI de coorte.');
 }
 if(financialAmbiguous){errors.push('Múltiplas fontes financeiras: conciliação entre fornecedores pendente. Nenhum consolidado financeiro foi presumido.');metrics=metrics.map(m=>m.id==='media'?m:metricUnavailable(m,'Conciliação entre fontes financeiras pendente.'));}
 if(!raw.permissions.finance)metrics=metrics.map(m=>m.id==='media'?m:{...metricUnavailable(m,'Seu perfil não permite consultar dados financeiros.'),state:'forbidden'});
 const canCrm=raw.crm!==null&&!q.campaign&&!q.account&&q.channel==='all';
 const crm=canCrm?raw.crm!.filter(r=>within(dateInZone(new Date(r.createdAt),q.timezone),q.start,q.end)):null;
 const leads=crm===null?null:new Set(crm.map(r=>r.contactId)).size;
 metrics.splice(1,0,{id:'leads',label:'Leads únicos',value:leads,unit:'count',state:leads===null?'unsupported':'available',reason:leads===null?'CRM sem acesso ou atribuição incompatível com os filtros.':null,formula:'Contatos distintos das oportunidades criadas no período',bases:{leads},source:'CRM MedSI',updatedAt:now.toISOString(),better:'higher'});
 const stageNames:Record<string,string>={new:'Novo',in_progress:'Em atendimento',qualified:'Qualificado',referred:'Encaminhado',scheduled:'Consulta agendada',attended:'Compareceu',enrolled:'Conversão registrada',lost:'Perdido'};
 const funnel=crm===null?null:Object.entries(stageNames).map(([stage,label])=>({stage,label,count:crm.filter(r=>r.stage===stage).length}));
 const social=allFacts.filter(f=>f.kind==='social').filter(p=>!q.account||p.accountId===q.account).filter(p=>q.socialMode==='published'?within(dateInZone(new Date(p.publishedAt),q.timezone),q.start,q.end):p.temporal==='interval'&&p.intervalStart===q.start&&p.intervalEnd===q.end)
 .map(p=>({...p,engagementRate:engagement([p.likes,p.comments,p.saves,p.shares],p.reach),scope:p.temporal==='lifetime'?'Acumulado até a coleta':'Atividade de '+p.intervalStart+' a '+p.intervalEnd}));
 const socialFiltered=(q.campaign||q.channel!=='all')?[]:social;
 if(q.socialMode==='activity'&&!social.length)errors.push('Instagram: nenhum agregado oficial para o intervalo exato. Métricas acumuladas não foram subtraídas.');
 const trends=trendGroups(allFacts.filter((f):f is Extract<DashboardFact,{kind:'trend'}>=>f.kind==='trend'&&within(f.date,q.start,q.end)));
 const web=allFacts.filter((f):f is Extract<DashboardFact,{kind:'web'}>=>f.kind==='web'&&within(f.date,q.start,q.end));
 const series=[...new Set([...ads.map(a=>a.date),...eligible.map(p=>p.date),...refunds.filter(r=>eligible.some(p=>p.id===r.paymentId)).map(r=>r.date)])].sort().map(date=>({date,mediaBRL:adsComparable&&ads.some(a=>a.date===date)?safeSum(ads.filter(a=>a.date===date).map(a=>a.spendCents))/100:null,customers:financeHasData?customers.filter(p=>p.acquisitionDate===date).length:null,attributedRevenueBRL:financeHasData?(safeSum(attributed.filter(p=>p.date===date).map(p=>p.netCents))-safeSum(refunds.filter(r=>r.date===date&&attributed.some(p=>p.id===r.paymentId)).map(r=>r.cents)))/100:null}));
 return {company:raw.company,permissions:raw.permissions,filters:q,methodVersion,generatedAt:now.toISOString(),metrics,inProgress:q.end>=dateInZone(now,q.timezone),
  keywordCandidates:keywordCandidates({segment:raw.company.segment,city:raw.company.city,services:raw.keywordProfile?.services??[],neighborhood:raw.keywordProfile?.neighborhood,confirmed:Boolean(raw.keywordProfile)}),keywordProfile:raw.keywordProfile??null,series,ads:adGroups,social:socialFiltered,trends,web:(q.campaign||q.account||q.channel!=='all')?[]:web,funnel,
  attributionCoverage:financeHasData&&customers.length?customers.filter(p=>p.channel!=='unknown'&&p.evidence).length/customers.length*100:null,
  sources:raw.coverage,limitations:[...new Set(errors)],factRevisions:parsed.map(f=>({source:f.source,kind:f.payload.kind,id:f.payload.id,revision:f.revision})),
  funnelNote:'Etapas atuais das oportunidades criadas no período; não é taxa histórica de passagem. Conversão registrada no CRM não comprova pagamento.',
  financialNote:'Caixa realizado dos clientes adquiridos no intervalo selecionado. Custos e aquisições no período podem refletir ciclos de venda diferentes. Receita de clientes preexistentes não é usada para inflar retorno. Atribuição observada não prova causalidade.'};
}
export function buildDashboard(raw:DashboardRaw,q:DashboardQuery,now=new Date()){
 const current=buildPeriod(raw,q,now),comparison=comparisonPeriod(q);
 const previous=comparison?buildPeriod(raw,{...q,...comparison,comparison:'none',observationEnd:q.mode==='cohort'?comparison.end:undefined},now):null;
 const comparisons=previous&&q.mode!=='cohort'?Object.fromEntries(current.metrics.map(m=>[m.id,compareMetric(m,previous.metrics.find(p=>p.id===m.id)!)])):{};
 return {...current,comparison,comparisons};
}
export type DashboardSnapshot=ReturnType<typeof buildDashboard>;
