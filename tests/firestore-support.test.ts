import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupportDetail,SupportTicket} from '../packages/contracts/src/support';
import {firestoreClient,firestoreOperations} from '../apps/api/src/platform/firestore/client';
import type {Row} from '../apps/api/src/platform/firestore/store';
import {MemoryStore} from './helpers/firestore-memory';

const owner=randomUUID(),member=randomUUID(),other=randomUUID(),admin=randomUUID(),staff=randomUUID();
const company=randomUUID(),otherCompany=randomUUID(),workspace=randomUUID();
let store:MemoryStore;
const client=(id:string|null=owner,role:'authenticated'|'anon'|'service_role'='authenticated')=>firestoreClient(role,id,store);
const args=(id=randomUUID(),companyId:string|null=company)=>({p_id:id,p_company_id:companyId,p_subject:'  Ajuda com minha conta  ',p_message:'  Preciso de ajuda com minha conta.  ',p_page:'/workspace',p_transcript:[]});
async function create(input:Row=args(),actor=owner){const response=await client(actor).rpc('create_support_ticket',input);expect(response.error).toBeNull();return response.data as SupportDetail;}
async function detail(id:string,actor=owner){return client(actor).rpc('support_ticket_detail',{p_id:id});}
async function list(actor=owner,team=false,offset=0){return client(actor).rpc('support_ticket_list',{p_team:team,p_offset:offset});}
async function reply(ticket:string,id=randomUUID(),actor=owner,message='Resposta de teste'){return client(actor).rpc('reply_support_ticket',{p_ticket_id:ticket,p_id:id,p_message:message});}
async function status(id:string,version:number,actor=staff,value='resolved'){return client(actor).rpc('set_support_ticket_status',{p_id:id,p_status:value,p_version:version});}
async function assign(){await store.run(async tx=>{tx.put('company_assignments',company+'_'+staff,{company_id:company,staff_id:staff,assigned_by:admin});});}
beforeEach(async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'));store=new MemoryStore();
 await store.run(async tx=>{
  for(const id of [owner,member,other,admin,staff])tx.put('profiles',id,{id,display_name:'Fixture'});
  tx.put('companies',company,{id:company,name:'Clínica de teste',workspace_id:workspace});
  tx.put('companies',otherCompany,{id:otherCompany,name:'Outra clínica',workspace_id:randomUUID()});
  tx.put('workspace_members',workspace+'_'+owner,{user_id:owner,workspace_id:workspace,role:'owner'});
  tx.put('company_members',company+'_'+member,{company_id:company,user_id:member,role:'reader'});
  tx.put('platform_staff',admin,{user_id:admin,role:'platform_admin',active:true});
  tx.put('platform_staff',staff,{user_id:staff,role:'support',active:true});
 });
});
afterEach(()=>vi.useRealTimers());
describe('native Firestore support — local transactional fixtures',()=>{
 it('registers all five support RPCs in the real dispatcher',()=>{
  expect(firestoreOperations).toEqual(expect.arrayContaining(['create_support_ticket','reply_support_ticket','set_support_ticket_status','support_ticket_detail','support_ticket_list']));
 });
 it('creates the exact detail contract before payment and retries without writes',async()=>{
  const input={...args(),p_transcript:[{role:'user',text:'Minha dúvida'}]};const first=await create(input);
  expect(first).toEqual({ticket:{id:input.p_id,number:1,company_id:company,company_name:'Clínica de teste',created_by:owner,subject:'Ajuda com minha conta',status:'open',page:'/workspace',transcript:input.p_transcript,version:1,created_at:'2026-10-07T12:00:00.000Z',updated_at:'2026-10-07T12:00:00.000Z'},messages:[{id:input.p_id,ticket_id:input.p_id,author_id:owner,author_kind:'customer',body:'Preciso de ajuda com minha conta.',created_at:'2026-10-07T12:00:00.000Z'}]});
  expect(await create(input)).toEqual(first);expect((await list()).data).toEqual([first.ticket]);
  expect(await store.run(tx=>tx.list('platform_audit'))).toHaveLength(1);
  expect((await create(args(randomUUID(),null))).ticket).toMatchObject({number:2,company_id:null,company_name:null});
  expect(await store.run(tx=>tx.list('company_subscriptions'))).toEqual([]);
 });
 it('rejects altered create retry payload, company and actor with no duplicate records',async()=>{
  const input=args();await create(input);
  for(const patch of [{p_subject:'Outro assunto'},{p_message:'Uma mensagem diferente'},{p_page:'/app'},{p_transcript:[{role:'user',text:'Outra dúvida'}]},{p_company_id:null}])expect((await client().rpc('create_support_ticket',{...input,...patch})).error).toMatchObject({code:'23505'});
  expect((await client(member).rpc('create_support_ticket',input)).error).toMatchObject({code:'23505'});
  expect(await store.run(tx=>tx.list('support_tickets'))).toHaveLength(1);expect(await store.run(tx=>tx.list('support_messages'))).toHaveLength(1);
 });
 it('requires authenticated profile and clinic membership, including fresh checks on retry',async()=>{
  for(const actor of [client(null,'anon'),client(owner,'service_role'),client(randomUUID())])expect((await actor.rpc('create_support_ticket',args(randomUUID(),null))).error).toMatchObject({code:'42501'});
  expect((await client(other).rpc('create_support_ticket',args())).error).toMatchObject({code:'42501'});
  const input=args();await create(input,member);
  await store.run(async tx=>{tx.remove('company_members',company+'_'+member);tx.put('company_permission_grants','stale',{company_id:company,user_id:member,action:'company.read'});});
  expect((await detail(input.p_id,member)).error).toMatchObject({code:'42501'});
  expect((await client(member).rpc('create_support_ticket',input)).error).toMatchObject({code:'42501'});
  expect((await reply(input.p_id,randomUUID(),member)).error).toMatchObject({code:'42501'});
  expect((await list(member)).data).toEqual([]);
 });
 it('limits requester visibility to their tickets and active staff to assigned clinics',async()=>{
  const own=await create();const account=await create(args(randomUUID(),null),other);
  expect((await detail(own.ticket.id,member)).error).toMatchObject({code:'42501'});
  expect((await list(member,true)).error).toMatchObject({code:'42501'});
  expect((await list(staff,true)).data).toEqual([]);expect((await detail(own.ticket.id,staff)).error).toMatchObject({code:'42501'});
  await assign();expect((await list(staff,true)).data).toEqual([own.ticket]);
  expect((await detail(account.ticket.id,staff)).error).toMatchObject({code:'42501'});
  expect((await list(admin,true)).data).toHaveLength(2);expect((await detail(account.ticket.id,admin)).error).toBeNull();
  expect((await list(staff)).data).toEqual([]);
  await store.run(async tx=>{tx.put('platform_staff',staff,{user_id:staff,role:'support',active:false});});
  expect((await list(staff,true)).error).toMatchObject({code:'42501'});expect((await detail(own.ticket.id,staff)).error).toMatchObject({code:'42501'});
 });
 it('records staff replies, reopens customer replies, CAS status and rejects stale status updates',async()=>{
  const own=await create();await assign();
  expect((await status(own.ticket.id,1,owner)).error).toMatchObject({code:'42501'});
  const staffReply=await reply(own.ticket.id,randomUUID(),staff);expect(staffReply.error).toBeNull();
  expect(staffReply.data.ticket).toMatchObject({status:'waiting_customer',version:2});expect(staffReply.data.messages.find((m:Row)=>m.author_id===staff)).toMatchObject({author_kind:'staff',body:'Resposta de teste'});
  expect((await status(own.ticket.id,2)).data.ticket).toMatchObject({status:'resolved',version:3});
  expect((await status(own.ticket.id,2)).error).toMatchObject({code:'40001'});
  expect((await status(own.ticket.id,3,staff,'bogus')).error).toMatchObject({code:'22023'});
  expect((await reply(own.ticket.id)).data.ticket).toMatchObject({status:'open',version:4});
  expect((await store.run(tx=>tx.list('platform_audit'))).map(r=>r.action)).toEqual(['support.ticket_created','support.ticket_replied','support.ticket_status','support.ticket_replied']);
 });
 it('binds reply retries to actor, payload and ticket and denies revoked staff retries',async()=>{
  const own=await create(),second=await create();await assign();const id=randomUUID();
  const first=await reply(own.ticket.id,id,staff);expect(first.error).toBeNull();expect(await reply(own.ticket.id,id,staff)).toEqual(first);
  expect((await reply(own.ticket.id,id,staff,'Modificada')).error).toMatchObject({code:'23505'});
  expect((await reply(own.ticket.id,id,admin)).error).toMatchObject({code:'23505'});
  expect((await reply(second.ticket.id,id,staff)).error).toMatchObject({code:'23505'});
  await store.run(async tx=>{tx.remove('company_assignments',company+'_'+staff);});
  expect((await reply(own.ticket.id,id,staff)).error).toMatchObject({code:'42501'});expect((await status(own.ticket.id,2)).error).toMatchObject({code:'42501'});
  expect((await detail(own.ticket.id)).data.ticket.version).toBe(2);
 });
 it('treats a staff requester as customer while retaining admin status permissions',async()=>{
  const own=await create(args(randomUUID(),null),admin);const answer=await reply(own.ticket.id,randomUUID(),admin);
  expect(answer.data.ticket.status).toBe('open');expect(answer.data.messages.every((m:Row)=>m.author_kind==='customer')).toBe(true);
  expect((await status(own.ticket.id,2,admin)).error).toBeNull();
 });
 it('enforces ten creations per actor/hour while permitting replay and the exact hour boundary',async()=>{
  const first=args(randomUUID(),null);await create(first,other);
  for(let i=1;i<10;i++)await create(args(randomUUID(),null),other);
  expect((await client(other).rpc('create_support_ticket',args(randomUUID(),null))).error).toMatchObject({code:'P0429'});
  await create(first,other);vi.advanceTimersByTime(60*60*1000);expect((await create(args(randomUUID(),null),other)).ticket.number).toBe(11);
 });
 it('enforces thirty replies per actor/ticket/hour including the initial message',async()=>{
  const own=await create();let lastId='';
  for(let i=0;i<29;i++){lastId=randomUUID();expect((await reply(own.ticket.id,lastId)).error).toBeNull();}
  expect((await reply(own.ticket.id)).error).toMatchObject({code:'P0429'});expect((await reply(own.ticket.id,lastId)).error).toBeNull();
  const second=await create();expect((await reply(second.ticket.id)).error).toBeNull();
  vi.advanceTimersByTime(60*60*1000);expect((await reply(own.ticket.id)).error).toBeNull();
 });
 it('rejects invalid page, fields and strict bounded transcripts atomically',async()=>{
  const transcripts=[null,{},[{role:'system',text:'x'}],[{role:'user',text:' '}],[{role:'user',text:'x',secret:'no'}],[{role:'user',text:'x'.repeat(2001)}],Array.from({length:9},()=>({role:'user',text:'x'})),Array.from({length:8},()=>({role:'user',text:'😀'.repeat(1000)}))];
  for(const p_transcript of transcripts)expect((await client().rpc('create_support_ticket',{...args(),p_transcript})).error).toMatchObject({code:'22023'});
  for(const patch of [{p_page:'https://example.test'},{p_page:'/app?secret=x'},{p_subject:'bad'},{p_message:'short'},{p_id:null}])expect((await client().rpc('create_support_ticket',{...args(),...patch})).error).toMatchObject({code:'22023'});
  expect(await store.run(tx=>tx.list('support_tickets'))).toEqual([]);expect(await store.run(tx=>tx.list('platform_audit'))).toEqual([]);
  const own=await create();expect((await reply(own.ticket.id,randomUUID(),owner,' ')).error).toMatchObject({code:'22023'});
 });
 it('paginates sorted tickets and returns the latest hundred messages in chronological order',async()=>{
  const base=await create();const ticket=base.ticket;
  await store.run(async tx=>{
   for(let i=0;i<25;i++){const id=randomUUID();tx.put('support_tickets',id,{...ticket,id,number:i+2,updated_at:new Date(Date.now()+i*1000).toISOString()});}
   for(let i=0;i<105;i++){const id=randomUUID();tx.put('support_messages',id,{id,ticket_id:ticket.id,author_id:owner,author_kind:'customer',body:String(i),created_at:new Date(Date.now()+1000+i*1000).toISOString()});}
  });
  const first=(await list()).data as SupportTicket[],second=(await list(owner,false,20)).data as SupportTicket[];
  expect(first).toHaveLength(20);expect(second).toHaveLength(6);expect(first[0].number).toBe(26);expect(new Set([...first,...second].map(t=>t.id)).size).toBe(26);
  const messages=(await detail(ticket.id)).data.messages;expect(messages).toHaveLength(100);expect(messages[0].body).toBe('5');expect(messages.at(-1).body).toBe('104');
  for(const p_offset of [-1,10001,null,0.5])expect((await client().rpc('support_ticket_list',{p_offset})).error).toMatchObject({code:'22023'});
 });
 it('does not overwrite a reply when its request ID is reused to create a ticket',async()=>{
  const own=await create(),id=randomUUID();expect((await reply(own.ticket.id,id)).error).toBeNull();
  expect((await client().rpc('create_support_ticket',args(id))).error).toMatchObject({code:'23505'});
  expect(await store.run(tx=>tx.get('support_tickets',id))).toBeNull();
  expect(await store.run(tx=>tx.get('support_messages',id))).toMatchObject({ticket_id:own.ticket.id,body:'Resposta de teste'});
 });
 it('continues imported protocols and hides archived clinic tickets from requesters',async()=>{
  const own=await create();await store.run(async tx=>{
   tx.remove('support_counters','tickets');const ticket=await tx.get('support_tickets',own.ticket.id);tx.put('support_tickets',own.ticket.id,{...ticket,number:250});
  });expect((await create()).ticket.number).toBe(251);
  await store.run(async tx=>{const row=await tx.get('companies',company);tx.put('companies',company,{...row,archived_at:new Date().toISOString()});});
  expect((await detail(own.ticket.id)).error).toMatchObject({code:'42501'});expect((await list()).data).toEqual([]);
  expect((await detail(own.ticket.id,admin)).error).toBeNull();
 });
 it('allocates unique protocols for concurrent requests and preserves status CAS',async()=>{
  const results=await Promise.all(Array.from({length:5},()=>create()));expect(new Set(results.map(r=>r.ticket.number)).size).toBe(5);await assign();
  const attempts=await Promise.all([status(results[0].ticket.id,1),status(results[0].ticket.id,1)]);expect(attempts.filter(r=>!r.error)).toHaveLength(1);expect(attempts.find(r=>r.error)?.error).toMatchObject({code:'40001'});
 });
});
