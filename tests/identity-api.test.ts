import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../apps/api/src/app';
import { AuthService,type AuthenticatedActor } from '../apps/api/src/identity/auth';
import { createCompanyInputSchema } from '../packages/contracts/src/identity';
import { safeAuthDestination } from '../apps/web/lib/auth/destination';
const company='20000000-0000-4000-8000-000000000001';
const workspace='20000000-0000-4000-8000-000000000002';
const user='20000000-0000-4000-8000-000000000003';
const companyInput={name:'Empresa teste',city:'',segment:'gym',timezone:'America/Sao_Paulo',archived:false};
const rpc=vi.fn((name:string)=>name==='create_workspace'?{data:workspace,error:null}:{single:async()=>({data:{id:company,status:'draft'},error:null})});
function client(role:'admin'|'attendant'){
  return {from(table:string){
    const filters:Record<string,unknown>={};
    const chain={select(){return chain;},eq(key:string,value:unknown){filters[key]=value;return chain;},is(){return chain;},
      async maybeSingle(){
        if(table==='companies')return {data:filters.id===company?{id:company,workspace_id:workspace}:null,error:null};
        if(table==='company_members')return {data:filters.company_id===company?{role}:null,error:null};
        if(table==='workspace_members')return {data:{role:role==='admin'?'owner':'member'},error:null};
        return {data:null,error:null};
      }};
    return chain;
  },rpc} as unknown as AuthenticatedActor['client'];
}
describe('Nest HTTP authorization boundary with controlled identity adapter',()=>{
  let app:Awaited<ReturnType<Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>['createNestApplication']>>;
  let url:string;
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(AuthService).useValue({
      async verify(header?:string){
        if(!['Bearer attendant-test','Bearer admin-test'].includes(header??'')) return new AuthService({}).verify(undefined);
        return {id:user,email:'test@example.test',client:client(header==='Bearer admin-test'?'admin':'attendant')};
      },
    }).compile();
    app=module.createNestApplication();await app.listen(0,'127.0.0.1');url=await app.getUrl();
  },30000);
  afterAll(async()=>{await app?.close();});
  it('returns 401 without an authenticated identity',async()=>{
    expect((await fetch(url+'/identity')).status).toBe(401);
  });
  it('denies company mutation for an attendant',async()=>{
    const response=await fetch(url+'/identity/companies/'+company,{method:'PATCH',headers:{Authorization:'Bearer attendant-test','Content-Type':'application/json'},body:JSON.stringify(companyInput)});
    expect(response.status).toBe(403);
  });
  it('denies company metadata export for an attendant',async()=>{
    const response=await fetch(url+'/identity/companies/'+company+'/export',{method:'POST',headers:{Authorization:'Bearer attendant-test','Content-Type':'application/json'},body:'{}'});
    expect(response.status).toBe(403);
  });
  it('denies an inaccessible company even to an administrator elsewhere',async()=>{
    const response=await fetch(url+'/identity/companies/20000000-0000-4000-8000-000000000099',{method:'PATCH',headers:{Authorization:'Bearer admin-test','Content-Type':'application/json'},body:JSON.stringify(companyInput)});
    expect(response.status).toBe(403);
  });
  it('rejects status/workspace injection in an update',async()=>{
    const response=await fetch(url+'/identity/companies/'+company,{method:'PATCH',headers:{Authorization:'Bearer admin-test','Content-Type':'application/json'},body:JSON.stringify({...companyInput,status:'active',workspaceId:workspace})});
    expect(response.status).toBe(400);
  });
  it('returns workspace creation as JSON consumable by the web proxy',async()=>{
    rpc.mockClear();
    const response=await fetch(url+'/identity/workspaces',{method:'POST',headers:{Authorization:'Bearer admin-test','Content-Type':'application/json'},body:JSON.stringify({name:'Academia de teste'})});
    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({id:workspace});
    expect(rpc).toHaveBeenCalledExactlyOnceWith('create_workspace',{p_name:'Academia de teste'});
  });
  it('routes authorized company creation through the transactional draft RPC',async()=>{
    rpc.mockClear();
    const response=await fetch(url+'/identity/companies',{method:'POST',headers:{Authorization:'Bearer admin-test','Content-Type':'application/json'},body:JSON.stringify({workspaceId:workspace,name:'Empresa teste',segment:'gym',city:'',timezone:'America/Sao_Paulo'})});
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({id:company,status:'draft'});
    expect(rpc).toHaveBeenCalledWith('create_company',{p_workspace_id:workspace,p_name:'Empresa teste',p_segment:'gym',p_city:'',p_timezone:'America/Sao_Paulo'});
  });
});
describe('Authentication and input guardrails',()=>{
  it('fails closed without provider configuration',async()=>{
    await expect(new AuthService({}).verify('Bearer arbitrary')).rejects.toThrow('Autenticação não configurada');
    await expect(new AuthService({}).verify('arbitrary')).rejects.toThrow('Faça login');
  });
  it('rejects invalid timezone and unknown creation fields',()=>{
    expect(createCompanyInputSchema.safeParse({workspaceId:workspace,name:'Company',segment:'gym',city:'',timezone:'invalid'}).success).toBe(false);
    expect(createCompanyInputSchema.safeParse({workspaceId:workspace,name:'Company',segment:'gym',city:'',status:'active'}).success).toBe(false);
  });
  it('prevents external callback redirects',()=>{
    expect(safeAuthDestination('https://evil.example')).toBe('/entrada');
    expect(safeAuthDestination('//evil.example')).toBe('/entrada');
    expect(safeAuthDestination('/auth/update-password')).toBe('/auth/update-password');
    const invited='/workspace#invite='+'a'.repeat(64);expect(safeAuthDestination(invited)).toBe(invited);expect(safeAuthDestination(invited+'&next=https://evil.example')).toBe('/entrada');
  });
});
