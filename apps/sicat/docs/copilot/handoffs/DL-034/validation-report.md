# Validation Report — DL-034

## 1) Evidência funcional principal
### Teste
- Ação: enviar payload bruto extraído de `docs/cetesb/mtr.cetesb.sp.gov.br_login.har` para `POST /v1/auth/login`.

### Resultado
- `API_STATUS=200` em `GET /v1/ping`.
- `LOGIN_STATUS=200` em `POST /v1/auth/login`.
- Resposta contendo:
  - `token`
  - `expiresAt`
  - `user` (`userId`, `name`, `email`, `document`)
  - `partner` (`partnerCode`, `description`, `document`)

## 2) Validação de fonte de verdade
- Comando: `npm run validate:cetesb-source`
- Resultado: ✅ `[ok] Política de fonte da verdade CETESB validada com sucesso.`

## 3) Suíte ampla de testes
- Comando: `npm run test -- --runInBand`
- Resultado: ⚠️ falhas presentes no baseline atual da suíte (integração/worker/contrato), não introduzidas por esta mudança de auth payload.

## 4) Conclusão
- Escopo DL-034 validado com sucesso.
- Integração de login real via payload HAR operacional.
