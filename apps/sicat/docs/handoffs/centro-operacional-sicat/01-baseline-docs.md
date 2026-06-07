# 01 — Baseline Documental — Centro Operacional SICAT

## Objetivo da fase

Garantir o baseline documental antes de qualquer implementação do
Centro Operacional SICAT:

- arquitetura conceitual publicada (Centro Operacional + Command
  Center base);
- estado atual honesto consolidado;
- visão de produto/CTO consolidada como fonte de verdade do backlog
  estratégico;
- AGENTS.md publicado para acelerar onboarding de qualquer agente;
- README.md e docs/README.md apontando para os novos artefatos;
- handoff explícito para a próxima fase.

Esta fase é estritamente documental. Nenhum código de produto,
OpenAPI, contrato gerado, teste ou frontend foi tocado.

## Arquivos analisados

- `docs/handoffs/centro-operacional-sicat/00-orchestration.md`
- `.github/copilot-instructions.md`
- `README.md`
- `docs/README.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/10-documentation-final.md`
- `docs/handoffs/sigor-sicat-gap-map/10-documentation-final.md`
- `docs/CHANGELOG-DL-020.md`
- `docs/DL-021-REORGANIZACAO-ESTRUTURA.md`
- `docs/DL-022-EVOLUCAO-PERSISTENCIA-FILA.md`
- `docs/DL-023-CORRECAO-FLUXO-IMPRIMIR-MTR.md`
- `src/routes/api-routes.ts` (mapeamento de rotas reais publicadas)
- `frontend/src/router.js` (rotas Vue reais)
- `frontend/src/views/` (views existentes)

## Decisões registradas

1. **AGENTS.md na raiz** documenta arquitetura real
   (Node/TS, fronteira route→service→repo→job→worker→gateway, exceção
   CETESB JS — DL-093, observabilidade DL-022) e referencia os
   documentos canônicos. Não duplica regras já presentes em
   `.github/copilot-instructions.md`; complementa.
2. **`docs/10-estado-atual/estado-atual.md`** é o snapshot operacional
   honesto. Marca como IMPLEMENTADO apenas o que tem evidência em
   código/OpenAPI/checkpoints; demais itens ficam como
   EM PROGRESSO/PARCIAL ou PLANEJADO.
3. **`docs/_inputs/fonte-de-verdade-backlog-cto.md`** é o snapshot
   estratégico (pilares, KPIs, gaps SIGOR x SICAT, próximas frentes:
   Centro Operacional, DMR, MTR provisório, CDF especializado,
   armazenamento temporário, configurações CETESB, Command Center).
4. **`docs/04-arquitetura/centro-operacional-sicat.md`** define a
   arquitetura alvo: módulos `operations-dashboard`, `jobs-console`,
   `audit-explorer`, `cetesb-accounts-health`, `mtr-reports`,
   `command-center`; lista os endpoints-alvo; referencia a futura
   taxonomia de status/erros operacionais como contrato a ser
   implementado na fase 04, no arquivo
   `docs/05-operacao/taxonomia-status-erros-operacionais.md`.
5. **`docs/04-arquitetura/command-center-sicat.md`** descreve apenas a
   base estrutural (registry + UI palette) e os hooks read-only.
   **Nenhuma camada de IA** é introduzida nesta etapa; nenhum endpoint
   `/v1/ai/*` é proposto.
6. **README.md e docs/README.md** atualizados com links para os
   artefatos baseline (AGENTS.md, estado-atual, backlog CTO, Centro
   Operacional, Command Center).
7. A **taxonomia de status/erros operacionais** continua sendo
   responsabilidade da fase 04 (`dashboard-observability-mtr`); este
   checkpoint apenas referencia o placeholder, não cria o documento.

## Arquivos criados

- `AGENTS.md` (raiz)
- `docs/10-estado-atual/estado-atual.md`
- `docs/_inputs/fonte-de-verdade-backlog-cto.md`
- `docs/04-arquitetura/centro-operacional-sicat.md`
- `docs/04-arquitetura/command-center-sicat.md`
- `docs/handoffs/centro-operacional-sicat/01-baseline-docs.md` (este
  arquivo)

## Arquivos alterados

- `README.md` — seção "Documentação canônica" com links para os
  novos artefatos.
- `docs/README.md` — seção "Centro Operacional SICAT" com links para
  os novos artefatos.
- `docs/handoffs/centro-operacional-sicat/00-orchestration.md` — fase
  01 marcada como concluída e `next_agent` apontando para
  `programador-backend-mtr`.

## Validações realizadas

Apenas validações documentais (a fase é baseline-only):

- leitura cruzada dos handoffs `frontend-cetesb-flows-hardening` e
  `sigor-sicat-gap-map` para evitar afirmações sem evidência;
- verificação de rotas reais em `src/routes/api-routes.ts` para a
  seção IMPLEMENTADO do estado-atual;
- verificação de views reais em `frontend/src/router.js` para a
  seção IMPLEMENTADO do estado-atual;
- verificação dos decision logs DL-020/DL-021/DL-022/DL-023 para
  fundamentar as descrições de persistência, fila, organização e
  correções recentes.

Não foram executados testes de código, smokes, typecheck, build ou
linters nesta fase. Esses passos pertencem à fase 07
(`tester-qa-mtr`).

## Status

Fase 01-baseline-docs: **concluída**.

## Itens pendentes ou explicitamente não cobertos

- `docs/05-operacao/taxonomia-status-erros-operacionais.md`:
  PENDENTE — responsabilidade da fase 04
  (`dashboard-observability-mtr`).
- Implementação dos endpoints
  `/v1/operations/overview`, `/v1/jobs/search`,
  `/v1/jobs/:id/retry`, `/v1/audit/search`,
  `/v1/cetesb/accounts/health`, `/v1/cetesb/sessions/health`,
  `/v1/reports/mtrs[, /export]`: PENDENTE — responsabilidade da fase
  02 (`programador-backend-mtr`).
- Implementação dos módulos Vue do Centro Operacional: PENDENTE —
  responsabilidade da fase 05 (`frontend-vue-ux-mtr`).

## Handoff explícito

`next_agent`: **programador-backend-mtr**
`next_phase`: **02-backend-contracts**
`work_id`: **centro-operacional-sicat**
`checkpoint a produzir`:
`docs/handoffs/centro-operacional-sicat/03-backend-contracts.md`
(numeração consistente com os checkpoints genéricos do agente
documentador-mtr).

### Prompt sugerido para o próximo agente

```text
work_id: centro-operacional-sicat
fase: 02-backend-contracts
checkpoint mestre: docs/handoffs/centro-operacional-sicat/00-orchestration.md
baseline documental: docs/handoffs/centro-operacional-sicat/01-baseline-docs.md

CONTEXTO
A baseline documental do Centro Operacional SICAT está publicada:
- AGENTS.md
- docs/10-estado-atual/estado-atual.md
- docs/_inputs/fonte-de-verdade-backlog-cto.md
- docs/04-arquitetura/centro-operacional-sicat.md
- docs/04-arquitetura/command-center-sicat.md

ENTREGÁVEIS DESTA FASE
1. Implementar/consolidar no contrato OpenAPI e em src/routes + src/services
   + src/repositories os endpoints abaixo, preservando a fronteira
   route → service → repository → job → worker → gateway:
   - GET /v1/operations/overview            (read-only, agregação consolidada)
   - GET /v1/jobs/search                    (read-only, paginado)
   - GET /v1/jobs/:id/events                (consolidar contrato existente)
   - POST /v1/jobs/:id/retry                (assíncrono, 202, idempotente)
   - GET /v1/audit/search                   (read-only, paginado)
   - GET /v1/audit/:correlationId           (consolidar contrato existente)
   - GET /v1/cetesb/accounts/health         (read-only)
   - GET /v1/cetesb/sessions/health         (read-only)
   - GET /v1/reports/mtrs                   (read-only, paginado, filtros)
   - GET /v1/reports/mtrs/export            (decidir sync vs 202; documentar)
2. Atualizar lockstep:
   - openapi/mtr_automacao_openapi_interna.yaml
   - examples/<request|response>.json
   - src/generated/operations.ts (npm run gen:operations)
   - src/routes/api-routes.ts
   - src/services/* (orquestração, idempotência, enqueue de retry)
   - testes de contrato em tests/contract/
3. Preservar correlationId, jobId, commandId, sessionContextId,
   integrationAccountId entre camadas. Erros como application/problem+json.
4. NÃO tocar no gateway CETESB (src/gateways/cetesb-gateway.js) salvo se
   for estritamente necessário para health de sessões — neste caso, justificar
   no checkpoint.
5. Criar checkpoint docs/handoffs/centro-operacional-sicat/03-backend-contracts.md
   com: objetivo, arquivos analisados, decisões, arquivos alterados,
   validações (npm run validate:openapi, npm run typecheck, npm run test:contract,
   npm run test:api), itens pendentes e handoff para postgres-queue-mtr
   (fase 03-persistence-queue).

REGRAS
- Não marque nada como IMPLEMENTADO sem evidência (testes verdes ou smoke).
- Não invente endpoint /v1/ai/* nesta fase.
- Se alguma decisão precisar mudar a taxonomia/labels, registrar no checkpoint
  e sinalizar dependência para a fase 04.
```

Caso o runtime não consiga invocar `programador-backend-mtr`,
devolver `next_agent_required: programador-backend-mtr` com o prompt
acima como payload.
