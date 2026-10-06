# Pacote MedSI para Easypanel

## Estado atual — 29/09/2026

O ZIP contém o código atual, com Dockerfile e arquivos pnpm na raiz. O build instala
as dependências e compila API e web dentro da imagem. .env, credenciais de conta de
serviço, dependências locais, caches, Git e anexos temporários ficam fora do pacote.
.env.example contém apenas exemplos; configure valores reais como segredos no painel.
A credencial administrativa deve ser montada separadamente como segredo, com
GOOGLE_APPLICATION_CREDENTIALS apontando para seu caminho Linux no container.

**Esta versão ainda não inicia em produção com Firestore.** apps/api/src/main.ts
mantém o bloqueio até a conclusão da migração: 13 operações portadas e 124 chamadas
literais pendentes. Auth por E-mail/senha está ativo; Storage ainda não existe.
O ZIP é uma entrega do código em migração, sem deploy ou liberação de produção.
Não remover o bloqueio nem mudar NODE_ENV para contornar essas pendências.

Porta pública do container: 3000. Dockerfile: /Dockerfile. O domínio HTTPS definitivo
e os domínios autorizados do Auth precisam corresponder ao ambiente da hospedagem.
Veja medsi-firestore-2026-09-29.md para estado, validações e pendências.

## Atenção ao editar o ambiente — 02/10/2026

Os blocos com WEB_ORIGIN e PORT são **ajustes parciais**, não um arquivo de ambiente
completo. Preserve as demais variáveis do Firebase, a referência da credencial
administrativa e a chave de criptografia existente. A captura mais recente mostra
apenas duas linhas no serviço; a configuração efetiva precisa ser conferida nos
logs da implantação. Não use o .env de desenvolvimento sem adaptar seus endereços,
modo de execução e caminho da credencial ao container Linux.

O Easypanel precisa de uma implantação para aplicar alterações salvas no ambiente,
mas este pacote ainda possui o bloqueio de produção Firestore descrito acima.
Confira os logs de execução, além do resultado de build, para determinar qual
versão entrou e por que o processo parou. Documentação oficial:
https://easypanel.io/docs/services/app

## Diagnóstico dos erros 404 e 503 — 29/09/2026

O log enviado termina em Success na **construção da imagem**, mas registra também
falha da API na validação de produção e avisos de NODE_ENV. Isso não comprova a
saúde da aplicação. A consulta HTTP pública confirmou raiz / com 503 e texto
“Site indisponível.”, /login com 200 e /clinicas/{UUID} com 404.

A raiz era encaminhada para /api/sites/domain porque o hostname recebido não era
o WEB_ORIGIN configurado. Esse endpoint procura um site de cliente publicado;
não é a página institucional da MedSI. Confirme no Easypanel, sem substituir os
outros segredos, os valores do serviço medsi/app:

```env
NODE_ENV=production
WEB_ORIGIN=https://medsi-app.3rkpc1.easypanel.host
PORT=3000
API_PORT=4000
API_INTERNAL_URL=http://127.0.0.1:4000
DATABASE_PROVIDER=firestore
```

O domínio do Easypanel deve encaminhar para a porta interna 3000. O caminho é /.
NODE_ENV precisa ser exatamente production, sem aspas literais, espaços ou outro
nome. Fonte do aviso: https://nextjs.org/docs/messages/non-standard-node-env.
O runner agora recusa iniciar em modo diferente, antes de subir os serviços.

**Esses valores corrigem a configuração, mas esta versão continua bloqueada para
produção com Firestore.** Concluir e validar os fluxos ainda não migrados continua
necessário. A API agora lista os requisitos ausentes e o bloqueio de migração no
mesmo erro, sem registrar valores de segredos. Storage, credencial administrativa
montada e domínio autorizado no Firebase também precisam ser homologados na
hospedagem. Um caminho C:\Users\... de GOOGLE_APPLICATION_CREDENTIALS não funciona
no container Linux: monte o JSON privado e aponte para seu caminho nesse container.
Não inclua a chave no ZIP nem na imagem e não gere outra chave de criptografia para
substituir uma que já protege integrações.

A correção de código adiciona redirecionamento temporário de /clinicas/{id} e suas
subseções para /empresa/{id}, preservando os parâmetros e a autorização no destino.
/clinicas leva a /entrada. Não há alteração de empresa, usuário ou permissões.

Se um domínio próprio for usado como WEB_ORIGIN e o endereço técnico do Easypanel
precisar abrir a aplicação, configure também APP_HOSTNAMES com a lista exata de
hostnames separados por vírgula. O domínio de WEB_ORIGIN já é reconhecido. Não
inclua URLs, caminhos, curingas ou domínios de clínicas. Outros hosts continuam
sujeitos à consulta de site publicado e sua verificação no servidor.

O 404 de /favicon.ico é secundário; a aplicação já fornece /icon.svg e esse aviso
não causa o 503 da página. Nenhuma dessas correções publica o pacote automaticamente.

## Validação desta correção — 30/09/2026

pnpm check aprovado: lint, tipos, 351 testes e builds completos. Seis verificações
HTTP no build local confirmaram as rotas e a exigência de login, com API fictícia.
Os testes não homologam os fluxos Firestore pendentes nem autenticam um usuário
real no ambiente publicado. O pacote é uma revisão de código; nenhum deploy foi
executado por esta validação.

## Histórico do provedor anterior

As instruções abaixo registram o ambiente Askadia/Supabase anterior. Seu domínio,
seus recursos e suas migrações não substituem a configuração MedSI/Firestore atual.

# Deploy da Askadia

Serviço: askadia/askadia no Easypanel. Fonte GitHub IuriKlima/askadia, main, caminho /, Dockerfile.

O container executa Next na porta 3000 e a API na porta interna 4000. O runner encerra ambos se um falhar; o healthcheck verifica API e login. O worker de protótipos não é executado. As credenciais são variáveis privadas no painel, nunca argumentos de build nem arquivos do Git. O cofre deve manter SECRETS_ENCRYPTION_KEY estável para abrir conexões existentes.

Ambiente de produção: NODE_ENV=production, WEB_ORIGIN=https://askadia.com.br, PORT=3000, API_PORT=4000, API_INTERNAL_URL=http://127.0.0.1:4000. Supabase, OpenAI, Gemini, Evolution e Meta usam as variáveis documentadas em .env.example. A automação de atendimento exige INBOX_AUTOMATION_ENABLED=true e SUPABASE_SERVICE_ROLE_KEY; cada canal continua desligado até seleção e salvamento do usuário.

Domínio principal https://askadia.com.br aponta para a porta 3000. Supabase Site URL usa o domínio público; callbacks limitados à rota /auth/callback em produção e no desenvolvimento local. O callback Meta é /api/connections/meta/callback. O domínio técnico do Easypanel também usa porta 3000; login deve ser feito pelo domínio principal para corresponder à origem autorizada.

## Checkout de teste após o deploy — 28/09/2026

O `.env` local não é enviado na imagem. A API só permite escolher e confirmar planos com `CHECKOUT_MODE=test`. Sem esse valor, os cartões aparecem, mas os botões ficam desabilitados e a tela informa “Contratação disponível em breve”. Não é um problema de preço, rolagem ou cache do navegador.

Nesta fase de homologação autorizada, o Dockerfile declara `CHECKOUT_MODE=test` explicitamente para os novos deploys. Uma variável configurada no Easypanel tem precedência: no serviço **askadia/askadia → Environment**, mescle `CHECKOUT_MODE=test` às variáveis existentes, salve e implante novamente. Não substitua o restante do ambiente. Para desativar novas simulações, use `CHECKOUT_MODE=disabled` e reimplante.

O checkout permanece identificado como teste, sem cartão ou cobrança real. A simulação exige usuário autorizado, onboarding confirmado e aceitação do plano; a confirmação no servidor libera sete dias de acesso à IA somente para aquela empresa. Esta mudança não ativa gateway de pagamento, anúncios nem mensagens. A chave `SUPABASE_SERVICE_ROLE_KEY` continua necessária na API para confirmar o teste.

Validação após implantação: reabra a seleção de planos com a conta responsável, confira os botões habilitados e a indicação “Teste sem cobrança”, selecione mensal/semestral e confira o resumo do checkout. Não confirme o pagamento como simples teste de deploy: a confirmação libera tarefas de IA. A correção de ambiente não exige SQL novo; as migrações de comércio `202609270003` e preços `202609280001` precisam já estar aplicadas.

Em 22/09/2026, o commit 746dad1 foi construído e implantado com sucesso pelo Easypanel. HTTPS / e /login responderam 200, e a API de inbox sem sessão respondeu 401. As migrações 202609220001–005 estão instaladas no Supabase; executar somente migrações posteriores em novas atualizações. Não há envio real a contatos nem publicação social nos testes.

As conexões de mensagens Meta/TikTok, publicador automático e homologação de insights continuam pendentes. O calendário atual organiza datas, detalha peças, gera criativos e recebe vídeos; datas planejadas não são agendamentos de envio. Não ativar consumidores de protótipos para contornar essas dependências.

## Campanhas e permissões Meta — 22/09/2026
Commit 6189426 compilado e implantado; Easypanel registrou Success às 17:52 UTC. Migrações 202609220006–008 aplicadas com autorização explícita e RLS confirmada nas três tabelas públicas. Login HTTPS respondeu 200; campanhas e ingestão sem autenticação responderam 401. MESSAGE_CAMPAIGNS_ENABLED=true salvo após autorização específica do proprietário. Nenhuma campanha foi ativada para teste. Operação do consumidor pela interface ainda em conferência.

## Ajuda e chamados — 28/09/2026

Aplicar `202609280003_support_chat.sql` depois das migrações anteriores. Reimplantar API/web para disponibilizar a central interna e o chat de ajuda. A imagem declara `PUBLIC_SUPPORT_WHATSAPP=5519993070799`, número público informado pelo responsável. O ambiente do Easypanel tem precedência. Teste a consulta de ajuda, o link WhatsApp sem enviar mensagem e um chamado de homologação em empresa de teste. Respostas são feitas em `/admin` ou `/acompanhamento/carteira`, conforme a carteira da equipe interna. Ver `docs/ajuda-e-chamados-2026-09-28.md`.

## Log de inicialização confirmado — 02/10/2026

A mensagem pedindo SUPABASE_URL não significa que o projeto deva voltar ao
Supabase: a ausência de DATABASE_PROVIDER=firestore seleciona o provedor padrão.
O log também registra falta de SECRETS_ENCRYPTION_KEY válida e, na última
tentativa, WEB_ORIGIN inválido ou ausente. Preserve a chave de criptografia
original; não gere outra para satisfazer o diagnóstico.

Foi preparado localmente um arquivo privado de recuperação em
.local/credentials/medsi-easypanel-recuperacao-2026-10-02.env, sem alterar o .env.
Ele contém segredos e não deve ser anexado ao ZIP nem versionado. Antes de
substituir o ambiente do serviço, preserve eventuais valores mais recentes
configurados apenas no Easypanel. A referência administrativa nesse arquivo
aponta para /run/secrets/medsi-firebase.json. Em Armazenamento (Storage), uma
montagem de tipo Arquivo (File) deve fornecer nesse caminho o JSON privado
medsi-api-service-account.json, legível pelo usuário node do container.
Documentação: https://easypanel.io/docs/services/app.

O validador compilado aprovou as configurações do arquivo preparado, mas ainda
rejeita produção pela migração Firestore incompleta. Portanto, salvar esse
ambiente e montar a credencial não bastam para liberar esta versão. Concluir
e testar os fluxos pendentes é requisito anterior à homologação e implantação
de produção. Nenhuma alteração foi aplicada no Easypanel nesta etapa.
