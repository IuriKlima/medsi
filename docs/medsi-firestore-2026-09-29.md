# MedSI no Firestore — 29/09/2026

A escolha atual do proprietário é **Firestore Native**, substituindo a proposta
SQL Connect. O banco existente foi confirmado pelas APIs Google:
projeto atendimentomac-88940, banco (default), região southamerica-east1.

## Estado real

Etapa inicial funcional e testada localmente; migração completa ainda pendente.
O Firestore é o provedor selecionado no .env privado e no .env.example.
Cloud SQL não é necessário para esta etapa. Os provedores SQL anteriores foram
preservados, sem exclusão de bancos ou dados.

No banco real foram criados, com precondição de inexistência:
- medsi/v1: identificação e versão do namespace, migrationStatus=in-progress;
- medsi/v1/plan_catalog/askadia_monthly: MedSI Mensal, R$ 1.597;
- medsi/v1/plan_catalog/askadia_semiannual: MedSI Semestral, R$ 8.000.

A repetição da inicialização criou zero documentos e confirmou os três existentes.
Não foram inseridos pacientes, clínicas fictícias, contas ou dados de demonstração.
Coleções de usuários/clínicas surgem quando operações autorizadas gravam documentos;
não há necessidade de criar coleções vazias nem de executar SQL no Firestore.

As regras firebase/firestore.rules foram aplicadas somente ao Firestore. A leitura
anônima do namespace na API real retornou HTTP 403. O SDK administrativo não passa
por essas regras: acesso empresarial é verificado pela API e pelas transações,
enquanto o acesso ao banco pelo servidor depende de IAM. Auth e Storage do projeto
não tiveram regras/provedores alterados nessa implantação.

## Entregue no adaptador nativo

- Vínculo imutável UID Firebase → UUID interno, sem mesclar contas por e-mail.
- Área do proprietário, criação de clínica, capacidades e leitura autorizada.
- Retomada de cadastro, idempotência e controle de concorrência por revisão.
- CNPJ, endereço, especialidade, currículo/história, logo, fotos, site e confirmação.
- Referências a anexos validadas por clínica e tipo; fatos confirmados versionados.
- Edições invalidam a confirmação e as aprovações anteriores.
- Metadados de arquivos em Firestore; bytes privados continuam no Cloud Storage.
- Upload imutável, integridade SHA-256 e checagem de acesso antes/depois da leitura.
- Consulta de CNPJ e reservas de provedores com limites persistidos e sem liberar
  IA paga pela ausência de assinatura.

Transações primeiro leem e verificam permissões; escritas são aplicadas ao final.
Nenhuma chamada a IA, envio, upload de bytes ou outro efeito externo roda dentro
de callback de transação que possa ser repetido pelo SDK.

## Limites desta etapa

O inventário docs/medsi-firestore-operations.json registra 13 operações migradas
e 124 chamadas literais a RPCs que ainda dependem de adaptação. É um inventário
estático, não um percentual de conclusão; chamadas dinâmicas e consultas diretas
também precisam de revisão.

Ainda não estão portados integralmente: equipe/convites, administração interna,
pesquisa regional e aprovação da estratégia, geração, calendário, CRM, campanhas,
atendimento, sites e cobrança. Os respectivos contratos/implementações SQL continuam
no repositório, mas não são executados pelo Firestore. Operações ausentes retornam
indisponibilidade explícita; nunca sucesso simulado ou fallback silencioso para SQL.

NODE_ENV=production com DATABASE_PROVIDER=firestore é bloqueado em main.ts até a
migração e homologação desses fluxos. Não remover esse bloqueio para publicar esta
etapa parcial. A geração de logo/site e a continuidade após a aprovação regional
não estão concluídas no novo provedor.

## Identidade de servidor configurada

Criada a conta medsi-api@atendimentomac-88940.iam.gserviceaccount.com.
As únicas concessões da aplicação são:
- roles/datastore.user, condicionado ao banco (default) deste projeto;
- papel personalizado medsiAuthRuntime, somente firebaseauth.users.get e
  firebaseauth.users.createSession.

A credencial JSON foi salva em .local/credentials, ignorada pelo Git. O diretório
permite acesso somente ao usuário local e SYSTEM. GOOGLE_APPLICATION_CREDENTIALS
foi configurado no .env privado. A chave não foi exibida nem incluída em arquivos
versionados. .dockerignore também exclui .local e .env, impedindo sua cópia para
a imagem. Leitura real de medsi/v1 pelo SDK administrativo foi aprovada. A
configuração pública (projeto, app, domínio e chaves web) coincide com a API Firebase.

Essa configuração é local. Na hospedagem, fornecer a identidade equivalente via
ambiente ou montar a credencial como segredo privado e ajustar o caminho do servidor.
Não enviar .env nem a credencial ao repositório ou ao bundle do navegador.

## Pendências externas comprovadas

A inspeção autenticada encontrou:
- Authentication ativado pelo proprietário: E-mail/senha habilitado com senha
  obrigatória. A leitura administrativa com a credencial MedSI foi aprovada.
- Adicionado somente 127.0.0.1 aos domínios autorizados, conforme WEB_ORIGIN local;
  localhost e os domínios Firebase existentes foram preservados. Antes da
  implantação, configurar o domínio HTTPS definitivo da aplicação.
- billingEnabled=false: não existe conta de faturamento vinculada ao projeto.
- Nenhum bucket no projeto; o nome da configuração web não cria um bucket.
- API firebasestorage.googleapis.com desabilitada.

O Storage para novos uploads exige Blaze. Após o proprietário habilitar o plano,
criar o bucket privado preferencialmente em southamerica-east1 e conceder ao
servidor somente as operações de objetos no prefixo medsi/ e leitura de metadados
do bucket. Essas concessões de Storage ainda não foram feitas. Não houve troca
automática de plano, vinculação de cobrança ou criação de recurso pago.

A ativação inicial do Auth foi feita pelo proprietário após o controle de navegador
falhar no sandbox Windows. A confirmação e o ajuste do domínio local foram feitos
pelas APIs oficiais. Nenhum usuário foi criado nem e-mail enviado nos testes.

Dados, usuários e arquivos antigos do Supabase não foram importados. Uma importação
exige inventário e associação explícita das identidades, sem fusão por e-mail.
Nenhum segredo foi publicado. Não foram criados usuários reais ou enviados e-mails.

## Comandos

Diagnóstico local:
    pnpm firebase:doctor

Diagnóstico do namespace pela conta autenticada da CLI, sem mudanças:
    pnpm firebase:firestore:check

Inicialização idempotente, sem sobrescrever documentos:
    pnpm firebase:firestore:apply --project=atendimentomac-88940

O script é específico ao projeto confirmado. Não inicializa autenticação,
não concede privilégios IAM e não habilita processamento pago.

Diagnóstico com a identidade real da aplicação já configurada localmente:
    pnpm firebase:doctor --remote

O diagnóstico continuará indicando migração de fluxos pendente. Regras e índices
devem ser revisados antes de futuros deploys, especialmente se outras aplicações
passarem a usar este banco.

## Validação

- Tipos da API aprovados após a integração do provedor.
- 32 testes: 16 em armazenamento isolado e os mesmos 16 com SDK oficial e emulador
  Firestore local, sem gravar dados de teste no projeto real.
- Casos: isolamento, identidade, duas requisições concorrentes, reenvio idempotente,
  revisão obsoleta, ordem das perguntas, confirmação, anexo de outra clínica,
  aprovação invalidada, reserva/limite de CNPJ, IA sem assinatura bloqueada,
  revogação e leitura anônima negada.
- pnpm check executado: lint e tipos passaram; 331 testes passaram e uma suíte
  não carregou por importar server-only fora do runtime do Next.js.
- Correção: função pura safeAuthDestination separada em lib/auth/destination.ts,
  preservando o guard server-only nas configurações Firebase. Os 10 testes da
  suíte de identidade passaram após a correção; 341 testes distintos aprovados
  nas execuções, além dos 16 casos adicionais executados no emulador.
- Lint, tipos e build final após a correção concluídos com sucesso: API, worker
  e frontend compilados, 18 páginas estáticas geradas. Evidência em
  .local/medsi-firestore-validation-final.log. O pnpm check inicial não teve
  saída zero; os testes aprovados não foram repetidos sem alteração relevante.
- Diagnóstico remoto: Firestore aprovado com a credencial do servidor. Saída não
  zero esperada por migração parcial e Storage indisponível. Após a ativação do
  Authentication, o SDK confirmou acesso administrativo. A nova consulta às APIs
  confirmou E-mail/senha ativo, faturamento desligado e zero buckets.
- Upload/download/URL assinada reais, autenticação e jornada completa ainda
  dependem da configuração de Storage e da conclusão da migração. Login, cookie
  de sessão e confirmação de e-mail ponta a ponta ainda precisam de homologação
  com o proprietário; leitura administrativa aprovada não substitui essa etapa.

## Referências oficiais

- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/firestore/security/iam
- https://firebase.google.com/codelabs/firebase-terraform#6
- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024

