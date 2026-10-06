import {Pool,type PoolConfig,type QueryResultRow} from 'pg';
import {AuthTypes,Connector,IpAddressTypes} from '@google-cloud/cloud-sql-connector';
export type DbRole='authenticated'|'service_role'|'anon';
export type SqlSession={query<T extends QueryResultRow=QueryResultRow>(text:string,values?:unknown[]):Promise<{rows:T[]}>};
export interface SqlExecutor {run<T>(role:DbRole,actorId:string|null,operation:(db:SqlSession)=>Promise<T>):Promise<T>}
let poolPromise:Promise<Pool>|undefined;let connector:Connector|undefined;
async function createPool(){
 const options:PoolConfig={max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:30000,application_name:'medsi-api'};
 if(process.env.DATABASE_URL){
  const url=new URL(process.env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Invalid database URL');
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);if(process.env.NODE_ENV==='production'&&!local)throw new Error('Production Cloud SQL connections must use the authenticated Cloud SQL connector');
  options.connectionString=url.href;
 }else{
  const instanceConnectionName=process.env.CLOUD_SQL_CONNECTION_NAME,user=process.env.DATABASE_USER,database=process.env.DATABASE_NAME;
  if(!instanceConnectionName||!user||!database)throw new Error('Cloud SQL connection is not configured');
  connector=new Connector();Object.assign(options,await connector.getOptions({instanceConnectionName,ipType:process.env.CLOUD_SQL_IP_TYPE==='PRIVATE'?IpAddressTypes.PRIVATE:IpAddressTypes.PUBLIC,authType:process.env.DATABASE_AUTH==='password'?AuthTypes.PASSWORD:AuthTypes.IAM}),{user,database,...(process.env.DATABASE_AUTH==='password'?{password:process.env.DATABASE_PASSWORD}:{})});
 }
 const pool=new Pool(options);pool.on('error',()=>{/* No credentials or SQL payloads in logs. */});return pool;
}
export function postgresPool(){if(!poolPromise)poolPromise=createPool().catch(e=>{connector?.close();connector=undefined;poolPromise=undefined;throw e;});return poolPromise;}
export const sqlExecutor:SqlExecutor={async run(role,actorId,operation){
 const connection=await (await postgresPool()).connect();
 try{
  await connection.query('begin');
  await connection.query("select set_config('role',$1,true),set_config('request.jwt.claim.sub',$2,true),set_config('request.jwt.claims',$3,true)",[role,actorId??'',JSON.stringify({sub:actorId,role})]);
  const result=await operation(connection);await connection.query('commit');return result;
 }catch(e){await connection.query('rollback').catch(()=>{});throw e;}finally{connection.release();}
}};
export async function closePostgres(){if(poolPromise)await (await poolPromise).end();connector?.close();poolPromise=undefined;connector=undefined;}
