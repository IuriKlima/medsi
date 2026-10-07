# Progresso — 21/09/2026

> Registro histórico da primeira implementação. O prompt mestre recebido posteriormente e o estado atual estão em `askadia-requisitos.md`, `askadia-progresso.md` e `askadia-aceite.md`. Esses documentos substituem conflitos abaixo, incluindo acesso operacional do proprietário e ordem das etapas.

## Evolução pelo prompt mestre

Fundação de perfis internos/carteira, sessões auditadas, planos por empresa, delegações e importação transacional de rascunhos implementadas. 53 testes passaram; homologação com contas Supabase e integrações externas permanece pendente. O arquivo `.local/askadia-update.sql` contém somente as migrações incrementais 003 e 004 e deve ser aplicado depois da instalação inicial. Os demais módulos permanecem no escopo consolidado.

## Entrega atual
Etapas 0 e 1 executáveis. A implementação da etapa 2 (identidade, empresas e acessos) foi acrescentada; homologação com Supabase real ainda pendente.
A especificação funcional v1 do usuário foi preservada em docs/requirements-v1.md e mapeada em docs/requirements-map.md.

## Disponível na prévia local
Dashboard sem métricas fictícias, empresas em rascunho, conteúdo manual com revisão/versionamento, calendário, CRM de teste e catálogo de integrações. Rascunhos ficam no navegador e não migram automaticamente para a conta.

## Nova implementação de identidade
- /login: login, cadastro, recuperação e troca de senha via Supabase no servidor. Sem configuração, formulários ficam indisponíveis com explicação.
- /workspace: área autenticada com workspaces, seletor de empresa por usuário, criação/edição, arquivamento e restauração.
- Criar/restaurar empresa não ativa assinatura.
- Gestão de membros, convite por link válido por 7 dias, aceite vinculado ao e-mail confirmado, revogação e registro de alterações.
- Token de convite armazenado apenas como hash; link completo exibido uma vez, sem envio de e-mail.
- Proteção do último administrador e permissões explícitas por empresa.
- Proprietário do workspace gerencia metadados/equipe, sem acesso operacional automático.
- Sessão em cookies HttpOnly; BFF com validação de origem, lista de rotas e cache desativado.
- API Nest valida o token no Supabase e opera com JWT do usuário, sem service_role.
- Políticas RLS de dados, bucket privado com prefixo da empresa e RPCs transacionais auditados.
- Exportação autenticada e auditada do perfil da empresa; exportação CRM conectada vem em outra etapa.
- Seleção descarta a equipe anterior e ignora respostas atrasadas da empresa anterior.

## Validações executadas
- pnpm check: passou novamente com .env configurado e correção do retorno RPC .single(), código 0 — lint, tipos e build de web/API/worker.
- 37 testes passaram: 14 de domínio local, 9 de API/autenticação/contratos e 14 de PostgreSQL/RLS.
- PostgreSQL real via PGlite: duas empresas no mesmo workspace e uma em outro; leitura/alteração/exportação cruzadas; membro removido; escalada direta de permissão; arquivos; convites expirados/revogados/repetidos; e-mail não confirmado; último administrador; arquivamento; FK cruzada.
- HTTP Nest usa um adaptador de identidade controlado para provar os bloqueios de rota. Isso não é uma prova de login real no fornecedor.
- Arquivo consolidado .local/supabase-setup.sql aplicado em PostgreSQL/PGlite: dez tabelas criadas; segunda execução bloqueada pelo preflight. Auth/Storage usam as mesmas fixtures da suíte.
- Requisição ao servidor local GET /identity sem token: 401.
- POST /api/auth com Origin externa: 403.
- POST /api/auth com origem local e Supabase ausente: 503, sem sucesso simulado.
- Build Next gerou /login, /workspace, /preview, /auth/callback, /auth/update-password e rotas API.
- Login inspecionado no navegador a 1440×1000 e 390×844; campos bloqueados sem configuração; alternância cadastro/login verificada.
- A revisão de banco encontrou e corrigiu conflito com o identificador SQL current_role na proteção do último admin. A suíte passou após a correção.
- Concorrência: aquisição de locks padronizada entre aceite de convite, criação e alteração de membros; o aceite revalida o convite após o bloqueio. Teste multi-conexão ainda pendente em Supabase.

## Limites reais
- .env local configurado com URL e chave pública fornecidas; chave service_role não armazenada. Auth/settings respondeu 200, cadastro por e-mail habilitado e confirmação obrigatória. Consulta sem registros a workspaces respondeu PGRST205: tabela ausente no cache do esquema. Migrações remotas pendentes de execução pelo usuário.
- PGlite usa fixtures de auth/storage; não prova Auth hospedado, PostgREST, SMTP, download real ou cookies com o fornecedor.
- Fluxo completo da UI autenticada com contas reais ainda não homologado.
- Realtime não é usado por esta interface; autorização de canais e prova de revogação ao vivo continuam pendentes.
- Uploads e validação binária ficam na etapa de onboarding/arquivos.
- Convites são compartilhados manualmente. Nenhum e-mail foi enviado.
- Billing, IA, pesquisa, conteúdo multimídia, sites/domínios, anúncios e mensagens continuam pendentes.
- Nenhuma publicação, gasto em anúncios, cobrança, DNS, deploy, merge ou migração destrutiva foi executada.
- API/worker permanecem bloqueados para produção até homologação e decisão de lançamento.

## Próxima etapa
O usuário escolheu executar o SQL no painel. Arquivo .local/supabase-setup.sql reúne as três migrações em uma transação, com bloqueio inicial de objetos conflitantes. Aplicar e seguir docs/identity-setup.md para configurar URLs do Auth. Validar com contas reais o percurso cadastro → e-mail confirmado → workspace → duas empresas → convite → mudança/revogação → acesso negado em API/banco/arquivos.
Após esse aceite, iniciar etapa 3: assinatura por empresa com Asaas sandbox, entitlements e reconciliação.

## Sequência restante
3. Cobrança por empresa.
4. CRM persistente e captura/importação.
5. Onboarding, conhecimento e arquivos.
6–7. Pesquisa e estratégia com fontes/versões.
8–9. Conteúdo, vídeo, site e domínio.
10–11. Publicação e atendimento multicanal.
12–13. Tráfego, indicadores e acompanhamento.
14. Homologação completa e piloto.

## Dashboard — etapa local de 21/09/2026

Escopo independente do trabalho de fundação: reaproveitados identidade, empresas, permissões, CRM, sessão interna e componentes; protótipo /preview preservado. Sem alterações de credenciais, deploy ou execução de SQL remoto.

Entregas:
- /dashboard e /resultados, visual neutro, filtros compartilhados, 6–8 KPIs, comparação, tabelas, proteção contra resposta atrasada e memória de cálculo.
- Importação CSV assistida e auditada com modelos vazios, fatos idempotentes, correções versionadas e cobertura declarada.
- Motor de CAC/ROAS/ROI com centavos, ausência distinta de zero, escopos explícitos, clientes antigos excluídos, primeira aquisição pagante e estornos tardios rastreáveis.
- Perfil confirmado para 20 candidatos editoriais e Trends por lote/região/escala, sem ranking global falso.
- CSV/PDF privados com snapshot/metodologia e permissão financeira revalidada.
- Migração aditiva 202609219001_dashboard.sql e adaptadores/contratos de leitura, sincronização e diagnóstico.

Validação final: pnpm check passou (lint, typecheck, 91 testes em 7 arquivos e build de API/worker/web). Testes novos de dashboard cobrem finanças, períodos, corridas, CSV, Trends, temporalidade social, PostgreSQL/RLS, importação/revisões, permissões/exportações, consultas HTTP com fixtures, revogação/retry do processador e estrutura do PDF. Resultado numérico de ROI 75% confirmado. Testes não fazem chamadas reais a provedores.

Navegador: /dashboard sem sessão redirecionou para /login; aba temporária de inspeção encerrada. Não houve homologação visual autenticada, móvel ou com contas externas reais.

Limites: migração remota pendente; APIs não homologadas. Cofre/OAuth, normalização e persistência automática, repositório de jobs/checkpoints e ativação do consumidor ainda pendentes. Gestão não informada. Conciliação automática de CRM, fila de ambiguidades, atribuição automática, rateio por coorte, métricas individuais do atendente e IA ativa ainda não implementados. O botão Atualizar leitura consulta o banco, sem simular job externo. CSV é o caminho funcional inicial após aplicar as migrações. Permissões financeiras possuem RPC, mas a tela de equipe ainda não expõe esses controles.

Próxima etapa concreta: aplicar as migrações na ordem, validar dois tenants com usuários reais e importar um relatório pequeno conciliável; depois definir fornecedor/unidade e autorizações das contas para implementar e homologar o fluxo automático. Detalhes em docs/dashboard-auditoria.md, docs/dashboard-metricas.md e docs/dashboard-integracoes.md.

## Correção do cadastro — 21/09/2026
O endpoint POST /identity/workspaces retornava o UUID como texto/html pelo Nest. O proxy web esperava JSON e exibia 503 depois de o banco já ter criado a área. Corrigido para responder {id}, com consumo correspondente na tela. Adicionado teste HTTP que falhou antes da correção (Content-Type text/html) e passou depois (201, application/json, ID correto e uma chamada à RPC). Os 10 testes de identidade/API passaram.
Na sessão autenticada do usuário, foram encontradas duas áreas resultantes das tentativas anteriores, ambas sem empresas. Foi usada a primeira área existente para cadastrar a empresa solicitada; a interface confirmou o registro persistido como rascunho, sem contratação. A área duplicada foi preservada. Nenhuma migração foi necessária para esta correção.

Validação final da correção de cadastro: `pnpm check` passou integralmente (código 0): lint, tipos, 92 testes e builds de web/API/worker. Cadastro da empresa solicitada confirmado na interface autenticada do Supabase; nenhuma cobrança ativada.

## Página pública na raiz — 21/09/2026
A rota / passa a apresentar o site institucional da Askadia, sem redirecionar automaticamente para o painel e sem carregar a prévia local. Apresentação, recursos disponíveis, evolução do produto e perguntas frequentes usam a identidade neutra existente. Todos os botões de entrada levam a /login; /workspace e demais áreas conectadas mantêm autenticação. /preview continua separado. A página pública não consulta dados privados nem depende do Supabase para renderizar. Nenhum DNS ou deploy foi alterado. Esta entrega não conclui os formulários comerciais e as demais páginas institucionais do escopo mestre.


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

Meta (configuração no painel): adicionado conjunto obrigatório de conteúdo Instagram com Facebook Login; instagram_basic, instagram_content_publish, pages_read_engagement, pages_show_list e business_management apareceram prontos para teste. Tentativa de adicionar instagram_manage_insights retornou modal da Meta “Ocorreu um erro. Tente novamente mais tarde.”; permissão NÃO habilitada. Configuração de Login para Empresas não finalizada (nenhum config_id gerado); demais permissões Pages/insights, revisão/portfólio e homologação OAuth continuam pendentes. Painel Easypanel ainda sem sessão autenticada. Domínio público/produção não alterados.

## Versionamento para hospedagem — 22/09/2026
Repositório local inicializado em main e origin configurado para https://github.com/IuriKlima/askadia.git, que estava vazio. Primeiro snapshot reúne aplicação, contratos, migrações, documentação, testes e CI. .gitignore ampliado para excluir cache pnpm e logs; .env, .local, dependências e builds continuam excluídos. README atualizado para distinguir implementação atual, validações e dependências de produção.
Validação antes do commit: pnpm check passou integralmente (lint, tipos, 123 testes em 9 arquivos e builds dos três aplicativos). Inspeção dos 157 arquivos preparados não encontrou valores das credenciais configuradas nem padrões comuns de chaves privadas, tokens GitHub, Google/OpenAI/Gemini ou JWTs. .env.example contém apenas placeholders e configuração pública de exemplo.
Este registro não representa deploy. Permanecem pendentes a preparação dos serviços para containers, revisão dos bloqueios explícitos de produção, configuração segura no Easypanel, DNS/HTTPS e homologação das integrações. Nenhuma migração remota, publicação, mensagem ou campanha foi executada nesta etapa.

## Caixa de entrada e assistência por empresa — 22/09/2026
Causa confirmada: a Evolution estava conectada e tinha histórico, mas a tela anterior só consultava registros internos da migração 006, ausente na base remota (PGRST205). Nova caixa consulta o histórico real da instância autorizada, em duas colunas, com flags de canais, busca, paginação, leitura de grupos, atalhos e tela cheia. Envio textual requer tomada humana e reserva idempotente; não foi enviado texto a contatos durante a validação.
Adicionada Configuração de Atendimento por empresa/canal, com prompt GPT-4o mini, regras ordenadas de fluxo e teste sem envio. Histórico fica na Evolution; configurações, atalhos e responsáveis ficam no Supabase. IA atualmente sugere para revisão humana; automação por webhook/consumidor e Direct Meta/TikTok continuam dependências de implementação/homologação, exibidas na interface.
Migração 202609220001 e pacote condicional 006 testados em PGlite. Pacote aplicado no projeto Supabase autenticado pelo navegador; SQL Editor confirmou sucesso. Acesso anônimo a company_conversations, company_service_settings e company_quick_replies retorna 401/42501. Interface real reconheceu WhatsApp conectado e 1.745 conversas, abriu mensagens e alternou para tela cheia. Chave Gemini atualizada apenas no .env privado e API sinalizada para recarga.
Contrato, navegação, permissões e limites em docs/atendimento-caixa-entrada.md. pnpm check passou (131 testes, lint, tipos e builds); ajustes posteriores de apresentação/limpeza de erro transitório serão verificados antes da entrega.

## Verificação adicional de interface e IA
No navegador autenticado: WhatsApp reconhecido como conectado, consulta real de histórico, alternância de tela cheia e layout desktop verificados. Prompt inicial de atendimento salvo para WhatsApp da empresa aberta; alternar para Instagram mostrou configuração independente. Teste sem envio com pergunta fictícia sobre modalidades retornou resposta real do GPT-4o mini coerente com o perfil confirmado (musculação, pilates, luta e natação). Não houve envio para um contato. Ajustado aviso transitório de leitura para não manter erro após recuperação nem apagar alertas de envio incerto.

## Atendimento, CRM e calendário — atualização de 22/09/2026
Correção de ativação: SUPABASE_SERVICE_ROLE_KEY estava vazia; configurada no ambiente privado e RPC inbox_auto_targets validada (HTTP 200). Consumidor disponível; ativação continua explícita por canal. Interface atualiza disponibilidade sem substituir formulários não salvos e informa a causa de bloqueios.
Entregues: canvas com validação no servidor/banco, prompt gerado pelo perfil, tomada humana/retomada e consumidor durável; leitura/envio de imagem, áudio e documento até 8 MB; chat ocupa a área da página; CRM Kanban/lista e sincronização manual idempotente do WhatsApp; calendário mensal com miniaturas, página por dia, datas pela IA na aprovação da estratégia, geração sequencial do mês, upload privado de MP4 até 50 MB e aprovação da versão final.
Migrações 002–005 aplicadas no Supabase com sucesso. Testes adicionais verificam automação idempotente, pausa humana, isolamento, sincronização sem alterar etapas, datas sem substituir edições e aprovação de vídeo versionada. Nenhuma mensagem real foi enviada pelo agente.
Limitações: geração mensal de peças depende da aba aberta, mas resultados concluídos persistem; pode retomar somente o que falta. Fluxo inicia a cada mensagem, não retém etapa entre mensagens. CRM mostra até 1.000 contatos recentes; sincronização é acionada pelo usuário. Meta/Instagram/Facebook e TikTok ainda exigem homologação dos canais; calendário planeja datas e aprova material, mas não possui publicador automático nesta versão. Não considerar a publicação automática entregue.
Dockerfile e runner de produção adicionados para Next+API, com autenticação, HTTPS e cofre obrigatórios. Worker de protótipos não é iniciado em produção. Deploy autorizado pelo usuário; registrar resultado após execução.

Validação final desta etapa: pnpm check passou (145 testes em 11 arquivos, lint, tipos e builds). Navegador confirmou checkbox automático habilitado, fluxo salvo respondeu ao teste fictício sem envio, calendário exibiu 12 datas persistidas após chamada real OpenAI. Revisão dos 182 arquivos não encontrou credenciais do ambiente.

Deploy confirmado em 22/09/2026: commit 746dad1 construído e implantado no Easypanel askadia/askadia; HTTPS askadia.com.br e /login 200, API inbox sem sessão 401. Domínio principal e destino 3000 configurados, variáveis privadas salvas, Supabase Site URL e callbacks ajustados. Ver docs/deploy-easypanel.md.

## E-mails da conta — 22/09/2026
Preparados 13 modelos HTML em português com logo textual, cores e tipografia da Askadia, layout por tabelas, estilos inline e fallback de links. Gerador único em scripts/build-account-emails.mjs e configuração dos assuntos/avisos em supabase/templates/auth-config.json. Prévia desktop e 390 px conferida. Painel Supabase confirmou bloqueio de personalização sem SMTP próprio; credencial Resend/remetente ausentes. Configuração remota e entrega continuam pendentes do provedor e domínio verificado; nenhum e-mail real enviado. Documentação: docs/emails-da-conta.md.

Validação dos modelos: geração consistente dos 13 HTMLs, variáveis e links de autenticação preservados; pnpm check passou (145 testes, lint, tipos e builds). Envio real e aplicação remota não executados, pendentes de SMTP próprio.

## Campanhas, gestão e Meta — trabalho em andamento, 22/09/2026
Implementação local das duas áreas de campanhas, condições de aniversário/ausência, importação CSV e API de recebimento por empresa com chave revogável. Consumidor com aprovação de versão, consentimento, atualização, janela de horário e proteção de duplicação. Migrações 006–008 ainda NÃO aplicadas remotamente; MESSAGE_CAMPAIGNS_ENABLED permanece desligado por padrão. Ver docs/campanhas-relacionamento.md. Validação final pendente.
Meta: causa do Invalid Scopes confirmada no painel: pages_manage_posts e read_insights ainda não adicionados ao caso de uso. Ambas adicionadas e verificadas como Pronto para teste; instagram_manage_messages, pages_manage_metadata e pages_messaging também confirmados. Caso de uso Messenger incluído com autorização explícita do usuário. Código local passa a solicitar grupos de permissões escolhidos e informar acesso recebido por recurso. App continua não publicado; contas externas dependem da revisão/portfólio. Publicador, sincronização de insights, operação de anúncios e canais de mensagem Meta ainda não estão implementados de ponta a ponta.
E-mails: usuário escolheu Resend. Aba de cadastro aberta e aguardando conclusão pelo usuário; modelos e SMTP ainda NÃO aplicados, envio personalizado não ativo.

Validação local concluída: pnpm check passou (151 testes em 12 arquivos, lint, tipos e builds). Navegador público avançou para o diálogo normal do Facebook Login sem Invalid Scopes; autorização/seleção de ativos ainda não concluída. Isso confirma a remoção do bloqueio de escopos, não a operação completa dos recursos Meta.

Execução das migrações remotas bloqueada pela revisão automática: autorização anterior interpretada como execução pelo próprio usuário. Pacote .local/askadia-campanhas.sql inserido e conferido no SQL Editor, mas NÃO executado. Consulta prévia confirmou ambas as tabelas principais ausentes. Solicitada autorização específica; aguardando resposta. Não implantar as rotas novas antes da instalação do banco.

Após autorização explícita “Autorizo executar as migrações”, pacote 006–008 aplicado em transação no Supabase. SQL Editor confirmou “Success. No rows returned”. O alerta genérico do editor não reconheceu a configuração dinâmica de RLS; o SQL executado habilita RLS nas três tabelas públicas e revoga acesso às tabelas privadas. Nenhuma campanha foi criada/ativada e nenhum aluno foi importado durante a migração.

Deploy concluído: commit 6189426, Easypanel Success em 22/09/2026 17:52:20 UTC. Site/login 200; APIs sem autenticação 401. MESSAGE_CAMPAIGNS_ENABLED=true autorizado separadamente, salvo e conferido ao reabrir Environment. RLS confirmada nas três tabelas públicas pelo SQL Editor. Página de campanhas autenticada carregou as duas opções, zero alunos e fuso America/Sao_Paulo; nenhuma importação/campanha real criada, ativada ou enviada durante testes. E-mails continuam pendentes de conclusão do cadastro/login Resend. Não considerar SMTP, homologação de entrega ou operação completa Meta/Wellhub/TotalPass entregues.

Conferência adicional em produção: formulário Nova campanha abre com data e fuso corretos; selecionar ausência exibe o campo de dias; cancelar não grava rascunho. Aba Tráfego Pago exibe propostas reais da estratégia, explicitamente sem anúncios ativos. Resend permanece na tela de cadastro, aguardando usuário; envio com identidade visual ainda não ativado.

## Experiência, CRM, Meta, anúncios e sites — 22/09/2026
Implementadas a estratégia detalhada com revisão/feedback e checklist, redirecionamento de Agentes, chat de onboarding reabrível, seleção de locais por mapa/raio/lista, limite de duas publicações semanais em novos planejamentos e separação de textos/designs. CRM com histórico e métricas da amostra; campanhas para contatos selecionados com consentimento; leitura/resposta textual Meta; OAuth e hierarquia real Google Ads/Meta, propostas de investimento limitadas ao teto.
Meu site agora gera rascunho a partir do perfil confirmado, permite editar, selecionar materiais, visualizar desktop/mobile, baixar HTML, publicar versão e retirar do ar. Hospedagem em /s/[empresa], domínio próprio verificado por TXT/CNAME/A e subdomínio exclusivo da Askadia. Encaminhamento HTTPS automático preparado via API Easypanel; credencial administrativa e DNS wildcard ainda pendentes.
Validação: pnpm check passou (164 testes em 14 arquivos, lint, tipos e builds). Alterações finais de mapa padrão e upload múltiplo terão verificação adicional antes do commit. As migrações 009–013 foram inicialmente bloqueadas pelo revisor automático por falta de autorização específica; após resposta explícita “sim”, pacote integral conferido (34.035 caracteres) e executado no Supabase: “Success. No rows returned”. Nenhum cadastro apagado, envio/campanha ativado ou site real publicado no teste. Navegador local confirmou histórico de onboarding e botão para refazer entrevista.
Relatório, navegação, capacidades e dependências: docs/experiencia-sites-integracoes.md. Deploy/commit ainda pendentes nesta etapa.
`nVerificação adicional: lint passou; diagnóstico real do Google retornou ApiNotActivatedMapError na chave de navegador. Habilitação de Maps JavaScript API solicitada ao usuário. Interface mantém mapa padrão, informa bloqueio de autorização e oferece lista. Meu site carregou os controles após migração.

Complemento solicitado: Meu site separado em Prévia e Domínio, editor fechado por padrão; layout com capa fotográfica ampla, faixas na cor da academia e seções de serviços/galeria/contato. GPT-5 específico para site. Descrições internas com Gemini 3.5 Flash-Lite; 2.5 Flash-Lite aparecia na consulta de modelos, mas a geração real retornou 404 com orientação de migração. A geração real com 3.5 respondeu 200. Migração 014 executada no SQL Editor com Success; fila confirmou três imagens existentes em ready, com modelo persistido. As descrições são observações visuais, não fatos comerciais nem autorização de uso.
Validação adicional: oito testes de sites/fila passaram. Primeira suíte completa após 014 revelou ausência do papel service_role em quatro fixtures antigas; fixtures atualizadas para representar o Supabase. Reexecução e build em andamento. Navegador integrado passou a não responder; recuperação solicitada ao usuário para validar visualmente e concluir deploy. Nenhum site real publicado nem mensagem enviada.
Validação final: lint e typecheck passaram; após ajuste dos quatro fixtures, 165 testes em 14 arquivos passaram e o build completo API/worker/Next terminou com sucesso. Varredura dos arquivos alterados não encontrou valores de credenciais do .env. Pacotes 009–014 aplicados remotamente; três imagens da empresa verificadas em ready com Gemini 3.5 Flash-Lite. O usuário acionou um deploy antes do envio deste commit; esse deploy não contém estas alterações locais. Navegador integrado indisponível na etapa final, portanto implantação desta revisão ainda precisa ser confirmada.

## Ficha do lead e orientação editorial — 22/09/2026
CRM: ficha redesenhada com identificação, etapa, contato, indicadores da amostra, últimas interações e linha do tempo. Botão destacado abre a conversa interna; link funciona também para conversas fora da primeira página. Nomes reais disponíveis no histórico/chat substituem identificadores numéricos na apresentação, sem sobrescrever nomes manuais nem tratar LID como telefone. Vínculos são consultados pelos contatos exibidos, em lotes limitados e com filtro de empresa/canal.
Calendário: diagnóstico autenticado confirmou estratégia do perfil v2 de outubro em review, com oito ideias e aprovação pendente; nenhuma estratégia foi aprovada pelo agente. Nova trilha Planejar → Criar → Revisar → Aprovar → Programar, aviso e acesso à revisão no topo e prévia dos temas da estratégia. Geração de textos precede a organização das datas, preservando textos se o planejamento falhar. Status considera mídia e aprovação da revisão atual. Programação automática continua explicitamente pendente da integração de publicação; data planejada não é agendamento confirmado. Nenhuma migração adicional necessária.
Validação em andamento: testes de nomes/autor de mensagens e revisão dos criativos adicionados. Calendário local conferido visualmente com o aviso das oito ideias. Commit/deploy desta revisão ainda pendentes.
Validação concluída: pnpm check passou, com 169 testes em 16 arquivos, lint, typecheck e builds de API/worker/Next. Conferência no navegador confirmou estratégia de outubro em review e a nova trilha no calendário. Não houve aprovação, publicação ou mensagem de teste real. O acesso ao servidor local oscilou durante a conferência da ficha; validação após deploy ainda pendente.

## Preparação automática após onboarding — 22/09/2026
Deploy anterior 5147526 concluído no Easypanel (Success, 22/09/2026 21:36:19 UTC). Conferência local da ficha com dados reais e abertura da conversa pelo botão concluídas, sem envio. Nova solicitação: preparação automática de estratégia, textos e designs em rascunho após confirmação do perfil, sem aprovação implícita.
Migração 015 adiciona fila durável por empresa/versão, RLS, autorização do solicitante revalidada, lease e token, até três tentativas por etapa e preservação de quotas existentes. Rotinas de preparação privadas permitem rascunhos antes da revisão da estratégia; aprovação final continua usando as validações originais. Datas novas partem do dia atual em America/Sao_Paulo, avançam entre meses com máximo de duas por semana e preservam datas existentes. Vídeos recebem roteiro e aguardam upload humano. Worker servidor retoma peças ausentes após reinício; estado/progresso aparece no calendário, que passa a ser o destino após onboarding. Não há serviço de publicação automática nesta mudança.
Cinco testes da fila passaram (incluindo conclusão de todas as artes sem aprovação/publicação): isolamento, confirmação idempotente, limite semanal/data atual, rascunhos sem aprovação, recuperação de lease, rejeição de worker antigo e invalidação por mudança do perfil. Oito testes existentes de sites/permissões passaram com a nova migração. Validação completa e instalação remota da 015 pendentes.

Validação completa: pnpm check passou (lint, typecheck, 174 testes em 17 arquivos e builds API/worker/Next). Nenhuma credencial do .env foi encontrada nos arquivos alterados. A conexão CDP das abas Supabase e Easypanel expirou repetidamente, inclusive ao tentar uma aba nova; reabertura solicitada ao usuário. Migração 015 e deploy ainda não executados. A produção permanece na revisão 5147526.
Navegador recuperado após o build. Migração 015 conferida integralmente no editor (checksum normalizado igual ao arquivo local) e executada no Supabase: Success. No rows returned. Sem exclusão de cadastros, aprovação de peças ou publicação. Deploy desta revisão será realizado em seguida.
Deploy 43d51af acionado e build concluído no Easypanel em 23/09/2026 11:47:54 UTC. Validação após build encontrou falha real de inicialização da API: Production requires HTTPS origin, Supabase authentication and the configured encryption vault. O editor Environment Variables foi confirmado vazio por leitura do conteúdo visível. Domínio ainda apresenta interface anterior; não considerar a nova automação operacional em produção. Arquivo ignorado .local/easypanel-production.env preparado com credenciais locais existentes (mesma chave de cofre), WEB_ORIGIN HTTPS e CONTENT_AUTOPREP_ENABLED=true. Solicitado ao usuário preencher/salvar o ambiente, sem enviar segredos no chat. Após salvar, refazer deploy e validar calendário/fila. Nenhuma publicação aprovada ou enviada nesta verificação.
23/09/2026 — Cadastro automático de domínio ao publicar: o endpoint de publicação agora chama o adaptador Easypanel somente após a transação de publicação aprovada. Usa o subdomínio já reservado e apenas domínios próprios com DNS verificado, reutiliza mapeamentos existentes e preserva a publicação se a hospedagem falhar. A interface apresenta o resultado da hospedagem separadamente da publicação. Seis testes de adaptador adicionados (requisições simuladas, sem criar domínio/site real). pnpm check em andamento. Painel v2.34.0 mostra somente usuário ADMIN e Generate API Key; usuários adicionais restritos exigem Growth/Business. Confirmação solicitada antes de conceder à aplicação uma chave administrativa ampla. DNS wildcard no Registro.br e homologação real da API continuam pendentes.
Validação do cadastro ao publicar: pnpm check concluído com sucesso (lint, tipos, 180 testes em 18 arquivos e builds API/worker/Next). Os testes de hospedagem usam respostas simuladas; acesso real aguarda autorização da chave de API e configuração do DNS. Não foi publicado site real para testar.
Deploy do commit ae75d79 concluído no Easypanel em 23/09/2026 12:41:25 UTC (Success / App deployed). Página autenticada Meu site recarregada após implantação: dados, editor e prévias desktop/mobile carregaram. O rascunho da empresa ainda não está publicado e a interface exige informar o WhatsApp para liberar Publicar. Não houve publicação de teste. Cadastro automático de domínio permanece pendente da autorização para chave administrativa e do DNS wildcard no Registro.br; a execução real da API não foi homologada.

## Auditoria da jornada e melhorias de UI/UX — 23/09/2026
Revisão da entrada, onboarding, estratégia, calendário, CRM, atendimento, campanhas, integrações, site, resultados e assinatura. Relatório: docs/auditoria-ui-ux-2026-09-23.md. Nova visão geral orientada por pendências reais, menu estável, tipografia e ações responsivas, índice/revisão na estratégia, calendário com mês atual de São Paulo, anterior/próximo/hoje e lista legível no celular. Estados de carregamento, erro, repetição e busca vazia mais claros.
Corrigidos: renovação da sessão nas rotas da jornada; leitura segura de erros não JSON; mensagens de domínio ocultas; recarga de domínio que apagava edições não salvas; perda de todas as imagens quando apenas uma falhava; avisos estáticos contraditórios sobre integrações. Sem mudança de RLS, aprovações ou ativação de envios.
Validação: pnpm check passou integralmente (lint, tipos, 186 testes em 19 arquivos e builds API/worker/Next). Seis testes novos cobrem respostas de API e navegação mensal/fuso. Revisão prévia autenticada confirmou preparação concluída, estratégia em revisão, WhatsApp conectado em modo humano, ausência de campanhas e pendências Meta/Google. Nenhuma mensagem enviada, campanha ativada, estratégia aprovada ou site publicado durante a auditoria. Validação visual da nova versão e implantação serão registradas abaixo.

Deploy e conferência final: aplicação e789eb9 enviada para main; Easypanel confirmou Success / App deployed em 23/09/2026 14:29:10 UTC. Produção autenticada mostrou nova visão geral, pendências, edição de estratégia com foco, navegação de meses/Hoje/retorno do dia, menu mobile e lista automática no calendário. Em viewport de 390 px, calendário e site sem transbordamento horizontal. Meu site exibiu as duas abas, prévias e bloqueio por WhatsApp ausente; CRM exibiu busca sem resultado e restaurou os cartões ao limpar. Caixa de entrada carregou conversas sem erro de console observado. Nenhuma alteração de dados reais nas verificações. API de desenvolvimento iniciada pelo agente encerrada; servidor Next já existente do usuário mantido. SMTP/Resend, Maps, Meta/Google Ads e infraestrutura de domínio continuam com as dependências documentadas; publicação social automática completa e cobrança real não estão entregues.

## Site comercial e landing pages — 23/09/2026
Página pública refeita com foco na solução para academias e copy de aquisição. Novas rotas: /lp/marketing-fitness, /lp/atendimento-fitness, /sobre, /contato e /suporte. Header/rodapé compartilhados, navegação mobile, prévias ilustrativas identificadas, FAQ, metadados por página e sitemap. CTAs abrem diretamente o cadastro via /login?modo=cadastro, preservando login e recuperação. Sem métricas, clientes, depoimentos ou garantias de resultado inventados; recursos em evolução descritos nas perguntas pertinentes.
Contato usa apenas canais oficiais configurados por PUBLIC_SALES_WHATSAPP, PUBLIC_CONTACT_EMAIL e PUBLIC_SUPPORT_EMAIL. Proprietário foi consultado e ainda não informou esses canais. Formulário preparado para abrir mensagem no WhatsApp/e-mail, com confirmação de envio pelo próprio visitante; não simula recebimento nem persiste leads. Sem canais, cadastro e central de ajuda permanecem disponíveis, com atendimento direto explicitamente pendente. Ver docs/site-comercial-askadia.md.
Validação local: pnpm check passou integralmente (lint, tipos, 186 testes em 19 arquivos e todos os builds). Prévia desktop da home e LP de marketing, duas LPs em 390 px, Sobre/Contato/Suporte sem transbordamento horizontal. CTA abriu formulário de cadastro real e FAQ de suporte abriu a orientação correta. Nenhuma conta, mensagem, e-mail ou campanha criada/enviada no teste. Implantação autorizada em andamento.

Deploy concluído: commit 7cf4c26 enviado para main, Easypanel confirmou Success / App deployed em 23/09/2026 15:28:07 UTC. Conferência em askadia.com.br confirmou a nova home, ambas as landing pages, Sobre, Contato e Suporte, com títulos próprios. CTA abriu o formulário de cadastro e a pergunta de suporte sobre WhatsApp/IA expandiu a orientação correspondente. Nenhum formulário enviado. Canais oficiais de WhatsApp/e-mail continuam pendentes de informação do proprietário; atendimento direto não foi declarado ativo. Aba pública da nova home mantida disponível para revisão.

## Visão geral: BI e inteligência regional — 23/09/2026
Dashboard de CRM/campanhas com filtros de período/fuso, gráficos, contagens exatas, bloco financeiro reutilizando o BI autorizado, população/densidade IBGE, consulta Google Places por raio, lista e mapa de concorrentes, Facebook Pages Search e visualização oficial Google Trends ao lado do mapa. Ranking próprio de até 20 via adaptador opcional, sem scraping nem valores simulados. Fontes, datas e coberturas parciais explícitas. Próximos passos da jornada preservados.
`pnpm check` passou: lint, tipos, 198 testes em 20 arquivos e builds. Homologação de leitura: 1.735 contatos no CRM; Google retornou 19 concorrentes em 3 km e cinco em 1 km; IBGE confirmou São Paulo, população/densidade do Censo 2022. Corrigida resposta Google sem types em componente de endereço. Isolamento por empresa, revalidação de permissões e limites de consumo testados.
Pendências: Maps JavaScript API desativada e Cloud sem login; Facebook não autorizou Pages Search; ranking próprio Trends requer provedor. BI financeiro depende da migração existente 9001: pacote conferido no editor, execução bloqueada pela revisão automática por falta de autorização específica; confirmação solicitada, sem execução. Detalhes em docs/visao-geral-bi.md. Deploy e validação responsiva em conclusão.

Implantação concluída: commit 20064b3 enviado para main; Easypanel confirmou Success em 23/09/2026 16:53:41 UTC. Produção autenticada exibiu os indicadores de CRM/campanhas, filtro de sete dias, IBGE e 19 locais em 3 km. Google Trends incorporado renderizou pesquisas relacionadas e barras reais em produção. Layout mobile conferido em largura CSS de 375 px sem transbordamento horizontal. Controles de período e raio conferidos. As dependências Maps/Meta e a migração financeira bloqueada continuam explícitas. Servidores locais preexistentes preservados; tentativas duplicadas iniciadas pelo agente encerradas.

Verificação adicional encontrou falha do SDK Maps ao selecionar um concorrente depois de ApiNotActivatedMapError: o descarte de um marcador incompleto lançava getRootNode e derrubava o componente. Correção isola falhas de limpeza de recursos externos e impede inicialização após falha de autorização; lista permanece utilizável. Teste de regressão específico passou e typecheck web passou. A repetição integral de pnpm check foi interrompida durante typecheck por lentidão do ambiente/navegador, após lint passar; a suíte de 198 testes e builds anteriores permanece registrada, sem atribuir esse resultado ao novo teste. Build e publicação da correção em andamento.

Correção c49a7f9 enviada para main. O build local adicional não concluiu e foi interrompido; build Docker e deploy dessa correção ainda pendentes. O navegador passou a expirar inclusive ao selecionar o Easypanel, apesar de recuperação da sessão e fechamento das abas auxiliares. Solicitado ao usuário reabrir o painel ou acionar Deploy. A revisão 20064b3 permanece como último deploy confirmado; não declarar a correção do descarte do mapa ativa em produção. A migração 9001 não foi executada: continua aguardando a autorização específica solicitada após bloqueio automático. Nenhuma mensagem, anúncio, site ou publicação real enviado/ativado nos testes.


## Continuação da identidade visual — 25/09/2026
Mantidas e completadas as alterações de marca já presentes no workspace. Identidade verde-petróleo/lima, símbolo vetorial e assinatura “Conversa que vira ação” aplicados ao site, login, navegação, favicon, cartões e controles. Nova aplicação da marca na home, contornos no login e símbolo no hero da prévia local; removidas ocorrências visuais remanescentes do “a” antigo nos componentes. Calendário, CRM e dashboard compartilham os tokens. Fonte de sistema preservada; vetor é interpretação da prancha, não arquivo oficial fornecido. Detalhes em docs/identidade-visual-2026-09-25.md.

Validação visual local concluída em oito rotas (/, /login, /preview, duas LPs, /sobre, /contato e /suporte), nas larguras 1440 e 390 px: HTTP 200, marca carregada, sem transbordamento horizontal e sem erros de página. Cadastro, recuperação e CTA conferidos sem submissão. Capturas desktop/mobile de home, login e prévia em .local/brand-review; dados fictícios continuam identificados. Contraste dos tokens: CTA 11,28:1, texto secundário/fundo 4,89:1 e texto claro/fundo escuro 9,87:1.

Verificação: lint e typecheck do pnpm check passaram. A suíte completa teve 194 testes aprovados e cinco falhas em campaigns.test.ts. Diagnóstico: o nascimento fictício usava a data UTC de hoje, que após 21h de São Paulo podia ser futura para current_date do banco. Ajustado somente o fixture para o ano 2000, preservando mês/dia UTC; regras de produção inalteradas. Reexecução do arquivo: sete testes passaram (199 cenários distintos com resultado positivo na combinação das execuções). Menu mobile, abertura de Calendário/CRM e foco por teclado também passaram. Import ausente de BrandContours identificado na primeira revisão da prévia e corrigido. Build completo de contratos, integrações, API, worker e Next.js concluído com sucesso; git diff --check sem erros. A versão compilada também foi servida localmente na porta 3100 e conferida em /, /login e /preview nas duas larguras: sem erros de página/transbordamento e com cadastro, recuperação e CTA funcionando sem submissão. Capturas e relatório em .local/brand-production. Servidor local mantido para revisão, sem implantação remota.

Limites: sem revisão autenticada com dados reais nesta etapa, sem alterações de backend/banco ou das marcas dos clientes. Nenhum formulário real enviado e nenhum deploy executado. Próxima etapa: revisão da área autenticada e implantação quando autorizada.


## Onboarding e operação guiada por aprovação — 26/09/2026

Decisões e limites em [onboarding-operacao-guiada.md](onboarding-operacao-guiada.md). Implementadas as cinco etapas da estratégia após onboarding, guia de próximos cliques, revisão de concorrentes antes do diagnóstico, planos macro/médio/curto, calendário proposto e aprovações vinculadas à versão. Alterações invalidam etapas dependentes; nova coleta durante a revisão impede aprovar dados diferentes dos exibidos. Filas duráveis geram recomendações e site sem sobrescrever edições, preservam rascunhos e aguardam as aprovações. Artes entram na janela de sete dias anterior à postagem e continuam exigindo aprovação individual.

Instagram: seleção confirmada de perfis locais e de inspiração, busca com URLs verificadas nas fontes e adaptador Business Discovery. Acompanhamento aproximadamente horário, com amostra, horário e métricas ausentes explícitos; apenas duas últimas coletas, sem inventar série histórica. Coleta real desabilitada até homologação. Biblioteca de anúncios comerciais brasileiros permanece consulta manual identificada.

Qualidade: carrosséis em 2K, sistema visual compartilhado e referência à primeira página da mesma revisão. Sites com títulos específicos, composição editorial/imersiva, materiais autorizados e layout adaptado à ausência de fotos. Modelos recomendados documentados; nenhuma configuração secreta foi alterada nem houve geração paga para esta validação.

Execução: mensagens aprovadas seguem a programação existente sem novo comando, com público, texto, fuso, período e limite visíveis. Edição devolve a campanha a rascunho. Alertas Meta consultam situação da conta e diferenciam restrição de indisponibilidade; conta ativa não comprova crédito. A ativação automática de tráfego e o publicador de posts permanecem pendentes de implementação e homologação, assim como o aviso persistente de saldo insuficiente baseado em evidência do provedor. Não apresentar propostas como anúncios ativos.

Validação: pnpm check passou (lint, tipos, 210 testes em 24 arquivos e builds). Os novos cenários cobrem a janela de envio sem segunda ativação, invalidação após edição, coleta alterada durante revisão e repetição idempotente de aprovação. Revisão visual local das cinco etapas, da preparação e da landing page nas larguras 1440 e 390 px: sem transbordamento horizontal nem erros de página; navegação após aprovação conferida. Tipografia mobile ajustada após inspeção das capturas. Fixtures sempre identificados; capturas em .local/launch-qa. Build adicional concluído com sucesso, incorporando o último ajuste de tipografia dos contratos. Nenhuma migração remota, deploy, publicação, anúncio ou mensagem real executados. Migrações novas 202609260001, 202609260002 e 202609260003 aguardam homologação antes da implantação.


## Modelos, imagens do site e criativos de tráfego — 27/09/2026

Aplicados no .env local e nos padrões por função: GPT-6 Astra para estratégia/orquestração/sites/anúncios, Sol para copy e datas, Luna para conversa/busca/atendimento; Gemini 3 Pro Image preservado para artes em 2K. Registro central resolve ambiente em cada chamada. Leitura autenticada do catálogo OpenAI retornou HTTP 200 para os três modelos, sem geração paga. Ambiente de produção não alterado.

Edição de fotos dos sites dos clientes e criativos de propostas de campanha implementados com fila durável, materiais privados por empresa, revisão antes de aplicar, original preservado e novas variações. Novas propostas enfileiram peças e aguardam aprovação estratégica. Migração 202609270001 adiciona RLS, autorização, idempotência, lease/token, quotas, revalidação da versão e auditoria. Nenhuma arte é publicada automaticamente. Fluxo e próximos passos concretos do executor Meta/Google em [modelos-imagens-trafego-2026-09-27.md](modelos-imagens-trafego-2026-09-27.md).

Validação concluída: pnpm check passou (lint, tipos, 216 testes em 25 arquivos e builds). Testes específicos cobrem materiais de outra empresa, pedido repetido/alterado, original preservado, mudança de perfil, gate estratégico da campanha e falha do provedor. UI em 1440 e 390 px: editar, aplicar/salvar rascunho sem publicar e gerar variação da campanha correta; sem erros de página/transbordamento. Capturas em .local/visual-qa, com fixtures identificados. git diff --check limpo.

Limitações: migração nova não aplicada remotamente; nomes dos modelos precisam chegar ao ambiente de destino com o deploy. Qualidade de geração real pendente de homologação. Não houve mensagem, post, site ou anúncio real publicado/ativado. Tráfego automático ainda exige implementar/homologar executor, aprovação específica e alerta persistente de saldo; Google também carece de OAuth e developer token no ambiente inspecionado. Conectar uma conta ou gerar uma proposta não ativa anúncios.

Projeção adicional solicitada: docs/projecao-custos-ia-2026-09-27.md e JSON registram preços oficiais Standard, PTAX 5,1991 de 25/09, premissas por modelo e cenários. Padrão: USD 13,45 / BRL 69,93 em IA por mês; reserva de 30% → BRL 90,91. É estimativa, não consumo medido, sem custos de mídia/mensageria/infraestrutura. Comparação Gemini vs GPT Image 2.5 documentada sem alegar teste de qualidade ou trocar o gerador nesta pergunta.

Decisão posterior do cliente: usar OpenAI também para imagens. Migrados carrosséis, criativos e edição para GPT Image 2.5 Sunburst (high), adaptador único Images API com referências multipart e saída PNG validada. Modelo e qualidade aplicados no .env local; API de catálogo retornou HTTP 200. Painel de agentes e catálogo atualizados. Novos jobs guardam usage reportado quando disponível. Custos recalculados: padrão USD 15,95 / BRL 82,93, reserva 30% → BRL 107,80; primeiro mês padrão BRL 151,77 com reserva. Premissa USD 0,20/geração não é tarifa fixa; calculadora oficial e sensibilidade documentadas. Validação completa após troca em andamento.

Validação final OpenAI concluída: pnpm check passou integralmente (lint, typecheck, 220 testes em 26 arquivos e builds API/worker/Next). Os quatro cenários adicionais cobrem geração sem referências/usage, erro de autorização sem fallback, rejeição de PNG inválido, ordem da referência visual do carrossel e limites de dimensões/entrada. git diff --check limpo; verificação dos 68 arquivos alterados/novos não encontrou valores secretos do ambiente. Nenhuma chamada paga de geração, publicação, mensagem, ativação de anúncio, migração remota ou deploy executados.


## Execução programada de anúncios e revisão — 27/09/2026

Pedido autorizado: criação automática, programação Meta/Google, alertas de saldo, acessos Google, migrações, deploy e geração real. Acrescentados contrato de campanha executável, migração 202609270002, dois workers separados (preparação e execução), proposta automática a partir do orçamento confirmado, criação pausada nas plataformas, aprovação por versão e limite do plano, diário de passos e reconciliação, ativação na data aprovada, monitor, pausa/cancelamento e alertas destacados. Formatos iniciais: Meta imagem → site e Google Pesquisa responsivo. O manager ID Google pertence à conexão da empresa. Mudança de orçamento/conteúdo/programação invalida aprovação; alterações externas verificadas interrompem a execução. Nenhum dado de saldo é inferido de balance.

Testes específicos de banco e adaptadores passaram na rodada intermediária (12 cenários), incluindo isolamento, autorização, teto delegado, aprovação idempotente, recuperação de criação incerta, programação sem novo comando, alerta de falta de saldo e ativação do pai por último. Acrescentado teste de divergência no orçamento Google. Validação completa final em andamento, com lint e tipos já concluídos nesta rodada. Revisão de interface em fixture identificado: edição/versionamento, aprovação e pausa; largura 390 px sem overflow. Nenhum efeito em contas de anúncio.

Geração real OpenAI high confirmada: imagem 1536×1920, 2.871.589 bytes, 92 tokens de entrada e 2.257 de saída; arquivo inspecionado visualmente. Arte conceitual identificada, sem publicação. Esse teste valida o adaptador local, não um worker de produção.

Consulta remota de leitura confirmou as tabelas anteriores e a ausência das cinco tabelas principais da nova atualização. Site público e login HTTP 200; rota nova de execução ainda 404. Nenhuma migração ou deploy executados: Easypanel sem login, Supabase na conta marketing@alfafitness.com.br sem acesso ao projeto Askadia, Google sem MCC Askadia/OAuth/developer token configurados. Sessões corretas solicitadas ao usuário, sem pedir segredos no chat. Preparados pacote SQL transacional e arquivo de variáveis não secretas em .local; não substituir o ambiente remoto inteiro nem a chave do cofre.

Detalhes, limites e roteiro de implantação: docs/trafego-execucao-2026-09-27.md. Publicador social, outros objetivos/tipos de anúncio, homologação real dos conectores, configurações externas de cobrança/e-mail e acessos pendentes não devem ser anunciados como prontos.

Validação final desta execução: pnpm check passou integralmente, com lint, tipos, 236 testes em 27 arquivos e builds API/worker/Next. Os 16 cenários de anúncios incluem duração mínima Google de três dias no contrato e banco, região/palavras-chave alteradas remotamente e distinção entre elegibilidade e entrega comprovada. Correção textual da proposta verificada por lint após a suíte. git diff --check limpo; 81 arquivos sem valores secretos do .env. Prévia encerrada e abas de acesso preservadas para continuação. Nenhuma migração remota, push, deploy, criação de anúncio real ou gasto com mídia.


## Aquisição imersiva e planos por empresa — 27/09/2026

Implementados /planos, Começar grátis, boas-vindas com viagem espacial, entrevista em tela cheia, transição de ferramentas de sete segundos, escolha de plano e checkout explicitamente simulado. Anual confirmado pelo usuário: 12 parcelas de R$ 998, total R$ 11.976; mensal recorrente R$ 1.497, por empresa, mesmos recursos. Evolution preservada.

A IA só começa com assinatura válida ou aprovação do checkout de teste. Migração 202609270003 fixa preços, mantém estados idempotentes/expiração, protege confirmação por service_role, separa acesso de teste de assinatura real e bloqueia rotas e filas de IA antes do pagamento. Teste libera sete dias, sem cartão/cobrança. Recusa e cancelamento preservam briefing. O sistema retoma pelo estado persistido e exige cinco aprovações atuais antes de liberar o painel. Autorização da empresa permanece no servidor e banco.

Corrigido encaminhamento web ausente das rotas de jornada, Instagram, imagens e anúncios. Retornos OAuth retomam onboarding e preservam empresa ao limpar meta_session. Planos antigos permanecem no catálogo para compatibilidade de assinaturas existentes. Detalhamento e condições de implantação: docs/aquisicao-planos-2026-09-27.md.

Validação PostgreSQL de pagamento, isolamento, filas sem consumo, parcelas, expiração e autorização aprovada. Revisão UI em fixture sem provedores: boas-vindas, resumo, transição, planos, recusa e aprovação até a estratégia. Verificada largura 390 px sem overflow. Rodada final pnpm check em execução. Nenhuma migração remota, deploy, pagamento, envio ou geração paga nesta etapa.

Validação final da aquisição: pnpm check passou (lint, tipos, 242 testes em 29 arquivos, builds API/worker/Next). Após a revisão, adicionados refresh de sessão em /comecar, fallback do nome nos metadados do cadastro e revogação explícita de privilégios na tabela privada de acesso simulado. Rechecagem dirigida concluída: 11 testes de banco/proxy, novo build web e lint passaram. Verificação dos arquivos alterados não encontrou valores secretos do ambiente; git diff --check limpo. Sem chamadas externas, migração remota ou deploy.

## Onboarding em conversa e novas ofertas — 28/09/2026

O onboarding de aquisição agora ocupa a tela inteira, com aparência de conversa: bolhas de mensagens, etapas na lateral no computador, cabeçalho compacto no celular e campo de resposta fixo. A página não rola; somente o histórico e a revisão possuem rolagem interna. Enter envia e Shift+Enter cria uma linha. O título e o texto de abertura indicados pelo usuário foram removidos. Pesquisa de locais, referências, integrações, materiais, revisão e confirmação continuam no mesmo fluxo. O bloqueio de IA antes da confirmação do plano permanece.

Os cartões de planos aparecem mesmo quando CHECKOUT_MODE não está habilitado. Nessa situação, a contratação fica desabilitada e o usuário vê um aviso; a interface não autoriza pagamentos nem libera IA por conta própria. Novas ofertas por empresa: mensal recorrente de R$ 1.597 e semestral de R$ 8.000, com escolha de 1 a 6 parcelas no checkout de teste. Seis parcelas correspondem a cinco de R$ 1.333,33 e uma de R$ 1.333,35; o total não muda por arredondamento. Copy da Implementação Assistida de R$ 3.500 como brinde para os 100 primeiros clientes, na seleção e na página pública de planos. O teste não reserva vagas nem cobra a implementação; o controle comercial dos 100 brindes deve integrar a contratação real quando o gateway for habilitado.

Migração incremental: supabase/migrations/202609280001_pricing_semiannual.sql. Atualiza catálogo e RPC, valida parcelamento no servidor, preserva contratações anteriores e cancela checkouts pendentes das ofertas substituídas. Idempotência distingue plano e parcelas. Apenas responsáveis autorizados podem contratar; preço e total vêm do banco. Não alterada a migração anterior já distribuída.

Validação: pnpm check aprovado, com 243 testes em 29 arquivos, lint, tipos e builds completos. Os testes de comércio passaram, cobrindo 1–6 parcelas, total exato, rejeição do anual em novas contratações, permissão por empresa, idempotência e bloqueio de IA antes do pagamento. Prévia local isolada com dados fictícios: conversa no desktop (1366×543), em 390×844 e em 320×568 sem overflow externo; envio por Enter, quebra de linha com Shift+Enter, revisão, correção, confirmação e painéis de localização, referências e integrações verificados. Os dois planos e a promoção também aparecem com checkout desabilitado. Na prévia com simulação habilitada, testados seleção semestral, troca de seis para três parcelas, invalidação do aceite anterior e confirmação que abre a estratégia. Preços e promoção conferidos também na página pública; ajustado contraste do cartão semestral. Nenhuma publicação, mensagem, anúncio, cobrança ou reserva real de brinde foi feita.

Próxima etapa de ambiente: aplicar a migração incremental depois das anteriores, habilitar CHECKOUT_MODE=test na API para permitir a simulação e redeploy de API/web. Homologação externa e gateway real permanecem pendentes; deploy não executado nesta etapa.

## Jornada inicial compacta — 28/09/2026

Seleção de planos reorganizada para ocupar a altura da tela: cabeçalho reduzido, preços e botões completos, condições essenciais e oferta da Implementação Assistida na mesma tela. No celular, seletor mensal/semestral permite comparar sem empilhar cartões. Avisos de recusa/erro têm fechamento explícito e não deslocam a contratação. A página pública de planos mantém a apresentação completa.

Por orientação posterior do usuário, o padrão foi estendido às boas-vindas, transições, desbloqueio, checkout e estratégia guiada: alturas, tipografia, cabeçalhos, margens e resumos menores. O chat preserva o campo fixo. Conteúdo longo de estratégia/checkout usa área interna acessível; não há rolagem do documento. Em alturas extremas, a seleção de planos admite leitura interna para não cortar controles. Alteração de interface, sem migração, preço, regra de cobrança ou aprovação novos.

Validação: pnpm check aprovado com 243 testes, lint, tipos e builds. Após a ampliação para toda a entrada, lint e build web com TypeScript novamente aprovados. A compilação da prévia isolada também passou. A conferência visual final ficou pendente por indisponibilidade do navegador de teste: leitura, cliques e até abertura de aba vazia excederam o tempo limite, mesmo após reiniciar a sessão. Não apresentar esta revisão como visualmente homologada. A prévia usa dados fictícios, sem cobrança ou APIs reais. Próxima etapa: conferir visualmente após restabelecer o navegador e fazer o redeploy; nenhuma migração nova. Deploy não executado.


## Onboarding, Google e pesquisa de Instagram na Estratégia — 28/09/2026

- Nome e cidade em perguntas separadas; busca Google automática em seguida e confirmação explícita do estabelecimento. Cartão com endereço, atividade, telefone, site, horários, nota e quantidade de avaliações conforme disponibilidade. Dados próprios confirmados preenchem campos vazios sem apagar respostas.
- Pesquisa automática de concorrentes locais após o local/tipo, filtrada por raio quando existe posição Google confirmada. Deduplicação, exclusão da unidade própria e de locais permanentemente fechados; seleção de até dez concorrentes persistida por empresa.
- Conforme a orientação mais recente, Instagram fica em Estratégia → Concorrentes e análise. Fila durável pesquisa cada concorrente após perfil confirmado e pagamento, salva candidatos com fontes e exige confirmação da identidade para iniciar acompanhamento. Cadastro gratuito continua sem IA.
- Seleção local e perfis confirmados entram na evidência aprovada usada pela estratégia. Local alterado invalida pesquisa antiga; perfis removidos limpam vínculos. Aprovações existentes de empresas sem essa nova pesquisa mantêm a base anterior.
- Jornada compacta, tela cheia e animações preservadas; análises longas usam rolagem interna. Navegador de QA não respondeu ao getState, portanto não declarar nova validação visual realizada.
- Nova migração incremental: 202609280002_onboarding_research.sql. Ainda não aplicada remotamente. Detalhes de configuração, armazenamento e limites em docs/onboarding-pesquisa-2026-09-28.md. Google bruto não é arquivado: persistem IDs e dados confirmados pelo cliente; métricas Google aparecem na consulta ao vivo.
- Consulta real somente de leitura do Google: retorno disponível para busca por nome/cidade, com endereço/telefone/site/horários/nota; busca por raio retornou concorrente e excluiu a unidade pesquisada. Nenhuma empresa foi selecionada/alterada nesse teste. Pesquisa Instagram e métricas Meta ainda precisam de homologação autenticada após a implantação; configuração do monitor Meta não foi ativada por este trabalho. Nenhuma mensagem, anúncio ou cobrança real executados.
- Validação final: pnpm check executado; lint e tipos passaram, 255 testes passaram e um teste HTTP excedeu 20 s sob execução concorrente. Repetição isolada com a migração final: 43/43 testes de onboarding/pesquisa/estratégia passaram, incluindo o HTTP em 3 s, sem aumentar timeouts. pnpm lint final e pnpm build completos (contratos, integrações, API, worker e web/15 páginas) passaram. git diff --check sem erros.


## Checkout indisponível após deploy — 28/09/2026

O print do ambiente publicado mostra os planos e o aviso de contratação indisponível, que a interface exibe quando a API informa `testCheckoutEnabled=false`. O `.env` local já contém `CHECKOUT_MODE=test`, mas é excluído da imagem Docker. Corrigido o pacote de implantação para declarar explicitamente esse modo durante a fase de teste autorizada; o ambiente do Easypanel continua podendo sobrescrever/desativar a opção. Regras de permissão, onboarding, confirmação no servidor e bloqueio da IA antes da confirmação preservadas. Não há cobrança real nem SQL novo nesta correção.

Documentada a configuração no serviço askadia/askadia, a precedência do ambiente e como conferir o checkout sem confirmar pagamento ou disparar geração. O Easypanel abriu no Chrome, mas pediu login; acesso solicitado ao usuário. Ainda não houve alteração remota nem deploy nesta etapa. Validação `pnpm check` aprovada: lint, tipos, 256 testes e builds API/worker/Next. Consulta remota somente de leitura confirmou `askadia_monthly=159700` e `askadia_semiannual=800000` centavos no catálogo. Nenhum dado alterado pela consulta. `git diff --check` sem erros. Próximo passo: configurar o modo de teste no Easypanel e implantar a imagem atualizada após o login.


## Ajuda, chamados e encaminhamento ao especialista — 28/09/2026

Botão de ajuda integrado aos cabeçalhos, chat com busca nos registros revisados da central e fontes, encaminhamento quando não há solução, chamados com protocolo/histórico/respostas e painel para a equipe interna. WhatsApp público configurado conforme o número informado, sem envio automático. Busca textual sem IA paga, inclusive antes da contratação. SQL incremental 202609280003_support_chat.sql com RLS, carteira interna, validação, limites, auditoria e idempotência; detalhes em docs/ajuda-e-chamados-2026-09-28.md.

Validação dirigida: oito testes de busca, WhatsApp, schemas, proxy, banco, isolamento, revogação de acesso, status versionado, limites e repetição passaram; tipos também passaram. Validação final: pnpm check aprovado com lint, tipos, 264 testes em 32 arquivos e builds de contratos, integrações, API, worker e Next. Lint adicional após os ajustes da central pública passou; git diff --check limpo; 24 arquivos verificados sem valores privados do ambiente. A prévia fictícia compilou, mas a inspeção visual ficou pendente porque IAB e Chrome não responderam, inclusive em nova aba local. Migração remota e deploy ainda não executados: Easypanel pede login. Nenhum chamado real, pagamento, mensagem ou anúncio foi criado/enviado pelos testes.


## 28/09/2026 — Correção da espera na estratégia e ajuda flutuante

O print da etapa 2 foi reproduzido na regra de aprovação: um registro de estratégia em geração já tornava o botão disponível, embora o banco corretamente rejeitasse a aprovação sem output. Consulta remota somente de leitura confirmou que a geração real terminou e que as etapas 1–3 haviam sido aprovadas; as recomendações também estavam concluídas. Nenhuma aprovação, campanha, mensagem ou cobrança foi executada pelo agente.

A jornada agora usa uma única proposta vinculada ao mesmo identificador, geração e base de aprovação para exibir o diagnóstico e habilitar a ação. Estados de preparação/falha/configuração aparecem no guia; há retomada das tarefas interrompidas e das gerações que ultrapassam o bloqueio de cinco minutos do servidor. A tela avulsa passa a consultar também enquanto ainda não existe um registro de estratégia. Edições preservam a versão originalmente aberta e não sobrescrevem uma proposta que mudou durante a revisão. Regerar mantém o parâmetro da empresa em /comecar. Erros esperados de espera, datas e versões recebem orientação específica. Autorizações por empresa, pagamento e cinco etapas obrigatórias continuam no servidor/banco.

Pedido adicional: botão Ajuda flutuante no canto inferior direito, renderizado fora dos cabeçalhos via portal, com área segura em celulares e deslocamento acima do campo nos chats. Reserva de espaço no final da estratégia/checkout e conteúdo da empresa. Modal, chamados e WhatsApp mantêm o funcionamento anterior.

Validação: 13 testes direcionados passaram (incluindo rejeição da aprovação durante geração em PostgreSQL/PGlite, sincronização de versões e isolamento na API). pnpm check passou: lint, tipos, 272 testes em 34 arquivos e todos os builds. Lint adicional após reposicionar a ajuda também passou; git diff --check limpo. Prévia isolada preparada com dados fictícios; tentativas de abrir no Chrome e navegador interno terminaram em timeout. Conferência visual interativa pendente. Esta correção não cria migração SQL; requer publicar o novo pacote de web/API. Deploy remoto ainda não verificado.


## 28/09/2026 — Escolha da Página na conexão Meta

O botão para iniciar o OAuth estava abaixo da lista completa de permissões, e o seletor de Páginas vinha depois de todo esse conteúdo. A seleção também dependia apenas de meta_session na URL. Reorganizada a interface: botão Conectar e escolher Página no início, permissões em seção expansível, seletor em destaque acima das permissões, foco ao retornar, busca por nome/Instagram e atualização manual da lista. Carregamento, lista vazia, falta de autorização e expiração são estados distintos. Uma seleção temporária pode ser retomada na mesma aba/empresa por sessionStorage; guarda somente UUID, nunca token, e não amplia a validade definida no banco. O servidor continua exigindo proprietário, empresa, usuário e sessão OAuth válidos.

A consulta de Páginas usa /me/accounts conforme a coleção oficial da Meta: https://www.postman.com/meta/facebook/request/bqfxwbp/get-access-tokens-of-pages-you-manage . Os campos opcionais de Instagram são solicitados apenas quando autorizados, com retorno à consulta básica de Páginas se o provedor negar esses campos. Tokens expirados não são tratados como lista vazia; Páginas sem credencial utilizável permanecem visíveis com indicação de acesso pendente. A atualização consulta novamente a Meta e mantém os tokens cifrados no servidor. Não houve ampliação dos escopos OAuth, escolha automática de Página, publicação ou ativação de anúncio.

O usuário confirmou que já autorizou no Facebook e voltou sem a lista. O fluxo de retorno foi revisado, mas não houve acesso à sessão real para confirmar qual resposta a Meta entregou nessa tentativa.

Validação: pnpm check aprovado com lint, tipos, 280 testes em 35 arquivos e todos os builds (API, worker e Next). Os oito testes novos cobrem recuperação da seleção, paginação, falha dos campos opcionais, token expirado, atualização, isolamento por empresa e ausência de tokens na resposta pública. Lint adicional e git diff --check aprovados. O inventário do navegador não respondeu e o Chrome ficou indisponível, portanto a conferência visual e a autorização real da Página desejada continuam pendentes. Sem SQL novo; próximo passo: implantar o pacote web/API e repetir a autorização no Facebook.


## 28/09/2026 — Vídeo nas publicações e configurações por abas

Reproduzida a ausência do envio de vídeo: o calendário passava marketing.write=false para todas as peças durante a preparação automática, escondendo o campo mesmo quando roteiro e estratégia já estavam prontos. O envio de MP4 agora fica em um painel acima do roteiro, com botão Enviar/Substituir vídeo, visualização privada e orientação quando falta permissão, estratégia aprovada ou conteúdo detalhado. A preparação de outras peças não oculta nem bloqueia o upload; limite existente de 50 MB, validação do arquivo, empresa e revisão preservados. A substituição continua incrementando a revisão e invalidando a aprovação no banco.

A documentação local do Next 16 informa que o proxy limita o corpo clonado a 10 MB. O limite foi ajustado para 51 MB para transportar os vídeos completos; a rota continua rejeitando arquivos acima de 50 MB. Não houve alteração de bucket nem de SQL.

Navegação reorganizada: Visão geral → Conteúdo → Aquisição → Campanhas → Planejamento → Configurações. A antiga seção Empresa foi reunida em /empresa/[id]/configuracoes, com abas Perfil e marca, Meu site, Integrações, Atendimento, Equipe e acessos e Assinatura conforme as permissões. Gestão de equipe reutiliza APIs e delegações existentes. O servidor verifica cada aba e o bloqueio de pagamento; acesso administrativo à equipe considera o vínculo real de administrador ou proprietário. Links antigos redirecionam preservando os parâmetros de retorno OAuth.

Conforme pedido adicional, as telas internas de Resultados foram retiradas, incluindo os componentes antigos. /dashboard e /resultados redirecionam à Visão Geral da empresa ou à seleção de contexto. Referências dessas telas foram retiradas da navegação e dos painéis. Os dados e serviços usados pelos indicadores da Visão Geral foram preservados.

Validação: pnpm check executou lint e tipos com sucesso; a suíte aprovou 257 testes e teve timeout de inicialização em dois grupos PostgreSQL (37 testes não executados). Reexecução isolada desses dois arquivos aprovou seus 41 testes, incluindo os quatro já executados na primeira passagem: todos os 294 testes, em 38 arquivos, estão validados. Os 14 testes novos cobrem upload durante preparação, limites e tipo do arquivo, transporte acima de 10 MB, sessão/origem, versão, navegação, permissões e retorno OAuth; o teste de banco também confirma a invalidação ao substituir vídeo aprovado. Build final aprovado para contratos, integrações, API, worker e Next; lint adicional e git diff --check também passaram. A prévia fictícia em .local compilou e respondeu HTTP 200; Chrome e navegador interno não responderam à abertura, portanto a conferência visual interativa permanece pendente. Nenhuma IA, publicação, mensagem ou alteração real de permissão foi executada. Sem SQL novo; deploy e upload em produção ainda precisam ser verificados.

## 29/09/2026 — MedSI: identidade e foco em médicos e clínicas

Solicitação atual aplicada sobre a base existente: a marca MedSI e o público médico substituem a identidade Askadia e o posicionamento fitness. Histórico técnico preservado. Análise e escopo detalhados em `docs/medsi-identidade-2026-09-29.md`.

Identidade compartilhada com petróleo #123D46, menta #42D6B0 e marfim #F5F7F4, símbolo vetorial interpretado da prancha, wordmark, favicon, superfícies translúcidas e assinatura “Sua clínica em sintonia.”. Páginas públicas, acesso, prévia, comunicação interna e treze modelos de e-mail adaptados. Novas páginas de marketing e atendimento médico recebem os redirecionamentos das rotas antigas. Domínio público vem da configuração; não foi inventado um endereço MedSI.

Onboarding, cadastro, pesquisa regional, CRM, campanhas, CSV e instruções dos agentes orientados a clínicas e consultórios. Incluídos os segmentos clinic e medical_practice, especialidades, convênios, identificação profissional e solicitação administrativa de agendamento. A IA recebe limites para questões clínicas e materiais precisam de revisão profissional; isso não garante conformidade ou comportamento dos provedores. Agenda transacional, prontuário, prescrição e diagnóstico não foram implementados. Integrações médicas ainda requerem homologação.

Compatibilidade preservada para empresas antigas, formatos de importação, variáveis de campanha, códigos de CRM, preços e IDs de planos, vínculos de integração e chaves locais. A nova migração `202609290001_medsi_identity.sql` amplia segmentos, atualiza perguntas e nomes conhecidos do catálogo e sincroniza o segmento apenas quando o tipo informado muda. Os testes verificam que empresas antigas não são convertidas por suposição e que outro usuário não obtém acesso. Migração validada localmente em PostgreSQL/PGlite, sem aplicação remota.

Validação: `pnpm check` executou lint e tipos com sucesso. A suíte aprovou 292 testes e deixou sete sem execução após um timeout de 30 s na inicialização do grupo HTTP de autenticação. Reexecução isolada, sem aumentar timeouts, aprovou os 40 testes de autenticação, jornada da empresa e limites MedSI: os 299 testes dos 39 arquivos foram cobertos pelo conjunto das execuções. A repetição inclui a migração final com nomes MedSI e preços preservados. Lint adicional dos últimos componentes e testes também aprovado. Um ajuste posterior apenas refinou o texto de duas perguntas de onboarding, igualmente no contrato e no SQL, com lint adicional aprovado. `pnpm build` final aprovado para contratos, integrações, API, worker e Next, incluindo geração das páginas e TypeScript. `git diff --check` limpo.

Conferência com Playwright/Edge local: início, acesso, marketing médico, atendimento médico e prévia, em 1440 px e 390 px (dez combinações), sem erros de JavaScript, rolagem horizontal, marca antiga ou textos fitness nas páginas conferidas. Navegação real das duas rotas antigas chegou às novas URLs. Inspeção visual das capturas do início em desktop/celular e acesso em celular realizada. Evidências em `.local/medsi-review/`; dados da prévia permanecem identificados como fictícios. O servidor de conferência foi encerrado.

Sem deploy, migração remota, aplicação dos e-mails no provedor, chamada paga de IA, mensagem, cobrança, publicação ou anúncio real. Próxima etapa: revisar domínio e configurações, aplicar migrações em homologação e validar as integrações antes da implantação autorizada.
## 29/09/2026 — Onboarding médico e Firebase SQL Connect

A solicitação atual substitui a ordem histórica do onboarding. Implementado fluxo
por etapas no estilo Typeform: CNPJ, confirmação/ajuste de endereço, especialidade
com opções, currículo PDF ou história, logo enviado ou solicitado, fotos opcionais,
site existente ou solicitado e revisão final. Dados e anexos continuam vinculados
à empresa, com idempotência, controle de concorrência e versões confirmadas.
A prévia /preview/onboarding é isolada e identifica expressamente dados fictícios.

A primeira etapa da estratégia passa a ser o público regional, com coleta do IBGE,
estimativas Meta autorizadas e tendências via adaptador, fonte/data/escopo e
indicação de indisponibilidade. Dados ausentes não são preenchidos por estimativa
inventada; limitações exigem reconhecimento ao aprovar. Recoleta/edição invalida
a aprovação anterior. Logo e site entram nas filas existentes conforme a escolha
e os limites/plano. PDF é material de referência não confiável, sem instruções que
possam substituir a solicitação do usuário. Detalhes em
docs/medsi-onboarding-medico-2026-09-29.md.

Validação do fluxo médico antes da adaptação Firebase: 26 testes de jornada e
12 testes específicos aprovados, tipos aprovados. Conferência local em desktop
1440 px e celular 390 px passou pelas etapas, revisão, retorno e confirmação,
sem overflow nem erros de JavaScript; capturas inspecionadas. O primeiro pnpm check
parou por um escape desnecessário no lint, corrigido. Integrações externas continuam
com homologação pendente; não houve publicação, envio, cobrança ou anúncio real.

O usuário escolheu explicitamente Firebase SQL Connect com PostgreSQL. Incluídos
Firebase Auth, cookies de sessão no servidor, vínculo UID→UUID sem fusão por e-mail,
adaptador PostgreSQL com RLS/papéis por transação, Storage privado e consultas de
diagnóstico SQL Connect restritas a administradores. As regras de negócio e as
migrações existentes foram preservadas. Modo COMPATIBLE; nenhum GraphQL empresarial
é exposto diretamente ao navegador.

Configuração pública salva somente no .env ignorado, exemplos fictícios versionados,
scripts de preflight/migração com registro de hashes/lock/transação e diagnóstico
sem exposição de segredos. Banco existente sem registro ou papéis conflitantes
impedem a instalação automática. Configuração e pendências em
docs/medsi-firebase-2026-09-29.md. A instalação dos SDKs foi concluída; a store local
deste checkout é .pnpm-store.

Validação dirigida final: 14 testes aprovados em tests/firebase-sql.test.ts e
tests/firebase-auth.test.ts, incluindo isolamento, identidade, migrações
idempotentes e papéis sem herança implícita. Storage usa bucket simulado nesses
testes; isso não homologa o serviço remoto. A verificação completa após os últimos
ajustes ainda não foi concluída.

Não houve criação de recursos pagos, migração remota ou deploy. O console pediu
autenticação Google, que foi encaminhada ao usuário; acesso administrativo ainda
não confirmado. A configuração web enviada não fornece acesso ao Cloud SQL/Admin.
Próxima etapa externa: confirmar acesso, inspecionar os serviços existentes,
revisar provisionamento/permissões e homologar cadastro, arquivos, integrações e
a jornada no ambiente conectado antes do uso real.

## 29/09/2026 — Verificação para aplicação das tabelas Firebase

O usuário autorizou subir as tabelas e informou que os recursos estavam criados.
A consulta autenticada às APIs, concluída às 20:31 UTC, encontrou zero instâncias
Cloud SQL e zero serviços SQL Connect em atendimentomac-88940. As duas consultas
retornaram sucesso, sem erro de permissão. Evidência local sem credenciais:
`.local/medsi-cloud-inventory.json`. Não houve criação de recurso pago, aplicação
de SQL ou alteração de dados remotos. Solicitada a identificação do projeto ou
instância caso o PostgreSQL tenha sido criado em outro destino.

As migrações existentes mantêm preflight, hashes, transação e recusa de banco
populado sem histórico MedSI. Nova execução de `pnpm check` iniciada; resultado
ainda pendente em `.local/medsi-production-check.log`. Próxima etapa: identificar
o banco real, executar o preflight e aplicar as migrações já autorizadas.


## 29/09/2026 — Firestore Native, primeira etapa

O proprietário substituiu SQL Connect por Firestore. Banco (default), região
southamerica-east1, confirmado em atendimentomac-88940. Inicializados somente
medsi/v1 e os dois planos atuais; reexecução confirmou três documentos sem criar
novos. Regras privadas implantadas somente no Firestore; leitura anônima real
retornou 403. Sem dados fictícios ou de pacientes no banco real.

Adaptador nativo com transações, autorização por clínica, UID→UUID, cadastro
médico versionado, arquivos privados e limites de consulta. 13 operações portadas;
124 chamadas literais a RPCs ainda aguardam migração (inventário estático em
docs/medsi-firestore-operations.json). Operações ausentes falham explicitamente;
produção bloqueada até conclusão, sem fallback SQL. Env local usa firestore.

32 testes aprovados, incluindo 16 com SDK oficial no emulador local: isolamento,
concorrência, idempotência, revisão, anexos, revogação, CNPJ e acesso anônimo. Tipos
da API e lint direcionado aprovados. A primeira execução pnpm check parou no lint
do script CommonJS; corrigido para ESM. Nova execução completa ainda em andamento,
log .local/medsi-firestore-check-final.log. Não afirmar build final aprovado.

A CLI está autenticada, mas o servidor ainda não tem ADC/arquivo administrativo.
Foi solicitado apenas o caminho local dessa credencial, sem compartilhar chaves.
Detalhes em docs/medsi-firestore-2026-09-29.md. Próximas etapas: configurar identidade
do servidor, portar os fluxos restantes, testar a jornada completa e então liberar
a implantação. Sem deploy da aplicação, publicação, mensagem, cobrança ou anúncio.

## 29/09/2026 — Credencial MedSI e verificação real dos serviços

Conta medsi-api criada com acesso IAM limitado ao Firestore (default) e duas
permissões de Auth: leitura de usuários e criação de sessão. Chave privada salva
apenas em .local/credentials, ACL de usuário/SYSTEM e exclusão do Git verificadas;
.env local aponta para o arquivo. SDK administrativo leu medsi/v1 no banco real.
Nenhuma chave foi exposta ou enviada à hospedagem.

O diagnóstico comprovou Auth ainda não inicializado (auth/configuration-not-found),
faturamento desligado, ausência de buckets e API Firebase Storage desabilitada.
Usuário informado sobre ativar E-mail/senha e Blaze para uploads. Browser indisponível
por erro técnico de sandbox; não houve rejeição de revisão automática. Não foi
habilitada cobrança nem concedida permissão de Storage antes de existir o bucket.

A migração continua parcial: 13 operações nativas, 124 RPCs literais pendentes.
Produção segue bloqueada. pnpm check em andamento; tipos e lint passaram, testes
completos e build aguardando conclusão em .local/medsi-firestore-check-final.log.

Validação intermediária: pnpm check teve lint/tipos aprovados e 331 testes aprovados,
mas identity-api não carregou server-only fora do Next. Corrigida a dependência
extraindo safeAuthDestination para módulo puro, mantendo o guard do Firebase.
Os 10 testes de identidade passaram na reexecução dirigida (341 testes distintos
aprovados). Lint/tipos/build após a correção em andamento. Configuração pública
Firebase conferida pela API, sem exibir valores; exclusão de .local e .env do
Docker confirmada. Emulador local encerrado após os 32 testes passarem.

Validação concluída: lint e tipos aprovados após a correção; pnpm build terminou
com sucesso para API, worker e web, incluindo 18 páginas estáticas. Evidência:
.local/medsi-firestore-validation-final.log. São 341 testes distintos aprovados
nas execuções (331 da suíte completa e 10 da suíte de identidade corrigida),
mais os 16 cenários adicionais no SDK/emulador Firestore. pnpm check inicial
falhou no carregamento da suíte de identidade; a correção e as demais etapas
foram verificadas separadamente. git diff --check passou.

Reconsulta final ao Firebase manteve Auth sem configuração, billingEnabled=false
e nenhum bucket. Credencial e conexão Firestore resolvidas localmente; produção
continua bloqueada pela migração parcial e pelas configurações externas pendentes.
Nenhum deploy da aplicação, envio real, anúncio ou cobrança foi executado.

## 29/09/2026 — Authentication ativado e validado

O proprietário ativou o Authentication. Consulta oficial confirmou E-mail/senha
habilitado com senha obrigatória; leitura via Firebase Admin SDK com a conta
medsi-api aprovada. Adicionado 127.0.0.1 aos domínios autorizados conforme o
WEB_ORIGIN local, preservando localhost e os dois domínios Firebase existentes.
Evidência sem segredos: .local/medsi-auth-config-result.json.

Não foram criados usuários ou enviados e-mails em teste. Não houve alteração de
código da aplicação; permanece válida a validação anterior de lint, tipos, 341
testes e build. Login e sessão completos ainda exigem homologação com o usuário.
Faturamento continua desligado e nenhum bucket existe; Storage e migração dos
fluxos restantes continuam pendentes. Nenhuma mudança de plano ou deploy.

## 29/09/2026 — Pacote ZIP para Easypanel

Solicitado empacotamento do diretório atual, incluindo alterações locais e fontes
ainda não commitadas. Dockerfile, pnpm-lock.yaml e workspace na raiz do ZIP.
Excluídos .env real, credenciais, .local, Git, node_modules, builds, caches, logs
e anexos temporários. .env.example permanece como referência sem segredos.

O empacotador verifica nomes de arquivos sensíveis, conteúdos de credenciais
e compara as entradas do ZIP com hashes SHA-256 dos arquivos de origem. O relatório
e o ZIP ficam em .local/releases. Guia do Easypanel atualizado para evidenciar
o bloqueio atual de produção e separar o histórico Supabase da escolha Firestore.
Sem alteração de código da aplicação ou deploy; permanece a validação anterior
de lint, tipos, testes e build. A migração restante e Storage continuam pendentes.

## 29/09/2026 — Correção de roteamento após deploy MedSI

Evidência enviada: build Docker concluído; execução com NODE_ENV divergente e
falha anterior na configuração de produção. Consulta HTTP sem autenticação confirmou
/ = 503 com “Site indisponível.”, /login = 200 e /clinicas/UUID fictício = 404.
O proxy tratava o host não reconhecido por WEB_ORIGIN como site de cliente.

Implementados redirecionamentos /clinicas para as rotas existentes com autorização;
alias opcional APP_HOSTNAMES por correspondência exata, sem curingas nem confiança
em x-forwarded-host; diagnóstico agregado dos requisitos de produção sem segredos.
Runner de produção exige NODE_ENV=production. Bloqueio da migração Firestore mantido,
com rejeição adicional do emulador Firestore em produção. Guia informa a origem
real da captura, portas e montagem Linux da credencial, sem modificar o env privado.

Testes dirigidos e pnpm check em execução. Produção não foi reimplantada nem liberada;
fluxos restantes do Firestore e uploads continuam pendentes. Nenhum dado de cliente,
usuário, envio, anúncio ou cobrança foi criado/alterado por esta validação.

Validação concluída em 30/09/2026: pnpm check terminou com código 0 (lint,
tipos, 351 testes em 44 arquivos e builds de API, worker e web). As dez regressões
de deploy estão incluídas nessa suíte. git diff --check também passou.

Ensaio HTTP sobre o build Next local aprovado em seis verificações: raiz 200 no
domínio canônico e no alias técnico; host de cliente segue a consulta de site
publicado (fixture sem site retorna 404); /clinicas e subseções redirecionam com
307 preservando parâmetros repetidos; área privada sem sessão redireciona para
/login, inclusive pelo meta de streaming do Next, e mantém cache privado.
API de sites simulada explicitamente; nenhum Firebase ou login real foi usado.
Evidências locais: .local/medsi-deploy-check.log e .local/medsi-deploy-web-smoke.json.

Pacote atualizado contém as correções de roteamento e diagnóstico, sem .env nem
chaves. Não é uma liberação de produção: a migração Firestore continua parcial
e seu bloqueio permanece. O ambiente do Easypanel não foi alterado nesta etapa.

## 02/10/2026 — Nova verificação do erro no Easypanel

HTTP público em medsi-app.3rkpc1.easypanel.host confirmou novamente / = 503
com Site indisponível, /login = 200 e /clinicas/UUID fictício = 404. Portanto,
o redirecionamento validado no pacote de 30/09 ainda não responde nesse domínio.
Não foi possível determinar se houve fonte antiga, implantação pendente, falha
na inicialização ou roteamento para outro container sem o log atual do serviço.

A captura mostra apenas WEB_ORIGIN e PORT no editor do serviço. Esse bloco é
parcial e precisa ser mesclado às demais configurações, não substituir o env.
A captura não comprova variáveis compartilhadas nem o ambiente efetivo do processo.
Conferida somente a presença das configurações no .env local e a existência da
credencial administrativa; nenhum valor secreto foi exibido. Ambos permanecem
preservados. Sem acesso API ao Easypanel; o navegador falhou por erro técnico do
sandbox. Solicitadas as últimas linhas do log de execução, sem chaves ou tokens.

Sem alteração de código, novo ZIP, deploy ou gravação no Firebase. A validação
local de 30/09 permanece aplicável; não foi repetida uma compilação sem mudanças.
O bloqueio de produção da migração Firestore continua existindo independentemente
do env e precisa ser resolvido pela adaptação dos fluxos pendentes.

### Diagnóstico confirmado pelo log de execução — 02/10/2026

O log recebido depois da consulta HTTP comprova uma tentativa de inicializar a
revisão com o novo diagnóstico de produção. A API encerra por configuração
incompleta: sem DATABASE_PROVIDER=firestore, assume Supabase; a chave de
criptografia está ausente/inválida e, na última tentativa registrada, WEB_ORIGIN
também não passou na validação. O histórico mistura várias inicializações; não
permite afirmar que todos os erros ocorreram com o ambiente exibido na captura.

Preparado arquivo privado de recuperação em .local/credentials, derivado do
.env local sem alterá-lo. Preservados os segredos existentes, inclusive a chave
de criptografia; definidos provedor Firestore, origem pública MedSI, portas e
caminho Linux /run/secrets/medsi-firebase.json. Removidas configurações legadas
do provedor anterior e de emuladores. Projeto da credencial conferido, sem
exibir seu conteúdo. O JSON precisa ser montado no container pelo Easypanel.

Verificação com o validador compilado da API: os erros de ambiente relatados
foram resolvidos no arquivo preparado; permanece o bloqueio explícito da
migração Firestore incompleta. Esta verificação local não comprova IAM, bucket,
login ou funcionamento dos fluxos no servidor. ACL do arquivo limitada ao
usuário local e SYSTEM, sem herança; arquivo e credencial ignorados pelo Git
e excluídos do pacote. Nenhum segredo incorporado à documentação.

Sem deploy ou alteração no Firebase. Sem nova mudança de código; pnpm check
não foi repetido por se tratar apenas de ambiente privado e documentação.
Próxima etapa técnica: concluir e validar a migração dos fluxos Firestore antes
de homologar produção, sem retirar a proteção para contornar operações ausentes.

### Verificação remota atualizada — 02/10/2026, 13:36 UTC

Consulta somente leitura com a credencial administrativa local confirmou acesso
real ao Firestore e existência de medsi/v1 com schemaVersion=1. O diagnóstico
firebase:doctor --remote confirmou também leitura administrativa no Firebase Auth.
A inspeção da configuração confirmou e-mail/senha habilitados. Esses resultados
não comprovam que a credencial foi montada ou que o ambiente foi aplicado no
container do Easypanel, nem homologam login de usuário final.

Pendências verificadas: migração dos fluxos Firestore continua incompleta e a API
mantém bloqueio de produção; metadados do Storage inacessíveis; inventário do
projeto sem buckets, API Cloud Storage for Firebase desabilitada/não utilizada e
faturamento desabilitado. A lista de domínios autorizados do Auth ainda não contém
medsi-app.3rkpc1.easypanel.host. HTTP público segue com raiz 503, login 200 e rota
legada /clinicas/UUID fictício 404. Nenhum usuário, conteúdo, recurso ou configuração
externa foi criado/alterado para essas verificações. Sem mudanças no código.

Evidência local sem segredos: .local/medsi-firestore-current-read.json,
.local/medsi-services-inventory.json e .local/medsi-deploy-http.json. O diagnóstico
retornou código 1 pelas pendências de migração e Storage; isso não indica falha de
acesso ao Firestore, cuja leitura passou. Próxima etapa: concluir a integração dos
fluxos no código, preparar Storage e domínio do Auth e homologar o ambiente hospedado.
## 02/10/2026 — Correção do acesso a /comecar com Firebase

Captura do usuário e log local correlacionados: React #441 representa falha na
renderização do servidor; a exceção concreta era limit is not a function no
adaptador Firebase de leitura das clínicas. Inspeção identificou também ausência
de rpc, usada imediatamente ao abrir uma clínica e consultar seu plano.

Correção limitada ao adaptador web: limit aplicado depois de filtros e ordenação;
consultas company_capabilities e company_purchase_state encaminhadas somente aos
endpoints autenticados existentes. UUID validado; operações não suportadas e
sessões ausentes falham sem buscar dados; recusas e falhas não expõem a resposta
privada da API nem inventam permissões. Autorização continua no servidor/banco.
Não houve remoção do bloqueio de produção nem migração dos demais fluxos.

Oito regressões falharam primeiro pelos métodos ausentes e passaram depois da
correção. Junto dos sete testes de permissões/configurações, 15 testes dirigidos
passaram. pnpm check completo e renderização HTTP com API de teste isolada em
andamento. Sem dados reais criados, deploy ou alteração de credenciais.
Validação desta correção concluída: pnpm check passou em lint e tipos, mas a
execução integral dos testes terminou com 336 aprovados, um timeout de teste e
22 casos pulados por timeout no beforeAll de company-journey. Não registrar esse
comando como aprovado. O teste de inicialização executava quatro subprocessos
com cinco segundos cada, mas tinha prazo total padrão de cinco segundos: somente
seu prazo agregado passou para 25 segundos, preservando os prazos individuais e
as asserções. Na repetição isolada, deploy-routing + firebase-server-access
passaram (18 testes). A suíte company-journey passou sozinha sem alteração
(26 testes). Assim, os casos afetados pelos dois timeouts foram executados e
aprovados. pnpm build também concluiu com código zero, incluindo API, worker e web.

Ensaio HTTP sobre o novo build Next aprovado em seis cenários: visitante sem
sessão exige login; usuário novo abre /comecar; usuário existente retoma a clínica;
a clínica selecionada renderiza após autorização; acesso recusado não renderiza
o onboarding; /empresa preserva o requisito de configuração/plano. API e sessões
fictícias isoladas, explicitamente identificadas: nenhum login real foi homologado
por esse ensaio. Evidência: .local/firebase-server-access-smoke.json.

Web e API locais reiniciadas com os builds atualizados e automações desativadas.
Página inicial, /login e /health responderam HTTP 200; API declara Firestore.
Evidência: .local/medsi-local-after-access-fix.json. Sem implantação remota, criação
de contas ou gravação de dados de clínica em testes. A migração Firestore dos
demais módulos, Storage e homologação em produção continuam pendentes.
## 2026-10-02 — Checkout de teste com persistência Firestore

Relato: escolher um plano devolvia FIRESTORE_OPERATION_PENDING, embora a tela
já estivesse em CHECKOUT_MODE=test. Causa reproduzida: begin_test_checkout e
complete_test_checkout_server estavam ausentes do dispatcher Firestore, e a
consulta company_purchase_state ignorava acessos de teste persistidos.

Checkout simulado implementado, sem cobrança. Preços e parcelas vêm do contrato
do servidor; seleção exige onboarding confirmado e billing.manage. Transações
cancelam seleções substituídas e usam um cursor por clínica para serializar
requisições concorrentes. A confirmação exclusiva do servidor revalida ator,
empresa, permissão atual, aceite, estado e vencimento. O acesso de teste dura
sete dias; repetição não estende o prazo. Recusa e cancelamento mantêm a IA
bloqueada. Nenhuma assinatura paga é fabricada.

company_purchase_state só reconhece acesso vinculado a checkout aprovado da
própria clínica, respeita expiração e prioriza assinatura real ativa. Detalhes
do checkout continuam restritos a billing.manage. O gate existente de provedores
reconhece o acesso persistido e preserva quotas. Inventário: 15 operações
implementadas, 122 chamadas literais ainda pendentes.

Validação concluída:
- 12 regressões reproduziram inicialmente a operação ausente; após a correção,
  28 testes dirigidos passaram (12 checkout + 16 Firestore).
- Mais dois cenários concorrentes adicionados: 14 testes de checkout passaram
  com SDK oficial no emulador local demo-medsi, sem banco remoto.
- pnpm check terminou com código zero: lint, tipos, 373 testes de 46 arquivos
  e build completo (API, worker e Next com 18 páginas estáticas).
- Interface e API locais reiniciadas com CHECKOUT_MODE=test e automações
  desativadas. /login e /health retornam 200 (databaseProvider=firestore);
  checkout sem sessão retorna 401.

Evidências locais: .local/firestore-checkout-check.log,
.local/firestore-checkout-emulator-tests.log e
.local/firestore-checkout-runtime.json. O inicializador local explicita o modo
de teste; .env e credenciais foram preservados. Não foi simulada confirmação
na conta real do usuário: homologação autenticada final depende da interação
do proprietário. Sem cobrança, criação de conta na nuvem, publicação ou deploy.

Limites: ativação de teste não representa migração completa. Preparação da
estratégia, aprovações e finish_company_setup continuam pendentes; não foram
fabricadas aprovações ou enfileirados trabalhos sem implementação. O bloqueio
de produção Firestore permanece intacto. Próxima etapa: migrar a jornada de
estratégia com suas evidências, versões e permissões.

## 2026-10-05 — Estratégia guiada nativa no Firestore (validada localmente)

- Causa confirmada: após o checkout em teste, read_marketing_journey e as consultas de metadados não estavam implementadas. A interface continuava exibindo carregamento após a falha.
- Implementados leitura com escopo de empresa; pesquisa regional com lease, tentativas e revisão de fontes; diagnóstico versionado; pautas com datas propostas; recomendações e cinco aprovações encadeadas; conclusão do cadastro vinculada às versões. Plano de teste preservado, sem assinatura real ou cobrança.
- Trabalhadores reaproveitam os provedores existentes. Firestore prepara somente diagnóstico e recomendações; não produz peças, imagens ou sites nem publica/envia/ativa campanhas. A interface de acompanhamento sinaliza esses limites. A tela de erro oferece tentar novamente.
- Segurança: acesso revalidado ao concluir jobs; resultados atrasados descartados; alterações de perfil, pesquisa, estratégia ou calendário invalidam aprovações dependentes. Pesquisa parcial Meta permanece pending; fontes ausentes exigem reconhecimento explícito.
- Inventário: 34 operações nativas; 103 chamadas literais ainda pendentes. Guardas de produção mantidas. PDF/logo/fotos ainda dependem de bucket e faturamento Storage; integrações de pesquisa ausentes permanecem lacunas reais.
- Verificado até aqui: 31 testes focados em memória (17 jornada e 14 checkout), typecheck API. Primeiro emulador encontrou timeouts na máquina local; execução repetida com timeout específico de integração. Suíte completa, revisão final e reinício ainda pendentes. Não foram criados dados de teste no Firebase real.

Validação de regressão em 05/10:
- pnpm check executado: lint e tipos passaram; a suíte terminou com 390/391 testes aprovados. A única falha era uma expectativa anterior de que approve_marketing_stage ainda não existia no Firestore.
- A regressão passou a verificar start_content_run (ainda pendente), preservando também o bloqueio de aprovação inválida. Lint do teste e os 48 testes de Firestore/checkout/jornada passaram na repetição dirigida. Não houve falha funcional restante nessa validação.
- Emulador oficial demo-medsi: 17 cenários passaram; após a revisão independente, os 2 cenários dirigidos de evidência parcial e histórico imutável também passaram. Nenhum documento de teste foi enviado ao projeto real.
- Revisão independente concluída: os dois achados foram corrigidos e conferidos novamente. Compilação final da interface e verificação de execução local em andamento.

Conclusão local em 05/10:
- pnpm build terminou com código zero (API, worker e Next; 18 páginas estáticas). Lint e tipos passaram na checagem completa; a única expectativa antiga de teste foi corrigida e os 48 testes Firestore passaram na repetição dirigida. O pnpm check inicial não teve código zero; as evidências preservam esse resultado e a correção posterior.
- Serviços reiniciados em 2026-10-05T14:14:45.573Z. Verificação HTTP em 2026-10-05T14:18:14.730Z: login 200, API saudável com databaseProvider=firestore, leitura e aprovação de estratégia sem sessão retornam 401. A primeira sonda antecedeu a inicialização completa; a repetição após Ready passou.
- Local: http://127.0.0.1:3000/login. CHECKOUT_MODE=test; pesquisa regional e preparação de propostas habilitadas. Mensagens, anúncios, publicação, imagens e monitoramento Instagram continuam desativados. O worker de concorrentes não inicia no Firestore.
- Cadastro, plano de teste e credenciais existentes preservados. Não aprovamos etapas na conta real nem executamos IA/publicação/cobrança como teste. Homologação autenticada com dados reais continua a cargo da revisão do proprietário.
- Configuração local tem Firebase administrativo e provedor de estratégia. SERPAPI_API_KEY ausente; Trends é mostrado como pendente. A ponte de credenciais Meta ainda requer migração; Storage, conteúdo final, imagens, sites, dashboard e outros módulos permanecem pendentes. O bloqueio de produção Firestore foi preservado.
- Evidências: .local/firestore-journey-check.log, .local/firestore-journey-regression.log, .local/firestore-journey-emulator-tests.log, .local/firestore-journey-build.log e .local/firestore-journey-runtime.json.

## 2026-10-05 — Desbloqueio da coleta na estratégia guiada

- Diagnóstico em dados reais, somente leitura: perfil confirmado e plano de teste válidos; pesquisa regional falhava após três tentativas, antes de qualquer diagnóstico ou aprovação.
- Causa reproduzida: séries agregadas do IBGE retornam o município com o sufixo da UF, por exemplo `Sumaré (SP)`. A validação nativa do Firestore comparava apenas com `Sumaré` e rejeitava a evidência com `Invalid census scope`.
- Correção restrita à comparação: aceita o nome simples ou o nome com a UF correspondente; outra cidade ou UF continua bloqueada. O rótulo original e os dados da fonte são preservados.
- Regressão atravessa o coletor regional e a persistência nativa, cobre rótulo oficial, recortes incorretos e aprovação humana com reconhecimento de lacunas. Vermelho confirmado (22023); depois, 31 testes de jornada/adaptadores passaram. API compilada; revisão independente sem achados.
- Recuperação local: nova solicitação da coleta que falhou, pelo mesmo ator e pelas regras nativas de permissão, perfil e plano. Nenhuma aprovação automática, cobrança, publicação ou mensagem. Checagem completa e confirmação da coleta em andamento.
- Evidências: `.local/regional-label-red.log`, `.local/regional-label-green.log`, `.local/regional-label-api-build.log`, `.local/regional-label-check.log` e `.local/regional-label-runtime.json` (gerado quando a coleta terminar).
Verificação real da recuperação: em 05/10/2026 às 18:46:48 UTC, a revisão 4 da pesquisa chegou a `ready` na primeira tentativa. IBGE disponível para Sumaré/SP (rótulo original `Sumaré (SP)`); Facebook indisponível e Trends sem configuração. Nenhuma aprovação foi criada. API local reiniciada em modo de teste; verificação completa ainda em execução.
Conclusão desta correção:
- Leitura pelo `LaunchController` com dados reais confirmou perfil válido, primeira etapa pronta, permissão de aprovação e nenhuma aprovação automática (`.local/regional-label-journey-read.json`). A revisão do proprietário é o próximo passo; fontes ausentes continuam exigindo reconhecimento explícito.
- `pnpm check` terminou com código zero: lint, tipos, 392 testes em 47 arquivos e build completo. Inclui o teste novo atravessando coletor → persistência → aprovação e regressões dos dois bancos. Testes usaram fixtures isoladas; a recuperação real fez somente a pesquisa pública já solicitada.
- Interface local reiniciada em 2026-10-05T19:11:49.375Z; verificação HTTP em 2026-10-05T19:12:16.684Z: login 200, API saudável com Firestore, leitura e aprovação sem sessão 401. Evidência: `.local/regional-label-http.json`.
- Sistema permanece local, em `CHECKOUT_MODE=test`. Sem deploy, cobrança ou aprovação em nome do usuário. Facebook/Trends e os demais limites da migração descritos anteriormente permanecem pendentes; não foi removida nenhuma guarda de produção.
## 2026-10-05 — Login bloqueado por cota do Firestore

- Diagnóstico real: `/login` e `/health` respondiam 200; Firebase Auth reconhecia a configuração. A leitura administrativa de um documento da clínica falhou com gRPC 8, `Quota exceeded.`. Não foram solicitadas senhas nem criadas sessões artificiais.
- Decisão do usuário: manter o plano gratuito e aguardar a renovação. Faturamento não foi ativado; nenhuma credencial ou documento da clínica foi alterado nesta correção.
- Login agora consulta a identidade autorizada antes de emitir cookie de sucesso. Cota excedida retorna 503 com mensagem legível. Sessão existente com banco indisponível propaga a falha, em vez de ser tratada como usuário anônimo; sessão ausente/inválida continua rejeitada.
- Filas Firestore de pesquisa regional, estratégia e recomendações: consulta ociosa a cada 60 segundos; falha espera 5 minutos; trabalho encontrado mantém a cadência normal. Caminho SQL preservado. Interface consulta preparação a cada 15 segundos, revisão parada/erro a cada 5 minutos e não consulta automaticamente em aba oculta. Consulta de logo para quando a função está indisponível.
- TDD: execução inicial reproduziu 12 falhas; depois, 29 testes de autenticação, sessão e workers passaram em 4 arquivos. Relógios, credenciais e respostas de teste são fixtures isoladas, sem gravações na nuvem.
- Revisão independente sem achados acionáveis. Limites: efeitos React de visibilidade/temporização revisados em código; navegador automatizado indisponível por falha de infraestrutura. Login real após a renovação ainda não homologado.
- `pnpm check` em execução; processos locais pausados durante a reconstrução. Resultado final e reinício serão registrados abaixo.
- Evidências: `.local/login-quota-red.log`, `.local/login-quota-green.log`, `.local/login-quota-check.log`; diagnóstico real registrado durante a sessão (uma leitura, código 8).
Conclusão da correção do login:
- `pnpm check` terminou com código zero: lint, tipos, 409 testes em 49 arquivos e build completo de API, worker e Next. Revisão independente sem achados acionáveis.
- Servidores locais reiniciados em 2026-10-05T21:27:18.071Z. A primeira sonda antecedeu a inicialização completa da API; repetida após a inicialização, passou em 2026-10-05T21:28:35.141Z: página/formulário de login 200, API saudável com Firestore, jornada sem sessão 401 e formulário inválido 400. Evidência: `.local/login-quota-runtime.json`.
- URL local: http://127.0.0.1:3000/login. Modo de teste preservado. Não houve alteração de faturamento, deploy no Easypanel, cobrança, publicação ou aprovação de etapas na conta real.
- Limite externo continua pendente: login autenticado depende da renovação da cota do Firestore. A documentação oficial informa renovação por volta da meia-noite do Pacífico (aproximadamente 04h de Brasília em 06/10/2026). Atualizar a página e tentar entrar após a renovação é a próxima verificação real. Não foram repetidas leituras administrativas do banco esgotado.
- Fonte do horário de renovação: https://firebase.google.com/docs/firestore/quotas . Correções disponíveis somente na versão local; uma implantação anterior no Easypanel não recebe estas mudanças automaticamente.

## 2026-10-06 — Cadastro adaptado, conta única e estratégia regional após plano

- Primeira pergunta Clínica/Consultório; comunicação adaptada e retomada de perfis antigos sem reescrita. Migração SQL incremental entregue, sem aplicação remota. No Firestore, tipo e endereço precisam corresponder; mudanças exigem reconfirmação.
- Cliente entra direto na conta autorizada. UI sem seletor de workspace; configuração Minha conta e convites preservados. Criação Firestore reutiliza a clínica existente e serializa concorrência. Administração interna preservada. Detalhes: docs/medsi-conta-unica-2026-10-06.md.
- Removida a espera artificial antes da escolha do plano. Pesquisa e IA continuam condicionadas ao plano confirmado no servidor; checkout de teste identificado, sem cobrança.
- Etapa 1: indicadores IBGE/Facebook/Trends acima de mapa Leaflet/OpenStreetMap e assuntos relacionados. Mapa começa com viewport municipal; cliente confirma o ponto da clínica e raio 1/3/5/10 km. Estabelecimentos via Overpass, seleção explícita até20/50 candidatos. Município, raio, alcance estimado e índices de busca continuam separados.
- Novos tópicos consultam todas as especialidades junto ao município. Google: top0–100 separado de rising/Breakout. X: amostra recente validada e interações, sem atribuir crescimento/residência. Assuntos Facebook sem fonte autorizada permanecem indisponíveis. SERPAPI_API_KEY e X_BEARER_TOKEN ausentes localmente; Meta depende da ponte/conexão de credenciais no Firestore.
- Pesquisa/seleção versionadas: só candidatos atuais autorizados; mudanças invalidam aprovações dependentes. Snapshot integral chega ao contexto da IA junto com perfil e currículo. Progresso por fonte usa lease/escopo/plano; não altera a base da aprovação. Sem porcentagem de conclusão inventada ou gravação por segundo.
- Revisão independente corrigiu coordenadas vazias com valores implícitos, indicação de coleta sem job e refresh que descartava escolhas; backend corrigiu mapa omitido, progresso de lease anterior, coordenadas inválidas e geometria municipal volumosa. Testes específicos de cadastro, navegação, provedores, UI e autorização passaram em fixtures isoladas. Nenhum registro de teste na nuvem.
- Instalação local restaurada pelo lockfile (dependência openai ausente); Leaflet1.9.4 e tipos adicionados. Documentação técnica/limites: docs/medsi-fluxo-regional-2026-10-06.md.
- pnpm check em execução; servidores locais pausados para compilação. Resultado e reinício serão registrados abaixo. Navegador automatizado não inicializou (apply deny-read ACLs); sem homologação visual interativa ou login real nesta etapa. Validação SSR verifica fontes/progresso/layout semântico.
- Uma leitura real no início de06/10 confirmou renovação da cota Firestore. Plano gratuito mantido. Sem mudanças de faturamento, credenciais, deploy, aprovações automáticas, cobranças, mensagens ou anúncios.

Conclusão da validação local:
- A primeira checagem parou em um tipo anulável de endereço, corrigido. A segunda execução de pnpm check passou lint/tipos e executou 456 testes em 57 arquivos: 455 passaram e 1 fixture antiga do worker falhou por não incluir mapa/progresso. A fixture foi corrigida para contar leituras de fila separadamente e verificar as escritas de progresso/resultado; os 10 testes desse arquivo passaram na repetição dirigida, incluindo a cadência de60s e recuo de300s. Lint direcionado passou. Não afirmamos que a execução original de pnpm check teve código zero.
- pnpm build final terminou com código zero para contratos, integrações, API, worker e Next. Nenhuma mudança de produto ocorreu após a suíte completa; o último ajuste foi apenas a fixture de teste. Regressões novas de mapa, fontes, autorização, conta única, cadastro e apresentação passaram nessa suíte.
- Verificação pública real da malha IBGE Sumaré/SP: HTTP200, GeoJSON FeatureCollection/Polygon, em2026-10-06T16:34:00.609Z. Nenhuma coordenada dessa verificação foi registrada como local da clínica; não houve escrita Firestore.
- Serviços locais reiniciados com modo de teste. Sondas HTTP em 2026-10-06T16:56:46.995Z: login200/formulário presente, API saudável com Firestore; jornada, pesquisa e seleção sem sessão retornam401; formulário inválido400. Endereço: http://127.0.0.1:3000/login.
- Sem login real, aprovação de etapas ou chamadas de IA em nome do usuário. Navegador automatizado permaneceu indisponível por falha ACL; conferência visual interativa e homologação de integrações permanecem pendentes. Novas pesquisas exigem Atualizar coleta quando já existe uma versão salva.
- Evidências: .local/regional-complete-check.log, .local/regional-complete-check-final.log, .local/regional-queue-green.log, .local/regional-queue-lint.log, .local/regional-final-build.log, .local/regional-runtime.json e .local/regional-ibge-map.json. Sem deploy, alteração de faturamento, envio de mensagens ou ativação de anúncios.
## 2026-10-06 — baseline regional Firestore restaurada em branch de correção

- Branch `fix/regional-baseline-2026-10-06`, criada do HEAD limpo `4f011f7c0a3b57dd4cf5e3ca18ca0d63d7926c34`. Dependências instaladas do lockfile com pnpm 10.33.0 neste container; cache e store temporários. Nenhuma credencial, migração remota ou configuração de produção alterada.
- Reprodução neste container: lint com 5 erros de imports sem uso; typecheck com referências Meta indefinidas, chamada do coletor incompatível e `topics.x` ausente; testes com 419 aprovados, 11 falhos e uma suíte impedida por corrida entre compilação dos pacotes e testes. Após `build:packages`, a suíte bloqueada voltou a executar.
- Coletor regional: assinatura alinhada entre testes, worker e adaptadores; estimativas Meta validam prontidão e limites sem converter indisponibilidade em zero; mudança de conta durante a coleta descarta o resultado. O worker Firestore entrega Meta como `unconfigured` enquanto faltar a ponte de credenciais específica da empresa. Google Trends via SerpApi, IBGE e X mantêm falhas independentes. Assuntos Facebook permanecem indisponíveis sem fonte autorizada.
- Snapshot Firestore aceita Facebook e tópicos opcionais, preserva respostas válidas vazias e impede métricas em fontes indisponíveis. A aprovação da etapa regional exige reconhecimento explícito das lacunas; a versão guarda o texto e a lista de fontes ausentes. A interface mostra estimativas quando existem e estados ausentes para Facebook e X, sem número artificial.
- Regressões novas e existentes verificam fonte ausente, resposta vazia, timeout, troca de conta, versão de perfil, permissão, pagamento, isolamento entre empresas, lease e histórico de aprovação. São fixtures locais; nenhuma chamada Meta, SerpApi, X, IBGE ou Firestore real foi homologada nesta etapa.
- Verificação final: `pnpm check` código zero; lint e tipos aprovados, 461 testes aprovados em 57 arquivos, build de contratos, integrações, API, worker e Next (18 páginas estáticas). `git diff --check` sem erros. A guarda `productionConfigurationIssues()` que bloqueia Firestore em produção continua ativa.

Próximas fatias para o objetivo comercial MedSI, cada uma com testes de escopo/permissão, estados de falha e homologação em ambiente de teste antes de produção:

1. Cadastro e marca: concluir Storage privado e anexos de currículo/logo/fotos no Firestore; conferir retomada e aprovação por versão. Checkout atual é teste por sete dias, sem assinatura ou cobrança real. Implementar contratação e conciliação por empresa antes de oferecer assinatura paga.
2. Pesquisa e diagnóstico: fechar a ponte Meta por empresa, homologar IBGE/Places/Overpass/SerpApi e conexão Instagram; provar recortes, limites, alteração de perfil e ausência de fontes no Firestore. Gerar diagnóstico e plano Instagram com evidências e revisão humana.
3. Conteúdo médico: portar produção de copy e roteiros sazonais, calendário, artes/logo e aprovações de cada versão ao Firestore/Storage. Testar políticas de conteúdo médico e impedir publicação sem aprovação vigente.
4. Atendimento: portar configuração, canal autorizado, inbox/CRM, retomada e envio controlado para Firestore; homologar com contas de teste sem mensagens a pacientes reais.
5. Tráfego e site: portar propostas Meta/Google com orçamento opcional, conta e saldo validados, aprovação de verba/criativo/programação e execução supervisionada. Portar geração, prévia, versão e publicação do site, com domínio e formulários isolados por empresa. Tráfego integra o objetivo final e não é etapa descartável.

Inventário estático atual em `docs/medsi-firestore-operations.json`: 34 operações implementadas, 103 chamadas RPC literais pendentes; chamadas dinâmicas e leituras diretas exigem auditoria adicional. A base verde desta etapa não autoriza venda como SaaS operacional, deploy de produção nem remoção do bloqueio Firestore. O proprietário fará o deploy e a homologação em ambiente de teste.


## 2026-10-07 — fatias nativas MedSI para homologação privada

O prompt complementar recebido nesta sessão ampliou a baseline e substituiu duas premissas anteriores: tráfego pode ser pulado por escolha persistida e reversível, sem autorizar gastos; o calendário usa o mês corrente com quantidade e frequência configuráveis. A baseline `36a2a862a191a1444f312e2535108237bb850b53` permanece no histórico da branch `fix/regional-baseline-2026-10-06`.

- Portados módulos Firestore de assinatura Asaas sandbox/conciliação, atendimento/CRM/Cloud oficial, presença digital, conteúdo/artes/logo/vídeo privado, site versionado, campanhas de relacionamento, tráfego e publicação Instagram. São implementações com fixtures, não integrações reais homologadas.
- Perfil progressivo preserva cadastro médico e histórico, invalida aprovações afetadas e permite revisão explícita de concorrentes. Evidências digitais entram no diagnóstico; o worker regional agora possui ponte de credenciais Meta por empresa. Pesquisa persistente de mapa usa OSM; Places permanece transitório, com IDs/labels confirmados pelo usuário.
- Produção usa API como único executor, transações/leases, quotas, tentativas limitadas, idempotência, revisão atual e estados incertos sem repetição cega de envios. Modelos requerem IDs explícitos e preflight; nomes históricos não são fallback de API.
- HTTP com duas clínicas fictícias verificou cadastro/retomada, aquisição simulada, pesquisa vazia, estratégia, datas do mês, skip, conclusão, isolamento e invalidação por alteração do perfil. A API completa iniciou em modo de teste sem banco/Auth configurados; isso não comprova Firebase Auth/Firestore/Storage reais.
- Tentativa de emulador `demo-medsi` bloqueada no download pelo proxy (403). IAM, regras, índices, arquivos, concorrência entre réplicas, navegador e provedores permanecem gates externos.
- Guias e matriz atualizados: `medsi-acceptance-2026-10-07.md`, `medsi-test-runbook.md` e documentos por domínio. Parcelamento acima de um/troca comercial de plano, templates/mídia/recibos Cloud e operações administrativas legadas permanecem lacunas explícitas.
- Nenhum deploy/push/merge, migração remota, mudança de credenciais/IAM/regras, dinheiro real, envio/publicação real ou DNS. Bloqueio de produção Firestore preservado. O responsável fará deploy privado e homologação; esta entrega ainda não autoriza venda como SaaS operacional.

Verificação final desta retomada: `pnpm check` código zero — lint/tipos aprovados, 681 testes em 81 arquivos aprovados, zero falhas, builds contracts/integrations/API/worker/Next aprovados. `git diff --check` aprovado. API do build final iniciou e `/health` retornou `ok` em modo test/Firestore com banco/Auth `not-configured`. O preflight de modelos retornou `unconfigured`, sem geração real. Inventário: 156 operações exportadas e registradas (comparação executável sem diferenças), 167 chamadas RPC literais e 29 pendências legadas. Evidências locais em `/workspace/medsi-evidence`; não substituem homologação externa.


## 2026-10-07 — correção dos pins e ativação local da coleta regional

- Causa reproduzida: `persistentEvidence=true` suprimia Places também para localizar o endereço; sem ponto, a pesquisa de concorrentes retornava antes da consulta. Zoom fixo também podia ocultar marcadores de raios maiores.
- Prévia privada/autenticada agora consulta endereço confirmado e candidatos OSM, verifica quota/permissões/versão novamente e aguarda confirmação explícita do ponto. Não persiste detalhes Google. Mapa enquadra todo o raio.
- Chromium com componentes reais e respostas simuladas comprovou quatro marcadores visíveis e preenchimento automático das coordenadas, mantendo botão de confirmação. Tiles OSM receberam CONNECT 403 no ambiente; nenhuma proteção foi contornada.
- API local reiniciada com `REGIONAL_RESEARCH_ENABLED=true`; health confirma enabled=true e databaseConfigured/trendsConfigured/placesConfigured=false. SerpApi e Places não possuem chave configurada; Firebase/Auth/Storage ausentes. Trends real não foi consultado. Configuração persistente de credenciais depende do canal seguro e aprovação específica; nenhum segredo alterado.
- Verificação: pnpm check código zero, lint/tipos e todos os builds passaram; 690 testes em 82 arquivos, zero falhas. Web/API/worker locais continuam acessíveis. Relatório detalhado e roteiro A/B: `medsi-release-check-2026-10-07.md`; evidências em `/workspace/medsi-evidence`.
