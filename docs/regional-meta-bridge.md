# Ponte Meta para pesquisa regional

O worker regional reaproveita os RPCs nativos `read_company_meta_server` e `ad_credentials_server`, com companyId e actorId do job autorizado. A conexão Meta deve estar ativa e a conta de anúncios selecionada deve apontar para a mesma Página; nenhum ID global/default é usado. `metaAccess` exige ads_read ou ads_management e a conexão não pode estar expirada.

O token de usuário é aberto no servidor pelo módulo independente `channel-vault`, usando a empresa como AES-GCM AAD. Token de Página não substitui autorização de usuário. A ponte não cria credencial, conta, conexão, anúncio ou campanha.

Antes e depois da coleta, a ponte revalida conta, Página, escopos e segredo. Um fingerprint interno detecta alterações de metadados ou cipher; a evidência regional não recebe token ou fingerprint. A fonte Meta permanece unconfigured quando faltam conexões e fica unavailable quando há acesso inválido ou alteração durante a coleta. IBGE, Trends e X continuam com seus estados independentes.

O worker também passa `persistentEvidence:true` ao coletor de mapa para a política de persistência de concorrentes. A aplicação da política depende do suporte implementado em regional-map.ts; a flag não deve ser interpretada isoladamente como comprovação de conformidade com os termos de Places.

Validação local: oito testes em tests/regional-meta-bridge.test.ts usam segredos fictícios cifrados e respostas injetadas. Cobrem tenant/actor no RPC, conta/Página, permissão de leitura, ausência de conexão, segredo de outro tenant e alterações durante a coleta. Nenhuma chamada Meta/OpenAI/Google real foi executada. Lint focado aprovado.

Homologação externa pendente: aplicativo Meta aprovado, acesso e escopos reais, conta escolhida pelo titular e consulta read-only autorizada no ambiente de teste. Os contratos existentes de estimativas foram preservados; os fixtures não comprovam disponibilidade atual do endpoint ou quotas da conta real.
