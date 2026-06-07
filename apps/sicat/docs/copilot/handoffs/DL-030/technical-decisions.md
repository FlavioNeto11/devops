# Decisões Técnicas - DL-030

## Contexto

Durante investigação de erro 404 em POST /v1/auth/login, descobrimos que:
- Frontend gera token reCAPTCHA (campo `recaptchaToken`)
- CETESB **não valida** esse token via API backend
- HAR real (`docs/cetesb/mtr.cetesb.sp.gov.br_login.har`) mostra token gigante (2KB)
- Testes práticos comprovam: CETESB **aceita string vazia** (`""`)

**Problema**: Documentação e instruções para agentes não deixavam claro que recaptcha é opcional.

---

## Decisão 1: Marcar recaptchaToken como opcional em toda documentação

**Rationale:**
- Campo não é validado pela CETESB via API backend
- Evitar confusão de desenvolvedores e agentes
- Clarificar que frontend gera mas backend não precisa validar

**Implementação:**
- OpenAPI: descrição atualizada + não required
- README.md: nota explicativa + exemplos
- .github/copilot-instructions.md: instrução específica para agentes
- docs/copilot/: seção técnica detalhada

**Impacto:**
- Zero breaking changes (código já aceitava vazio)
- Documentação agora reflete comportamento real

---

## Decisão 2: Usar string vazia (`""`) como padrão nos examples

**Alternativas consideradas:**
1. Omitir campo completamente
2. Usar string vazia `""`
3. Usar token fake gigante (2KB como no HAR)

**Escolha**: String vazia (`""`)

**Rationale:**
- Mais explícito que omissão (mostra que campo existe)
- Mais simples que token fake gigante
- Reflete comportamento real da API (aceita vazio)
- Evita confusão sobre obrigatoriedade

**Implementação:**
- `examples/post_v1_auth_login_request.json`: `"recaptchaToken": ""`
- `examples/README.md`: documentação explicando escolha

---

## Decisão 3: Adicionar comentários explicativos no código

**Rationale:**
- Facilitar manutenção futura
- Evitar reintrodução de validações obrigatórias
- Esclarecer para desenvolvedores que campo é opcional

**Implementação:**
- `src/gateways/cetesb-gateway.js` linha 534
- `src/routes/api-routes.js` linha 40
- `src/services/session-context-service.js` linha 364
- Comentário padrão: "// recaptchaToken é opcional - CETESB aceita string vazia via API backend"

**Impacto:**
- Zero mudança de comportamento
- Clareza aumentada para manutenção

---

## Decisão 4: Não alterar package.json ou scripts

**Rationale:**
- Mudança é apenas documental + comentários
- Não há novos testes automatizados necessários
- Scripts de validação existentes (npm run validate:openapi) são suficientes

**Implementação:**
- Nenhuma alteração em package.json
- Nenhum novo script npm

**Impacto:**
- Validações existentes continuam funcionando
- Zero mudança em workflow de desenvolvimento

---

## Decisão 5: Criar testes manuais temporários, depois remover

**Rationale:**
- Validar comportamento durante desenvolvimento
- Não há necessidade de testes automatizados permanentes (comportamento trivial)
- Arquivos temporários devem ser removidos na consolidação

**Implementação:**
- Criados durante HANDOFF 2:
  - `test-direct-login.js`
  - `test-recaptcha-optional.js`
- Removidos na consolidação (HANDOFF 6)

**Impacto:**
- Validação feita
- Raiz do projeto limpa

---

## Evidências

### HAR Real
`docs/cetesb/mtr.cetesb.sp.gov.br_login.har` linha 3236:
```json
{
  "sistema": 0,
  "login": "31913781000139",
  "email": "flavio_padilha_neto@msn.com",
  "senha": "2dlzft",
  "parCodigo": 176163,
  "recaptcha": "0cAF..." // ← 2KB de token
}
```
**Resposta**: 200 OK (login aceito)

### Teste Prático
```bash
node test-recaptcha-optional.js
# [TEST 1] ✅ recaptchaToken ausente → aceito
# [TEST 2] ✅ recaptchaToken vazio ("") → aceito
```

**Conclusão**: CETESB aceita recaptcha vazio via API backend sem validação.

---

## Impacto Geral

| Categoria | Impacto |
|-----------|---------|
| Breaking changes | **Nenhum** |
| Código de produção | **Nenhum** (só comentários) |
| Contrato OpenAPI | **Descrição atualizada** |
| Documentação | **5 arquivos atualizados** |
| Examples | **1 arquivo atualizado** |
| Testes | **0 testes permanentes adicionados** |
| Validações | **Todas passando** |
