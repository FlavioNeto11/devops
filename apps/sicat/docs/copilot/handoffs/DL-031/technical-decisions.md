# Decisões Técnicas - DL-031

## Decisão 1: Corrigir o contrato para refletir rotas reais de observabilidade

**Problema:** o OpenAPI estava com paths sem prefixo `/v1`, enquanto a implementação expõe `/v1/*`.

**Escolha:** atualizar o OpenAPI para os paths reais em vez de duplicar rotas na API.

**Racional:**
- Evita duplicidade de endpoints.
- Mantém coerência com padrão versionado da API.
- Preserva comportamento atual dos consumidores internos já alinhados ao `/v1`.

---

## Decisão 2: Impor obrigatoriedade de query params em runtime

**Problema:** o contrato exigia parâmetros obrigatórios, mas a implementação aceitava requisições sem eles.

**Escolha:** validar em serviço e retornar `400` com problem details.

**Aplicado em:**
- `GET /v1/partners/search` -> `integrationAccountId` e `role`
- `GET /v1/manifestos` -> `integrationAccountId`

**Racional:**
- Contrato-first: implementação deve seguir OpenAPI.
- Falha explícita melhora previsibilidade para consumidores.

---

## Decisão 3: Manter um único server em OpenAPI

**Alternativas avaliadas:**
1. Manter `localhost` + `127.0.0.1` + `mtr-automation.internal`.
2. Manter apenas `localhost`.

**Escolha:** manter apenas `http://localhost:8080`.

**Racional:**
- Funciona no ambiente local e Swagger UI.
- `127.0.0.1` é redundante.
- `mtr-automation.internal` não resolve no ambiente local de desenvolvimento.

---

## Impacto

- **Breaking changes:** nenhum no runtime principal; houve saneamento de conformidade contratual.
- **Qualidade:** aumento de aderência OpenAPI x implementação.
- **Testabilidade:** suíte manual estabilizada com 100% dos casos testáveis aprovados.
