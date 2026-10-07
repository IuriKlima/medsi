import {randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it} from 'vitest';
import {AsaasBillingService,AsaasSandboxAdapter} from '../apps/api/src/billing/asaas';
import {MemoryStore} from './helpers/firestore-memory';

describe('Sandbox customer provisioning with synthetic identities',()=>{
 let store:MemoryStore,owner:string,company:string,posts:number,created:boolean,timeout:boolean;
 const input={name:'Clinica Ficticia Sandbox',cpfCnpj:'11222333000181',email:'billing@example.test'};
 beforeEach(async()=>{store=new MemoryStore();owner=randomUUID();company=randomUUID();posts=0;created=false;timeout=false;await store.run(async tx=>{tx.put('companies',company,{id:company,workspace_id:'w',archived_at:null});tx.put('workspace_members','w_'+owner,{role:'owner'});tx.put('company_onboarding',company,{profile_version:1,revision:1,confirmed_revision:1});});});
 const actor=()=>({role:'authenticated' as const,id:owner});
 const service=()=>new AsaasBillingService(store,new AsaasSandboxAdapter('fixture-key',async(url,options)=>{expect(String(url)).toContain('api-sandbox.asaas.com/v3/customers');const customer={id:'cus_fixture',externalReference:company,cpfCnpj:input.cpfCnpj};if(options?.method==='POST'){posts++;created=true;expect(JSON.parse(String(options.body))).toMatchObject({...input,externalReference:company,notificationDisabled:true});if(timeout)throw new Error('timeout');return Response.json(customer);}return Response.json({data:created?[customer]:[],hasMore:false});}));
 it('creates and binds the provider customer once without persisting personal billing fields',async()=>{const first=await service().provisionCustomer(actor(),company,input);expect(first).toMatchObject({company_id:company,customer_id:'cus_fixture',environment:'sandbox'});expect(await service().provisionCustomer(actor(),company,input)).toEqual(first);expect(posts).toBe(1);expect(JSON.stringify(await store.run(tx=>tx.list('company_billing_customers')))).not.toContain(input.cpfCnpj);});
 it('recovers a timed out customer creation by externalReference without another POST',async()=>{timeout=true;await expect(service().provisionCustomer(actor(),company,input)).rejects.toThrow();await service().provisionCustomer(actor(),company,input);expect(posts).toBe(1);});
 it('denies a different tenant before any provider mutation',async()=>{await expect(service().provisionCustomer({role:'authenticated',id:randomUUID()},company,input)).rejects.toThrow('Access denied');expect(posts).toBe(0);});
});
