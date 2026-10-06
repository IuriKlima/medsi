import {config} from 'dotenv';
import {resolve} from 'node:path';
import {getDataConnect} from 'firebase-admin/data-connect';
import {firebaseAdmin,firebaseAuth,firebaseBucket} from './firebase-admin';
import {firestoreDatabase} from './firestore/store';
import {databaseConfigured,firebaseBackend,firestoreBackend} from './config';
import {sqlExecutor,closePostgres} from './postgres';
import {firebaseMigrations,migrationStatus} from './migrations';
const root=resolve(__dirname,'../../../..');config({path:resolve(root,'.env'),quiet:true});
type Check={name:string;status:'ok'|'pending'|'failed';detail:string};
async function main(){
 const checks:Check[]=[];
 const configured=(name:string,ok:boolean,detail:string)=>checks.push({name,status:ok?'ok':'pending',detail:ok?'Configurado localmente; acesso remoto ainda não comprovado.':detail});
 configured('provider',firebaseBackend(),'Selecione DATABASE_PROVIDER=firestore ou firebase_sql.');
 configured('database',databaseConfigured(),firestoreBackend()?'Informe o projeto e o identificador Firestore.':'Informe instância, banco e usuário do Cloud SQL.');
 configured('web-auth',Boolean(process.env.FIREBASE_PROJECT_ID&&(process.env.FIREBASE_WEB_API_KEY||process.env.NEXT_PUBLIC_FIREBASE_API_KEY)),'Preencha a configuração pública do aplicativo Firebase.');
 configured('storage',Boolean(process.env.FIREBASE_STORAGE_BUCKET),'Informe o bucket privado.');
 if(firestoreBackend())checks.push({name:'workflow-migration',status:'pending',detail:'Firestore nativo: identidade e onboarding implementados. Demais operações de negócio ainda exigem migração; produção bloqueada.'});
 if(process.argv.includes('--remote')){
  const check=async(name:string,operation:()=>Promise<unknown>,detail:string)=>{try{await operation();checks.push({name,status:'ok',detail});}catch{checks.push({name,status:'failed',detail:'Acesso não comprovado. Confira ADC, permissões, provisionamento e configuração; nenhum dado ou credencial foi registrado.'});}};
  if(firestoreBackend())await check('firestore',async()=>{const doc=await firestoreDatabase().doc('medsi/v1').get();if(doc.data()?.schemaVersion!==1)throw new Error('Firestore schema pending');},'Namespace MedSI lido com a identidade do servidor.');
  else await check('postgresql',async()=>{await sqlExecutor.run('service_role',null,async db=>{const status=await migrationStatus(db,firebaseMigrations(root));if(status.pending.length)throw new Error('Migrations pending');});},'Conexão e histórico de migrações verificados, somente leitura.');
  await check('firebase-auth-admin',()=>firebaseAuth().listUsers(1),'Leitura administrativa autorizada. Login e e-mail ainda exigem homologação com conta de teste.');
  await check('storage-metadata',()=>firebaseBucket().getMetadata(),'Metadados do bucket acessíveis. Upload, download e URL assinada ainda exigem homologação.');
  if(!firestoreBackend())await check('sql-connect',()=>getDataConnect({serviceId:process.env.FIREBASE_SQL_CONNECT_SERVICE_ID||'medsi',location:process.env.FIREBASE_SQL_CONNECT_LOCATION||'southamerica-east1',connector:'admin'},firebaseAdmin()).executeQuery('MedsiDatabaseStatus'),'Consulta administrativa do conector executada; nenhum dado de clínica é exibido.');
 }
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),remote:process.argv.includes('--remote'),checks},null,2));
 if(checks.some(c=>c.status!=='ok'))process.exitCode=1;
}
main().catch(()=>{console.error('Não foi possível executar o diagnóstico.');process.exitCode=1;}).finally(closePostgres);
