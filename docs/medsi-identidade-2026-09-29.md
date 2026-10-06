# MedSI — identidade e foco médico · 29/09/2026

A solicitação atual do usuário e a prancha MedSI substituem a marca Askadia, o foco fitness e as orientações anteriores de preservar aquela identidade. Os documentos antigos permanecem como histórico; não são novas instruções do usuário. Regras de autorização, isolamento, aprovações por versão e homologação continuam válidas.

## Análise do projeto

A base existente é um monorepo Next/React, API Nest, contratos Zod e Supabase com RLS, jobs e adaptadores externos. Já há módulos de acesso, onboarding, estratégia, calendário, produção visual, campanhas, CRM, atendimento, sites, planos e suporte. Código implementado e integração homologada são estados distintos; esta mudança não homologa os provedores.

O posicionamento fitness estava espalhado pela interface pública, onboarding, prompts no servidor e no banco, pesquisa regional, importações e modelos de e-mail. Por isso a adaptação inclui esses pontos, mantendo contratos internos estáveis e os dados existentes.

## Entrega local

- Nome MedSI, assinatura “Sua clínica em sintonia.” e mensagem “Da primeira conversa ao próximo agendamento”. Comunicação para médicos, clínicas e consultórios.
- Paleta da prancha: petróleo `#123D46`, menta `#42D6B0`, marfim `#F5F7F4`; superfícies translúcidas e linhas curvas. Símbolo vetorial em duas cores, wordmark compartilhado, favicon, autenticação, navegação, páginas públicas e prévia local.
- O símbolo é uma interpretação vetorial da imagem recebida. Não foi fornecido arquivo original do logo ou uma família tipográfica licenciada. Fonte de sistema preservada.
- Páginas `/lp/marketing-medico` e `/lp/atendimento-medico`; rotas fitness redirecionam permanentemente. Metadados e sitemap usam `PUBLIC_SITE_URL` ou `WEB_ORIGIN`; sem origem configurada não se inventa um domínio.
- Onboarding coleta especialidades, serviços, convênios, condições de atendimento, identificação profissional e rotina de agendamento, usando os campos existentes. Não solicita prontuários ou exames. Os fatos continuam sujeitos a confirmação e versionamento.
- Cadastros aceitam `clinic` e `medical_practice`. Segmentos antigos permanecem válidos e não são convertidos por suposição. O banco sincroniza o segmento apenas quando o tipo de negócio informado muda para uma atividade médica reconhecida.
- CRM usa consulta agendada e conversão confirmada como rótulos, mantendo códigos persistidos. Uma conversão não é tratada automaticamente como tratamento realizado ou receita.
- Pesquisa regional passa a consultar tipos de estabelecimento médico; palavras-chave usam serviços confirmados, sem inventar volume de buscas.
- Instruções dos agentes orientam comunicação médica responsável e atendimento administrativo. A identificação profissional não é inventada, questões clínicas são orientadas à equipe e materiais exigem revisão. São instruções de geração, não certificação jurídica nem garantia de comportamento de IA.
- Campanhas usam a variável `{{clinica}}`; a API traduz para o identificador legado antes de persistir. CSV novo usa `id_paciente` e `ultimo_atendimento`; o formato anterior continua aceito. Consentimento, empresa, revisões e limites de envio preservados.
- Cartões de integrações fitness retirados da interface. API de contatos existente mantida, com limites explícitos sobre agenda e prontuário.
- Treze modelos de e-mail regenerados localmente com a marca MedSI e o endereço `{{ .SiteURL }}`. Não foram aplicados no provedor nem enviados.

## Implantação e compatibilidade

Aplicar `supabase/migrations/202609290001_medsi_identity.sql` após as migrações anteriores e antes de disponibilizar novos segmentos no ambiente remoto. A migração amplia a restrição de segmento, atualiza perguntas e o preenchimento inicial do perfil, e acrescenta um gatilho limitado à classificação. Atualiza somente os nomes conhecidos dos planos para MedSI, preservando preços e IDs. Não apaga nem reescreve históricos, mensagens, aprovações, contatos ou perfis confirmados. Não foi aplicada remotamente nesta etapa.

Os namespaces `@askadia/*`, IDs de planos, chaves de armazenamento local, nomes de instâncias, contratos `students`, verificação DNS `_askadia` e identificadores de integração foram preservados para evitar perda de acesso ou quebra de vínculos existentes. O asset antigo do símbolo serve a nova marca para consumidores que ainda usam aquele endereço. Documentos e dados históricos podem conter o nome anterior.

Domínio MedSI, DNS, OAuth, SMTP, contatos comerciais e publicação dependem de configuração e revisão específicas. Não houve deploy, alteração de credenciais ou chamadas pagas de IA. Preços e regras comerciais existentes não foram alterados.

## Limites do foco médico

Esta entrega adapta a plataforma de marketing e relacionamento. Não implementa prontuário eletrônico, prescrição, diagnóstico, triagem clínica, agenda médica transacional ou integração universal com sistemas de saúde. Solicitações de agendamento dependem de confirmação da equipe. Regras de campanhas por intervalo de contato não são uma indicação clínica de retorno. Revisão profissional de publicidade, governança de dados sensíveis e homologação dos conectores médicos são etapas próprias antes de uma operação assistencial.

## Referências técnicas consultadas

- [Google Places — tipos de estabelecimentos](https://developers.google.com/maps/documentation/places/web-service/place-types): `doctor` e `medical_clinic`.
- [CFM — identificação na publicidade médica](https://publicidademedica.cfm.org.br/manual/resolucao-comentada/capitulo-2) e [orientação sobre promessas de resultados](https://publicidademedica.cfm.org.br/manual/resolucao-comentada/capitulo-6). Usadas como referência para a orientação dos rascunhos; não há alegação de conformidade automática.
- Documentação do Next 16.3.5 instalada no projeto: CSS, metadados e redirecionamentos.

## Validação

Resultados finais, evidências e limitações da conferência registrados em `docs/progress.md`. Capturas e resultados da conferência em desktop e celular ficam em `.local/medsi-review/`. Protótipos e demonstrações continuam identificados.
