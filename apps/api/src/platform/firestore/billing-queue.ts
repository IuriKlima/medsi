import {queueStates,queueClaimed,queueClaimOrder} from './queue-scan';
import {randomUUID} from 'node:crypto';
import type {DocumentTransaction,Row} from './store';
export async function scheduleBillingReconciliation(tx:DocumentTransaction,subscriptionId:string,companyId:string,environment:string){
 const previous=await tx.get('billing_reconciliation_jobs',subscriptionId);if(previous&&Date.parse(previous.lease_until??'')>Date.now())return;
 tx.put('billing_reconciliation_jobs',subscriptionId,{subscription_id:subscriptionId,company_id:companyId,environment,status:'pending',attempts:0,next_attempt_at:new Date().toISOString(),lease_token:null,lease_until:null,error_code:null});
}
export async function claimBillingReconciliation(tx:DocumentTransaction):Promise<Row|null>{
 const rows=await queueStates(tx,'billing_reconciliation_jobs',['pending','running'],'status',[{field:'environment',value:'sandbox'}]);
 for(const row of rows.sort((a,b)=>queueClaimOrder(a,b)||String(a.next_attempt_at).localeCompare(String(b.next_attempt_at)))){
  if(['pending','running'].includes(row.status)&&row.attempts>=8&&!(Date.parse(row.lease_until??'')>Date.now())){tx.put('billing_reconciliation_jobs',row.subscription_id,{...row,status:'blocked',lease_token:null,lease_until:null,error_code:'BILLING_ATTEMPT_LIMIT'});continue;}
  if(!['pending','running'].includes(row.status)||row.attempts>=8||Date.parse(row.next_attempt_at)>Date.now()||Date.parse(row.lease_until??'')>Date.now())continue;
  queueClaimed(tx,row);const job={...row,queue_claimed_at:new Date().toISOString(),status:'running',attempts:Number(row.attempts)+1,lease_token:randomUUID(),lease_until:new Date(Date.now()+180000).toISOString()};tx.put('billing_reconciliation_jobs',row.subscription_id,job);return job;
 }
 return null;
}
export async function finishBillingReconciliation(tx:DocumentTransaction,job:Row,success:boolean,status?:string){
 const current=await tx.get('billing_reconciliation_jobs',job.subscription_id);if(!current||current.lease_token!==job.lease_token||!(Date.parse(current.lease_until)>Date.now()))return false;
 const cancelled=status==='cancelled',blocked=!success&&current.attempts>=8,delay=success?(status==='active'?3600000:300000):Math.min(3600000,60000*2**(current.attempts-1));
 tx.put('billing_reconciliation_jobs',job.subscription_id,{...current,status:cancelled?'cancelled':blocked?'blocked':'pending',attempts:success?0:current.attempts,lease_token:null,lease_until:null,next_attempt_at:new Date(Date.now()+delay).toISOString(),error_code:success?null:'BILLING_PROVIDER_UNAVAILABLE',finished_at:new Date().toISOString()});return true;
}
