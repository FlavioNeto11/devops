# Skill: Dashboard Observability (SICAT)

## Objetivo

Guiar a evolução contínua do dashboard operacional com visão consolidada de métricas de fila, workers, latência CETESB e tendência temporal.

## Quando usar

Use esta skill quando a demanda envolver:
- consolidar métricas em `GET /v1/dashboard/overview`
- evoluir séries temporais (`/v1/health/metrics/timeline`)
- evoluir ranking de latência CETESB (`/v1/health/metrics/endpoints`)
- adicionar/ajustar snapshots em `performance_snapshots` (`dashboard.*`)
- ajustar UX de dashboard no frontend sem fragmentar consumo de dados

## Fonte de verdade técnica

- Backend de métricas:
  - `src/repositories/health-repo.js`
  - `src/routes/api-routes.js`
- Frontend dashboard:
  - `frontend/src/services/api.js`
  - `frontend/src/views/DashboardView.vue`
- Contrato/exemplos:
  - `openapi/mtr_automacao_openapi_interna.yaml`
  - `examples/get_v1_health_metrics_timeline_request.json`
  - `examples/get_v1_health_metrics_timeline_response.json`
  - `examples/get_v1_health_metrics_endpoints_request.json`
  - `examples/get_v1_health_metrics_endpoints_response.json`
  - `examples/get_v1_dashboard_overview_request.json`
  - `examples/get_v1_dashboard_overview_response.json`
- Contexto operacional:
  - `docs/copilot/04-fluxos-operacionais.md`
  - `docs/copilot/09-roadmap.md`
  - `docs/copilot/13-decision-log.md`

## Playbook de evolução

1. **Definir objetivo de observabilidade**
   - Qual pergunta operacional o dashboard precisa responder?
   - Ex.: “onde está o gargalo agora?”, “latência CETESB subiu nas últimas 24h?”

2. **Modelar dados consolidados**
   - Priorizar inclusão no `overview` em vez de multiplicar chamadas frontend.
   - Separar blocos: `health`, `performance`, `timeline`, `endpoints`, `manifestsSummary`, `latestSnapshot`.

3. **Implementar backend primeiro**
   - Repositório (`health-repo`) com funções agregadoras pequenas e testáveis.
   - Rota (`api-routes`) apenas orquestra agregação e response shape.

4. **Sincronizar contrato**
   - Atualizar OpenAPI + examples em lockstep.
   - Regenerar `src/generated/operations.js`.

5. **Atualizar frontend**
   - Consumir payload consolidado no `DashboardView.vue`.
   - Tratar estados de loading, vazio e erro de forma explícita.

6. **Registrar decisão e roadmap**
   - Atualizar `docs/copilot/13-decision-log.md` (fatos, decisões, pendências).
   - Atualizar `docs/copilot/09-roadmap.md` com avanço e próximos passos.

## Critérios de qualidade

- Coerência entre backend, frontend e contrato.
- Compatibilidade mantida quando houver consumidores legados.
- Métricas com nomenclatura estável e sem ambiguidades.
- Documentação com fatos observados, decisões e pendências separadas.

## Validação mínima

```bash
npm run validate:openapi
npm run gen:operations
npm --prefix frontend run build
npm run smoke:health
```

## Escalonamento recomendado

- Alterou SQL/locking/retry/jobs: escalar para `postgres-queue-mtr`.
- Alterou integração CETESB real: escalar para `integrador-cetesb-mtr` e/ou `validador-cetesb-mtr`.
- Alterou UX complexa multi-view: escalar para `frontend-vue-ux-mtr`.
- Fechamento documental: escalar para `documentador-mtr`.
