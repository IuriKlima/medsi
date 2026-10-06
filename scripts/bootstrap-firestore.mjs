/* global console */
import fs from 'node:fs';
import {createRequire} from 'node:module';
const cliRequire=createRequire(import.meta.url);
const project='atendimentomac-88940',databaseId='(default)';
function encode(value){
 if(value===null)return {nullValue:null};
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return {integerValue:String(value)};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
 return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
}
async function main(){
 const apply=process.argv.includes('--apply');if(apply&&!process.argv.includes('--project='+project))throw Error('Explicit project confirmation required');
 const auth=cliRequire('../node_modules/firebase-tools/lib/auth'),{requireAuth}=cliRequire('../node_modules/firebase-tools/lib/requireAuth'),api=cliRequire('../node_modules/firebase-tools/lib/apiv2');
 await requireAuth({project,projectId:project,nonInteractive:true,...auth.getProjectDefaultAccount(process.cwd())});
 const client=new api.Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1',auth:true}),firestore=cliRequire('../node_modules/firebase-tools/lib/gcp/firestore');
 const features=['strategy','content','crm','sites','inbox','triage','ads','campaigns','analytics'];
 const documents=[
  ['medsi/v1',{application:'MedSI',schemaVersion:1,provider:'firestore',migrationStatus:'in-progress',productionReady:false,initializedAt:new Date().toISOString()}],
  ['medsi/v1/plan_catalog/askadia_monthly',{id:'askadia_monthly',name:'MedSI Mensal',kind:'plan',price_cents:159700,features,quotas:{}}],
  ['medsi/v1/plan_catalog/askadia_semiannual',{id:'askadia_semiannual',name:'MedSI Semestral · até 6 parcelas',kind:'plan',price_cents:800000,features,quotas:{}}]
 ];
 const base='projects/'+project+'/databases/'+databaseId+'/documents';
 const existing=await firestore.getDocuments(project,documents.map(([path])=>path),databaseId);
 const root=existing.documents.find(d=>d.name===base+'/medsi/v1');
 if(root&&(root.fields?.application?.stringValue!=='MedSI'||root.fields?.schemaVersion?.integerValue!=='1'))throw Error('Existing namespace requires review');
 const missing=documents.filter(([path])=>!existing.documents.some(d=>d.name===base+'/'+path));
 if(apply&&missing.length)await client.post(base+':commit',{writes:missing.map(([path,value])=>({update:{name:base+'/'+path,fields:encode(value).mapValue.fields},currentDocument:{exists:false}}))},{skipLog:{reqBody:true,resBody:true}});
 const verify=apply?await firestore.getDocuments(project,documents.map(([path])=>path),databaseId):existing;
 const report={project,databaseId,mode:apply?'apply':'read-only',created:apply?missing.map(([p])=>p):[],pending:apply?[]:missing.map(([p])=>p),verifiedDocuments:verify.documents.length,productionReady:false};
 fs.mkdirSync('.local',{recursive:true});
 fs.writeFileSync('.local/firestore-bootstrap-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

