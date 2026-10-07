# MedSI — worker existente e paginação Firestore, 07/10/2026

Base `92613cd4674f844e9c88cd14572514d078381600`, branch `fix/regional-baseline-2026-10-06`. A rodada preserva as 24 RPCs e quatro consultas anteriormente portadas. Não executa migração, deploy, push, publicação, envio, cobrança, anúncio ou configuração de credenciais. Origem `atendimentomac-88940` intacta; destino configurado `medsi-80f4a`, namespace `medsi/v1`.

## Arquitetura encontrada e entrega

O processo worker antigo apenas registrava filas BullMQ/Redis e não consumia jobs. A execução de negócio já existia em 13 serviços da API, com claims, leases, aprovações, retry e persistência no banco. Duplicar essas regras no worker criaria dois motores. A entrega extrai a propriedade de execução para um registro/runner compartilhado, reutilizando as mesmas classes e os mesmos contratos.

`BACKGROUND_EXECUTOR=api` conserva o comportamento anterior; `worker` transfere 11 processadores. `InboxAutomation` e `CampaignDelivery` permanecem na API porque a ativação de suas rotas depende do `lastPoll` local. Essa escolha técnica preserva o fluxo; mover ambos exige heartbeat compartilhado, que não foi inventado nesta rodada. `disabled` desativa todos. `WORKER_MODE` é `disabled` por padrão; `dry-run` informa configuração sem abrir banco/processadores; `enabled` exige escolha explícita de worker. Nenhuma configuração local foi alterada para ativar execução real. Os bloqueios de produção permanecem.

| Recurso da jornada / processador | Entrega | Estado |
|---|---|---|
| Assinatura sandbox / conciliação | Mesmo handler e estado durável de cobrança; executor selecionável e fila paginada | validado somente com simulação |
| Pesquisa regional e concorrentes | Handlers existentes no runner; claims paginados e versão/empresa preservadas | validado somente com simulação |
| Diagnóstico, plano, calendário e textos | ContentPreparation e produção reaproveitados; quotas e contexto atual sem varrer todo histórico | validado somente com simulação |
| Artes, logo e descrição de materiais | VisualJobs/ImageDescriptions existentes, filas paginadas e seleção explícita de materiais preservada | validado somente com simulação |
| Recomendações e preparação do site | LaunchPreparation e claims nativos do site reaproveitados | validado somente com simulação |
| Tráfego opcional | Preparação/execução de ads reaproveitadas; prioridade de parada, orçamento/aprovação e reconciliação preservados | validado somente com simulação |
| Monitoramento Instagram e publicação aprovada | Handlers existentes reutilizados, sem publicação externa | validado somente com simulação |
| Atendimento e campanhas de mensagens | Permanecem API-owned; continuação rápida das páginas e proteções de consentimento/janela/envio incerto preservadas | validado somente com simulação |
| Suporte, equipe, dashboard e retomada | Paginação por empresa/ator e limites explícitos; métricas não truncadas nem fabricadas | validado somente com simulação |
| CRM e WhatsApp oficial | Consultas por telefone/contato/thread; deduplicação e cancelamento testados com histórico >1.000 | validado somente com simulação |
| Firestore/Auth/Storage hospedados | Credencial administrativa ausente; transações, índices, concorrência e permissões reais não homologados | bloqueado |
| Provedores e migração antiga | Nenhuma chamada de negócio ou leitura/migração remota nesta rodada | bloqueado |

Inventário detalhado dos 13 handlers, gates, comandos seguros e limites em [runtime](medsi-background-runtime-2026-10-07.md). Critérios de filas e temporização em [paginação de filas](medsi-queue-pagination-2026-10-07.md).

## Causas corrigidas e evidências

- O worker não tinha consumidores porque os consumidores reais estavam na API. O runner compartilhado resolve a alocação sem um segundo modelo BullMQ. Shutdown para os timers, drena trabalho em voo e fecha somente clientes PostgreSQL/Firebase inicializados; simulação não inicializa SDK.
- `DocumentTransaction.list` carregava até 1.001 documentos e falhava antes de o chamador filtrar/recortar. O adaptador agora aplica filtros exatos, offset/limit e contagem agregada no SDK, com páginas por ID físico para os casos que exigem composição. IDs de payload não são usados como cursor de documento.
- Claims buscavam coleções inteiras. Páginas pequenas e cursores duráveis em `worker_scan_cursors` permitem progredir após registros futuros, inválidos ou já finalizados. Checkpoint no item efetivamente reservado e histórico de claims evitam starvation de jobs recorrentes. As regras de elegibilidade e leases continuam no domínio.
- A revisão reproduziu regressão de prazo em atendimento: um intervalo de 15 segundos entre cada página faria mensagens excederem a janela existente. `p_paginated:true` é uma opção interna Firestore com `hasMore`; as chamadas legadas mantêm o formato anterior. A API continua a próxima página após 1 segundo, e volta ao intervalo ocioso após terminar o percurso. Não foi ampliada a janela de mensagens/campanhas.
- Suporte agora busca os últimos 100 registros, máximo do protocolo e limites recentes no SDK. Uma segunda revisão revelou fanout/varredura excessiva ao pular clínicas revogadas: a leitura tem orçamento compartilhado de 10.000 tickets e sentinel, com erro explícito, sem resultado parcial.
- Dashboard pagina fatos/importações por clínica e não lê CRM sem autorização. Grants são filtrados também pelo ator; contexto da jornada usa perfil, brief e geração atuais. Quotas mantêm os mesmos limiares e filtram o dia UTC no SDK.
- Inbound WhatsApp e CRM deixaram de varrer todos os contatos/oportunidades para deduplicar. Comparação de corpo longo permanece local após filtros de empresa/thread/estado, pois corpos não devem ser usados como chave de índice Firestore.

As regressões usaram atores, clínicas e provedores fictícios; várias executam o adaptador de produção contra uma implementação local da interface Admin SDK. Isso não é execução no Firestore hospedado nem no emulador. Revisão independente reproduziu os problemas de prazo, orçamento de leitura e contagem residual e verificou as correções.

## Limites deliberados e o que falta

- Históricos completos e agregações autorizadas têm teto explícito de 10.000 registros; overflow retorna `54000`. Consultas genéricas com ordenação arbitrária ou filtros residuais preservam a semântica de nulos/campos ausentes com varredura restrita a esse teto. Páginas retornadas continuam limitadas a 1.000 conforme contrato, mas offsets posteriores funcionam. Não há promessa de base ilimitada.
- Offsets nativos podem cobrar leituras descartadas pelo serviço. Uma API pública por cursor reduziria esse custo. O portfólio administrativo anterior ainda calcula total exato e busca por substring percorrendo páginas da carteira; esse custo é explícito, não uma consulta de cliente sem escopo.
- Limites de 800KB por documento e limites reais de duração/tamanho de transação permanecem. Grandes limpezas atômicas precisam homologação. Alguns cancelamentos limpam imediatamente até 100 registros; os guards autoritativos bloqueiam envios restantes e a varredura durável trata expiração, sem liberar ação cancelada.
- Paginação e intervalo curto não garantem throughput arbitrário. Latência de provedores, número de clínicas, concorrência de réplicas e tempo de shutdown exigem teste de carga em homologação.
- `firebase/firestore.indexes.json` contém declarações locais dos índices ordenados necessários. Não foram publicadas; combinações reais ainda precisam validação do serviço antes de uso. Credenciais devem entrar por canal seguro do ambiente, nunca no chat.
- Existem próximas melhorias de código independentes de credenciais: heartbeat compartilhado para mover os dois handlers de mensagens, APIs públicas por cursor para históricos acima do teto e otimização de busca/contagem administrativa. Não são novos bloqueios escondidos de implementação dos 11 handlers transferíveis entregues.
- O runner não cria schedulers de negócio inexistentes, métricas externas, hosting/DNS nem recursos de site/atendimento que permaneciam fora desses handlers. Nenhuma nova regra comercial foi escolhida. Franquias/preços/retenção e políticas de produto ainda não definidas continuam pendentes, sem valores inventados.
- Não existe prévia oficial acessível pelo celular neste ambiente; loopback não é URL pública. Nenhuma atualização automática da instalação Windows é presumida e nenhum log do notebook é solicitado.

## Verificação integrada

`pnpm check` final concluiu com código **0**: lint, tipos, **968 testes em 106 arquivos**, zero falhas, builds de pacotes/API/worker/web. Log: `/workspace/medsi-evidence/worker-pagination-check-final.txt`. `git diff --check` passou. A primeira execução integrada teve 967 testes passando e uma falha: edição de perfil não invalidava aprovação legada sem `profile_version`. Foi restaurada a invalidação de todas as aprovações da clínica com paginação delimitada, sem alterar a fixture; a execução final confirmou a correção.

Os serviços foram reiniciados com os artefatos compilados: web 3000/login, API 4000/health e worker 4001/health responderam HTTP 200. API usa `BACKGROUND_EXECUTOR=disabled`; worker usa `WORKER_MODE=disabled`, lista 13 handlers e informa `processing:false`. Os overrides pertencem apenas aos processos desta conferência; nenhuma credencial ou arquivo .env foi alterado. Isso comprova inicialização local, não integração real. Evidência: `/workspace/medsi-evidence/worker-pagination-runtime.json`.

A entrega mantém a identidade Library `libfile_1c3d276edd2481919eea186beb69caea`. SHA, versão e hash do pacote são registrados no handoff externo após commit/validação; o próprio commit não pode registrar seu hash. Sem push, PR, deploy, migração remota ou remoção do bloqueio de produção.
