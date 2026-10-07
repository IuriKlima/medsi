# Validação visual e investigação da retomada — 07/10/2026

## Versão e ambiente

A primeira rodada abriu o código `58470f23175d8c2799e5ee856b677ca64d58fb67`, publicado por fast-forward em `main`. O workflow [Verify 37700849575](https://github.com/IuriKlima/medsi/actions/runs/37700849575) terminou com sucesso nesse SHA. Não houve deploy. A instalação Windows `C:\Users\laris\Desktop\MEDSI` é um ambiente separado; esta execução não a atualizou nem acessou seus logs.

Chromium em abas independentes: desktop 1440 px, celular 390 px e reprodução do tamanho da captura enviada (397 × 512). Next dev em 3000 e Next production em 3010, API local com executor desabilitado e worker sem processamento. As telas autenticadas foram exercitadas com componentes reais em fixtures isoladas, identificadas por faixa visível e sem chamadas de provedores. Isso não constitui uma jornada integrada com Firebase hospedado.

## Problema informado: JavaScript 500 e tela de retomada

A captura do usuário mostra dois recursos `.js` com HTTP 500 e a mensagem “Retomando seu próximo passo”. Ela não contém a resposta HTTP nem a exceção do servidor que causou o 500. A causa desses recursos permanece **não determinada**; não foi atribuído o erro a Firebase, cache ou credenciais sem evidência.

No ambiente disponível, 30 arquivos JavaScript da compilação responderam HTTP 200 e seus bytes coincidiram com os arquivos do build. A navegação real em produção carregou 14 scripts distintos, sem erros de execução ou respostas HTTP de falha. Sem sessão, `/comecar?empresa=…` encaminha ao login: a sessão autenticada da captura não foi reproduzida. Evidências: `public/all-production-chunks.json`, `public/production-assets.json` e `qa-main-production.txt`.

Foi reproduzida uma falha independente com as duas leituras da retomada: quando uma GET retornava 500, o componente exibia erro e botão de tentar novamente, mas mantinha o status “Retomando”; quando uma GET não terminava, não havia prazo no cliente para sair da espera. A correção limita somente essas leituras, permite tentar novamente e remove o status contraditório. Ela depende do JavaScript carregar; não é uma correção comprovada dos arquivos 500 mostrados pelo usuário.

## Matriz do fluxo

Nenhum recurso abaixo recebe o estado “validado com integração real”: serviços externos não foram homologados nesta rodada.

| Pedido/recurso | Implementação e validação observada | Estado | Evidência |
|---|---|---|---|
| Cadastro de clínica/consultório | Formulário público renderizado; nove passos, CNPJ/endereço fictícios, especialidade, histórico, logo/site e revisão navegados em desktop/celular. A prévia termina explicitamente sem criar conta; reload reinicia a demonstração. | validado somente com simulação | `public/routes.json`, `public/intake.json`, capturas de resumo |
| Conta autenticada e retomada persistida | Rota real protege sessão; identidade administrativa e sessão fictícia autenticada não disponíveis. Erros e recuperação da retomada exercitados com API simulada. | bloqueado | `public/production-assets.json`, capturas `strategy/resume-*` |
| Concorrentes por nicho | Cardiologia e multiespecialidade com evidência na lista principal; ambíguo exige confirmação; outro nicho não entra. Mudança de especialidade substitui seleção; clínica B mantém seus dados; escolhas válidas sobrevivem ao reload da fixture. | validado somente com simulação | `strategy/browser-evidence.json` |
| Mapa e pin do endereço | Três marcadores iniciais (clínica + dois compatíveis); quarto apenas após confirmação ambígua; enquadramento, foco “Ver no mapa” e alteração de ponto exercitados. Coordenadas/tiles explicitamente simulados. Geocodificação real pendente. | validado somente com simulação | capturas `strategy/competitors-*`, `extra-evidence.json` |
| Lateral simplificada | Blocos Trends/Facebook ocultos; campos de pesquisa preservados na fixture; controles de concorrentes e navegação mantidos; menu móvel fecha por Escape e devolve foco. | validado somente com simulação | `strategy/browser-evidence.json`, `sidebar-*` |
| Pesquisa IBGE/Places/Trends/digital | Adaptadores e gates existentes; esta rodada não realizou coleta real. SerpApi/Places ausentes neste ambiente; não foi criada conta nem instalada chave. | bloqueado | configuração local e relatórios regionais anteriores |
| Assinatura | Plano, consentimento, recusa e aprovação fictícios; bloqueio anterior à contratação e retorno à estratégia exercitados. Checkout de teste não comprova cobrança Asaas sandbox. | validado somente com simulação | `strategy/extra-evidence.json`, `checkout-mobile.png` |
| Diagnóstico e plano Instagram | Diagnóstico, edição com aprovação desabilitada e gate antes/depois de plano inspecionados nos componentes reais. | validado somente com simulação | `diagnosis-*`, `instagram-*` |
| Calendário/textos/roteiros/artes | Calendário e peça inspecionados; editar texto incrementa versão e invalida arte/aprovação; regenerar revoga aprovação. Reload da clínica A mantém edição e B conserva versão anterior. Geração externa e upload reais pendentes. | validado somente com simulação | `operations/browser.json`, `http.jsonl`, capturas `calendar-*` e `post-*` |
| Atendimento e horários | Prompt salvo, prévia sem envio com encaminhamento humano, horários revisados persistidos, gates de automação visíveis e takeover humano exercitado. Campos de horário no celular corrigidos após overflow reproduzido. | validado somente com simulação | `operations/supplement.json`, `attendance-*`, `inbox-desktop.png` |
| Tráfego opcional | Pular, retomar e concluir planejamento sem tráfego; requisições de preferência e aprovação verificadas. Nenhum anúncio ativado nem orçamento gasto. | validado somente com simulação | `strategy/browser-evidence.json`, `traffic-skipped-*` |
| Marca/logo/site privado | Estados e prévia de site inspecionados; fallback antigo com texto de academia corrigido para contexto médico. Geração de logo, hosting/domínio e publicação não homologados. | validado somente com simulação | `operations/site-*`, regressões de renderização |
| Firebase/Auth/Storage, migração e provedores | Configuração pública não concede acesso administrativo. Sem ADC administrativo, sem leitura/cópia da origem antiga, índices remotos não publicados e integrações não homologadas. | bloqueado | relatórios Firebase/runtime vinculados abaixo |

## Correções desta rodada

- `apps/web/components/purchase-journey.tsx` e `apps/web/lib/purchase-resume.ts`: erro/timeout na retomada, cancelamento e tentativa posterior; escopo restrito às leituras, sem alterar prazos das operações de geração ou contratação.
- `packages/contracts/src/site.ts`: títulos padrão de rascunhos médicos antigos não usam “movimento” ou “treino”; títulos personalizados permanecem preservados. Regressão em `tests/site-medical-copy.test.ts` falhou antes da correção.
- `apps/web/components/attendance-policy.tsx`: linha de dia/abertura/fechamento pode quebrar no celular, evitando campo fora da largura disponível; mesmas permissões e regras de revisão.

## Bloqueios concretos

O erro 500 dos arquivos JavaScript do computador do usuário ainda exige evidência daquele processo para determinar a causa. Nenhuma conclusão de “corrigido no Windows” foi feita. Os testes locais não substituem essa evidência.

Para a homologação externa, um responsável precisa disponibilizar acesso administrativo autorizado ao projeto de teste por canal seguro (`GOOGLE_APPLICATION_CREDENTIALS` ou identidade de workload/ADC), configurar as integrações faltantes no ambiente (`SERPAPI_API_KEY`, `GOOGLE_PLACES_SERVER_KEY` e configuração de mapa quando aplicável), e validar contas fictícias com sessão real. Não enviar chaves no chat. Não foi instalado scraper adicional ou criada outra conta SerpApi. Migração permanece dependente de inventário autorizado de origem/destino e preservação de UIDs/arquivos/vault.

Os limites operacionais e lacunas já identificados continuam em [worker/paginação](medsi-worker-pagination-2026-10-07.md), [Firebase](medsi-firebase-setup-2026-10-07.md) e [fluxo](medsi-flow-validation-2026-10-07.md). Nenhuma proteção de produção foi removida. O produto não está declarado pronto para venda.

As evidências desta rodada ficam em `/workspace/medsi-evidence/qa-main-58470f2/`; os nomes conservam o SHA inicial. Capturas posteriores às correções são identificadas como `after`/`fixed` e não devem ser atribuídas ao SHA inicial sem o relatório de fechamento.

## Verificação final das correções

`pnpm check` concluiu com código 0: lint, tipos, **975 testes em 108 arquivos**, zero falhas, builds de todos os pacotes/API/worker/web. O último ajuste visual para manter o botão de retry inteiro foi incluído nos testes/build; lint completo foi repetido após esse ajuste e também terminou com código 0. `git diff --check` passou. Logs: `/workspace/medsi-evidence/visual-qa-check-final.txt` e `visual-qa-lint-final.txt`.

Os cinco testes novos de retomada cobrem as duas leituras pendentes, transporte que rejeita no abort, HTTP500 com cancelamento da outra leitura/retry e conclusão antiga após cancelamento. No navegador, quatro cenários (500 e pendência em cada GET) terminaram sem spinner, com botão inteiro e recuperação; clique duplo iniciou somente as duas leituras esperadas. Duas regressões de site cobrem fallback médico e preservação dos títulos personalizados. Nenhum desses testes comprova a correção dos arquivos JavaScript500 do processo Windows.
