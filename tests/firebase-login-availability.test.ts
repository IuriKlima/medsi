import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const fake=vi.hoisted(()=>({cookies:{get:vi.fn(),set:vi.fn(),delete:vi.fn()},auth:{verifyIdToken:vi.fn(),createSessionCookie:vi.fn()}}));
vi.mock('server-only',()=>({}));
vi.mock('../apps/web/node_modules/next/headers',()=>({cookies:async()=>fake.cookies}));
vi.mock('../apps/web/lib/firebase/admin',()=>({adminFirebaseAuth:()=>fake.auth}));
import {firebaseAuthAction,firebaseServerClient} from '../apps/web/lib/firebase/server';
import {result} from '../apps/api/src/identity/service';
let identityStatus=200,identityOffline=false,passwordValid=true;
const signIn=()=>firebaseAuthAction({action:'login',email:'fixture@example.test',password:'fixture-password'});
const identity={user:{id:'fixture-user',email:'fixture@example.test'},staff:null,profile:null,companies:[]};
beforeEach(()=>{
 vi.clearAllMocks();identityStatus=200;identityOffline=false;passwordValid=true;
 vi.stubEnv('API_INTERNAL_URL','http://api.fixture.test');vi.stubEnv('FIREBASE_WEB_API_KEY','fixture');
 fake.cookies.get.mockReturnValue({value:'fixture-session'});
 fake.auth.verifyIdToken.mockResolvedValue({email_verified:true,auth_time:Math.floor(Date.now()/1000)});
 fake.auth.createSessionCookie.mockResolvedValue('fixture-session');
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  if(input.startsWith('https://identitytoolkit.googleapis.com/'))return passwordValid?Response.json({idToken:'fixture-id-token'}):Response.json({error:{message:'INVALID_LOGIN_CREDENTIALS'}},{status:400});
  if(input==='http://api.fixture.test/identity'){
   if(identityOffline)throw Error('private infrastructure details');
   return Response.json(identityStatus===200?identity:identityStatus===503?{code:'FIRESTORE_QUOTA_EXCEEDED',message:'private provider details'}:{message:'invalid token'},{status:identityStatus});
  }
  throw Error('Unexpected test request');
 }));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('Login and Firestore availability — isolated fixtures',()=>{
 it('exposes exhausted database quota as a sanitized 503 code',()=>{
  try{result({data:null,error:{code:'8',message:'private quota details',details:'',hint:''}});throw Error('Expected rejection');}
  catch(error){expect((error as {getStatus:()=>number}).getStatus()).toBe(503);expect((error as {getResponse:()=>unknown}).getResponse()).toMatchObject({code:'FIRESTORE_QUOTA_EXCEEDED',message:expect.stringContaining('cota')});expect(JSON.stringify(error)).not.toContain('private quota details');}
 });
 it('does not issue a successful session when verified credentials cannot load the database',async()=>{
  identityStatus=503;const response=await signIn();expect(response.status).toBe(503);expect(response.body.message).toContain('cota');
  expect(fake.auth.createSessionCookie).not.toHaveBeenCalled();expect(fake.cookies.set).not.toHaveBeenCalled();
 });
 it('recovers normally after database access returns and checks the verified token before setting a cookie',async()=>{
  identityStatus=503;await signIn();identityStatus=200;expect(await signIn()).toMatchObject({status:200,body:{ok:true}});
  expect(fetch).toHaveBeenCalledWith('http://api.fixture.test/identity',expect.objectContaining({headers:{Authorization:'Bearer fixture-id-token'}}));
  expect(fake.cookies.set).toHaveBeenCalledExactlyOnceWith('medsi_session','fixture-session',expect.objectContaining({httpOnly:true,sameSite:'lax',path:'/'}));
 });
 it('keeps invalid passwords and unconfirmed e-mails rejected',async()=>{
  passwordValid=false;expect((await signIn()).status).toBe(401);expect(fake.auth.verifyIdToken).not.toHaveBeenCalled();
  passwordValid=true;fake.auth.verifyIdToken.mockResolvedValue({email_verified:false,auth_time:Date.now()/1000});expect((await signIn()).status).toBe(401);expect(fake.cookies.set).not.toHaveBeenCalled();
 });
 it('does not turn an existing session into an anonymous user during a database outage',async()=>{
  identityStatus=503;const client=await firebaseServerClient();await expect(client.auth.getUser()).rejects.toThrow('cota');expect(fake.cookies.delete).not.toHaveBeenCalled();
 });
 it('still returns an anonymous user for an absent or invalid session',async()=>{
  fake.cookies.get.mockReturnValue(undefined);expect(await (await firebaseServerClient()).auth.getUser()).toMatchObject({data:{user:null}});expect(fetch).not.toHaveBeenCalled();
  fake.cookies.get.mockReturnValue({value:'fixture-session'});identityStatus=401;expect(await (await firebaseServerClient()).auth.getUser()).toMatchObject({data:{user:null}});
 });
 it('reports an unreachable identity service without leaking details or setting a cookie',async()=>{
  identityOffline=true;const response=await signIn();expect(response.status).toBe(503);expect(response.body.message).toContain('temporariamente');expect(JSON.stringify(response)).not.toContain('private');expect(fake.cookies.set).not.toHaveBeenCalled();
 });
});
