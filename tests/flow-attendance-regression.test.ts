import {randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryStore} from './helpers/firestore-memory';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {CustomerHistoryController} from '../apps/api/src/inbox/customer-controller';
import {InboxController} from '../apps/api/src/inbox/controller';
import type {AuthRequest} from '../apps/api/src/identity/auth';

async function fixture(role='owner'){
 const store=new MemoryStore(),company=randomUUID(),workspace=randomUUID(),user=randomUUID(),contact=randomUUID();
 await store.run(async tx=>{
  tx.put('companies',company,{id:company,workspace_id:workspace});
  if(role==='owner')tx.put('workspace_members',workspace+'_'+user,{workspace_id:workspace,user_id:user,role});
  else{tx.put('company_members',company+'_'+user,{company_id:company,user_id:user,role});const grant=randomUUID();tx.put('company_permission_grants',grant,{id:grant,company_id:company,user_id:user,action:'crm.read',expires_at:null});}
  tx.put('contacts',contact,{id:contact,company_id:company,name:'Contato fictício',phone_e164:'+5511999999999',email:null,created_at:new Date().toISOString()});
 });
 const client=firestoreClient('authenticated',user,store),request={headers:{},actor:{id:user,email:'fixture@example.invalid',client}} as unknown as AuthRequest;
 return {store,company,contact,client,request};
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('attendance UI bootstrap and CRM history through native Firestore',()=>{
 it('keeps human settings accessible without an attendance model or AI credentials',async()=>{
  vi.stubEnv('OPENAI_MODEL_ATTENDANCE','');vi.stubEnv('OPENAI_API_KEY','');
  const f=await fixture(),controller=new InboxController(),bootstrap=await controller.bootstrap(f.request,f.company);
  expect(bootstrap.model).toBeNull();expect(bootstrap.aiReady).toBe(false);expect(bootstrap.automaticReady).toBe(false);expect(bootstrap.canConfigure).toBe(true);
  const saved=await controller.settings(f.request,f.company,{channel:'whatsapp',revision:0,mode:'human',prompt:'',rules:[],fallback:''});expect(saved.mode).toBe('human');
 });
 it('shows stored official WhatsApp messages in the CRM contact history without a provider request',async()=>{
  const f=await fixture(),thread='5511999999999@s.whatsapp.net',now=new Date().toISOString();
  const network=vi.fn().mockRejectedValue(new Error('Unexpected provider request'));vi.stubGlobal('fetch',network);
  await f.store.run(async tx=>{
   const channel=randomUUID();tx.put('company_channels',channel,{id:channel,company_id:f.company,provider:'whatsapp_cloud',status:'connected',remote_id:'123456789',metadata:{webhookReady:true}});
   const link=randomUUID();tx.put('company_contact_channels',link,{id:link,company_id:f.company,contact_id:f.contact,channel:'whatsapp',remote_id:thread});
   const message=randomUUID();tx.put('whatsapp_cloud_messages',message,{id:message,company_id:f.company,thread,provider_id:'wamid.fixture',body:'Mensagem administrativa fictícia',from_me:false,time:now,kind:'text',status:'received',expires_at:new Date(Date.now()+86400000).toISOString()});
  });
  const native=await f.client.rpc('read_whatsapp_cloud_inbox',{p_company_id:f.company,p_thread:thread});expect(native.error).toBeNull();expect(native.data).toHaveLength(1);
  const history=await new CustomerHistoryController().history(f.request,f.company,f.contact);
  expect(history.messages).toEqual(native.data);expect(history.warning).toBe('');expect(history.metrics.lastInbound?.id).toBe('wamid.fixture');
  const outsider={...f.request,actor:{...f.request.actor,id:randomUUID(),client:firestoreClient('authenticated',randomUUID(),f.store)}};
  await expect(new CustomerHistoryController().history(outsider,f.company,f.contact)).rejects.toMatchObject({status:403});
  expect(network).not.toHaveBeenCalled();
 });
 it('does not enable configuration for marketing with CRM read but no CRM write',async()=>{
  vi.stubEnv('OPENAI_MODEL_ATTENDANCE','fixture-attendance');
  const f=await fixture('marketing'),controller=new InboxController();
  const bootstrap=await controller.bootstrap(f.request,f.company);
  expect(bootstrap.canWrite).toBe(false);
  await expect(controller.settings(f.request,f.company,{channel:'whatsapp',revision:0,mode:'human',prompt:'',rules:[],fallback:''})).rejects.toMatchObject({status:403});
  expect(bootstrap.canConfigure).toBe(false);
 });
});
