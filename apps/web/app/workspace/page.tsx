import { redirect } from 'next/navigation';
import { TenantWorkspace } from '../../components/tenant-workspace';
import { serverSupabase } from '../../lib/auth/server';
import { authConfigured } from '../../lib/auth/config';
import {AccountEntry} from '../../components/account-entry';
export const dynamic='force-dynamic';
export default async function ConnectedWorkspace(){
  if(!authConfigured()) redirect('/login');
  const client=await serverSupabase();const {data}=await client.auth.getUser();
  if(!data.user?.email_confirmed_at) redirect('/login');
  const {data:staff}=await client.from('platform_staff').select('role,active').eq('user_id',data.user.id).maybeSingle();
  if(!staff?.active)return <AccountEntry email={data.user.email??''}/>;
  return <TenantWorkspace userId={data.user.id} email={data.user.email??''} staffRole={staff?.active?staff.role:null}/>;
}
