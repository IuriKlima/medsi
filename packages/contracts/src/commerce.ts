export const commercePlans=[
 {id:'askadia_monthly',name:'Mensal',installmentCents:159700,installments:1,totalCents:159700,commitmentMonths:1,description:'Liberdade para acompanhar o ritmo da sua empresa.'},
 {id:'askadia_semiannual',name:'Semestral',installmentCents:133333,installments:6,totalCents:800000,commitmentMonths:6,description:'Seis meses de direção para construir resultados consistentes.'},
] as const;
export const commercePlanIds=['askadia_monthly','askadia_semiannual'] as const;
export const assistedImplementation={priceCents:350000,giftLimit:100} as const;
export function installmentAmounts(totalCents:number,count:number){const regular=Math.floor(totalCents/count);return {regular,last:totalCents-regular*(count-1)};}
export type CommercePlanId=typeof commercePlans[number]['id'];
export type Checkout={id:string;company_id:string;plan_id:CommercePlanId|'askadia_annual';status:'pending'|'test_approved'|'declined'|'cancelled';mode:'test';installment_cents:number;installments:number;total_cents:number;expires_at:string};
export type PurchaseState={companyId:string;aiAllowed:boolean;accessMode:'live'|'test'|'none';testUntil:string|null;planId:string|null;onboardingComplete:boolean;setupComplete:boolean;canPurchase:boolean;canWrite:boolean;latestCheckout:Checkout|null;testCheckoutEnabled?:boolean;asaasSandboxEnabled?:boolean};
export const commerceFeatures=[
 ['Estratégia com direção','Diagnóstico do negócio e planos de curto, médio e longo prazo, conectados às metas da sua empresa.'],
 ['Concorrentes no radar','Organize referências locais e perfis do Instagram para orientar seu posicionamento com os dados disponíveis.'],
 ['Conteúdo que carrega sua marca','Ideias, legendas, roteiros, imagens e carrosséis com IA, reunidos em um calendário para sua revisão.'],
 ['Seu site, do primeiro rascunho à publicação','Uma página para apresentar o negócio, editar textos e imagens e receber interessados.'],
 ['Campanhas com você no controle','Propostas, criativos e programação de anúncios Meta e Google nos formatos disponíveis, sempre sujeitos à sua aprovação.'],
 ['Relacionamento que continua','Sugestões de campanhas para pacientes e leads, com público, mensagem e datas para aprovar.'],
 ['Atendimento com contexto','Caixa de entrada, assistente de IA e transferência para sua equipe no WhatsApp conectado.'],
 ['Oportunidades organizadas','CRM, histórico e acompanhamento de contatos para sua equipe conduzir cada próximo passo.'],
 ['Clareza para decidir','Dashboards, tarefas e indicadores das fontes conectadas, com sugestões para orientar os ajustes.'],
 ['Cada empresa no seu espaço','Perfis, materiais, equipe, permissões e integrações separados por empresa no workspace.'],
] as const;

export type AsaasSubscription={company_id:string;plan_id:CommercePlanId;provider:'asaas';environment:'sandbox';status:string;provider_confirmed:boolean;provider_status?:string;provider_subscription_id:string;current_period_end:string|null;invoice_url?:string|null;cancellation_requested?:boolean};
export type AsaasCheckout={id:string;company_id:string;plan_id:CommercePlanId;status:string;total_cents:number;provider_subscription_id:string|null;invoice_url?:string|null};
export type AsaasBillingState={companyId:string;environment:'sandbox';customerConfigured:boolean;subscription:AsaasSubscription|null;checkout:AsaasCheckout|null};
