# MedSI — fechamento das portas legadas Firestore, 07/10/2026

Base: `3092952e94fd152f99929f65bbd7a64950232169`, mesma branch `fix/regional-baseline-2026-10-06`. Alterações anteriores preservadas. Escopo: implementar os contratos já usados pelas rotas existentes, sem redesenhar produto, criar credenciais, alterar IAM/rules publicados, cobrar, enviar mensagens, publicar, anunciar, migrar banco real, fazer push ou deploy.

## Resultado do inventário

As **24 chamadas RPC literais pendentes** foram portadas. `scripts/firestore-inventory.mjs` agora informa **185 operações nativas, 167 chamadas literais da API e zero pendências literais**. Os cinco módulos novos são registrados pelo dispatcher real `platform/firestore/client.ts`. Este número não prova completude universal, conexão real, compatibilidade irrestrita com Supabase nem homologação de todos os provedores. Operações desconhecidas continuam retornando `FIRESTORE_OPERATION_PENDING`.

Todas as coleções mencionadas abaixo ficam sob `medsi/v1/<coleção>/<documento>`. O projeto selecionado permanece `medsi-80f4a`, database `(default)`. A origem `atendimentomac-88940` não foi lida nem modificada.

| Conjunto e relevância à jornada | Operações portadas | Caminhos principais | Estado |
|---|---|---|---|
| Equipe e permissões; necessário quando clínica convida colaboradores/delega aprovações | `company_roster`, `create_company_invitation`, `accept_company_invitation`, `revoke_company_invitation`, `change_company_member`, `set_company_permission` | `company_members`, `company_invitations`, `company_permission_grants`, `workspace_members`, `audit_logs`; email verificado por `firebase_identities` | validado somente com simulação |
| Operação interna e acompanhamento; interface já existente de administradores e suporte autorizado | `company_assignment_roster`, `set_company_assignment`, `internal_portfolio`, `start_internal_access`, `end_internal_access`, `internal_company_context`, `internal_onboarding_context`, `record_followup_meeting` | `company_assignments`, `internal_access_sessions`, `company_followup_meetings`, `platform_audit`; perfil e equipe da clínica da sessão | validado somente com simulação |
| Suporte do produto; chamados/replies persistidos, sem envio externo | `create_support_ticket`, `reply_support_ticket`, `set_support_ticket_status`, `support_ticket_detail`, `support_ticket_list` | `support_tickets`, `support_messages`, `support_counters`, `platform_audit` | validado somente com simulação |
| Resultados e importação; métricas somente de fatos recebidos, retomada dos rascunhos antigos | `dashboard_read`, `dashboard_import`, `dashboard_set_keywords`, `dashboard_record_export`, `import_local_drafts` | `dashboard_permissions`, `dashboard_imports`, `dashboard_facts`, `dashboard_fact_revisions`, `dashboard_keyword_profiles`, `dashboard_exports`, `local_draft_imports`, `editorial_drafts`, CRM | validado somente com simulação |

O cadastro de uma clínica sem equipe não depende de abrir uma sessão interna ou importar rascunhos. Esses caminhos foram portados porque suas telas/controladores já existem e estavam bloqueados pelo adaptador. Não foram adicionados endpoints de concessão financeira, mensagens externas ou novas funcionalidades de produto.

## Consultas e falhas corrigidas

- `company_invitations`: exige clínica e gerente; a projeção exclui `token_hash`, inclusive em `select('*')`. Tentativas explícitas de selecionar/filtrar/ordenar campos privados são negadas. O bearer do convite é retornado apenas na criação autorizada, como no contrato existente.
- `audit_logs`: exige clínica e gerente; consultas das últimas entradas por `created_at DESC` com limite são aplicadas no SDK, antes de carregar o histórico.
- `company_permission_grants`: gerente vê a clínica; membro atual vê somente as próprias concessões. Remoção de membro revoga acesso e elimina concessões canônicas para evitar que reapareçam em novo ingresso.
- `editorial_drafts`: exige `marketing.read` na clínica; conteúdo importado perde aprovação local e inicia como rascunho versão 1.
- `platform_staff`: o seletor de carteira agora lista candidatos para administrador de plataforma ativo; os demais atores continuam restritos ao próprio registro. Essa incompatibilidade adicional foi reproduzida no teste de leitura e no HTTP `/operations/staff`.

O legado de equipe não possui requestId/CAS para todas as ações. A porta preserva reemissão de convite com revogação anterior, aceitação de uso único, upsert/delete de delegações e serialização da alteração do último administrador. Não promete idempotência inexistente no contrato. Suporte, importação e acompanhamento possuem tratamento de repetição compatível e autorização revalidada. Payload de acompanhamento alterado com o mesmo requestId é recusado; exportações com sessão explicitamente fornecida devem pertencer ao ator/clínica e continuar válidas. Não há gate financeiro novo para registro de acompanhamento; `weekly_support` continua informativo nesse contrato.

As operações de administração de empresa arquivada seguem a restrição nativa existente e falham fechadas, mesmo onde o SQL antigo era mais permissivo. Contexto interno arquivado conserva a leitura limitada prevista no contrato; onboarding/acompanhamento rejeitam empresa arquivada.

## Escala, consultas nativas e índice local

A revisão independente reproduziu duas falhas que os testes simples de memória não mostravam: carteira de suporte quebrava com mais de mil clínicas globais; contexto e página de equipe quebravam quando a auditoria da clínica ultrapassava mil entradas. Foram corrigidas assim:

- Suporte consulta diretamente as clínicas atribuídas; não varre outras clínicas.
- Administrador percorre páginas de 500 documentos por ID para preservar busca por nome, total exato e ordenação/paginação existentes. Isso ainda lê a carteira inteira para calcular total e filtro; custo/limites reais precisam de homologação.
- Contexto interno busca as últimas 30 auditorias; equipe busca as últimas 50. `DocumentTransaction.list` ganhou opções explícitas de ordem/limite/cursor, conservando o limite defensivo das consultas antigas sem opções. Alterações preparadas na mesma transação respeitam a página/ordem e não deixam resultados parciais.
- `firebase/firestore.indexes.json` declara índice de coleção `audit_logs`: `company_id ASC`, `created_at DESC`. **Não foi aplicado ao projeto remoto.** A consulta real pode permanecer bloqueada enquanto o índice não existir/estiver pronto. Publicação e homologação dessa configuração ficam para o ambiente de teste autorizado posteriormente.

Onze regressões executam o `firestoreStore` real contra uma implementação local da interface do SDK: histórico >1.000, páginas e totais, escopo de empresa, ordenação, alterações preparadas, cursor e opções inválidas. Isso verifica emissão/composição das consultas, não o SDK hospedado, seus índices, concorrência de rede ou limites reais.

Limites restantes: várias outras consultas de filas, suporte, dashboard/CRM e histórico continuam com limite defensivo de 1.000 documentos; documentos acima de 800KB são recusados. Importações maiores aceitas pelo schema ainda dependem de verificação dos limites reais transacionais. Não houve aumento global do limite, truncamento silencioso ou sucesso simulado para esconder falhas.

## Verificação e entregáveis

- Reproduzidas falhas por operação ausente e pelas quatro consultas; os testes dos módulos exercitam isolamento, permissões, ator incorreto, expiração/revogação, repetição, alteração de payload e rollback por falha de escrita.
- `tests/firestore-legacy-http.test.ts`: cinco percursos passam pelas rotas Nest reais usando atores fictícios e armazenamento em memória: convite/equipe/delegação/remoção, carteira/sessão/acompanhamento, chamado/reply/conflito de versão, importação/reload de rascunhos e dashboard sem métricas fabricadas.
- Revisões independentes de acesso/equipe/sessão e de dados/suporte concluídas; as duas falhas de escala encontradas foram corrigidas e revalidadas.
- A primeira execução integrada capturou uma falha de atribuição de sessão de exportação enquanto sua regressão estava sendo implementada; a correção exige a sessão corrente do ator/clínica. A execução final será registrada abaixo; não confundir o log inicial com a situação entregue.

Arquivos principais: cinco módulos novos `team.ts`, `internal.ts`, `support.ts`, `dashboard.ts`, `drafts.ts`; integração em `client.ts`, paginação em `store.ts`, índice local, helper de teste e oito arquivos de testes. Contratos e evidências detalhadas estão em `docs/firestore-port-{team,internal,support,dashboard}-2026-10-07.md`. Plano em `docs/superpowers/plans/2026-10-07-firestore-legacy-paths.md`.

## Bloqueios reais preservados

| Recurso | Estado | Dependência concreta |
|---|---|---|
| Firestore/Auth/Storage hospedados | bloqueado | ADC/credencial administrativa ausente neste ambiente; transações, índice novo e permissões ainda não homologados |
| Places/SerpApi/IA/Meta/Evolution/Asaas/hosting | bloqueado | Configuração e testes reais de cada provedor; nenhuma chamada externa nesta porta |
| Migração da origem antiga | bloqueado | Inventário autorizado remoto, UIDs, arquivos, vault, conflitos e filas; zero documentos migrados |
| Worker legado | bloqueado | Responde health, mas continua `idle`, `processing:false`; não confundir com pollers nativos condicionais da API |
| Prévia acessível no celular | bloqueado | Nenhuma capacidade oficial de encaminhamento disponível nesta sessão; nenhum túnel/deploy |
| 24 RPCs e quatro leituras desta rodada | validado somente com simulação | Portadas e integradas; não há pendência de implementação no inventário literal selecionado |

Proteção de produção Firestore mantida. Nenhum recurso desta rodada recebe estado “validado com integração real”. O pacote Windows será atualizado na mesma identidade Library após commit e verificação do clone; nenhuma atualização automática da instalação Windows é presumida e nenhum log do notebook é solicitado agora.


## Verificação final integrada

`pnpm check` concluiu com **código 0**: lint, tipos, **881 testes em 98 arquivos, zero falhas**, builds de pacotes/API/worker/web. Evidência: `/workspace/medsi-evidence/legacy-ports-check-final.txt`. `git diff --check` passou. A rodada inicial com a regressão de exportação falhou; a execução final acima é a referência da entrega. Revisores confirmaram as correções e onze testes do adaptador/SDK local passaram. Nenhuma integração real foi exercitada.

Commit local acompanha este relatório, sem push/PR. A entrega transportável conserva a identidade Library `libfile_1c3d276edd2481919eea186beb69caea`, com novo nome baseado no SHA, histórico commitado sanitizado por padrões, manifesto e clone conferido. SHA e confirmação da substituição constam na resposta/handoff final, pois o próprio commit não pode conter seu hash.
