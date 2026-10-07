# Configuração explícita e verificação de modelos

Os nomes históricos exportados em `agentModelDefaults` servem apenas para identificar a configuração anterior; não são usados como fallback nem comprovam acesso na conta. `agentModel(role)` exige um ID explicitamente configurado. A preferência comercial “SOL 6.0” não é convertida em ID de API.

Para análise/diagnóstico configure `OPENAI_MODEL_ANALYSIS` com o ID escolhido e confirmado pela operação. Essa variável precede `OPENAI_MODEL_STRATEGY`, preservado como alias de configuração. Os demais papéis usam `OPENAI_MODEL_ORCHESTRATOR`, `OPENAI_MODEL_SITE`, `OPENAI_MODEL_ADS`, `OPENAI_MODEL_COPY`, `OPENAI_MODEL_CHAT`, `OPENAI_MODEL_SEARCH`, `OPENAI_MODEL_ATTENDANCE` e `OPENAI_MODEL_IMAGE`. Valores são resolvidos no momento da chamada. Nenhuma variável ou chave foi configurada nesta execução.

`agentModelsConfigured(...roles)` exige chave presente e IDs explícitos válidos para todos os papéis pedidos; isso indica presença de configuração, não disponibilidade verificada. Flags de funcionalidades devem combinar esse resultado com os demais pré-requisitos existentes. Sem papel configurado, a geração falha de forma explícita antes de enviar um pedido ao provedor.

`preflightOpenAIModels({roles})` oferece verificação explícita somente de leitura, com GET fixo em `https://api.openai.com/v1/models`, timeout de dez segundos, sem redirecionamentos ou tentativas automáticas. Usa o mesmo contexto `OPENAI_ORG_ID`/`OPENAI_PROJECT_ID` suportado pelo SDK instalado. Não roda no import/startup; sem chave ou sem IDs configurados não faz chamada. A resposta expõe somente os IDs configurados, estados e data da coleta; não expõe chave, organização/projeto, corpo de falha ou exceções do provedor. Estados por papel: unconfigured, unverified, listed, missing. Falhas: unauthorized (401/403), rate_limited (429), provider_unavailable e invalid_response.

A [documentação oficial da listagem de modelos](https://developers.openai.com/api/reference/resources/models/methods/list) descreve a operação de listagem. Um ID listado não comprova compatibilidade com Responses, saídas estruturadas, reasoning, busca web, geração/edição de imagens, tamanhos, qualidade ou quotas. Esses recursos precisam de homologação separada autorizada; preflight não gera conteúdo ou valida preços.

## Evidência local

`node node_modules/vitest/vitest.mjs run tests/model-preflight.test.ts --maxWorkers=2`: nove testes com fixtures e fetch injetado, sem provedores reais. Cobrem configuração tardia, alias de análise, ausência de fallback, chave sem IDs, ausência de chave, IDs listados/ausentes, contexto de projeto, 401/403/429/5xx, resposta malformada, timeout e redação de falhas.

Lint focado e typecheck da API aprovados. Na primeira verificação de 31 testes relacionados, 30 passaram e uma fixture antiga de inbox dependeu do fallback implícito de attendance: foi corrigida para informar `OPENAI_MODEL_ATTENDANCE` explicitamente no teste.

## Pendências externas

Operação deve configurar IDs pelo canal seguro e executar preflight no ambiente de teste autorizado. Nesta sessão não houve consulta real à conta, validação de modelos disponíveis, aferição de custos ou geração com provedor. A preferência SOL será atendida quando houver ID real disponível escolhido para análise. Não há afirmação de disponibilidade dos nomes históricos.

CLI reproduzível: `corepack pnpm ai:models:check`. Sem credenciais/IDs não faz chamada; código de saída 2 indica configuração ou listagem incompleta. A execução real cabe ao operador no ambiente autorizado.
