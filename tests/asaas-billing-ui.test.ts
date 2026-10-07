import {describe,expect,it} from 'vitest';
import {billingCheckoutInput,billingPresentation} from '../apps/web/lib/asaas-billing';
import type {AsaasBillingState} from '@askadia/contracts';
const pending:AsaasBillingState={companyId:'clinic',environment:'sandbox',customerConfigured:true,checkout:null,subscription:{company_id:'clinic',plan_id:'askadia_monthly',provider:'asaas',environment:'sandbox',status:'pending',provider_confirmed:true,provider_subscription_id:'sub_fixture',current_period_end:null}};
describe('Sandbox billing customer presentation',()=>{
 it('uses integral period amounts for sandbox plans instead of legacy six installments',()=>{expect(billingCheckoutInput('askadia_semiannual','stable-id')).toEqual({requestId:'stable-id',planId:'askadia_semiannual',installments:1});});
 it('does not call an active but unconfirmed subscription a confirmed payment',()=>{expect(billingPresentation({...pending,subscription:{...pending.subscription!,status:'active',provider_confirmed:false}}).paid).toBe(false);expect(billingPresentation({...pending,subscription:{...pending.subscription!,status:'active',provider_confirmed:true,current_period_end:'2999-01-01T00:00:00Z'}}).paid).toBe(true);});
 it.each(['pending','expired','cancelled'])('shows %s state without claiming payment or live access',status=>{const view=billingPresentation({...pending,subscription:{...pending.subscription!,status}});expect(view.paid).toBe(false);expect(view.label.length).toBeGreaterThan(5);expect(view.label).not.toContain('ao vivo');});
 it('does not offer a second subscription creation for an uncertain checkout',()=>{const view=billingPresentation({...pending,subscription:null,checkout:{id:'request',company_id:'clinic',plan_id:'askadia_monthly',status:'uncertain',total_cents:159700,provider_subscription_id:null}});expect(view.retryCreation).toBe(false);expect(view.label).toContain('conciliação');});
});

import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {vi} from 'vitest';
import {AsaasBillingPanel} from '../apps/web/components/asaas-billing-panel';
const webRequire=createRequire(resolve('apps/web/package.json'));
const React=webRequire('react'),{renderToStaticMarkup}=webRequire('react-dom/server');
vi.stubGlobal('React',React);
describe('Sandbox subscription controls rendered from persisted server state',()=>{
 it('offers provider invoice, reconciliation and cancellation without browser approval',()=>{const html=renderToStaticMarkup(React.createElement(AsaasBillingPanel,{companyId:'clinic',initialState:{...pending,subscription:{...pending.subscription!,invoice_url:'https://sandbox.asaas.com/i/fixture'}}}));expect(html).toContain('Abrir pagamento no sandbox');expect(html).toContain('Consultar pagamento');expect(html).toContain('Cancelar assinatura');expect(html).not.toContain('Simular pagamento aprovado');});
 it('shows billing fields and full-period terms before a new provider checkout',()=>{const html=renderToStaticMarkup(React.createElement(AsaasBillingPanel,{companyId:'clinic',plan:'askadia_semiannual',initialState:{...pending,customerConfigured:false,subscription:null}}));expect(html).toContain('CPF ou CNPJ do pagador');expect(html).toContain('Confirmo');expect(html).toContain('pagamento integral');expect(html).not.toContain('6x');});
});
