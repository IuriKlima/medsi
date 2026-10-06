'use client';
import Link from 'next/link';
import type {OnboardingSnapshot} from '@askadia/contracts';
import {allowedSettingsTabs,companySettingsHref,type CompanySettingsTab} from '../lib/company-navigation';
import {OnboardingChat} from './onboarding-chat';
import {SiteBuilder} from './site-builder';
import {CompanyChannels} from './company-channels';
import {ManagementIntegration} from './management-integration';
import {AttendanceSettings} from './attendance-settings';
import {CompanyTeamSettings} from './company-team-settings';
import {CompanyPlan} from './company-plan';
import styles from './company-settings.module.css';
export function CompanySettings({company,tab,actions,manageTeam,userId,profile}:{company:{id:string;name:string;timezone:string};tab:CompanySettingsTab;actions:string[];manageTeam:boolean;userId:string;profile:OnboardingSnapshot|null}){
 const tabs=allowedSettingsTabs(actions,manageTeam),owner=actions.includes('billing.manage');
 if(!tabs.some(value=>value.id===tab))return <p role="alert">Seu perfil não permite abrir esta configuração.</p>;
 return <section className={styles.settings}>
  <p className={styles.intro}>Gerencie o perfil, a marca, os canais, a equipe e o plano de {company.name}.</p>
  <nav className={styles.tabs} aria-label="Abas de configurações">{tabs.map(value=><Link key={value.id} id={'settings-'+value.id} href={companySettingsHref(company.id,value.id)} aria-current={tab===value.id?'page':undefined} scroll={false}>{value.label}</Link>)}</nav>
  <div key={company.id+':'+tab} className={styles.panel} role="region" aria-labelledby={'settings-'+tab}>
   {tab==='perfil'&&<OnboardingChat companyId={company.id} readOnly={!actions.includes('marketing.write')} summaryOnly/>}
   {tab==='site'&&<SiteBuilder companyId={company.id} profile={profile}/>}
   {tab==='integracoes'&&<><CompanyChannels companyId={company.id}/><ManagementIntegration companyId={company.id} owner={owner}/></>}
   {tab==='atendimento'&&<AttendanceSettings companyId={company.id} companyName={company.name}/>}
   {tab==='equipe'&&<CompanyTeamSettings companyId={company.id} owner={owner} userId={userId} timezone={company.timezone}/>}
   {tab==='assinatura'&&<CompanyPlan companyId={company.id}/>}
  </div>
 </section>;
}
