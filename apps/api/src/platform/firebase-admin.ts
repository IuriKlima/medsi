import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getStorage} from 'firebase-admin/storage';
export function firebaseAdmin(){
 const projectId=process.env.FIREBASE_PROJECT_ID;
 if(!projectId)throw new Error('Firebase project is not configured');
 if(process.env.NODE_ENV==='production'&&(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIREBASE_STORAGE_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST))throw new Error('Emulators are forbidden in production');
 return getApps().find(a=>a.name==='medsi')??initializeApp({projectId,storageBucket:process.env.FIREBASE_STORAGE_BUCKET,credential:applicationDefault()},'medsi');
}
export const firebaseAuth=()=>getAuth(firebaseAdmin());
export const firebaseBucket=():ReturnType<ReturnType<typeof getStorage>['bucket']>=>getStorage(firebaseAdmin()).bucket();
