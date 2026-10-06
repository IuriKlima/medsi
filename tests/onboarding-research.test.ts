import {afterAll,beforeAll,describe,expect,it,vi,afterEach} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {paidCompanyFixture} from './helpers/paid-company';
import {GooglePlacesAdapter} from '../apps/api/src/onboarding/google-places';
import {guidedAnswers,onboardingStep,type OnboardingSnapshot} from '../packages/contracts/src/onboarding';
let db:PGlite,company:string,second:string;const owner=randomUUID(),outsider=randomUUID(),reader=randomUUID();
async function as(id:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function server(){await db.exec('reset role;set role service_role');}
async function scalar<T=unknown>(sql:string,args:unknown[]=[]):Promise<T>{return Object.values((await db.query<Record<string,T>>(sql,args)).rows[0]!)[0]!;}
const fact=(value:string)=>({value,status:'provided'});
const read=()=>scalar<OnboardingSnapshot>('select public.company_onboarding_read($1)',[company]);
async function save(patch:unknown={},action='reply'){const s=await read();return scalar<OnboardingSnapshot>('select public.save_company_onboarding($1,$2,$3,$4,$5,$6)',[company,randomUUID(),s.state.revision,'Resposta de teste',patch,action]);}
const selections=[{placeId:'near_one',label:'Academia vizinha'},{placeId:'near_two',label:'Estúdio local'}];
async function review(places=selections,request=randomUUID(),revision?:number,c=company){return scalar<OnboardingSnapshot>('select public.review_onboarding_competitors($1,$2,$3,$4)',[c,request,revision??(await read()).state.revision,places]);}
type Job={id:string;companyId:string;token:string;query:string;city:string};
const claim=()=>scalar<Job|null>('select public.claim_competitor_research_server()');
const candidate={username:'vizinha.fit',name:'Academia vizinha',url:'https://www.instagram.com/vizinha.fit/',context:'Perfil público encontrado. Identidade precisa de confirmação.'};
describe('Persistent onboarding research',()=>{
 beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;`);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8').replace('create extension if not exists pgcrypto;',''));
 for(const id of [owner,outsider,reader]){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,id+'@example.test']);await db.query('insert into public.profiles(id,display_name) values($1,$2)',[id,'Teste']);}
 await as(owner);company=(await scalar<{companyId:string}>('select public.begin_company_onboarding($1)',[randomUUID()])).companyId;const w=await scalar<string>("select public.create_workspace('Segunda empresa')");second=(await scalar<{companyId:string}>('select public.begin_company_onboarding($1,$2)',[randomUUID(),w])).companyId;
 await db.exec('reset role');await db.query("insert into public.company_members(company_id,user_id,role) values($1,$2,'reader')",[company,reader]);
 },120000);
 afterAll(async()=>{await db?.close();});

 it('asks name then city and searches location before asking business type',async()=>{
  await as(owner);const initial=await scalar<{stages:{data:unknown}[]}>('select public.read_marketing_journey($1)',[company]);expect(Array.isArray(initial.stages[0]!.data)).toBe(true);expect((await read()).question).toContain('nome da sua clínica');const name=await save(guidedAnswers('identity','Minha Academia'));expect(name.step).toBe('city');expect(name.question).toContain('cidade');const city=await save(guidedAnswers('city','Varginha, MG'));expect(city.step).toBe('location');expect(onboardingStep(city.state)).toBe(city.step);
  await save({placeId:fact('own_place'),businessType:fact('Academia'),address:fact('Centro, Varginha')},'confirm_location');
 });
 it('persists confirmed competitor names and place IDs atomically, with replay and stale-write protection',async()=>{
  const revision=(await read()).state.revision,request=randomUUID();const saved=await review(selections,request,revision);expect(saved.step).toBe('references');expect(saved.state.facts.competitors?.value).toBe('Academia vizinha\nEstúdio local');expect(await review([],request,revision)).toEqual(saved);await expect(review([],randomUUID(),revision)).rejects.toThrow('Profile changed');
  const rows=(await db.query<{label:string;status:string;candidates:unknown[]}>('select label,status,candidates from public.company_competitor_research where company_id=$1',[company])).rows;expect(rows).toHaveLength(2);expect(rows.every(r=>r.status==='pending'&&r.candidates.length===0)).toBe(true);
 });
 it('rejects own business, duplicates and too many competitors without altering the selection',async()=>{
  await expect(review([{placeId:'own_place',label:'Minha Academia'}])).rejects.toThrow('Invalid competitor');await expect(review([selections[0]!,selections[0]!])).rejects.toThrow('Duplicate competitor');await expect(review(Array.from({length:11},(_,i)=>({placeId:'place_'+i,label:'Teste'})))).rejects.toThrow('ten competitors');expect(await scalar('select count(*)::int from public.company_competitor_research where company_id=$1',[company])).toBe(2);
 });
 it('isolates rows and mutations, and does not expose service jobs to authenticated clients',async()=>{
  for(const user of [outsider,reader]){await as(user);await expect(scalar('select public.review_onboarding_competitors($1,$2,0,$3)',[company,randomUUID(),selections])).rejects.toThrow('Access denied');await expect(scalar('select public.select_competitor_instagram($1,$2,$3)',[company,'near_one','vizinha.fit'])).rejects.toThrow('Access denied');await expect(claim()).rejects.toThrow('permission denied');}
  await as(outsider);expect((await db.query('select * from public.company_competitor_research')).rows).toHaveLength(0);await as(owner);await expect(scalar('select public.select_competitor_instagram($1,$2,$3)',[second,'near_one','vizinha.fit'])).rejects.toThrow('Review local competitor');
 });
 it('holds research before payment and requires a confirmed profile after payment',async()=>{
  await server();expect(await claim()).toBeNull();await paidCompanyFixture(db,company);expect(await claim()).toBeNull();await as(owner);expect(await scalar('select sum(attempts)::int from public.company_competitor_research where company_id=$1',[company])).toBe(0);
  await save({references:{value:null,status:'unknown'}},'review_references');await save({services:fact('Musculação'),audience:fact('Adultos'),objective:fact('Mais visitas')});await save({},'confirm');
 });
 it('claims durable work per competitor and stores verifiable candidates without auto-confirming identity',async()=>{
  await server();const job=(await claim())!;expect(job.query).toBe('Academia vizinha');expect(job.city).toBe('Varginha, MG');expect(await scalar('select public.finish_competitor_research_server($1,$2,$3)',[job.id,randomUUID(),[candidate]])).toBe(false);
  expect(await scalar('select public.finish_competitor_research_server($1,$2,$3)',[job.id,job.token,[candidate]])).toBe(true);await as(owner);expect(await scalar('select candidates from public.company_competitor_research where id=$1',[job.id])).toEqual([candidate]);expect(await scalar('select selected_username from public.company_competitor_research where id=$1',[job.id])).toBeNull();expect(await scalar('select count(*)::int from public.company_instagram_watches where company_id=$1',[company])).toBe(0);
 });
 it('links confirmed Instagram identity and includes local evidence in the approved AI context',async()=>{
  await scalar('select public.select_competitor_instagram($1,$2,$3)',[company,'near_one','vizinha.fit']);expect(await scalar('select place_id from public.company_instagram_watches where company_id=$1',[company])).toBe('near_one');await expect(scalar('select public.select_competitor_instagram($1,$2,$3)',[company,'near_two','vizinha.fit'])).rejects.toThrow('another competitor');
  const journey=await scalar<{stages:{basis:string}[];competitorReview:{basis:string}}>('select public.read_marketing_journey($1)',[company]);await expect(scalar('select public.approve_marketing_stage($1,1,$2,$3,$4)',[company,journey.stages[0]!.basis,'',journey.competitorReview.basis])).rejects.toThrow('missing competitor');await scalar('select public.approve_marketing_stage($1,1,$2,$3,$4)',[company,journey.stages[0]!.basis,'Métricas e segundo perfil ainda não disponíveis.',journey.competitorReview.basis]);
  const evidence=await scalar<{localCompetitors:{placeId:string;label:string}[]}>('select snapshot from public.company_marketing_approvals where company_id=$1 and stage=1',[company]);expect(evidence.localCompetitors).toHaveLength(2);expect(evidence.localCompetitors[0]?.label).toBe('Academia vizinha');const brief=await scalar<{competitorEvidence:unknown}>('select public.start_company_strategy($1,$2)',[company,randomUUID()]);expect(brief.competitorEvidence).toEqual(evidence);
 });
 it('invalidates stage approval on changed identity and removes old links safely',async()=>{
  await scalar('select public.select_competitor_instagram($1,$2,$3)',[company,'near_one','outra.vizinha']);const journey=await scalar<{stages:{approved:boolean}[]}>('select public.read_marketing_journey($1)',[company]);expect(journey.stages[0]!.approved).toBe(false);expect(await scalar('select username from public.company_instagram_watches where company_id=$1',[company])).toBe('outra.vizinha');await scalar('select public.select_competitor_instagram($1,$2,$3,true)',[company,'near_one','outra.vizinha']);expect(await scalar("select selected_username from public.company_competitor_research where company_id=$1 and place_id='near_one'",[company])).toBeNull();
 });
 it('rejects late results after a location correction and preserves the new profile',async()=>{
  await server();const job=(await claim())!;expect(job.query).toBe('Estúdio local');await as(owner);await save({city:fact('Outra cidade')},'edit');await server();expect(await scalar('select public.finish_competitor_research_server($1,$2,$3)',[job.id,job.token,[candidate]])).toBe(false);await as(owner);expect(await scalar('select count(*)::int from public.company_competitor_research where company_id=$1 and status=\'stale\'',[company])).toBe(2);const corrected=await read();expect(corrected.state.facts.city?.value).toBe('Outra cidade');expect(corrected.state.facts.placeId).toBeUndefined();expect(corrected.state.facts.competitorPlaceIds).toBeUndefined();expect(corrected.state.location_confirmed).toBe(false);
 });
});

afterEach(()=>{vi.unstubAllEnvs();});
describe('Google Places adapter',()=>{
 const own={id:'own_place',displayName:{text:'Minha academia'},formattedAddress:'Centro',location:{latitude:-21.55,longitude:-45.43},primaryTypeDisplayName:{text:'Academia'},nationalPhoneNumber:'(35) 0000-0000',websiteUri:'https://academia.example.test',regularOpeningHours:{weekdayDescriptions:['Segunda: 06:00–22:00']},rating:4.7,userRatingCount:20,businessStatus:'OPERATIONAL'};
 const snapshot={state:{facts:{name:fact('Minha academia'),city:fact('Varginha'),businessType:fact('Academia'),placeId:fact('own_place')}}} as OnboardingSnapshot;
 it('fetches name and city without AI and returns available commercial facts and provenance',async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({places:[own]})));const found=await new GooglePlacesAdapter('private-key',transport).search(snapshot,'location',3000);expect(found.places[0]?.details).toMatchObject({phone:own.nationalPhoneNumber,hours:['Segunda: 06:00–22:00'],rating:4.7,reviewCount:20,businessType:'Academia'});const [url,init]=transport.mock.calls[0]!;expect(url).toBe('https://places.googleapis.com/v1/places:searchText');expect(JSON.parse(String(init?.body)).textQuery).toBe('Minha academia Varginha');expect(init?.headers).toMatchObject({'X-Goog-FieldMask':expect.stringContaining('places.websiteUri')});expect(JSON.stringify(found)).not.toContain('private-key');
 });
 it('enforces radius, removes the business, closed locations and duplicates but keeps other branches',async()=>{
  const near={...own,id:'near_one',location:{latitude:-21.551,longitude:-45.43}};const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify(own))).mockResolvedValueOnce(new Response(JSON.stringify({places:[own,near,near,{...near,id:'far_away',location:{latitude:0,longitude:0}},{...near,id:'closed_place',businessStatus:'CLOSED_PERMANENTLY'},{...near,id:'no_location',location:undefined}]})));const found=await new GooglePlacesAdapter('fixture',transport).search(snapshot,'competitors',1000);expect(found.places.map(p=>p.id)).toEqual(['near_one']);expect(found.radius).toBe(1000);
 });
 it('does not turn missing metrics into zero or unsafe URLs into links',async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({places:[{id:'valid_id',displayName:{text:'Teste'},websiteUri:'javascript:alert(1)',googleMapsUri:'https://user:pass@example.test'}]})));const found=await new GooglePlacesAdapter('fixture',transport).search(snapshot,'location',3000);expect(found.places[0]?.details).toMatchObject({rating:null,reviewCount:null,website:null,phone:null});expect(found.places[0]?.url).toContain('https://www.google.com/maps/search/');
 });
 it('fails explicitly when the selected location cannot be loaded, without widening the search',async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status:403}));await expect(new GooglePlacesAdapter('fixture',transport).search(snapshot,'competitors',1000)).rejects.toThrow('unavailable');expect(transport).toHaveBeenCalledTimes(1);
 });
});
