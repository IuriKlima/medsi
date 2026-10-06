import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {firebaseSqlClient} from '../apps/api/src/platform/database-client';
import type {SqlExecutor,SqlSession} from '../apps/api/src/platform/postgres';
import {firebaseMigrations,applyFirebaseMigrations,migrationStatus,grantRuntimeRoles} from '../apps/api/src/platform/migrations';
const files=vi.hoisted(()=>({file:vi.fn()}));
vi.mock('../apps/api/src/platform/firebase-admin',()=>({firebaseBucket:()=>files}));
let db:PGlite,executor:SqlExecutor,admin:ReturnType<typeof firebaseSqlClient>,a:ReturnType<typeof firebaseSqlClient>,b:ReturnType<typeof firebaseSqlClient>,actorA:string,actorB:string,company:string,workspace:string;
async function value<T>(request:PromiseLike<{data:unknown;error:unknown}>){const r=await request;if(r.error)throw r.error;return r.data as T;}
function session(database:PGlite):SqlSession{return {async query<T>(sql:string,values?:unknown[]){if(values?.length)return await database.query(sql,values) as {rows:T[]};const rows=await database.exec(sql);return {rows:(rows.at(-1)?.rows??[]) as T[]};}};}
describe('Firebase PostgreSQL compatibility, authorization and private files',()=>{
 beforeAll(async()=>{
  db=new PGlite();
  // Only pgcrypto's extension declaration is omitted: PGlite already has gen_random_uuid.
  const migrations=firebaseMigrations().map(m=>({...m,sql:m.sql.replaceAll('create extension if not exists pgcrypto;','')}));
  await applyFirebaseMigrations(session(db),migrations);
  executor={run:(role,actor,op)=>db.transaction(async tx=>{
   await tx.query("select set_config('role',$1,true),set_config('request.jwt.claim.sub',$2,true),set_config('request.jwt.claims',$3,true)",[role,actor??'',JSON.stringify({sub:actor,role})]);
   return op(tx as SqlSession);
  })};
  admin=firebaseSqlClient('service_role',null,executor);
  actorA=await value<string>(admin.rpc('ensure_firebase_identity_server',{p_uid:'firebase-a',p_email:'same@example.test',p_name:'A'}));
  actorB=await value<string>(admin.rpc('ensure_firebase_identity_server',{p_uid:'firebase-b',p_email:'same@example.test',p_name:'B'}));
  a=firebaseSqlClient('authenticated',actorA,executor);b=firebaseSqlClient('authenticated',actorB,executor);
  workspace=await value<string>(a.rpc('create_workspace',{p_name:'Clínica de teste'}));
  company=(await value<{id:string}>(a.rpc('create_company',{p_workspace_id:workspace,p_name:'MedSI Teste',p_segment:'clinic',p_city:'São Paulo',p_timezone:'America/Sao_Paulo'}).single())).id;
 },180000);
 afterAll(async()=>{await db?.close();});
 it('keeps stable UUIDs per verified Firebase UID and never merges by email',async()=>{
  expect(actorA).not.toBe(actorB);
  expect(await value(admin.rpc('ensure_firebase_identity_server',{p_uid:'firebase-a',p_email:'new@example.test',p_name:'A'}))).toBe(actorA);
  expect((await a.rpc('ensure_firebase_identity_server',{p_uid:'attacker',p_email:'same@example.test',p_name:'X'})).error?.code).toBe('42501');
 });
 it('retains SQL capabilities, composite RPC results and tenant RLS',async()=>{
  expect((await value<{actions:string[]}>(a.rpc('company_capabilities',{p_company_id:company}))).actions).toContain('marketing.write');
  expect(await value(b.from('companies').select('id,name').eq('id',company))).toEqual([]);
  expect((await b.rpc('update_company',{p_company_id:company,p_name:'Invadida',p_segment:'clinic',p_city:'São Paulo',p_timezone:'America/Sao_Paulo',p_archived:false})).error?.code).toBe('42501');
  expect((await a.from('companies').select('id,name').eq('id',company).single()).data).toEqual({id:company,name:'MedSI Teste'});
 });
 it('supports exact counts, pagination, filters and single cardinality',async()=>{
  const result=await a.from('companies').select('id',{count:'exact'}).in('id',[company]).is('archived_at',null).order('created_at').range(0,0);
  expect(result.error).toBeNull();expect(result.count).toBe(1);expect(result.data).toHaveLength(1);
  expect((await b.from('companies').select('id').single()).error?.code).toBe('PGRST116');
  expect(await value(b.from('companies').select('id').maybeSingle())).toBeNull();
  const head=await a.from('companies').select('id',{count:'exact',head:true});expect(head.data).toBeNull();expect(head.count).toBe(1);
  expect(await value(a.from('companies').select('id').in('id',[]))).toEqual([]);
 });
 it('does not leak actor or service roles between concurrent transactions',async()=>{
  const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).from('companies').select('id').eq('id',company)));
  results.forEach((r,i)=>expect(r.data).toHaveLength(i%2?1:0));
  expect((await db.query<{role:string}>('select current_user as role')).rows[0]?.role).not.toBe('authenticated');
 });
 it('grants runtime membership without implicit ownership or tenant access',async()=>{
  await db.exec('create role firebase_runtime login');
  // Existing membership must also lose inheritance on PostgreSQL 16+.
  await db.exec('grant service_role to firebase_runtime');
  await grantRuntimeRoles(session(db),'firebase_runtime');
  const permissions=await db.query("select pg_has_role('firebase_runtime','service_role','USAGE') as inherits,pg_has_role('firebase_runtime','authenticated','MEMBER') as member");
  expect(permissions.rows[0]).toEqual({inherits:false,member:true});
  await grantRuntimeRoles(session(db),'firebase_runtime');
  expect((await a.from('companies').select('id')).data).toHaveLength(1);
  expect((await b.from('companies').select('id')).data).toEqual([]);
 });
 it('parameterizes strings and rejects SQL identifiers supplied as syntax',async()=>{
  expect(await value(a.from('companies').select('id').eq('name',"' OR true;--"))).toEqual([]);
  expect(()=>a.from('companies;drop table companies')).toThrow('Invalid SQL identifier');
  expect(()=>a.from('companies').select('id,(select secret)')).toThrow('Invalid SQL identifier');
 });
 it('serializes JSON and native arrays, defaults and set-returning RPCs',async()=>{
  await db.exec("set role medsi_owner;create function public.firebase_test_args(p_json jsonb,p_ids uuid[],p_text text default 'default') returns jsonb language sql as $$ select jsonb_build_object('json',p_json,'ids',p_ids,'text',p_text) $$;create function public.firebase_test_set(p_count int) returns setof int language sql as $$ select generate_series(1,p_count) $$;reset role;");
  const result=await value(a.rpc('firebase_test_args',{p_json:[{quote:"'string"}],p_ids:[company],p_text:undefined}));
  expect(result).toEqual({json:[{quote:"'string"}],ids:[company],text:'default'});
  expect(await value(a.rpc('firebase_test_set',{p_count:2}))).toEqual([1,2]);
 });
 it('authorizes Storage before touching the bucket and uses immutable private objects',async()=>{
  const stored=Buffer.from('%PDF-1.4\nfixture');
  const file={save:vi.fn().mockResolvedValue(undefined),delete:vi.fn().mockResolvedValue(undefined),getMetadata:vi.fn().mockResolvedValue([{size:stored.length,contentType:'application/pdf'}]),download:vi.fn().mockResolvedValue([stored]),getSignedUrl:vi.fn().mockResolvedValue(['https://storage.example.test/short-lived'])};
  files.file.mockReturnValue(file);const path=company+'/onboarding/fixture.pdf';
  const upload=await a.storage.from('company-assets').upload(path,stored,{contentType:'application/pdf'});expect(upload.error).toBeNull();
  expect(files.file).toHaveBeenCalledWith('medsi/company-assets/'+path);
  files.file.mockClear();
  expect((await b.storage.from('company-assets').download(path)).error?.message).toBe('Access denied');
  expect(files.file).not.toHaveBeenCalled();
  const download=await a.storage.from('company-assets').download(path);expect(await download.data?.text()).toBe(stored.toString());
  expect((await a.storage.from('company-assets').upload(path,stored,{contentType:'application/pdf'})).error?.message).toBe('The resource already exists');
  expect((await a.storage.from('company-assets').createSignedUrl(path,601)).error).not.toBeNull();
  expect((await a.storage.from('company-assets').remove([path])).error?.message).toBe('Access denied');
  expect((await a.storage.from('company-assets').download(company+'/../escape.pdf')).error).not.toBeNull();
 });
 it('migration reruns are idempotent and edited applied scripts are rejected',async()=>{
  const migrations=firebaseMigrations().map(m=>({...m,sql:m.sql.replaceAll('create extension if not exists pgcrypto;','')}));
  expect((await migrationStatus(session(db),migrations)).pending).toEqual([]);
  expect(await applyFirebaseMigrations(session(db),migrations)).toEqual([]);
  await expect(migrationStatus(session(db),migrations.map((m,i)=>i?m:{...m,hash:'changed'}))).rejects.toThrow('modified');
 });
 it('refuses an existing database without migration history',async()=>{
  const before=(await db.query('select id from public.companies')).rows;
  await db.exec('alter schema medsi_migrations rename to medsi_migrations_saved');
  try{await expect(migrationStatus(session(db),firebaseMigrations())).rejects.toThrow('nothing was changed');expect((await db.query('select id from public.companies')).rows).toEqual(before);}finally{await db.exec('alter schema medsi_migrations_saved rename to medsi_migrations');}
 },60000);
});
