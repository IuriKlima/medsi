# MedSI — validação do fluxo e transferência para Windows

Branch: `fix/regional-baseline-2026-10-06`. Base desta rodada: `bf0a184e16e6473bfa2b76849536b53bfa147c82`. Sem push, deploy, merge, cobrança, mensagens, anúncios ou publicação. Nenhuma credencial recebida por chat foi gravada ou utilizada.

## Ambiente e causa da divergência visual

O usuário informou que executa o projeto em `C:\Users\laris\Desktop\MEDSI`, abrindo `http://127.0.0.1:3000/`. Esta sessão altera `/workspace/medsi`, em outro computador. Mudanças daqui não atualizam a pasta Windows automaticamente. Não foi inspecionado o HEAD nem o processo do computador Windows; portanto, não afirmamos qual versão ele está exibindo.

No navegador deste ambiente reproduzimos uma segunda divergência: sem Firebase configurado, o login oferecia a antiga prévia de rascunhos, não o cadastro médico atual. Agora há entradas identificadas separadamente para cadastro demonstrativo e rascunhos antigos. A demonstração declara onde termina; não cria conta, assinatura ou pesquisa real.

## Falhas reproduzidas e correções

| Falha / causa | Correção e arquivos principais |
|---|---|
| Menu Concorrentes renderizava somente `InstagramProfiles`; mapa corrigido anteriormente só aparecia na estratégia | `company-journey.tsx` usa novo `regional-competitors.tsx`, que consulta a jornada real, apresenta mapa/revisão regional e oferece continuidade na estratégia |
| Entrada local conduzia a rascunhos antigos, confundidos com fluxo atual | `auth-panel.tsx` e `app/preview/onboarding/page.tsx` diferenciam demonstrações e seus limites; dados antigos preservados |
| Configuração de atendimento não estava disponível durante preparação | `company-navigation.ts` permite a aba a usuários autorizados; permissões do servidor preservadas |
| Conclusão do diagnóstico era apresentada como produção de textos/artes concluída | `calendar-controller.ts`, novo `calendar-production.ts`, `editorial-calendar.tsx`, `launch.ts` e `launch-preparation.tsx` distinguem filas e verificam peças, geração e revisão atuais |
| Peças de perfil anterior podiam aparecer concluídas para novo perfil | Consultas de estratégia/preparação/produção filtram a versão atual; histórico de peças e artes preservado |
| Rascunho anterior mascarava nova geração de site pendente ou com erro | `launch.ts` prioriza o job atual de `company_site_jobs`; `site-builder.tsx` acompanha a geração |
| Botões de IA apareciam disponíveis sem modelos configurados | Controllers de calendário/site e componentes correspondentes expõem disponibilidade por capacidade, sem IDs presumidos |
| Histórico do contato só buscava Evolution e ignorava WhatsApp oficial | `inbox/customer-controller.ts` lê mensagens oficiais com autorização e escopo da empresa |
| Atendimento inteiro falhava sem modelo de IA; edição prometia permissão insuficiente | `inbox/controller.ts`, `attendance-settings.tsx`, `inbox-panel.tsx` e contrato permitem atendimento humano sem IA e alinham `canConfigure` às permissões necessárias |

Contratos de lançamento/atendimento e leitura autorizada da fila nativa também foram atualizados. Novas regressões: `tests/flow-navigation-regression.test.tsx`, `tests/flow-deliveries-regression.test.ts`, `tests/flow-attendance-regression.test.ts`. Regressões falharam antes das respectivas correções; revisão independente encontrou os dois problemas de versão/site, corrigidos antes da verificação final.

## Evidências e limites

- `pnpm check`: lint, tipos, **728 testes em 87 arquivos**, builds contracts/integrations/API/worker/web; código de saída zero. Log `/workspace/medsi-evidence/flow-audit/check-final.txt`.
- Navegador Chromium em `3000`: entrada, login, cadastro, redirecionamentos privados e cadastro demonstrativo com clínica fictícia, endereço, especialidade, história, marca e revisão. Capturas desktop/celular e JSON em `/workspace/medsi-evidence/flow-audit/`.
- Cadastro desktop 1440 px e celular 390 px sem transbordamento horizontal. Login/autenticação reais continuam bloqueados aqui por configuração ausente.
- Componente real `RegionalCompetitors` em harness separado, respostas simuladas e armazenamento de fixture: três pins (endereço e dois compatíveis) enquadrados em desktop/celular; seleção preservada após reload, removida na troca de nicho, isolada na segunda clínica e recuperada ao voltar à primeira. Ambíguo separado, especialidade incompatível excluída, lateral sem Trends/Facebook e ação de foco no mapa verificada. Capturas `competitors-desktop-fixture.png`, `competitors-mobile-fixture.png` e `competitors-browser.json`. Tiles externos do mapa não carregaram; pins/coordenadas fictícios não são homologação geográfica. O harness não altera autenticação da aplicação.
- Testes da jornada com duas clínicas verificam retomada, aquisição de teste, pesquisa, diagnóstico, plano, calendário, textos, artes, atendimento, tráfego opcional e site usando armazenamento em memória e provedores simulados. Isso não comprova persistência real no Firestore nem disponibilidade de modelos/provedores.
- Conteúdo do `.env` informado pelo usuário não comprova existência do arquivo, do JSON administrativo ou acesso aos serviços no Windows. Valores não foram copiados para evidências.

| Recurso | Estado desta validação | Gate restante |
|---|---|---|
| Cadastro médico e marca | validado somente com simulação | Firebase Auth, e-mail verificado e Storage real |
| Retomada e isolamento de duas clínicas | validado somente com simulação | Firestore real e testes de acesso cruzado no navegador |
| Assinatura | validado somente com simulação | Asaas sandbox; `CHECKOUT_MODE=test` não é assinatura paga nem teste do provedor |
| Concorrentes, mapa e escolhas | validado somente com simulação | Places/OSM, localização real e persistência autenticada |
| Trends/IBGE/pesquisa digital | validado somente com simulação | Respostas reais, quotas, recortes e fontes |
| Diagnóstico e plano | validado somente com simulação | Modelo disponível, evidências reais e aprovação |
| Calendário e textos | validado somente com simulação | Produção real com modelo validado |
| Artes/logo | validado somente com simulação | Modelo de imagem e armazenamento privado |
| Configuração/histórico de atendimento | validado somente com simulação | Canal oficial e webhook de teste; nenhum envio real |
| Tráfego opcional | validado somente com simulação | Contas autorizadas e homologação sem gastos |
| Site privado | validado somente com simulação | Geração real, arquivos, domínio e hospedagem; publicação não autorizada |
| Fluxo autenticado completo no Windows | bloqueado | Atualizar checkout local e configurar serviços de forma segura |

Nenhuma integração externa foi classificada como validada com integração real nesta rodada. Não há declaração de prontidão comercial.

## O que conferir no Firebase e no Windows

1. Usar o projeto Firebase existente. Habilitar Authentication → E-mail/senha e confirmar o banco Firestore `(default)`. Preservar regras restritas, IAM e o bloqueio de produção do aplicativo.
2. Guardar `.env` em `C:\Users\laris\Desktop\MEDSI\.env`. Conferir que não ficou `.env.txt`. O JSON apontado por `GOOGLE_APPLICATION_CREDENTIALS` precisa existir no Windows. Para Linux, disponibilizar credencial pelo canal seguro do ambiente e usar caminho Linux; não enviar JSON/chaves pelo chat.
3. Nomes usados pelo projeto: `DATABASE_PROVIDER`, `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`, `FIREBASE_WEB_API_KEY`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `GOOGLE_APPLICATION_CREDENTIALS`; Storage também exige `FIREBASE_STORAGE_BUCKET`.
4. Segredos de servidor expostos no chat devem ser substituídos nos respectivos provedores. A chave de criptografia precisa de migração planejada dos dados; não substituí-la cegamente. Não copiar automaticamente a configuração compartilhada para um executor: ela incluía automação de atendimento habilitada, incompatível com testes sem envio real.
5. Após configuração segura, reiniciar web/API da pasta atualizada e testar duas contas/clínicas fictícias. SerpApi já foi indicado pelo usuário; não criar outra conta. Modelo escrito em `.env` não comprova que o provedor oferece esse ID.

Referências oficiais: [Firebase Admin e credenciais](https://firebase.google.com/docs/admin/setup), [Authentication E-mail/senha](https://firebase.google.com/docs/auth/web/password-auth), [Firestore](https://firebase.google.com/docs/firestore/quickstart). Roteiro completo: [medsi-test-runbook.md](medsi-test-runbook.md).

Para transferência, a entrega inclui um Git bundle fora do repositório. Ele permite importar a branch sem push. Antes de trocar de branch no Windows, executar `git status --short` e preservar as alterações locais; não usar reset, clean nem sobrescrever `.env`. Uma alternativa que preserva integralmente a pasta atual é clonar o bundle em uma pasta irmã e disponibilizar ali as configurações atualizadas pelo canal local seguro. O bundle contém código versionado; credenciais ignoradas não são incluídas.

Próxima fatia: sincronizar o checkout Windows, validar Auth/Firestore/Storage com duas clínicas e Asaas sandbox; depois homologar pesquisa e cada papel de IA com limite de uso autorizado. Canais, publicação, ads e domínio permanecem etapas próprias com aprovações e evidências.
