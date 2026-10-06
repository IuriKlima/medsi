# Firebase na MedSI — configuração de 29/09/2026

> Escolha posterior: Firestore Native. Este documento descreve a proposta SQL anterior. Consulte [a migração Firestore](medsi-firestore-2026-09-29.md) para o estado atual.

## Escolha confirmada
Firebase SQL Connect com PostgreSQL/Cloud SQL, Firebase Authentication e Cloud Storage.
A escolha preserva o banco relacional, o isolamento por clínica, as transações,
as aprovações por versão e os processamentos existentes.

## Estado desta entrega
Código e configuração local preparados. A configuração pública do aplicativo
fornecida pelo proprietário está no arquivo .env ignorado pelo Git.
O projeto configurado é atendimentomac-88940.

Não houve provisionamento, deploy ou migração remota. Em 29/09/2026 às 20:31 UTC,
a conta autenticada da CLI consultou as APIs do projeto atendimentomac-88940:
Cloud SQL retornou zero instâncias e SQL Connect retornou zero serviços, sem erro
de permissão. Portanto, ainda não foi encontrado um banco nesse projeto para a
aplicação das tabelas autorizada pelo usuário. Se o banco foi criado em outro
projeto, é necessário identificar o destino antes de executar as migrações.
A autenticação administrativa da CLI não configura automaticamente ADC para a
aplicação. Faturamento, provedores de login, domínio autorizado e permissões do
bucket continuam sem homologação. A API key web não comprova esses itens.

As referências de instância medsi-postgres, banco medsi, serviço medsi e região
southamerica-east1 são propostas locais. Confirmar no projeto antes de implantar.
A localização de serviços já existentes não é alterada pela configuração local.

## Arquitetura implementada
- Login/senha e recuperação pelo Firebase Auth; e-mail confirmado antes do acesso.
- Sessão HTTP-only, SameSite=Lax, Secure em produção, duração de cinco dias.
  Login exige autenticação recente; o servidor verifica revogação e usuário ativo.
- UID Firebase ligado a UUID interno estável. Nenhuma conta é mesclada pelo e-mail.
- API continua responsável pelas operações. Ela valida a identidade, assume o
  papel PostgreSQL authenticated por transação e usa as políticas RLS existentes.
  Trabalhos administrativos usam service_role. O contexto não é global ao pool.
- SQL Connect tem um esquema COMPATIBLE da tabela existente companies e uma
  consulta administrativa NO_ACCESS. As operações de negócio seguem pela API e
  pelas funções PostgreSQL, usando o conector oficial do Cloud SQL. Não existe
  acesso GraphQL direto do navegador aos dados empresariais nesta entrega.
- Materiais ficam em medsi/company-assets/<companyId>/... no bucket informado.
  A autorização passa pelo PostgreSQL antes de upload/download/URL assinada.
  Objetos são imutáveis e os links assinados duram no máximo dez minutos.
- Analytics só pode ser iniciado com consentimento explícito nas páginas públicas.
  Não há inicialização automática nas telas privadas.

Os identificadores @askadia, nomes legados de RPCs e a pasta supabase/migrations
permanecem por compatibilidade interna. Eles não definem mais a marca pública.

## Preparação local
As dependências são instaladas com pnpm. Neste checkout a store é .pnpm-store.
Usar pnpm --store-dir .pnpm-store install ao reinstalar.

A configuração de exemplo usa exclusivamente valores fictícios. As credenciais
administrativas devem vir de Application Default Credentials (ADC), identidade de
execução no Google Cloud ou arquivo privado apontado por GOOGLE_APPLICATION_CREDENTIALS.
Não colocar credenciais em NEXT_PUBLIC_*, no Git ou em mensagens.

Diagnóstico local, sem chamadas à nuvem:
    pnpm --filter @askadia/api exec tsx src/platform/doctor-cli.ts

Diagnóstico remoto somente leitura, depois de configurar ADC:
    pnpm --filter @askadia/api exec tsx src/platform/doctor-cli.ts --remote

O diagnóstico remoto verifica histórico SQL, leitura administrativa de Auth,
metadados do bucket e consulta do conector. Ele não prova o fluxo completo de
login/e-mail, a geração de URLs assinadas ou o upload de um arquivo.

## Instalação do banco
Usar uma instância dedicada à MedSI. Antes de criar recursos pagos, revisar a
configuração, os valores apresentados pelo console e o faturamento do projeto.
Não usar uma base temporária de avaliação como ambiente de produção.

1. Criar/selecionar a instância PostgreSQL e o banco na mesma região do SQL Connect.
2. Configurar ADC com acesso à instância; definir CLOUD_SQL_CONNECTION_NAME,
   DATABASE_NAME e DATABASE_USER no ambiente. O padrão é DATABASE_AUTH=iam.
   O login IAM de uma service account no PostgreSQL não inclui .gserviceaccount.com.
3. Para a instalação, usar identidade administrativa com permissão para criar
   schemas, extensões e papéis. Para a aplicação, usar identidade própria,
   diferente da identidade de provisionamento.
4. Executar o preflight somente leitura:
       pnpm --filter @askadia/api exec tsx src/platform/migrate-cli.ts
5. Revisar os nomes e a lista de migrações. Aplicar somente ao banco aprovado:
       pnpm --filter @askadia/api exec tsx src/platform/migrate-cli.ts --apply --project=atendimentomac-88940 --database=medsi

A instalação registra hashes das migrações, usa lock e transação, não reaplica
scripts concluídos e recusa scripts alterados. Uma base já populada sem registro
MedSI, ou papéis globais conflitantes em uma instância não dedicada, exige revisão
de importação. Não é feito reset, truncamento ou descarte automático.

Os objetos pertencem ao papel NOLOGIN medsi_owner. service_role herda esse papel;
o servidor deve receber membership nos papéis authenticated, anon e service_role.
O login de execução deve ser NOINHERIT, com SET ROLE explícito nas transações.
Conceder esses papéis apenas à identidade privada da API, nunca a usuários finais.
Os nomes dos logins reais precisam ser confirmados no projeto antes desses grants.
Depois de criar o login IAM dedicado, o mesmo comando de instalação aceita
--runtime-user=<login-confirmado> para conceder os papéis e configurar NOINHERIT.
Esse passo exige --apply e a identidade administrativa; o preflight apenas o mostra.

Contas/dados de um Supabase existente não são importados automaticamente. Uma
migração de dados requer inventário, backup e associação explícita dos UUIDs aos
UIDs Firebase. A associação por e-mail é deliberadamente proibida.

## Console e permissões pendentes
- Firebase Auth: habilitar e-mail/senha, autorizar os domínios reais da aplicação,
  revisar os modelos de confirmação/recuperação e configurar remetente MedSI.
- Cloud SQL: acesso de conexão e login IAM para a identidade de execução, além
  dos papéis SQL descritos acima; backups, recuperação e monitoramento conforme
  o ambiente escolhido.
- Auth Admin: permitir ao servidor ler usuários, verificar revogação e criar
  cookies de sessão. A chave pública web não concede essas permissões.
- Storage: permitir as operações de objetos à identidade privada da API no
  prefixo MedSI e a assinatura de URLs com a identidade de execução.
- Revisar as regras atuais do bucket. firebase/storage.rules.example é uma
  proposta para composição, não uma política pronta para substituir o bucket:
  permissões amplas em outros matches também valeriam para o prefixo MedSI.
  Por isso Storage não está incluído no deploy automático do firebase.json.

## Vincular e validar SQL Connect
A configuração local está em firebase/dataconnect. No fluxo de vinculação do banco
existente, manter as migrações sob controle da aplicação; não conceder ao SQL
Connect gerenciamento destrutivo do schema. Manter COMPATIBLE e revisar o diff.
Nunca usar STRICT neste projeto: tabelas e funções não descritas no GraphQL são
parte necessária do sistema.

Após a instalação SQL e a revisão do projeto:
    pnpm firebase dataconnect:sql:diff --project atendimentomac-88940

O deploy remoto depende da configuração homologada e da autorização correspondente.
Não há deploy de Hosting configurado; Next.js e a API Nest precisam de um ambiente
Node adequado, com as mesmas variáveis de provedor e API_INTERNAL_URL para a URL
interna da API. No Docker/Easypanel, configurar FIREBASE_WEB_API_KEY em runtime
para autenticação do servidor; ela é a chave web pública, não uma credencial Admin.
Os valores NEXT_PUBLIC_FIREBASE_* são necessários no build apenas se o SDK do
navegador/Analytics for utilizado; variáveis públicas compiladas não mudam em runtime.

## Homologação antes do uso real
- Cadastro, confirmação de e-mail, login, logout, recuperação e revogação.
- Duas contas/duas clínicas, verificando bloqueio de leitura, gravação e arquivos.
- Onboarding completo e retomada em outro navegador; PDF, logo e fotos privados.
- Consulta CNPJ e confirmação de endereço; erro de provedor com edição manual.
- Estratégia regional com fonte/data/escopo; dados indisponíveis identificados e
  aprovação vinculada à versão. Facebook e Trends dependem das integrações reais.
- Geração de logo/site/estratégia depende das chaves, limites e plano do sistema.
- Não publicar sites, enviar mensagens reais ou ativar anúncios em testes.

## Referências verificadas
- [Configuração SQL Connect e modos de schema](https://firebase.google.com/docs/sql-connect/configuration-reference)
- [Regiões e integração com banco existente](https://firebase.google.com/docs/sql-connect/manage-services-and-databases)
- [Sessões Firebase no servidor](https://firebase.google.com/docs/auth/admin/manage-cookies)
- [Conector oficial Cloud SQL para Node](https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector)
