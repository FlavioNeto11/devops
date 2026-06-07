# Technical Decisions — DL-043

## 1) Cadastro no mesmo contexto de autenticação SICAT
**Decisão:** criar `POST /v1/sicat/auth/register` no mesmo namespace de autenticação SICAT.

**Motivo:** manter coesão do fluxo de login/cadastro e facilitar manutenção de segurança e observabilidade.

## 2) Login imediato após cadastro
**Decisão:** endpoint de cadastro retorna `accessToken`, `refreshToken`, `expiresAt` e `user`.

**Motivo:** reduzir fricção de UX e permitir transição direta para seleção da conta CETESB.

## 3) Validação mínima de senha
**Decisão:** exigir senha com pelo menos 8 caracteres.

**Motivo:** evitar criação de contas com credenciais frágeis sem impor regras excessivas nesta etapa.

## 4) Conflito de e-mail como `409`
**Decisão:** quando e-mail já existir, responder `409 Conflict` com `problem+json`.

**Motivo:** semântica HTTP correta para unicidade e comportamento previsível no frontend.

## 5) Sem migração nova
**Decisão:** reutilizar tabela `sicat_users` já criada em DL-042.

**Motivo:** requisito resolve-se por camada de serviço/contrato/UI, sem alteração estrutural de banco.
