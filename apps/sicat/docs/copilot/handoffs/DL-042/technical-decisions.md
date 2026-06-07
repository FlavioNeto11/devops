# Technical Decisions — DL-042

## D-042.1 — Separação explícita de autenticação
O login SICAT foi separado do login CETESB para reduzir acoplamento operacional e permitir múltiplos contextos CETESB por usuário interno.

## D-042.2 — Persistência dedicada para sessão SICAT
A sessão SICAT usa `accessToken` assinado e `refreshToken` persistido por hash (`sicat_sessions`), com rotação no refresh.

## D-042.3 — Proteção de credenciais CETESB em repouso
A senha CETESB vinculada por usuário é armazenada cifrada (`AES-256-GCM`) em `sicat_cetesb_accounts`; dados sensíveis não retornam na API.

## D-042.4 — Conta CETESB ativa como pré-condição operacional
Rotas de operação no frontend exigem autenticação SICAT + conta CETESB ativa, evitando execução sem contexto operacional definido.

## D-042.5 — Compatibilidade retroativa preservada
Endpoints legados (`/v1/auth/login`, `/v1/session-contexts*`) foram mantidos para não quebrar fluxos anteriores enquanto a migração de UX/API acontece.

## D-042.6 — Tipo de conta CETESB inicial como `unknown`
`accountType` foi mantido como `unknown` por padrão na primeira entrega, por ausência de mapeamento determinístico robusto no payload de login CETESB atual.
