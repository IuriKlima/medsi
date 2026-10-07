# Firebase MedSI — configuração e inicialização

Projeto solicitado: `medsi-80f4a`. Banco: `(default)`. Namespace: `medsi/v1`. Não houve alteração de IAM, regras, credenciais administrativas ou proteção de produção.

## Configurado nesta sessão

- Aplicação web/servidor em `/workspace/medsi/.env`, ignorado pelo Git e com permissão local 0600: projeto, configuração pública da aplicação Firebase e bucket informados pelo usuário. Não foi copiada nenhuma chave de servidor exposta anteriormente. Não foi adicionado código de Analytics nem habilitada coleta por esse SDK.
- `.firebaserc` aponta para o projeto novo.
- Inicializador lê `.env` da raiz e usa `FIREBASE_PROJECT_ID` / `FIRESTORE_DATABASE_ID`. Recusa projetos diferentes entre web/API e alvo diferente de `--project`. O script anterior tinha o projeto antigo fixo.
- Inicialização preserva documentos existentes; gravações usam precondição `exists:false`. Repetir a inicialização é seguro. Namespace incompatível bloqueia a operação; conclusão depende de nova leitura dos documentos.

## Criação remota: bloqueada

Foi executada consulta administrativa somente leitura com o projeto correto. O Firebase CLI não encontrou ADC nem sessão administrativa autorizada; a tentativa terminou antes de consultar/gravar documentos. Arquivo de credencial, variável `GOOGLE_APPLICATION_CREDENTIALS`, ADC local e cache de login CLI estavam ausentes neste ambiente. A configuração pública web não concede administração do banco.

**Nenhum documento remoto foi criado.** Existência do banco, configuração de Auth, bucket, índices e permissões remotas não foram comprovadas. O plano offline não comprova acesso real.

O caminho informado anteriormente em `C:\Users\laris\Desktop\MEDSI` existe em outro computador. Esta sessão não acessou nem alterou aquela pasta. Atualizar apenas o código aqui não configura o Windows automaticamente.

## Coleções, não tabelas

Firestore cria coleções implicitamente ao gravar documentos. Não existe DDL de tabelas nem necessidade de inserir documentos vazios artificiais. A inicialização prepara apenas:

1. `medsi/v1` — identificação do namespace e versão; `productionReady:false`.
2. `medsi/v1/plan_catalog/askadia_monthly` — catálogo mensal já definido no código.
3. `medsi/v1/plan_catalog/askadia_semiannual` — catálogo semestral já definido no código.

Valores de catálogo existentes nunca são sobrescritos e nenhum pagamento é realizado. As coleções dos fluxos nativos (identidades, empresas, membros, onboarding, versões/aprovações, assinatura, pesquisa regional, estratégia, calendário/artes, atendimento, site e tráfego) são criadas pelas operações autorizadas da aplicação conforme o uso. Isso não transforma operações legadas ainda pendentes em implementações Firestore; o inventário permanece em `medsi-firestore-operations.json`.

## Concluir no ambiente autorizado

1. No projeto Firebase existente, confirmar Firestore Native `(default)` e Authentication E-mail/senha. Preservar as regras restritas e o bloqueio de produção.
2. Mesclar o bloco público preparado em `firebase-medsi.env.txt` com o `.env` local, sem substituir configurações de outros provedores. Guardar a credencial administrativa fora do Git e disponibilizá-la pelo canal seguro do ambiente. Não enviar o JSON no chat. Se houver uma identidade existente autorizada, reutilizá-la.
3. `GOOGLE_APPLICATION_CREDENTIALS` deve apontar para um arquivo acessível no computador que executa web/API. O caminho Windows não funciona no container Linux. Uma sessão Firebase CLI autorizada permite o bootstrap, mas a aplicação também precisa da sua própria credencial ADC.
4. Na raiz do checkout atualizado, executar:

```text
node scripts/bootstrap-firestore.mjs --plan
node scripts/bootstrap-firestore.mjs --project=medsi-80f4a
node scripts/bootstrap-firestore.mjs --apply --project=medsi-80f4a
```

O último comando é a escrita de inicialização solicitada pelo usuário. Só deve prosseguir quando a consulta administrativa anterior tiver sucesso no projeto correto. Não executa deploy, não altera regras e não cria o banco físico: se `(default)` ainda não existir, sua criação/região precisa ser concluída no Console pelo responsável.

5. Conferir o relatório `.local/firestore-bootstrap-result.json`: `pending:[]` após aplicar e três documentos verificados. Reiniciar web/API e testar cadastro, e-mail verificado, retomada e isolamento de duas clínicas fictícias. Homologar Storage separadamente.

A configuração local mantém automações de envio/publicação/anúncios desligadas. Credenciais expostas anteriormente devem ser substituídas pelo operador; migrar dados antes de trocar a chave de criptografia.

## Migração solicitada durante a configuração

O usuário confirmou explicitamente a origem **Firestore `atendimentomac-88940`**, com destino **`medsi-80f4a`**. Não se trata de Supabase. A consulta administrativa da origem também foi tentada e bloqueada por falta de credencial, antes de ler documentos. Não foi possível determinar se existe banco/dados antigos; nenhum documento foi copiado, removido ou alterado em qualquer projeto.

Dependência imediata: identidade administrativa disponibilizada por canal seguro com leitura na origem e gravação no destino, ou credenciais separadas para cada projeto. O caminho de JSON informado no Windows não está acessível no container. Não enviar JSON privado nem tokens pelo chat. Nenhum papel IAM foi concedido nesta sessão.

Sequência para retomar quando houver acesso:

1. Consultar existência, ID e localização dos bancos, namespace, subcoleções e contagens de origem/destino, sem imprimir conteúdo pessoal. A ausência do documento pai `medsi/v1` não comprova ausência de subcoleções; não assumir banco vazio por essa leitura isolada.
2. Inventariar versões, IDs, vínculos de empresa/membros e colisões no destino. Preservar IDs e origem; não sobrescrever documentos de destino divergentes. Preparar cópia consistente/backup privado antes de gravar.
3. Conferir `firebase_identities` e respectivos UIDs no Firebase Auth de destino. Copiar Firestore não transfere contas, senhas nem sessões. Conferir também referências ao bucket antigo; copiar documentos não copia arquivos do Storage. Esses recursos exigem plano próprio antes de mudar o acesso dos usuários.
4. Conferir compatibilidade da chave de criptografia do vault, mantendo os valores fora de logs. Preservar histórico de operações externas e impedir que jobs importados repitam envios, cobranças, publicação ou gastos. Manter executores desativados durante a migração e revisão.
5. Copiar apenas documentos compatíveis/ausentes com precondições e relatório de retomada; comparar contagens e integridade por coleção e validar isolamento/retomada com contas fictícias. Conflitos ficam pendentes de resolução explícita, sem apagar dados.
6. Manter o projeto antigo intacto. Não excluir banco, usuários, bucket ou credenciais de origem. Inicialização e cópia de dados não liberam produção nem substituem homologação.

Esta sequência é o plano da migração bloqueada, não um relatório de migração executada nem uma ferramenta de cópia já implementada.

## Evidências

Três regressões falharam com a resolução antiga de alvo, depois os seis testes de bootstrap passaram. Testam alvo configurado, confirmação de escrita, projetos misturados, caminho inválido, plano offline, catálogo, preservação/idempotência e namespace incompatível. `pnpm check` terminou com código zero: lint, tipos, **734 testes em 88 arquivos** e todos os builds aprovados. Logs fora do repositório: `/workspace/medsi-evidence/firebase-bootstrap-red.txt`, `firebase-bootstrap-access.txt`, `firebase-source-access.txt` e `firebase-check-final.txt`. Falharam as duas tentativas de acesso administrativo real por ausência de autenticação; testes locais não comprovam integração real.

Referências: [modelo de dados Firestore](https://firebase.google.com/docs/firestore/data-model), [credencial administrativa](https://firebase.google.com/docs/admin/setup).
