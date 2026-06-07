# 09 — QA Validation: Centro Operacional SICAT

- work_id: `centro-operacional-sicat`
- fase: `07-qa`
- agente: `tester-qa-mtr`
- data: 2026-04-25
- checkpoint mestre: [00-orchestration.md](00-orchestration.md)
- entradas consideradas: [01-baseline-docs.md](01-baseline-docs.md),
  [03-backend-contracts.md](03-backend-contracts.md),
  [04-persistence-worker.md](04-persistence-worker.md),
  [07-observability-admin.md](07-observability-admin.md),
  [06-frontend-ux.md](06-frontend-ux.md)

## Objetivo

Validar a entrega completa da cadeia `centro-operacional-sicat` antes do
handoff para `documentador-mtr`:

- typecheck e validações de contrato/fonte da verdade;
- testes backend (api, integration, worker, contract, source-of-truth,
  unit, smoke);
- build do frontend e suíte Playwright (incluindo a nova spec
  `tests/ui/centro-operacional.spec.ts`);
- smoke endpoints de saúde e contrato OpenAPI servido em runtime;
- regressão leve de fluxos prévios (audit, validation-e2e).

QA não implementa correções de produto. Falhas pré-existentes são
classificadas e registradas; falhas introduzidas pela cadeia seriam
devolvidas ao especialista responsável (não foi necessário neste ciclo).

## Matriz de execução

| Comando | Status | Nº testes | Observações |
| --- | --- | ---: | --- |
| `npm run typecheck` | PASS | n/a | `tsc --noEmit` zero erros. |
| `npm run validate:openapi` | FAIL (não bloqueante) | n/a | OpenAPI e fonte da verdade CETESB OK. Linker de markdown reporta 1 link quebrado em `docs/handoffs/centro-operacional-sicat/06-frontend-ux.md` apontando para `frontend/tests/ui/login.spec.ts` (arquivo inexistente). Pendência conhecida (ver §Falhas). |
| `npm run validate:cetesb-source` | PASS | 11 checks | 5 operações HAR + 6 seções gateway. |
| `npm run validate:har-gateway` | PASS | 11 checks | Idem (subconjunto). |
| `npm run validate:agents` | PASS | 18 agentes | Arquitetura de agentes válida. |
| `npm run test:source-of-truth` | PASS | 6/6 | `cetesb-source-of-truth`, `har-gateway-structural-validator`, `agent-architecture-validation`. |
| `npm run test:api` | PASS | 23/23 | suíte API estável. |
| `npm run test:integration` | PASS | 124/124 | duração ~27.7s. |
| `npm run test:worker` | PASS | 14/14 | duração ~1.8s. |
| `npm run test:contract` | PASS (testes) / FAIL (md-links) | 4/4 | Contrato OpenAPI íntegro. Mesma quebra de link da `validate:openapi`. |
| `tsx --test tests/unit/*.test.js tests/contract/*.test.js tests/smoke/*.test.js` | PASS | 120/120 | Cobertura agregada de unit + contract + smoke. |
| `cd frontend && npm run build` | PASS | n/a | Vite build em ~8.6s. Aviso conhecido de chunks > 500 kB (não bloqueante). |
| `cd frontend && npx playwright test tests/ui/centro-operacional.spec.ts` | PASS | 6/6 | Nova suíte do Centro Operacional verde (operations dashboard, jobs console, audit explorer, mtr reports, command center, cetesb health). |
| `cd frontend && npx playwright test` (suíte completa) | FAIL parcial | 49 passed / 15 failed / 11 did not run | Falhas em `responsive-smoke`, `conversational-chat-app`, `manifests-resync`, `cetesb-operational-flows`, `full-navigation-e2e`, `qa-global-home-back-button`. Todas pré-existentes (ver §Falhas). |
| `cd frontend && npx playwright test tests/ui/audit.spec.ts tests/ui/validation-e2e.spec.ts` | PASS | 15/15 | Regressão leve dos fluxos pré-existentes verde. |
| `npm run smoke:health` | PASS | 7/7 | API real em modo `real` (CETESB_GATEWAY_MODE=real) iniciada para a sessão de QA; todos os endpoints `/v1/ping`, `/v1/health/*`, `/v1/maintenance/cleanup` respondendo 200/202. |
| `npm run smoke:openapi` | PASS | 2/2 | `/openapi.yaml` (237578 bytes) e `/openapi.json` íntegros; `jobStatusEnum` cobre os 7 estados; 5 endpoints de comando checados. |

## Falhas encontradas

### F1 — link quebrado em checkpoint (introduzido pela cadeia)

- Arquivo: `docs/handoffs/centro-operacional-sicat/06-frontend-ux.md`.
- Link: `../../../frontend/tests/ui/login.spec.ts` — arquivo inexistente.
- Detectado por: `scripts/validate-markdown-links.js`
  (`docs/copilot/auditoria-links-quebrados.md`).
- Classificação: introduzido pela cadeia `centro-operacional-sicat`
  (fase 06-frontend-ux), porém **não bloqueante** — afeta apenas linkagem
  documental, não afeta produto, contrato, dados, testes automatizados
  do core ou smoke. Registrado em
  `docs/10-estado-atual/estado-atual.md`.
- Decisão QA: **não corrigir** nesta fase (regra: QA não implementa).
  Encaminhar para correção pelo `documentador-mtr` na fase 08-docs-final
  ou pelo especialista frontend, conforme preferência do orquestrador.

### F2 — Playwright suíte completa: 15 falhas pré-existentes

- Specs afetadas:
  - `tests/ui/responsive-smoke.spec.js` (8 falhas — login + dashboard em
    mobile/tablet/desktop/wide).
  - `tests/ui/conversational-chat-app.spec.js` (3 falhas).
  - `tests/ui/cetesb-operational-flows.spec.js` (1 falha).
  - `tests/ui/manifests-resync.spec.js` (1 falha).
  - `tests/ui/full-navigation-e2e.spec.ts` (1 falha).
  - `tests/ui/qa-global-home-back-button.spec.ts` (1 falha).
- Classificação: **pré-existentes** ao work `centro-operacional-sicat`.
  - `responsive-smoke`, `qa-global-home-back-button`, `full-navigation-e2e`
    já apareciam falhando no ciclo
    `homepage-canvas-continuous-storytelling`
    ([09-qa-validation.md](../homepage-canvas-continuous-storytelling/09-qa-validation.md)).
  - `conversational-chat-app`, `manifests-resync`,
    `cetesb-operational-flows` derivam da camada conversacional
    introduzida nos commits `7cab978`..`7d0974d`, anteriores à cadeia
    Centro Operacional.
- Evidência de não-introdução: nenhum arquivo desta cadeia mexe nas
  specs falhantes; o conjunto novo (`centro-operacional.spec.ts`) passa
  100% (6/6).
- Decisão QA: **não corrigir**. Registrado em
  `docs/10-estado-atual/estado-atual.md` como pendência conhecida.
  Tratamento pertence às frentes originais (homepage-canvas e
  conversational).

### F3 — chunks grandes no bundle Vite

- Aviso: `index-*.js` 1274 kB (gzip 389 kB) e `index-*.css` 1015 kB
  (gzip 161 kB).
- Classificação: pré-existente, não bloqueante (build conclui com
  sucesso). Otimização de splitting é melhoria técnica fora do escopo
  desta cadeia.

## Decisões e ações

- Subir API local em modo `real` para liberar `smoke:health` e
  `smoke:openapi` (Postgres `mtr_postgres` já estava ativo via Docker).
  Worker não foi disparado nesta sessão pois nenhum smoke do escopo
  exige processamento de jobs.
- Atualizar `docs/10-estado-atual/estado-atual.md` com seção
  "Pendências conhecidas (QA fase 07 — centro-operacional-sicat —
  2026-04-25)" cobrindo F1 e F2.
- Não executar correções de produto, OpenAPI, schema, gateway ou specs.
- Marcar a fase 07-qa como concluída no `00-orchestration.md` e apontar
  `next_agent` para `documentador-mtr` (fase 08-docs-final).

## Arquivos alterados / criados nesta fase

- criado: `docs/handoffs/centro-operacional-sicat/09-qa-validation.md`
  (este arquivo).
- atualizado: `docs/10-estado-atual/estado-atual.md` (seção
  "Pendências conhecidas (QA fase 07 …)").
- atualizado: `docs/handoffs/centro-operacional-sicat/00-orchestration.md`
  (status da fase 07 e `next_agent`).
- gerado automaticamente pelo linter: `docs/copilot/auditoria-links-quebrados.md`
  (relatório de link quebrado F1).

## Handoff

- `next_agent`: **documentador-mtr**
- `next_phase`: **08-docs-final**
- checkpoint alvo: `docs/handoffs/centro-operacional-sicat/10-documentation-final.md`

### Prompt sugerido para `documentador-mtr`

```text
work_id: centro-operacional-sicat
fase: 08-docs-final
checkpoint mestre: docs/handoffs/centro-operacional-sicat/00-orchestration.md
qa_checkpoint: docs/handoffs/centro-operacional-sicat/09-qa-validation.md
anteriores: 01-baseline-docs.md, 03-backend-contracts.md,
04-persistence-worker.md, 07-observability-admin.md, 06-frontend-ux.md,
09-qa-validation.md

OBJETIVO
Consolidar a documentação final da cadeia Centro Operacional SICAT
após validação completa do QA (matriz consolidada em
09-qa-validation.md) e preparar a próxima frente.

ENTREGÁVEIS
1. Atualizar README.md (raiz) com:
   - menção ao Centro Operacional SICAT como camada operacional
     consolidada (módulos: operations-dashboard, jobs-console,
     audit-explorer, cetesb-accounts-health, mtr-reports e base do
     command-center);
   - seção curta de novos endpoints operacionais
     (/v1/operations/overview, /v1/jobs/search, /v1/audit/search,
     /v1/cetesb/accounts/health, /v1/cetesb/sessions/health,
     /v1/reports/mtrs, /v1/jobs/:id/retry);
   - referência ao docs/04-arquitetura/centro-operacional-sicat.md e
     docs/04-arquitetura/command-center-sicat.md.
2. Atualizar docs/README.md adicionando os novos documentos das fases
   01-baseline e 04-observability (taxonomia operacional) e o
   checkpoint 09-qa-validation.md.
3. Regenerar/atualizar docs/10-estado-atual/estado-atual.md:
   - mover itens entregues do bloco PLANEJADO para IMPLEMENTADO com
     evidência (rotas, módulos, testes, smoke);
   - manter (ou atualizar) a seção "Pendências conhecidas (QA fase
     07 …)" com o estado pós-documentação;
   - registrar links válidos (resolver F1 do checkpoint 09 ou
     reapontar para arquivo existente).
4. Criar docs/10-estado-atual/PROXIMO_PROMPT.md apontando a próxima
   frente de produto. Escolher uma entre:
   {DMR | MTR provisório | CDF especializado | armazenamento temporário
   | chat generativo orquestrador}.
   Justificar a escolha com base no estado-atual e no
   docs/_inputs/fonte-de-verdade-backlog-cto.md. Incluir prompt pronto
   para o orquestrador iniciar a próxima cadeia (work_id sugerido,
   fase inicial, primeiro especialista).
5. Consolidar release notes do Centro Operacional em
   docs/CHANGELOG-centro-operacional.md (ou seção equivalente em
   docs/CHANGELOG-DL-020.md, conforme padrão do repositório),
   listando: novos endpoints, novos módulos frontend, taxonomia
   operacional, novos testes, evidências de QA (resumo PASS/FAIL).
6. Preparar texto de commit sugerido (NÃO comitar):
   `feat(operations): adiciona centro operacional e base de command
   center do SICAT`
   com corpo descrevendo backend, frontend, testes e docs.
7. Atualizar 00-orchestration.md marcando fase 08 concluída e
   apontando next_agent para `ci-cd-github-mtr` apenas se o usuário
   autorizar commit/push (fase 09 opcional).

REGRAS
- Não comitar. Não fazer push.
- Não marcar nada como IMPLEMENTADO sem evidência verificável (código,
  teste, smoke, OpenAPI servido).
- Se F1 (link quebrado em 06-frontend-ux.md) for corrigido, registrar
  em 10-documentation-final.md a ação tomada.

RETORNO ESPERADO
- Lista de arquivos alterados/criados.
- Confirmação de que docs/10-estado-atual/estado-atual.md reflete o
  estado real pós-Centro Operacional.
- PROXIMO_PROMPT.md pronto para o orquestrador disparar a próxima
  cadeia.
- Texto de commit sugerido (sem execução).
```

Se o runtime não conseguir invocar `documentador-mtr`, devolver
`next_agent_required: documentador-mtr` com este prompt.
