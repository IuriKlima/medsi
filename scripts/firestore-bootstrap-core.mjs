export function bootstrapTarget(argv,env){
 const project=env.FIREBASE_PROJECT_ID,databaseId=env.FIRESTORE_DATABASE_ID||'(default)',apply=argv.includes('--apply'),plan=argv.includes('--plan');
 if(!project||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project))throw Error('Configure a valid FIREBASE_PROJECT_ID');
 if(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID&&env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!==project)throw Error('Web and server must use the same project');
 if(databaseId!=='(default)'&&!/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(databaseId))throw Error('Configure a valid Firestore database ID');
 if(plan&&apply)throw Error('Offline plan cannot apply writes');
 if(apply&&!argv.includes('--project='+project))throw Error('Explicit project confirmation required');
 if(argv.some(v=>v.startsWith('--project=')&&v!=='--project='+project))throw Error('Explicit project must match FIREBASE_PROJECT_ID');
 return {project,databaseId,apply,plan};
}
function encode(value){
 if(value===null)return {nullValue:null};
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return {integerValue:String(value)};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
 return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
}
export function bootstrapDocuments(timestamp=new Date().toISOString()){
 const features=['strategy','content','crm','sites','inbox','triage','ads','campaigns','analytics'];
 const documents=[
  ['medsi/v1',{application:'MedSI',schemaVersion:1,provider:'firestore',migrationStatus:'in-progress',productionReady:false,initializedAt:timestamp}],
  ['medsi/v1/plan_catalog/askadia_monthly',{id:'askadia_monthly',name:'MedSI Mensal',kind:'plan',price_cents:159700,features,quotas:{}}],
  ['medsi/v1/plan_catalog/askadia_semiannual',{id:'askadia_semiannual',name:'MedSI Semestral · até 6 parcelas',kind:'plan',price_cents:800000,features,quotas:{}}]
 ];
 return documents;
}
export function bootstrapWrites(base,existing,documents){
 const root=existing.find(d=>d.name===base+'/medsi/v1');
 if(root&&(root.fields?.application?.stringValue!=='MedSI'||root.fields?.schemaVersion?.integerValue!=='1'))throw Error('Existing namespace requires review');
 return documents.filter(([path])=>!existing.some(d=>d.name===base+'/'+path)).map(([path,value])=>({update:{name:base+'/'+path,fields:encode(value).mapValue.fields},currentDocument:{exists:false}}));
}
