# MedSI — runbook do ambiente privado de teste

Esta entrega prepara o deploy que Iuri fará. Nenhum comando remoto foi executado. Produção Firestore continua bloqueada; deploy privado de teste e testes de provedor não autorizam dinheiro, pacientes, publicação pública ou mudança de segurança.

## 1. Instalação e reprodução

1. Conferir branch/SHA e `git status`; preservar qualquer mudança local. Não usar reset destrutivo.
2. Usar Node >=22.12 (verificado aqui em 24.19), pnpm **10.33.0**. Na raiz: `corepack pnpm install --frozen-lockfile`, `corepack pnpm check`.
3. Neste container o diretório home não era gravável. Alternativa reproduzida: `COREPACK_HOME=/tmp/medsi-corepack XDG_DATA_HOME=/tmp/medsi-data corepack pnpm install --frozen-lockfile --store-dir /tmp/medsi-pnpm-store`; usar o mesmo prefixo para `check`.
4. `pnpm check` executa lint, compilação de contracts/integrations, tipos, testes e builds API/worker/web. Os testes usam dados fictícios; não configurar credenciais reais para rodá-los.
5. API, web e worker existentes: `corepack pnpm dev` para desenvolvimento. API em 127.0.0.1:4000, web em 3000. Usar reverse proxy privado autorizado no ambiente de teste para callbacks HTTPS. `NODE_ENV=production` continua recusando Firestore deliberadamente; não alterar o guard para iniciar.

## 2. Configuração segura, sem chaves no chat/git

Usar o gestor de segredos do ambiente autorizado. `.env.example` só lista nomes e exemplos inofensivos. Não enviar valores por chat, abrir dumps de ambiente, versionar `.env`, gerar uma nova chave AES-GCM para substituir uma existente ou conceder IAM nesta etapa.

| Grupo | Nomes / configuração necessária |
|---|---|
| Banco / Auth | `DATABASE_PROVIDER=firestore`, `FIREBASE_PROJECT_ID`, banco identificado por `FIRESTORE_DATABASE_ID`, aplicação Firebase/Auth existente e credencial administrativa da identidade de execução |
| Web / API | `WEB_ORIGIN`, `API_INTERNAL_URL`; domínio HTTPS privado autorizado, mesmas origens/cookies/callbacks. Revisar configurações Firebase web existentes no guia do projeto |
| Arquivos | `FIREBASE_STORAGE_BUCKET` privado já criado; leitura/escrita/signing sob IAM mínimo autorizado. Não tornar público o bucket |
| Vault | `SECRETS_ENCRYPTION_KEY` existente; 64 hex; preservar criptografia com tenant como AAD |
| IA | `OPENAI_API_KEY` e IDs **explicitamente validados**: ANALYSIS/STRATEGY, ORCHESTRATOR, COPY, CHAT, SEARCH, SITE, ADS, ATTENDANCE, IMAGE. Prefixo completo `OPENAI_MODEL_`. `OPENAI_MODEL_ANALYSIS` precede STRATEGY. A preferência SOL não é ID inferido |
| Pesquisa | `SERPAPI_API_KEY`, `GOOGLE_PLACES_SERVER_KEY` para consultas transitórias; quotas de chamadas; IBGE/Overpass públicos com timeout/limite de respostas |
| Asaas | `CHECKOUT_MODE=asaas_sandbox`, `ASAAS_ENVIRONMENT=sandbox`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_AUTH_TOKEN`. Nunca mudar para ambiente real para testar |
| Meta | App existente/versão Graph, redirect HTTPS, scopes oficiais e conta/Página profissional escolhidas; vault por empresa. Não pedir tokens ao usuário no frontend |
| WhatsApp oficial | `WHATSAPP_CLOUD_CREDENTIALS_JSON` (mapa de tenant para credencial oficial no servidor), segredo/verificação do webhook conforme `medsi-attendance-firestore.md`; número/WABA e assinatura verificados. Não usar BAILEYS como substituto oficial |
| Ads | OAuth/versão/token de desenvolvedor Google Ads ou conta Meta autorizada; teto de verba explícito. Flags desligadas até teste controlado |
| Site | Modelo SITE; domínio/plataforma/EasyPanel/DNS e HTTPS autorizados. Geração não publica nem provisiona domínio automaticamente |

`corepack pnpm ai:models:check` executa GET de listagem de modelos somente quando chave/IDs estiverem presentes; sem configuração retorna estados `unconfigured`, sem chamada. A listagem comprova visibilidade, não compatibilidade com Responses/Zod/reasoning/busca/imagens nem preço. Após listagem, executar cada papel com orçamento pequeno explicitamente autorizado e anotar model/response ID/resultado, sem dados de pacientes.

## 3. Banco / migração e permissões

- Namespace nativo: `medsi/v1/<coleção>/<id>`. Coleções e RPCs em `medsi-firestore-operations.json` e guias de domínio. Não executar migrações SQL como substituto de Firestore.
- `firebase:firestore:check` é leitura; `firebase:firestore:apply --project=<FIREBASE_PROJECT_ID>` escreve somente o seed ausente e exige correspondência explícita com o projeto do `.env`. Projeto e banco são configuráveis; não há mais projeto antigo fixo no código. `node scripts/bootstrap-firestore.mjs --plan` mostra o plano sem autenticar nem acessar a rede. Escrita exige autorização; seed de catálogo não conclui migração nem libera produção.
- Regras existentes negam leitura/escrita direta do cliente. Admin SDK ignora essas regras; a autorização também depende da API, transações e IAM. Não ampliar regras/roles para contornar falhas.
- Queries nativas geralmente usam igualdade por tenant ou status e ordenam o resultado no servidor. Conferir índices realmente necessários no ambiente de teste; limites atuais de consulta são 1.000 documentos e de documento 800 KB. Não há teste de carga que aprove esses limites em produção.
- TTL/retention e exclusão de arquivos órfãos dependem de política operacional aprovada. Mensagens oficiais filtram expiração na leitura; gravar `expires_at` não cria TTL automaticamente.

## 4. Executores e ativação gradual

A API Nest é o único executor das filas de estratégia, produção de conteúdo, pesquisa, visuais, site, atendimento, Asaas e execução/publicação. BullMQ/worker existente não ganhou um consumidor duplicado dessas mesmas tarefas. Réplicas da API devem compartilhar Firestore e suas leases.

Começar com `CONTENT_AUTOPREP_ENABLED=false`, `VISUAL_JOBS_ENABLED=false`, `REGIONAL_RESEARCH_ENABLED=false`, `INSTAGRAM_MONITOR_ENABLED=false`, `INBOX_AUTOMATION_ENABLED=false`, `MESSAGE_CAMPAIGNS_ENABLED=false`, `ADS_EXECUTION_ENABLED=false`, `INSTAGRAM_PUBLICATION_ENABLED=false`, `ASAAS_RECONCILIATION_ENABLED=false`. Flags indicam autorização operacional somente após revisão; não habilitar envio/publicação/anúncios como efeito de um teste de cadastro.

Sequência recomendada de homologação:

1. Duas clínicas fictícias, dois usuários e tenant distintos. Login/email verificado, cadastro, reload, anexos privados e tentativa de acesso cruzado. Revogar membro e repetir leitura/arquivo/job.
2. Asaas sandbox: cadastro de cliente fictício permitido pelo provedor, checkout pendente, pagamento sandbox, webhook com token inválido, eventos duplicados/fora de ordem, cancelamento e período expirado. Confirmar que sandbox nunca habilita acesso live; estado não depende do redirect.
3. Pesquisa: ativar apenas fontes/quotas aprovadas; conferir município/ano, tabela 9514, `RELATED_QUERIES`/BR-UF/3 meses, vazio/401/403/429/5xx/timeout. Conferir atribuição e confirmação do pin. Não persistir lote de detalhes Places.
4. Modelos: testar análise, copy e imagens com limite aprovado; validar saídas e custo real. Revisar quantidade/frequência/mês, marca, CRM/UF/RQE quando aplicável e conteúdo médico por responsável.
5. Filas: desligar/reiniciar API durante lease, repetir request ID, editar perfil, mudar conexão e revogar aprovação. Confirmar stale/retry/blocked e preservar versões e originais.
6. Atendimento: verificar app/número/webhook oficial com mensagens fictícias autorizadas, política e horários confirmados, consentimento/opt-out, janela de 24 horas, tomada humana, relato clínico e envio incerto. Templates e mídia Cloud ainda não implementados; não prometer contatos proativos fora da janela.
7. Site: gerar e revisar preview privado, alterar rascunho/revisão, negar publicação sem aprovação. DNS/EasyPanel e publicação só em etapa explicitamente autorizada.
8. Publicação/ads: primeiro fixtures e sandbox contratualmente disponíveis. Conta, público, peça, data/período e teto aprovados; teste revogação e resultado incerto. Não ativar campanhas reais ou posts reais nesta entrega. Algumas APIs não têm sandbox universal; usar ativos de teste oficiais e autorização específica.

## 5. Monitoramento, falhas e pausa

- `/health` informa configuração, sem afirmar homologação. Correlacionar company ID, request/job ID, generation/revision, token de lease **sem divulgar tokens de canal** e response/provider ID. Não logar bodies de mensagens, chaves, URLs assinadas ou documentos clínicos.
- Consultar painéis de preparação/calendário/site/inbox/ads/publicação e jobs de conciliação de cobrança. Status `failed`, `blocked`, `stale`, `uncertain` e `reconciling` precisam de triagem humana. Configurar alertas de idade da fila, falhas de autenticação/provedor, quota, lease expirada, webhook inválido e erro de signing no observability autorizado.
- Jobs de geração têm tentativas limitadas/backoff. Asaas conciliação para após oito falhas e registra bloqueio. Resultado de envio/publicação incerto não deve ser reenviado cegamente; conferir o provedor primeiro.
- Pausa: desabilitar flag da função e reiniciar/parar seu executor de forma controlada; preservar docs e histórico. Para anúncios já ativos, usar a ação de pausa/reconciliação existente, porque desligar o worker não pausa uma campanha no provedor. Revogação durante chamada em voo não desfaz algo já aceito pelo provedor.
- Não há alertas externos ou metas de latência/custo validados nesta sessão. Medir leitura/escrita Firestore, memória, throughput, tokens e filas no teste antes de definir SLOs.

## 6. Backup, restauração e rollback

Executar apenas por operador autorizado e após confirmar projeto/banco/bucket. Nenhum backup ou restauração remota foi feito nesta sessão.

1. Antes de migração/deploy, pausar os executores de escrita, registrar SHA/configuração sem segredos e exportar Firestore para bucket privado autorizado usando a função oficial de export do GCP. Incluir cópia autorizada do Storage/vault e referência segura da chave de criptografia; não colocar segredo em relatório.
2. Restaurar primeiro em projeto/banco privado descartável de teste, nunca sobrescrever produção para testar. Validar número de docs, tenants, versões, hashes/arquivos e acesso de leitura do vault pela chave original. Antes de iniciar workers, cancelar/suspender tasks restauradas para não repetir efeitos externos.
3. Rollback de código: voltar ao artefato/SHA anterior preservando documentos, sem reset destrutivo no checkout do usuário. Desabilitar novos executores; versões novas são aditivas. Não apagar approvals/jobs para “limpar” um envio incerto.
4. Conferir pagamentos/posts/anúncios no provedor separadamente: rollback de aplicação não reverte dinheiro ou publicação. Operações compensatórias precisam de aprovação correspondente.
5. Anotar resultado e tempo real do teste de recuperação. RPO/RTO só podem ser definidos após esse ensaio.

## 7. Liberação de venda

Gate externo: Firebase real (isolamento, regras/IAM e arquivos), Asaas sandbox, modelos efetivamente disponíveis, canais e webhooks oficiais, revisão médica/publicidade/LGPD, teste de navegador, quotas/custos, observabilidade e backup/restauração. Recursos não homologados não devem ser anunciados como ativos. Parcelamento/troca de plano, templates/mídia Cloud e operações legadas pendentes devem ficar fora da oferta até implementação e testes.

Produção exige uma nova decisão após evidências de homologação; esta entrega não autoriza remover `productionConfigurationIssues()` nem fazer deploy/merge/charges.
