import type {AsaasBillingState,CommercePlanId} from '@askadia/contracts';
export const billingCheckoutInput=(plan:CommercePlanId,requestId:string)=>({requestId,planId:plan,installments:1});
export function billingPresentation(state:AsaasBillingState){
 const sub=state.subscription,paid=Boolean(sub?.status==='active'&&sub.provider_confirmed&&sub.environment==='sandbox'&&sub.current_period_end&&Date.parse(sub.current_period_end)>Date.now());
 const uncertain=['uncertain','submitting'].includes(state.checkout?.status??'');
 const label=paid?'Pagamento confirmado no sandbox':uncertain?'Checkout pendente de conciliação':sub?.status==='cancelled'?'Assinatura cancelada no sandbox':sub?.status==='expired'?'Período da assinatura encerrado':sub?.cancellation_requested?'Cancelamento solicitado; confirmação pendente':sub?'Pagamento pendente de confirmação do Asaas':'Escolha um plano para testar a assinatura';
 return {paid,label,retryCreation:!uncertain&&!sub};
}
