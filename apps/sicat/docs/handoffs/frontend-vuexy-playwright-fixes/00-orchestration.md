# 00-orchestration

## Demanda resumida
Subir ambiente local completo (API + worker + frontend), navegar telas via Playwright e corrigir regressões da refatoracao Vuexy/Vuetify no frontend.

## Classificacao
```yaml
orchestration:
  work_id: "frontend-vuexy-playwright-fixes"
  intent: "fix"
  complexity: "complex"
  domains:
    - "frontend-ux"
    - "qa"
    - "observability-admin"
  first_agent: "estrutura-vscode-mtr"
  phase_sequence:
    - phase: "localhost-availability"
      agent: "estrutura-vscode-mtr"
      required: true
      reason: "subir stack completa para validacao navegavel e execucao do Playwright"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "executar navegacao Playwright e levantar regressos da refatoracao"
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "corrigir problemas encontrados no QA Playwright"
    - phase: "09-qa-validation-rerun"
      agent: "tester-qa-mtr"
      required: true
      reason: "revalidar fluxo apos correcoes"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar evidencias, status e handoff final"
```

## Criterios de pronto
- Stack local ativa: postgres, api, worker, frontend.
- Navegacao Playwright executada nas telas principais afetadas pela refatoracao.
- Defeitos corrigidos no frontend e revalidados.
- Checkpoints de fase preenchidos no diretorio deste work_id.

## Checkpoints esperados
- `01-source-validation.md` (nao aplicavel, sem HAR novo)
- `06-frontend-ux.md`
- `09-qa-validation.md`
- `10-documentation-final.md`

## Fase localhost-availability (2026-04-21)

### Execucao realizada
- Tentativa inicial via task agregada `workflow: dev (real-dev)` falhou no runner deste ambiente (`no terminal was found`).
- Fluxo equivalente executado por comandos operacionais do workspace:
  - `pwsh -ExecutionPolicy Bypass -File scripts/restart-stack-vscode.ps1`
  - `docker compose up -d postgres`
  - `npm run migrate`
  - `npm run validate:openapi`
  - API: `CETESB_GATEWAY_MODE=real npm run dev` (background)
  - Worker: `CETESB_GATEWAY_MODE=real npm run worker` (background)
  - Frontend: `VITE_API_BASE_URL=http://127.0.0.1:8080 npm run dev -- --host 127.0.0.1 --port 5174` (background)

### Status da stack
- Postgres: ativo em container `mtr_postgres` (porta 5432).
- API backend: ativa e escutando em 8080.
- Worker: ativo e registrado (health workers com sucesso).
- Frontend: ativo e respondendo em 5174.

### Validacoes operacionais
- `npm run smoke:health`: 7/7 testes passaram.
- `npm run smoke:openapi`: passou (`/openapi.yaml` e `/openapi.json` com status 200).
- `GET http://127.0.0.1:5174`: status 200.

### URLs prontas
- API base: `http://127.0.0.1:8080`
- API health: `http://127.0.0.1:8080/v1/health/system`
- OpenAPI JSON: `http://127.0.0.1:8080/openapi.json`
- Frontend: `http://127.0.0.1:5174/`

### Bloqueios
- Sem bloqueio impeditivo para QA.
- Observacao operacional: task agregada do VS Code nao iniciou no runner local; uso de comandos equivalentes desbloqueou a subida completa da stack.

### Resultado da fase
- ready_for_qa: true

## Encerramento da cadeia (fase 10)

### Status final
- chain_status: concluida
- work_id: frontend-vuexy-playwright-fixes
- fase_final: 10-documentation-final
- qa_passed_final: true

### Sequencia executada
1. localhost-availability: concluida (stack pronta para navegacao e QA).
2. 09-qa-validation: concluida com falha inicial (3 regressos criticos de compilacao SFC).
3. 06-frontend-ux: concluida (correcoes aplicadas nas 3 views quebradas).
4. 09-qa-validation-rerun: concluida e aprovada (sem bloqueios).
5. 10-documentation-final: concluida (consolidacao documental e fechamento).

### Checkpoints finais
- 06-frontend-ux.md: concluido
- 09-qa-validation.md: concluido (inclui rerun aprovado)
- 10-documentation-final.md: concluido
