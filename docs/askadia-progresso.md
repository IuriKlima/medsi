# Progresso conforme prompt mestre — 21/09/2026

## Implementado nesta evolução
- Escopo consolidado preservado integralmente em askadia-requisitos.md. Auditoria, arquitetura, aceite e configuração de integrações registrados.
- Migração incremental 202609210003_product_foundation.sql: equipe interna separada, carteiras atribuídas, sessões internas com operador/motivo/início/fim/expiração, trilha de auditoria.
- /admin e /acompanhamento/carteira: listagem persistente, busca, paginação, abertura de contexto e atribuição/remoção de carteira. Primeiro administrador e equipe interna exigem provisionamento confiável no banco.
- /operacao/[id]: consulta de empresa/equipe/histórico e assinatura. Faixa interna, operador real e encerramento explícito. Sessão roubada, vencida ou revogada é recusada pelo banco.
- Esta é a fundação dos cinco perfis, não os cinco painéis operacionais completos: ajustes internos, administração de cobrança, encontros e saúde de jobs ainda faltam.
- Gerente de marketing acrescentado sem remover papéis legados. Proprietário acessa suas empresas conforme o prompt novo; gerente não ganha CRM ou cobrança automaticamente. Atendente mantém escopo comercial.
- Delegações explícitas pelo proprietário, com revogação, expiração suportada na API/banco e limite obrigatório para autorização de orçamento. Não há execução de anúncio.
- Catálogo persistente: básico 49700 centavos, adicional semanal 100000, superior sem preço. Assinatura e quotas por empresa. Checkout desativado; assinatura ausente/expirada não libera recursos. Quota nula aparece como “A definir”, nunca ilimitada. Reserva/contabilização de uso aguarda módulos de IA/jobs.
- Tela Plano e recursos consulta servidor/banco. Navegação conectada ganhou menu recolhível no celular; componentes/tokens neutros preservados.
- Migração 202609210004_draft_import.sql: importação transacional por empresa com permissões, deduplicação de IDs e telefone dentro do tenant, auditoria e rollback integral.
- Importação assistida lê navegador ou JSON exportado, mostra origem/destino e prévia, exige confirmação e preserva originais. Peças entram como rascunho v1; oportunidades entram em Novo. Nenhuma aprovação ou matrícula local é promovida a verdade operacional.
- Rascunhos editoriais persistidos podem ser consultados/exportados. Edição e produção ficam para o estúdio; CRUD/kanban persistente completo do CRM permanece pendente.
- Gemini acrescentado ao catálogo como decisão de design; adaptador real ainda pendente. Chaves públicas Supabase aceitam nome publishable ou anon.

## Supabase e execução
- .env local com URL/chave pública. service_role fornecida não armazenada.
- Auth/settings respondeu 200; cadastro habilitado e confirmação de e-mail obrigatória.
- Consulta remota posterior encontrou workspaces com HTTP 401/42501 (acesso anônimo negado). platform_staff e editorial_drafts ainda retornam PGRST205. A existência de workspaces não comprova a aplicação de todas as políticas iniciais; homologação com conta continua pendente. Usuário escolheu executar SQL no painel.
- .local/supabase-setup.sql permanece inalterado: somente as três migrações iniciais.
- Após a instalação inicial, aplicar .local/askadia-update.sql (migrações incrementais 003 e 004). Não repetir o arquivo inicial.
- Nenhum e-mail, anúncio, publicação, cobrança, DNS ou deploy real executado.

## Verificação
Consulte askadia-aceite.md para a execução final e seus limites. Testes de PostgreSQL usam PGlite com fixtures mínimas de Auth/Storage; testes HTTP usam autenticação controlada e SQL real. Isso não comprova o serviço Supabase hospedado.

## Próximas etapas em ordem
- Completar homologação da fundação no Supabase: duas contas, empresas, papéis, arquivos, revogação e importação real. Sessões em Realtime e perfil interno com ajustes auditados continuam pendentes.
- Etapa 2: ampliar importação para lotes maiores e completar revisão visual/estados do produto conectado conforme dados reais.
- Etapa 3: site público e landing page com formulário próprio persistente, sem aquisição paga até homologação.
- Etapas 4–13: onboarding Google, conhecimento/OpenAI, Gemini/estúdio, aprovações/publicação, CRM/canais, Ads, sites/domínios, cobrança/administração, métricas/acompanhamento e piloto. Não descartadas e não declaradas prontas.
- Comercial: preço superior, quotas, retenção/carência, limites de arquivos, reuniões, filiais, domínio e orçamento de provedores continuam abertos.

## Integração de alterações simultâneas
Arquivos de dashboard/resultados foram acrescentados e editados durante esta etapa por trabalho de origem ainda não confirmada. Foram preservados. Ajustes mínimos de compatibilidade: estreitamento dos tipos de fatos, composição de schema Zod refinado, resolução de searchParams e exportação estática de configuração da rota. A compilação final passou. A revisão funcional completa desse módulo e sua migração 202609219001 são separadas; não foram incluídas em askadia-update.sql nem contabilizadas como entrega homologada desta fundação.

## Correção do cadastro — 21/09/2026
O endpoint POST /identity/workspaces retornava o UUID como texto/html pelo Nest. O proxy web esperava JSON e exibia 503 depois de o banco já ter criado a área. Corrigido para responder {id}, com consumo correspondente na tela. Adicionado teste HTTP que falhou antes da correção (Content-Type text/html) e passou depois (201, application/json, ID correto e uma chamada à RPC). Os 10 testes de identidade/API passaram.
Na sessão autenticada do usuário, foram encontradas duas áreas resultantes das tentativas anteriores, ambas sem empresas. Foi usada a primeira área existente para cadastrar a empresa solicitada; a interface confirmou o registro persistido como rascunho, sem contratação. A área duplicada foi preservada. Nenhuma migração foi necessária para esta correção.

Validação final da correção de cadastro: `pnpm check` passou integralmente (código 0): lint, tipos, 92 testes e builds de web/API/worker. Cadastro da empresa solicitada confirmado na interface autenticada do Supabase; nenhuma cobrança ativada.

## Página pública na raiz — 21/09/2026
A rota / passa a apresentar o site institucional da Askadia, sem redirecionar automaticamente para o painel e sem carregar a prévia local. Apresentação, recursos disponíveis, evolução do produto e perguntas frequentes usam a identidade neutra existente. Todos os botões de entrada levam a /login; /workspace e demais áreas conectadas mantêm autenticação. /preview continua separado. A página pública não consulta dados privados nem depende do Supabase para renderizar. Nenhum DNS ou deploy foi alterado. Esta entrega não conclui os formulários comerciais e as demais páginas institucionais do escopo mestre.

## Direção atualizada pelo usuário
A Askadia é uma agência de marketing autônoma com IA para negócios fitness. OpenAI via API para estratégia, textos, triagem e propostas de tráfego pago; execução de campanhas pelos conectores Meta/Google com aprovação e limites. A escolha visual mais recente é Nano Banana Pro (Gemini 3 Pro Image, modelo configurável gemini-3-pro-image), substituindo o padrão anterior Gemini 2.5 Flash Image. Fonte oficial consultada: https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image. Não houve geração nem gasto externo.
A página pública na raiz passou por pnpm check (92 testes, tipos, lint e builds), revisão desktop/celular e navegação ao login.


## Jornada por empresa — 21/09/2026
Onboarding persistido, perfil confirmado/versionado, anexos privados, briefing/estratégia OpenAI, áreas por papel e reuniões de acompanhamento implementados. CRM e tomada humana em migração 006; execução remota ainda sem confirmação. Migração 005 executada pelo usuário. Auditoria, navegação e contrato em docs/jornada-auditoria.md e docs/jornada-contrato.md; relatório em docs/jornada-entrega.md.
Validação: pnpm check passou (lint, tipos, 114 testes, builds); após ajustes finais de texto/Maps, tipos de API/web e 22 testes da jornada passaram. Navegador autenticado confirmou criação → conversa → recarga → etapas manuais → perfil v1 → início da mesma empresa → briefing persistido, além de PNG privado presente após recarga.
OpenAI continuou retornando 429 sem créditos após recarga informada. Gemini Pro retornou 429 free tier com limite zero nas duas tentativas reais de imagem; nenhuma imagem gerada. Google Places/Embed sem chaves, com busca externa manual e aviso específico. Não há homologação de geração, publicação, envio WhatsApp ou cobrança.


## Google Places — chave configurada em 21/09/2026
Chave fornecida pelo usuário salva apenas em GOOGLE_PLACES_SERVER_KEY no .env ignorado. Consulta real ao endpoint Places Text Search retornou HTTP 403 PERMISSION_DENIED / SERVICE_DISABLED: Places API (New) está desativada no projeto associado à chave. Usuário recebeu link direto de ativação. A chave não foi exposta como chave de navegador; Maps Embed ainda depende de credencial própria restrita. API local sinalizada para recarregar ambiente. Sem alterações em dados da empresa, sem seleção/confirmacão automática de local. Não houve mudança funcional de código nem nova suíte; teste de integração real identificou bloqueio externo antes da busca.


## Google Places ativado — 21/09/2026
Nova consulta real com a chave de servidor já configurada retornou HTTP 200 e um estabelecimento para a busca da empresa. A ativação resolveu o SERVICE_DISABLED anterior. A nova credencial fornecida em print do Gemini foi testada no Places e retornou 401 UNAUTHENTICATED; não substituiu a chave funcional. Nenhum segredo ou conteúdo integral do Places foi salvo no relatório. GOOGLE_MAPS_BROWSER_KEY ainda ausente: mapa incorporado pendente, link externo disponível. Sem mudanças de código nesta validação de integração.


## Atualização da chave Gemini — 21/09/2026
Nova credencial Gemini fornecida pelo usuário salva somente no .env privado. Teste real com gemini-3-pro-image retornou novamente HTTP 429 RESOURCE_EXHAUSTED, métricas de free tier com limite zero. Nenhuma imagem gerada. A chave funcional do Google Places foi preservada. Faturamento/quota do projeto Gemini permanece como dependência externa. Sem mudanças de código; teste específico da integração executado.


## Novo teste real OpenAI e Gemini — 2026-09-21T19:53:27.763Z
OpenAI: interpretação estruturada de resposta fictícia concluída com sucesso; nome, cidade e tipo extraídos, 359 tokens totais (275 de entrada e 84 de saída). O bloqueio de crédito deixou de ocorrer nesse teste. Isso homologa a interpretação do onboarding; geração completa de estratégia permanece sem validação real nesta execução. Gemini Nano Banana Pro (gemini-3-pro-image): HTTP 429 RESOURCE_EXHAUSTED, métricas free tier com limite zero; nenhuma imagem gerada. Nenhum dado real de cliente enviado; sem alteração de código nesta verificação.


## Calendário editorial, designer e conexões — 21/09/2026
Estratégia exige 12 ideias. Aprovação materializa o calendário; OpenAI detalha somente itens pendentes. Designer Gemini recebe briefing, marca e bytes dos materiais privados selecionados (até 5 imagens/12 MB), com referência aos anexos no registro da geração. Revisões invalidam aprovação; respostas atrasadas não substituem edições. Calendário e arquivos isolados por empresa. Implementado OAuth Meta com state descartável, seleção de Página e cofre AES-GCM; Evolution procura/cria instância determinística por empresa apenas ao conectar WhatsApp e oferece QR/status. Sem consumidor de webhook, envio real, publicação ou insights sincronizados neste incremento.
Validação completa: pnpm check passou, incluindo lint, tipos, 120 testes e builds. Testes cobrem 12 ideias, aprovação prévia, edição/revisão, mídia privada, geração atrasada, materiais, isolamento, OAuth replay e cofre. Integrações externas ainda dependem de homologação.
Erro de Conteúdo confirmado: tabelas 007/008 ausentes (PGRST205). Usuário executou ambos os SQLs preparados, consulta posterior confirmou presença com acesso anônimo negado por permissões. Nenhum dado de empresa foi alterado por testes de navegador. App Meta Askadia Marketing (1061475423356674) criado com Instagram, Páginas e três casos de uso Marketing API; usuário autorizou aceite de termos. App antigo preservado. App ID salvo no .env; segredo, origem HTTPS, portfólio Askadia/verificação e análise Meta pendentes. Gemini: última geração real ainda 429; não afirmar design homologado.
Contrato, permissões e instruções em docs/calendario-conexoes.md. Upload do vídeo final e consistência visual entre slides continuam pendentes.


## Homologação de calendário/Meta/Evolution — continuação
Calendário verificado no navegador autenticado após 007/008: quatro publicações da estratégia legada, revisões v2, legendas, briefing visual, slides/roteiros e três materiais de referência. Não houve expansão da estratégia aprovada; novos resultados exigem 12 ideias.
Meta: usuário forneceu segredo, salvo apenas no .env; Graph v26.0 confirmado no painel. Callback HTTPS https://askadia.com.br/api/connections/meta/callback salvo e confirmado após recarga, mantendo HTTPS e modo estrito. OAuth local bloqueado até WEB_ORIGIN HTTPS para não encaminhar clientes a callback inválido. Cinco testes do adaptador passaram após esse ajuste e tipos de API passaram. App em desenvolvimento, portfólio e revisão ainda pendentes.
Registro oficial confirmou domínio askadia.com.br ativo, DNS a.auto.dns.br/b.auto.dns.br, consulta DNS pública sem registro A. IP do host Evolution: 2.25.204.218. Usuário escolheu hospedar no mesmo Easypanel; painel aberto e aguardando autenticação. Hospedagem NÃO executada: API e worker ainda possuem bloqueios explícitos de produção que exigem revisão de lançamento; não removidos.
Evolution: servidor 2.3.7 retorna 404 ao buscar uma instância inexistente. Corrigido para criar nesse caso, distinguir erro de credencial e reutilizar a instância existente. Testes verificam 404→criação, reutilização sem duplicação e 401 sem tentativa de criação. Sete testes do adaptador e tipos de API passaram. Validação real pela interface criou askadia-{UUID da empresa Gaviões Varginha}, persistiu vínculo pendente e exibiu QR code. Não houve leitura do QR pelo agente, envio de mensagem ou configuração de webhook.

## Atendimento por empresa — 22/09/2026
Nova caixa de entrada lê conversas reais da Evolution e identifica o canal, com busca, paginação, tela cheia, atalhos e envio textual controlado. Configuração de Atendimento persiste prompt e fluxo por empresa/canal. GPT-4o mini prepara sugestões usando o perfil confirmado; envio automático ainda depende de webhook/consumidor. Meta/TikTok não são apresentados como conectados para mensagens. Migrações do CRM e caixa aplicadas no Supabase, acesso anônimo negado. Contrato e validações: docs/atendimento-caixa-entrada.md e docs/progress.md.

## Atendimento, CRM e calendário — atualização de 22/09/2026
Correção de ativação: SUPABASE_SERVICE_ROLE_KEY estava vazia; configurada no ambiente privado e RPC inbox_auto_targets validada (HTTP 200). Consumidor disponível; ativação continua explícita por canal. Interface atualiza disponibilidade sem substituir formulários não salvos e informa a causa de bloqueios.
Entregues: canvas com validação no servidor/banco, prompt gerado pelo perfil, tomada humana/retomada e consumidor durável; leitura/envio de imagem, áudio e documento até 8 MB; chat ocupa a área da página; CRM Kanban/lista e sincronização manual idempotente do WhatsApp; calendário mensal com miniaturas, página por dia, datas pela IA na aprovação da estratégia, geração sequencial do mês, upload privado de MP4 até 50 MB e aprovação da versão final.
Migrações 002–005 aplicadas no Supabase com sucesso. Testes adicionais verificam automação idempotente, pausa humana, isolamento, sincronização sem alterar etapas, datas sem substituir edições e aprovação de vídeo versionada. Nenhuma mensagem real foi enviada pelo agente.
Limitações: geração mensal de peças depende da aba aberta, mas resultados concluídos persistem; pode retomar somente o que falta. Fluxo inicia a cada mensagem, não retém etapa entre mensagens. CRM mostra até 1.000 contatos recentes; sincronização é acionada pelo usuário. Meta/Instagram/Facebook e TikTok ainda exigem homologação dos canais; calendário planeja datas e aprova material, mas não possui publicador automático nesta versão. Não considerar a publicação automática entregue.
Dockerfile e runner de produção adicionados para Next+API, com autenticação, HTTPS e cofre obrigatórios. Worker de protótipos não é iniciado em produção. Deploy autorizado pelo usuário; registrar resultado após execução.

## E-mails da conta — 22/09/2026
Preparados 13 modelos HTML em português com logo textual, cores e tipografia da Askadia, layout por tabelas, estilos inline e fallback de links. Gerador único em scripts/build-account-emails.mjs e configuração dos assuntos/avisos em supabase/templates/auth-config.json. Prévia desktop e 390 px conferida. Painel Supabase confirmou bloqueio de personalização sem SMTP próprio; credencial Resend/remetente ausentes. Configuração remota e entrega continuam pendentes do provedor e domínio verificado; nenhum e-mail real enviado. Documentação: docs/emails-da-conta.md.

Validação dos modelos: geração consistente dos 13 HTMLs, variáveis e links de autenticação preservados; pnpm check passou (145 testes, lint, tipos e builds). Envio real e aplicação remota não executados, pendentes de SMTP próprio.


## Identidade visual — 25/09/2026
Continuação da troca de identidade conforme a prancha enviada pelo usuário: verde-petróleo/lima, símbolo compartilhado, assinatura “Conversa que vira ação”, aplicações no produto, login e site. A solicitação atual substitui a orientação visual anterior de manter o estilo cinza. Escopo, verificação e limites em docs/identidade-visual-2026-09-25.md e na entrada correspondente de docs/progress.md. Sem implantação nesta etapa.


## Campanhas automáticas e geração real — 27/09/2026

Implementados localmente: preparação de propostas após a estratégia, criação de anúncios Meta/Google, revisão de orçamento/texto/criativo/região/datas, ativação automática programada depois da aprovação, pausa/cancelamento, alerta persistente de saldo e proteção contra duplicação. Formatos e limites em [tráfego e implantação](trafego-execucao-2026-09-27.md). Geração GPT Image 2.5 Sunburst real concluída e inspecionada, sem publicar a imagem. Pacote de cinco migrações preparado e validado localmente; aplicação remota/deploy/configuração OAuth Google ainda dependem de acesso. Evidências e situação dos testes em docs/progress.md.


### 27/09/2026 — Aquisição e planos
Jornada gratuita antes da IA, checkout simulado por empresa e revisão em cinco etapas implementados localmente. Novos planos: mensal R$ 1.497; anual 12 parcelas de R$ 998 (total R$ 11.976). A instrução posterior do usuário prevalece sobre os valores anteriores. Ver docs/aquisicao-planos-2026-09-27.md e docs/progress.md. Migração 202609270003 e implantação remota pendentes; nenhuma cobrança real.

## Atualização de 28/09/2026 — chat e ofertas

Onboarding de aquisição convertido em conversa em tela cheia, com campo fixo e sem rolagem externa. Mensal atualizado para R$ 1.597; semestral substitui o anual nas novas ofertas: R$ 8.000 em até seis parcelas no cartão, com ajuste de centavos na última parcela. Implementação Assistida de R$ 3.500 anunciada como brinde para os 100 primeiros clientes. Checkout continua simulado, sem reserva real de brinde. Migração incremental 202609280001; veja docs/progress.md para validação e implantação. Esta instrução posterior substitui os preços registrados em 27/09.

## MedSI — 29/09/2026

Nova direção solicitada: médicos, clínicas e consultórios, com a identidade MedSI. Aplicação local da marca, páginas, onboarding, orientação de IA, CRM, pesquisa e compatibilidade de importações. Migração incremental 202609290001 preparada; sem aplicação remota ou deploy. Consulte [entrega MedSI](medsi-identidade-2026-09-29.md) e `progress.md` para resultados finais e limites da validação.
