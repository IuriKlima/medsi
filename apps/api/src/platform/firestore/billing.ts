import {scheduleBillingReconciliation} from './billing-queue';
import {timingSafeEqual} from 'node:crypto';
import {commercePlans} from '@askadia/contracts';
import type {DocumentTransaction,Row} from './store';
import {audit,companyAccess,fail,hash,server,text,user,uuid,type FirestoreActor} from './access';

export const billingOperations=['begin_asaas_checkout','attach_asaas_subscription_server','reserve_asaas_reconciliation_server','apply_asaas_snapshot_server','request_asaas_cancellation','confirm_asaas_cancellation_server'];
export function verifyAsaasWebhookToken(received:unknown,configured:unknown){
 if(typeof received!=='string'||typeof configured!=='string'||!configured||!received||received.length>1024||configured.length>1024)fail('42501','Invalid webhook authentication');
 const a=Buffer.from(received as string),b=Buffer.from(configured as string);
 if(a.length!==b.length||!timingSafeEqual(a,b))fail('42501','Invalid webhook authentication');
}
const providerId=(value:unknown)=>{const id=text(value,1,150);if(!/^[a-zA-Z0-9_-]+$/.test(id))fail('22023','Invalid provider identifier');return id;};
const environment=(value:unknown)=>{if(!['sandbox','production'].includes(String(value)))fail('22023','Invalid billing environment');return String(value);};
function dateOnly(value:unknown){const v=text(value,10,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail('22023','Invalid payment date');return new Date(v+'T00:00:00Z');}
function periodEnd(due:unknown,plan:string){const start=dateOnly(due),end=new Date(start);end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+(plan==='askadia_semiannual'?6:1));const last=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();end.setUTCDate(Math.min(start.getUTCDate(),last));return end.toISOString();}
function validateSubscription(snapshot:Row,checkout:Row){
 if(snapshot.customer!==checkout.customer_id||snapshot.externalReference!==checkout.id||Math.round(Number(snapshot.value)*100)!==checkout.total_cents||snapshot.cycle!==(checkout.plan_id==='askadia_semiannual'?'SEMIANNUALLY':'MONTHLY')||!['ACTIVE','INACTIVE','EXPIRED'].includes(snapshot.status))fail('22023','Provider subscription mismatch');
}
/** All network effects run outside this transaction. A reconciliation generation
 * is reserved before querying Asaas; a slower snapshot cannot overwrite a newer one. */
export async function billingRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<Row>{
 if(name==='begin_asaas_checkout'){
  const companyId=uuid(args.p_company_id),id=uuid(args.p_id),actorId=user(actor),{company}=await companyAccess(tx,actor,companyId,'billing.manage');
  const onboarding=await tx.get('company_onboarding',companyId);if(!onboarding?.profile_version||onboarding.confirmed_revision!==onboarding.revision)fail('22023','Confirm onboarding first');
  const plan=commercePlans.find(p=>p.id===args.p_plan);if(!plan)fail('22023','Invalid checkout plan');
  const customer=await tx.get('company_billing_customers',companyId);if(customer?.company_id!==companyId||customer?.provider!=='asaas')fail('BILLING_CUSTOMER_PENDING','Provider customer provisioning required');
  const customerId=providerId(customer!.customer_id),env=environment(customer!.environment),prior=await tx.get('company_billing_checkouts',id);
  if(prior){if(prior.company_id!==companyId||prior.actor_id!==actorId||prior.plan_id!==plan!.id||prior.customer_id!==customerId||prior.environment!==env)fail('22023','Checkout conflict');return prior;}
  const sub=await tx.get('company_subscriptions',companyId);if(sub?.status==='expired'&&sub.provider_status==='ACTIVE')fail('22023','Cancel current recurrence first');if(sub?.provider_subscription_id&&!['cancelled','expired'].includes(sub.status))fail('22023','Subscription already exists');
  const cursor=await tx.get('company_billing_checkout_state',companyId);if(cursor?.checkout_id){const pending=await tx.get('company_billing_checkouts',cursor.checkout_id);if(pending&&!['failed','cancelled','expired'].includes(pending.status))fail('22023','Checkout already in progress');}
  const checkout={id,company_id:companyId,actor_id:actorId,provider:'asaas',environment:env,customer_id:customerId,plan_id:plan!.id,total_cents:plan!.totalCents,status:'prepared',created_at:new Date().toISOString(),provider_subscription_id:null};
  tx.put('company_billing_checkouts',id,checkout);tx.put('company_billing_checkout_state',companyId,{company_id:companyId,checkout_id:id});audit(tx,actor,company,'billing.checkout.prepared',{checkoutId:id,planId:plan!.id});return checkout;
 }
 if(name==='request_asaas_cancellation'){
  const companyId=uuid(args.p_company_id),{company}=await companyAccess(tx,actor,companyId,'billing.manage'),sub=await tx.get('company_subscriptions',companyId);
  if(!sub||sub.provider!=='asaas'||!sub.provider_subscription_id)fail('22023','Subscription unavailable');
  if(sub!.cancellation_requested)return sub!;const result={...sub,cancellation_requested:true,cancellation_requested_at:new Date().toISOString()};tx.put('company_subscriptions',companyId,result);audit(tx,actor,company,'billing.cancellation.requested',{});return result;
 }
 server(actor);
 if(name==='attach_asaas_subscription_server'){
  const companyId=uuid(args.p_company_id),id=uuid(args.p_id),checkout=await tx.get('company_billing_checkouts',id),snapshot=args.p_subscription as Row;
  if(!checkout||checkout.company_id!==companyId||checkout.environment!==environment(args.p_environment)||!snapshot)fail('22023','Checkout unavailable');
  validateSubscription(snapshot,checkout!);const subscriptionId=providerId(snapshot.id),binding=await tx.get('billing_subscription_bindings',subscriptionId);
  if(binding&&(binding.company_id!==companyId||binding.checkout_id!==id))fail('22023','Subscription binding conflict');
  if(checkout!.provider_subscription_id&&checkout!.provider_subscription_id!==subscriptionId)fail('22023','Checkout conflict');
  if(binding)return checkout!;
  const previousSubscription=await tx.get('company_subscriptions',companyId);
  if(previousSubscription?.provider_subscription_id&&previousSubscription.provider_subscription_id!==subscriptionId){
   if(!['cancelled','expired'].includes(previousSubscription.status))fail('22023','Subscription already exists');
   const previousBinding=await tx.get('billing_subscription_bindings',previousSubscription.provider_subscription_id);if(previousBinding)tx.put('billing_subscription_bindings',previousSubscription.provider_subscription_id,{...previousBinding,terminal_superseded:true,generation:Number(previousBinding.generation)+1});
   const previousJob=await tx.get('billing_reconciliation_jobs',previousSubscription.provider_subscription_id);if(previousJob)tx.put('billing_reconciliation_jobs',previousSubscription.provider_subscription_id,{...previousJob,status:'cancelled',lease_token:null,lease_until:null});
  }
  const result={...checkout,status:'pending',provider_subscription_id:subscriptionId};
  tx.put('company_billing_checkouts',id,result);tx.put('billing_subscription_bindings',subscriptionId,{company_id:companyId,checkout_id:id,environment:checkout!.environment,generation:0,applied_generation:0});
  tx.put('company_subscriptions',companyId,{company_id:companyId,plan_id:checkout!.plan_id,provider:'asaas',provider_subscription_id:subscriptionId,provider_customer_id:checkout!.customer_id,environment:checkout!.environment,status:'pending',provider_confirmed:false,current_period_end:null,cancellation_requested:false});await scheduleBillingReconciliation(tx,subscriptionId,companyId,checkout!.environment);return result;
 }
 const subscriptionId=providerId(args.p_subscription_id),binding=await tx.get('billing_subscription_bindings',subscriptionId);if(!binding)fail('22023','Unknown provider subscription');
 if(name==='confirm_asaas_cancellation_server'){
  if(environment(args.p_environment)!==binding!.environment||args.p_response?.id!==subscriptionId||args.p_response?.deleted!==true)fail('22023','Provider cancellation mismatch');
  const sub=await tx.get('company_subscriptions',binding!.company_id),checkout=await tx.get('company_billing_checkouts',binding!.checkout_id);if(!sub||!checkout)fail('22023','Subscription unavailable');
  const generation=Number(binding!.generation)+1,result={...sub,status:'cancelled',provider_confirmed:true,provider_checked_at:new Date().toISOString(),cancelled_at:new Date().toISOString()};
  tx.put('company_subscriptions',binding!.company_id,result);tx.put('company_billing_checkouts',binding!.checkout_id,{...checkout,status:'cancelled'});tx.put('billing_subscription_bindings',subscriptionId,{...binding,generation,applied_generation:generation,terminal_deleted:true});
  const pendingEvents=await tx.list('billing_provider_events',[{field:'subscription_id',value:subscriptionId},{field:'status',value:'pending'}]);for(const event of pendingEvents)if(event.status==='pending')tx.put('billing_provider_events',hash({environment:binding!.environment,id:event.id}),{...event,status:'applied',applied_at:new Date().toISOString()});
  const scheduled=await tx.get('billing_reconciliation_jobs',subscriptionId);if(scheduled)tx.put('billing_reconciliation_jobs',subscriptionId,{...scheduled,status:'cancelled',lease_token:null,lease_until:null});
  return result;
 }
 if(name==='reserve_asaas_reconciliation_server'){
  const eventId=args.p_event_id?providerId(args.p_event_id):null,eventKey=eventId?hash({environment:binding!.environment,id:eventId}):null;
  const prior=eventKey?await tx.get('billing_provider_events',eventKey):null;
  if(prior){if(prior.subscription_id!==subscriptionId||prior.payload_hash!==args.p_payload_hash)fail('22023','Provider event conflict');if(prior.status==='applied')return {duplicate:true,generation:prior.generation};}
  const generation=Number(binding!.generation)+1;tx.put('billing_subscription_bindings',subscriptionId,{...binding,generation});
  if(eventKey)tx.put('billing_provider_events',eventKey,{id:eventId,subscription_id:subscriptionId,company_id:binding!.company_id,payload_hash:text(args.p_payload_hash,1,128),generation,status:(binding!.terminal_deleted||binding!.terminal_superseded)?'applied':'pending',received_at:prior?.received_at??new Date().toISOString()});
  if(eventId&&!binding!.terminal_deleted&&!binding!.terminal_superseded)await scheduleBillingReconciliation(tx,subscriptionId,binding!.company_id,binding!.environment);
  return {generation,companyId:binding!.company_id,eventKey,...((binding!.terminal_deleted||binding!.terminal_superseded)?{duplicate:true}:{})};
 }
 if(name==='apply_asaas_snapshot_server'){
  const generation=args.p_generation;if(!Number.isSafeInteger(generation)||generation<=0||generation>binding!.generation)fail('22023','Invalid reconciliation generation');
  if(generation<binding!.generation)return {stale:true};
  if(generation===binding!.applied_generation)return {duplicate:true};
  const currentSubscription=await tx.get('company_subscriptions',binding!.company_id);if(binding!.terminal_superseded||currentSubscription?.provider_subscription_id!==subscriptionId)return {stale:true};
  const checkout=await tx.get('company_billing_checkouts',binding!.checkout_id),snapshot=args.p_subscription as Row;
  if(!checkout||checkout.environment!==environment(args.p_environment)||!snapshot||snapshot.id!==subscriptionId)fail('22023','Provider subscription mismatch');validateSubscription(snapshot,checkout!);
  if(!Array.isArray(args.p_payments)||args.p_payments.length>1000)fail('22023','Invalid provider payments');
  const payments=args.p_payments as Row[],seen=new Set<string>();let paidUntil:string|null=null;let invoiceUrl:string|null=null;
  for(const payment of payments){const id=providerId(payment.id);if(seen.has(id)||payment.subscription!==subscriptionId||payment.customer!==checkout!.customer_id||Math.round(Number(payment.value)*100)!==checkout!.total_cents)fail('22023','Provider payment mismatch');seen.add(id);dateOnly(payment.dueDate);
   if(typeof payment.status!=='string'||!['PENDING','RECEIVED','CONFIRMED','OVERDUE','REFUNDED','REFUND_REQUESTED','REFUND_IN_PROGRESS','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL','DUNNING_REQUESTED','DUNNING_RECEIVED','AWAITING_RISK_ANALYSIS','DELETED'].includes(payment.status))fail('22023','Unknown provider payment status');
   if(['CONFIRMED','RECEIVED'].includes(payment.status)){const until=periodEnd(payment.dueDate,checkout!.plan_id);if(!paidUntil||until>paidUntil)paidUntil=until;}
   if(payment.invoiceUrl){let url:URL;try{url=new URL(payment.invoiceUrl);}catch{fail('22023','Invalid provider invoice URL');}if(url!.protocol!=='https:'||!['asaas.com','sandbox.asaas.com','www.asaas.com'].includes(url!.hostname))fail('22023','Invalid provider invoice URL');invoiceUrl=url!.toString();}
   tx.put('billing_payment_snapshots',hash({environment:binding!.environment,id}),{id,company_id:binding!.company_id,subscription_id:subscriptionId,status:payment.status,due_date:payment.dueDate,value_cents:Math.round(payment.value*100),observed_at:new Date().toISOString()});
  }
  const sub=await tx.get('company_subscriptions',binding!.company_id),status=binding!.terminal_deleted||snapshot.deleted===true||snapshot.status==='INACTIVE'?'cancelled':snapshot.status==='EXPIRED'?'expired':paidUntil?(Date.parse(paidUntil)>Date.now()?'active':'expired'):'pending';
  const result={...sub,status,provider_status:snapshot.status,current_period_end:paidUntil,provider_confirmed:true,provider_checked_at:new Date().toISOString(),last_reconciliation_generation:generation,invoice_url:invoiceUrl};
  tx.put('company_subscriptions',binding!.company_id,result);tx.put('company_billing_checkouts',checkout!.id,{...checkout,status:status==='active'?'paid':status,invoice_url:invoiceUrl});tx.put('billing_subscription_bindings',subscriptionId,{...binding,applied_generation:generation});
  const events=await tx.list('billing_provider_events',[{field:'subscription_id',value:subscriptionId},{field:'status',value:'pending'}]);for(const event of events)if(event.generation<=generation&&event.status==='pending')tx.put('billing_provider_events',hash({environment:binding!.environment,id:event.id}),{...event,status:'applied',applied_at:new Date().toISOString()});
  return result;
 }
 return fail('FIRESTORE_OPERATION_PENDING','Billing operation unavailable');
}

export function subscriptionEntitlement(subscription:Row|null):{live:boolean;sandbox:boolean}{
 const valid=Boolean(subscription?.status==='active'&&Date.parse(subscription.current_period_end)>Date.now());
 if(!valid)return {live:false,sandbox:false};
 if(subscription!.provider!=='asaas')return {live:true,sandbox:false};
 const confirmed=subscription!.provider_confirmed===true;
 return {live:confirmed&&subscription!.environment==='production',sandbox:confirmed&&subscription!.environment==='sandbox'&&process.env.CHECKOUT_MODE==='asaas_sandbox'&&process.env.NODE_ENV!=='production'};
}
