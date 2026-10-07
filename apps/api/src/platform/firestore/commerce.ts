import {subscriptionEntitlement} from './billing';
import {context,stages} from './journey-state';
import {commercePlans,type PurchaseState} from '@askadia/contracts';
import type {DocumentTransaction,Row} from './store';
import {type FirestoreActor,user,server,uuid,companyAccess,audit,fail} from './access';

export const commerceOperations=['begin_test_checkout','complete_test_checkout_server'];
const confirmed=(state:Row|null)=>Boolean(state&&state.profile_version>0&&state.confirmed_revision===state.revision);
function testMode(){if(process.env.CHECKOUT_MODE!=='test'||process.env.NODE_ENV==='production')fail('22023','Test checkout is disabled');}

/** A test grant is persisted separately and must point to an approved checkout
 * for this clinic. Neither a missing subscription nor an env flag grants access. */
export async function purchaseState(tx:DocumentTransaction,actor:FirestoreActor,id:string):Promise<PurchaseState>{
 const access=await companyAccess(tx,actor,id);
 const [subscription,onboarding,setup,grant]=await Promise.all([
  tx.get('company_subscriptions',id),tx.get('company_onboarding',id),tx.get('company_setup',id),tx.get('company_test_access',id)
 ]);
 const approved=grant?.checkout_id?await tx.get('company_test_checkouts',grant.checkout_id):null;
 const linked=Boolean(grant?.company_id===id&&approved?.company_id===id&&approved?.mode==='test'&&approved?.status==='test_approved');
 const {live,sandbox}=subscriptionEntitlement(subscription);
 const test=Boolean(process.env.CHECKOUT_MODE==='test'&&process.env.NODE_ENV!=='production'&&linked&&Date.parse(grant!.valid_until)>Date.now());
 const canPurchase=access.actions.includes('billing.manage');
 let latest:Row|null=null;
 if(canPurchase){
  const cursor=await tx.get('company_checkout_state',id);
  if(cursor?.company_id===id&&cursor.latest_checkout_id)latest=await tx.get('company_test_checkouts',cursor.latest_checkout_id);
  if(latest?.company_id!==id)latest=null;
  if(!latest){const history=await tx.list('company_test_checkouts',[{field:'company_id',value:id}]);latest=history.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id)))[0]??null;}
 }
 const setupValid=Boolean(setup&&!setup.invalidated_at&&setup.profile_version===onboarding?.profile_version&&confirmed(onboarding)&&stages(await context(tx,id)).every((s,i)=>s.approved&&s.basis===setup.bases?.[i]));
 return {companyId:id,aiAllowed:live||test||sandbox,accessMode:live?'live':test||sandbox?'test':'none',testUntil:sandbox?subscription!.current_period_end:linked?grant!.valid_until:null,planId:live||sandbox?subscription!.plan_id:linked?approved!.plan_id:null,onboardingComplete:confirmed(onboarding),setupComplete:setupValid,canPurchase,canWrite:access.actions.includes('marketing.write'),latestCheckout:latest as PurchaseState['latestCheckout']};
}

export async function commerceRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row){
 if(name==='begin_test_checkout'){
  const actorId=user(actor),companyId=uuid(args.p_company_id),id=uuid(args.p_id);
  const {company}=await companyAccess(tx,actor,companyId,'billing.manage');testMode();
  if(!confirmed(await tx.get('company_onboarding',companyId)))fail('22023','Confirm onboarding first');
  const plan=commercePlans.find(p=>p.id===args.p_plan);if(!plan)fail('22023','Invalid checkout plan');
  const installments=args.p_installments??plan!.installments;
  if(!Number.isInteger(installments)||installments<1||installments>6||(plan!.id==='askadia_monthly'&&installments!==1))fail('22023','Invalid installments');
  const prior=await tx.get('company_test_checkouts',id);
  if(prior){
   if(prior.company_id!==companyId||prior.actor_id!==actorId||prior.plan_id!==plan!.id||prior.installments!==installments||prior.total_cents!==plan!.totalCents)fail('22023','Checkout conflict');
   return prior;
  }
  if((await purchaseState(tx,actor,companyId)).aiAllowed)fail('22023','Company already activated');
  // Shared per-clinic cursor serializes concurrent new checkouts, including two
  // requests with different IDs. Dates alone do not disambiguate equal timestamps.
  await tx.get('company_checkout_state',companyId);
  const pending=await tx.list('company_test_checkouts',[{field:'company_id',value:companyId}]);
  const now=new Date(),created=now.toISOString();
  for(const checkout of pending)if(checkout.status==='pending')tx.put('company_test_checkouts',checkout.id,{...checkout,status:'cancelled',resolved_at:created});
  const checkout={id,company_id:companyId,actor_id:actorId,plan_id:plan!.id,mode:'test',status:'pending',installment_cents:Math.floor(plan!.totalCents/installments),installments,total_cents:plan!.totalCents,created_at:created,expires_at:new Date(now.getTime()+30*60*1000).toISOString(),resolved_at:null};
  tx.put('company_test_checkouts',id,checkout);
  tx.put('company_checkout_state',companyId,{company_id:companyId,latest_checkout_id:id});
  audit(tx,actor,company,'checkout.test.started',{checkoutId:id,planId:plan!.id,totalCents:plan!.totalCents,installments});
  return checkout;
 }
 if(name==='complete_test_checkout_server'){
  server(actor);testMode();
  const companyId=uuid(args.p_company_id),id=uuid(args.p_id),customer:FirestoreActor={role:'authenticated',id:uuid(args.p_actor)};
  const {company}=await companyAccess(tx,customer,companyId,'billing.manage');
  const checkout=await tx.get('company_test_checkouts',id);
  if(!checkout||checkout.company_id!==companyId||checkout.actor_id!==customer.id||checkout.mode!=='test')fail('22023','Checkout unavailable');
  if(!['approved','declined','cancelled'].includes(args.p_outcome)||typeof args.p_accepted!=='boolean'||(args.p_outcome==='approved'&&args.p_accepted!==true))fail('22023','Confirm checkout terms');
  const status=args.p_outcome==='approved'?'test_approved':args.p_outcome;
  // A retry returns the original result, never extends the seven-day grant.
  if(checkout!.status===status)return checkout;
  if(checkout!.status!=='pending'||!(Date.parse(checkout!.expires_at)>Date.now()))fail('22023','Checkout expired or resolved');
  if(!confirmed(await tx.get('company_onboarding',companyId)))fail('22023','Confirm onboarding first');
  const now=new Date(),resolved={...checkout,status,resolved_at:now.toISOString()};
  tx.put('company_test_checkouts',id,resolved);
  if(status==='test_approved')tx.put('company_test_access',companyId,{company_id:companyId,checkout_id:id,valid_until:new Date(now.getTime()+7*24*60*60*1000).toISOString()});
  // No paid subscription or external payment is created. Strategy preparation
  // remains unavailable until its own versioned Firestore workflow is migrated.
  audit(tx,customer,company,'checkout.test.'+args.p_outcome,{checkoutId:id,planId:checkout!.plan_id,totalCents:checkout!.total_cents,installments:checkout!.installments});
  return resolved;
 }
 return fail('FIRESTORE_OPERATION_PENDING','Checkout operation unavailable');
}