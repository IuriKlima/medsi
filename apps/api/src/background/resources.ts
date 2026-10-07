import {closePostgres} from '../platform/postgres';
import {closeFirebaseAdmin} from '../platform/firebase-admin';
export async function closeBackgroundResources(){
 try{await closePostgres();}finally{await closeFirebaseAdmin();}
}
