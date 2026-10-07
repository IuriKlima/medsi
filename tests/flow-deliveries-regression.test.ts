import {afterEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {LaunchController} from '../apps/api/src/onboarding/launch';
import {CalendarPost} from '../apps/web/components/editorial-calendar';
import {LaunchPreparationView} from '../apps/web/components/launch-preparation';
import {CompanySiteController} from '../apps/api/src/sites/controller';
import {CalendarController} from '../apps/api/src/onboarding/calendar-controller';
import {calendarProduction} from '../apps/api/src/onboarding/calendar-production';
const require=createRequire(resolve('apps/web/package.json'));const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const company='10000000-0000-4000-8000-000000000001';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const item={id:'item',brief_id:'brief',generation:2,revision:3,format:'imagem',details:null};

function fixtureClient(records:Record<string,Record<string,unknown>[]>,version:number){
 return {rpc:async(name:string)=>({data:name==='company_capabilities'?{actions:['marketing.read']}:name==='company_onboarding_read'?{state:{profile_version:version,revision:4,confirmed_revision:4}}:{stages:[]},error:null}),from:(table:string)=>{
  let single=false;const filters:{field:string;value:unknown}[]=[];
  const q={select:()=>q,eq:(field:string,value:unknown)=>{filters.push({field,value});return q;},in:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>{single=true;return q;},then:(resolve:(v:unknown)=>unknown)=>{const rows=(records[table]??[]).filter(row=>filters.every(f=>row[f.field]===f.value));return Promise.resolve(resolve({data:single?rows[0]??null:rows,error:null}));}};return q;
 }};
}
describe('Calendar delivery boundaries — fixture contracts, no provider calls',()=>{
 it.each(['pending','running','failed'])('keeps the latest site job %s visible even when an older draft is reviewable',async status=>{
  vi.stubEnv('DATABASE_PROVIDER','firestore');
  const records:Record<string,Record<string,unknown>[]>= {company_sites:[{company_id:company,profile_version:2,draft:{name:'Previous fixture'}}],company_site_jobs:[{company_id:company,profile_version:2,status,error:status==='failed'?'Fixture failed':null}]};
  const client=fixtureClient(records,2);
  const snapshot=await new LaunchController().read({actor:{client}} as never,company);
  expect(snapshot.siteGeneration).toMatchObject({status,error:status==='failed'?'Fixture failed':null});
 });
 it('keeps historical pieces but does not present v1 delivery as current completion under profile v2',async()=>{
  vi.stubEnv('DATABASE_PROVIDER','firestore');
  const ready={...item,company_id:company,profile_version:1,details:{slides:[]}};
  const records={company_strategy_briefs:[{company_id:company,id:'brief',generation:2,profile_version:1}],company_calendar_items:[ready],company_creatives:[{company_id:company,item_id:'item',revision:3,frame:0}],company_content_preparations:[{company_id:company,profile_version:1,status:'completed'}]};
  const snapshot=await new CalendarController().read({actor:{client:fixtureClient(records,2)}} as never,company);
  expect(snapshot.current).toBeNull();expect(snapshot.production.status).toBe('waiting');expect(snapshot.preparation).toBeNull();expect(snapshot.items).toHaveLength(1);
 });
 it('rejects calendar reads before loading the profile or querying deliveries without marketing.read',async()=>{
  const rpc=vi.fn(async()=>({data:{actions:[]},error:null})),from=vi.fn();
  await expect(new CalendarController().read({actor:{client:{rpc,from}}} as never,company)).rejects.toThrow();
  expect(rpc).toHaveBeenCalledTimes(1);expect(from).not.toHaveBeenCalled();
 });
 it('does not enqueue a site job when the site model is missing',async()=>{
  vi.stubEnv('OPENAI_API_KEY','fixture-key-no-network');vi.stubEnv('OPENAI_MODEL_SITE','');
  const rpc=vi.fn(async()=>({data:{actions:['marketing.write']},error:null}));
  await expect(new CompanySiteController().generate({actor:{client:{rpc}}} as never,company,{id:'20000000-0000-4000-8000-000000000002',revision:0,feedback:''})).rejects.toThrow('modelo de site');
  expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('company_capabilities',{p_company_id:company});
 });
 it('the delivery screen does not count completed diagnosis as finished pieces',()=>{
  vi.stubGlobal('React',React);
  const snapshot={profileVersion:1,confirmed:true,approved:true,available:true,contentAvailable:true,siteAvailable:true,canEdit:false,jobs:[],content:{status:'completed',stage:'strategy_review',error:null},production:{status:'waiting',missingTexts:1,missingImages:0,error:null},siteGeneration:{status:'running',error:null}};
  const html=renderToStaticMarkup(React.createElement(LaunchPreparationView,{companyId:company,data:snapshot}));
  expect(html).toContain('0 de 3 frentes concluídas');expect(html).toContain('Aguardando aprovações e produção');expect(html).toContain('Preparando');expect(html).not.toContain('Entregas disponíveis para revisão.');
 });
 it('the content card keeps editing available while image generation is unavailable',()=>{
  vi.stubGlobal('React',React);
  const ready={...item,position:1,idea:'Fixture pauta',planned_date:null,status:'draft',details:{title:'Fixture',caption:'Fixture legenda',cta:'Contato',hashtags:[],designBrief:'Fixture',videoScript:'',slides:[],clientMaterials:[],unknowns:[]}};
  const html=renderToStaticMarkup(React.createElement(CalendarPost,{item:ready,companyId:company,current:true,write:true,uploadAllowed:false,imageAllowed:false,approve:false,busy:false,assets:[],videos:[],action:async()=>true,reload:async()=>({})}));
  expect(html).toContain('Editar conteúdo e data');expect(html).not.toContain('Criar design · MedSI Image 1.0');
 });
 it('launch reports the native site job and outstanding pieces separately from completed diagnosis',async()=>{
  vi.stubEnv('DATABASE_PROVIDER','firestore');vi.stubEnv('OPENAI_API_KEY','');
  const queries:{table:string;field:string;value:unknown}[]=[];
  const rows:Record<string,unknown>={company_calendar_items:[item],company_strategy_briefs:[{id:'brief',generation:2}],company_content_preparations:[{status:'completed',stage:'strategy_review',error:null}],company_site_jobs:[{status:'running',error:null}]};
  const client={rpc:async(name:string)=>({data:name==='company_capabilities'?{actions:['marketing.read']}:name==='company_onboarding_read'?{state:{profile_version:1,revision:4,confirmed_revision:4}}:{stages:[]},error:null}),from:(table:string)=>{
   let single=false;const q={select:()=>q,eq:(field:string,value:unknown)=>{queries.push({table,field,value});return q;},in:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>{single=true;return q;},then:(resolve:(v:unknown)=>unknown)=>{const records=rows[table] as unknown[]??[];return Promise.resolve(resolve({data:single?records[0]??null:records,error:null}));}};return q;
  }};
  const snapshot=await new LaunchController().read({actor:{client}} as never,company);
  expect(snapshot.production).toMatchObject({status:'waiting',missingTexts:1});expect(snapshot.siteGeneration).toEqual({status:'running',error:null});
  expect(queries).toContainEqual({table:'company_site_jobs',field:'company_id',value:company});expect(queries).toContainEqual({table:'company_site_jobs',field:'profile_version',value:1});
 });

 it('does not claim completed strategy preparation means completed texts and images',()=>{
  expect(calendarProduction([item],[],[],{id:'brief',generation:2})).toMatchObject({status:'waiting',missingTexts:1,missingImages:0});
 });
 it('binds queue status and existing artwork to the current generation and item revision',()=>{
  const ready={...item,details:{slides:[]}};
  const jobs=[{brief_id:'brief',generation:1,item_id:'item',revision:3,status:'running'},{brief_id:'brief',generation:2,item_id:'item',revision:2,status:'running'}];
  expect(calendarProduction([ready],[{item_id:'item',revision:2,frame:0}],jobs,{id:'brief',generation:2})).toMatchObject({status:'waiting',missingImages:1});
  expect(calendarProduction([ready],[{item_id:'item',revision:3,frame:0}],jobs,{id:'brief',generation:2})).toMatchObject({status:'completed',missingImages:0});
 });
 it('reports current failed production instead of a successful diagnosis',()=>{
  expect(calendarProduction([item],[],[{brief_id:'brief',generation:2,kind:'details',status:'failed',error:'Fixture provider blocked'}],{id:'brief',generation:2})).toMatchObject({status:'failed',error:'Fixture provider blocked'});
 });
 it('exposes no generation capability without configured model IDs and scopes production reads to the company',async()=>{
  vi.stubEnv('DATABASE_PROVIDER','firestore');vi.stubEnv('OPENAI_API_KEY','');
  const filters:{table:string;field:string;value:unknown}[]=[];
  const client={rpc:async(name:string)=>({data:name==='company_onboarding_read'?{state:{profile_version:1}}:{actions:['marketing.read']},error:null}),from:(table:string)=>{
   const q={select:()=>q,eq:(field:string,value:unknown)=>{filters.push({table,field,value});return q;},in:()=>q,order:()=>q,limit:()=>q,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(resolve({data:[],error:null}))};return q;
  }};
  const snapshot=await new CalendarController().read({actor:{client}} as never,company);
  expect(snapshot.productionAvailable).toBe(false);
  expect(snapshot.generationCapabilities).toEqual({text:false,image:false,dates:false});
  expect(filters).toContainEqual({table:'company_content_production_jobs',field:'company_id',value:company});
 });
});
