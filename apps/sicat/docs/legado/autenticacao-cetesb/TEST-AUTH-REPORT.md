# Relatório de autenticação

Este arquivo foi consolidado como registro resumido do fluxo de autenticação real.

## Estado atual

- Backend e worker operam somente com integração CETESB real.
- `recaptchaToken` continua opcional no backend conforme evidência de HAR.
- A validação manual de UI permanece em `tests/manual/test-auth-ui.md`.

## Referências vigentes

- `tests/contract/auth-contract.test.js`
- `tests/manual/test-auth-ui.md`
- `docs/legado/autenticacao-cetesb/REAL_TESTING_QUICK_START.md`
- `docs/TESTING.md`

## Observação

Conteúdo detalhado anterior, focado em comportamento de mock, foi descontinuado para evitar instruções inconsistentes com o runtime real-only.
