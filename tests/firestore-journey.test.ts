import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {firestoreStore,type DocumentStore,type Row} from '../apps/api/src/platform/firestore/store';
import {LaunchController} from '../apps/api/src/onboarding/launch';
import type {AuthRequest} from '../apps/api/src/identity/auth';
import {MemoryStore} from './helpers/firestore-memory';
import {collectRegionalAudience} from '../apps/api/src/onboarding/regional-providers';
import type {ProfileFacts} from '@askadia/contracts';

async function value<T=Row>(request:PromiseLike<{data:unknown;error:unknown}>):Promise<T>{const r=await request;if(r.error)throw r.error;return r.data as T;}
const emulator=process.env.FIRESTORE_EMULATOR_HOST;
if(emulator&&!/^(127\.0\.0\.1|localhost):\d+$/.test(emulator))throw new Error('Only a local emulator is allowed');
if(emulator)vi.setConfig({testTimeout:45000,hookTimeout:45000});
const apiRequire=createRequire(resolve('apps/api/package.json'));
const instant=new Date('2026-10-05T12:00:00Z');
// Explicit fixtures: no provider is called and none of these records reach the real project.
const facts={businessType:{status:'provided',value:'clinic'},city:{status:'provided',value:'São Paulo - SP'},uf:{status:'provided',value:'SP'},services:{status:'provided',value:'Clínica geral'}};
const snapshot={city:'São Paulo',uf:'SP',collectedAt:instant.toISOString(),ibge:{state:'unavailable',data:null,sex:[],ages:[],sourceUrl:'https://servicodados.ibge.gov.br',message:'Fixture: fonte indisponível'},facebook:{state:'unconfigured',estimates:[],sourceUrl:'https://developers.facebook.com',message:'Fixture: não conectado',cityKey:null},trends:{state:'unconfigured',query:'clínica geral',geo:'BR-SP',region:'São Paulo',period:'today 12-m',rows:[],sourceUrl:'https://trends.google.com',message:'Fixture: sem configuração'}};
const output={positioning:'Fixture de proposta para revisão',objectives:[{goal:'Orientar',metric:'Consultas',suggestedTarget:'A definir'}],calendar:Array.from({length:8},(_,i)=>({week:Math.floor(i/2)+1,format:'imagem',theme:'Tema '+i,brief:'Pauta de teste',needsClientVideo:false})),ads:[],keywords:Array.from({length:20},(_,i)=>'termo '+i),unknowns:['Pesquisa regional indisponível nesta fixture']};
const suggestion={title:'Proposta',objective:'Orientar',audience:'Público local',steps:['Revisar antes de ativar'],message:'Rascunho',requirements:['Consentimento'],successMetric:'A definir'};
const recommendations={summary:'Fixture de recomendações',whatsapp:[suggestion],messages:[suggestion],traffic:[suggestion],unknowns:['Integrações não homologadas']};

describe('Firestore guided strategy — '+(emulator?'local emulator':'isolated memory'),()=>{
 let close:(()=>Promise<void>)|undefined,store:DocumentStore,owner:string,company:string,workspace:string;
 let user:ReturnType<typeof firestoreClient>,server:ReturnType<typeof firestoreClient>;
 beforeEach(async()=>{
  vi.stubEnv('CHECKOUT_MODE','test');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(instant);
  if(emulator){const {Firestore}=apiRequire('firebase-admin/firestore');const db=new Firestore({projectId:'demo-medsi'});store=firestoreStore(db);close=async()=>{await db.recursiveDelete(db.doc('medsi/v1'));await db.terminate();};}else store=new MemoryStore();
  owner=randomUUID();company=randomUUID();workspace=randomUUID();user=firestoreClient('authenticated',owner,store);server=firestoreClient('service_role',null,store);
  await store.run(async tx=>{
   tx.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});
   tx.put('companies',company,{id:company,workspace_id:workspace,archived_at:null});
   tx.put('company_onboarding',company,{company_id:company,profile_version:1,revision:8,confirmed_revision:8,facts});
   tx.put('company_profile_versions',company+'_1',{company_id:company,version:1,facts});
   tx.put('onboarding_provider_limits',company+'_strategy',{company_id:company,kind:'strategy',daily_calls:2});
  });
  const checkout=await call('begin_test_checkout',{p_id:randomUUID(),p_plan:'askadia_monthly'});
  await value(server.rpc('complete_test_checkout_server',{p_company_id:company,p_id:checkout.id,p_actor:owner,p_outcome:'approved',p_accepted:true}));
 });
 afterEach(async()=>{vi.unstubAllEnvs();vi.useRealTimers();await close?.();});
 const call=(name:string,args:Row={})=>value(user.rpc(name,{p_company_id:company,...args}));
 const journey=()=>call('read_marketing_journey');
 const approve=async(stage:number,limitations='Fontes ausentes reconhecidas nesta revisão de teste')=>{const j=await journey();return call('approve_marketing_stage',{p_stage:stage,p_basis:j.stages[stage-1].basis,p_limitations:limitations});};
 async function research(){await call('request_regional_research');const job=await value(server.rpc('claim_regional_research_server'));await value(server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:snapshot}));return job;}
 async function strategy(){await research();await approve(1);const request=randomUUID();await call('start_company_strategy',{p_request_id:request});await call('finish_company_strategy',{p_request_id:request,p_output:output,p_model:'fixture',p_response_id:null});return request;}

 it('binds selected map competitors to current evidence, permissions, approval and AI context',async()=>{
  const map={state:'available',center:{lat:-22.82,lng:-47.27},viewport:null,radiusM:3000,locationConfirmed:true,selectionConfirmed:false,competitors:[{id:'node/1',name:'Concorrente fixture',address:'Endereço fixture',lat:-22.821,lng:-47.271,distanceM:151,category:'doctor',sourceUrl:'https://www.openstreetmap.org/node/1'}],selectedIds:[],message:'Fixture OSM',sourceUrl:'https://www.openstreetmap.org/copyright'};
  await call('request_regional_research',{p_map:{center:map.center,radiusM:3000}});const job=await value(server.rpc('claim_regional_research_server'));
  expect(job.map).toEqual({center:map.center,radiusM:3000});
  await value(server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:{...snapshot,map}}));
  await expect(approve(1)).rejects.toMatchObject({code:'22023'});
  const revision=(await journey()).stages[0].data.regional.revision;
  expect((await user.rpc('select_regional_competitors',{p_company_id:company,p_revision:revision,p_ids:['node/999']})).error?.code).toBe('22023');
  const outsider=firestoreClient('authenticated',randomUUID(),store);expect((await outsider.rpc('select_regional_competitors',{p_company_id:company,p_revision:revision,p_ids:['node/1']})).error?.code).toBe('42501');
  await call('select_regional_competitors',{p_revision:revision,p_ids:['node/1']});await approve(1);
  const generation=await value(server.rpc('claim_content_preparation_server'));
  expect(generation.context.competitorEvidence.regional.data.map).toMatchObject({selectedIds:['node/1'],selectionConfirmed:true});
  await expect(call('select_regional_competitors',{p_revision:revision,p_ids:[]})).rejects.toMatchObject({code:'40001'});
  await call('select_regional_competitors',{p_revision:revision+1,p_ids:[]});expect((await journey()).stages[0].approved).toBe(false);
 });
 it('accepts leased source progress only and never changes an approval basis for progress',async()=>{
  await call('request_regional_research');const job=await value(server.rpc('claim_regional_research_server'));const basis=(await journey()).stages[0].basis;
  const update={p_id:job.id,p_token:job.token,p_source:'ibge',p_state:'running'};
  expect((await user.rpc('progress_regional_research_server',update)).error?.code).toBe('42501');
  expect(await value(server.rpc('progress_regional_research_server',{...update,p_token:randomUUID()}))).toBe(false);
  expect(await value(server.rpc('progress_regional_research_server',update))).toBe(true);
  const view=await journey();expect(view.stages[0].basis).toBe(basis);expect(view.stages[0].data.regional.progress[0]).toMatchObject({source:'ibge',state:'running'});
  await value(server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:snapshot}));
  expect(await value(server.rpc('progress_regional_research_server',update))).toBe(false);
 });
 it('requires the requested map evidence and rejects duplicate or misleading competitor records',async()=>{
  const center={lat:-22.82,lng:-47.27},candidate={id:'node/1',name:'Fixture',address:'',lat:center.lat,lng:center.lng,distanceM:0,category:'doctor',sourceUrl:'https://www.openstreetmap.org/node/1'};
  const map={state:'available',center,viewport:null,radiusM:1000,locationConfirmed:true,selectionConfirmed:false,competitors:[candidate],selectedIds:[],message:'Fixture',sourceUrl:'https://www.openstreetmap.org/copyright'};
  await call('request_regional_research',{p_map:{center,radiusM:1000}});const job=await value(server.rpc('claim_regional_research_server'));
  const finish=(data:unknown)=>server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:data});
  for(const data of [snapshot,{...snapshot,map:{...map,competitors:[candidate,candidate]}},{...snapshot,map:{...map,competitors:[{...candidate,distanceM:900}]}}])expect((await finish(data)).error?.code).toBe('22023');
  expect(await value(finish({...snapshot,map}))).toBe(true);
 });
 it('resets source progress on retry and rejects expired or superseded leases without basis drift',async()=>{
  await call('request_regional_research');const first=await value(server.rpc('claim_regional_research_server'));
  const progress=(job:Row,state:string)=>server.rpc('progress_regional_research_server',{p_id:job.id,p_token:job.token,p_source:'ibge',p_state:state});
  expect(await value(progress(first,'completed'))).toBe(true);
  vi.setSystemTime(new Date(Date.now()+181000));expect(await value(progress(first,'running'))).toBe(false);
  const second=await value(server.rpc('claim_regional_research_server')),basis=(await journey()).stages[0].basis;
  expect((await journey()).stages[0].data.regional.progress).toEqual([]);
  expect(await value(progress(first,'completed'))).toBe(false);expect(await value(progress(second,'running'))).toBe(true);
  expect((await journey()).stages[0].basis).toBe(basis);
 });
 it('loads all five stages after trial checkout without claiming absent evidence or approval',async()=>{
  const request={actor:{id:owner,client:user}} as unknown as AuthRequest;
  const j=await new LaunchController().journey(request,company);expect(j).toMatchObject({profileVersion:1,confirmed:true,canApprove:true});expect(j.stages).toHaveLength(5);
  expect(j.stages.every((s:Row)=>!s.approved&&/^[a-f0-9]{32}$/.test(s.basis))).toBe(true);
  expect(j.stages[0].data.regional).toMatchObject({status:'pending',revision:0,data:null});
  for(const table of ['company_strategy_briefs','company_content_preparations','company_launch_jobs','company_visual_jobs'])expect(await value<unknown[]>(user.from(table).select('*').eq('company_id',company))).toEqual([]);
 });
 it('requires tenant scope, current permissions, confirmed profile and trial access',async()=>{
  const outsider=firestoreClient('authenticated',randomUUID(),store);
  expect((await outsider.rpc('read_marketing_journey',{p_company_id:company})).error?.code).toBe('42501');
  expect((await user.from('company_strategy_briefs').select('*')).error?.code).toBe('42501');
  expect((await user.rpc('claim_regional_research_server')).error?.code).toBe('42501');
  expect((await call('read_marketing_journey')).stages.every((s:Row)=>!s.approved)).toBe(true);
  expect((await user.rpc('start_company_strategy',{p_company_id:company,p_request_id:randomUUID()})).error?.code).toBe('40001');
  vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  expect((await user.rpc('request_regional_research',{p_company_id:company})).error?.code).toBe('P0402');
 });
 it('serializes regional claims, requires limitations for missing sources and rejects stale approval bases',async()=>{
  const old=(await journey()).stages[0].basis;await call('request_regional_research');
  const jobs=await Promise.all([value(server.rpc('claim_regional_research_server')),value(server.rpc('claim_regional_research_server'))]);expect(jobs.filter(Boolean)).toHaveLength(1);const job=jobs.find(Boolean)!;
  await value(server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:snapshot}));
  expect((await user.rpc('approve_marketing_stage',{p_company_id:company,p_stage:1,p_basis:old,p_limitations:'Limitações reconhecidas'})).error?.code).toBe('40001');
  await expect(approve(1,'')).rejects.toMatchObject({code:'22023'});await approve(1);
  const prior=await journey();await approve(1);expect(await journey()).toEqual(prior);
 });
 it('accepts absent optional source objects but requires acknowledgment and never adds absent metrics',async()=>{
  await call('request_regional_research');const job=await value(server.rpc('claim_regional_research_server'));
  const partial={city:snapshot.city,uf:snapshot.uf,collectedAt:snapshot.collectedAt,ibge:snapshot.ibge,trends:snapshot.trends};
  await value(server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:partial}));
  await expect(approve(1,'')).rejects.toMatchObject({code:'22023'});
  await approve(1,'Reconheço as fontes ausentes nesta versão.');
  const approved=await store.run(tx=>tx.get('company_marketing_approvals',company+'_1_1'));
  expect(approved!.snapshot.regional.data).toEqual(partial);
  expect(approved!.snapshot.unavailableSources).toContain('Facebook · público estimado');
 });
 it('persists a valid empty search response without inventing interest values',async()=>{
  await call('request_regional_research');const job=await value(server.rpc('claim_regional_research_server'));
  const empty={...snapshot,trends:{...snapshot.trends,state:'available',rows:[]},topics:{google:{state:'available',query:'Clínica geral São Paulo',region:'SP',period:'Últimos 3 meses',message:'Nenhuma consulta retornada',sourceUrl:'https://trends.google.com',rows:[]}}};
  expect(await value(server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:empty}))).toBe(true);
  expect((await journey()).stages[0].data.regional.data.trends.rows).toEqual([]);
 });
 it('rejects expired jobs and invalid provider snapshots without publishing them',async()=>{
  await call('request_regional_research');const job=await value(server.rpc('claim_regional_research_server'));
  expect((await server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:{...snapshot,uf:'RJ'}})).error?.code).toBe('22023');
  expect((await journey()).stages[0].data.regional.data).toBeNull();
  vi.setSystemTime(new Date(instant.getTime()+4*60000));
  expect(await value(server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:snapshot}))).toBe(false);
 });
 it('completes five explicit approvals and setup without a subscription or external action',async()=>{
  await strategy();await approve(2);const j=await journey();expect(j.stages[2].data).toHaveLength(8);
  expect(j.stages[2].data.every((r:Row)=>r.date>='2026-10-12')).toBe(true);
  const job=await value(server.rpc('claim_company_launch_server'));expect(job.kind).toBe('recommendations');
  await value(server.rpc('finish_company_launch_server',{p_id:job.id,p_token:job.token,p_output:recommendations}));
  for(const stage of [3,4,5])await approve(stage);
  expect(await call('finish_company_setup')).toMatchObject({setupComplete:true,nextPath:'/empresa/'+company+'/preparacao'});expect(await call('company_purchase_state')).toMatchObject({aiAllowed:true,accessMode:'test',setupComplete:true});
  for(const collection of ['company_subscriptions','company_sites','outbound_messages','ad_executions'])expect(await store.run(tx=>tx.list(collection,[{field:'company_id',value:company}]))).toEqual([]);
 });
 it('invalidates dependent approvals when the strategy is edited and ignores late generation',async()=>{
  const request=await strategy();await approve(2);const brief=(await journey()).stages[1].data;
  await call('edit_company_strategy',{p_id:brief.id,p_generation:brief.generation,p_output:{...output,positioning:'Edição humana'}});
  expect((await journey()).stages.map((s:Row)=>s.approved)).toEqual([true,false,false,false,false]);
  await call('finish_company_strategy',{p_request_id:request,p_output:output,p_model:'fixture',p_response_id:null});
  expect((await journey()).stages[1].data.output.positioning).toBe('Edição humana');
 });
 it('runs only proposal generation through the leased content worker and enforces quota',async()=>{
  await research();await approve(1);
  const job=await value(server.rpc('claim_content_preparation_server'));expect(job.kind).toBe('strategy');expect(job.context.facts).toEqual(facts);
  await value(server.rpc('finish_content_preparation_server',{p_id:job.id,p_token:job.token,p_result:{output,model:'fixture',responseId:null,usage:null}}));
  expect((await journey()).stages[1].data.output).toEqual(output);expect(await value(server.rpc('claim_content_preparation_server'))).toBeNull();
  await call('start_company_strategy',{p_request_id:randomUUID()});
  expect((await user.rpc('start_company_strategy',{p_company_id:company,p_request_id:randomUUID()})).error).toBeTruthy();
 });
 it('retains only real provider metrics and validates census totals and municipality scope',async()=>{
  await call('request_regional_research');const job=await value(server.rpc('claim_regional_research_server'));
  const good={...snapshot,ibge:{...snapshot.ibge,state:'available',data:{municipalityId:'3550308',municipality:'SÃO PAULO',uf:'SP',year:'2022',population:100,areaKm2:10,density:10,collectedAt:instant.toISOString(),sourceUrl:'https://cidades.ibge.gov.br/brasil/sp/sao-paulo/panorama'},sex:[{label:'Grupo fixture',count:100}],ages:[]},facebook:{...snapshot.facebook,state:'pending',cityKey:'fixture',estimates:[{label:'Adultos',lower:null,upper:null},{label:'Recorte parcial',lower:10,upper:20}]}};
  const finish=(data:unknown)=>server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:data});
  expect((await finish({...good,ibge:{...good.ibge,sex:[{label:'Total incorreto',count:99}]}})).error?.code).toBe('22023');
  expect((await finish({...good,ibge:{...good.ibge,data:{...good.ibge.data,municipality:'Rio de Janeiro'}}})).error?.code).toBe('22023');
  await value(finish(good));expect((await journey()).stages[0].data.regional.data).toEqual(good);
 });
 it('accepts IBGE municipality labels with their matching UF through the collector and persistence boundary',async()=>{
  vi.stubEnv('SERPAPI_API_KEY','');await call('request_regional_research');const job=await value(server.rpc('claim_regional_research_server'));
  // Representative official response shape; these numbers are isolated fixtures, not a live census.
  const transport:typeof fetch=async input=>{
   const url=String(input);
   if(url.includes('/api/v1/localidades/'))return new Response(JSON.stringify([{id:3550308,nome:'São Paulo',microrregiao:{mesorregiao:{UF:{sigla:'SP'}}}}]));
   if(url.includes('/agregados/4714/'))return new Response(JSON.stringify(['93','6318','614'].map(id=>({id,resultados:[{series:[{localidade:{id:'3550308',nome:'São Paulo (SP)'},serie:{'2022':id==='93'?'100':'10'}}]}]}))));
   return new Response('',{status:503});
  };
  const evidence=await collectRegionalAudience(job.facts as ProfileFacts,async()=>{throw Error('Fixture: Meta unavailable');},transport);
  expect(evidence.ibge).toMatchObject({state:'available',data:{municipality:'São Paulo (SP)',uf:'SP',population:100},ages:[],sex:[]});
  const finish=(p_snapshot:unknown)=>server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot});
  for(const municipality of ['São Paulo (RJ)','Rio de Janeiro (SP)'])expect((await finish({...evidence,ibge:{...evidence.ibge,data:{...evidence.ibge.data,municipality}}})).error?.code).toBe('22023');
  expect(await finish(evidence)).toMatchObject({data:true,error:null});
  const j=await journey();expect(j.stages[0]).toMatchObject({approved:false,data:{regional:{status:'ready',data:evidence}}});
  await expect(approve(1,'')).rejects.toMatchObject({code:'22023'});await approve(1);
  expect((await journey()).stages.map((s:Row)=>s.approved)).toEqual([true,false,false,false,false]);
 });
 it.each(['profile','permission','payment'])('discards a regional response after %s changes',async reason=>{
  await call('request_regional_research');const job=await value(server.rpc('claim_regional_research_server'));
  await store.run(async tx=>{
   if(reason==='profile')tx.put('company_onboarding',company,{company_id:company,profile_version:1,revision:9,confirmed_revision:8,facts});
   if(reason==='permission')tx.remove('workspace_members',workspace+'_'+owner);
   if(reason==='payment')tx.remove('company_test_access',company);
  });
  expect(await value(server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:snapshot}))).toBe(false);
  expect(await store.run(tx=>tx.get('company_regional_research',job.id))).toMatchObject({status:'stale',snapshot:null});
 });
 it('lets a reader see the scoped review without approving or generating',async()=>{
  const readerId=randomUUID();await store.run(async tx=>tx.put('company_members',company+'_'+readerId,{company_id:company,user_id:readerId,role:'reader'}));
  const reader=firestoreClient('authenticated',readerId,store),j=await value(reader.rpc('read_marketing_journey',{p_company_id:company}));expect(j.canApprove).toBe(false);
  for(const name of ['request_regional_research','start_company_strategy','approve_marketing_stage','finish_company_setup'])expect((await reader.rpc(name,{p_company_id:company})).error?.code).toBe('42501');
  expect((await server.from('onboarding_attachments').select('*')).error?.code).toBe('42501');
 });
 it('bounds failed regional attempts and enforces the refresh cooldown',async()=>{
  await call('request_regional_research');
  let id='';for(let i=0;i<3;i++){const job=await value(server.rpc('claim_regional_research_server'));id=job.id;await value(server.rpc('finish_regional_research_server',{p_id:job.id,p_token:job.token,p_snapshot:null}));vi.setSystemTime(new Date(Date.now()+61000));}
  expect(await value(server.rpc('claim_regional_research_server'))).toBeNull();expect(await store.run(tx=>tx.get('company_regional_research',id))).toMatchObject({status:'failed',attempts:3});
  expect((await user.rpc('request_regional_research',{p_company_id:company,p_refresh:true})).error?.code).toBe('22023');
  vi.setSystemTime(new Date(Date.now()+300000));await call('request_regional_research',{p_refresh:true});expect((await journey()).stages[0].data.regional).toMatchObject({revision:2,status:'pending'});
 });
 it('rejects replayed generation requests even after the lock expires and never approves stale evidence',async()=>{
  const request=await strategy();vi.setSystemTime(new Date(Date.now()+360000));
  expect((await user.rpc('start_company_strategy',{p_company_id:company,p_request_id:request})).error?.code).toBe('40001');
  await call('request_regional_research',{p_refresh:true});
  expect((await journey()).stages.every((s:Row)=>!s.approved)).toBe(true);await expect(approve(2)).rejects.toMatchObject({code:'40001'});
 });
 it('discards recommendations from a prior strategy generation and rejects out-of-order approval',async()=>{
  await strategy();await approve(2);const job=await value(server.rpc('claim_company_launch_server')),brief=(await journey()).stages[1].data;
  await expect(approve(4)).rejects.toMatchObject({code:'40001'});
  await call('edit_company_strategy',{p_id:brief.id,p_generation:brief.generation,p_output:{...output,positioning:'Revisão'}});
  expect(await value(server.rpc('finish_company_launch_server',{p_id:job.id,p_token:job.token,p_output:recommendations}))).toBe(false);
  expect((await journey()).stages[3].data).toBeNull();await expect(call('finish_company_setup')).rejects.toMatchObject({code:'40001'});
 });
 it('requires future dates, and a date edit invalidates all downstream approvals and setup',async()=>{
  await strategy();await approve(2);const job=await value(server.rpc('claim_company_launch_server'));await value(server.rpc('finish_company_launch_server',{p_id:job.id,p_token:job.token,p_output:recommendations}));
  for(const stage of [3,4,5])await approve(stage);await call('finish_company_setup');
  const item=(await journey()).stages[2].data[0];await call('move_calendar_date',{p_item:item.id,p_revision:1,p_date:'2026-10-06'});
  expect((await journey()).stages.map((s:Row)=>s.approved)).toEqual([true,true,false,false,false]);expect((await call('company_purchase_state')).setupComplete).toBe(false);
  await expect(approve(3)).rejects.toMatchObject({code:'22023'});
  expect((await user.rpc('move_calendar_date',{p_company_id:company,p_item:item.id,p_revision:1,p_date:'2026-10-12'})).error?.code).toBe('40001');
 });
 it('preserves a manually generated strategy when a worker finishes late',async()=>{
  await research();await approve(1);const job=await value(server.rpc('claim_content_preparation_server'));
  vi.setSystemTime(new Date(Date.now()+301000));const request=randomUUID();await call('start_company_strategy',{p_request_id:request});
  await call('finish_company_strategy',{p_request_id:request,p_output:{...output,positioning:'Solicitação atual'},p_model:'fixture',p_response_id:null});
  expect(await value(server.rpc('finish_content_preparation_server',{p_id:job.id,p_token:job.token,p_result:{output,model:'fixture'}}))).toBe(false);
  expect((await journey()).stages[1].data.output.positioning).toBe('Solicitação atual');
 });

 it('retains immutable evidence and approval history across a failed refresh and reapproval',async()=>{
  const original=await research();await approve(1,'Primeira revisão com fontes ausentes');
  const approvalId=company+'_1_1',first=await store.run(tx=>tx.get('company_marketing_approvals',approvalId));
  vi.setSystemTime(new Date(Date.now()+301000));await call('request_regional_research',{p_refresh:true});
  const retryJob=await value(server.rpc('claim_regional_research_server'));await value(server.rpc('finish_regional_research_server',{p_id:retryJob.id,p_token:retryJob.token,p_snapshot:null}));
  expect(await store.run(tx=>tx.get('company_regional_research_versions',original.id+'_1'))).toMatchObject({snapshot,revision:1,status:'ready'});
  expect(await store.run(tx=>tx.get('company_marketing_approval_history',first!.token))).toMatchObject({approved_by:owner,snapshot:{limitations:'Primeira revisão com fontes ausentes'}});
  vi.setSystemTime(new Date(Date.now()+61000));const newer=await value(server.rpc('claim_regional_research_server'));await value(server.rpc('finish_regional_research_server',{p_id:newer.id,p_token:newer.token,p_snapshot:{...snapshot,collectedAt:new Date().toISOString()}}));await approve(1,'Segunda revisão com limitações reconhecidas');
  const second=await store.run(tx=>tx.get('company_marketing_approvals',approvalId));expect(second!.token).not.toBe(first!.token);
  expect(await store.run(tx=>tx.get('company_marketing_approval_history',first!.token))).toEqual(first);
  expect(await store.run(tx=>tx.get('company_marketing_approval_history',second!.token))).toEqual(second);
 });
});
