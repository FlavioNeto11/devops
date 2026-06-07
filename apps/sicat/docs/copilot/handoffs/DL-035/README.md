# DL-035 — Frontend login alinhado ao payload real CETESB

## Visão geral
Este handoff consolida a correção do fluxo de login do frontend para aderência ao cenário real observado nos HARs CETESB, mantendo compatibilidade com o payload anterior.

## Status
- Situação: ✅ COMPLETADO
- Data: 2026-03-10
- Decision log: `docs/copilot/13-decision-log.md` (DL-035)

## Escopo
- Ajuste do payload enviado por `frontend/src/stores/auth.js`.
- Inclusão de campos opcionais de contexto no formulário de login.
- Validação E2E com Playwright MCP em modo real.

## Referências
- Fonte da verdade CETESB: `docs/cetesb/mtr.cetesb.sp.gov.br_login.har`
- Frontend store: `frontend/src/stores/auth.js`
- Login view: `frontend/src/views/LoginView.vue`
- Estrutura Copilot: `docs/copilot/14-estrutura-copilot.md`
