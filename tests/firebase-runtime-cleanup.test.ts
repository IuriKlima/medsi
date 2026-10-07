import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const sdk=vi.hoisted(()=>({apps:[] as {name:string}[],initialize:vi.fn(),credential:vi.fn(),getFirestore:vi.fn(),deleteApp:vi.fn(),terminate:vi.fn()}));
vi.mock('../apps/api/node_modules/firebase-admin/lib/esm/app/index.js',()=>({getApps:()=>sdk.apps,initializeApp:sdk.initialize,applicationDefault:sdk.credential,deleteApp:sdk.deleteApp}));
vi.mock('../apps/api/node_modules/firebase-admin/lib/esm/firestore/index.js',()=>({getFirestore:sdk.getFirestore}));
import {closeFirebaseAdmin,firebaseFirestore} from '../apps/api/src/platform/firebase-admin';
beforeEach(()=>{vi.clearAllMocks();sdk.apps=[];vi.stubEnv('FIREBASE_PROJECT_ID','fixture-project');vi.stubEnv('NODE_ENV','test');sdk.initialize.mockImplementation(()=>{const app={name:'medsi'};sdk.apps.push(app);return app;});sdk.getFirestore.mockReturnValue({terminate:sdk.terminate});sdk.terminate.mockResolvedValue(undefined);sdk.deleteApp.mockImplementation(async(app)=>{sdk.apps=sdk.apps.filter(current=>current!==app);});});
afterEach(async()=>{await closeFirebaseAdmin();vi.unstubAllEnvs();});
describe('initialized-only Firebase resource cleanup',()=>{
 it('does not initialize apps, credentials or Firestore during an idle shutdown',async()=>{
  await closeFirebaseAdmin();expect(sdk.initialize).not.toHaveBeenCalled();expect(sdk.credential).not.toHaveBeenCalled();expect(sdk.getFirestore).not.toHaveBeenCalled();expect(sdk.deleteApp).not.toHaveBeenCalled();
 });
 it('terminates each previously obtained client once and deletes only the MedSI app afterwards',async()=>{
  sdk.apps.push({name:'other-app'});expect(firebaseFirestore()).toEqual({terminate:sdk.terminate});firebaseFirestore();expect(sdk.getFirestore).toHaveBeenCalledTimes(2);let finish:()=>void=()=>{};
  sdk.terminate.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const first=closeFirebaseAdmin(),second=closeFirebaseAdmin();expect(sdk.terminate).toHaveBeenCalledTimes(1);expect(sdk.deleteApp).not.toHaveBeenCalled();
  finish();await Promise.all([first,second]);await closeFirebaseAdmin();expect(sdk.terminate).toHaveBeenCalledTimes(1);expect(sdk.deleteApp).toHaveBeenCalledTimes(1);expect(sdk.apps).toEqual([{name:'other-app'}]);
 });
});
