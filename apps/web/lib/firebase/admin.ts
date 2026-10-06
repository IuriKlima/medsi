import 'server-only';
import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
export function adminFirebaseAuth(){
 const projectId=process.env.FIREBASE_PROJECT_ID||process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;if(!projectId)throw new Error('Firebase project is not configured');
 if(process.env.NODE_ENV==='production'&&process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('Firebase Auth emulator is forbidden in production');
 return getAuth(getApps().find(a=>a.name==='medsi-web')??initializeApp({projectId,credential:applicationDefault()},'medsi-web'));
}
