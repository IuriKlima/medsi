# MedSI — entrega para homologação, 7 de outubro de 2026

## Estado e limites

A implementação foi feita em `fix/regional-baseline-2026-10-06`, a partir do HEAD limpo `4f011f7c0a3b57dd4cf5e3ca18ca0d63d7926c34`. A baseline regional foi verificada neste container e commitada em `36a2a862a191a1444f312e2535108237bb850b53`. O relato anterior não foi utilizado como evidência de execução deste container. Node 24.19.0 / pnpm 10.33.0, dependências do lockfile.

O prompt complementar autoriza as fatias funcionais e substitui a regra anterior sobre tráfego obrigatório: **pular por enquanto** é uma escolha persistida, reversível e sem autorização de gasto. Planos usam o mês atual e quantidade/frequência configuráveis. Nenhum paciente real foi usado.

Pronto para testar: implementação local e adaptadores com transações/filas/versionamento, testes isolados e HTTP. **Ainda não pronto para liberar venda funcional:** Firestore/Auth/Storage/IAM, Asaas sandbox e modelos/canais reais não foram homologados. O bloqueio Firestore em produção permanece. Configuração presente não significa integração validada.

Não houve deploy, push, PR, merge, alteração de regras/IAM/credenciais, cobrança real, publicação, envio real, criação de campanha externa ou alteração de DNS. O operador fará o deploy privado de teste.

## Matriz de aceite

Todos os testes abaixo usam fixtures isoladas. “Adapter implementado” não significa “provedor validado”. Sandbox refere-se ao destino configurado pelo adapter; não houve execução em conta sandbox externa.

| Módulo / requisito | Implementação e teste | Ambiente / evidência | Dependência externa | Status |
|---|---|---|---|---|
| Cadastro e retomada | Cadastro médico e marca, confirmação, versões; fatos progressivos; empresa/consultório; confirmação manual da localização | `firestore.test`, `firestore-marketing-profile`, `firestore-http-journey` | Firebase Auth real, conta/email, Storage privado | Implementado; fixtures/HTTP aprovados |
| Assinatura / acesso | Asaas cliente sandbox, checkout, evento autenticado, conciliação periódica, duplicados/fora de ordem, cancelamento; acesso sandbox distinto de live | `asaas-billing`, `asaas-controller`, `asaas-customer`, `firestore-billing`, `firestore-billing-jobs`, UI | Asaas sandbox e credenciais em canal seguro; dinheiro real exige autorização | Adapter sandbox implementado; não homologado. Parcelamento acima de um e troca comercial de plano pendentes |
| IBGE / população | Município, população, metadados 9514, distribuição agregada, ano/recorte; fonte vazia/erro independentes | `regional-flow`, `regional-topics`, `firestore-journey` | Rede e contratos reais IBGE; conferir município/ano | Implementado; fixtures aprovadas; provedor pendente |
| Places / mapa | Busca transitória, revisão explícita de IDs/nomes; snapshot persistente de concorrentes OSM, sem lote de detalhes Places | `regional-map`, `onboarding-research`, `firestore-marketing-profile` | Places/restrições, atribuição, OSM/Overpass; pin confirmado pelo cliente | Implementado com limitação explícita de persistência; provedores pendentes |
| Trends SerpApi | RELATED_QUERIES, especialidade+cidade, BR-UF, últimos três meses, resposta vazia/parcial/429/timeout | `regional-topics`, `regional-flow` | `SERPAPI_API_KEY`, quota e homologação | Implementado; fixtures aprovadas; índices não são volume absoluto |
| Presença digital | Opt-in, concorrentes selecionados, Business Discovery, origem Places explícita, credencial/tenant, quota, lease e snapshot aprovado | `firestore-digital`, `regional-meta-bridge`, `firestore-journey` | App Meta, conta profissional/scopes e acesso real | Implementado; fixtures aprovadas |
| IA / diagnóstico / Instagram | Evidências congeladas, contexto médico, quantidade/frequência, mês corrente, saída Zod; ausência de modelo não prende geração | `model-preflight`, `planning-preferences`, `firestore-journey` | IDs disponíveis na conta; escolha SOL, recursos e orçamento; preflight não comprova geração | Implementado/configurável; nenhum modelo real homologado |
| Calendário / textos / roteiros | Ideias/datas, edição, detalhes, CTA, carrossel, roteiro e MP4 privado; aprovação final imutável | `firestore-content`, `content-date-provider`, `firestore-http-journey` | Modelos texto e Storage privado | Implementado; fixtures/HTTP aprovados |
| Artes / logo | Referências reais autorizadas, imagens privadas, capa de carrossel antes das demais, logo solicitado e deduplicado | `firestore-content`, `firestore-content-worker`, `image-provider` | Modelo imagem, compatibilidade dos formatos, quotas/custo, Storage | Implementado; fixtures aprovadas; imagens reais pendentes |
| Atendimento / handoff | Política revisada, horários/fuso, consentimento, opt-out, controle humano, escalonamento clínico; OAuth/vault AAD | `firestore-attendance`, `whatsapp-cloud`, `inbox`, `service-flow` | WhatsApp Cloud oficial/Meta, número verificado, webhook HTTPS assinado, permissões | Implementado; fixtures aprovadas. Templates, mídia Cloud, histórico anterior e recibos de entrega pendentes |
| Relacionamento / campanhas | Audiência e consentimento versionados, importação administrativa, preview, aprovação, limite diário, opt-out e envio incerto sem repetição | `firestore-message-campaigns`, `message-campaign-worker` | Cloud oficial, janela de 24h; templates Meta aprovados ainda pendentes | Implementado com limite explícito; fixtures aprovadas; nenhum envio real |
| Tráfego opcional | `skipped`, retorno ao planejamento, orçamento/conta/peça/versionamento, leases e pausa compensatória | `firestore-journey`, `firestore-advertising`, `ad-execution` | Meta/Google Ads de teste, orçamento autorizado; habilitação externa específica | Implementado; fixtures aprovadas; nenhum gasto |
| Publicação Instagram | Preparação privada JPEG/MP4, conta/caption/data/peça aprovadas, conversão de artes, carrossel, revogação, resultado incerto não reenviado | `social-publication`, `purchase-proxy` | App/permissão de publicação, URLs privadas temporárias e IAM de assinatura | Implementado; fixtures aprovadas; nenhum post publicado |
| Site | Preview privado/editável, histórico, fila, material por tenant, aprovação de revisão, slug/domínio reservado; publicação/DNS explícitos | `firestore-sites`, `firestore-site-worker`, `site-hosting` | Modelo, EasyPanel/DNS/HTTPS, revisão do cliente | Implementado; fixtures aprovadas; infraestrutura pendente |
| Permissões / dados | API e transação revalidam tenant, ator, canal e arquivos; coleções privadas sem consulta genérica; documento undefined rejeitado | `firestore.test`, suites de domínio, HTTP duas clínicas | IAM real/Admin SDK e regras reais; LGPD/publicidade médica | Servidor testado com fixtures; regras/IAM externos não homologados |
| Operação / recuperação | API é único executor de negócio; worker BullMQ preservado; leases, backoff, limites, stale/uncertain e quota | Suites de fila/domínio; `firestore-queue-polling` | Alertas, TTL/retention, backups, carga e índices no ambiente real | Implementado; fixtures aprovadas; operação real pendente |

## Evidência e lacunas de cobertura

- Verificação final desta retomada: `pnpm check` **código zero**, lint e tipos aprovados, **681 testes aprovados / zero falhas em 81 arquivos**, builds contracts/integrations/API/worker/Next aprovados. Log local: `/workspace/medsi-evidence/check-green.txt`. `git diff --check` aprovado.
- A execução integrada anterior passou lint/tipos e teve 672 testes aprovados / seis falhas nas fixtures de site sem modelos explicitamente configurados. As fixtures foram corrigidas, e as três regressões de autoseed foram adicionadas antes da execução verde. Não confundir esse resultado anterior com o check final.

- Baseline reproduzida: lint 5 erros, tipos com referências regionais inválidas; testes 419 aprovados/11 falhos e uma suíte bloqueada por pacotes ainda não compilados. Depois de compilar os pacotes, correções regionais chegaram a `pnpm check` aprovado com 461 testes/57 arquivos.
- A revisão integrada encontrou expectativas antigas e bugs novos de ciclo de importação, geração sem modelo, reaprovação de tráfego pulado, mudança transitória de monitoramento e campo `undefined`. Foram corrigidos e adicionadas regressões.
- `firestore-http-journey` usa Nest HTTP real com banco em memória e identidade de fixture, duas clínicas distintas, cadastro completo, reload, checkout simulado, fontes vazias/ausentes, estratégia, datas no mês, skip, conclusão, acesso cruzado negado e edição de perfil. Não é E2E de navegador/Firebase Auth.
- A API completa iniciou e `/health` retornou `ok`, `mode=test`, `databaseProvider=firestore`, banco/autenticação `not-configured`. `ai:models:check` retornou `unconfigured` para todos os papéis e encerrou com falha esperada (CLI 2 / pnpm 1); nenhuma chamada de geração foi feita.
- O emulador Firestore foi tentado com Java 21, projeto estritamente `demo-medsi`, cache temporário; download de `cloud-firestore-emulator-v1.22.0.jar` bloqueado pela rede (CONNECT 403). Portanto não há evidência de emulador, IAM ou Firestore real nesta entrega.
- Tempos observados de HTTP local são duração da suíte, sem carga simultânea/provedores. Não há SLA ou capacidade de produção medidos. Testes em memória serializam transações; não substituem concorrência em réplicas Firestore.
- Inventário em `medsi-firestore-operations.json` diferencia RPCs nativas e chamadas ainda pendentes. A comparação das operações exportadas com o registro executável do client foi realizada, sem entradas ausentes. Operações administrativas legadas fora do fluxo principal não devem ser prometidas como migradas.

## Pesquisa de termos e sazonalidade

A [política oficial Places](https://developers.google.com/maps/documentation/places/web-service/policies) exige respeitar armazenamento/atribuição. IDs podem ser armazenados; isso não torna um lote de outros detalhes permanentemente armazenável. Por isso a fila regional persistente usa OSM, mantendo Places em busca transitória e IDs/nomes explicitamente confirmados pelo usuário. Ainda cabe revisão dos termos aplicáveis ao projeto e de qualquer uso derivado em anúncios antes de ampliar a persistência.

[SerpApi RELATED_QUERIES](https://serpapi.com/google-trends-related-queries) define o endpoint e métricas; os adaptadores preservam crescimento relativo, Breakout e top/interesse separadamente. [IBGE agregados](https://servicodados.ibge.gov.br/api/docs/agregados?versao=3) fornece metadados que são validados antes de consultar a distribuição.

Outubro inclui [10 de outubro, Dia Mundial da Saúde Mental, OMS](https://www.who.int/campaigns/world-mental-health-day), e referência editorial de saúde da mulher [INCA](https://www.gov.br/inca/pt-br/assuntos/cancer/tipos/mama/introducao). Aplicabilidade depende da especialidade e revisão responsável; não são eventos da clínica, ofertas ou aconselhamento individual. O calendário de outubro não reaproveita automaticamente 7 de abril.

O [Google Maps Scraper Kit](https://github.com/Mahanaicoach/google-maps-scraper-kit) foi apenas inspecionado pela página pública: MIT declarada, Docker/headless scraper e enriquecimento de contatos; o README reconhece conflito com termos Google. Não foi clonado, instalado ou executado. Não houve auditoria completa de código/imagens/dependências/manutenção; licença do código não autoriza coleta de dados. Não adotado e não bloqueia Places/SerpApi. Qualquer adoção exige avaliação técnica/jurídica separada, sem contornar bloqueios.

## Entrega e próximo gate

Consulte `medsi-test-runbook.md` para instalação, configuração sem segredos, homologação gradual, monitoramento, backup/restauração e rollback. Guias específicos: `firestore-billing-2026-10-07.md`, `content-firestore.md`, `medsi-attendance-firestore.md`, `medsi-site-acceptance.md`, `instagram-publication.md`, `digital-firestore.md`, `model-preflight.md`, `regional-meta-bridge.md`, `medsi-progressive-profile.md`, `relationship-campaigns-firestore.md`.

O responsável pela liberação externa é a operação/Iuri: ambiente privado de teste, ativos/permissões oficiais, configuração segura, sessões de duas clínicas fictícias, testes reais de provedores e revisão médico/jurídica. A equipe de desenvolvimento corrige qualquer falha dessas sessões antes da aprovação de produção. Não remover o bloqueio de produção para contornar homologação.
