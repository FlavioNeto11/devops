# AGENTS.md — SICAT

Guia rápido de arquitetura e fronteiras para qualquer agente (humano ou IA) que
abrir este repositório.

> Fonte de verdade complementar: `.github/copilot-instructions.md`,
> `docs/README.md`, `docs/copilot/README.md` e os checkpoints em
> `docs/handoffs/`.

## 1. O que é o SICAT

SICAT é uma plataforma operacional de automação MTR/CETESB com:

- backend Node.js 20+ em **TypeScript** (`type: module`, runtime `tsx`),
  Express, Postgres e fila transacional baseada em tabela `jobs`.
- gateway dedicado para a CETESB (mantido em JavaScript por decisão
  arquitetural — DL-093, ver `docs/copilot/13-decision-log.md`).
- worker dedicado para operações assíncronas (`manifest.submit`,
  `manifest.print`, `manifest.cancel`, `manifest.receive`, `cdf.generate`,
  `cdf.download`, `catalog.sync`, `cadastro.submit`).
- frontend Vue 3 em `frontend/` para operação humana (manifestos, CDF, jobs,
  contas CETESB, administração de acessos, dashboard operacional).
- camada de governança Copilot em `.github/agents/`, `.github/prompts/`,
  `.github/skills/` e `.github/instructions/`.

## 2. Fronteiras (route → service → repository → job → worker → gateway)

A regra é estrita e auditada nos checkpoints:

```text
HTTP → routes/        # mapeamento HTTP, sem lógica de negócio
        services/     # orquestração, idempotência, enqueue
          repositories/   # acesso a dados (SQL)
          jobs (tabela)   # fila transacional
            workers/      # execução assíncrona, retry, DLQ
              gateways/   # única camada autorizada a falar com a CETESB
```

Restrições obrigatórias:

- nenhuma rota/serviço/worker fala diretamente com a CETESB; tudo passa por
  `src/gateways/cetesb-gateway.js` (única exceção JS no diretório `src/`,
  mantida intencionalmente — DL-093);
- nenhuma rota fala SQL direto; SQL fica em `src/repositories/**`;
- comandos assíncronos retornam `202` + `command-accepted`, com job persistido;
- toda operação preserva `correlationId`, `jobId`, `commandId`,
  `sessionContextId` e `integrationAccountId` ao longo das camadas;
- erros são serializados como `application/problem+json`
  (`src/middlewares/error-handler.ts`, `src/lib/problem.ts`);
- `Idempotency-Key` é honrado em comandos por
  `src/services/idempotency-service.ts`.

## 3. Contrato e geração

A API é **contract-first**:

- contrato canônico: `openapi/mtr_automacao_openapi_interna.yaml`;
- exemplos por operação: `examples/`;
- operações geradas tipadas: `src/generated/operations.ts`;
- comandos:
  - `npm run validate:openapi`
  - `npm run gen:operations`

Qualquer mudança de superfície HTTP precisa atualizar, no mesmo PR:
OpenAPI → exemplos → `operations.ts` → rotas → testes de contrato.

## 4. Persistência, fila e observabilidade (DL-022)

- Postgres é a única fonte de verdade transacional.
- Migrations SQL versionadas em `src/sql/`, executadas por `npm run migrate`.
- Fila transacional usa `FOR UPDATE SKIP LOCKED` em `jobs`.
- Locking otimista via coluna `version` em `jobs`, `manifests` e
  `session_contexts`.
- 5 constraints de consistência protegem estados (submitted, finished,
  running, retry_wait, attempts).
- Observabilidade roda em tabelas `worker_health`, `system_events` e
  `performance_snapshots`.
- Endpoints de saúde já publicados:
  - `GET /v1/ping`
  - `GET /v1/health/system`
  - `GET /v1/health/workers`
  - `GET /v1/health/jobs/active`, `POST .../:jobId/cancel`,
    `DELETE .../:jobId`
  - `GET /v1/health/jobs/dlq`, `POST .../:jobId/requeue`,
    `DELETE .../:jobId`
  - `GET /v1/health/metrics/performance`, `/timeline`, `/endpoints`
  - `GET /v1/dashboard/overview`
  - `POST /v1/maintenance/cleanup`

Detalhes completos em `docs/DL-022-EVOLUCAO-PERSISTENCIA-FILA.md`.

## 5. TypeScript e build (DL-093)

- todos os arquivos em `src/**` são `.ts`, exceto
  `src/gateways/cetesb-gateway.js`;
- runtime de desenvolvimento: `tsx` (sem transpile);
- build de produção: `tsc` via `tsconfig.build.json`, saída em `dist/`;
- `tsconfig.json` é estrito (ES2022, NodeNext);
- CORS com whitelist explícita para `http://localhost:5173` em
  `src/app.ts`.

Comandos típicos:

```bash
npm run typecheck     # zero erros esperados
npm run build:ts      # gera dist/
npm run dev           # API em tsx
npm run worker        # worker em tsx
```

## 6. Frontend Vue 3 (design system `Sicat*` — DL-100)

Estrutura atual em `frontend/src/`:

- `components/sicat/` — **design system** (prefixo `Sicat`): `SicatPageLayout`,
  `SicatCard`, `SicatDataTable`, `SicatFiltersPanel`, `SicatActionBar`,
  `SicatFormSection/Field`, `SicatSearchInput`, `SicatMetricCard`,
  `SicatStatusBadge`, `SicatStatusTimeline`, `SicatLoadingState/EmptyState/ErrorState`,
  `SicatInlineAlert`, `SicatSnackbar`, `SicatConfirmDialog`.
- `components/shell/` — App Shell (`SicatAppShell`, `SicatTopbar`,
  `SicatNavigation`, `SicatMobileDrawer`, `SicatPageHeader`, `SicatUserMenu`).
- `features/<dominio>/` — decomposição de telas grandes (ex.: `features/dashboard/`,
  `features/mtr/list/manifestHelpers.js`).
- `views/` — páginas roteadas (orquestram estado; apresentação vem dos Sicat*).
- `composables/` — `useNotification` (toasts globais), `useJobAwait` (polling
  202+jobId), `useJobStream` (SSE), `useConfirmDialog`, etc.
- `lib/status-map.js` — **fonte única** de tones + labels de status (manifest/job/cdf/dmr).
- `config/navigation.js` — fonte declarativa única de navegação.
- `services/` — clientes HTTP da API interna. `stores/` — Pinia (auth/contas CETESB).
- `router.js` — guards (auth SICAT, conta CETESB ativa, RBAC admin) + `meta.audience`.

Regras de UI obrigatórias:

- toda página usa `SicatPageLayout` + `SicatPageHeader`; toda lista usa
  `SicatDataTable`; todo status usa `SicatStatusBadge` (via `status-map.js`);
- feedback via `useNotification` (nunca `v-snackbar` inline); confirmação
  destrutiva via `useConfirmDialog`;
- navegação por audiência: "Operação" (sempre) × "Sistema"/"Administração"
  (gated por `canAccessAdmin`); Jobs apenas em `/sistema/jobs`.

Documentação:

- catálogo do design system: `frontend/docs/design-system.md` (props/slots/exemplos)
  + playground em `/dev/components`;
- arquitetura de componentes: `docs/FRONTEND-COMPONENTS-ARCHITECTURE.md`;
- refatoração UX/UI: `DL-100` + `docs/CHANGELOG-DL-100-REFATORACAO-UX-DESIGN-SYSTEM.md`.

## 7. Estrutura de diretórios (DL-021)

- raiz: apenas arquivos essenciais (`package.json`, `docker-compose.yml`,
  `Dockerfile`, `tsconfig*.json`, `README.md`, `AGENTS.md`).
- `tests/manual/` — scripts ad-hoc de debug (NÃO automatizados).
- `tests/` — testes automatizados (api, integration, worker, contract,
  smoke, ui).
- `docs/` — toda a documentação versionada.
- `docs/handoffs/<work_id>/` — checkpoints de coordenação entre agentes.
- `scripts/` — automações (PowerShell, Shell, Node.js).
- `storage/temp/` — arquivos temporários (gitignored).

## 8. Política de delegação (multi-agente)

`orquestrador-mtr` e os entrypoints principais do Copilot são
delegation-first. Demandas com múltiplos verbos (`validar`, `corrigir`,
`implementar`, `testar`, `documentar`, `commitar`, `push`) viram cadeias de
especialistas:

- implementação ou correção: especialista de domínio;
- validação, smoke e regressão: `tester-qa-mtr`;
- documentação e handoff final: `documentador-mtr`;
- CI, pré-merge e operações git: `ci-cd-github-mtr`.

Se o runtime não conseguir invocar o próximo especialista, devolver
`next_agent_required` com prompt pronto. O orquestrador NUNCA executa fases
do especialista no lugar dele.

## 9. Real-mode CETESB — do / don't

- DO manter toda HTTP CETESB em `src/gateways/cetesb-gateway.js`.
- DO preservar bootstrap/token via
  `src/services/session-context-service.ts`.
- DO validar/normalizar manifestos em
  `src/lib/validators/manifest-validator.ts`.
- DO manter audit exchange logging nos handlers do worker.
- DON'T hardcodar JWT, headers ou endpoints fora do gateway.
- DON'T chamar a CETESB direto a partir de `routes/`, `services/` ou
  `workers/`.
- `recaptchaToken` é opcional (CETESB aceita string vazia via API backend).

## 10. Documentação canônica recomendada

Leitura mínima para um novo agente:

- `README.md` — setup e operação principal.
- `docs/README.md` — índice da documentação.
- `docs/copilot/13-decision-log.md` — decisões arquiteturais (DL-022, DL-093,
  etc.).
- `docs/DL-022-EVOLUCAO-PERSISTENCIA-FILA.md` — persistência, fila e
  observabilidade.
- `docs/DL-021-REORGANIZACAO-ESTRUTURA.md` — estrutura de diretórios.
- `docs/FRONTEND-COMPONENTS-ARCHITECTURE.md` — padrão de componentes Vue.
- `frontend/docs/design-system.md` — catálogo do design system `Sicat*`
  (props, slots, exemplos, padrões visuais) + playground `/dev/components`.
- `docs/CHANGELOG-DL-100-REFATORACAO-UX-DESIGN-SYSTEM.md` — refatoração UX/UI
  corporativa (design system, navegação por audiência, limpeza).
- `docs/10-estado-atual/estado-atual.md` — snapshot honesto do que está
  implementado, em progresso e planejado.
- `docs/04-arquitetura/centro-operacional-sicat.md` — arquitetura alvo do
  Centro Operacional SICAT.
- `docs/04-arquitetura/command-center-sicat.md` — base estrutural do
  futuro chat orquestrador.
- `docs/_inputs/fonte-de-verdade-backlog-cto.md` — visão de produto/CTO,
  pilares, KPIs e backlog estratégico.
- `docs/handoffs/README.md` — checkpoints por `work_id`.
