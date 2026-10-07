# Verificação local dos pins e Trends — 7 de outubro de 2026

## Estado da entrega

Branch `fix/regional-baseline-2026-10-06`, base desta correção `9e883e9b4d7ae5ebdff4a395565cde5189e115bc`. Nenhum push, deploy ou merge. As mudanças tratam prévia automática do endereço, enquadramento dos marcadores e diagnóstico de configuração. A alteração automática de `next-env.d.ts` produzida pelo modo dev foi preservada; o build voltou ao conteúdo versionado. Nenhuma credencial, regra, IAM ou bloqueio de produção foi alterado.

## Causa, correção e resultado visual

A fila Firestore chama `collectRegionalMap` com `persistentEvidence=true`. Esse caminho desabilita a chave Places para impedir persistência de lotes de detalhes Google; isso também desabilitava o geocodificador do endereço. Sem ponto confirmado, a função retornava antes de consultar concorrentes. Além disso, o mapa apenas centralizava o ponto com zoom fixo, deixando candidatos de raios maiores fora da área visível.

A nova rota autenticada `POST /onboarding/companies/:id/regional-research/map-preview` lê o perfil confirmado da empresa, verifica acesso e quota e consulta o endereço no Google. Usa a coordenada somente na resposta privada, consulta candidatos OSM e revalida perfil/permissão antes de responder. Não grava a prévia em Firestore. A interface mostra o ponto provisório e exige **Confirmar localização e buscar** antes da pesquisa persistida. Coordenadas escritas manualmente não são sobrescritas por resposta atrasada. A seleção de concorrentes depende da pesquisa confirmada. Sem chave, exibe o motivo e permite marcar o ponto manualmente.

O mapa agora enquadra todo o raio. Duas verificações no Chromium usaram os componentes reais compilados e dados explicitamente fictícios:

- Raio de 10 km: um marcador da clínica e três concorrentes, quatro marcadores dentro da área visível.
- Tela regional com endereço inicialmente sem ponto: resposta de localização simulada preenche latitude/longitude, apresenta quatro marcadores e habilita a confirmação do ponto. Não aprova automaticamente o endereço.

Evidências locais: `/workspace/medsi-evidence/map-fixture.png`, `map-render-verification.json`, `map-automatic-fixture.png`, `map-automatic-verification.json`. São provas de renderização com respostas simuladas, não pesquisa real de concorrentes. O fundo cartográfico não carregou: tentativa real aos tiles OSM recebeu **CONNECT 403** do proxy. O aviso de falha permanece visível e os marcadores continuam renderizados. Nenhuma proteção foi removida para contornar a rede.

## Configuração e consulta real

A API local foi recarregada com `REGIONAL_RESEARCH_ENABLED=true`; web em 3000 e worker em 4001 foram preservados. `/health` agora informa apenas booleans de prontidão, sem segredos. A resposta real em 4000 confirmou:

| Configuração | Estado local |
|---|---|
| Coleta regional | Flag habilitada; indisponível até configurar o banco |
| Firestore `FIREBASE_PROJECT_ID` | Ausente |
| Storage `FIREBASE_STORAGE_BUCKET` | Ausente |
| Firebase Auth web (`NEXT_PUBLIC_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `APP_ID`) | Ausentes |
| Credencial administrativa explícita `GOOGLE_APPLICATION_CREDENTIALS` | Ausente; identidade ADC de infraestrutura não homologada |
| Google Places `GOOGLE_PLACES_SERVER_KEY` | Ausente |
| SerpApi `SERPAPI_API_KEY` | Ausente |

Não existe `.env` no checkout. Não foram lidos ou expostos valores de credenciais. A autenticação real e o banco retornam `not-configured`; a rota web autenticada de prévia retorna **503 — Acesso conectado indisponível**. O worker está `idle`, `processing=false`.

**Google Trends: consulta real NÃO enviada**, status rastreável `NOT_SENT_MISSING_CONFIGURATION`; não há ID de resposta SerpApi. Habilitar a flag não cria a chave nem prova conexão. Os testes SerpApi usam fixtures de consultas por especialidade/cidade, recorte estadual, vazio, falha e timeout. Registro: `/workspace/medsi-evidence/regional-runtime-status.json` e `regional-health.json`.

## Roteiro com duas clínicas fictícias

Usar Clínica Aurora (usuário A) e Consultório Horizonte (usuário B), contas e dados fictícios, empresas separadas. Nenhum passo deve usar pacientes reais. Não marcar um passo como real apenas por passar no teste em memória.

| Passo | Verificação para Iuri | Evidência obtida nesta sessão / estado |
|---|---|---|
| Abrir sistema | `/login` em 3000 e `/health` em 4000 | **Real local:** HTTP 200 e API saudável; sem sessão autenticada |
| Cadastro A/B | Login, tipo, CNPJ fictício, endereço, especialidade, marca, anexos e reload | **Simulado:** dois testes Nest HTTP com identidade/banco em memória. **Bloqueado real:** Auth, Firestore e Storage |
| Assinatura de teste | Contratar, confirmar pagamento sandbox por webhook, cancelamento e expiração | **Simulado:** checkout/jornada e adapters Asaas. **Bloqueado real:** Asaas sandbox; parcelamento/troca de plano incompletos |
| Pesquisa e mapa | Confirmar pin, conferir concorrentes, escolher e salvar; alterar raio; comparar A/B | **Simulado:** teste visual de prévia e marcadores + fixtures. **Bloqueado real:** Places, Firestore/Auth e rede OSM |
| Trends e população | Conferir município/ano, especialidades, BR-UF, métricas relativas e indisponibilidade | **Simulado:** adapters IBGE/SerpApi. **Bloqueado real:** chave SerpApi e homologação de rede/fontes |
| Diagnóstico/plano | Gerar do perfil e evidências atuais, revisar e aprovar versões | **Simulado:** contratos, jornada e chamadas injetadas. **Bloqueado real:** modelos/chave e dados reais de pesquisa |
| Calendário | Definir quantidade/frequência, datas no mês, editar e reaprovar | **Simulado:** persistência, HTTP e regressões. **Bloqueado real:** banco e modelos |
| Arte/logo/vídeo | Gerar com materiais fictícios, revisar, guardar arquivo privado, aprovar versão | **Simulado:** filas, quotas, assets e conteúdo. **Bloqueado real:** modelos de imagem/texto e Storage/signing |
| Atendimento | Conectar número oficial de teste, webhook, consentimento, horários e handoff | **Simulado:** transações e adapter Cloud. **Bloqueado real:** ativos/credenciais oficiais; templates/mídia/recibos incompletos |
| Tráfego pulável | Pular sem gasto, retomar planejamento e invalidar aprovação afetada | **Simulado:** HTTP e transações passaram. **Bloqueado real:** sessão/banco; execução exige conta e autorização de verba |
| Site | Solicitar criação, aguardar rascunho automático, editar, aprovar; preservar versão publicada | **Simulado:** fila, versões e renderização. **Bloqueado real:** modelo/Storage e infraestrutura; nenhuma publicação/DNS executada |
| Isolamento | A tenta abrir dados, arquivos e tarefas de B; remover membro e repetir | **Simulado:** HTTP/permissões e regressões de domínio. **Bloqueado real:** Firebase/Auth/IAM/Storage |

## P0 antes do teste de Iuri

1. Configuração autorizada pelo canal seguro: Firebase projeto/Auth web/identidade administrativa/bucket privado; Places e SerpApi com quota. Não enviar chaves no chat. Configuração persistente de credenciais depende da aprovação específica do responsável.
2. Resolver o acesso de rede aos provedores no ambiente autorizado; os tiles e o download do emulador receberam 403. Não desativar proteção para contornar esse bloqueio.
3. Executar o roteiro A/B no navegador com Firebase real e registrar respostas reais das fontes; depois configurar modelos explicitamente disponíveis e Asaas sandbox.

## P0 antes da venda operacional

Concluir homologação de isolamento/arquivos/revogação, pagamentos e reconciliação, provedores/modelos e custo, canais/webhooks oficiais, estados incertos e recuperação. Resolver ou excluir da oferta as lacunas comerciais e de Cloud documentadas. Exercitar backup/restauração, observabilidade e carga. O inventário ainda contém 29 chamadas legadas pendentes. Produção Firestore permanece bloqueada. A sexta-feira **9/10/2026** é a meta comercial, não uma liberação comprovada por estes testes.

## Verificação final

`pnpm check` terminou com código zero: lint e tipos aprovados, **690 testes em 82 arquivos**, zero falhas, builds contracts/integrations/API/worker/web aprovados. Log: `/workspace/medsi-evidence/check-pins-trends-final.txt`. Foram adicionadas nove regressões para prévia, ausência de fonte, permissão, quota, perfil alterado e distinção entre flag/configuração. As duas jornadas HTTP de clínicas fictícias voltaram a passar; continuam usando identidade e banco em memória. `git diff --check` aprovado. Serviços finais: web 3000 HTTP 200; API 4000 saudável com coleta habilitada e fontes/banco ausentes; worker 4001 idle.
