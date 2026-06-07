# Mapa de código

> **TypeScript** (DL-093 - 2026-04-16): todos os arquivos `src/**` migrados para `.ts`. Runtime: `tsx`. Exceção: `src/gateways/cetesb-gateway.js` (JS estável via ESM interop).

## Entradas do sistema
- `src/server.ts`: sobe API
- `src/worker.ts`: sobe worker

## Núcleo HTTP
- `src/app.ts`
- `src/routes/api-routes.ts`
- `src/routes/system-routes.ts`

## Contrato e geração
- `openapi/mtr_automacao_openapi_interna.yaml`
- `src/generated/operations.ts`
- `scripts/generate-operations.js`
- `examples/*.json`

## Sessão e autenticação
- `src/services/session-context-service.ts`
- `src/repositories/session-context-repo.ts`
- `src/lib/jwt.ts`
- `src/gateways/cetesb-gateway.js` (`ensureAuthForSession` com refresh real CETESB em cenário `401/403`)

## Manifestos
- `src/services/manifest-service.ts`
- `src/repositories/manifest-repo.ts`

## Validadores ✅ NOVO (2026-03-08)
- `src/lib/validators/manifest-validator.ts`
  - `validateManifestPayload()`: valida campos obrigatórios antes do submit
  - `normalizeExpeditionDate()`: previne duplicação de timestamp
  - **Cobertura**: 26 testes unitários (100% aprovados)
  - **Documentação**: `docs/copilot/validadores/cetesb/validacao-sequencia-mtr.md`

## Catálogos
- `src/services/catalog-service.ts`
- `src/repositories/catalog-repo.ts`

## Parceiros
- `src/services/partner-service.ts`
- `src/repositories/partner-repo.ts`

## Cadastro
- `src/services/cadastro-service.ts`
- `src/repositories/cadastro-repo.ts`

## Jobs
- `src/services/job-service.ts`
- `src/repositories/job-repo.ts`
- `src/workers/job-runner.ts`
- `src/workers/operation-handlers.ts`

## Frontend operacional MTR (atualizado 2026-03-12)
- `frontend/src/components/ManifestCreateForm.vue`
  - layout em colunas independentes (`create-column-main` / `create-column-side`) para evitar lacunas verticais
  - padronização de campos, estados visuais e spacing
- `frontend/src/views/ManifestCreateView.vue`
- `frontend/src/views/ManifestsView.vue`
- `frontend/src/views/ManifestDetailView.vue`
- `frontend/src/views/JobsView.vue`
- `frontend/src/views/DashboardView.vue`
- `frontend/src/views/SessionAccountView.vue`

## Auditoria
- `src/services/audit-service.ts`
- `src/repositories/audit-repo.ts`

## Infra
- `src/db/pool.ts`
- `src/db/migrate.ts`
- `src/bootstrap/startup.ts`
- `src/lib/config.ts`

