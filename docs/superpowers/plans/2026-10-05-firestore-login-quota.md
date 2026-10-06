# Login durante indisponibilidade do Firestore

> **For agentic workers:** Use superpowers:executing-plans para implementar e verificar cada tarefa.

**Goal:** Tratar a cota excedida como indisponibilidade do banco, preservar autenticação e reduzir leituras ociosas, mantendo o plano gratuito escolhido pelo usuário.

**Architecture:** O backend expõe um código sanitizado de cota. O login verifica o acesso aos dados antes de emitir uma sessão bem-sucedida; falhas de infraestrutura não viram usuário anônimo. Filas nativas aumentam o intervalo quando vazias ou indisponíveis; a tela reduz consultas quando aguarda revisão e quando está oculta.

**Tech Stack:** Nest, Next, Firebase Auth, Firestore, Vitest.

**Spec:** pedido atual de correção do login e decisão explícita de manter o plano gratuito, junto às regras de `docs/askadia-requisitos.md` e AGENTS.md.

## Constraints / decisions

- Nenhum faturamento, migração, redefinição de senha, sessão artificial ou alteração de dados da clínica.
- A cota real permanece bloqueada até renovação externa; não declarar login autenticado homologado enquanto isso.
- Não cachear autorização ou conceder acesso quando o banco falha.
- Preservar árvore existente; continuação da correção local autorizada, sem copiar ou descartar alterações preexistentes.
- Sem deploy/commit/merge nesta tarefa. Execução direta, com revisão independente ao final.

## Review focus

- Cota excedida com credenciais válidas: 503 legível, sem cookie de sucesso.
- Sessão existente com API indisponível: indisponibilidade, sem redirecionar por falso usuário anônimo.
- Credencial inválida, e-mail não confirmado e sessão revogada continuam rejeitados.
- Filas retomam após espera e não alteram estados/aprovações para economizar leituras.
- Navegador oculto não consulta; ações do usuário continuam atualizando a tela imediatamente.

## Task 1 — Autenticação e indisponibilidade

Files: `apps/api/src/identity/service.ts`, `apps/web/lib/firebase/server.ts`, `tests/firebase-login-availability.test.ts`, `tests/firebase-server-access.test.ts`.

Interface: API 503 com `code: FIRESTORE_QUOTA_EXCEEDED`; mensagem sanitizada. `firebaseAuthAction` só retorna sucesso após identidade/autorização disponível. `firebaseServerClient.auth.getUser` propaga indisponibilidade e retorna usuário nulo apenas para sessão ausente/inválida.

- [x] Testar erro 8, pré-checagem do login sem cookie, recuperação posterior, e-mail não confirmado, indisponibilidade de sessão existente.
- [x] Executar testes e confirmar vermelho antes da alteração.
- [x] Implementar o tratamento restrito e confirmar verde.

## Task 2 — Leituras automáticas

Files: `apps/api/src/platform/queue-polling.ts`, workers `regional-research.ts`, `content-preparation.ts`, `launch.ts`; componentes `guided-strategy.tsx`, `regional-audience.tsx`; `tests/firestore-queue-polling.test.ts`.

Interface: `queuePollDelay(hadJob:boolean, failed:boolean, normalDelay:number):number`. Firestore: fila vazia 60 s; erro 300 s; trabalho encontrado preserva intervalo normal. Outros bancos preservados. Navegador: preparação 15 s; revisão parada/erro 300 s; aba oculta não consulta. Logo indisponível não continua consultando automaticamente.

- [x] Testar os três workers com relógio controlado: fila vazia, erro e retomada; proteger comportamento SQL.
- [x] Confirmar vermelho, implementar, repetir testes focados.
- [x] Ajustar consultas da interface preservando atualização imediata após ações.

## Task 3 — Verificação e entrega

- [x] Revisão independente limitada aos arquivos desta correção.
- [x] Executar `pnpm check`, ler o resultado completo, corrigir regressões reais.
- [x] Reiniciar somente processos locais identificados; preservar teste e cofre.
- [x] Registrar evidências em `docs/progress.md`; informar que a renovação da cota continua pendente e que faturamento não foi ativado.

## Ledger

- Diagnóstico: login HTTP 200, API health 200, Auth REST reconhece configuração; leitura Firestore retorna gRPC 8 `Quota exceeded.`. Navegador automatizado indisponível por falha de infraestrutura local.
- Usuário escolheu manter gratuito e aguardar renovação. Nenhuma alteração financeira autorizada.
- Pre-flight: o código 503 da tarefa 1 é consumido somente pelo cliente de sessão; a tarefa 2 altera temporização, preservando contratos de fila e autorização.
- Ruling: trabalhar na árvore local já em uso e sem commits — contém toda a migração não consolidada e os processos locais do usuário; uma cópia incompleta não reproduziria a falha.

- Tasks 1/2: RED observado (12 falhas pertinentes); GREEN: 29 testes em 4 arquivos, exit 0. Evidências locais: .local/login-quota-red.log e .local/login-quota-green.log. Revisão independente iniciada; validação geral pendente.

- Final review: revisão independente limpa, sem achados acionáveis. UI de polling verificada em código; autenticação real permanece pendente pela cota. Testes gerais em execução.

- Task 3: complete. pnpm check exit 0: lint, tipos, 409 testes/49 arquivos e build completo. Reinício local e HTTP aprovados em 2026-10-05T21:28:35.141Z; primeiro probe antecedeu a prontidão e foi repetido após inicialização. docs/progress.md atualizado. Login real permanece explicitamente pendente pela cota externa; plano gratuito mantido.
