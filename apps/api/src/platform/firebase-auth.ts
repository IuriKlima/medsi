import {UnauthorizedException} from '@nestjs/common';
import type {AuthenticatedActor} from '../identity/auth';
import {firebaseAuth} from './firebase-admin';
import {firestoreClient} from './firestore/client';
import {firestoreBackend} from './config';
import {firebaseSqlClient} from './database-client';
import {result} from '../identity/service';
export async function verifyFirebaseActor(token:string):Promise<AuthenticatedActor>{
 const auth=firebaseAuth();let uid:string;
 try{const decoded=await auth.verifySessionCookie(token,true).catch(()=>auth.verifyIdToken(token,true));if(!decoded.email_verified)throw new Error('Unverified email');uid=decoded.uid;}catch{throw new UnauthorizedException('Sessão inválida ou e-mail não confirmado.');}
 const user=await auth.getUser(uid);if(user.disabled||!user.emailVerified||!user.email)throw new UnauthorizedException('Confirme seu e-mail para continuar.');
 const client=firestoreBackend()?firestoreClient:firebaseSqlClient;
 const id=result<string>(await client('service_role',null).rpc('ensure_firebase_identity_server',{p_uid:uid,p_email:user.email,p_name:user.displayName??'Usuário'}));
 return {id,email:user.email,client:client('authenticated',id)};
}
