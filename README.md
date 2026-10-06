# MedSI · Sua clínica em sintonia

Plataforma de marketing e atendimento administrativo para médicos, consultórios e clínicas, com onboarding em conversa, estratégia, calendário editorial, CRM e assistência por IA. Identidade em petróleo, menta e marfim.

A direção MedSI de 29/09/2026 substitui o foco fitness e a marca anteriores. Veja [análise e entrega MedSI](docs/medsi-identidade-2026-09-29.md) e [progresso atualizado](docs/progress.md) para o estado atual; os registros abaixo descrevem etapas históricas.

## Executar localmente

Requisitos: Node.js 22.12+ e pnpm 10.33.0.

```powershell
pnpm --store-dir .pnpm-store install --frozen-lockfile
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
pnpm dev
```

Configure as credenciais no `.env` privado. Não sobrescreva um `.env` existente. Web: http://127.0.0.1:3000; API: http://127.0.0.1:4000/health; worker: http://127.0.0.1:4001/health.

O site público fica na raiz. O sistema usa `/login` e direciona para os contextos autorizados. `/preview` preserva o protótipo local, separado da área autenticada.

## Implementação atual

- Firestore Native selecionado: banco confirmado, namespace e catálogo inicializados, regras privadas aplicadas. Identidade e onboarding portados; migração dos demais fluxos pendente e produção bloqueada. [Estado do Firestore](docs/medsi-firestore-2026-09-29.md).
- Onboarding médico por etapas: CNPJ, endereço confirmado, especialidade, currículo/história, logo, fotos e site; fatos, revisão e versões persistidos.
A conta administrativa local já foi configurada e leu o Firestore real. Authentication por E-mail/senha está ativo e o domínio local foi autorizado; Storage ainda precisa de configuração. Os módulos listados a seguir têm implementações preservadas do provedor anterior e aguardam adaptação ao Firestore:

- Estratégia OpenAI com 12 ideias; aprovação seguida do detalhamento do calendário editorial.
- Designer Gemini com briefing e materiais privados selecionados, controle de revisão e aprovação.
- Conexões por empresa: fluxo OAuth Meta e criação/reutilização de instância Evolution com QR code e consulta de status.
- Caixa de entrada WhatsApp por empresa, histórico Evolution, tela cheia, atalhos e assistência GPT-4o mini com prompt/fluxo por canal.
- Módulos de CRM, resultados e acesso interno, com limitações e homologações descritas na documentação.

Existência de código não significa homologação externa. A última tentativa real do Gemini retornou limite de quota. OAuth Meta, publicação, insights e atendimento automático por webhook Evolution ainda precisam de implementação/configuração e validação. A caixa de entrada já consulta o histórico real da Evolution; sugestões de IA/fluxo são revisadas pelo atendente antes de enviar. Parear WhatsApp não ativa envio ou triagem automática. Vídeos recebem roteiro; o envio do arquivo final ainda está pendente.

## Banco e configuração

A configuração atual é [Firestore na MedSI](docs/medsi-firestore-2026-09-29.md). A proposta anterior de [SQL Connect](docs/medsi-firebase-2026-09-29.md) foi substituída pela escolha do proprietário. O fluxo médico está em [onboarding e estratégia regional](docs/medsi-onboarding-medico-2026-09-29.md). No Firestore foram inicializados três documentos de configuração/catálogo e aplicadas regras privadas; não houve deploy da aplicação nem importação dos dados legados.

O SQL versionado está em `supabase/migrations`. Consulte [identidade](docs/identity-setup.md), [jornada](docs/jornada-contrato.md) e [calendário e conexões](docs/calendario-conexoes.md). Confira as migrações já instaladas antes de aplicar atualizações: não reaplique indiscriminadamente arquivos em uma base existente. O Git não contém backup de dados do Supabase.

Chaves e tokens ficam exclusivamente no ambiente ou cofre. `.env.example` contém somente configurações de exemplo. Preserve `SECRETS_ENCRYPTION_KEY` ao mover o ambiente: ela protege as conexões já armazenadas.

## Verificar

```powershell
pnpm check
```

Executa lint, tipos, testes e builds. A CI em `.github/workflows/ci.yml` executa a mesma verificação em pushes e pull requests.

## Hospedagem no Easypanel

O projeto não executa deploy automaticamente. Antes de publicar, revisar a configuração de produção dos serviços, rede, URLs, segredos, credenciais administrativas, migrações e homologação das integrações. A configuração pública Firebase não substitui essas etapas.

Antes da publicação, preparar os serviços e a rede do container, configurar os segredos no Easypanel, validar banco e integrações, configurar DNS/HTTPS do domínio aprovado e conferir os callbacks públicos. Não incluir `.env`, dados locais ou dependências no repositório.

## Estrutura e documentação

- `apps/web`: Next.js / React / Tailwind.
- `apps/api`: NestJS, autorização e operações empresariais.
- `apps/worker`: infraestrutura BullMQ; consumidores de negócio pendentes.
- `packages`: contratos, UI e adaptadores de integração.
- `supabase/migrations`: esquema, RPCs e políticas de acesso.
- `tests`: testes de contratos, autorização, persistência e provedores.
- `docs`: requisitos, auditorias, contratos e acompanhamento.

Consulte [requisitos](docs/askadia-requisitos.md), [auditoria](docs/askadia-auditoria.md), [andamento do produto](docs/askadia-progresso.md) e [registro de validação](docs/progress.md).

Contrato da caixa, permissões e dependências: [Atendimento](docs/atendimento-caixa-entrada.md).
