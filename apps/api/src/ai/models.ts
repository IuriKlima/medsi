/** Historical names retained for migration reports only; these are not verified
 * account IDs and are never selected implicitly for provider calls. */
export const agentModelDefaults={strategy:'gpt-6-astra',orchestrator:'gpt-6-astra',site:'gpt-6-astra',ads:'gpt-6-astra',copy:'gpt-6-sol',chat:'gpt-6-luna',search:'gpt-6-luna',attendance:'gpt-6-luna'} as const;
export const modelVariables={strategy:'OPENAI_MODEL_STRATEGY',orchestrator:'OPENAI_MODEL_ORCHESTRATOR',site:'OPENAI_MODEL_SITE',ads:'OPENAI_MODEL_ADS',copy:'OPENAI_MODEL_COPY',chat:'OPENAI_MODEL_CHAT',search:'OPENAI_MODEL_SEARCH',attendance:'OPENAI_MODEL_ATTENDANCE',image:'OPENAI_MODEL_IMAGE'} as const;
export type ModelRole=keyof typeof modelVariables;
type Environment=Record<string,string|undefined>;
function configuredModel(role:ModelRole,env:Environment){
 // SOL is an operator preference for analysis, never an inferred provider ID.
 const value=(role==='strategy'?env.OPENAI_MODEL_ANALYSIS?.trim():null)||env[modelVariables[role]]?.trim();
 return value&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(value)?value:null;
}
/** Resolve at call time: dotenv is loaded after application imports. */
export function agentModel(role:ModelRole){const model=configuredModel(role,process.env);if(!model)throw new Error('Configure um ID de modelo validado para '+modelVariables[role]+'.');return model;}
/** Configuration presence is not provider availability or feature compatibility. */
export function agentModelsConfigured(...roles:ModelRole[]){return Boolean(process.env.OPENAI_API_KEY?.trim()&&roles.length&&roles.every(role=>configuredModel(role,process.env)));}
export type ModelPreflightState='unconfigured'|'unverified'|'listed'|'missing';
export type ModelPreflight={state:'unconfigured'|'completed'|'failed';checkedAt:string|null;failure:'unauthorized'|'rate_limited'|'provider_unavailable'|'invalid_response'|null;roles:Partial<Record<ModelRole,{model:string|null;state:ModelPreflightState}>>};
/** Explicit, read-only preflight. Never runs at import/startup or generates content.
 * A listing confirms visibility only, not Responses/tools/image compatibility. */
export async function preflightOpenAIModels(options:{roles?:ModelRole[];env?:Environment;fetcher?:typeof fetch}={}):Promise<ModelPreflight>{
 const env=options.env??process.env,requested=[...new Set(options.roles??Object.keys(modelVariables) as ModelRole[])];
 const roles:ModelPreflight['roles']={};for(const role of requested){const model=configuredModel(role,env);roles[role]={model,state:model?'unverified':'unconfigured'};}
 const report:ModelPreflight={state:'unconfigured',checkedAt:null,failure:null,roles};
 if(!env.OPENAI_API_KEY?.trim()||!Object.values(roles).some(r=>r.model))return report;
 report.checkedAt=new Date().toISOString();report.state='failed';
 try{
  const response=await (options.fetcher??fetch)('https://api.openai.com/v1/models',{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,...(env.OPENAI_ORG_ID?{'OpenAI-Organization':env.OPENAI_ORG_ID}:{}),...(env.OPENAI_PROJECT_ID?{'OpenAI-Project':env.OPENAI_PROJECT_ID}:{})},signal:AbortSignal.timeout(10000)});
  if(!response.ok){report.failure=response.status===401||response.status===403?'unauthorized':response.status===429?'rate_limited':'provider_unavailable';return report;}
  const body=await response.json() as {data?:unknown};if(!Array.isArray(body.data)||body.data.length>10000||body.data.some(row=>!row||typeof row!=='object'||typeof (row as {id?:unknown}).id!=='string')){report.failure='invalid_response';return report;}
  const ids=new Set(body.data.map(row=>(row as {id:string}).id));for(const status of Object.values(roles))if(status.model)status.state=ids.has(status.model)?'listed':'missing';report.state='completed';return report;
 }catch{report.failure='provider_unavailable';return report;}
}
