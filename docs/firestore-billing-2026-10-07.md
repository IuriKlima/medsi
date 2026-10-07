# Cobrança Firestore / Asaas — 07/10/2026

## Entrega e evidência

Implementado e testado com fixtures isoladas: cadastro de pagador sandbox, criação de assinatura recorrente, conciliação, confirmação por estado do provedor, isolamento por clínica, autorização de cobrança, autenticação do webhook, repetição/concorrência/ordem dos eventos, resultado incerto de criação, cancelamento e expiração. Nenhuma chamada autenticada ao Asaas foi executada nesta implementação. Isso não comprova homologação sandbox, faturamento real nem autorização para dinheiro real.

Comandos executados a partir da raiz:

```sh
node node_modules/vitest/vitest.mjs run tests/firestore-checkout.test.ts tests/firestore-billing.test.ts tests/asaas-billing.test.ts tests/asaas-controller.test.ts tests/asaas-customer.test.ts tests/asaas-billing-ui.test.ts tests/firestore-billing-jobs.test.ts tests/purchase-proxy.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js apps/api/src/billing apps/api/src/platform/firestore/billing.ts apps/api/src/platform/firestore/commerce.ts tests/asaas-customer.test.ts tests/asaas-billing.test.ts tests/asaas-controller.test.ts tests/firestore-billing.test.ts tests/firestore-checkout.test.ts
```

Resultado: 61 testes em oito arquivos passaram; lint focado e tipos da API passaram. As fixtures HTTP substituem somente o transporte externo: exercitam adaptador, autenticação, paginação, orquestração e transações reais do módulo com `MemoryStore`. Firestore hospedado/IAM/regras e Asaas sandbox continuam pendentes de homologação independente. A verificação completa do monorepo é responsabilidade da integração da branch.

## Configuração controlada

Use as variáveis já existentes: `DATABASE_PROVIDER=firestore`, `CHECKOUT_MODE=asaas_sandbox`, `ASAAS_ENVIRONMENT=sandbox`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_AUTH_TOKEN`; `NODE_ENV` deve ser diferente de `production`. Os dois segredos devem ser configurados pelo canal seguro do ambiente. Não use a chave da API como token de webhook. Nenhuma chave é enviada ao navegador.

O adaptador fixa `https://api-sandbox.asaas.com/v3`. Não existe seleção de endpoint de dinheiro real por variável de ambiente. A integração em produção permanece bloqueada; exige adaptador aprovado, homologação, políticas comerciais e autorização específica. A simulação existente continua disponível somente em `CHECKOUT_MODE=test`, fora de produção. Uma aprovação simulada não concede acesso quando esse modo é desabilitado.

Na integração Nest, registre `AsaasBillingWebhookController` e o provider `AsaasBillingReconciliationWorker` em `AppModule`. Na fachada Firestore, inclua `billingOperations` na allowlist e encaminhe esses nomes para `billingRpc`. Para capabilities use `subscriptionEntitlement(subscription).live`; compras sandbox possuem acesso de teste explicitamente limitado ao ambiente.

## Jornada e endpoints

Todos os endpoints de compra usam a sessão existente e verificam `billing.manage` no servidor e na transação:

1. Confirme o onboarding.
2. `POST /onboarding/companies/:id/purchase/billing/customer` com `{name,cpfCnpj,email?,mobilePhone?}`. Em sandbox use somente uma clínica/pagador fictício. A criação envia `notificationDisabled:true` ao Asaas. Nunca colete dados de pacientes. CPF/CNPJ aceitam 11/14 dígitos; a validade fiscal final é verificada pelo provedor. O Firestore guarda ID do provedor e fingerprint da solicitação, sem guardar campos pessoais brutos.
3. `POST /onboarding/companies/:id/purchase/checkout` com `{requestId,planId,installments:1}`. IDs e preços vêm do catálogo do servidor. O ciclo é mensal ou semestral integral. Parcelamento acima de uma parcela está explicitamente indisponível no sandbox deste adaptador. A resposta é `{companyId,environment,subscription,checkout}`; a URL de pagamento, quando emitida pelo provedor, está em `subscription.invoice_url`/`checkout.invoice_url`.
4. `GET /onboarding/companies/:id/purchase/billing` retoma a cobrança persistida. `GET /purchase` informa `asaasSandboxEnabled` além da regra de acesso existente.
5. `POST /onboarding/companies/:id/purchase/billing/reconcile` consulta o estado atual no Asaas e atualiza a assinatura. Redirecionamento do navegador e `/checkout/confirm` não confirmam cobrança Asaas.
6. `POST /onboarding/companies/:id/purchase/billing/cancel` solicita remoção da recorrência em sandbox. Somente a resposta autenticada `{id,deleted:true}` confirma cancelamento. Uma falha mantém `cancellation_requested` para recuperação; não afirma que o provedor cancelou.

Configure pelo painel do Asaas o webhook `POST /billing/asaas/webhook`, com token próprio no header `asaas-access-token`, e eventos de assinatura/cobrança. A configuração desse painel não foi executada. O endpoint autentica antes de ler eventos ou fazer chamadas externas; devolve HTTP 200 após conciliação bem-sucedida ou repetição já aplicada. A remoção irreversível `SUBSCRIPTION_DELETED`, recebida com token válido e vinculada à assinatura conhecida, confirma cancelamento sem consultar novamente um recurso removido. Um erro continua reexecutável pelo provedor. Webhooks usam a consulta atual da assinatura e das cobranças: o corpo do evento nunca concede acesso.

A interface de aquisição e a tela Plano usam o painel sandbox compartilhado, com cadastro de pagador fictício, valor integral explícito, consentimento, URL de pagamento emitida pelo Asaas, consulta e cancelamento. CPF/CNPJ ficam somente no formulário durante o envio; não há localStorage, logs de campos ou confirmação de pagamento no navegador. A ponte autenticada Next permite apenas as rotas exatas acima e preserva proteção de origem/sessão. A simulação de sete dias conserva a interface anterior.

## Persistência e decisões

Coleções internas sob `medsi/v1`: `company_billing_customers`, `company_billing_customer_requests`, `company_billing_checkouts`, `company_billing_checkout_state`, `billing_subscription_bindings`, `billing_provider_events`, `billing_payment_snapshots`, `billing_reconciliation_jobs` e `company_subscriptions`. Todas as gravações passam por transação administrativa e vínculos da clínica; acesso direto do cliente deve permanecer negado. Consultas usam predicados de igualdade; o journal pendente filtra assinatura e status para não reler todo o histórico. Confirme os índices necessários, IAM e regras na homologação.

Criação de cliente/assinatura possui uma única transição atômica que permite o POST. Após timeout ou reinício no estado `submitting`/`uncertain`, uma nova chamada faz somente consulta por `externalReference`. Zero resultados não autoriza outro POST: aguarde conciliação. Múltiplos resultados exigem intervenção; não selecione o primeiro. Requests não armazenam tokens, respostas completas do provedor nem CPF/CNPJ brutos.

Cada evento tem ID único e hash do payload; reutilização do ID com conteúdo/vínculo diferente falha. Uma geração reservada antes da consulta impede que uma resposta lenta sobrescreva uma conciliação posterior. Eventos pendentes são aplicados quando uma nova conciliação confiável da mesma assinatura termina. A remoção confirmada da assinatura é terminal e invalida snapshots anteriores.

Só `CONFIRMED`/`RECEIVED`, valor bruto correspondente, cliente e assinatura vinculados e data válida geram período pago. Cobrança futura vencida não remove um período já pago; estorno/chargeback não contam como pagamento. O fim do período é calculado a partir da data de vencimento do ciclo, com meses UTC e ajuste para o último dia do mês, nunca a partir da chegada do webhook. Pagamento antecipado pode liberar o período comprado imediatamente; não existe tolerância automática de inadimplência. Cancelamento confirmado interrompe o acesso imediatamente. Um período pago expirado com recorrência ainda ACTIVE deve ser cancelado antes de uma nova assinatura; eventos de uma assinatura substituída não alteram a nova assinatura. Essas políticas são explícitas e devem ser aprovadas comercialmente antes de venda.

Sandbox confirmado pode liberar somente `accessMode=test`, dentro de `asaas_sandbox` fora de produção. Assinaturas Asaas sem `provider_confirmed:true` não liberam acesso. Os fixtures legados de assinatura não Asaas permanecem compatíveis; não devem ser usados como prova de faturamento.

## Falhas e operação

Em erro 401/403 confirme configuração pelo canal seguro. Em 429/5xx/timeout mantenha o estado e execute conciliação com backoff operacional; não repita POST de criação. Não registre corpo da resposta nem headers. Revise `billing_provider_events.status=pending` e solicitações `status=uncertain`. Não substitua estados por edição manual para liberar acesso. Se o processamento foi interrompido, uma nova entrega ou o endpoint de conciliação recupera o estado atual. A paginação é limitada a mil cobranças e falha explicitamente quando excedida, sem truncar evidências.

O provider `AsaasBillingReconciliationWorker` segue os executores Nest de negócio existentes na API; o processo BullMQ não consome estes jobs. Leases transacionais de três minutos impedem duas réplicas de consumir simultaneamente a mesma assinatura e permitem recuperação após reinício. Pagamentos pendentes são conciliados a cada cinco minutos, assinaturas pagas a cada hora; falhas usam backoff de um minuto até uma hora e bloqueiam após oito tentativas, inclusive crashes repetidos. Estados `blocked` são visíveis em `billing_reconciliation_jobs`; uma nova entrega do webhook reabre a conciliação. `ASAAS_RECONCILIATION_ENABLED=false` pausa esse executor de sandbox. Alertas operacionais para estado bloqueado/fila do Asaas pausada ainda precisam ser configurados pelo responsável do ambiente. O webhook faz conciliação síncrona com timeout de 12 segundos por request; históricos grandes exigem medir latência na homologação e eventualmente migrar o recebimento ao consumo assíncrono existente. Não há evidência de desempenho remoto.

Antes de habilitar o ambiente de teste, confirme restauração de backup Firestore para projeto separado e execute a matriz com duas clínicas fictícias. Para rollback, desabilite `asaas_sandbox` e mantenha documentos/journal para conciliação posterior; não remova as coleções nem reative cobranças automaticamente. Snapshot/backup e retenção fiscal/LGPD precisam de política aprovada pelo responsável do ambiente.

## Homologação pendente

Responsável do ambiente deve fornecer configuração segura, habilitar o webhook sandbox e executar: pagador → checkout → pagamento sandbox confirmado → reload → entrega duplicada → evento antigo após estorno → expiração → cancelamento → timeout/reconciliação, além de negar acesso da outra clínica. Registre IDs fictícios, datas, respostas redigidas e resultados. Nenhuma compra ou transação real está autorizada. Dinheiro real, parcelamento, troca de plano, migração de assinaturas prévias e confirmação das políticas comerciais continuam pendentes de implementação/homologação específica.

Referências oficiais consultadas em 07/10/2026: [clientes](https://docs.asaas.com/reference/criar-novo-cliente), [listagem de clientes](https://docs.asaas.com/reference/listar-clientes), [criação de assinatura](https://docs.asaas.com/reference/criar-nova-assinatura), [listagem de assinaturas](https://docs.asaas.com/reference/listar-assinaturas), [cobranças da assinatura](https://docs.asaas.com/reference/listar-cobrancas-de-uma-assinatura), [remoção](https://docs.asaas.com/reference/remover-assinatura), [webhooks/autenticação/idempotência](https://docs.asaas.com/docs/sobre-os-webhooks).
