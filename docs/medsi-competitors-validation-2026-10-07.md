# Concorrentes e jornada — validação de 07/10/2026

## Escopo e preservação

Branch `fix/regional-baseline-2026-10-06`, base `f486944bfed93fc5c53cf2640b57bbdba0d1254a`. As entregas anteriores foram preservadas. Nenhum deploy, push, merge, alteração de credenciais/regras/IAM, cobrança, envio, publicação ou gasto foi realizado. O bloqueio de produção Firestore permanece. Dados de teste são fictícios.

## Falhas reproduzidas e causas

1. **Concorrentes fora do nicho.** O coletor OSM filtrava atividade de saúde e raio, sem comparar os serviços do cadastro. A busca Google ainda copiava o termo pesquisado para `specialty`, criando aparência de evidência que o estabelecimento não forneceu. Antes da correção, a fixture de cardiologia retornou todos os sete estabelecimentos, incluindo pediatria e odontologia: dois testes falharam, um passou (`/workspace/medsi-evidence/competitors-reproduction.txt`).
2. **Seleção antiga.** Mudanças de fatos invalidavam aprovações, mas não revogavam explicitamente as escolhas de concorrentes e os vínculos digitais da clínica. Agora a pesquisa ativa fica obsoleta e sem seleção; o histórico é mantido. Leitura e gravação reavaliam também pesquisas legadas contra os serviços confirmados.
3. **Lateral extensa.** O componente renderizava blocos demográficos/assuntos e links de fontes junto à seleção. A lateral agora contém apenas concorrentes, evidências, confirmação e controles de mapa/remoção. Snapshots IBGE/Trends/Facebook/X e integrações continuam existentes; a alteração não apaga pesquisas.
4. **Autorização digital legada.** A revisão independente encontrou pesquisas Instagram ainda autorizadas pela revisão numérica depois de a seleção antiga ser retirada. A regressão falhou antes da correção (`competitors-legacy-reproduction.txt`). Leitura, seleção, retry, claim e finish agora compartilham a exigência de perfil atual, pesquisa não obsoleta e concorrente presente no mapa pronto com seleção confirmada.
5. **Pins e fundo do mapa.** O componente desenha o endereço e somente candidatos pertinentes, além dos ambíguos que o usuário pedir para visualizar/confirmar. O botão “Ver no mapa” centraliza e abre o nome. Neste ambiente o carregamento dos tiles falha; a interface comunica a limitação e mantém coordenadas/lista/pins utilizáveis. Sem Places configurado, não existe comprovação de geocodificação real.

## Critério aplicado

- Evidência explícita no nome, categoria ou especialidade da fonte, com link canônico; sinônimos médicos declarados e comparação de palavras, sem completar métricas ou qualificações.
- Especialidades/serviços precisam constar como fornecidos no cadastro; sugestão de assistente não basta. Termo da consulta não é evidência.
- Correspondência comprovada entra na lista principal, inicialmente desmarcada. Nome genérico/multiespecialidade sem detalhe fica em **A confirmar**. Outra especialidade sem correspondência é excluída.
- Ambíguo exige confirmação de compatibilidade enviada separadamente e validada no servidor. A seleção e a confirmação ficam vinculadas à revisão e à clínica.
- Nicho, serviços, cidade, endereço ou estabelecimento alterados invalidam escolhas e pesquisas digitais da clínica. Outro tenant e versões históricas permanecem intactos.
- O critério é conservador: ausência de evidência pode deixar uma busca sem concorrentes comprovados. A interface explica isso. Não é uma auditoria da habilitação profissional nem uma inferência a partir da proximidade.

## Testes e interface

Regressões cobrem mistura cardiologia/pediatria/odontologia, nome genérico, multiespecialidade com e sem evidência, procedimento explícito, serviço incomum, consulta Google sem evidência, sugestão não confirmada, especialidade negada, busca vazia, timeout, seleção indevida, confirmação ambígua, reload, troca de perfil e isolamento.

O dispatcher Firestore foi exercitado com `MemoryStore`, identidades e clínicas fictícias. Reconstruir o cliente conserva escolhas; alterar serviços/endereço/cidade/tipo revoga apenas a clínica alterada, mantendo cópia histórica. Isso não equivale à homologação do serviço Firestore.

Chromium com componentes reais e respostas locais simuladas:

| Verificação | Resultado observado |
| --- | --- |
| Desktop 1440 px | 3 pins (clínica + 2 compatíveis), todos enquadrados; pediatria ausente no nicho cardiologia; ambíguo separado; sem painéis ocultados |
| Celular 390 px | Largura do documento 390 px, sem overflow horizontal; mesmos pins enquadrados; controles acessíveis em coluna |
| Salvar/recarregar | Escolha conservada no armazenamento da fixture de navegador; persistência de domínio verificada separadamente no MemoryStore |
| Trocar clínica | Segunda clínica sem a escolha da primeira; retorno conserva a escolha da primeira |
| Trocar nicho | Pediatria substitui cardiologia; nenhuma seleção antiga permanece no novo contexto |
| Remover/recarregar | Nenhuma escolha selecionada |
| Ver no mapa | Nome do concorrente aberto no tooltip |
| Prévia automática do endereço | Resposta simulada gera coordenadas e 4 pins (local + 3 compatíveis), botão de confirmar habilitado; sem coordenada inventada pelo produto |

Capturas: `/workspace/medsi-evidence/competitors-desktop-fixture.png`, `competitors-mobile-fixture.png`, `map-automatic-fixture.png`. Dados da inspeção: `competitors-browser.json` e `map-automatic-verification.json`. São capturas de fixtures dos componentes; não de uma conta autenticada no Firebase real. Navegação principal não foi alterada. O mapa permanece, mas o fundo cartográfico não foi homologado devido à falha de rede.

## Checklist por recurso

| Recurso | Estado | Evidência e limite |
| --- | --- | --- |
| Cadastro de clínica/consultório, marca e retomada | validado somente com simulação | Duas clínicas, cadastro parcial/completo via dispatcher e reconstrução de cliente; login HTTP local responde 200, Auth real ausente |
| Assinatura de teste e acesso | validado somente com simulação | Checkout `test`, idempotência, rejeição de resultado contraditório, expiração e isolamento; sem pagamento |
| Assinatura Asaas sandbox | bloqueado | Credenciais e webhook sandbox não homologados; checkout interno de teste não equivale ao sandbox Asaas |
| Pesquisa regional e fontes ausentes | validado somente com simulação | Contratos, coleta, timeout/vazio e persistência; nenhuma métrica fabricada |
| Concorrentes e pins | validado somente com simulação | Evidência, seleção, confirmação, reload, mudança de perfil, isolamento e capturas desktop/celular |
| Google Places e pin de endereço real | bloqueado | `GOOGLE_PLACES_SERVER_KEY` ausente; prévia automática exercitada apenas com resposta simulada |
| Google Trends por SerpApi | bloqueado | Flag regional ativa; `SERPAPI_API_KEY` ausente. Consulta real NÃO enviada, sem ID de resposta. Integração preservada |
| Tiles cartográficos OSM neste ambiente | falhou | Carregamento externo falhou no Chromium; mensagem visível. Pins independentes dos tiles funcionam |
| Pesquisa digital autorizada | validado somente com simulação | Seleção explícita, vínculo por clínica, descarte após alteração; canais reais não configurados |
| Diagnóstico e plano Instagram | validado somente com simulação | Proposta estruturada, versões e aprovações; OpenAI real pendente |
| Calendário, textos e roteiros | validado somente com simulação | Três formatos, textos por clínica, revisão, retomada, descarte de geração obsoleta; qualidade editorial real pendente |
| Artes, carrossel, logo e vídeo do cliente | validado somente com simulação | Metadados sintéticos, vínculo/tipo/revisão; sem geração de imagens nem upload/download real |
| Configuração do atendimento e handoff | validado somente com simulação | Horários/instruções, contexto mínimo, pergunta clínica encaminhada a humano, envio bloqueado sem canal |
| Conectar atendimento, receber/enviar mensagem | bloqueado | Conexão oficial/webhook/consentimento não homologados; nenhuma mensagem enviada |
| Tráfego opcional | validado somente com simulação | Pular etapa persistido, aprovação e orçamento/guardas nos testes próprios; nenhum anúncio/gasto |
| Site privado | validado somente com simulação | Preview, revisão, vínculo de logo e isolamento; publicação/DNS não executados |
| Firestore/Auth/Storage e isolamento real | bloqueado | Banco e Auth não configurados; testes em memória não comprovam regras/IAM, índices ou persistência cloud |
| Operação autônoma com provedores | bloqueado | Jobs/leases/revisões testados com fixtures; worker local idle, sem processamento externo comprovado |

**Nenhum recurso desta rodada recebe o estado “validado com integração real”.** A execução de código local e os testes não comprovam prontidão para venda.

## Configuração e dependências de Iuri

`GET http://127.0.0.1:4000/health` confirma, sem valores secretos: `regionalResearch.enabled=true`, `databaseConfigured=false`, `trendsConfigured=false`, `placesConfigured=false`, `databaseProvider=firestore`, banco/Auth `not-configured`. Web `http://127.0.0.1:3000/login` retorna 200; worker 4001 responde `idle` e `processing=false`.

Inserir a configuração no gerenciador de segredos/variáveis do **ambiente privado de teste existente**, fora do Git e do chat. Não criar outra conta SerpApi. Não copiar chaves para logs ou documentos. Reiniciar os processos que recebem essas variáveis e repetir o healthcheck antes da homologação.

- Firebase existente: `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`, `FIREBASE_STORAGE_BUCKET`, identidade administrativa autorizada/ADC (ou arquivo protegido indicado por `GOOGLE_APPLICATION_CREDENTIALS`), configurações públicas da aplicação web `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
- Pesquisa: `GOOGLE_PLACES_SERVER_KEY` restrita ao servidor e `SERPAPI_API_KEY` da conta existente. Confirmar acesso/quota com consultas fictícias e registrar IDs/estados sem segredos.
- Homologação posterior: OpenAI/modelos disponíveis, Asaas **sandbox** e webhook, Storage privado e canais oficiais conforme `docs/medsi-test-runbook.md`. Não habilitar envio/publicação/anúncios como consequência de configurar pesquisa.
- Liberar acesso de rede autorizado aos provedores/tiles no ambiente de teste; não contornar o bloqueio deste container.

## Próximas fatias

1. Repetir cadastro/reload/isolamento com Firebase Auth, Firestore e Storage reais em teste privado, incluindo reinício, acesso cruzado e revogação.
2. Homologar Places/OSM/IBGE/SerpApi com endereço fictício e evidência rastreável; conferir relevância e mapa em navegador autenticado.
3. Assinatura Asaas sandbox com webhook/reconciliação e expiração; geração real de diagnóstico/texto/arte/logo/site com modelos confirmados, quotas e revisão humana.
4. Canais oficiais e atendimento em teste, tráfego opcional sem gasto, recuperação de jobs e observabilidade. Portar/homologar operações legadas ainda pendentes antes de incluí-las na oferta.

Produção Firestore continua bloqueada. A meta de 09/10/2026 não substitui essas evidências.

## Arquivos alterados nesta rodada

- Contratos: `packages/contracts/src/competitor-relevance.ts`, `regional-map.ts`, `index.ts`.
- Coleta/controlador: `apps/api/src/onboarding/regional-map.ts`, `regional-research.ts`.
- Firestore: `apps/api/src/platform/firestore/competitor-invalidation.ts`, `regional.ts`, `journey-state.ts`, `digital.ts`, `marketing-profile.ts`, `onboarding.ts`.
- Interface: `apps/web/components/regional-audience.tsx`, `regional-audience.module.css`, `regional-map.tsx`.
- Testes: `tests/regional-competitor-relevance.test.ts`, `regional-map.test.ts`, `regional-audience-ui.test.tsx`, `firestore-marketing-profile.test.ts`, `firestore-journey.test.ts`, `firestore-digital.test.ts`, `firestore-complete-journey.test.ts`.
- Documentação: este relatório e `docs/progress.md`.

Não foi instalado um “Google Maps scraper kit”. O projeto mantém os adaptadores de Google Places para consultas transitórias e OSM para evidência persistida; este trabalho corrige a avaliação dos resultados, sem acrescentar scraping ou contas de provedor.

## Verificação final e entrega

`COREPACK_HOME=/tmp/medsi-corepack XDG_DATA_HOME=/tmp/medsi-data corepack pnpm check` terminou com **código 0**: lint, tipos, **709 testes em 84 arquivos, zero falhas**, builds de contracts, integrations, API, worker e web aprovados. `git diff --check` aprovado. Log completo: `/workspace/medsi-evidence/competitors-check-final.txt`.

A suíte inicial de reprodução teve dois testes falhos; a regressão da autorização digital legada teve um teste falho antes da correção. Ambos passaram após os ajustes. A revisão independente não alterou arquivos.

Entrega em commit local na branch indicada, sem push/PR/merge/deploy. O SHA final acompanha a mensagem de entrega e `/workspace/medsi-evidence/competitors-delivery.txt`.
