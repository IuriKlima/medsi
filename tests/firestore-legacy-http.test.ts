import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {UnauthorizedException,type INestApplication} from '../apps/api/node_modules/@nestjs/common';
import {MemoryStore} from './helpers/firestore-memory';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import type {Row} from '../apps/api/src/platform/firestore/store';
import {AuthGuard,AuthService} from '../apps/api/src/identity/auth';
import {IdentityService} from '../apps/api/src/identity/service';
import {IdentityController} from '../apps/api/src/identity/controller';
import {OperationsController} from '../apps/api/src/operations/controller';
import {SupportController} from '../apps/api/src/support/controller';
import {DashboardController} from '../apps/api/src/dashboard/controller';
import {OnboardingController} from '../apps/api/src/onboarding/controller';
vi.mock('../apps/api/src/platform/firebase-auth',()=>({verifyFirebaseActor:vi.fn()}));

describe('existing API routes through native Firestore — fictitious actors, no providers',()=>{
 let app:INestApplication,origin:string,store:MemoryStore;
 const actors={owner:randomUUID(),other:randomUUID(),invitee:randomUUID(),admin:randomUUID(),support:randomUUID()},company=randomUUID(),foreign=randomUUID();
 beforeAll(async()=>{
  const module=await Test.createTestingModule({controllers:[IdentityController,OperationsController,SupportController,DashboardController,OnboardingController],providers:[IdentityService,AuthGuard,{provide:AuthService,useValue:{verify:async(header:string)=>{const id=Object.values(actors).find(id=>header==='Bearer '+id);if(!id)throw new UnauthorizedException();return {id,email:id+'@example.test',client:firestoreClient('authenticated',id,store)};}}}]}).compile();
  app=module.createNestApplication();app.useLogger(false);await app.listen(0,'127.0.0.1');origin=await app.getUrl();
 });
 beforeEach(async()=>{
  store=new MemoryStore();await store.run(async tx=>{
   for(const id of Object.values(actors)){tx.put('profiles',id,{id,display_name:'Pessoa fictícia '+id.slice(0,4)});tx.put('firebase_identities',id,{user_id:id,email:id+'@example.test'});}
   for(const [id,owner] of [[company,actors.owner],[foreign,actors.other]]){const workspace=randomUUID();tx.put('workspaces',workspace,{id:workspace,name:'Espaço fictício',created_at:'2026-10-07'});tx.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});tx.put('companies',id,{id,workspace_id:workspace,name:'Clínica fictícia',segment:'clinic',city:'Campinas',timezone:'America/Sao_Paulo',archived_at:null,created_at:'2026-10-07'});tx.put('company_members',id+'_'+owner,{company_id:id,user_id:owner,role:'admin'});tx.put('company_onboarding',id,{company_id:id,revision:0,confirmed_revision:null,profile_version:0,facts:{}});}
   tx.put('platform_staff',actors.admin,{user_id:actors.admin,role:'platform_admin',active:true});tx.put('platform_staff',actors.support,{user_id:actors.support,role:'support',active:true});
  });
 });
 afterAll(async()=>{await app?.close();});
 async function request(actor:keyof typeof actors,path:string,body?:unknown,method=body===undefined?'GET':'POST'){
  const response=await fetch(origin+path,{method,headers:{Authorization:'Bearer '+actors[actor],'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await response.text();return {status:response.status,body:text?JSON.parse(text) as Row:null};
 }
 it('runs invitations, roster, delegation and removal without exposing invitation hashes',async()=>{
  const invite=await request('owner','/identity/companies/'+company+'/invitations',{email:actors.invitee+'@example.test',role:'reader'});expect(invite.status).toBe(201);expect(invite.body.token).toMatch(/^[a-f0-9]{64}$/);
  expect((await request('invitee','/identity/invitations/accept',{token:invite.body.token})).body).toEqual({companyId:company});
  const team=await request('owner','/identity/companies/'+company+'/team');expect(team.status).toBe(200);expect(team.body.members).toHaveLength(2);expect(JSON.stringify(team.body)).not.toContain('token_hash');
  expect((await request('other','/identity/companies/'+company+'/team')).status).toBe(403);
  expect((await request('owner','/operations/companies/'+company+'/delegations',{userId:actors.invitee,action:'content.approve',enabled:true,budgetLimitCents:null,expiresAt:null})).status).toBe(201);
  expect((await request('owner','/operations/companies/'+company+'/delegations')).body).toHaveLength(1);
  expect((await request('owner','/identity/companies/'+company+'/members/'+actors.invitee,{role:null},'PATCH')).status).toBe(200);
  expect((await request('owner','/operations/companies/'+company+'/delegations')).body).toHaveLength(0);
  expect((await request('invitee','/operations/companies/'+company+'/capabilities')).status).toBe(403);
 });
 it('routes internal assignments, expiring read-only sessions and followup through existing controllers',async()=>{
  expect((await request('admin','/operations/staff')).body).toEqual([{user_id:actors.support,role:'support'}]);
  expect((await request('admin','/operations/companies/'+company+'/assignments',{staffId:actors.support,assigned:true})).status).toBe(201);
  expect((await request('admin','/operations/companies/'+company+'/assignments')).body).toHaveLength(1);
  const portfolio=await request('support','/operations/portfolio');expect(portfolio.body.companies.map((c:Row)=>c.id)).toEqual([company]);
  const access=await request('support','/operations/access',{companyId:company,reason:'Conferência fictícia de cadastro'});expect(access.status).toBe(201);const session=access.body.sessionId;
  expect((await request('support','/operations/access/'+session)).body.scope).toBe('read_only');
  expect((await request('support','/onboarding/access/'+session)).body.companyId).toBe(company);
  expect((await request('support','/operations/companies/'+company+'/capabilities')).status).toBe(403);
  const meeting={requestId:randomUUID(),date:'2026-10-07T12:00:00Z',participants:'Equipe fictícia',decisions:'Revisar cadastro fictício',nextActions:'Conferir os campos informados'};
  const first=await request('support','/onboarding/access/'+session+'/meetings',meeting);expect(first.status).toBe(201);expect((await request('support','/onboarding/access/'+session+'/meetings',meeting)).body.id).toBe(first.body.id);
  expect((await request('other','/operations/access/'+session)).status).toBe(403);
  expect((await request('support','/operations/access/'+session+'/end',{})).status).toBe(201);
  expect((await request('support','/operations/access/'+session)).status).toBe(403);
 });
 it('persists support, retries safely and returns a conflict for a stale version',async()=>{
  const id=randomUUID(),payload={requestId:id,companyId:company,subject:'Cadastro fictício',message:'Conferência fictícia sem dados reais.',page:'/comecar',transcript:[]};
  const ticket=await request('owner','/operations/support/tickets',payload);expect(ticket.status).toBe(201);expect((await request('owner','/operations/support/tickets',payload)).body.ticket.id).toBe(id);
  expect((await request('owner','/operations/support/tickets')).body).toHaveLength(1);expect((await request('other','/operations/support/tickets/'+id)).status).toBe(403);
  const reply=await request('admin','/operations/support/tickets/'+id+'/reply',{requestId:randomUUID(),message:'Resposta administrativa fictícia'});expect(reply.status).toBe(201);expect(reply.body.messages).toHaveLength(2);
  expect((await request('admin','/operations/support/tickets/'+id+'/status',{status:'resolved',version:1})).status).toBe(409);
  expect((await request('admin','/operations/support/tickets/'+id+'/status',{status:'resolved',version:reply.body.ticket.version})).body.ticket.status).toBe('resolved');
 });
 it('imports local content as unapproved drafts, reloads and rejects another clinic',async()=>{
  const source=randomUUID(),payload={sourceCompanyId:source,contacts:[],opportunities:[],contents:[{id:randomUUID(),companyId:source,title:'Conteúdo fictício',caption:'Somente teste',format:'Imagem',date:'2026-10-07',version:4,status:'approved',approvedVersion:4}]};
  expect((await request('owner','/operations/companies/'+company+'/import',payload)).body).toEqual({contacts:0,opportunities:0,contents:1,skipped:0});
  expect((await request('owner','/operations/companies/'+company+'/import',payload)).body.skipped).toBe(1);
  const drafts=await request('owner','/operations/companies/'+company+'/drafts');expect(drafts.status).toBe(200);expect(drafts.body[0]).toMatchObject({company_id:company,status:'draft',version:1});
  expect((await request('other','/operations/companies/'+company+'/drafts')).status).toBe(403);
 });
 it('returns no fabricated financial metrics from the real dashboard controller',async()=>{
  const query='?companyId='+company+'&start=2026-10-01&end=2026-10-07&timezone=America%2FSao_Paulo&comparison=none';
  const result=await request('owner','/dashboard'+query);expect(result.status).toBe(200);expect(result.body.series).toEqual([]);expect(result.body.metrics.find((m:Row)=>m.id==='cac').value).toBeNull();
  expect((await request('other','/dashboard'+query)).status).toBe(403);
 });
});
