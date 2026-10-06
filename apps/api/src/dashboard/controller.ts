import { executivePdf } from './pdf';
import { BadRequestException,Body,Controller,Get,ForbiddenException,Module,Post,Query,Req,StreamableFile,UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { dashboardQuerySchema,importSchema,parseDashboardCsv,parseTrendsCsv,csvCell,type DashboardImport } from '@askadia/contracts';
import { AUTH_CONFIG,AuthGuard,AuthService,type AuthRequest } from '../identity/auth';
import { result } from '../identity/service';
import { buildDashboard,type DashboardRaw } from './engine';
function parse<T>(schema:z.ZodType<T>,input:unknown){const parsed=schema.safeParse(input);if(!parsed.success)throw new BadRequestException(parsed.error.issues.slice(0,3).map(i=>i.message).join('; '));return parsed.data;}
const uploadSchema=z.object({companyId:z.uuid(),csv:z.string().max(1500000),metadata:z.object(importSchema.shape).omit({records:true}).strict().refine(v=>v.coverageStart<=v.coverageEnd,{message:'Período inválido'}),format:z.enum(['facts','google_trends']).default('facts'),trends:z.object({batchId:z.string().min(1).max(80),region:z.string().min(2).max(100),collectedAt:z.iso.datetime(),sourceUrl:z.url(),language:z.string().max(30),searchType:z.string().max(30),termType:z.enum(['search_term','topic'])}).optional()}).strict();
@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
 async read(req:AuthRequest,query:unknown){
  const filter=parse(dashboardQuerySchema,query);
  const raw=result<DashboardRaw>(await req.actor.client.rpc('dashboard_read',{p_company_id:filter.companyId,p_internal_session:filter.access??null}));
  try{return buildDashboard(raw,filter);}catch(e){throw new BadRequestException(e instanceof Error?e.message:'Dados incompatíveis.');}
 }
 @Get() snapshot(@Req() req:AuthRequest,@Query() query:unknown){return this.read(req,query);}
 async document(req:AuthRequest,body:unknown){
  const input=parse(uploadSchema,body);
  // Validate rights before processing or returning a preview of personal business records.
  const raw=result<DashboardRaw>(await req.actor.client.rpc('dashboard_read',{p_company_id:input.companyId,p_internal_session:null}));
  if(input.metadata.domain==='finance'?!raw.permissions.writeFinance:!raw.permissions.writeDigital)throw new ForbiddenException('Você não tem permissão para importar este tipo de dado.');
  let document:DashboardImport;
  try{
   if(input.format==='google_trends'){
    if(!input.trends||input.metadata.domain!=='trends')throw new Error('Informe metadados da pesquisa Trends.');
    document=parse(importSchema,{...input.metadata,records:parseTrendsCsv(input.csv,input.trends)});
   }else document=parseDashboardCsv(input.csv,input.metadata);
  }catch(e){throw new BadRequestException(e instanceof Error?e.message:'CSV inválido.');}
  return {companyId:input.companyId,document};
 }
 @Post('imports/preview') async preview(@Req() req:AuthRequest,@Body() body:unknown){
  const {companyId,document}=await this.document(req,body);
  return {companyId,source:document.source,domain:document.domain,count:document.records.length,coverage:document.coverage,period:{start:document.coverageStart,end:document.coverageEnd},sample:document.records.slice(0,8)};
 }
 @Post('imports') async commit(@Req() req:AuthRequest,@Body() body:unknown){
  const {companyId,document}=await this.document(req,body);
  return result(await req.actor.client.rpc('dashboard_import',{p_company_id:companyId,p_document:document}));
 }
 @Post('keywords') async keywords(@Req() req:AuthRequest,@Body() body:unknown){
  const input=parse(z.object({companyId:z.uuid(),services:z.array(z.enum(['musculação','pilates','funcional','spinning','dança','personal','24 horas','totalpass','wellhub'])).max(20),neighborhood:z.string().max(100),confirmed:z.literal(true)}).strict(),body);
  result(await req.actor.client.rpc('dashboard_set_keywords',{p_company_id:input.companyId,p_services:input.services,p_neighborhood:input.neighborhood}));return {saved:true};
 }
 @Post('exports') async export(@Req() req:AuthRequest,@Body() body:unknown){
  const input=parse(z.object({filters:dashboardQuerySchema,format:z.enum(['csv','pdf']).default('csv')}).strict(),body);
  const snapshot=await this.read(req,input.filters);
  const id=result(await req.actor.client.rpc('dashboard_record_export',{p_company_id:input.filters.companyId,p_filters:input.filters,p_snapshot:snapshot,p_method:snapshot.methodVersion,p_internal_session:input.filters.access??null}));
  const rows:unknown[][]=[['MedSI — relatório executivo'],['Empresa',snapshot.company.name],['Período',input.filters.start,input.filters.end],['Fuso',input.filters.timezone],['Canal',input.filters.channel],['Conta',input.filters.account],['Campanha',input.filters.campaign],['Comparação',input.filters.comparison,snapshot.comparison?.start,snapshot.comparison?.end],['Observação da coorte até',input.filters.observationEnd??input.filters.end],['Regime','Caixa realizado'],['Leitura',input.filters.mode],['Método',snapshot.methodVersion],['Gerado em',snapshot.generatedAt],['Auditoria',id],['Atribuição','Evidência informada pela fonte; sem causalidade presumida'],[],['Indicador','Valor','Unidade','Estado','Fórmula','Bases','Fonte','Atualização','Pendência']];
  for(const m of snapshot.metrics)rows.push([m.label,m.value,m.unit,m.state,m.formula,JSON.stringify(m.bases),m.source,m.updatedAt,m.reason]);
  rows.push([],['Data','Mídia BRL','Novos clientes','Receita atribuída BRL']);for(const point of snapshot.series)rows.push([point.date,point.mediaBRL,point.customers,point.attributedRevenueBRL]);
  rows.push([],['Fontes e cobertura']);for(const source of snapshot.sources)rows.push([source.source,source.domain,source.start,source.end,source.complete?'Declarada completa':'Parcial',source.updatedAt,source.note]);
  rows.push([],['Limitações'],[snapshot.financialNote],[snapshot.funnelNote]);for(const limitation of snapshot.limitations)rows.push([limitation]);
  rows.push([],['Tráfego: plataforma, conta, campanha, data, gasto BRL, impressões, cliques, conversões reportadas']);for(const group of snapshot.ads)for(const r of group.rows)rows.push([r.provider,r.accountId,r.campaignName,r.date,r.spendCents/100,r.impressions,r.clicks,r.reportedConversions]);
  rows.push([],['Instagram: conteúdo, escopo, alcance, engajamento %, coleta']);for(const r of snapshot.social)rows.push([r.permalink,r.scope,r.reach,r.engagementRate,r.collectedAt]);
  rows.push([],['Trends: lote, região, termo, escala, interesse médio']);for(const g of snapshot.trends)for(const r of g.ranking)rows.push([g.batchId,g.region,r.term,g.scale,r.interest]);
  rows.push([],['Sugestões editoriais; não medidas: prioridade, termo, situação']);for(const r of snapshot.keywordCandidates)rows.push([r.priority,r.term,r.reason]);
  rows.push([],['Site: fonte, data, recurso, métrica, valor, cobertura']);for(const r of snapshot.web)rows.push([r.provider,r.date,r.resource,r.metric,r.value,r.coverage]);
  rows.push([],['Funil: etapa atual, quantidade']);for(const r of snapshot.funnel??[])rows.push([r.label,r.count]);
  if(input.format==='pdf')return new StreamableFile(executivePdf(rows),{type:'application/pdf',disposition:'attachment; filename="askadia-dashboard.pdf"'});
  const csv='\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
  return new StreamableFile(Buffer.from(csv,'utf8'),{type:'text/csv; charset=utf-8',disposition:'attachment; filename="askadia-dashboard.csv"'});
 }
}
@Module({
 controllers:[DashboardController],
 providers:[AuthService,AuthGuard,{provide:AUTH_CONFIG,useFactory:()=>({provider:process.env.DATABASE_PROVIDER,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY})}],
})
export class DashboardModule {}
