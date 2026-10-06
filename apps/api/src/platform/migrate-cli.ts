import {config} from 'dotenv';
import {resolve} from 'node:path';
import {postgresPool,closePostgres} from './postgres';
import {firebaseMigrations,migrationStatus,applyFirebaseMigrations,grantRuntimeRoles} from './migrations';
const root=resolve(__dirname,'../../../..');
config({path:resolve(root,'.env'),quiet:true});
async function main(){
 const runtime=process.argv.find(a=>a.startsWith('--runtime-user='))?.slice('--runtime-user='.length);
 const apply=process.argv.includes('--apply'),project=process.env.FIREBASE_PROJECT_ID,database=process.env.DATABASE_NAME;
 if(process.env.DATABASE_PROVIDER!=='firebase_sql')throw new Error('Select DATABASE_PROVIDER=firebase_sql.');
 if(!project||!database)throw new Error('Configure FIREBASE_PROJECT_ID and DATABASE_NAME.');
 if(process.env.CLOUD_SQL_CONNECTION_NAME&&!process.env.CLOUD_SQL_CONNECTION_NAME.startsWith(project+':'))throw new Error('Cloud SQL instance belongs to a different project.');
 if(apply&&(!process.argv.includes('--project='+project)||!process.argv.includes('--database='+database)))throw new Error('Review the check output, then explicitly pass --apply --project=<project> --database=<database>.');
 const connection=await (await postgresPool()).connect();
 try{
  const actual=await connection.query<{name:string}>('select current_database() as name');if(actual.rows[0]?.name!==database)throw new Error('Connected database does not match DATABASE_NAME.');
  const migrations=firebaseMigrations(root),status=await migrationStatus(connection,migrations);
  console.log(JSON.stringify({project,database,applied:status.applied,pending:status.pending.map(m=>m.name),runtimeUser:runtime??null,mode:apply?'apply':'read-only'},null,2));
  if(apply){console.log('Applied '+(await applyFirebaseMigrations(connection,migrations)).length+' migrations.');if(runtime){await grantRuntimeRoles(connection,runtime);console.log('Runtime SQL roles configured.');}}
 }finally{connection.release();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Database preparation failed');process.exitCode=1;}).finally(closePostgres);
