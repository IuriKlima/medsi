# MedSI — conta única do cliente

Implementação local da instrução de 06/10/2026: não apresentar workspace nem criação de múltiplas contas ao cliente.

- `/entrada` abre diretamente a clínica ativa mais antiga autorizada. Contas sem clínica seguem para `/comecar`; a página empresarial mantém os controles de onboarding, plano e permissões. Registros legados adicionais permanecem intactos e acessíveis pelos vínculos existentes.
- `/workspace` fica restrito à gestão interna. Para clientes, a rota preserva convites em fragmentos e encaminha links antigos de equipe, acessos, assinatura e importação. O convite continua exigindo aceite explícito e validação no servidor.
- A navegação identifica a clínica, oferece **Minha conta** com as configurações existentes e permite sair diretamente. A operação interna mantém administração/carteira e um link de retorno quando o papel interno está ativo.
- No adaptador Firestore, as operações de início e criação de clínica reutilizam a primeira clínica ativa autorizada do cliente. A escrita do perfil na mesma transação coordena tentativas simultâneas. Clientes internos ativos preservam a possibilidade de administrar mais de uma clínica. IDs de workspaces recebidos continuam sujeitos a autorização; a repetição de solicitações revalida o acesso.

## Verificação

22 testes direcionados passaram: navegação da conta (5), rotas autenticadas (5), identidade Firestore em memória isolada (5) e permissões das configurações existentes (7). Quatro regressões de criação falharam antes da guarda e passaram depois. Os testes usam dados explicitamente fictícios, sem provedores externos.

Limites: a guarda de criação foi implementada no adaptador Firestore; os contratos e migrações SQL legados permanecem inalterados. Concorrência validada no armazenamento transacional de testes, sem homologação em Firestore hospedado. A validação global (`pnpm check`) e a revisão integrada de navegador pertencem à etapa principal. Nenhuma migração, exclusão, cobrança, publicação ou implantação foi executada.
