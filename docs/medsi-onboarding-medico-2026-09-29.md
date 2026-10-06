# MedSI — cadastro médico e público regional

Implementação local de 29/09/2026. A solicitação atual substitui a ordem anterior do chat para novos cadastros. Cadastros antigos e identificadores permanecem preservados; a atualização para o formulário médico é explícita.

## Experiência

Uma pergunta por tela, escolhas predefinidas, progresso, teclado, retorno e resumo editável:

1. CNPJ numérico ou alfanumérico, com validação dos dígitos.
2. Confirmação ou ajuste de nome, endereço de atendimento, cidade, UF, CEP e tipo de estabelecimento.
3. Uma ou mais especialidades, com opção de adicionar outra.
4. História em texto ou currículo profissional em PDF.
5. Logo enviado ou pedido de criação, com três estilos.
6. Até 12 fotos ou opção de continuar sem fotos.
7. Site existente ou pedido de criação automática.
8. Revisão e confirmação de uma nova versão.

Respostas persistidas por etapa, bloqueio de gravações atrasadas e repetição idempotente por pedido. Alterar CNPJ exige confirmar novamente o endereço. Arquivos privados de até 10 MB, vinculados à clínica; arquivos já enviados podem ser reutilizados.

O cadastro não cobra nem chama modelos. A confirmação do plano conserva a liberação de IA existente. O logo solicitado entra automaticamente na fila de propostas após o acesso ao plano. O site solicitado é preparado como rascunho após as cinco aprovações; informar um site existente não agenda outro. Os materiais exigem revisão antes de publicação.

## Público da região

A primeira aba do cadastro médico apresenta:

- **IBGE:** município confirmado, população, área, densidade, sexo e faixas etárias do Censo de 2022. Distribuições precisam fechar com o total; dados incompletos não viram percentuais inventados.
- **Facebook:** estimativas agregadas da Meta para adultos elegíveis a anúncios no município, por faixas etárias e sexo. Requer conexão Meta, conta e permissão de leitura. Não cria campanhas. Os recortes não são somados e não representam pacientes ou população residente.
- **Google Trends:** consultas relacionadas à especialidade, últimos três meses, no estado confirmado, via SerpApi. A interface explicita o recorte estadual e que 0–100 é interesse relativo, não volume absoluto.

Cada fonte informa data, escopo, origem e indisponibilidade. A fila persiste com tentativas limitadas e valida acesso/perfil antes e depois. Uma nova coleta invalida a aprovação. Fontes indisponíveis exigem registrar a limitação para seguir. O diagnóstico recebe uma cópia dos dados aprovados.

Depois seguem as etapas existentes: diagnóstico e planos, publicações e datas, relacionamento e vendas, tráfego pago, preparação e revisão dos materiais.

O currículo selecionado é lido pelo servidor no armazenamento privado da própria clínica e enviado como PDF à geração da estratégia. Seu conteúdo é referência, nunca instrução. O modelo configurado foi preservado.

## Ativação e limites

Migração aditiva: supabase/migrations/202609290002_medical_intake.sql. Nenhuma migração remota ou publicação foi executada.

- CNPJ_LOOKUP_ENABLED=true: BrasilAPI pública, sem afirmar conexão direta/certificada da Receita. A base pode estar defasada ou indisponível, inclusive para cadastros alfanuméricos. Preenchimento manual disponível.
- REGIONAL_RESEARCH_ENABLED=false no exemplo: ativar após aplicar a migração e homologar os acessos.
- IBGE não exige chave. Facebook usa a conexão autorizada da clínica; Trends exige SERPAPI_API_KEY. O adaptador não se apresenta como a API oficial limitada de Trends.
- VISUAL_JOBS_ENABLED e CONTENT_AUTOPREP_ENABLED conservam suas funções existentes.

Homologação pendente: CNPJ no ambiente implantado, Meta com conta autorizada, Trends com chave válida, geração paga de logo/estratégia com PDF e criação de site. Não foram feitas chamadas pagas nem enviados anúncios ou mensagens reais.

## Prévia local

A rota /preview/onboarding é uma demonstração isolada, identificada com dados fictícios. Não envia arquivos, consulta CNPJ, gera conteúdo ou confirma pagamentos. A jornada autenticada usa APIs e banco reais.

## Referências verificadas

- [Receita Federal — CNPJ alfanumérico](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico)
- [BrasilAPI](https://brasilapi.com.br/docs)
- [IBGE — metadados da tabela 9514](https://servicodados.ibge.gov.br/api/v3/agregados/9514/metadados)
- [Meta — estrutura de estimativas no SDK oficial](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccountreachestimate.py)
- [Google Trends API](https://developers.google.com/search/apis/trends)
- [OpenAI — arquivos na Responses API](https://developers.openai.com/api/docs/guides/file-inputs)

A consulta real aos metadados IBGE confirmou as classificações usadas; a homologação completa dos provedores segue pendente.
