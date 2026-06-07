---
name: validar-ci-cd
description: Validar mudanças localmente simulando CI/CD do GitHub Actions antes de commit/push
agent: ci-cd-github-mtr
argument-hint: "arquivos modificados ou 'all' para validação completa"
---

# Validar CI/CD antes de commit

Você receberá uma lista de arquivos modificados (ou solicitação de validação completa).

## Seu objetivo

Simular localmente os mesmos comandos que o workflow `ci-contract-queue.yml` executa, garantindo que mudanças passarão no CI antes de push.

## Procedimento

### 1. Identificar arquivos impactados
```bash
git status --short
git diff --name-only
```

### 2. Classificar mudanças
- **OpenAPI** (`openapi/*.yaml`) → validar contrato
- **Examples** (`examples/*.json`) → validar schema compliance
- **Source** (`src/**/*.js`) → testes unitários/integração
- **Migrations** (`src/sql/*.sql`) → aplicar em banco limpo
- **Docs** (`docs/**/*.md`) → validar links
- **CETESB** (`docs/cetesb/*.har`, `src/gateways/cetesb-gateway.js`) → source-of-truth

### 3. Executar validações apropriadas

#### Setup ambiente limpo (se necessário)
```bash
docker compose down -v
docker compose up -d postgres
npm ci
npm run migrate
```

#### Validações por categoria

**Se mudou OpenAPI ou Examples**:
```bash
npm run validate:openapi
npm run gen:operations
npm run test:contract
```

**Se mudou Source**:
```bash
npm run test:unit
npm run test:integration
```

**Se mudou Migrations**:
```bash
docker compose down -v
docker compose up -d postgres
npm run migrate
npm run test:integration
```

**Se mudou Docs**:
```bash
npm run validate:md-links
```

**Se mudou CETESB**:
```bash
npm run validate:cetesb-source
npm run test:source-of-truth
```

#### Simulação completa do CI
```bash
# Exatamente como workflow ci-contract-queue.yml
npm run migrate
npm run test:contract
npm run validate:cetesb-source && npm run test:source-of-truth
npm run validate:md-links
npm run smoke:job:retry-dlq
```

### 4. Gerar relatório

**Formato de saída**:
```markdown
## ✅ Validação CI/CD Local

### Arquivos modificados
- src/routes/manifest-routes.js
- openapi/mtr_automacao_openapi_interna.yaml
- examples/post_v1_manifestos_response.json

### Validações executadas
- ✅ npm run validate:openapi (0 erros)
- ✅ npm run test:contract (15 testes, 15 passaram)
- ✅ npm run validate:md-links (0 links quebrados)

### Status final
✅ **PRONTO PARA COMMIT** - Todas validações passaram

### Próximos passos
1. Commit mudanças: git add . && git commit -m "feat: novo endpoint de submit"
2. Push para branch: git push origin feature/submit-endpoint
3. Abrir PR e aguardar CI confirmar
```

**Se houver falhas**:
```markdown
## ❌ Validação CI/CD Local - BLOQUEADO

### Arquivos modificados
- src/sql/005_new_migration.sql

### Validações executadas
- ❌ npm run migrate (FALHOU)

### Erro detectado
```
Error: syntax error at or near "CONSTRAINT"
File: src/sql/005_new_migration.sql
Line: 45
```

### Ação necessária
1. Corrigir syntax error no SQL
2. Testar migration em banco limpo
3. Re-executar: npm run migrate
4. Confirmar 0 erros

### Escalonamento
Falha em migration → escalar para @postgres-queue-mtr
```

### 5. Critério de pronto

- [ ] Todas validações executadas conforme categoria de mudança
- [ ] 0 erros bloqueantes
- [ ] Relatório claro (✅ pronto ou ❌ bloqueado)
- [ ] Se bloqueado: erro + ação necessária + escalonamento

---

## Exemplo de uso

### Caso 1: Validação completa
```
@ci-cd-github-mtr /validar-ci-cd all
```

Agente irá:
1. git status para identificar mudanças
2. Classificar arquivos por categoria
3. Executar validações apropriadas
4. Gerar relatório de prontidão

### Caso 2: Validação específica
```
@ci-cd-github-mtr /validar-ci-cd

Arquivos modificados:
- src/routes/health-routes.js
- src/repositories/health-repo.js
- src/sql/004_advanced_locking_consistency.sql
```

Agente irá:
1. Detectar mudança em SQL + source
2. Executar: migrate, test:integration
3. Confirmar se passa ou falha
4. Gerar relatório específico

### Caso 3: Pré-commit automático
```
@ci-cd-github-mtr /validar-ci-cd $(git diff --name-only)
```

Agente irá:
1. Receber lista de arquivos do git diff
2. Validar apenas o subset impactado
3. Falhar rápido se erro crítico
4. Gerar feedback imediato
