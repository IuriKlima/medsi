export const companySettingsTabs = [
 {id:'perfil',label:'Perfil e marca',actions:['marketing.read'],setup:true},
 {id:'site',label:'Meu site',actions:['marketing.read'],setup:false},
 {id:'integracoes',label:'Integrações',actions:['marketing.read'],setup:true},
 {id:'atendimento',label:'Atendimento',actions:['marketing.write','crm.read'],setup:true},
 {id:'equipe',label:'Equipe e acessos',actions:[],setup:true},
 {id:'assinatura',label:'Assinatura',actions:['billing.manage'],setup:true},
] as const;
export type CompanySettingsTab=typeof companySettingsTabs[number]['id'];
export function allowedSettingsTabs(actions:readonly string[],manageTeam=false){return companySettingsTabs.filter(tab=>tab.id==='equipe'?manageTeam:tab.actions.every(action=>actions.includes(action)));}
export function legacySettingsTab(area:string):CompanySettingsTab|undefined{
 if(area==='configuracao-atendimento')return 'atendimento';
 return companySettingsTabs.find(tab=>tab.id===area&&tab.id!=='atendimento')?.id;
}
export function companySettingsHref(companyId:string,tab:CompanySettingsTab='perfil',query?:URLSearchParams){
 const params=new URLSearchParams(query);params.set('aba',tab);
 return '/empresa/'+companyId+'/configuracoes?'+params.toString();
}
export function companyNavigation(actions:readonly string[],manageTeam=false){
 if(!actions.includes('marketing.read'))return [{title:'Aquisição',items:[['atendimento','Caixa de entrada'],['crm','CRM']]}];
 return [
  {title:'Visão geral',items:[['inicio','Visão geral']]},
  {title:'Conteúdo',items:[['conteudo','Calendário e publicações']]},
  {title:'Aquisição',items:actions.includes('crm.read')?[['crm','CRM'],['atendimento','Caixa de entrada']]:[]},
  {title:'Campanhas',items:[['campanhas','Campanhas']]},
  {title:'Planejamento',items:[['preparacao','Preparação'],['estrategia','Estratégia'],['concorrentes','Concorrentes']]},
  {title:'Conta',items:allowedSettingsTabs(actions,manageTeam).length?[['configuracoes','Minha conta']]:[]},
 ].filter(group=>group.items.length);
}
