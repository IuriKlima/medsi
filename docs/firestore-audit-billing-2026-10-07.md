# Auditoria Firestore — compra e cobrança — 07/10/2026

Base inspecionada: `8fd1cde`, branch `fix/regional-baseline-2026-10-06`. O escopo desta auditoria é compra, assinatura, pagador, webhook e conciliação. Não foi efetuada chamada externa, pagamento, migração de dados ou implantação.

## Resultado

Os RPCs de compra usados pelos controllers já possuem implementação nativa e registro na fachada Firestore. Não foi encontrado RPC legado ativo de compra que precisasse ser acrescentado à allowlist. Foi reproduzida e corrigida uma falha concreta: a confirmação tardia de cancelamento de uma assinatura antiga alterava `company_subscriptions/{companyId}` mesmo quando esse documento já representava uma assinatura substituta. Agora a confirmação finaliza somente o checkout, vínculo, journal e job antigos; a assinatura substituta é preservada.

O teste novo usa o `MemoryStore` já existente e é identificado como simulação. Antes da correção, falhou mostrando a assinatura substituta mudando de `pending` para `cancelled` e `provider_confirmed` mudando de `false` para `true`. Depois da correção, passou junto dos testes existentes. Isso comprova a regressão local, não a homologação do Firestore hospedado ou do Asaas.

## Matriz módulo → caminho → operação → estado

Os caminhos HTTP de compra abaixo têm o prefixo `/onboarding/companies/:id/purchase`. Os documentos usam o prefixo `medsi/v1`.

| Módulo | Caminho | Operação / persistência | Estado e evidência |
| --- | --- | --- | --- |
| `billing/controller.ts`, `firestore/onboarding.ts`, `firestore/commerce.ts` | `GET /purchase`, página da empresa | `company_purchase_state`; leitura de assinatura, onboarding, setup, grant e checkout da clínica | Nativo e registrado. `companyAccess` exige escopo; leitor não recebe histórico de compra. `firestore-checkout` cobre reload, isolamento, expiração e permissão. |
| `firestore/commerce.ts` | `POST /checkout`, `CHECKOUT_MODE=test` | `begin_test_checkout`; `company_test_checkouts/{requestId}`, `company_checkout_state/{companyId}` | Nativo e registrado. Catálogo e parcelas calculados no servidor, onboarding confirmado, `billing.manage`, cursor serializa requests diferentes. Simulação, sem criação de assinatura paga. |
| `firestore/commerce.ts` | `POST /checkout/confirm` | `complete_test_checkout_server`; `company_test_access/{companyId}` | Nativo e registrado. Somente service role, ator revalidado na transação, termos, prazo de 30 minutos e resultado imutável. Grant simulado de sete dias não se estende em retry. Bloqueado em produção e fora de `CHECKOUT_MODE=test`. |
| `firestore/journey.ts` | `POST /finish` | `finish_company_setup`; `company_setup/{companyId}` | Nativo e registrado; depende das aprovações versionadas da jornada. A compra não pula aprovações. Implementação de jornada fora das alterações desta auditoria. |
| `billing/asaas.ts` | `POST /billing/customer` | `provisionCustomer`; `company_billing_customer_requests`, `company_billing_customers` | Transação nativa, `billing.manage`, request com fingerprint; timeout permite consulta e não repete criação incerta. Fixtures de transporte existentes; nenhum pagador criado remotamente. |
| `billing/controller.ts`, `billing/asaas.ts`, `firestore/billing.ts` | `POST /checkout`, `CHECKOUT_MODE=asaas_sandbox` | `begin_asaas_checkout`, `attach_asaas_subscription_server`; checkouts, cursor, binding e assinatura | Nativos e registrados. POST externo fora da transação, request idempotente, preço e ciclo do servidor; somente pagamento integral por período no sandbox. Fixtures verificam um único POST e recuperação por referência externa. |
| `billing/asaas.ts` | `GET /billing` | Leitura direta pelo `DocumentStore`, após `companyAccess(...,'billing.manage')` | Nativo; subscription/checkouts pertencem ao cursor da clínica. Não depende de abrir coleções financeiras privadas em `readRows`. |
| `billing/asaas.ts`, `firestore/billing.ts` | `POST /billing/reconcile`, webhook e worker | `reserve_asaas_reconciliation_server`, `apply_asaas_snapshot_server`; bindings, eventos, snapshots e assinatura | Nativos e registrados. Geração reservada antes da consulta, snapshots atrasados ignorados, cliente/valor/assinatura/data validados; só `CONFIRMED`/`RECEIVED` compõem período pago. Fixtures cobrem estorno, evento antigo, expiração e duplicata. |
| `billing/asaas-controller.ts`, `billing/asaas.ts` | `POST /billing/asaas/webhook` | Token constante em tempo de comparação; journal `billing_provider_events` | Controller registrado em `AppModule`. Autenticação precede consulta externa; payload não concede acesso. Deleção autenticada da assinatura é terminal. Fixtures locais cobrem token, repetição e recurso removido. Entrega real não homologada. |
| `billing/asaas.ts`, `firestore/billing.ts` | `POST /billing/cancel`, webhook de deleção | `request_asaas_cancellation`, `confirm_asaas_cancellation_server` | Nativos e registrados. Solicitação não afirma cancelamento; exige resposta `{id,deleted:true}`. Corrigido o overwrite da assinatura substituta por resposta antiga. |
| `billing/reconciliation.ts`, `firestore/billing-queue.ts` | Worker Nest registrado em `AppModule` | `scheduleBillingReconciliation`, `claimBillingReconciliation`, `finishBillingReconciliation`; `billing_reconciliation_jobs/{subscriptionId}` | Nativo; não usa BullMQ nem RPC legado. Lease de três minutos, retomada após crash, token antigo recusado, backoff e bloqueio após oito tentativas cobertos em memória. |
| `firestore/client.ts`, `firestore/access.ts` | Consultas internas e capabilities | `company_subscriptions` com igualdade em `company_id` e `company.read`; catálogo para usuário autenticado | Allowlist já existente. `billing_*`, customers e grants não são consultas genéricas públicas. Nenhuma ampliação de readtable necessária. |
| `firestore/billing.ts`, `firestore/commerce.ts` | Decisão de acesso | `subscriptionEntitlement`, `purchaseState` | Sandbox só libera `accessMode=test` fora de produção e no modo explícito. Assinatura Asaas precisa de confirmação do provedor. Registro legado não Asaas mantém a compatibilidade existente; não é prova de pagamento homologado. |

## Comparação com SQL e destino

Referências locais: `202609270003_commerce_onboarding.sql` e o override de preços/parcelas `202609280001_pricing_semiannual.sql`. Os contratos ativos são `company_purchase_state`, `begin_test_checkout`, `complete_test_checkout_server` e `finish_company_setup`. Os dois primeiros migrations preservam histórico antigo; a oferta anual não pode iniciar um checkout novo. O caminho nativo preserva preço mensal de 159700 centavos, semestral de 800000 centavos, uma a seis parcelas na simulação, permissão de cobrança e idempotência. O teste SQL existente `commerce-onboarding.test.ts` também passou. Ele usa PGlite local, sem banco remoto.

Asaas é uma implementação adicional nativa de sandbox, sem equivalente SQL de pagamento real a transportar. Não foram inventadas novas rotas ou operações para demonstrar sucesso. Troca de plano pago, parcelamento Asaas e migração de assinaturas prévias continuam fora dos recursos implementados.

O alias CLI `.firebaserc` aponta para `medsi-80f4a`. O runtime de cobrança usa `firestoreStore()` → `firestoreDatabase()` → `firebaseAdmin()`, cujo projeto vem de `FIREBASE_PROJECT_ID`; o banco vem de `FIRESTORE_DATABASE_ID` ou `(default)`. Logo o alias sozinho não comprova o destino do processo implantado. Nenhuma credencial, variável real ou sessão remota foi usada nesta auditoria; a verificação do runtime hospedado pertence à auditoria de infraestrutura. Os testes aqui executados usam memória/PGlite, sem persistência em `medsi-80f4a`.

## Validação executada

Prefixo dos comandos: `COREPACK_HOME=/tmp/medsi-corepack XDG_DATA_HOME=/tmp/medsi-data corepack pnpm`.

- `exec vitest run tests/firestore-checkout.test.ts tests/firestore-billing.test.ts tests/asaas-billing.test.ts tests/asaas-controller.test.ts tests/asaas-customer.test.ts tests/asaas-billing-ui.test.ts tests/firestore-billing-jobs.test.ts tests/purchase-proxy.test.ts tests/commerce-onboarding.test.ts --maxWorkers=1`: **69 testes, nove arquivos, código 0**.
- `exec eslint apps/api/src/billing apps/api/src/platform/firestore/billing.ts apps/api/src/platform/firestore/billing-queue.ts apps/api/src/platform/firestore/commerce.ts tests/firestore-billing.test.ts`: **código 0**.
- `exec tsc -p apps/api/tsconfig.json --noEmit`: **código 0**.

A verificação integral `pnpm check` e o registro consolidado de progresso são responsabilidade da integração da branch compartilhada. Os resultados acima não são evidência de browser E2E ou execução Nest com infraestrutura hospedada.

## Limitações verificadas

- Homologação Asaas sandbox real continua pendente: credenciais seguras, pagador fictício, cobrança confirmada no provedor, webhook entregue, recuperação e cancelamento. Nenhuma chamada ao Asaas foi feita; produção continua bloqueada em `asaasSandboxEnabled` e pelo adaptador com endpoint sandbox fixo.
- A fila lista jobs por `environment=sandbox`. O `DocumentStore` recusa consultas com mais de 1000 resultados; portanto mais de 1000 jobs sandbox, inclusive terminais, exigem paginação/particionamento antes de escalar. O presente teste de leases não comprova esse volume nem a semântica de concorrência do Firestore remoto.
- A aplicação de snapshots permite até 1000 cobranças, mas não mede os limites remotos de tamanho/tempo de transação nem a latência de webhooks com históricos grandes. O journal filtra por assinatura e `status=pending`; índices/IAM/regras não foram implantados ou homologados.
- O worker consulta jobs já vinculados a uma assinatura. Criação incerta sem binding depende do retry explícito do mesmo request, que faz lookup sem novo POST. A resposta a cancelamento incerto exige nova consulta/solicitação ou webhook; não há prova remota de recuperação autônoma desses casos.
- Alertas para jobs bloqueados, restauração de backup, retenção e aprovação de políticas comerciais permanecem pendentes. O código não deve ser apresentado como autorização para dinheiro real.
