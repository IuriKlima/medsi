import {applicationDefault,deleteApp,getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore,type Firestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {getStorage} from 'firebase-admin/storage';
const firestoreClients=new Set<Firestore>();
let closing:Promise<void>|undefined;
export function firebaseAdmin(){
 if(closing)throw new Error('Firebase resources are shutting down');
 const projectId=process.env.FIREBASE_PROJECT_ID;
 if(!projectId)throw new Error('Firebase project is not configured');
 if(process.env.NODE_ENV==='production'&&(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIREBASE_STORAGE_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST))throw new Error('Emulators are forbidden in production');
 return getApps().find(a=>a.name==='medsi')??initializeApp({projectId,storageBucket:process.env.FIREBASE_STORAGE_BUCKET,credential:applicationDefault()},'medsi');
}
export const firebaseAuth=()=>getAuth(firebaseAdmin());
export const firebaseBucket=():ReturnType<ReturnType<typeof getStorage>['bucket']>=>getStorage(firebaseAdmin()).bucket();
export function firebaseFirestore(){
 const client=getFirestore(firebaseAdmin(),process.env.FIRESTORE_DATABASE_ID||'(default)');
 firestoreClients.add(client);return client;
}
/** Never initialize SDK resources during shutdown. deleteApp alone does not terminate
 * Firestore clients in firebase-admin 14; terminate the clients this process obtained. */
export function closeFirebaseAdmin():Promise<void>{
 if(closing)return closing;
 closing=(async()=>{
  await Promise.all([...firestoreClients].map(async client=>{await client.terminate();firestoreClients.delete(client);}));
  const app=getApps().find(app=>app.name==='medsi');if(app)await deleteApp(app);
 })().finally(()=>{closing=undefined;});
 return closing;
}
