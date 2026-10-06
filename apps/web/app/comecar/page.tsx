import {redirect} from 'next/navigation';
import Link from 'next/link';
import {serverSupabase} from '../../lib/auth/server';
import {authConfigured} from '../../lib/auth/config';
import {PurchaseJourney} from '../../components/purchase-journey';
export const dynamic='force-dynamic';
export const metadata={title:'Comece sua jornada | MedSI',robots:{index:false,follow:false}};
export default async function Start({searchParams}:{searchParams:Promise<{empresa?:string}>}){
 if(!authConfigured())redirect('/login?modo=cadastro');const client=await serverSupabase();const {data}=await client.auth.getUser();if(!data.user?.email_confirmed_at)redirect('/login');
 const {empresa}=await searchParams;const companyId=empresa;
 if(companyId){if(!/^[0-9a-f-]{36}$/i.test(companyId))redirect('/entrada');const {data:cap,error}=await client.rpc('company_capabilities',{p_company_id:companyId});if(error||!cap?.actions?.includes('company.read'))return <main className="internal-shell"><h1>Acesso indisponível.</h1><Link href="/entrada">Voltar à minha conta</Link></main>;}
 else{const {data:companies}=await client.from('companies').select('id').is('archived_at',null).order('created_at').limit(1);if(companies?.[0])redirect('/comecar?empresa='+companies[0].id);}
 const {data:profile}=await client.from('profiles').select('display_name').eq('id',data.user.id).maybeSingle();const registeredName=profile?.display_name||(typeof data.user.user_metadata?.name==='string'?data.user.user_metadata.name:'');const name=registeredName.trim().split(/\s+/)[0]||'vamos começar';
 return <PurchaseJourney key={companyId??'new'} companyId={companyId} clientName={name}/>;
}
