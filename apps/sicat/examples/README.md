# Examples e fonte da verdade

Os arquivos em `examples/` representam payloads e responses da API interna.

## Regra

- Todos os exemplos devem ser derivados ou validados contra evidências reais em `docs/cetesb/`.
- Exemplos não devem conter segredos reais.
- Quando o exemplo for inferido (não explícito no HAR), registrar isso em `docs/copilot/13-decision-log.md`.

## Campo recaptchaToken (DL-030)

O campo `recaptchaToken` em requisições de autenticação é **opcional**:
- CETESB aceita string vazia ou campo omitido
- Examples usam `"recaptchaToken": ""` como padrão
- Endpoints afetados: `POST /v1/auth/login`, `POST /v1/session-contexts` (bootstrap)
