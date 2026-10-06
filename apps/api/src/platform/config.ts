export const firestoreBackend=()=>process.env.DATABASE_PROVIDER==='firestore';
export const firebaseBackend=()=>firestoreBackend()||process.env.DATABASE_PROVIDER==='firebase_sql';
export const databaseConfigured=()=>firestoreBackend()?Boolean(process.env.FIREBASE_PROJECT_ID):firebaseBackend()?Boolean(process.env.FIREBASE_PROJECT_ID&&(process.env.DATABASE_URL||process.env.CLOUD_SQL_CONNECTION_NAME&&process.env.DATABASE_USER&&process.env.DATABASE_NAME)):Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
