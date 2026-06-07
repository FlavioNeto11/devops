# Handoff Summary — DL-034

## Handoff 1 — Contrato/Auth payload
- Ajuste em `src/services/auth-service.js` para normalização de campos de entrada:
  - `document <- payload.document || payload.login`
  - `password <- payload.password || payload.senha`
  - `recaptchaToken <- payload.recaptchaToken || payload.recaptcha`
- Compatibilidade preservada para o frontend já existente.

## Handoff 2 — Validação CETESB (HAR)
- Payload de login extraído diretamente do HAR de referência.
- Confirmada aderência dos campos críticos (`login`, `senha`, `email`, `parCodigo`, `recaptcha`) ao fluxo real.

## Handoff 3 — Testes e validações
- Teste funcional direto no endpoint interno com payload bruto do HAR:
  - `POST /v1/auth/login` retornando `200` e token válido.
- Validação de fonte de verdade executada com sucesso:
  - `npm run validate:cetesb-source` ✅

## Resultado final
- Objetivo atingido: usar acesso do HAR para logar através do endpoint interno.
- Sem breaking change em rota/contrato público; mudança restrita à compatibilidade de entrada no service.
