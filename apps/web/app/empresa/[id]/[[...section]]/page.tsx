import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {serverSupabase} from '../../../../lib/auth/server';
import {CompanyJourney} from '../../../../components/company-journey';
import {allowedSettingsTabs,companySettingsHref,companySettingsTabs,legacySettingsTab} from '../../../../lib/company-navigation';
export const dynamic='force-dynamic';
type Query=Record<string,string|string[]|undefined>;
export default async function CompanyPage({params,searchParams}:{params:Promise<{id:string;section?:string[]}>;searchParams:Promise<Query>}){
 const {id,section}=await params;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound();
 const query=await searchParams;
 const day=section?.[0]==='conteudo'&&section.length===2?section[1]:undefined;
 if(day&&day!=='sem-data'&&(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day))notFound();
 const requested=day?'conteudo':section?.join('/')||'inicio',legacyTab=legacySettingsTab(requested),area=legacyTab?'configuracoes':requested;
 const permissions:Record<string,string>={preparacao:'marketing.read',concorrentes:'marketing.read',inicio:'company.read',agentes:'marketing.read',onboarding:'marketing.read',estrategia:'marketing.read',conteudo:'marketing.read',campanhas:'marketing.read',configuracoes:'company.read',crm:'crm.read',atendimento:'crm.read'};
 if(!permissions[area])notFound();
 const client=await serverSupabase();const {data:auth}=await client.auth.getUser();if(!auth.user?.email_confirmed_at)redirect('/login');
 const {data:staff}=await client.from('platform_staff').select('role,active').eq('user_id',auth.user.id).maybeSingle();
 const internalHref=staff?.active?(staff.role==='platform_admin'?'/admin':'/acompanhamento/carteira'):undefined;
 const {data:cap,error}=await client.rpc('company_capabilities',{p_company_id:id});
 const unavailable=<main className="internal-shell"><section className="panel internal-empty"><h1>Acesso indisponível.</h1><p>Seu perfil não permite abrir esta área ou o vínculo não está mais ativo.</p><Link className="button button-outline" href="/entrada">Voltar à minha conta</Link></section></main>;
 if(error||!cap?.actions?.includes(permissions[area]))return unavailable;
 let manageTeam=cap.actions.includes('billing.manage');
 if(area==='configuracoes'&&!manageTeam){const member=await client.from('company_members').select('role').eq('company_id',id).eq('user_id',auth.user.id).maybeSingle();manageTeam=!member.error&&member.data?.role==='admin';}
 const tabs=allowedSettingsTabs(cap.actions,manageTeam),requestedTab=legacyTab??(typeof query.aba==='string'?query.aba:undefined);
 const setting=area==='configuracoes'?(requestedTab?companySettingsTabs.find(tab=>tab.id===requestedTab):tabs[0]):undefined;
 if(area==='configuracoes'&&requestedTab&&!setting)notFound();
 if(area==='configuracoes'&&(!setting||!tabs.some(tab=>tab.id===setting.id)))return unavailable;
 const {data:company}=await client.from('companies').select('id,name,timezone').eq('id',id).is('archived_at',null).maybeSingle();if(!company)notFound();
 const {data:purchase,error:purchaseError}=await client.rpc('company_purchase_state',{p_company_id:id});
 if(purchaseError)return <main className="internal-shell"><h1>Não foi possível verificar o plano.</h1><p>Seu cadastro está salvo. Tente novamente após atualizar a configuração do sistema.</p><Link href="/entrada">Voltar à minha conta</Link></main>;
 const setupTool=setting?.setup??area==='onboarding';
 if(!purchase.aiAllowed&&!setupTool)redirect('/comecar?empresa='+id);
 if(purchase.aiAllowed&&!purchase.setupComplete&&!setupTool&&area!=='conteudo')redirect('/comecar?empresa='+id);
 if(legacyTab){const preserved=new URLSearchParams();for(const [key,value] of Object.entries(query)){if(Array.isArray(value))value.forEach(item=>preserved.append(key,item));else if(value!==undefined)preserved.set(key,value);}redirect(companySettingsHref(id,legacyTab,preserved));}
 if(area==='agentes')redirect('/empresa/'+id+'/estrategia');
 if(area==='inicio'&&!cap.actions.includes('marketing.read'))redirect('/empresa/'+id+'/atendimento');
 return <>{!purchase.setupComplete&&<aside className="info-note"><Link href={'/comecar?empresa='+id}>← Voltar à configuração e aprovação da estratégia</Link></aside>}<CompanyJourney key={id+':'+area} company={company} area={area} calendarDay={day} settingsTab={setting?.id} manageTeam={manageTeam} internalHref={internalHref} userId={auth.user.id} actions={cap.actions} email={auth.user.email??''}/></>;
}
