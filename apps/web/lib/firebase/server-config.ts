import 'server-only';
// Firebase's web API key is public. This alias is read at runtime by the server,
// so a Docker build without NEXT_PUBLIC variables can still authenticate.
export function firebaseServerApiKey(){return process.env.FIREBASE_WEB_API_KEY||process.env.NEXT_PUBLIC_FIREBASE_API_KEY;}
export function firebaseServerAuthConfigured(){return Boolean(process.env.FIREBASE_PROJECT_ID&&firebaseServerApiKey());}
