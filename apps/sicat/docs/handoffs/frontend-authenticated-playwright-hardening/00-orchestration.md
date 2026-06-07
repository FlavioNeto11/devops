# 00-orchestration

## Demanda resumida

Executar navegacao autenticada via Playwright com usuario real (3 contas), validar fluxos gerais (troca de conta, busca por datas e navegacao entre telas), corrigir problemas funcionais e ajustes finos de layout da refatoracao.

## Classificacao

```yaml
orchestration:
  work_id: "frontend-authenticated-playwright-hardening"
  intent: "fix"
  complexity: "complex"
  domains:
    - "frontend-ux"
    - "qa"
    - "session-account"
    - "observability-admin"
  first_agent: "estrutura-vscode-mtr"
  phase_sequence:
    - phase: "localhost-availability"
      agent: "estrutura-vscode-mtr"
      required: true
      reason: "garantir stack local completa (api + worker + frontend) para validacao autenticada"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "navegacao Playwright ponta a ponta com login e 3 contas"
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "corrigir regressos funcionais e ajustes detalhados de layout"
    - phase: "09-qa-validation-rerun"
      agent: "tester-qa-mtr"
      required: true
      reason: "revalidar apos correcoes"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar evidencias e status final"
```

## Criterios de pronto

- Login autenticado via Playwright concluido.
- Troca entre as 3 contas validada.
- Navegacao geral e filtros de data exercitados nas telas principais.
- Ajustes de layout detalhados aplicados e revalidados.
- Sem bloqueios de uso para o usuario informado.

## Checkpoints esperados

- `06-frontend-ux.md`
- `09-qa-validation.md`
- `10-documentation-final.md`

## Execucao da fase localhost-availability (2026-04-21)

### Stack e processos

- Postgres ativo em `localhost:5432` (container `mtr_postgres` em execucao).
- API ativa em `http://127.0.0.1:8080`.
- Worker ativo (`src/worker.ts` em execucao).
- Frontend ativo em `http://127.0.0.1:5174`.

### URLs e health validados

- Frontend: `GET http://127.0.0.1:5174/` -> `200`.
- API ping: `GET http://127.0.0.1:8080/v1/ping` -> `200`.
- API health: `GET http://127.0.0.1:8080/v1/health/system` -> `200`.
- Worker health: `GET http://127.0.0.1:8080/v1/health/workers` -> `200`.
- Health pack (`npm run smoke:health`): `7/7` checks com sucesso.
- OpenAPI smoke (`npm run smoke:openapi`): sucesso (`openapi.yaml` e `openapi.json` -> `200`).

### Status operacional para Playwright autenticado

- Backend (postgres + api + worker): operacional.
- Frontend: servidor Vite ativo, porem com erros de compilacao em rotas-chave durante boot/HMR:
  - `frontend/src/views/DashboardView.vue` (`Element is missing end tag`)
  - `frontend/src/views/ManifestDetailView.vue` (`Element is missing end tag`)
  - `frontend/src/views/SessionAccountView.vue` (`Element is missing end tag`)

### Decisao da fase

```yaml
localhost_availability:
  work_id: "frontend-authenticated-playwright-hardening"
  ready_for_qa: false
  rationale:
    - "infra e backend saudaveis"
    - "frontend sobe em 5174, mas com erro de template em views criticas"
    - "navegacao completa autenticada via Playwright pode falhar nessas rotas"
```

## Fechamento da cadeia (fase 10-documentation-final)

```yaml
orchestration_closure:
  work_id: "frontend-authenticated-playwright-hardening"
  chain_status: "concluida"
  phases_completed:
    - "localhost-availability"
    - "06-frontend-ux"
    - "09-qa-validation"
    - "10-documentation-final"
  qa_passed: true
  fixes_required: false
  residual_risk: "low"
  evidence_path: "artifacts/frontend-authenticated-playwright-hardening/"
```
