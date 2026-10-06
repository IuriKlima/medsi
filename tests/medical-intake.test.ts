import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {paidCompanyFixture} from './helpers/paid-company';
import {validCnpj,medicalIntakeRequestSchema} from '../packages/contracts/src/medical-intake';
import type {OnboardingSnapshot} from '../packages/contracts/src/onboarding';
import {CensusAudienceAdapter,FacebookAudienceAdapter,parseAudienceEstimate} from '../apps/api/src/onboarding/regional-providers';
import {loadCurriculum} from '../apps/api/src/onboarding/curriculum';
import {lookupCnpj} from '../apps/api/src/onboarding/cnpj';
import {stageReady,type MarketingJourney} from '../packages/contracts/src/journey-progress';

const owner='51000000-0000-4000-8000-000000000001',other='51000000-0000-4000-8000-000000000002';
let db:PGlite,a:string,b:string,w:string;
async function as(id=owner){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function scalar<T>(sql:string,args:unknown[]=[]):Promise<T>{return Object.values((await db.query<Record<string,T>>(sql,args)).rows[0]!)[0]!;}
const read=(id=a)=>scalar<OnboardingSnapshot>('select public.company_onboarding_read($1)',[id]);
async function save(step:string,answer:unknown,id=a,request=randomUUID(),revision?:number){const current=await read(id);return scalar<OnboardingSnapshot>('select public.save_medical_intake($1,$2,$3,$4,$5::jsonb)',[id,request,revision??current.state.revision,step,JSON.stringify(answer)]);}
const address={name:'Clínica Exemplo',addressLine:'Rua de Exemplo, 100, Centro',city:'São Paulo',uf:'SP',postalCode:'01001000',businessType:'clinic'};
async function complete(id:string,website:unknown={mode:'create'}){await save('businessType',{value:address.businessType},id);await save('cnpj',{value:'11222333000181'},id);await save('address',address,id);await save('specialty',{values:['Cardiologia']},id);await save('history',{mode:'text',text:'História fictícia da clínica para teste automatizado.'},id);await save('logo',{mode:'create',style:'Minimalista'},id);await save('photos',{mode:'skip',attachmentIds:[]},id);await save('website',website,id);return save('confirm',{},id);}
const journey=()=>scalar<MarketingJourney>('select public.read_marketing_journey($1)',[a]);
async function approve(limits=''){const j=await journey();return scalar('select public.approve_marketing_stage($1,1,$2,$3,null)',[a,j.stages[0]!.basis,limits]);}
describe('Medical intake persistence and regional approvals',()=>{
 beforeAll(async()=>{
  db=new PGlite();
  await db.exec("create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;");
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+file,'utf8').replace('create extension if not exists pgcrypto;',''));
  for(const id of [owner,other]){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,id+'@example.test']);await db.query('insert into public.profiles(id,display_name) values($1,$2)',[id,'Fixture']);}
  await as();const first=await scalar<{companyId:string;workspaceId:string}>('select public.begin_company_onboarding($1)',[randomUUID()]);a=first.companyId;w=first.workspaceId;
 },120000);
 afterAll(async()=>{await db?.close();});
 it('validates CNPJ on the database and rejects skipped questions',async()=>{
  await expect(save('cnpj',{value:'11222333000181'})).rejects.toThrow('previous intake');
  await expect(save('businessType',{value:'hospital'})).rejects.toThrow('Invalid medical');
  await save('businessType',{value:address.businessType});
  await expect(save('cnpj',{value:'11222333000182'})).rejects.toThrow('Invalid medical');
  await expect(save('address',address)).rejects.toThrow('previous intake');
  await save('cnpj',{value:'12ABC34501DE35'});expect((await read()).state.medical_intake?.answers.cnpj?.value).toBe('12ABC34501DE35');
  await expect(save('address',{...address,businessType:'medical_practice'})).rejects.toThrow('Address type');
  await save('address',address);await save('cnpj',{value:'11222333000181'});
  expect((await read()).state.medical_intake?.answers.address).toBeUndefined();
  await expect(save('confirm',{})).rejects.toThrow('previous intake');
 });
 it('replays identical requests and rejects payload changes, stale writes and legacy bypass',async()=>{
  const request=randomUUID(),revision=(await read()).state.revision;
  const one=await save('address',address,a,request,revision);
  expect((await save('address',address,a,request,revision)).state.revision).toBe(one.state.revision);
  await expect(save('address',{...address,city:'Campinas'},a,request,revision)).rejects.toThrow('Request changed');
  await expect(save('address',address,a,randomUUID(),revision)).rejects.toThrow('Profile changed');
  await expect(scalar('select public.save_company_onboarding($1,$2,$3,$4,$5::jsonb)',[a,randomUUID(),one.state.revision,'bypass','{}'])).rejects.toThrow('formulário');
 });
 it('confirms a version without fabricating target audiences and defers paid work',async()=>{
  await complete(a);const s=await read();expect(s.state.confirmed_revision).toBe(s.state.revision);expect(s.confirmedProfile?.facts.services?.value).toBe('Cardiologia');expect(s.confirmedProfile?.facts.audience?.status).toBe('deferred');expect(s.confirmedProfile?.facts.websitePreference?.value).toBe('create');
  expect(await scalar("select count(*)::int from public.company_visual_jobs where company_id=$1 and kind='brand_logo'",[a])).toBe(1);
  await scalar('select public.enqueue_company_launch($1)',[a]);
  expect(await scalar("select count(*)::int from public.company_visual_jobs where company_id=$1 and kind='brand_logo'",[a])).toBe(1);
  await db.exec('reset role');expect(await scalar('select public.claim_visual_job_server()')).toBeNull();await as();
  await expect(scalar('select public.request_regional_research($1)',[a])).rejects.toThrow();
  expect(stageReady((await journey()).stages[0])).toBe(false);
 });
 it('keeps an existing website and prevents cross-company files and unauthorized writes',async()=>{
  const made=await scalar<{companyId:string}>('select public.begin_company_onboarding($1,$2)',[randomUUID(),w]);b=made.companyId;
  await complete(b,{mode:'existing',url:'https://clinica.example'});
  expect(await scalar("select count(*)::int from public.company_launch_jobs where company_id=$1 and kind='site'",[b])).toBe(0);
  const id=randomUUID(),path=b+'/onboarding/'+id+'.pdf';await db.query("insert into storage.objects(bucket_id,name) values('company-assets',$1)",[path]);
  await scalar('select public.record_onboarding_attachment($1,$2,$3,$4,$5,$6)',[b,id,'Currículo.pdf','application/pdf',128,path]);
  await expect(save('history',{mode:'pdf',attachmentId:id},a)).rejects.toThrow('Invalid medical');
  await expect(save('logo',{mode:'upload',attachmentId:id},b)).rejects.toThrow('Invalid medical');
  await as(other);await expect(save('cnpj',{value:'11222333000181'},a)).rejects.toThrow('Access denied');
  expect(await scalar('select count(*)::int from public.company_regional_research')).toBe(0);await as();
 });
 it('requires collected evidence and an explicit acknowledgment of missing sources',async()=>{
  await paidCompanyFixture(db,a);await as();
  await scalar('select public.request_regional_research($1)',[a]);
  await expect(approve()).rejects.toThrow('Aguarde a coleta');
  await db.exec('reset role');const job=await scalar<{id:string;token:string;companyId:string}>('select public.claim_regional_research_server()');expect(job.companyId).toBe(a);
  const evidence={city:'São Paulo',uf:'SP',collectedAt:new Date().toISOString(),ibge:{state:'available'},facebook:{state:'unconfigured'},trends:{state:'unconfigured'}};
  expect(await scalar('select public.finish_regional_research_server($1,$2,$3::jsonb)',[job.id,job.token,JSON.stringify(evidence)])).toBe(true);
  await as();expect(stageReady((await journey()).stages[0])).toBe(true);await expect(approve()).rejects.toThrow('fontes indisponíveis');
  await approve('Facebook e Trends indisponíveis nesta fixture, usar somente IBGE.');
  expect((await journey()).stages[0]?.approved).toBe(true);
  const snap=await scalar<{regional:{data:unknown};limitations:string}>('select snapshot from public.company_marketing_approvals where company_id=$1 and stage=1',[a]);expect(snap.regional.data).toEqual(evidence);
  await db.exec('reset role');await db.query("update public.company_regional_research set updated_at=now()-interval '6 minutes' where company_id=$1",[a]);await as();
  await scalar('select public.request_regional_research($1,true)',[a]);
  expect((await journey()).stages[0]?.approved).toBe(false);
 });
 it('preserves legacy confirmed choices until an explicit type edit and synchronizes reconfirmed facts',async()=>{
  const made=await scalar<{companyId:string}>('select public.begin_company_onboarding($1,$2)',[randomUUID(),w]);const id=made.companyId;
  await complete(id);const before=await read(id);
  // Simulate the stored shape written by older clients; no application migration rewrites it.
  await db.exec('reset role');await db.query("update public.company_onboarding set medical_intake=medical_intake #- '{answers,businessType}' where company_id=$1",[id]);await as();
  expect((await read(id)).state.confirmed_revision).toBe(before.state.confirmed_revision);
  await save('businessType',{value:'medical_practice'},id);
  const changed=await read(id);expect(changed.state.medical_intake?.answers.address?.businessType).toBe('medical_practice');expect(changed.state.medical_intake?.answers.specialty).toEqual(before.state.medical_intake?.answers.specialty);expect(changed.state.confirmed_revision).toBeNull();expect(changed.confirmedProfile?.facts.businessType?.value).toBe('Clínica');
  await save('confirm',{},id);const after=await read(id);expect(after.confirmedProfile?.facts.businessType?.value).toBe('Consultório médico');expect(after.confirmedProfile?.facts.brand?.value).toContain('consultório');
 });
 it('rejects a late result after the profile is edited and preserves the approved snapshot',async()=>{
  await db.exec('reset role');const job=await scalar<{id:string;token:string}>('select public.claim_regional_research_server()');await as();
  await save('address',{...address,city:'Campinas'});
  await db.exec('reset role');expect(await scalar('select public.finish_regional_research_server($1,$2,$3::jsonb)',[job.id,job.token,JSON.stringify({ibge:{state:'available'},facebook:{state:'available'},trends:{state:'available'}})])).toBe(false);await as();
  expect((await read()).confirmedProfile?.facts.city?.value).toBe('São Paulo - SP');
  await save('confirm',{});expect((await read()).confirmedProfile?.version).toBe(2);expect((await journey()).stages[0]?.approved).toBe(false);
 });
});
describe('Medical input and regional adapter boundaries',()=>{
 it('supports numeric and alphanumeric CNPJ without accepting wrong check digits',()=>{
  expect(validCnpj('11.222.333/0001-81')).toBe(true);expect(validCnpj('12.ABC.345/01DE-35')).toBe(true);
  for(const v of ['00000000000000','11222333000182','12ABC34501DE34','https://example.test'])expect(validCnpj(v)).toBe(false);
  expect(medicalIntakeRequestSchema.safeParse({requestId:randomUUID(),revision:0,step:'history',answer:{mode:'text',text:'Curto'}}).success).toBe(false);
 });
 it('never coerces an unavailable Meta estimate to zero',()=>{
  expect(parseAudienceEstimate({data:[{estimate_ready:false,users_lower_bound:0,users_upper_bound:0}]},'Adultos').lower).toBeNull();
  expect(()=>parseAudienceEstimate({data:[{users_upper_bound:200}]},'Adultos')).toThrow();
  expect(parseAudienceEstimate({data:{estimate_ready:true,users_lower_bound:100,users_upper_bound:200}},'Adultos')).toEqual({label:'Adultos',lower:100,upper:200});
 });
 it('uses one verified municipality and only aggregate Facebook adult cuts',async()=>{
  const calls:{path:string;params?:Record<string,string>}[]=[];
  const graph=async<T>(path:string,_token:string,params?:Record<string,string>):Promise<T>=>{calls.push({path,params});return (path==='search'?{data:[{key:'123',name:'São Paulo',country_code:'BR',region:'São Paulo'}]}:{data:{estimate_ready:true,users_lower_bound:10,users_upper_bound:20}}) as T;};
  const r=await new FacebookAudienceAdapter(graph).audience('São Paulo','SP','act_123','fixture');
  expect(r.estimates).toHaveLength(6);expect(calls.slice(1).every(c=>c.path==='act_123/reachestimate')).toBe(true);
  for(const c of calls.slice(1)){const spec=JSON.parse(c.params!.targeting_spec!);expect(spec.age_min).toBeGreaterThanOrEqual(18);expect(spec.publisher_platforms).toEqual(['facebook']);expect(spec.geo_locations).toEqual({cities:[{key:'123'}]});}
  await expect(new FacebookAudienceAdapter(async<T>()=>({data:[{key:'1',name:'São Paulo',country_code:'BR',region:'Bahia'}]}) as T).audience('São Paulo','SP','act_1','fixture')).rejects.toThrow('META_CITY_AMBIGUOUS');
 });
 it('rejects incomplete census distributions rather than inventing demographic percentages',async()=>{
  let count=0;const transport:typeof fetch=async()=>new Response(JSON.stringify(++count===1?{id:9514,classificacoes:[{id:2,nome:'Sexo',categorias:[{id:1,nome:'Total',nivel:0},{id:2,nome:'Homens',nivel:1}]},{id:3,nome:'Idade',categorias:[{id:4,nome:'Total',nivel:0},{id:5,nome:'0 a 4 anos',nivel:1}]}]}:[{id:'93',resultados:[]}]));
  await expect(new CensusAudienceAdapter(transport).breakdown('3550308',100,'2022')).rejects.toThrow('IBGE_INCOMPLETE_BREAKDOWN');
 });
 it('rejects mismatched CNPJ responses, strips personal fields and preserves manual fallback',async()=>{
  const payload={cnpj:'11222333000181',razao_social:'Clínica Fixture',municipio:'São Paulo',uf:'SP',logradouro:'Rua Exemplo',numero:'100',cep:'01001000',qsa:[{nome_socio:'Never exposed'}]};
  const result=await lookupCnpj('11222333000181',async()=>new Response(JSON.stringify(payload)),true);expect(result.status).toBe('available');expect(JSON.stringify(result)).not.toContain('Never exposed');
  expect((await lookupCnpj('11222333000181',async()=>new Response(JSON.stringify({...payload,cnpj:'00000000000191'})),true)).status).toBe('unavailable');
  expect((await lookupCnpj('11222333000181',async()=>new Response('',{status:404}),true)).status).toBe('not_found');
  expect((await lookupCnpj('11222333000181',async()=>{throw Error('timeout');},true)).data).toBeNull();
 });
 it('loads no PDF when the confirmed profile has none',async()=>{expect(await loadCurriculum({} as never,a,{})).toBeNull();});
});
