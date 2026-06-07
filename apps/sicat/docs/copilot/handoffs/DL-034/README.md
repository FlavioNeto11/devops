# DL-034 — Login real com payload HAR CETESB

## Visão geral
Este artefato consolida a execução do handoff para permitir login real reaproveitando o payload observado em `docs/cetesb/mtr.cetesb.sp.gov.br_login.har`.

## Status
- Situação: ✅ COMPLETADO
- Data: 2026-03-10
- Decision log: `docs/copilot/13-decision-log.md` (DL-034)

## Escopo
- Compatibilidade de entrada no serviço de autenticação para aceitar `login/senha/recaptcha` além de `document/password/recaptchaToken`.
- Validação da aderência HAR → implementação.
- Registro de evidências e validações executadas.

## Referências
- Fonte de verdade CETESB: `docs/cetesb/mtr.cetesb.sp.gov.br_login.har`
- Serviço alterado: `src/services/auth-service.js`
- Estrutura Copilot: `docs/copilot/14-estrutura-copilot.md`
