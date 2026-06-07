# Technical Decisions - DL-049

## Decisão 1: Separar logout total de troca de conta CETESB
- **Problema:** apenas ação de logout completo existia no shell.
- **Decisão:** criar ação dedicada para troca de conta CETESB sem invalidar sessão SICAT.
- **Implementação:** `clearActiveCetesbContext` em `frontend/src/stores/auth.js`.

## Decisão 2: Limpar apenas contexto operacional CETESB
- **Campos limpos:** `activeAccount`, `partner`, `sessionContext`, `integrationAccountId`.
- **Campos preservados:** `token`, `refreshToken`, `expiresAt`, `user`.
- **Racional:** manter autenticação SICAT válida para reduzir fricção de uso.

## Decisão 3: Navegação explícita para seleção de contas
- **Implementação:** botão no shell chama `handleSwitchCetesbAccount` e redireciona para `/login/cetesb`.
- **Compatibilidade:** guards existentes permanecem válidos, pois o usuário continua autenticado no SICAT e sem conta CETESB ativa.
