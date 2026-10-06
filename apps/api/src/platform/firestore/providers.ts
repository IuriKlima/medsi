import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,uuid,companyAccess,fail,user} from './access';
import {purchaseState} from './onboarding';
export const providerOperations=['reserve_onboarding_provider','finish_onboarding_provider'];
export async function providerRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 const company=uuid(args.p_company_id),request=uuid(args.p_request_id),kind=args.p_kind;
 await companyAccess(tx,actor,company,'marketing.write');
 if(!['places','interpretation','strategy'].includes(kind))fail('22023','Invalid provider kind');
 const key=company+'_'+request+'_'+kind,prior=await tx.get('onboarding_provider_attempts',key);
 if(name==='finish_onboarding_provider'){
  if(!prior||prior.actor_id!==user(actor))fail('42501','Provider request unavailable');
  if(!['completed','failed','incomplete','refused'].includes(args.p_outcome)||JSON.stringify(args.p_usage??null).length>4000)fail('22023','Invalid provider result');
  if(prior!.outcome)return null;
  tx.put('onboarding_provider_attempts',key,{...prior,outcome:args.p_outcome,usage:args.p_usage??null,finished_at:new Date().toISOString()});return null;
 }
 if(kind!=='places'&&!(await purchaseState(tx,actor,company)).aiAllowed)fail('P0402','Payment required before AI processing');
 const limit=await tx.get('onboarding_provider_limits',company+'_'+kind),day=new Date().toISOString().slice(0,10),counterKey=company+'_'+kind+'_'+day,counter=await tx.get('provider_daily_usage',counterKey);
 if(!Number.isInteger(limit?.daily_calls)||limit!.daily_calls<=0||prior||(counter?.count??0)>=limit!.daily_calls)return false;
 tx.put('onboarding_provider_attempts',key,{company_id:company,request_id:request,kind,actor_id:actor.id,outcome:null,created_at:new Date().toISOString()});
 tx.put('provider_daily_usage',counterKey,{company_id:company,kind,day,count:(counter?.count??0)+1});return true;
}

