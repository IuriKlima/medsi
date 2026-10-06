# Auditoria Askadia — 21/09/2026

Base: inspeção de arquivos, rotas, migrações, testes e aplicação local. O diagnóstico dos 13 prints foi recebido em texto; os arquivos de imagem não foram fornecidos nesta etapa. Classificação não presume homologação hospedada.

| Módulo | Rotas/arquivos encontrados | Evidência / estado real encontrado | Lacunas e dependências | Critério de conclusão |
|---|---|---|---|---|
| Identidade | /login, /auth/*, /workspace; api/src/identity; migrations 001–003 | Integrado sem homologação. Auth/settings real 200; 37 testes locais. Banco remoto retorna PGRST205 para workspaces | Aplicação das migrações, callback, SMTP, duas contas reais | Cadastro, sessão e revogação comprovados no Supabase |
| Empresas/equipe | tenant-workspace.tsx; RPCs e RLS | Integrado sem homologação. CRUD, convites, último admin, auditoria | Cinco perfis de produto não equivalem aos cinco papéis legados; acesso interno ausente | Papéis, carteira e API direta isolados |
| Visão geral | components/workspace.tsx | Funcional local. Indicadores derivados dos rascunhos; ausência de métricas externas explícita | Dashboard persistente por empresa | Indicador com fonte/período/fuso |
| Estratégia | workspace.tsx | Interface apenas para IA, criação manual local | Perfil confirmado, pesquisa, OpenAI, jobs, versões | Estratégia real validada e persistida |
| Calendário/estúdio | workspace.tsx; lib/workspace.ts | Funcional local para conteúdo manual; sem geração/renderização | Persistência, Gemini, arquivos, calendário semana/lista | Peça final, marca, versões e dimensões |
| Aprovações | contracts/index.ts | Funcional local. Edição invalida versão; aprovação real bloqueada | Delegação, RPC, versionamento persistente, jobs | Publicação revalida versão e permissão |
| CRM/resultados | migrations foundation; workspace.tsx | CRM funcional local; tabelas remotas preparadas apenas com leitura. Resultados sem métricas externas inventadas | CRUD persistente, tarefas, CSV, indicadores | Contato/oportunidade isolados e matrícula humana |
| Atendimento/campanhas | workspace.tsx; integrations/src/index.ts | Interface apenas. Adapters indisponíveis | OAuth, webhooks, fila, takeover, contas elegíveis | Provar fluxo real sem duplicar mensagens/gasto |
| Agentes/onboarding | Nenhuma rota específica encontrada | Interface ausente | Conversa persistente, Google, referências, confirmação | Retomada e ordem obrigatória |
| Conhecimento/pesquisa | Nenhum domínio persistente encontrado | Interface ausente | Fatos versionados, fontes, extração segura | Dados confirmados alimentam estratégia |
| Sites dos clientes/domínios | workspace.tsx (Meu site) | Interface apenas | Versões, preview, hosting, verificação, tenant por hostname | Domínio validado e formulário no CRM correto |
| Site público/LP Askadia | / atualmente preview/redirect | Ausente | Conteúdo factual, aquisição própria, prevenção de spam | Formulário persistido na carteira interna |
| Planos/cobrança | contracts/index.ts; configurações local | Funcional local somente para apresentação de preços | Catálogo persistente, entitlements, franquias, Asaas sandbox | Assinaturas independentes e eventos conciliados |
| Administração/acompanhamento | Papel support por empresa | Interface ausente para carteira e administração | Equipe interna separada, sessões auditadas, encontros | Carteira limitada e operador real preservado |
| Workers/integrações | worker/src/main.ts; integrations | Registro de filas e adaptador explicitamente indisponível | Consumers, scheduler, outbox, Redis e homologação | Jobs retomam sem duplicar efeito externo |

## Decisões da auditoria

Preservar Next/React, Nest, Supabase, pnpm/lockfile, contratos Zod e componentes atuais. Não duplicar backend. Manter /preview separado. Adicionar migrações incrementais; não alterar a instalação inicial que o usuário está executando.

O prompt mestre (askadia-requisitos.md) substitui conflitos anteriores. Proprietário passa a ter acesso operacional às próprias empresas. Gerente de marketing não recebe cobrança por padrão. Administração da plataforma não é um papel atribuível por convite de cliente. Acompanhamento interno depende de carteira explícita e sessão auditada.

Tokens encontrados: globals.css define --bg, --surface, --ink, --muted, --line; tipografia do sistema; tons neutros, cards, bordas discretas e esculturas CSS existentes. Extração e ampliação ocorrerão sem substituir identidade.

A ordem atual é a da seção 25 do prompt mestre. As etapas antigas nos documentos anteriores são históricas; não representam o novo sequenciamento.


## Revisão de implantação — 27/09/2026

Automação de anúncios estava ausente; agora há implementação local para Meta imagem/tráfego web e Google Pesquisa, com aprovação final, programação, isolamento e reconciliação. Revisão detalhada: [tráfego e implantação](trafego-execucao-2026-09-27.md). A geração de imagem OpenAI foi exercitada com sucesso real; os anúncios continuam sem homologação nas contas dos provedores. Produção está atrás do código local: tabelas de jornada/imagens/execução ausentes e rota nova de anúncios 404. Deploy e migração dependem das sessões corretas do Easypanel/Supabase; Google Ads depende de MCC, OAuth e token aprovado. Não há evidência para declarar todo o sistema pronto para produção.

## Revisão MedSI — 29/09/2026

O projeto contém módulos persistentes de onboarding, estratégia, conteúdo, atendimento, campanhas, CRM e suporte; a matriz inicial acima é histórica. A inspeção para a nova marca encontrou foco fitness em interface, prompts, pesquisa regional e contratos de importação. A adaptação MedSI mantém a arquitetura e os códigos existentes, amplia os segmentos e ajusta a comunicação para médicos e clínicas. Agenda médica, prontuário e avaliação clínica não são funcionalidades entregues por esta mudança. Detalhes, migração incremental, validação e dependências em [análise MedSI](medsi-identidade-2026-09-29.md) e `progress.md`.
