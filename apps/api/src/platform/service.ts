import {createClient} from '@supabase/supabase-js';
import {ServiceUnavailableException} from '@nestjs/common';
import {firestoreClient} from './firestore/client';
import {firestoreBackend,firebaseBackend,databaseConfigured} from './config';
import {firebaseSqlClient} from './database-client';
export function serviceDatabase(){
 if(!databaseConfigured())throw new ServiceUnavailableException('Banco de dados não configurado.');
 if(firestoreBackend())return firestoreClient('service_role',null);
 if(firebaseBackend())return firebaseSqlClient('service_role',null);
 return createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}
