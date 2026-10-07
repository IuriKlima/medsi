import type {DocumentTransaction,Row} from './store';
/** Retain historical research; revoke only the active selections of this company. */
export async function invalidateCompetitorSelection(tx:DocumentTransaction,company:string,state:Row){
 const stamp=new Date().toISOString(),scope=[{field:'company_id',value:company}];
 for(const job of await tx.list('company_regional_research',scope)){
  if(job.status==='stale')continue;
  const key=job.id+'_'+job.revision;if(!await tx.get('company_regional_research_versions',key))tx.put('company_regional_research_versions',key,job);
  tx.put('company_regional_research',job.id,{...job,status:'stale',token:null,lease_until:null,error:'Especialidades, serviços ou endereço mudaram. Atualize a pesquisa e confirme os concorrentes.',snapshot:job.snapshot?.map?{...job.snapshot,map:{...job.snapshot.map,selectedIds:[],confirmedCandidateIds:[],selectionConfirmed:false}}:job.snapshot??null,updated_at:stamp});
 }
 for(const row of await tx.list('company_competitor_research',scope))tx.put('company_competitor_research',row.id,{...row,status:'stale',selected_username:null,token:null,lease_until:null});
 state.competitors_reviewed=false;state.facts={...state.facts};
 for(const key of ['competitors','competitorPlaceIds'])state.facts[key]={value:null,status:'deferred',source:'user',actorId:null,updatedAt:stamp};
}
