# Technical Decisions — DL-035

## Decisão 1 — Payload em superset para compatibilidade real
**Decisão:** manter campos antigos e adicionar campos de contexto/aliases no request de login do frontend.

**Motivação:** no cenário real validado, o payload mínimo não era suficiente para autenticação da credencial testada; o payload com contexto (`email` + `parCodigo`) e aliases apresentou sucesso.

**Impacto:**
- Preserva retrocompatibilidade.
- Aumenta aderência à evidência HAR CETESB.

## Decisão 2 — Campos opcionais na UI
**Decisão:** expor `email` e `código do parceiro` como opcionais no formulário.

**Motivação:** evitar hardcode e permitir operação com múltiplas credenciais reais.

**Impacto:**
- UX continua simples para uso comum.
- Flexibilidade para cenários reais sem alteração de código.

## Decisão 3 — Defaults por variáveis de ambiente
**Decisão:** usar `VITE_LOGIN_EMAIL` e `VITE_LOGIN_PARTNER_CODE` como prefill opcional.

**Motivação:** facilitar execução local/reprodutível de testes E2E sem acoplamento rígido no código.

**Impacto:** sem breaking changes; configuração estritamente opcional.
