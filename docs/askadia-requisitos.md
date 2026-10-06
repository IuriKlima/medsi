Prompt mestre para desenvolver a Askadia

Versão 1.0 — 21 de setembro de 2026. Especificação consolidada para execução no repositório da Askadia.

Você é o engenheiro responsável por evoluir o sistema existente da Askadia até um SaaS operacional de marketing com IA. Trabalhe como engenheiro de produto full stack: inspecione o código, preserve o que funciona, implemente fluxos completos, valide e documente. Execute o trabalho; não encerre entregando apenas um plano, uma coleção de telas ou botões sem operação real.

1. Objetivo e regras de execução

A Askadia reúne diagnóstico da empresa, pesquisa de concorrentes, estratégia mensal, calendário, produção de conteúdo, aprovações, publicação, sites, campanhas de tráfego, CRM e atendimento comercial. Começaremos pelo segmento fitness, principalmente academias e estúdios, com estrutura preparada para outros segmentos.

Evolua o projeto atual. Não recrie tudo do zero e não substitua a identidade visual. Antes de alterar arquitetura, inspecione os componentes, rotas, serviços, autenticação, armazenamento, migrações, testes e integrações existentes.

Regras obrigatórias:

Leia os arquivos AGENTS.md aplicáveis e preserve alterações preexistentes do usuário.

Confira versões e contratos das APIs na documentação oficial antes de implementar. Não invente endpoints, nomes de modelos ou permissões.

Use este prompt como escopo consolidado. As decisões mais recentes aqui descritas substituem propostas anteriores conflitantes, especialmente o uso do Gemini para geração visual.

Divida a execução em etapas verificáveis e mantenha um registro de progresso no repositório. As etapas são a ordem de entrega, não uma autorização para descartar os módulos posteriores.

Faça escolhas técnicas reversíveis e registre-as. Pergunte somente quando houver ambiguidade material, falta de acesso ou decisão comercial que realmente impeça uma entrega.

Quando uma credencial ou aprovação externa faltar, implemente o restante do fluxo, adaptadores, contratos, estados de erro e testes. Identifique exatamente a dependência e prossiga nos módulos independentes.

Não alegue integração funcional com base em mock, botão, variável preenchida ou resposta fictícia. Diferencie implementado, configurado e homologado.

Não apague dados, não execute migrações destrutivas e não ative anúncios, cobranças ou publicações reais só para demonstrar funcionamento. Use ambiente de teste e autorizações já concedidas; para efeitos reais ainda não autorizados, apresente primeiro o resultado concreto a executar.

Não exponha segredos no chat, no frontend, em logs ou em commits.

Ao fim de cada etapa, registre comportamento entregue, testes, limitações e próxima etapa. Não reporte porcentagem de conclusão sem critérios verificáveis.

2. Diagnóstico inicial com base nos prints

Foram analisados 13 prints, incluindo uma repetição da página Campanhas e um detalhe do seletor de empresas. As observações abaixo são evidência visual; o código e o funcionamento ainda precisam ser auditados por você.

Tela

Evidência nos prints

Evolução necessária

Visão geral

Layout consistente, seletor de empresa, indicadores e checklist; aparecem “Modo local”, “Rascunho local” e dados cadastrados no navegador

Consultas reais por empresa, indicadores com origem, pendências acionáveis e progresso baseado em eventos reais

Estratégia

Cards explicativos e criação manual; aviso de que geração depende de onboarding, OpenAI e limites

Diagnóstico real, geração mensal, versões, justificativas, fontes e revisão

Calendário

Grade mensal e botão de criar conteúdo; publicações ainda não conectadas

Itens persistentes, visões mês/semana/lista, tarefas, geração de peças e programação real

Estúdio de conteúdo

Filtros de imagem, carrossel e vídeo; estado vazio

Biblioteca de arquivos, geração Gemini, revisão, versões e vínculo com calendário

Aprovações

Revisão local; aprovação autenticada e publicação descritas como etapas futuras

Aprovações no servidor, por usuário e versão, invalidação por alteração e trilha de auditoria

CRM e leads

Kanban/lista, criação de leads e aviso de CRM local

Contatos e oportunidades persistentes, responsáveis, tarefas, histórico e entrada pelos canais

Caixa de entrada

Descrição futura de WhatsApp e Instagram, configuração necessária

Conversas reais, triagem, transferência, notificações e atendimento humano

Campanhas

Configuração pendente e proposta de campanhas pausadas

Propostas OpenAI e execução supervisionada via Meta Ads e Google Ads

Meu site

Descrição de módulo futuro

Geração, edição, prévia, versões, publicação, formulários e domínio do cliente

Integrações

Nove provedores apresentados; zero conexões

Separação entre provedores operados pela Askadia e canais conectados pelo cliente; incluir Gemini e saúde real das conexões

Configurações

Empresa, fuso, exportação local, R$ 497 e adicional de R$ 1.000; contratação indisponível

Perfil editável, membros, permissões, plano, cobrança, consumo e preferências persistentes

Seletor de empresas

Duas empresas e ação “Adicionar empresa”

Vínculos reais, autorização, troca segura de contexto e cobrança independente

Resultados

Link visível no menu, sem print específico do conteúdo

Inspecionar a implementação antes de classificar seu andamento

Agentes e onboarding

Aba dedicada não aparece no menu enviado

Criar experiência conversacional permanente com mapa e pesquisa inicial

Administração e acompanhamento

Painéis específicos não aparecem nos prints

Implementar os cinco perfis e suas visualizações, sem presumir ausência no código

Site público e landing page Askadia

Não aparecem nos prints

Criar os dois, compartilhando a identidade do sistema e botão de login

Conclusão de trabalho: há uma base visual consistente e indícios explícitos de protótipo local. Os prints não comprovam backend, persistência, isolamento, segurança ou funcionamento das integrações. Audite antes de decidir o que implementar ou reaproveitar.

Crie docs/askadia-auditoria.md com a matriz: módulo, rotas/arquivos encontrados, evidência, estado real, lacunas, dependências e critério de conclusão. Classifique como interface apenas, funcional local, funcional persistente, integrado sem homologação ou homologado.

3. Identidade visual e experiência

Preserve o logo e os componentes existentes da Askadia. A referência é clara, minimalista e elegante: fundos quase brancos, cinzas frios, títulos escuros, cartões brancos, bordas discretas, cantos arredondados, sombras leves, ícones lineares, espaço entre elementos e detalhes de vidro fosco. O hero atual usa formas tridimensionais peroladas.

Extraia cores, tipografia, espaçamentos e raios dos tokens e estilos reais do repositório. Não invente códigos exatos de cor com base em screenshot.

Use o mesmo sistema de componentes no produto, site institucional e landing page.

Mantenha glassmorphism sutil em elementos adequados, sem prejudicar contraste ou leitura.

Melhore a legibilidade dos textos secundários e pequenos; não reproduza baixo contraste só porque aparece no print.

Sidebar desktop estável: marca e empresa acessíveis, navegação com rolagem própria e rodapé funcional. No celular, use menu recolhível.

Não deixe a página inteira rolar horizontalmente. O Kanban pode ter rolagem horizontal dentro de sua área; ofereça lista para telas menores.

Na visão geral de clientes ativos, priorize pendências, resultados e próximas ações; o hero institucional pode ser reduzido após a ativação inicial.

Use datas em português corretamente, valores em BRL e fuso configurável. America/Sao_Paulo pode ser o padrão inicial, nunca um fuso implícito em todos os jobs.

A interface pública deve falar do benefício e da próxima ação. Diagnósticos técnicos detalhados ficam na administração.

Toda ação visível deve funcionar, indicar requisito de acesso/plano ou explicar uma indisponibilidade real. Elimine links sem destino e mensagens falsas de sucesso.

Distingua vazio, carregando, processando, desconectado, bloqueado pelo plano, erro e ausência de permissão.

Mantenha foco de teclado, labels, texto alternativo, contraste e redução de movimento. Valide desktop e celular.

A identidade da Askadia é a interface do software. As artes, anúncios e sites dos clientes seguem a identidade de cada cliente, nunca recebem automaticamente a paleta e o logo da Askadia.

4. Arquitetura e reaproveitamento

Stack de referência: Next.js, React e TypeScript; Tailwind e shadcn/ui; backend modular NestJS; PostgreSQL no Supabase; Supabase Auth e Storage; contratos Zod; Redis e BullMQ para tarefas duráveis.

Use essa base quando compatível com o projeto. Se já houver backend funcional diferente ou rotas server-side bem organizadas, mantenha-o e documente a decisão. Não introduza dois backends que dupliquem a mesma regra. Respeite o ORM, gerenciador de pacotes e lockfile existentes quando adequados.

Separe domínios: identidade e acessos, empresas, faturamento, onboarding, conhecimento, pesquisa, agentes, estratégia, conteúdo, publicação, CRM, atendimento, campanhas, sites, métricas e acompanhamento.

O banco é a fonte de verdade. localStorage serve apenas a preferências e rascunhos auxiliares, não a acesso, cobrança ou dados oficiais.

Ofereça exportação e importação assistida dos rascunhos locais atuais. Após login, mostre prévia e empresa de destino, valide permissões e importe com deduplicação. Não apague o original antes da confirmação.

Jobs longos executam em workers, com progresso persistido. Não dependem de aba aberta, temporizador no navegador ou chamada HTTP longa.

O scheduler cria tarefas mensais/diárias/semanais no backend, com fuso, chaves de deduplicação e retomada após falhas.

Use eventos transacionais ou outbox para não perder tarefas entre gravação no banco e fila.

Toda API, cache, arquivo, busca, mensagem em tempo real e job deve resolver o escopo da empresa.

Inclua logs estruturados com identificadores de correlação; não grave prompts completos com dados pessoais indiscriminadamente.

Preserve demo local somente como ambiente explicitamente separado. Em produção, falha do banco não pode fazer o sistema entrar silenciosamente em demo.

5. Empresas e contratação

Hierarquia: plataforma Askadia → área de trabalho do proprietário → empresas → dados e integrações de cada empresa. Cada negócio tem perfil, assinatura, consumo, marca, agentes, conteúdos, contatos, conversas, site e campanhas próprios.

Criar, editar, selecionar e arquivar empresa.

Exibir empresa ativa em toda ação operacional.

Um proprietário gerencia vários negócios e paga por empresa.

Uma pessoa pode ter papéis diferentes em empresas diferentes.

Criar empresa começa como rascunho; não gera cobrança sem contratação confirmada.

Ao trocar de empresa, cancelar consultas antigas ou descartar respostas atrasadas; invalidar caches, assinaturas em tempo real e estado de formulários do contexto anterior.

Não reaproveitar uma integração de uma empresa para outra sem vínculo validado.

Regras comerciais:

Oferta

Regra

Marketing básico

R$ 497/mês por empresa; planejamento, conteúdo e CRM como base do produto

Acompanhamento semanal

Adicional de R$ 1.000/mês; proposta de contratação por empresa; cliente participa com a equipe

Plano com atendimento

Acrescenta IA de triagem e caixa de entrada WhatsApp/Instagram; preço ainda não definido

Verba de anúncios

Separada da assinatura, nas contas de anúncio do cliente

Domínio

Conexão prevista; compra e renovação por conta do cliente; inclusão/franquia comercial configurável

Duas empresas básicas somam R$ 994; com acompanhamento em uma, R$ 1.994. Não somar o adicional em todas por padrão.

Implemente catálogo de planos e permissões por recurso no servidor. Franquias de IA, imagens, armazenamento, usuários, regenerações e mensagens devem ser configuráveis, sem promessa pública de ilimitado. Preço do plano superior vazio não significa gratuito: exiba contato comercial e não permita checkout com valor inventado.

Integre cobrança por empresa com Asaas ou preserve o provedor já homologado se houver decisão registrada. Implemente checkout, eventos autenticados, conciliação, histórico, situação, alteração e cancelamento. Não ative assinatura só pelo redirecionamento do checkout. Eventos duplicados ou fora de ordem não podem ativar, cancelar ou cobrar novamente. Defina carência e retenção como configurações pendentes; cancelamento não apaga dados imediatamente.

6. Cinco perfis e painéis

Implemente autorização por papel, empresa e ação, no servidor e nas políticas de dados. Não confie em ocultar menus.

6.1 Administrativo geral da Askadia

Listar e filtrar todos os clientes por empresa, proprietário, plano, cobrança, estágio de onboarding e acompanhamento.

Abrir o painel de qualquer cliente com contexto interno explícito e trilha de auditoria.

Gerenciar acessos, vínculos da equipe, planos, assinaturas, cobranças e consumo.

Visualizar saúde das integrações, falhas de jobs, uso e custo de IA e pendências de homologação.

Configurar provedores de IA e métodos/prompt versions, sem expor chaves existentes.

Acesso interno não concede automaticamente aprovação do cliente para gastar ou publicar.

6.2 Acompanhamento

Ver a carteira de clientes atribuídos e abrir seus painéis.

Revisar estratégia, peças, campanhas, resultados e tarefas.

Preparar e registrar encontros semanais com participação do cliente.

Executar ajustes operacionais quando autorizados; aprovar somente se houver delegação explícita.

Sem administração global, alteração de cobrança ou acesso a empresas fora da carteira.

6.3 Proprietário

Gerenciar área de trabalho, negócios, membros e permissões.

Gerenciar plano e pagamento de cada empresa.

Acessar operação e resultados das próprias empresas.

Aprovar planejamento, peças, site e orçamento; delegar permissões com limites e possibilidade de revogação.

6.4 Gerente de marketing

Gerenciar o marketing das empresas atribuídas: agentes, onboarding, conhecimento, marca, estratégia, calendário, estúdio, site, canais, campanhas e resultados.

Acessar CRM e conversas conforme permissões concedidas.

Aprovação de verba ou publicação deve respeitar delegações e limites.

Não contratar, cancelar ou gerenciar pagamento do SaaS por padrão.

6.5 Atendente

Ver fila de atendimento, contatos, oportunidades, resumo da triagem, histórico e tarefas autorizadas.

Assumir conversas, responder, registrar informações, mover etapas, agendar e transferir.

Não alterar plano, cobrança, identidade visual, estratégia, artes ou verba.

Rotas conceituais: /admin, /acompanhamento e área autenticada /app. Adapte à estrutura existente. A sessão interna deve preservar o operador real, empresa acessada, início/fim e ações; mostre faixa de acesso interno e “Voltar à carteira”. Nunca peça senha do cliente nem se faça passar por ele na auditoria.

Convites precisam de expiração, aceite e revogação. Remoção de acesso deve valer em APIs, arquivos e canais em tempo real, inclusive para sessões antigas. Um cliente não pode atribuir a si mesmo papel de administrador da plataforma.

7. Aba Agentes e onboarding em conversa

Adicione “Agentes” ao menu. Dentro dela, ofereça agentes com finalidade clara: onboarding, pesquisa, estrategista, conteúdo/design, tráfego, análise e atendimento, conforme plano. Cada conversa pertence à empresa selecionada.

O onboarding deve parecer uma conversa consultiva: uma pergunta principal por vez, respostas livres, botões quando úteis, anexos, mapa e cards dentro do fluxo. Evite formulário longo apresentado de uma vez. Mostre progresso e permita sair e retomar.

Ordem obrigatória:

Pedir nome do estabelecimento e cidade/endereço; se necessário, o tipo básico de negócio.

Buscar no Google e apresentar opções para confirmar o local correto.

Mostrar mapa do Google com marcador e endereço; permitir corrigir. Se não houver cadastro, aceitar endereço/posição manual.

Buscar e listar possíveis concorrentes próximos por atividade e região. Mostrar mapa/lista, raio usado, dados públicos disponíveis e fontes. Permitir confirmar, excluir e adicionar. Remover a própria empresa e duplicatas.

Perguntar quais concorrentes e marcas o cliente considera referência. Aceitar nome, URL de site, perfil ou identificador social. Perguntar o que admira: comunicação, oferta, posicionamento, estética ou atendimento. Aceitar referências fora da região e “não tenho referências”.

Somente depois aprofundar todas as informações do negócio.

Exibir resumo editável, concorrentes locais, referências, lacunas e materiais recebidos; pedir confirmação dos fatos.

Persistir versão confirmada e liberar diagnóstico e estratégia inicial.

“Usar minha localização” é opcional, com permissão do navegador. A localização a validar é a da empresa, não a localização atual do dono. Geolocalização negada não bloqueia o fluxo. Falha do Google permite continuar manualmente com pesquisa pendente, sem inventar empresas ou coordenadas.

Blocos da entrevista:

Tipo de negócio, região atendida, unidades, estrutura, instalações, equipamentos e acessibilidade.

Horários de funcionamento, aulas, modalidades, capacidade e períodos ociosos.

Planos, serviços, preços, condições, taxas, restrições e validade das ofertas.

Público desejado, necessidades, objeções, diferenciais verificáveis e posicionamento.

Processo comercial, responsáveis, horários de atendimento, canais e forma de agendar visita/aula experimental.

Objetivos, metas, orçamento disponível para mídia, histórico e sazonalidade.

Logo, cores, fontes, estilo, tom de voz, fotos reais da empresa, produtos, equipe e instalações.

Site existente, Instagram, Facebook, WhatsApp e outros canais informados.

Disponibilidade para gravar vídeos, frequência possível, responsável e acervo; ou preferência por estáticos.

Permissões de uso informadas para materiais enviados.

Não repita perguntas respondidas. Entenda respostas naturais e peça esclarecimento apenas quando necessário; não invalide nomes legítimos de cidades por coincidirem com estados. Não transforme ausência de informação em afirmação inventada.

Persista mensagens, anexos, etapa, respostas estruturadas, origem, confiança, pendências e confirmação. O histórico de conversa não substitui os campos estruturados. Permita atualização posterior com nova versão; sinalize conteúdos afetados e mantenha aprovações independentes.

8. Conhecimento e pesquisa

Mantenha base por empresa com fatos comerciais confirmados, ofertas, marca, arquivos, perguntas frequentes, objeções, decisões, correções, estratégias e resultados. Cada registro relevante tem origem, data, validade e responsável.

Dados extraídos de site são sugestões até confirmação, especialmente preços, horários, condições e promessas. Ao mudar oferta ou preço, sinalize materiais que podem ficar desatualizados.

Pesquisa deve distinguir:

Concorrentes locais encontrados e validados.

Concorrentes de público semelhante.

Referências indicadas pelo cliente.

Sugestões da IA ainda não confirmadas.

Analise presença digital acessível, posicionamento, ofertas públicas, diferenciais e temas. Registre URLs, datas, limitações e hipóteses. Não invente faturamento, verba, ROAS ou conversões de concorrentes. Pesquisa de redes sociais e anúncios públicos depende de fontes e acessos permitidos; não prometa cobertura irrestrita de perfis ou de bibliotecas de anúncios.

Atualize antes do ciclo mensal e por solicitação com limites de consumo. Uma falha parcial de pesquisa não deve apagar o histórico nem bloquear todo o sistema. Respeite atribuição e regras de retenção de dados dos provedores, especialmente conteúdo do Google Places.

9. Método dos agentes e orquestração

Implemente método versionado: diagnosticar → priorizar → planejar → produzir → validar → executar → aprender.

Cada execução recebe contexto da empresa, versão do método, dados confirmados e permissões; produz saída validada e registra modelo, fontes, duração, consumo e estado. A coordenação de dependências, aprovação, execução e tentativas deve ser feita em código.

Papéis:

Agente

Responsabilidade

Onboarding

Entrevistar, identificar lacunas e propor atualização de perfil

Pesquisador

Reunir evidências locais e referências com fontes

Estrategista

Definir objetivo, público, oferta, campanhas e calendário mensal

Redator

Legendas, textos de anúncio, roteiros e briefings

Designer

Produzir imagens com Gemini e compor materiais com a marca do cliente

Tráfego

Elaborar propostas e ajustes para Meta/Google Ads

Atendimento

Responder e qualificar leads do plano superior

Analista/revisor

Consolidar resultados, checar fatos, marca, qualidade e pendências

Não precisa existir um servidor ou modelo diferente por papel. O aprendizado inicial é memória e revisão de métodos, não treinamento automático com conversas de todos os clientes. Nunca compartilhar conhecimento privado entre empresas.

10. Integração OpenAI para estratégia e tráfego

Use a API oficial da OpenAI, com SDK oficial no backend e Responses API. “API do ChatGPT” neste projeto significa integração de API, sem automação da interface do ChatGPT ou uso de cookies de sessão.

Implemente um adaptador StrategyProvider ou equivalente para onboarding, diagnóstico, planejamento mensal, legendas, roteiros, propostas de anúncios, análise e triagem. Use saídas estruturadas com schema e validação Zod; trate recusa e resposta incompleta. A documentação oficial descreve Structured Outputs e integração com Responses: OpenAI Structured Outputs.

Propostas de engenharia para esta integração:

Modelos configuráveis por finalidade: estratégia, redação e atendimento. Escolha um modelo acessível à conta com base em qualidade, custo e suporte ao contrato; documente a seleção.

Não espalhe identificadores de modelo nos componentes. Defina-os no ambiente/configuração do servidor.

Não exija que cada academia forneça uma chave da OpenAI: por padrão, a Askadia opera o provedor e mede consumo por cliente.

Credenciais são administradas pela operação da Askadia. O cliente vê disponibilidade do recurso e seu consumo, não chaves ou parâmetros internos.

Autenticar, autorizar empresa, verificar assinatura/franquia e reservar consumo antes de iniciar geração.

Validar dados comerciais, referências a objetos e limites depois da resposta; schema válido não garante verdade nem autorização.

Recuperar somente contexto necessário, com snapshot da versão de perfil, oferta, pesquisa e resultados.

Persistir rascunho, versão, fontes, resumo da justificativa, lacunas e identificador da execução. Não pedir nem salvar raciocínio interno do modelo.

Tentativas limitadas com backoff, timeout, cancelamento lógico e tratamento de rate limit. Evitar regenerações duplicadas em cliques ou jobs repetidos.

Se pesquisa web for utilizada, preserve fontes verificáveis e datas; texto produzido pelo modelo sem consulta não comprova pesquisa.

Testar conexão no servidor e registrar horário/resultado. “Chave cadastrada” e “geração homologada” são estados diferentes.

A OpenAI cria a estratégia e a proposta estruturada de campanha. O backend valida e traduz para Meta/Google Ads. Não permita ao modelo executar payload arbitrário ou definir seu próprio limite de gasto.

11. Integração Gemini Nano Banana para design

Use a API oficial do Gemini e o SDK @google/genai no backend. Nano Banana é a família de geração visual do Gemini; o modelo original é gemini-2.5-flash-image. Mantenha o modelo em GEMINI_IMAGE_MODEL, valide disponibilidade/capacidades na conta e documente a escolha. Outras variantes da família podem ser configuradas, mas não faça substituição silenciosa por outro provedor ou modelo de custo diferente. Referência: Gemini Image Generation.

Implemente ImageGenerationProvider com operações de gerar, editar a partir de referências e produzir variações, conforme suporte comprovado do modelo selecionado. Use a interface oficial compatível com a versão instalada do SDK; não invente um endpoint chamado “nano-banana”.

Pipeline específico da Askadia:

O estrategista/redator produz o briefing a partir de um item do calendário.

O backend reúne versão da marca, textos comerciais confirmados, formatos e fotos autorizadas.

O designer gera ou edita o visual no Gemini.

A aplicação compõe logo, textos e preços controláveis quando necessário.

Valida proporção, dimensões reais, legibilidade, conteúdo comercial e integridade dos materiais.

Salva arquivos, versão, origem, briefing, modelo e consumo.

Exibe a peça no estúdio e no calendário para aprovação.

Direção de arte e regras do produto:

Kit de marca por empresa: logos originais, cores, fontes, tom, referências, áreas de proteção e restrições.

Usar fotos reais do cliente sempre que fizer sentido; não deformar equipamentos, rostos, instalações ou logos.

Para fidelidade exata, preservar o recorte original e gerar apenas cenário ou composição ao redor. Geração de imagem não garante fidelidade pixel a pixel.

Oferecer imagem estática, carrossel, story, capa de vídeo e criativo de anúncio.

Exportar feed 4:5 em 1080×1350, story/reels 9:16 em 1080×1920 e quadrado 1:1 em 1080×1080 quando solicitado. Validar arquivo final e adaptar composição sem esticar a imagem nem cortar texto.

Não presumir que a dimensão nativa devolvida pelo modelo coincide com a exportação final. Faça composição/redimensionamento controlado e sinalize limitação de qualidade quando houver.

Definir áreas seguras por canal/formato, especialmente texto e logo em stories e capas.

Carrosséis têm narrativa e consistência visual, com cada slide versionado e associado ao conjunto.

Aprovação é sobre a versão final renderizada, incluindo texto, logo, legenda e formato.

Oferecer pedido de alteração por conversa e controles básicos de texto, posição, logo e troca de imagem. Não precisa construir um editor equivalente ao Canva no primeiro ciclo.

Imagens raster do Gemini não são camadas editáveis. Armazene a imagem-base e um documento de composição separado para os elementos editáveis.

Regenerar uma peça não deve recriar o calendário inteiro nem descartar versões aprovadas.

Não ativar fallback silencioso para OpenAI Imagens; a escolha atual do usuário para design é Gemini.

No frontend, mostrar fila, progresso, prévia, falha, motivo compreensível e nova tentativa dentro dos limites.

O Gemini é o designer de conteúdo dentro do produto. O layout da aplicação e do site continua sendo código React/CSS acessível; não transforme telas inteiras em imagens geradas.

12. Estratégia mensal

Gere automaticamente a estratégia a cada ciclo mensal, com acionamento manual para refazer. Exija contexto mínimo confirmado e recursos contratados. Primeiro ciclo sem dados deve apresentar hipóteses, nunca resultados inventados.

Cada plano deve conter:

Diagnóstico, fontes e lacunas.

Objetivo comercial prioritário e indicadores.

Público e região, diferenciais e objeções.

Oferta confirmada e capacidade de atendimento.

Campanhas e hipóteses por canal.

Pilares de conteúdo, formatos, frequência e calendário.

Proposta de verba por campanha/período, separada da assinatura.

Destino dos leads, responsáveis e tarefas.

Critérios de revisão e plano de medição.

Datas sazonais relevantes verificadas e contexto local.

Capacidade de gravação e disponibilidade de material limitam a proposta. Não pedir dez vídeos de quem informou que consegue gravar um. Checagem mensal curta atualiza preços, eventos, metas e disponibilidade antes de finalizar o ciclo.

Ao refazer: criar nova versão, mostrar diferenças, avaliar itens já aprovados/agendados/publicados e aplicar substituições explicitamente. Não publicar, gastar ou apagar peças antigas automaticamente. Use chave por empresa/ciclo/versão para evitar dois planos gerados pelo mesmo evento.

13. Calendário, estúdio e vídeos

Calendário em mês, semana e lista. Cada item possui empresa, estratégia/versão, campanha, objetivo, canal, formato, data/fuso, responsável, briefing, legenda, CTA, ativos, tarefas e status.

Permita criar peça avulsa, editar, mover data, duplicar como rascunho, comentar e cancelar. Ao reprogramar uma peça já agendada, atualize a tarefa durável e invalide a anterior com controle de concorrência.

Após aprovação do planejamento, permita gerar as artes do calendário em lotes dentro da franquia. Lotes devem permitir retomada de itens com falha, sem refazer os concluídos. Implemente controle de custo, concorrência e cancelamento de itens ainda não iniciados.

Estados de produção: rascunho, aguardando material, em produção, em revisão, alterações solicitadas, aprovado, agendado, publicado, falha e cancelado. Registre as transições. A geração de um arquivo não significa publicação.

Para vídeos:

Gerar roteiro, objetivo, gancho, falas, cenas, duração sugerida, CTA e instruções de gravação.

Orientar edição: cortes, textos na tela, ritmo, trilha quando aplicável e encerramento.

O cliente grava e edita; faz upload do vídeo final no sistema.

Receber upload com progresso, validação de MIME/tamanho/duração, armazenamento, prévia, capa e legenda.

Vincular ao calendário e seguir aprovação/programação.

Se gravação atrasar, sugerir alternativa estática sujeita à aprovação.

Não implementar edição automática de vídeo como requisito da primeira versão.

Biblioteca com busca, tipo, campanha, período, status, versões, originais e limites de armazenamento. Exportar imagens, legendas e roteiros.

14. Aprovação e publicação

Centralize estratégias, peças, sites e campanhas pendentes. Registre empresa, objeto, versão/hash, responsável, decisão, comentário e horário.

Estratégia aprovada não equivale a arte aprovada nem a orçamento aprovado.

Alteração material em texto, imagem, oferta, destino, conta, período ou verba exige a aprovação correspondente novamente.

Verifique autorização ao criar o job e imediatamente antes de executar o efeito externo.

Aprovação revogada ou usuário sem permissão bloqueia ações futuras.

Publicação segue formato efetivamente suportado pela conta/canal e permissões autorizadas.

Persistir ID externo, status e link quando disponível; aguardar confirmação real.

Tratar processamento de mídia, tokens expirados, revogação, rate limits e erros recuperáveis.

Em timeout, reconciliar resultado antes de recriar; retries não podem publicar duas vezes.

Permitir cancelar antes do envio e distinguir cancelamento solicitado de cancelamento confirmado.

Onde API não suportar o formato, oferecer exportação/manual claramente identificado, sem dizer que publicou.

15. Meta Ads e Google Ads

Implementar conectores reais para as duas plataformas. Primeiro escopo homologado: geração de leads no Meta e pesquisa no Google; depois ampliar a matriz de tipos e operações. Não afirmar suporte universal antes de provar.

Funções:

OAuth e seleção explícita de contas/ativos por empresa.

Importar campanhas existentes inicialmente para leitura; gestão exige ativação explícita do cliente.

Listar, detalhar, criar rascunhos locais, sincronizar, criar remotamente em estado pausado, pausar e editar operações suportadas.

Propor com OpenAI: objetivo, público, geografia, oferta, orçamento, período, destino, textos, criativos, hipóteses e indicadores.

No Google, incluir grupos, palavras-chave, correspondências, negativas e anúncios conforme capacidades validadas; não inventar estimativas de busca ou conversão.

No Meta, validar objetivo, evento, destino, ativos, posicionamentos e criativos disponíveis.

Campanha, conjuntos/grupos, anúncios, orçamento e aprovações devem ter entidades e versões claras.

Antes de sincronizar/ativar, mostrar resumo de gasto, conta, região, período, criativos e destino.

Criar entidades remotas pausadas somente em conta autorizada. Verificar hierarquia, pois um orçamento ou conjunto ativo pode produzir efeito mesmo com outro objeto pausado incorretamente.

Ativar apenas a configuração aprovada. Elevar verba exige nova aprovação ou limite pré-autorizado.

Manter limites internos, alertas, botão de pausa, registro de mudanças e reconciliação com mudanças feitas fora da Askadia.

Não prometer teto financeiro instantâneo absoluto: os provedores possuem atrasos de contabilização e regras próprias de orçamento.

Consultar métricas com moeda, fuso, período, fonte e data da sincronização.

Receber leads dos formulários suportados e alimentar CRM sem duplicidade.

Crie matriz de suporte por plataforma, tipo, operação, permissão e estado de homologação. Credencial não substitui revisão/aprovação de aplicativo, elegibilidade da conta ou acesso de desenvolvedor. Mostre pendências reais.

16. CRM

Separar contato de oportunidade. Um contato pode ter várias oportunidades, mas seus dados não atravessam empresas.

Kanban e lista com busca, filtros, paginação e responsáveis.

Nome, canais, telefone normalizado, e-mail, origem, oferta, interesse, etiquetas, notas e próxima ação.

Funil inicial: Novo → Em atendimento → Qualificado → Encaminhado → Visita agendada → Compareceu → Matriculado. “Perdido” exige motivo; reabertura fica no histórico.

Histórico de mudanças de etapa, tarefas, conversas, visitas e confirmações.

Distribuição manual e fila configurável; responsável persistido antes da notificação.

Entrada manual, CSV com prévia, site, landing pages, canais e formulários de anúncios.

Deduplicação por identificadores confiáveis dentro da empresa; não fundir Instagram e WhatsApp apenas por nome.

Preservar origem inicial, UTM e contatos posteriores quando disponíveis; permitir origem desconhecida.

Confirmação de matrícula por humano ou integração operacional válida. Promessa no chat não é matrícula.

Exportação autorizada e auditada; indicadores de conversão, perdas, tempo de resposta e tarefas atrasadas.

17. Atendimento integrado e triagem

No plano superior, integrar WhatsApp Business Platform/Cloud API e Instagram Messaging por APIs oficiais. Oferecer caixa de entrada com mensagens, anexos suportados, status, contato, oportunidade, responsável e notas internas.

O agente atende leads interessados, esclarece dúvidas com dados confirmados e faz triagem. Deve identificar interesse, localização quando relevante, modalidade, disponibilidade e próximo passo, sem interrogatório. Responder à dúvida inicial antes de acumular perguntas. Não inventar preço, condição, vaga ou agenda.

Transferir ao atendente com resumo, respostas coletadas, histórico, motivo e próxima ação. Respeitar pedido imediato de humano e situações sem informação suficiente. Demandas de alunos sobre financeiro/cancelamento/suporte são encaminhadas, não executadas pela IA.

Estados: IA ativa → aguardando humano → humano ativo → encerrado. Permitir retomada explícita pela IA.

“Assumir atendimento” precisa impedir inclusive respostas já em geração. Use versão/lock da conversa e verifique de novo antes de enviar.

Preservar autoria IA/humano e histórico de transferências.

Webhooks repetidos não duplicam mensagem, contato ou oportunidade.

Processar eventos com controle de ordem e entrega; não confundir aceitação da API com leitura pelo destinatário.

Notificar responsável; falha de notificação cria pendência e tentativa controlada, sem afirmar transferência concluída.

Follow-up configurável, respeitando consentimento/opt-out, janelas e templates aplicáveis; não inventar intervalos comerciais.

Horários de atendimento e ausência de atendente devem orientar expectativa real de retorno.

Tratar áudio, imagem e documento conforme suporte implementado; se não houver interpretação, indicar limitação e oferecer humano, sem fingir leitura.

Não enviar histórico completo dos leads a todos os agentes de marketing; usar sínteses pertinentes e autorizadas.

18. Site institucional completo da Askadia

Criar site público da própria Askadia, separado do módulo “Meu site” dos clientes. Reutilizar a identidade visual e tokens do sistema. O site precisa vender a plataforma com clareza e refletir o que realmente está disponível.

Páginas sugeridas, adaptáveis às rotas existentes:

Rota

Conteúdo e função

/

Proposta de valor, produto, processo, recursos, planos resumidos, FAQ e CTA

/plataforma

Visão integrada: agentes, calendário, design, tráfego, CRM, atendimento e sites

/solucoes/academias

Aplicação para academias com exemplos de fluxos e objetivos

/solucoes/estudios

Aplicação para estúdios com sua operação e posicionamento

/como-funciona

Cadastro, conversa, pesquisa, estratégia, aprovação e execução

/planos

R$ 497 por empresa, adicional de acompanhamento e atendimento sob consulta

/acompanhamento

Serviço semanal com participação do cliente e atividades previstas

/sobre

Apresentação factual da Askadia, sem equipe, história ou números inventados

/contato

Formulário funcional e canais realmente configurados

/privacidade e /termos

Estrutura e conteúdo alinhados à operação real, com campos empresariais pendentes identificados para revisão antes do lançamento

/login

Entrada funcional na autenticação do sistema

/cadastro

Criação de conta e encaminhamento para empresa/contratação/onboarding

Header responsivo com logo, navegação, CTA e botão “Entrar” ou “Login”. Usuário autenticado recebe “Acessar painel”. Preserve deep links válidos e bloqueie redirecionamentos externos arbitrários.

Home deve comunicar: marketing organizado em um lugar; estratégia com contexto da empresa; produção coerente com a marca; aprovação do cliente; relação entre campanhas, atendimento e CRM. Não prometer número de matrículas, faturamento ou resultados garantidos.

Use capturas reais do produto e elementos visuais coerentes com o hero existente. Não crie provas sociais, depoimentos, logos de clientes, contadores ou estatísticas fictícias. Demonstrações precisam ser identificadas.

Site completo significa páginas úteis, navegação, conteúdo, formulários, login e responsividade funcionando. Não exige criar blog sem conteúdo editorial real.

19. Landing page de aquisição da Askadia

Criar landing page própria, por exemplo /lp/marketing-fitness, com a mesma identidade e foco em conversão de academias/estúdios. Ela não substitui o site institucional.

Estrutura:

Hero direto com proposta, imagem real do sistema, CTA principal e acesso discreto ao login.

Problemas atendidos: improviso, falta de tempo, conteúdo inconsistente e leads sem acompanhamento.

Demonstração do fluxo: conhecer negócio, planejar, produzir, aprovar e acompanhar.

Recursos concretos com capturas e benefícios claros.

Oferta básica por empresa e acompanhamento opcional.

Atendimento integrado como plano superior sob consulta enquanto preço estiver aberto.

FAQ sobre aprovação, vídeos, verba de mídia, domínio e vários negócios.

Formulário curto e CTA final.

Defina CTA conforme disponibilidade real: “Começar agora” quando cadastro/contratação funcionar; “Solicitar demonstração” ou equivalente quando a venda for assistida. Não oferecer teste grátis não definido.

Formulário: nome, empresa, tipo de negócio, cidade, e-mail/WhatsApp e interesse, com indicação clara de uso dos dados. Validar no servidor, prevenir spam e duplicidade, preservar UTM e exibir sucesso apenas após persistência.

Leads comerciais da Askadia vão para uma carteira interna autorizada da própria Askadia, ou módulo comercial interno separado. Nunca para a empresa que estiver selecionada no painel de um visitante autenticado. Não usar o company_id enviado pelo navegador para decidir esse destino.

Adicionar medição de visita, CTA, início e conclusão de formulário, cadastro e contratação confirmada, com identidade dos eventos e gestão das preferências de rastreamento. Diferenciar clique no WhatsApp de conversa recebida e contratação.

20. Sites e landing pages dos clientes

Manter o módulo “Meu site” separado do site comercial da Askadia.

Se o cliente não tiver site, gerar um específico com dados confirmados, marca e fotos reais.

Se já tiver, manter cadastro e permitir landing pages de campanhas sem exigir substituição do site existente.

Estrutura editável: apresentação, modalidades/serviços, diferenciais, fotos, planos confirmados, localização, horários, contato e formulário.

Prévia privada, edição, aprovação, publicação versionada e rollback.

Conteúdo gerado deve usar componentes controlados; não executar HTML/JavaScript arbitrário produzido por modelo.

Formulário cria lead no CRM da empresa dona daquele site, com origem disponível.

Responsividade, SEO técnico, URLs estáveis, metadados, sitemap e conteúdo indexável.

Não inventar depoimentos, certificações, preços nem fotos que pareçam documentar instalações reais inexistentes.

Domínio próprio:

Subdomínio da plataforma e domínio/subdomínio do cliente.

Cadastro, instruções DNS fornecidas pelo provedor, verificação de propriedade e roteamento por hostname validado.

HTTPS e estados: aguardando DNS, verificando, certificado em emissão, ativo, erro e desconectado.

Um domínio não pode pertencer a duas empresas; remover vínculo também deve limpar associação no provedor.

Preservar registros de e-mail; explicar efeitos de apontar domínio principal e oferecer subdomínio para manter site atual.

Reassociação exige nova validação. Bloquear hostname desconhecido em vez de servir dados de outra empresa.

Não presumir domínio já registrado da Askadia. URLs-base e domínio de sites ficam configuráveis.

Avaliar Vercel ou provedor existente com suporte real a domínios; verificar limites e custos antes de prometer franquia comercial.

21. Resultados e acompanhamento semanal

Resultados devem vir de dados persistidos e integrações, com fonte, período, fuso e última sincronização.

Conteúdo planejado/aprovado/publicado, alcance, impressões, cliques e engajamento quando disponíveis.

Investimento, leads, custo por lead e conversões das plataformas.

No CRM: qualificados, visitas, comparecimento, matrículas confirmadas, perdas e tempo de resposta.

Receita/ROAS somente com dados de receita e atribuição suficientes. Não somar conversões de Meta e Google como pessoas únicas.

Distinguir zero de ausência de dados; comparar períodos equivalentes e sinalizar amostra insuficiente.

Consolidar dados para revisão mensal e propostas semanais; não aplicar aumento de verba automaticamente.

Acompanhamento contratado: carteira, calendário de encontros, pauta, participantes, cliente presente, decisões, tarefas, responsáveis e prazos. A equipe e o cliente consultam histórico; aprovação delegada é explícita. Duração das reuniões e franquia de revisões ficam configuráveis até definição.

22. Central de integrações e configuração

Separe visualmente dois grupos:

Infraestrutura operada pela Askadia: OpenAI, Gemini, Maps/Places, cobrança, e-mail, armazenamento e hospedagem.

Ativos do cliente: Meta Ads, Google Ads, Instagram, Facebook quando aplicável, WhatsApp, GA4 e domínio.

Cliente conecta seus canais por fluxos adequados e vê conta vinculada, operações liberadas, última sincronização e reconexão. Chaves gerais da plataforma não ficam em campos acessíveis a clientes.

Na administração, mostrar configurado, conexão validada, funcionalidade homologada, degradado e indisponível. Health checks não podem consumir imagens ou executar campanhas em toda abertura da página.

Variáveis de referência para .env.example, adaptadas ao projeto e sem valores secretos:

APP_BASE_URL=
PUBLIC_SITE_URL=
CUSTOMER_SITES_BASE_DOMAIN=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
REDIS_URL=

OPENAI_API_KEY=
OPENAI_MODEL_STRATEGY=
OPENAI_MODEL_COPY=
OPENAI_MODEL_CHAT=

GEMINI_API_KEY=
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image

GOOGLE_MAPS_BROWSER_KEY=
GOOGLE_PLACES_SERVER_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=

META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_GRAPH_API_VERSION=

ASAAS_API_KEY=
ASAAS_WEBHOOK_AUTH_TOKEN=
ASAAS_ENVIRONMENT=sandbox
RESEND_API_KEY=
EMAIL_FROM=

HOSTING_PROVIDER_TOKEN=
HOSTING_PROJECT_ID=
SECRETS_ENCRYPTION_KEY=

Tokens e IDs de ativos individuais pertencem à integração criptografada da empresa, não a uma variável global compartilhada. Algumas variáveis só são necessárias na arquitetura escolhida: documente escopo e obrigatoriedade. Chave pública do navegador deve ser restrita por origem/API; service role e segredos jamais usam prefixos que exponham valores ao cliente.

Entregar docs/integracoes.md com configuração, URLs reais de callback/webhook do ambiente, permissões exigidas, aprovação externa necessária, smoke test, estados esperados e reconciliação. Use documentação oficial vigente para cada provedor.

23. Contratos e dados

Crie ou adapte entidades existentes; nomes abaixo são conceituais, não obrigação de duplicar tabelas:

Usuários, áreas de trabalho, empresas, membros/papéis, convites, delegações e vínculos de acompanhamento.

Planos, assinaturas, adicionais, cobranças, eventos de pagamento e consumo.

Sessões internas de acesso e auditoria.

Sessões/mensagens de agentes, etapas de onboarding e versões de perfil confirmado.

Localização, concorrentes, referências, observações de pesquisa e fontes.

Ofertas, kit de marca, documentos, arquivos e versões.

Método/prompt version, execuções de IA, custos, reservas de consumo, tarefas e eventos.

Estratégias, versões, campanhas conceituais, itens de calendário, peças, slides, composições e aprovações.

Contatos, oportunidades, etapas, tarefas, atribuições, interações e consentimentos.

Conversas, mensagens, responsáveis, estado humano/IA e tentativas de envio.

Conexões, contas/ativos externos, mapeamento de IDs, webhooks e sincronizações.

Campanhas de anúncio, grupos/conjuntos, anúncios, orçamentos e snapshots de aprovação.

Sites, páginas, versões, domínios, submissões de formulário e tracking.

Métricas, encontros de acompanhamento, participantes e decisões.

Dados mínimos das entregas estruturadas:

Objeto

Campos essenciais

Perfil confirmado

companyId, version, facts, offers, brandKitId, videoCapacity, sources, missingFields, confirmedBy, confirmedAt

Pesquisa

companyId, competitorId, classification, observations, sourceUrl, observedAt, limitations

Estratégia

companyId, period, version, profileVersion, researchSnapshot, goals, audience, offers, pillars, campaigns, calendarItems, assumptions, measurementPlan

Item editorial

strategyVersion, campaignId, date, timezone, channel, format, objective, briefing, copy, cta, requiredAssets, owner, status

Briefing visual

contentVersion, brandKitVersion, referenceAssetIds, approvedText, composition, aspectRatio, exportSize, restrictions

Proposta de anúncio

companyId, provider, adAccountId, objective, offerVersion, targeting, creativeVersions, destination, currency, budget, startAt, endAt, status

Aprovação

companyId, objectType, objectId, objectVersion/hash, approverId, permissionScope, decision, timestamp

O servidor injeta/verifica identificadores de empresa e objetos; não confie em IDs gerados pelo modelo. Valores monetários usam inteiros na menor unidade e moeda explícita. Datas usam instante UTC e fuso do negócio para apresentação/agendamento.

APIs devem ter validação de entrada, autorização, erros consistentes, paginação e identificadores de requisição. Ações demoradas retornam job/status; ações externas precisam de deduplicação e reconciliação.

24. Segurança, confiabilidade e custos

Isolamento de tenant em banco, API, arquivos, filas, cache e realtime. RLS quando aplicável, sem confiar nela para conexões privilegiadas que a ignoram.

Rotas administrativas e jobs com privilégios exigem escopo explícito e auditado.

Cookies/sessões e proteção de rotas compatíveis com a autenticação usada; proteção contra requisições indevidas quando aplicável.

Validar assinaturas/autenticadores de webhooks conforme cada provedor e mapear empresa pelo ativo vinculado, não por campo enviado por terceiros.

Criptografar tokens, suportar expiração/revogação e não incluí-los nos prompts.

Tratar websites, mensagens e arquivos como dados não confiáveis: instruções embutidas não podem mudar permissões nem executar ferramentas.

Extrator de URLs deve bloquear endereços internos e redirecionamentos perigosos, limitar tamanho, tempo e tipos de conteúdo.

Validar uploads, usar armazenamento privado e URLs temporárias; conteúdo publicado deve conter somente ativos explicitamente públicos.

Políticas configuráveis de retenção, exclusão, exportação, consentimento e opt-out; não afirmar conformidade jurídica automática.

Limites por empresa para tokens, imagens, jobs, armazenamento e mensagens; reservar consumo antes de gerar e reconciliar o custo real.

Não prometer processamento exatamente uma vez em rede externa. Use idempotência local, IDs externos, locks apropriados e reconciliação de resultados ambíguos.

Filas de atendimento não podem ficar presas atrás de lotes de imagens; separar prioridades e concorrência.

Backups, restauração demonstrada, logs sem segredos e alertas para falhas persistentes.

Monitorar custo unitário por empresa e recurso para validar a operação do plano de R$ 497.

25. Plano de implementação

Execute nesta ordem, ajustando apenas dependências comprovadas na auditoria:

Etapa

Entrega

Critério principal

0

Auditoria do código e comparação com prints

Matriz com evidências e plano sem reescrita desnecessária

1

Base persistente, login, empresas e cinco perfis

Duas empresas e papéis sem vazamento, inclusive por API direta

2

Tokens visuais, navegação e migração de rascunhos

Identidade preservada; importação segura para a empresa escolhida

3

Site institucional e landing page Askadia

Rotas úteis, login e aquisição persistente na carteira interna correta

4

Agentes e onboarding com Google

Mapa → concorrentes → referências → entrevista → confirmação; retomada funcionando

5

Conhecimento, pesquisa e OpenAI

Estratégia real validada, versionada e vinculada ao calendário

6

Gemini, estúdio e vídeos

Peça real com marca do cliente, formatos corretos e upload de vídeo final

7

Aprovações e publicação

Versão correta, conta correta e ausência de duplicidade

8

CRM, canais e triagem

Lead persistido, transferência e tomada humana sem resposta tardia da IA

9

Meta Ads e Google Ads

Proposta, aprovação, configuração pausada e controle de orçamento

10

Sites dos clientes e domínios

Site versionado, domínio validado e lead no CRM correto

11

Cobrança, franquias e administração operacional

Assinaturas independentes e recursos autorizados pelo servidor

12

Resultados, acompanhamento e ciclo mensal

Indicadores reais alimentam revisão e próximos planejamentos

13

Homologação integrada e piloto

Fluxos abaixo comprovados; pendências externas explicitadas

Implemente estrutura de planos e limites desde a etapa 1, mesmo que a homologação completa da cobrança aconteça na etapa 11. Não habilite aquisição pública paga antes de concluir cobrança, segurança e recursos anunciados.

26. Critérios de aceite e testes

Crie testes significativos para riscos reais. Use testes de domínio/integração para permissões, estados, pagamentos e jobs; testes de navegador para os principais fluxos. Não substitua homologação por mocks, mas use mocks explícitos para testes determinísticos sem efeito externo.

Um proprietário cadastra duas empresas; dados, assinatura, arquivos, agentes e canais permanecem isolados.

Os cinco perfis acessam apenas as telas e ações permitidas. API direta também bloqueia acesso indevido.

Acompanhamento acessa só a carteira; entrada interna conserva operador real e trilha de alterações.

Trocar de empresa durante consulta ou geração não exibe nem salva resposta na empresa errada.

Site Askadia e landing page funcionam no celular/desktop, com login real e formulários persistidos na carteira comercial da Askadia.

Onboarding segue a ordem definida, retoma após logout, aceita geolocalização negada e falha do Google sem fabricar resultados.

OpenAI gera estratégia estruturada a partir de contexto confirmado; erros, recusa ou saída inválida não viram planejamento aprovado.

Dois eventos mensais iguais não criam duas estratégias. Refazer cria versão e mostra impacto nos agendamentos existentes.

Gemini gera imagem real vinculada ao calendário e à marca correta; sem credencial, o estado é indisponível, nunca sucesso simulado.

Exportações possuem proporções/dimensões corretas; textos e logos são legíveis e vídeos finais mantêm integridade.

Alterar peça aprovada invalida a autorização; job antigo não publica versão nova usando aprovação anterior.

Webhook/job repetido não duplica lead, cobrança, mensagem, post ou anúncio. Timeout externo produz reconciliação antes de nova criação.

Atendente assume enquanto IA gera resposta; a resposta automática não é enviada depois da tomada humana.

Campanha sem aprovação não ativa; elevar orçamento além do limite é bloqueado. A revisão inclui conta, período, destino e versão do criativo.

Domínio de uma empresa nunca serve site de outra; domínio não verificado não publica; formulário resolve tenant no servidor.

Cancelar assinatura de uma empresa não afeta a outra; pagamento duplicado/fora de ordem não gera transição incorreta.

Falta de métrica aparece como indisponível, não como zero; intenção de compra não aparece como matrícula.

Segredos não aparecem em bundle, logs, arquivos de exemplo ou respostas. Uploads e extração de URLs respeitam limites.

Uma restauração de backup é demonstrada em ambiente apropriado.

As telas mantêm identidade, contraste, navegação por teclado e funcionamento em telas pequenas; Kanban não quebra o layout geral.

Registre para cada integração a evidência de teste real, conta/ambiente utilizado sem segredos, data e limites da validação. Se não houver credenciais, indique “implementada, não homologada” e o teste ainda necessário.

27. Entregáveis e continuidade

Entregue código funcional e integrado ao projeto, migrações, políticas de acesso, adaptadores, workers, testes e documentação. Crie ou atualize:

docs/askadia-auditoria.md — estado encontrado e lacunas.

docs/askadia-requisitos.md — escopo consolidado com rastreabilidade aos módulos.

docs/askadia-arquitetura.md — decisões, domínios, dados e limites.

docs/integracoes.md — configuração e homologação por provedor.

docs/askadia-progresso.md — concluído, evidências, bloqueios e próximas tarefas.

docs/askadia-aceite.md — resultados dos cenários de aceite.

.env.example — nomes reais das variáveis, descrições e ausência de segredos.

Instruções de execução local, banco, workers, scheduler, testes e implantação nos ambientes existentes.

Ao finalizar, informe arquivos alterados, funcionalidades comprovadas, testes executados, integrações não homologadas e decisões abertas. Não diga “pronto para produção” se houver dependências críticas sem validação.

Decisões ainda abertas: preço do plano superior, franquias, limites de arquivos, política de inadimplência/retenção, duração e escopo do acompanhamento, cobrança de filiais, inclusão comercial do domínio e orçamento operacional dos provedores. Mantenha configurável e não invente condições comerciais públicas.

Fora da primeira versão: edição automática de vídeos, financeiro/cancelamento de alunos pela IA, sistema completo de gestão de academia, modelos próprios treinados, todos os tipos de anúncio sem homologação e expansão simultânea para todos os segmentos.

Comece inspecionando o repositório e registrando a auditoria. Em seguida, implemente a fundação e avance na sequência. Preserve os componentes visuais já construídos e transforme cada fluxo em comportamento persistente, autorizado e verificável.
## Direção vigente — MedSI · 29/09/2026

O pedido atual do usuário substitui a marca Askadia e o foco fitness por MedSI, para médicos, clínicas e consultórios. A identidade de referência usa petróleo #123D46, menta #42D6B0, marfim #F5F7F4 e a assinatura “Sua clínica em sintonia”. O escopo desta adaptação, compatibilidade e dependências estão em [MedSI — análise e identidade](medsi-identidade-2026-09-29.md). As demais regras de segurança, aprovação por versão e homologação continuam válidas. Os requisitos anteriores de preservar o logo e atender academias permanecem somente como histórico.
