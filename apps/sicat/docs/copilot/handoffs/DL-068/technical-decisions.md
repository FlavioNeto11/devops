# Technical Decisions — DL-068

## Decisão 1: Remoção de conta ativa permitida
- **Implementação:** fluxo frontend não bloqueia mais remoção por `activeAccountId`.
- **Racional:** o bloqueio dava impressão de botão inoperante e impedia limpeza operacional.

## Decisão 2: Tipo da conta estrito ao login CETESB
- **Implementação:** `auth-service` extrai e normaliza `accountType` do payload CETESB; `sicat-account-service` recusa criação sem tipo válido.
- **Evidência HAR:** em `docs/cetesb/mtr.cetesb.sp.gov.br_login.har`, o login retorna papéis em flags como `isGerador/isTransportador/isDestinador` e `gerador/transportador/destinador`; a extração passou a priorizar esses campos.
- **Racional:** evitar inferência/fallback indevido para `gerador` quando o tipo deveria vir da origem.

## Decisão 3: Remoção de fallback na ativação
- **Implementação:** `activateById` deixou de alterar `account_type` para `generator`.
- **Racional:** preservar integridade semântica do tipo persistido.
