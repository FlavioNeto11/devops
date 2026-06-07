# Technical Decisions — DL-034

## Decisão 1 — Compatibilidade de payload no serviço de auth
**Decisão:** aceitar aliases de payload no `login()` de `src/services/auth-service.js`.

**Motivação:** a evidência HAR CETESB usa naming `login/senha/recaptcha`, enquanto o frontend interno usa `document/password/recaptchaToken`.

**Impacto:**
- Positivo: simplifica uso de payload real de HAR e reduz atrito operacional.
- Risco: baixo, pois é ampliação de compatibilidade (não remove comportamento anterior).

## Decisão 2 — Priorizar evidência HAR como fonte de verdade
**Decisão:** validar implementação contra `docs/cetesb/mtr.cetesb.sp.gov.br_login.har` antes de inferências.

**Motivação:** cumprir regra de source-of-truth CETESB.

**Impacto:** reduz divergência entre integração real e comportamento implementado.

## Decisão 3 — Não alterar contrato OpenAPI nesta etapa
**Decisão:** manter contrato público inalterado e tratar compatibilidade internamente no service.

**Motivação:** evitar breaking change e manter estabilidade para consumidores atuais.

**Impacto:** compatibilidade expandida sem exigir mudança de clientes existentes.
