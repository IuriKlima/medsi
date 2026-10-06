import {beforeEach,describe,it,expect,vi} from 'vitest';
const fake=vi.hoisted(()=>({auth:{verifySessionCookie:vi.fn(),verifyIdToken:vi.fn(),getUser:vi.fn()},rpc:vi.fn(),client:vi.fn()}));
vi.mock('../apps/api/src/platform/firebase-admin',()=>({firebaseAuth:()=>fake.auth}));
vi.mock('../apps/api/src/platform/database-client',()=>({firebaseSqlClient:fake.client}));
import {verifyFirebaseActor} from '../apps/api/src/platform/firebase-auth';
describe('Firebase authentication maps only verified server identities',()=>{
 beforeEach(()=>{vi.clearAllMocks();fake.auth.verifySessionCookie.mockResolvedValue({uid:'trusted-uid',email_verified:true,admin:true});fake.auth.getUser.mockResolvedValue({email:'doctor@example.test',emailVerified:true,disabled:false,displayName:'Dra. Teste'});fake.rpc.mockResolvedValue({data:'10000000-0000-4000-8000-000000000001',error:null});fake.client.mockReturnValue({rpc:fake.rpc});});
 it('checks revocation and uses the SQL UUID, never UID or custom role claims',async()=>{
  const actor=await verifyFirebaseActor('session-cookie');
  expect(fake.auth.verifySessionCookie).toHaveBeenCalledWith('session-cookie',true);
  expect(fake.rpc).toHaveBeenCalledWith('ensure_firebase_identity_server',{p_uid:'trusted-uid',p_email:'doctor@example.test',p_name:'Dra. Teste'});
  expect(actor.id).toBe('10000000-0000-4000-8000-000000000001');
  expect(fake.client).toHaveBeenLastCalledWith('authenticated',actor.id);
 });
 it('also accepts properly verified ID tokens for API clients',async()=>{
  fake.auth.verifySessionCookie.mockRejectedValue(new Error('Not a session'));fake.auth.verifyIdToken.mockResolvedValue({uid:'trusted-uid',email_verified:true});
  await verifyFirebaseActor('id-token');expect(fake.auth.verifyIdToken).toHaveBeenCalledWith('id-token',true);
 });
 it('rejects revoked/invalid tokens before opening a database client',async()=>{
  fake.auth.verifySessionCookie.mockRejectedValue(new Error('Revoked'));fake.auth.verifyIdToken.mockRejectedValue(new Error('Revoked'));
  await expect(verifyFirebaseActor('revoked')).rejects.toThrow('Sessão inválida');expect(fake.client).not.toHaveBeenCalled();
 });
 it('rejects unverified or disabled users before mapping identity',async()=>{
  fake.auth.verifySessionCookie.mockResolvedValue({uid:'trusted-uid',email_verified:false});
  await expect(verifyFirebaseActor('unverified')).rejects.toThrow('Sessão inválida');expect(fake.client).not.toHaveBeenCalled();
  fake.auth.verifySessionCookie.mockResolvedValue({uid:'trusted-uid',email_verified:true});fake.auth.getUser.mockResolvedValue({email:'doctor@example.test',emailVerified:true,disabled:true});
  await expect(verifyFirebaseActor('disabled')).rejects.toThrow('Confirme seu e-mail');expect(fake.client).not.toHaveBeenCalled();
 });
});
