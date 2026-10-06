import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import type {SqlSession} from './postgres';
export type Migration={name:string;sql:string;hash:string;owner:boolean};
export function firebaseMigrations(root=process.cwd()):Migration[]{
 const files=[['foundation','firebase/sql/bootstrap.sql',false],...readdirSync(root+'/supabase/migrations').filter(f=>f.endsWith('.sql')).sort().map(f=>[f,'supabase/migrations/'+f,true]),['firebase-identity','firebase/sql/identity.sql',false]] as [string,string,boolean][];
 return files.map(([name,path,owner])=>{const sql=readFileSync(root+'/'+path,'utf8').replace(/\r\n/g,'\n');return {name,sql,owner,hash:createHash('sha256').update(sql).digest('hex')};});
}
export function transactionalSql(sql:string){return sql.replace(/^\s*(begin|commit);[ \t]*$/gmi,'');}
export async function migrationStatus(db:SqlSession,migrations:Migration[]){
 const marker=await db.query<{registry:string|null}>("select to_regclass('medsi_migrations.applied')::text as registry");
 const applied=marker.rows[0]?.registry?(await db.query<{name:string;hash:string}>('select name,hash from medsi_migrations.applied')).rows:[];
 const map=new Map(applied.map(r=>[r.name,r.hash]));
 for(const migration of migrations)if(map.has(migration.name)&&map.get(migration.name)!==migration.hash)throw new Error('Applied migration was modified: '+migration.name);
 if(!marker.rows[0]?.registry){
  const existing=await db.query<{count:string}>("select count(*)::text as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind in ('r','p') and not exists(select 1 from pg_depend d where d.objid=c.oid and d.deptype='e')");
  if(Number(existing.rows[0]?.count))throw new Error('Existing database has no MedSI migration registry. Import/migration review is required; nothing was changed.');
  const roles=await db.query("select rolname from pg_roles where rolname in ('medsi_owner','anon','authenticated','service_role')");
  if(roles.rows.length)throw new Error('Reserved PostgreSQL roles already exist. Use a dedicated MedSI instance or review role ownership before installation.');
 }
 return {applied:applied.length,pending:migrations.filter(m=>!map.has(m.name))};
}
export async function applyFirebaseMigrations(db:SqlSession,migrations:Migration[]){
 await db.query('begin');
 try{
  await db.query("select pg_advisory_xact_lock(hashtextextended('medsi:install',0))");
  const status=await migrationStatus(db,migrations);
  await db.query('create schema if not exists medsi_migrations');
  await db.query('create table if not exists medsi_migrations.applied(name text primary key,hash text not null,applied_at timestamptz not null default now())');
  for(const m of status.pending){
   if(m.owner)await db.query('set local role medsi_owner');
   await db.query(transactionalSql(m.sql));
   await db.query('reset role');
   await db.query('insert into medsi_migrations.applied(name,hash) values($1,$2)',[m.name,m.hash]);
  }
  await db.query('grant usage on schema medsi_migrations to service_role');
  await db.query('grant select on medsi_migrations.applied to service_role');
  await db.query('commit');return status.pending.map(m=>m.name);
 }catch(e){await db.query('rollback').catch(()=>{});throw e;}
}

export async function grantRuntimeRoles(db:SqlSession,login:string){
 if(!login||login.length>63||Array.from(login).some(c=>c.charCodeAt(0)<32))throw new Error('Invalid runtime login');
 const role=await db.query<{rolcanlogin:boolean;rolsuper:boolean;rolcreaterole:boolean;rolbypassrls:boolean;installer:boolean}>('select rolcanlogin,rolsuper,rolcreaterole,rolbypassrls,rolname=current_user as installer from pg_roles where rolname=$1',[login]);
 const r=role.rows[0];if(!r?.rolcanlogin||r.rolsuper||r.rolcreaterole||r.rolbypassrls||r.installer)throw new Error('Use an existing dedicated runtime login without administrative role attributes, separate from the installer.');
 const quoted='"'+login.replaceAll('"','""')+'"';
 await db.query('begin');
 try{
  await db.query('alter role '+quoted+' noinherit');
  const version=await db.query<{version:string}>("select current_setting('server_version_num') as version");
  const membership='grant authenticated,anon,service_role to '+quoted;
  if(Number(version.rows[0]?.version)>=160000){await db.query(membership+' with inherit false');await db.query(membership+' with set true');await db.query(membership+' with admin false');}
  else await db.query(membership);
  await db.query('commit');
 }catch(e){await db.query('rollback').catch(()=>{});throw e;}
}
