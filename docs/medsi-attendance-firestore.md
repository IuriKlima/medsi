# Atendimento administrativo nativo no Firestore

Estado: implementado e testado com fixtures locais, sem homologação de provedores. Nenhuma mensagem real, conexão real, assinatura de aplicativo, credencial, implantação, IAM ou regra de produção foi criada nesta execução.

## Persistência e autorização

| Módulo | Operações | Permissões |
| --- | --- | --- |
| `firestore/crm.ts` | `save_crm_contact`, `move_crm_opportunity`, `open_company_conversation`, `set_conversation_mode`, `add_conversation_note`, `claim_company_reply`, `sync_whatsapp_crm` | `crm.write`; identificação da empresa e do ator, escopo também nos IDs de contato/conversa/oportunidade |
| `firestore/inbox.ts` | settings, quick replies, takeover/release, reserve/finish dispatch, prompt/AI context, policy review, contact consent | `crm.write`; configuração exige também `marketing.write`; leitura de policy exige `crm.read`; contexto IA exige acesso pago confirmado |
| `firestore/inbox.ts` | `inbox_auto_targets`, `inbox_auto_claim`, `inbox_auto_prepare`, `inbox_auto_finish`, `inbox_auto_observe_human`, `inbox_record_opt_out` | exclusivo `service_role`; autorização atual do operador configurado, versão de perfil/regras, pagamento, horários, consentimento, opt-out e handoff revalidados |
| `firestore/channels.ts` | `begin_meta_session`, `consume_meta_session`, `save_meta_selection`, `read_meta_selection`, `save_company_channel`, `disconnect_company_channel`, `read_channel_secret` | proprietário real da empresa; state consumido uma vez, expira em dez minutos; material AES-GCM com empresa como AAD |
| `firestore/channels.ts` | `read_company_meta_server` | exclusivo `service_role` com empresa, ator explícito e ação autorizada no momento da leitura |
| `firestore/whatsapp-cloud.ts` | `save_whatsapp_cloud_channel_server`, `read_company_whatsapp_server`, `ingest_whatsapp_cloud_server`, `inbox_cloud_messages_server` | exclusivo `service_role`; ator proprietário para conexão, ator e ação atuais para credencial, número/WABA vinculados para eventos assinados |
| `firestore/whatsapp-cloud.ts` | `read_whatsapp_cloud_inbox`, `reserve_whatsapp_cloud_dispatch` | `crm.read` / `crm.write`, respectivamente; takeover, número conectado, mensagem recebida nas últimas 24h, opt-out, limite de frequência e reserva idempotente |

Leituras empresariais: `contacts`, `opportunities`, `stage_history`, `company_conversations`, `company_conversation_notes`, `company_reply_jobs`, `company_contact_channels`, `company_service_settings`, `company_service_policies`, `company_quick_replies`, `inbox_handoffs`, `inbox_dispatches`, `inbox_auto_jobs` exigem `crm.read` e filtro explícito por `company_id`. `company_channels` permite `marketing.read` ou `crm.read`. As coleções `channel_secrets`, `meta_sessions` e `channel_remote_bindings` não têm leitura pelo dispatcher de consultas do usuário. O histórico Cloud é lido pelo RPC autorizado, que exclui registros expirados.

Canais consultáveis contêm somente metadados públicos. Token e seleção OAuth permanecem cifrados em coleções separadas; erros e auditoria não incluem credenciais. O código criptográfico reaproveitado está em `onboarding/channel-vault.ts`, separado dos controladores para evitar ciclos na inicialização de autenticação.

Reservas manuais e jobs automáticos são transacionais. Repetir o mesmo request retorna duplicidade. Reusar o request com outro conteúdo é conflito. Uma operação `uncertain` não é repetida com um request novo; resultados atrasados não sobrescrevem estado final. Geração tem lease de dois minutos; recuperação de envio em andamento grava `uncertain`. O tratamento administrativo não usa currículo nem outros campos pessoais do perfil para enriquecer a conversa.

## Cloud API oficial

A implementação usa `GET /{WABA_ID}/phone_numbers`, `GET /{PHONE_NUMBER_ID}` e `POST /{PHONE_NUMBER_ID}/messages` no Graph API configurado. O backend valida vínculo WABA/número, `code_verification_status=VERIFIED` e `platform_type=CLOUD_API`. A conexão permanece `pending` até um evento recebido com assinatura HMAC válida confirmar entrega ao webhook do aplicativo. Definir variáveis não cria conexão ativa.

O pareamento legado Evolution/WHATSAPP-BAILEYS permanece identificado como transporte não oficial e não libera automação. Cloud e Evolution compartilham apenas o mesmo executor `InboxAutomation`; não foi criado um segundo poller. `INBOX_AUTOMATION_ENABLED` deve permanecer desativado até revisão e homologação autorizadas. Ativar requer regras salvas, revisão dos horários vinculada a versão, consentimento individual, ausência de opt-out/handoff, perfil confirmado, acesso pago e janela administrativa aberta. O executor reconsulta a última mensagem e a credencial/identidade do número antes da preparação do envio. Timeout após tentativa resulta em estado incerto, sem retry de envio.

Configuração segura pelo operador, sem receber chaves no navegador/chat:

- `META_GRAPH_API_VERSION`: versão aprovada e disponível para o aplicativo.
- `SECRETS_ENCRYPTION_KEY`: chave AES já existente no cofre; não substituir durante migração sem procedimento de rotação.
- `WHATSAPP_CLOUD_APP_SECRET` (ou `META_APP_SECRET`): segredo do aplicativo para autenticar bytes exatos do webhook.
- `WHATSAPP_CLOUD_VERIFY_TOKEN`: token de verificação do webhook configurado pelo operador.
- `WHATSAPP_CLOUD_CREDENTIALS_JSON`: mapa no servidor, indexado por UUID da empresa; cada entrada contém `token`, `wabaId`, `phoneId` de ativos realmente autorizados para aquela empresa. Não copiar uma credencial global para empresas sem vínculo real.
- `INBOX_AUTOMATION_ENABLED`: opt-in explícito do servidor após homologação; padrão não ativado.

O operador precisa conceder somente as permissões aprovadas `whatsapp_business_management` e `whatsapp_business_messaging`, concluir cadastro/verificação/registro dos ativos na Meta, configurar callback HTTPS e assinar o WABA no aplicativo. Nenhuma dessas ações externas foi realizada aqui. Validar primeiro com número e contatos de teste autorizados; o backend não registra automaticamente número nem assina WABA.

Rotas autenticadas: `GET /onboarding/companies/:id/whatsapp-cloud/status`, `/threads`, `/messages`; `POST /connect`, `/takeover`, `/send`, `/disconnect`. Eventos públicos exclusivamente assinados: `GET/POST /webhooks/whatsapp-cloud`; inicialização Nest usa `rawBody:true`. O frontend de Integrações permite verificar/vincular e consultar estado, sem formulário de segredos. A Caixa de entrada existente escolhe automaticamente Cloud conectado para leitura/envio de texto. A configuração de atendimento permite revisar horários. O CRM permite registrar consentimento ou pedido de interrupção com evidência.

Histórico disponível: mensagens recebidas pelo webhook e envios aceitos pelo backend; não existe endpoint inventado para recuperar histórico anterior à conexão. Leituras excluem eventos após 30 dias. `expires_at` está persistido; o operador deve configurar TTL nessa coleção e validar a política de retenção, sem alteração de infraestrutura nesta execução. Texto aceito pelo provedor não equivale a entrega/leitura. Arquivos, templates fora da janela de 24h, importação de histórico anterior e comprovantes de entrega/leitura completos continuam pendentes; a interface restringe anexos no canal oficial.

## Evidências locais e limites

- `tests/firestore-attendance.test.ts`: 20 testes de isolamento, CAS, handoff, duplicidade, estados incertos, OAuth replay, AAD, cofre, minimização, consentimento, horários e encaminhamento clínico determinístico.
- `tests/whatsapp-cloud.test.ts`: 12 testes de configuração por empresa, validação de número/WABA com fetch simulado, 401/403/429/5xx/timeout, assinatura exata, challenge, eventos, janela de 24h, opt-out, retenção, envio aceito e execução automática única/timeout sem retry.
- `tests/inbox.test.ts`: regressão legada, 14 testes.
- ESLint dos arquivos alterados e TypeScript API/web passaram. O responsável pela integração executa `pnpm check` completo.

Estes testes não comprovam permissões reais da conta Meta, aprovação do aplicativo, qualidade do número, capacidade de envio, webhook público ou cumprimento jurídico de LGPD/CFM. As consultas Firestore continuam usando o limite defensivo do store (1.000 documentos por consulta); carga/particionamento de histórico e tenants precisa de teste no ambiente de operação antes de escala comercial.

Fonte oficial consultada: [coleção Meta WhatsApp Cloud API no Postman](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api). As páginas de referência em developers.facebook.com responderam 429 durante a execução; a validação atual dos campos/versão e limites junto ao provedor permanece um gate de homologação, não foi alegada como sucesso de sandbox.
