# Dashboard e importação local no Firestore — 07/10/2026

Porta nativa dos cinco RPCs já usados pelos controllers, sem nova funcionalidade de produto. Referências: `202609219001_dashboard.sql`, `202609210004_draft_import.sql`, schemas de `packages/contracts/src/dashboard/schema.ts` e `packages/contracts/src/index.ts`, `apps/api/src/dashboard/controller.ts` e `apps/api/src/operations/controller.ts`.

## Caminhos e contratos

- `apps/api/src/platform/firestore/dashboard.ts`: `dashboardOperations` / `dashboardRpc` para `dashboard_read`, `dashboard_import`, `dashboard_set_keywords`, `dashboard_record_export`.
- `apps/api/src/platform/firestore/drafts.ts`: `draftOperations` / `draftRpc` para `import_local_drafts`.
- `apps/api/src/platform/firestore/internal.ts`: `requireInternalSession`, reutilizado somente para leitura interna explicitamente vinculada à sessão e à empresa. Nenhuma associação de membro é criada.
- Dispatcher central: `apps/api/src/platform/firestore/client.ts` (integração pelo responsável da tarefa 5).
- Cálculos permanecem no `apps/api/src/dashboard/engine.ts`: o RPC fornece o mesmo `DashboardRaw` que o controller já utiliza. Sem fatos importados, as métricas financeiras permanecem sem base/histórico; não há tráfego, pagamento, tendência ou resultado sintético.

Todas as coleções ficam sob `medsi/v1/{collection}/{documentId}`:

| Coleção | Chave / uso |
| --- | --- |
| `dashboard_permissions` | Leitura de concessão financeira por empresa e usuário; só com vínculo atual de membro. |
| `dashboard_imports` | SHA-256 canônico de empresa + checksum do documento validado; `id` público UUID. Metadados da cobertura e autor. |
| `dashboard_facts` | SHA-256 de empresa, fonte, tipo e ID externo; fato atual e revisão. |
| `dashboard_fact_revisions` | Chave do fato + número da revisão; histórico imutável por operação. |
| `dashboard_keyword_profiles` | Empresa; serviços confirmados, bairro, autor, data e revisão. |
| `dashboard_exports` | UUID; snapshot, filtros, método, autor e sessão opcional. |
| `local_draft_imports` | SHA-256 de destino, empresa local de origem, tipo e ID local; vínculo ao registro persistido. |
| `contacts`, `opportunities`, `stage_history`, `editorial_drafts` | UUIDs; registros criados pelo importador, sempre na empresa de destino. |
| `audit_logs` | UUID; `dashboard.imported`, `dashboard.keywords_confirmed`, `dashboard.exported`, `drafts.imported`. |

`dashboard_read` devolve empresa projetada, perfil de palavras-chave, fatos/revisões, cobertura mais recente por fonte/domínio/intervalo, CRM projetado e quatro permissões. Não expõe contatos completos, telefone, email, interesse ou campos privados extras da empresa/oportunidade. O proprietário pode ler todos os domínios; o acesso digital usa `marketing.read`/`marketing.write`; nem administrador nem marketing recebem finanças automaticamente. A concessão financeira exige associação atual e `financial_details`; escrita financeira exige também `manage_costs`. O atendente não recebe os agregados do CRM pessoal. Suporte interno com sessão ativa e atribuição atual lê digital; administrador interno lê digital e financeiro; ambos continuam sem escrita por essa sessão.

Ruling: exportação com sessão explicitamente informada exige sessão atual, do próprio ator e da empresa. O SQL legado verificava apenas a existência do ID quando permissões ordinárias já autorizavam o proprietário; o port rejeita essa atribuição de auditoria forjada. Chamadas normais do proprietário sem sessão continuam iguais; callers que enviavam sessão alheia/expirada agora recebem `42501`.

`dashboard_import` usa o schema do controller também na fronteira nativa. Campos desconhecidos, tipos inválidos, mistura de domínios, IDs repetidos e datas fora da cobertura são rejeitados. Mesmo documento validado retorna `{id, duplicate:true, written:0}`. Alteração de fato na mesma chave de origem é correção autorizada, incrementa a revisão e preserva o histórico. Fatos idênticos em novo lote não ganham revisão. A autorização é reavaliada antes de consultar qualquer replay. SHA canônico é próprio desta persistência: não é promessa de igualdade byte a byte com o hash de `jsonb::text` do PostgreSQL.

`import_local_drafts` retorna `{contacts, opportunities, contents, skipped}`. Usa o schema público, inclusive limites, normalização de telefone e consistência entre IDs/empresa local/contatos vinculados. Conteúdo aprovado localmente entra como `draft`, versão 1; oportunidade ganha `new`, origem `local_import` e histórico de reinício; nenhum consentimento de mensagem é concedido. Telefone deduplica somente no destino. ID de origem já importado é ignorado, inclusive se o payload posterior mudar: mantém a semântica SQL e nunca sobrescreve o registro existente nem devolve seu conteúdo. A autorização atual para CRM/marketing é exigida antes desse resultado. Referência importada para contato de outra empresa é rejeitada.

Todas as gravações usam a mesma transação, inclusive auditoria e vínculos. Falha posterior descarta contatos/fatos/revisões já preparados. Não há e-mail, envio de mensagens, publicação, anúncio, cobrança ou consulta externa.

## Limites concretos

- Schema dashboard: 1–1.000 fatos por documento, JSON de entrada até 2.000.000 bytes. Importação local: até 100 contatos, 100 oportunidades, 30 conteúdos e 262.144 bytes. Mantidos os limites atuais do produto.
- O adaptador `DocumentTransaction.list` recusa consultas com mais de 1.000 documentos persistidos. Assim, leitura de dashboard/imports/CRM pode falhar antes do limite legado SQL de 10.000. Não há paginação nativa nova nem truncamento silencioso.
- O adaptador Firestore recusa documentos serializados acima de 800.000 bytes. Um snapshot de exportação aceito pelo limite SQL/API de 2.000.000 bytes ainda pode ser recusado pelo adaptador; a transação e sua auditoria não devem persistir parcialmente.
- Testes de memória aceitam o lote máximo de 1.000 fatos. Isso verifica lógica/contrato, não homologa bytes, índices, limites ou desempenho do serviço Firestore real.
- Não há endpoint novo de concessão financeira: `dashboard_grant` não faz parte dos cinco RPCs alcançados pelo controller desta tarefa. A leitura respeita concessões persistidas existentes.
- Coleções internas não são expostas por consultas genéricas. Leitura genérica de `editorial_drafts` pertence à integração da tarefa 5.
- Sem acesso de provedor, emulator/named database ou credenciais nesta tarefa. Sem alteração de IAM, rules, ambiente, dados remotos, migração, deploy ou push. Homologação real segue pendente.

## Evidência de verificação

`tests/firestore-dashboard.test.ts` e `tests/firestore-drafts.test.ts` reproduziram inicialmente 18 falhas `FIRESTORE_OPERATION_PENDING` pelo dispatcher real. Cobrem projeção de privacidade, cálculo real do controller sem dados fabricados, separação de permissões, revogação, sessão interna e atribuição, importações repetidas/alteradas, isolamento de empresa, rollback por payload inválido e falha de gravação posterior, palavras-chave, exportações e lote máximo de fatos.

Após a integração do dispatcher, os 18 testes passaram. Um 19º teste de regressão reproduziu a atribuição indevida de sessão em exportações e foi corrigido exigindo a sessão atual do próprio ator/empresa. Typecheck da API e ESLint dos quatro arquivos passaram durante a implementação. `pnpm exec` tentou instalar dependências fora do workspace; comandos locais `node_modules/.bin/*` usaram as dependências existentes, sem alterar ambiente ou baixar pacotes.

Validação final focada: `node_modules/.bin/vitest run tests/firestore-dashboard.test.ts tests/firestore-drafts.test.ts tests/dashboard.test.ts tests/dashboard-database.test.ts tests/dashboard-reporting.test.ts --maxWorkers=2` — **57 testes / 5 arquivos passaram**, incluindo 19 testes nativos novos e os contratos SQL/PGlite existentes. Typecheck da API (`tsc --noEmit -p apps/api/tsconfig.json`), ESLint dos quatro arquivos e `git diff --check` também passaram. A verificação completa `pnpm check` permanece a cargo da integração da tarefa 5; não se confunde este resultado focado com homologação real.
