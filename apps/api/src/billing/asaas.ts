import {z} from 'zod';
import type {DocumentStore,Row} from '../platform/firestore/store';
import {audit,companyAccess,fail,hash,type FirestoreActor} from '../platform/firestore/access';
import {billingRpc,verifyAsaasWebhookToken} from '../platform/firestore/billing';

const providerId=z.string().min(1).max(150).regex(/^[a-zA-Z0-9_-]+$/);
const webhookSchema=z.object({id:providerId,event:z.string().min(1).max(100),payment:z.object({subscription:providerId.optional()}).passthrough().optional(),subscription:z.object({id:providerId}).passthrough().optional()}).passthrough();
const billingCustomerSchema=z.object({name:z.string().trim().min(2).max(200),cpfCnpj:z.string().regex(/^(?:\d{11}|\d{14})$/),email:z.email().max(254).optional(),mobilePhone:z.string().regex(/^\d{10,13}$/).optional()}).strict();
const serviceActor:FirestoreActor={role:'service_role',id:null};
/** Deliberately sandbox-only. A production money adapter requires independent
 * approval and provider homologation; changing an env flag cannot enable it. */
export class AsaasSandboxAdapter {
 readonly environment='sandbox';
 constructor(private key:string,private transport:typeof fetch=fetch){if(!key)fail('BILLING_UNCONFIGURED','Asaas sandbox key required');}
 private async request(path:string,method='GET',body?:Row):Promise<Row>{
  let response:Response;
  try{response=await this.transport('https://api-sandbox.asaas.com/v3'+path,{method,headers:{access_token:this.key,'Content-Type':'application/json','User-Agent':'MedSI-sandbox-billing'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'error'});}catch{fail('BILLING_PROVIDER_UNAVAILABLE','Asaas request unavailable; reconcile before retrying creation');}
  if(!response!.ok)fail('BILLING_PROVIDER_UNAVAILABLE','Asaas request failed ('+response!.status+')');
  const raw=await response!.text();if(Buffer.byteLength(raw)>1500000)fail('BILLING_PROVIDER_UNAVAILABLE','Asaas response limit');
  let value:unknown;try{value=JSON.parse(raw);}catch{fail('BILLING_PROVIDER_UNAVAILABLE','Invalid Asaas response');}if(!value||typeof value!=='object'||Array.isArray(value))fail('BILLING_PROVIDER_UNAVAILABLE','Invalid Asaas response');return value as Row;
 }
 private id(value:string){return providerId.parse(value);}
 async findCustomer(company:string){return this.list('/customers?externalReference='+encodeURIComponent(z.uuid().parse(company)));}
 async createCustomer(company:string,input:Row){return this.request('/customers','POST',{...input,externalReference:z.uuid().parse(company),notificationDisabled:true});}
 async subscription(id:string){return this.request('/subscriptions/'+this.id(id));}
 async payments(id:string){return this.list('/subscriptions/'+this.id(id)+'/payments');}
 async findCheckout(id:string,customer:string){return this.list('/subscriptions?externalReference='+encodeURIComponent(id)+'&customer='+encodeURIComponent(this.id(customer))+'&includeDeleted=true');}
 async create(checkout:Row){return this.request('/subscriptions','POST',{customer:this.id(checkout.customer_id),billingType:'UNDEFINED',value:checkout.total_cents/100,nextDueDate:new Date().toISOString().slice(0,10),cycle:checkout.plan_id==='askadia_semiannual'?'SEMIANNUALLY':'MONTHLY',externalReference:checkout.id,description:'MedSI '+checkout.plan_id});}
 async cancel(id:string){return this.request('/subscriptions/'+this.id(id),'DELETE');}
 private async list(path:string):Promise<Row[]>{
  const rows:Row[]=[];
  for(let offset=0;offset<1000;offset+=100){const response=await this.request(path+(path.includes('?')?'&':'?')+'limit=100&offset='+offset);if(!Array.isArray(response.data)||response.data.length>100||typeof response.hasMore!=='boolean')fail('BILLING_PROVIDER_UNAVAILABLE','Invalid Asaas pagination');rows.push(...response.data);if(!response.hasMore)return rows;if(!response.data.length)fail('BILLING_PROVIDER_UNAVAILABLE','Invalid Asaas pagination');}
  return fail('BILLING_PROVIDER_UNAVAILABLE','Asaas pagination limit');
 }
}
export class AsaasBillingService {
 constructor(private store:DocumentStore,private adapter:AsaasSandboxAdapter){}
 private rpc(actor:FirestoreActor,name:string,args:Row){return this.store.run(tx=>billingRpc(tx,actor,name,args));}
 async provisionCustomer(actor:FirestoreActor,company:string,input:unknown):Promise<Row>{
  const parsed=billingCustomerSchema.safeParse(input);if(!parsed.success)fail('22023','Invalid billing customer');const data=parsed.data!,fingerprint=hash(data);
  const claim=await this.store.run(async tx=>{await companyAccess(tx,actor,company,'billing.manage');const onboarding=await tx.get('company_onboarding',company);if(!onboarding?.profile_version||onboarding.confirmed_revision!==onboarding.revision)fail('22023','Confirm onboarding first');const existing=await tx.get('company_billing_customers',company);if(existing)return {existing,claimed:false};const previous=await tx.get('company_billing_customer_requests',company);if(previous&&previous.input_hash!==fingerprint)fail('22023','Billing customer request conflict');if(previous)return {existing:null,claimed:false};tx.put('company_billing_customer_requests',company,{company_id:company,environment:this.adapter.environment,input_hash:fingerprint,status:'submitting',created_at:new Date().toISOString()});return {existing:null,claimed:true};});
  if(claim.existing){if(claim.existing.environment!==this.adapter.environment)fail('BILLING_UNCONFIGURED','Billing environment mismatch');return claim.existing;}
  try{
   const found=await this.adapter.findCustomer(company);if(found.length>1)fail('BILLING_RECONCILIATION_REQUIRED','Multiple provider customers require reconciliation');
   let customer:Row;if(found.length===1)customer=found[0]!;else if(claim.claimed)customer=await this.adapter.createCustomer(company,data);else return fail('BILLING_RECONCILIATION_REQUIRED','Customer result uncertain; provider reconciliation required');
   if(customer.externalReference!==company||String(customer.cpfCnpj).replace(/\D/g,'')!==data.cpfCnpj)fail('22023','Provider customer mismatch');const customerId=providerId.parse(customer.id);
   return this.store.run(async tx=>{const {company:clinic}=await companyAccess(tx,actor,company,'billing.manage');const existing=await tx.get('company_billing_customers',company);if(existing){if(existing.customer_id!==customerId)fail('22023','Customer binding conflict');return existing;}const result={company_id:company,provider:'asaas',environment:this.adapter.environment,customer_id:customerId,created_at:new Date().toISOString()};tx.put('company_billing_customers',company,result);const previous=await tx.get('company_billing_customer_requests',company);tx.put('company_billing_customer_requests',company,{...previous,status:'bound'});audit(tx,actor,clinic,'billing.customer.bound',{provider:'asaas',environment:this.adapter.environment});return result;});
  }catch(error){await this.store.run(async tx=>{const previous=await tx.get('company_billing_customer_requests',company),bound=await tx.get('company_billing_customers',company);if(previous&&!bound)tx.put('company_billing_customer_requests',company,{...previous,status:'uncertain'});});throw error;}
 }
 async checkout(actor:FirestoreActor,company:string,id:string,plan:string):Promise<Row>{
  const checkout=await this.rpc(actor,'begin_asaas_checkout',{p_company_id:company,p_id:id,p_plan:plan});
  if(checkout.environment!==this.adapter.environment)fail('BILLING_UNCONFIGURED','Billing environment mismatch');
  if(checkout.provider_subscription_id){await this.reconcile(checkout.provider_subscription_id);return this.read(actor,company);}
  // Atomic transition claims the only POST. After uncertainty, every retry is
  // lookup-only; absence is not proof that the provider did not accept a request.
  const claimed=await this.store.run(async tx=>{await companyAccess(tx,actor,company,'billing.manage');const current=await tx.get('company_billing_checkouts',id);if(current?.status!=='prepared')return false;tx.put('company_billing_checkouts',id,{...current,status:'submitting',submitted_at:new Date().toISOString()});return true;});
  let snapshot:Row;
  try{
   if(claimed)snapshot=await this.adapter.create(checkout);
   else{const matches=await this.adapter.findCheckout(id,checkout.customer_id);if(matches.length!==1)fail('BILLING_RECONCILIATION_REQUIRED','Checkout result uncertain; provider reconciliation required');snapshot=matches[0]!;}
   await this.rpc(serviceActor,'attach_asaas_subscription_server',{p_company_id:company,p_id:id,p_subscription:snapshot,p_environment:this.adapter.environment});
  }catch(error){await this.store.run(async tx=>{const current=await tx.get('company_billing_checkouts',id);if(current&&!current.provider_subscription_id)tx.put('company_billing_checkouts',id,{...current,status:'uncertain',last_error_code:'BILLING_RECONCILIATION_REQUIRED'});});throw error;}
  await this.reconcile(snapshot.id);return this.read(actor,company);
 }
 async read(actor:FirestoreActor,company:string){return this.store.run(async tx=>{await companyAccess(tx,actor,company,'billing.manage');const cursor=await tx.get('company_billing_checkout_state',company);return {companyId:company,subscription:await tx.get('company_subscriptions',company),checkout:cursor?.checkout_id?await tx.get('company_billing_checkouts',cursor.checkout_id):null,environment:this.adapter.environment,customerConfigured:Boolean(await tx.get('company_billing_customers',company))};});}
 async reconcile(subscriptionId:string,event?:{id:string;payloadHash:string}){
  const reservation=await this.rpc(serviceActor,'reserve_asaas_reconciliation_server',{p_subscription_id:subscriptionId,p_event_id:event?.id??null,p_payload_hash:event?.payloadHash??null});if(reservation.duplicate)return {duplicate:true};
  const binding=await this.store.run(tx=>tx.get('billing_subscription_bindings',subscriptionId));if(binding?.environment!==this.adapter.environment)fail('BILLING_UNCONFIGURED','Billing environment mismatch');
  const snapshot=await this.adapter.subscription(subscriptionId),payments=await this.adapter.payments(subscriptionId);
  return this.rpc(serviceActor,'apply_asaas_snapshot_server',{p_subscription_id:subscriptionId,p_generation:reservation.generation,p_subscription:snapshot,p_payments:payments,p_environment:this.adapter.environment});
 }
 async cancel(actor:FirestoreActor,company:string){
  const sub=await this.rpc(actor,'request_asaas_cancellation',{p_company_id:company});if(sub.environment!==this.adapter.environment)fail('BILLING_UNCONFIGURED','Billing environment mismatch');
  if(sub.status==='cancelled')return sub;
  const response=await this.adapter.cancel(sub.provider_subscription_id);return this.rpc(serviceActor,'confirm_asaas_cancellation_server',{p_subscription_id:sub.provider_subscription_id,p_environment:this.adapter.environment,p_response:response});
 }
 async webhook(token:unknown,body:unknown,secret:unknown){
  verifyAsaasWebhookToken(token,secret);const parsed=webhookSchema.safeParse(body);if(!parsed.success)fail('22023','Invalid Asaas webhook');
  const event=parsed.data!,subscriptionId=event.subscription?.id??event.payment?.subscription;
  // Events unrelated to subscription billing are acknowledged without applying
  // any access change. Unrecognized subscriptions fail closed and can be retried.
  if(!subscriptionId)return {ignored:true};
  if(!event.event.startsWith('PAYMENT_')&&!event.event.startsWith('SUBSCRIPTION_'))return {ignored:true};
  if(event.event==='SUBSCRIPTION_DELETED'){
   if(!event.subscription)fail('22023','Invalid Asaas deletion event');
   const reserved=await this.rpc(serviceActor,'reserve_asaas_reconciliation_server',{p_subscription_id:subscriptionId,p_event_id:event.id,p_payload_hash:hash(event)});if(reserved.duplicate)return {duplicate:true};
   return this.rpc(serviceActor,'confirm_asaas_cancellation_server',{p_subscription_id:subscriptionId,p_environment:this.adapter.environment,p_response:{id:subscriptionId,deleted:true}});
  }
  return this.reconcile(subscriptionId,{id:event.id,payloadHash:hash(event)});
 }
}
