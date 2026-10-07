# Presença digital nativa Firestore — 7/10/2026

Implementação local com fixtures; nenhum provedor real foi consultado e nenhum segredo, IAM ou regra foi alterado.

## Operações e coleções

Todas as coleções abaixo usam `medsi/v1`. As tabelas legadas correspondentes conservam o nome no adaptador Firestore.

| RPC | Persistência / autorização |
| --- | --- |
| request_competitor_research | `company_competitor_research`: opt-in explícito para ID selecionado do mapa regional confirmado ou seleção Places confirmada pelo cliente; tenant, perfil e assinatura verificados; documento determinístico hash(company,place), vinculado à revisão regional |
| save_instagram_watch | `company_instagram_watches`: opt-in de perfil manual local/inspiração, normalização de @, limite de dez, deduplicação transacional e invalidação de aprovações |
| select_competitor_instagram | Associação cliente entre concorrente e perfil, exige revisão atual; não seleciona automaticamente candidato sugerido pela IA |
| retry_competitor_research | Reinicia apenas pesquisa ready/failed da revisão atual |
| claim/finish_competitor_research_server | Serviço apenas; lease de dois minutos, três tentativas, limite diário via `provider_daily_usage`/`onboarding_provider_attempts`; resultado validado, vazio tratado como pronto sem candidato; falha e perfil obsoleto explícitos |
| claim/finish_instagram_watch_server | Serviço apenas; assinatura ativa e quota diária interpretation verificados na reserva de cada lease, resultado revalida acesso; lease de dois minutos, intervalo de uma hora; snapshot e previous separados; falha preserva snapshot; resultado descartado se canal/credencial/autorização mudou |

Credenciais são lidas pela ponte `read_company_meta_server`, usando `company_channels` connected/meta e `channel_secrets` por channel.id, com company_id/channel_id correspondentes. A ponte entrega cipher somente ao serviço; o adaptador existente abre AES-GCM com empresa como AAD. A descoberta exige instagramId numérico e escopos instagram_basic e pages_read_engagement existentes. Nenhuma conexão ativa é sintetizada.

API: `POST /onboarding/companies/:id/instagram/research` recebe `{placeId}` e autoriza marketing.write. IDs do mapa podem conter `/` (OSM); não viram caminhos de documento, pois o armazenamento usa hash. Busca de perfis retorna candidatos e nunca confirma identidade. A configuração `CONTENT_AUTOPREP_ENABLED=false` pausa o worker de busca; `INSTAGRAM_MONITOR_ENABLED=true` é necessário para iniciar monitoramento.

## Validação e limites

`node node_modules/vitest/vitest.mjs run tests/firestore-digital.test.ts --maxWorkers=2`: dez testes em memória isolada, incluindo acesso cruzado, permissões de serviço, falta de opt-in, segredo revogado, lease e token incorretos, alvo incorreto, preservação de dados, deduplicação, limite, quota e confirmação explícita de candidato, expiração de acesso durante consulta e troca de credencial com mesma conta, e seleção Places que só entra na fila depois do opt-in de pesquisa Instagram.

`node node_modules/eslint/bin/eslint.js apps/api/src/platform/firestore/digital.ts apps/api/src/onboarding/instagram.ts tests/firestore-digital.test.ts`: aprovado.

Não comprova Firestore real ou Meta/OpenAI. Homologação externa requer ambiente de teste autorizado, credencial configurada pelo canal seguro, conta profissional conectada, escopos aprovados e quota contratada. Validar em ambiente controlado estados 401/403/429/5xx e perfis não profissionais/públicos; confirmar termos, retenção e permissões do aplicativo Meta vigente. Nenhuma publicação ou gasto faz parte dessas operações.

O responsável pela integração deve incluir digitalOperations/digitalRpc no adaptador client e company_instagram_watches/company_competitor_research na allowlist marketing.read; evidências digitais precisam integrar a base/snapshot de aprovação da etapa 1 e o contexto da análise. O módulo não exige Facebook/X para persistir pesquisa regional; esses provedores continuam opcionais.

A seleção Places (`origin=user_confirmed_places_selection`) permanece `selected` sem executar busca. O opt-in posterior confere perfil confirmado, localização confirmada, cidade e presença do ID nos competitorPlaceIds da versão atual. O documento usa hash(company,place), conserva origem e nome confirmado e recebe profile_version atual; regional_revision fica null. A remoção do ID ou mudança de perfil impede o resultado de um job anterior.
