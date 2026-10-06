# Fluxo MedSI: plano, pesquisa regional e estratégia

Pedido: preparação após confirmação do plano; etapa 1 dedicada ao público e assuntos da região/especialidade; estratégia apoiada nas fontes; progresso visível nas operações demoradas.

Decisões de implementação:
- Evoluir o fluxo existente autorizado pelo usuário. Manter checkout de teste identificado; nenhuma cobrança ou aprovação automática.
- Remover a animação artificial antes do plano. Após confirmação, mostrar o estado real da pesquisa na estratégia, inclusive em retomadas.
- Município confirmado é o recorte inicial, enquanto aguarda a preferência opcional sobre área de atendimento. IBGE/Facebook conservam seus recortes, sem estimar bairros por proporção.
- Consultar Google Trends para cada especialidade junto ao nome do município, com filtro estadual explicitamente identificado; não afirmar audiência municipal para esse sinal. Crescimento e interesse são métricas distintas.
- X: amostra recente por especialidade e menção da cidade, com fonte/período; interações observadas não comprovam crescimento ou residência. Acesso depende de credencial do provedor.
- Assuntos do Facebook permanecem identificados como integração pendente até existir uma fonte autorizada. Estimativa de audiência é um dado separado. Não inventar um endpoint de tendências.
- Registrar progresso por fonte nos jobs Firestore, protegido por lease, escopo, versão e plano. Mensagens de geração nas outras etapas seguem o estado real do trabalho. Sem percentuais ou prazos fictícios.
- Preservar snapshots antigos e aprovações. Novos sinais entram no snapshot aprovado e no contexto da estratégia; uma nova coleta invalida aprovações dependentes como hoje.
- Não alterar dados reais, faturamento, credenciais ou deploy. Testes de provedores usam fixtures.

Etapas:
- [x] Regressões do recorte, métricas e progresso; observar falhas antes da implementação.
- [x] Coleta/contratos/persistência e contexto da estratégia.
- [x] Fluxo de compra e acompanhamento com estados de carregamento reais.
- [x] Testes dirigidos, pnpm check, reinício e verificação HTTP; documentação de limites.

Registro: SERPAPI_API_KEY e X_BEARER_TOKEN ausentes no ambiente local em 06/10. Meta no Firestore ainda depende da migração/conexão de credenciais da empresa. Integrações sem acesso real ficam pendentes de homologação.

Ruling: o usuário já autorizou estas alterações concretas no fluxo existente; executar por etapas revisáveis sem novo pedido de permissão de implementação. Preservar a árvore de trabalho e o ambiente local em uso.


Complemento do pedido: Clínica/Consultório como primeira pergunta, mapa aberto/raio/seleção explícita de concorrentes e conta única. Decisão: Leaflet+OSM; viewport de malha IBGE não é endereço. Cliente confirma ponto para consultar Overpass, sem geocodificador público automático. Documentação em docs/medsi-fluxo-regional-2026-10-06.md.
Delegação autorizada pela skill dispatching-parallel-agents: cadastro médico, conta/navegação, tópicos regionais; raiz integra compra, UI, mapa e persistência. Revisões independentes de backend/UI realizadas com achados corrigidos. Checagem integrada/reinício pendentes no momento deste registro.

Validação concluída por suíte completa + repetição dirigida da fixture corrigida e build final; runtime HTTP confirmado. Limites de navegador/fontes reais em docs/progress.md.
