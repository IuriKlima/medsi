# MedSI — cadastro, plano e pesquisa regional

Implementação local da solicitação de 06/10/2026, sobre o fluxo Firestore existente.

## Fluxo entregue

1. A primeira pergunta é Clínica ou Consultório médico, sem resposta predefinida. As perguntas seguintes se adaptam à escolha. Cadastros antigos continuam compatíveis, derivando o tipo do endereço já salvo sem reescrever o histórico.
2. Confirmar o cadastro leva à escolha do plano, sem a espera artificial anterior. Coleta e IA continuam protegidas pelo plano confirmado no servidor. O checkout permanece explicitamente de teste, sem cobrança.
3. A primeira etapa da estratégia reúne dashboard IBGE/Facebook/Google Trends, mapa e seleção de concorrentes, pesquisas relacionadas e detalhes das fontes. A proposta de logo fica fora dessa etapa.
4. O mapa Leaflet/OpenStreetMap começa com uma viewport municipal obtida da malha do IBGE. Ela é navegação, não a localização da clínica. O endereço confirmado fica visível; o cliente marca o ponto exato e confirma o raio de 1, 3, 5 ou 10 km. Não usamos o geocodificador público Nominatim automaticamente.
5. Após confirmação, Overpass pesquisa estabelecimentos de saúde no raio. A lista colaborativa pode ser incompleta, não assegura atividade comercial ou concorrência direta. O cliente escolhe até 20 entre os 50 candidatos mais próximos. Seleção vazia exige confirmação explícita. Distâncias são em linha reta.
6. A aprovação guarda uma cópia da pesquisa, localização, raio, IDs escolhidos, fontes e lacunas. Alterações de pesquisa/seleção invalidam as aprovações dependentes. O contexto da IA recebe esse snapshot junto do perfil confirmado e do currículo quando fornecido.
7. O cliente entra diretamente na conta; não vê seletor de workspace. Veja [conta única](medsi-conta-unica-2026-10-06.md).

## Recortes e métricas

- IBGE: município inteiro, ano do Censo e distribuições disponíveis. Não é extrapolado para o círculo do mapa.
- Facebook: estimativa municipal de adultos elegíveis a anúncios, por conta autorizada; não equivale à população ou a pacientes.
- Google Trends: consultas por cidade + cada especialidade, no recorte estadual explicitamente identificado. Interesse 0–100 é separado de crescimento percentual e Breakout.
- X: amostra recente com menção textual de cidade e especialidade. Interações não demonstram crescimento nem residência dos autores.
- Assuntos do Facebook: sem fonte autorizada configurada; permanecem indisponíveis, sem endpoint ou números inventados.

## Progresso e proteção

O Firestore registra mudanças de fase por fonte, protegidas pelo token de execução, prazo, perfil, plano e permissão. Atualizações de progresso não alteram a base da aprovação. Repetições de lease reiniciam o progresso da tentativa. Sem porcentagem artificial e sem escrita periódica por relógio.

A tela distingue solicitação inicial, coleta persistida, erro, fonte indisponível, preparação de diagnóstico e aprovação. Tempo exibido é tempo nesta tela, não previsão. Consultas frequentes são limitadas ao trabalho ativo; abas ocultas e trabalhos ociosos mantêm a redução de consultas anterior.

Operações de seleção são autorizadas no servidor e transação Firestore. Só aceitam IDs da evidência atual, sem URLs externas fornecidas pelo cliente. Os provedores usam hosts fixos, limites de tamanho/tempo e validação de escopo. Números ausentes não viram zero.

## Configuração e homologação

`SERPAPI_API_KEY` e `X_BEARER_TOKEN` não estavam configurados no ambiente local desta etapa. A audiência Meta no Firestore ainda depende da integração de credenciais da empresa. Não alteramos credenciais, faturamento, contas de anúncios ou configurações externas. Sem essas conexões, a interface registra as lacunas e exige reconhecimento antes de aprovar.

Mapa/progresso/seleção novos são implementados no caminho Firestore. SQL legado mantém seu caminho anterior; a migração incremental de businessType está entregue em `supabase/migrations/202610060001_medical_business_type.sql`, sem aplicação remota. Novos snapshots/mapas não substituem automaticamente pesquisas ou aprovações já salvas: o usuário pode atualizar a coleta.

Testes de provedores e autorização utilizam fixtures em memória; nenhuma clínica fictícia foi gravada no projeto real. A inspeção visual automatizada foi impedida pela falha de inicialização do ambiente de navegador (`apply deny-read ACLs`); testes de renderização verificam layout semântico, fontes ausentes e progresso. Homologação visual interativa e conexões reais permanecem pendentes. Resultados finais do `pnpm check` e HTTP constam em `docs/progress.md`.

## Referências dos adaptadores

- [Leaflet](https://leafletjs.com/reference.html)
- [Uso de tiles OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)
- [Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)
- [Malhas IBGE v3](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3)
- [Google Trends Related Queries via SerpApi](https://serpapi.com/google-trends-related-queries)
- [X recent search](https://docs.x.com/x-api/posts/recent-search)
