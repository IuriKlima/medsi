/* global console */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {bootstrapTarget,bootstrapWrites,bootstrapDocuments} from './firestore-bootstrap-core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cliRequire=createRequire(import.meta.url),appRequire=createRequire(resolve(root,'apps/api/package.json'));
appRequire('dotenv').config({path:resolve(root,'.env'),quiet:true});
function report(value){fs.mkdirSync(resolve(root,'.local'),{recursive:true});fs.writeFileSync(resolve(root,'.local/firestore-bootstrap-result.json'),JSON.stringify(value,null,2));console.log(JSON.stringify(value,null,2));}
async function main(){
 const {project,databaseId,apply,plan}=bootstrapTarget(process.argv.slice(2),process.env),documents=bootstrapDocuments();
 if(plan){report({project,databaseId,mode:'offline-plan',documents:documents.map(([path])=>path),remoteValidated:false,productionReady:false});return;}
 const auth=cliRequire('../node_modules/firebase-tools/lib/auth'),{requireAuth}=cliRequire('../node_modules/firebase-tools/lib/requireAuth'),api=cliRequire('../node_modules/firebase-tools/lib/apiv2');
 try{await requireAuth({project,projectId:project,nonInteractive:true,...auth.getProjectDefaultAccount(root)});}catch{throw Error('Firebase administrative access unavailable. Configure GOOGLE_APPLICATION_CREDENTIALS or an authorized Firebase CLI session; no data was written.');}
 const client=new api.Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1',auth:true}),firestore=cliRequire('../node_modules/firebase-tools/lib/gcp/firestore');
 const base='projects/'+project+'/databases/'+databaseId+'/documents';
 const existing=await firestore.getDocuments(project,documents.map(([path])=>path),databaseId);
 const writes=bootstrapWrites(base,existing.documents,documents);
 if(apply&&writes.length)await client.post(base+':commit',{writes},{skipLog:{reqBody:true,resBody:true}});
 const verify=apply?await firestore.getDocuments(project,documents.map(([path])=>path),databaseId):existing;
 const pending=bootstrapWrites(base,verify.documents,documents).map(w=>w.update.name.slice(base.length+1));
 report({project,databaseId,mode:apply?'apply':'read-only',created:apply?writes.map(w=>w.update.name.slice(base.length+1)):[],pending,verifiedDocuments:verify.documents.length,productionReady:false});
 if(apply&&pending.length)throw Error('Initialization could not be verified; inspect the report before retrying.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
