# Testes Automatizados

## Visão Geral

O projeto possui uma suíte de testes automatizados estruturada em três camadas:
- **API**: testes de rotas HTTP e contratos
- **Integração**: testes de serviços com persistência real
- **Worker**: testes de processamento assíncrono

## Status Atual

### ✅ Atualização DL-017 (2026-03-09)

Cobertura adicionada/ajustada para evolução CETESB + fila + worker:

| Categoria | Arquivo | Escopo | Status |
|-----------|---------|--------|--------|
| Unit | `tests/unit/cetesb-gateway.test.js` | retry transitório, não-retry em 4xx, `X-Correlation-Id`, falha parcial de catálogos | ✅ 4/4 |
| Unit | `tests/unit/retry.test.js` | classificação retryable vs definitivo | ✅ |
| Unit | `tests/unit/job-runner-failure.test.js` | transição `retry_wait`/`failed`/`dlq` | ✅ 3/3 |
| Unit | `tests/unit/manifest-validator.test.js` | validador alinhado ao payload interno | ✅ 25/25 |
| Integration | `tests/integration/job-queue-improvements.test.js` | `requeueStaleRunningJobs` + DLQ/retry | ✅ 7/7 |

Validações complementares executadas:
- `npm run validate:openapi` ✅
- `npm run test:contract` ✅
- `npm run smoke:health` ✅
- `npm run smoke:openapi` ✅ (executado em `http://localhost:8081` por conflito de `8080` no host)

### ✅ Implementado: `/v1/manifestos/:id/submit`

**27 testes totais** (70% aprovação em integração)

| Categoria | Arquivo | Testes | Status |
|-----------|---------|--------|--------|
| API | `tests/api/manifest-submit.test.js` | 9 | ⚠️ Requer API rodando |
| Integração | `tests/integration/manifest-submit-service.test.js` | 10 | ✅ 7/10 passando |
| Worker | `tests/worker/manifest-submit-handler.test.js` | 8 | ⚠️ Requer mock ajustado |

### 📋 Próximos Endpoints

- `/v1/manifestos/:id/print`
- `/v1/manifestos/:id/cancel`
- `/v1/catalog-sync`
- `/v1/session-contexts`
- `/v1/cadastros`

## Executando Testes

### Setup Inicial (uma vez)

```powershell
# 1. Subir infraestrutura
docker-compose up -d postgres

# 2. Instalar dependências
npm install

# 3. Configurar ambiente
Copy-Item .env.example .env

# 4. Executar migrações
npm run migrate
```

### Comandos Disponíveis

```powershell
# Todos os testes
npm test

# Por categoria
npm run test:api          # Testes de API (requer npm run dev)
npm run test:integration  # Testes de integração (apenas DB)
npm run test:worker       # Testes de worker (apenas DB)

# Endpoint específico
npm run test:manifest:submit

# Script completo automatizado
pwsh scripts/test-manifest-submit.ps1
```

### Executar com API Rodando

```powershell
# Terminal 1: API
npm run dev

# Terminal 2: Testes
npm run test:api
```

## Estrutura de Arquivos

```
tests/
├── fixtures/              # Dados reutilizáveis
│   ├── manifests.js       # Manifestos em diferentes estados
│   ├── session-contexts.js # Contextos de sessão
│   └── jobs.js            # Jobs de processamento
│
├── api/                   # Testes de rotas HTTP
│   └── manifest-submit.test.js
│
├── integration/           # Testes de serviços
│   └── manifest-submit-service.test.js
│
├── worker/                # Testes de processamento
│   └── manifest-submit-handler.test.js
│
├── README.md              # Guia completo
├── manifest-submit.md     # Validação manual detalhada
├── manifest-submit-summary.md  # Resumo de cobertura
└── FIXES-APPLIED.md       # Log de correções
```

## Cobertura de Cenários

### ✅ Cenários Positivos Testados
- Submit básico com job criado
- Idempotência (mesma idempotency-key retorna mesmo resultado)
- Reaproveitamento de sessionContextId do manifesto
- validateOnly sem alteração de dados finais
- printAfterSubmit com job adicional criado
- Atualização de referências externas (manCodigo, manNumero, manHashCode)
- Propagação de correlationId
- Registro completo de auditoria

### ✅ Cenários Negativos Testados
- Manifesto inexistente → 404
- SessionContextId inexistente → 400
- SessionContextId ausente → 400
- Falha de gateway com retry configurável

### ✅ Validações de Persistência
- Status do manifesto: draft → queued_submit → submitting → submitted
- Job criado com status queued → running → succeeded
- externalReference preenchido corretamente
- externalHashCode persistido
- Timestamps (lastSubmittedAt, lastSyncAt) atualizados
- Cache de idempotência registrado
- Exchange completo em audit_logs

## Fixtures Disponíveis

### Manifestos (`tests/fixtures/manifests.js`)
```javascript
import { validManifestDraft, validManifestWithoutSessionContext, submittedManifest } from '../fixtures/manifests.js';
```

### Session Contexts (`tests/fixtures/session-contexts.js`)
```javascript
import { validSessionContext, expiredSessionContext } from '../fixtures/session-contexts.js';
```

### Jobs (`tests/fixtures/jobs.js`)
```javascript
import { queuedSubmitJob, runningSubmitJob, succeededSubmitJob, failedSubmitJob } from '../fixtures/jobs.js';
```

## Boas Práticas

### 1. Isolamento de Testes
Cada teste limpa e cria seus próprios dados:
```javascript
beforeEach(async () => {
  await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_test_%']);
  await query('DELETE FROM manifests WHERE id LIKE $1', ['man_test_%']);
  // ... criar dados frescos
});
```

### 2. Prefixos de Teste
Use prefixos para evitar conflito com dados reais:
- Manifestos: `man_test_*`
- Session contexts: `scx_test_*`
- Integration accounts: `acc_test_*`
- Correlation IDs: `corr_test_*`

### 3. Assertions Específicas
Valide exatamente o que importa:
```javascript
assert.strictEqual(manifest.status, 'queued_submit');
assert.ok(manifest.lastSubmittedAt);
```

### 4. Nomenclatura Clara
Nome do teste deve descrever comportamento:
```javascript
it('deve enfileirar submit básico com sessionContextId no body', async () => {
  // ...
});
```

## Limitações e Riscos Não Cobertos

### Não Automatizável
- **reCAPTCHA**: interação humana obrigatória
- **Token expiration**: timing em tempo real
- **Concorrência**: múltiplos workers simultâneos
- **Performance**: alto volume de requisições
- **Rede instável**: falhas intermitentes

### Estratégia de Mitigação
- Smoke tests periódicos contra ambiente staging
- Monitoramento de métricas em produção
- Alertas para padrões anormais de erro
- Documentação de comportamentos observados da CETESB

## Documentação Relacionada

- **Este arquivo**: visão geral de testes
- `tests/README.md`: guia completo da estrutura
- `tests/manifest-submit.md`: comandos e validação manual
- `tests/manifest-submit-summary.md`: resumo de cobertura
- `tests/FIXES-APPLIED.md`: log de problemas encontrados
- `docs/copilot/11-checklist-qa.md`: checklist de QA

## Roadmap de Testes

### Curto Prazo
1. ✅ Implementar testes para `/v1/manifestos/:id/submit`
2. Ajustar 3 assertions de erro em testes de integração
3. Completar mocks de gateway para worker

### Médio Prazo
1. Testes para `/v1/manifestos/:id/print`
2. Testes para `/v1/manifestos/:id/cancel`
3. Testes para `/v1/catalog-sync`
4. Smoke tests end-to-end

### Longo Prazo
1. Testes unitários (sem infraestrutura)
2. Testes de performance
3. Testes de concorrência
4. Integração com CI/CD
5. Code coverage report
