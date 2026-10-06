import {firebaseBackend} from '../../../lib/firebase/config';
import { redirect } from 'next/navigation';
import { AuthPanel } from '../../../components/auth-panel';
import { serverSupabase } from '../../../lib/auth/server';
import { authConfigured } from '../../../lib/auth/config';
export const dynamic='force-dynamic';
export default async function UpdatePassword(){
  if(firebaseBackend())redirect('/login');
  if(!authConfigured()) return <AuthPanel configured={false} update/>;
  const client=await serverSupabase();const {data}=await client.auth.getUser();
  if(!data.user) redirect('/login?error=recovery');
  return <AuthPanel configured update/>;
}
