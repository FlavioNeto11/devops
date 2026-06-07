---
applyTo: "src/gateways/**/*.js,src/services/session-context-service.ts,src/workers/operation-handlers.ts"
excludeAgent:
  - documentador-mtr
---
## Instruções para integração CETESB

- O gateway real deve ser a única borda de comunicação com `mtrr.cetesb.sp.gov.br`.
- Toda estratégia de header, token, timeout, retry e parsing deve ficar centralizada no gateway ou em helpers próximos.
- Não automatize recaptcha.
- Assuma que payloads externos podem variar e trate ausência de campos com fallback defensivo.
- Preserve logs técnicos suficientes para diagnóstico, sem vazar credenciais.
- Reaproveitamento e renovação de JWT devem passar por `session-context-service`.
- Sempre documente no código quando um comportamento foi inferido a partir de HAR e não provado por documentação oficial.
- Sempre que possível, persista identificadores externos relevantes: `hash`, `manCodigo`, `manNumero`.
- `docs/cetesb/` é a fonte da verdade para integração real e deve ser consultada antes de alterar payload, parsing, headers e fluxos.
