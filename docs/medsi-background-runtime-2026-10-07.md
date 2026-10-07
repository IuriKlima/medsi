# Runtime de background MedSI — 07/10/2026

Implementação local, sem ativação de provedores ou deploy. O worker reutiliza as classes e os contratos duráveis já usados pela API. Não há segunda fila BullMQ, cópia de regras de negócio, novo scheduler ou nova política de retry. O antigo registro Redis não consumia tarefas; foi substituído pelo runner compartilhado.

## Propriedade da execução

`BACKGROUND_EXECUTOR=api` é o padrão e preserva os 13 processadores na API. `BACKGROUND_EXECUTOR=worker` transfere 11 processadores ao worker; `InboxAutomation` e `CampaignDelivery` continuam na API. Seus endpoints de ativação verificam `lastPoll` no próprio processo, portanto movê-los agora bloquearia a jornada. Transferir esses dois exige heartbeat entre processos validado em uma etapa posterior.

`BACKGROUND_EXECUTOR=disabled` desliga todos os 13, inclusive os dois de mensagens. O seletor deve ser igual em todos os processos e réplicas. Valores desconhecidos falham no início. A API não verifica a presença remota do worker; configurar um executor e não iniciá-lo deixa suas tarefas pendentes. Leases continuam protegendo réplicas e transições, mas não substituem configuração operacional consistente.

`WORKER_MODE=disabled` é o padrão do worker. `dry-run` apenas lista configuração e propriedade; nenhum dos dois constrói processadores, abre banco, consulta filas ou chama provedores. `enabled` exige também `BACKGROUND_EXECUTOR=worker` e mantém todos os gates individuais existentes. Configurar ownership não habilita flags dos provedores. O worker continua recusando qualquer `NODE_ENV=production`, inclusive dry-run. O guard de produção/Firestore da API permanece intacto.

## Inventário dos handlers existentes

Em todas as linhas, o banco configurado e as autorizações dentro do domínio continuam necessários; configuração não comprova acesso, conectividade ou homologação. Os nomes `*_server` abaixo são os mesmos contratos RPC da camada de banco, implementados pelos domínios nativos quando Firestore é selecionado.

| Handler / classe | Claim e conclusão existentes | Gate inicial existente | Owner quando seletor=worker |
|---|---|---|---|
| `billing-reconciliation` / `AsaasBillingReconciliationWorker` | `claimBillingReconciliation` / `finishBillingReconciliation`, transações em `billing_reconciliation_jobs` | Firestore, `CHECKOUT_MODE=asaas_sandbox`, `ASAAS_ENVIRONMENT=sandbox`, chave Asaas, ambiente não produção e `ASAAS_RECONCILIATION_ENABLED` diferente de false | worker |
| `social-publication` / `SocialPublicationWorker` | `claim_social_publication_server` / `finish_social_publication_server`; context, guard e step de publicação | Firestore, `INSTAGRAM_PUBLICATION_ENABLED=true`, vault e versão Graph válida | worker |
| `regional-research` / `RegionalResearchWorker` | `claim_regional_research_server` / `progress_regional_research_server` / `finish_regional_research_server` | `REGIONAL_RESEARCH_ENABLED=true` e banco | worker |
| `competitor-research` / `CompetitorResearchWorker` | `claim_competitor_research_server` / `finish_competitor_research_server` | `CONTENT_AUTOPREP_ENABLED` diferente de false, chave OpenAI e modelo search explícito | worker |
| `ad-preparation` / `AdPreparationWorker` | `claim_ad_execution_server` com mode prepare / `finish_ad_execution_server`; fallback existente `prepareAutomaticPaidPlan` | `ADS_EXECUTION_ENABLED=true`, banco e vault | worker |
| `ad-execution` / `AdExecutionWorker` | `claim_ad_execution_server` com mode execute / `finish_ad_execution_server`; context, guard e `ad_step_server` | `ADS_EXECUTION_ENABLED=true`, banco e vault | worker |
| `visual-jobs` / `VisualJobs` | `claim_visual_job_server` / `finish_visual_job_server` | `VISUAL_JOBS_ENABLED` diferente de false; chave OpenAI e modelo image explícito | worker |
| `instagram-monitor` / `InstagramMonitor` | `claim_instagram_watch_server` / `finish_instagram_watch_server` | `INSTAGRAM_MONITOR_ENABLED=true`, banco, vault e versão Graph | worker |
| `launch-and-site-preparation` / `LaunchPreparation` | `claim_company_launch_server` / `finish_company_launch_server`; fallback nativo `claim_company_site_server` / `finish_company_site_server` | `CONTENT_AUTOPREP_ENABLED` diferente de false; chave OpenAI e modelo orchestrator ou site explícito | worker |
| `content-preparation-and-production` / `ContentPreparation` | `claim_content_preparation_server` / `finish_content_preparation_server`; fallback nativo `claim_content_production_server` / `finish_content_production_server` | `CONTENT_AUTOPREP_ENABLED` diferente de false; chave OpenAI e modelos strategy/analysis, copy e image explícitos | worker |
| `image-descriptions` / `ImageDescriptions` | `claim_image_description_server` / `finish_image_description_server` | `IMAGE_DESCRIPTIONS_ENABLED=true`, banco e Gemini | worker |
| `campaign-delivery` / `CampaignDelivery` | `claim_message_campaign` / `prepare_message_campaign` / `finish_message_campaign` | `MESSAGE_CAMPAIGNS_ENABLED=true`; WhatsApp Cloud em Firestore, configuração Evolution no backend legado | API |
| `inbox-automation` / `InboxAutomation` | `inbox_auto_targets`, `inbox_auto_claim`, `inbox_auto_prepare`, `inbox_auto_finish`; observação humana e opt-out existentes | `INBOX_AUTOMATION_ENABLED=true`, banco e configuração Cloud ou Evolution | API |

Os gates são herdados, não ampliados nesta entrega. Por exemplo, a configuração inicial do handler de ads não comprova OAuth, conta, orçamento ou aprovação; os passos existentes os verificam depois do claim. O runner não altera elegibilidade nem cria autorizações. Serviços de API síncronos e fluxos que não estavam nesses 13 pollers continuam em seus endpoints existentes.

## Durabilidade, retry e cancelamento

O runner apenas inicia e encerra os ciclos existentes. Tokens de lease, `next_attempt_at`, número de tentativas, versão de perfil, versão aprovada, revisão da peça, empresa e permissões continuam nos contratos claim/finish e nas transações dos domínios. Não há ACK BullMQ adicional nem replay de payload no worker. Falha de provedor continua sendo reportada pelo handler ao finish de seu próprio domínio; reinício recupera leases expiradas conforme a implementação existente.

Publicação e ads reutilizam guards antes dos passos externos e registros duráveis de passos/reconciliação; envio incerto não recebe um retry genérico novo. Mensagens continuam revalidando canal, janela/consentimento e preparação imediatamente antes do envio. Resultados atrasados continuam sujeitos ao finish com token/revisão, e uma aprovação revogada não é restaurada pelo runner.

No shutdown todos os timers são cancelados antes de aguardar qualquer job. As promises dos ticks são rastreadas; o runner aguarda conclusão/falha e só então fecha PostgreSQL, termina os clientes Firestore obtidos por este processo e remove a aplicação Firebase MedSI já inicializada. O fechamento não cria clientes, credenciais ou aplicações e não remove aplicações Firebase de outros nomes. Não agenda outro tick após a parada. Encerrar o processo não cancela uma ação já aceita pelo provedor; chamadas em voo são drenadas, não abortadas. A plataforma de hospedagem deve conceder tempo suficiente para a drenagem. SIGKILL/perda do processo continua dependendo das leases e da reconciliação existentes; não foi feito ensaio remoto de encerramento.

A paginação nativa de atendimento e campanhas usa o envelope opcional `p_paginated=true`: `{targets,hasMore}` / `{job,hasMore}`. Havendo continuação, o próximo poll ocorre após 1 segundo; ao concluir a rodada retorna ao intervalo ocioso de 15 segundos. O contrato SQL e chamadas Firestore sem a opção preservam seus retornos antigos. Não houve ampliação silenciosa da janela de atendimento ou da programação aprovada. Fixtures cobrem 1.001 configurações de atendimento, campanhas inelegíveis e continuação de 41 páginas no relógio simulado; isso não é promessa de latência para escala arbitrária, banco remoto ou provedores lentos.

## Saúde e execução local segura

`/health` do worker, em loopback, informa `mode`, `executor`, `processing`, `verification=configuration-only` e cada handler com `owner`, `configured` e `polling`. `polling=true` significa ciclo iniciado localmente, não claim bem-sucedido, banco acessível ou provedor homologado. `processing=false` com status idle significa nenhum handler configurado para este processo. A API inclui a mesma informação em `backgroundExecution`. Nenhum segredo, payload ou token é retornado.

Builds do worker compilam primeiro a API para resolver `@askadia/api/background`. Desenvolvimento do worker também compila a API antes de iniciar; alterações nas fontes da API exigem recompilar/reiniciar esse processo. A dependência é um link workspace, sem nova biblioteca externa. A API continua iniciando por `dist/main.js`; o worker por seu próprio `dist/main.js`.

Com dependências instaladas, os comandos abaixo não habilitam nenhuma execução de jobs. Usar ambiente local sem credenciais reais para inspeção. `dry-run` não consulta banco/provedores, mesmo se houver configuração presente:

```sh
pnpm --filter @askadia/worker build
BACKGROUND_EXECUTOR=disabled WORKER_MODE=disabled pnpm --filter @askadia/worker start
# Em outra execução, após encerrar a anterior:
BACKGROUND_EXECUTOR=worker WORKER_MODE=dry-run pnpm --filter @askadia/worker start
```

O segundo comando de execução é somente a inspeção do processo worker. Não iniciar uma API configurada para execução habilitada como parte deste teste; os dois handlers de mensagem continuam API-owned. Nenhum comando de ativação real é proposto aqui.

## Validação e limites

`background-runtime.test.ts` cobre exclusão de ownership, configuração inválida, nenhuma instanciação em disabled/dry-run, startup parcial com falha, cancelamento de timers e drenagem antes do fechamento do banco. `background-worker.test.ts` verifica as 13 classes reais, divisão 11/2, readiness de mensagens na API em modo worker, bloqueio de produção e execução do handler real de conteúdo usando RPC/provedor fictícios, inclusive erro e shutdown em voo.

As suites existentes de site/conteúdo, cobrança, mensagens, ads e publicação continuam responsáveis pelos contratos de tenant, idempotência, retry, revisão e cancelamento dos domínios. Testes locais não homologam provedores, disponibilidade do banco, distribuição em múltiplos hosts, quotas, throughput ou política de encerramento do ambiente hospedado. A mudança não implementa um scheduler de tarefas de negócio ainda inexistentes, métricas externas, sincronização de insights, heartbeat compartilhado de mensagens ou hosting/DNS de sites.

Validação executada nesta etapa: 13 arquivos / **124 testes passando**, incluindo runtime, cleanup, Nest, filas paginadas, atendimento, campanhas, conteúdo, site, Asaas, ads e publicação; TypeScript compilou API e worker; lint dos arquivos do runtime passou. Smoke do artefato compilado usa diretório temporário sem `.env`, ambiente mínimo sem credenciais e chamadas HTTP apenas a loopback: disabled/dry-run retornam 13 handlers e `processing=false`, SIGTERM encerra com código 0; produção é recusada com código 1. A verificação completa `pnpm check` é registrada no relatório geral da etapa.
