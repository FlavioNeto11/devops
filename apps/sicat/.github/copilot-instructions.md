# Copilot Instructions — `sicat` (MTR CETESB backend)

## Big picture

- Node.js backend (`type: module`) with **TypeScript** (tsx runtime) + `Express + Postgres + transactional jobs + worker + CETESB gateway`.
- Primary flow: route (`src/routes/api-routes.ts`) → service (`src/services/*`) → repository (`src/repositories/*`) → job (`jobs` table) → worker (`src/workers/job-runner.ts`) → gateway (`src/gateways/cetesb-gateway.js`).
- API is contract-first: align behavior with `openapi/mtr_automacao_openapi_interna.yaml` and `src/generated/operations.ts`.
- CETESB HARs in `docs/cetesb/` are source of truth when integration behavior is unclear.
- **TypeScript**: all `src/**` files are `.ts`; exception is `src/gateways/cetesb-gateway.js` (still JS, works via ESM interop).

## Boundaries

- `routes/`: HTTP mapping only.
- `services/`: orchestration + idempotency + enqueue.
- `repositories/`: all SQL/data access.
- `gateways/`: CETESB communication only.
- `workers/`: async execution, retry, DLQ.

## Agent quick start (10 minutes)

- Read `README.md`, then compare `src/routes/api-routes.ts` with `src/generated/operations.ts`.
- Trace one async path: `src/services/manifest-service.ts` → `src/repositories/job-repo.ts` → `src/workers/job-runner.ts` → `src/workers/operation-handlers.ts`.
- Before API edits, update in lockstep: `openapi/`, `examples/`, `src/generated/operations.ts`, `src/routes/`, tests.
- Before CETESB edits, validate request/response assumptions against `docs/cetesb/` HAR evidence.

## Conventions that matter

- Preserve `correlationId`, `jobId`, `commandId`, `sessionContextId`, `integrationAccountId` across layers.
- Correlation header is `X-Correlation-Id` (`src/middlewares/request-context.ts`).
- Async command endpoints return `202` with command-accepted payloads (`enqueueManifest*` in `src/services/manifest-service.ts`).
- Idempotency uses `Idempotency-Key` + persisted replay (`src/services/idempotency-service.ts`).
- Errors must be `application/problem+json` (`src/middlewares/error-handler.ts`, `src/lib/problem.ts`).

## Delegation-first policy

- `orquestrador-mtr` and the main Copilot entrypoints are delegation-first for broad or multi-domain work.
- If a request combines multiple operational verbs or phases such as `validar`, `corrigir`, `implementar`, `testar`, `documentar`, `commitar` or `push`, treat it as a specialist chain instead of direct execution by the orchestrator.
- Ownership of broad operational requests must stay explicit:
  - implementation or fixes: domain specialist owner
  - validation, smoke and regression: `tester-qa-mtr`
  - documentation and final handoff: `documentador-mtr`
  - CI, pre-merge readiness and git-operation guidance: `ci-cd-github-mtr`
- If the runtime cannot run the next specialist, return `next_agent_required`; do not silently continue the remaining phases in the orchestrator.

## Real-mode CETESB: do / don't

- Do keep all CETESB HTTP logic in `src/gateways/cetesb-gateway.js` (still JS — only file kept in JS intentionally); don't call CETESB directly from routes/services/workers.
- Do preserve session bootstrap/token behavior via `src/services/session-context-service.ts`; don't hardcode JWTs, headers, or endpoint constants.
- Do validate/normalize manifesto payloads in `src/lib/validators/manifest-validator.ts`; don't bypass validator paths.
- Do keep auditability (`correlationId`, exchange audit entries in worker handlers); don't remove gateway exchange logging.
- `recaptchaToken` em autenticação: campo **opcional**, CETESB aceita string vazia via API backend.

## Workflows

- Setup: `npm install`, `docker compose up -d postgres`, `npm run migrate`.
- Contract checks: `npm run validate:openapi`; regenerate operations: `npm run gen:operations`.
- Local run: `npm run dev` (API via tsx) + `npm run worker`.
- Type check: `npm run typecheck` (zero errors expected). Build: `npm run build:ts`.
- Fast checks: `npm run smoke:health`, `npm run smoke:openapi`.
- Tests: `npm test` plus targeted `test:api`, `test:integration`, `test:worker`, `test:contract`.
- Manual tests: scripts in `tests/manual/` for debug/validation.
- Batch operations: scripts in `scripts/` (PowerShell + Shell).

## TypeScript Architecture (DL-093 - 2026-04-16)

- All `src/**` files are `.ts` (services, repos, workers, middlewares, routes, lib, bootstrap)
- Runtime: `tsx` (no transpile step needed for dev); `tsc` for production build (`dist/`)
- Config: `tsconfig.json` (strict, ES2022, NodeNext modules), `tsconfig.build.json` (dist output)
- Gateway exception: `src/gateways/cetesb-gateway.js` stays JS — works via ESM interop
- CORS: explicit origin whitelist in `src/app.ts` for `http://localhost:5173`
- **See**: `docs/copilot/13-decision-log.md#dl-093`

## Observability & Health Monitoring (DL-022 - 2026-03-09)

- Worker heartbeat every 30s, auto-registration, graceful shutdown
- Health endpoints: `GET /health/system`, `/workers`, `/jobs/active`, `/jobs/dlq`, `/metrics/performance`, `/maintenance/cleanup`, `/ping`
- Optimistic locking: `version` field in jobs table prevents lost updates
- Database constraints: 5 consistency checks (submitted, finished, running, retry_wait, attempts)
- Observability tables: `worker_health`, `system_events`, `performance_snapshots`
- **See**: `docs/DL-022-EVOLUCAO-PERSISTENCIA-FILA.md` for complete infrastructure details

## Project Structure (DL-021 - 2026-03-09)

- **Root**: Only essential files (package.json, docker-compose.yml, README.md, Dockerfile, tsconfig.json, tsconfig.build.json)
- **tests/manual/**: Ad-hoc test scripts for debugging (NOT automated tests)
- **docs/**: All documentation (guides, changelogs, handoffs)
- **docs/handoffs/**: Agent coordination artifacts
- **scripts/**: Automation scripts (PowerShell, Shell, Node.js utilities)
- **storage/temp/**: Temporary files, credentials, test data (gitignored)
- **See**: `ESTRUTURA-REORGANIZADA.md` for complete reorganization details
