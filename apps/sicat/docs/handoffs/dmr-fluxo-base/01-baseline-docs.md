# 01 — Baseline Documental — DMR (cadeia `dmr-fluxo-base`)

## Objetivo da fase

Produzir o baseline documental que vai dirigir as fases 02–09 da cadeia
[dmr-fluxo-base](00-orchestration.md), sem implementar código de
produto. Mapear evidência CETESB existente, identificar lacunas e
publicar a arquitetura alvo da DMR (Declaração de Movimentação de
Resíduos).

Esta fase é estritamente documental.

## Arquivos analisados

- [docs/handoffs/dmr-fluxo-base/00-orchestration.md](00-orchestration.md)
- [docs/_inputs/fonte-de-verdade-backlog-cto.md](../../_inputs/fonte-de-verdade-backlog-cto.md)
  (§4.4 gap, §5 Frente 2, §6 critérios de priorização)
- [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
  (§2 escolha DMR, §3 prompt original)
- [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
- [docs/04-arquitetura/centro-operacional-sicat.md](../../04-arquitetura/centro-operacional-sicat.md)
  (padrão arquitetural a reproduzir)
- [docs/05-operacao/taxonomia-status-erros-operacionais.md](../../05-operacao/taxonomia-status-erros-operacionais.md)
- [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  (espelho TS dos 13 estados canônicos)
- [docs/cetesb/](../../cetesb/) — inventário completo de HARs (8 arquivos
  + README)
- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  (estrutura do gateway para planejar bloco DMR)
- [docs/handoffs/centro-operacional-sicat/01-baseline-docs.md](../centro-operacional-sicat/01-baseline-docs.md)
  (referência de formato e profundidade do baseline)
- [AGENTS.md](../../../AGENTS.md) e
  [.github/copilot-instructions.md](../../../.github/copilot-instructions.md)
  (fronteira route → service → repository → job → worker → gateway)

## Decisões registradas

1. **Tabela própria** `dmr_declarations` + `dmr_declaration_items` em
   vez de reutilizar `manifests`. Ciclo de vida declaratório é distinto
   do transacional e fundir comprometeria índices/constraints DL-022.
2. **Reuso da fila DL-022**: novo `operation_type = 'dmr.submit'` em
   `jobs`, sem alterar schema da tabela `jobs` nem suas 5 constraints.
3. **Módulo gateway DMR isolado** dentro de
   `src/gateways/cetesb-gateway.js` (única exceção JS — DL-093). Nenhum
   endpoint hardcoded fora do gateway.
4. **Mapeamento à taxonomia operacional** já consolidada (13 estados
   canônicos). DMR introduz status físicos próprios mas não inventa
   bucket novo na taxonomia — apenas estende o mapeamento em
   [src/lib/operational-status.ts](../../../src/lib/operational-status.ts).
5. **Comando assíncrono `202` + `command-accepted`** apenas para
   `POST /v1/dmr/:id/submit` (operação que toca a CETESB). Demais
   operações (CRUD de rascunho, consolidação local) são síncronas.
6. **Idempotência via `Idempotency-Key`** obrigatória em
   `/v1/dmr/:id/submit` (replay via
   [src/services/idempotency-service.ts](../../../src/services/idempotency-service.ts)).
7. **Lacuna HAR DMR**: nenhum HAR de DMR existe em `docs/cetesb/`.
   Tratada como **bloqueio explícito da fase 03** e endereçada à fase
   02 (`validador-cetesb-mtr`) com lista mínima de 4–5 HARs a capturar
   ([docs/04-arquitetura/dmr-sicat.md §5](../../04-arquitetura/dmr-sicat.md#5-mapeamento-contra-evid%C3%AAncia-cetesb)).
8. **Lockstep mapeado** por fase em
   [docs/04-arquitetura/dmr-sicat.md §6](../../04-arquitetura/dmr-sicat.md#6-lockstep-artefatos-a-tocar-nas-fases-posteriores):
   OpenAPI, examples, `operations.ts`, rotas, services, repositórios,
   migrations, worker handler, frontend e testes.

## Arquivos criados

- [docs/04-arquitetura/dmr-sicat.md](../../04-arquitetura/dmr-sicat.md)
  — arquitetura alvo, esquema de dados, fluxos críticos (com diagrama
  Mermaid), mapeamento de evidência CETESB, lockstep por fase, riscos e
  critérios de pronto.
- [docs/handoffs/dmr-fluxo-base/01-baseline-docs.md](01-baseline-docs.md)
  (este arquivo).

## Arquivos alterados

- [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
  — DMR adicionada como pilar/frente em §3 EM PROGRESSO, citando esta
  cadeia e o checkpoint 00-orchestration.
- [docs/handoffs/dmr-fluxo-base/00-orchestration.md](00-orchestration.md)
  §6 — fase 01 marcada como CONCLUÍDA, fase 02 como ATIVA.

## Validações realizadas

A fase é baseline-only. Validações executadas:

- inventário cruzado de [docs/cetesb/](../../cetesb/) confirmando
  ausência de HAR DMR (8 HARs presentes, todos transacionais MTR/CDF /
  cadastro / login).
- conferência da fronteira arquitetural contra
  [src/routes/api-routes.ts](../../../src/routes/api-routes.ts),
  [src/services/manifest-service.ts](../../../src/services/manifest-service.ts),
  [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
  e [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js).
- conferência da taxonomia operacional canônica contra
  [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  (13 estados, 5 buckets) — mapeamento DMR proposto não inventa estado
  novo.
- execução de `npm run validate:md-links` para garantir zero links
  quebrados nos arquivos criados/alterados — **resultado: ver §Validação
  de links abaixo**.

Não foram executados testes de código, smokes, typecheck ou build —
pertencem à fase 08-qa-validation.

### Validação de links

`npm run validate:md-links` executado ao final da fase. Resultado
registrado no console pelo agente.

## Status

Fase 01-baseline-docs: **concluída**.

## Itens pendentes ou explicitamente não cobertos

- **HAR DMR** (5 capturas mínimas) — responsabilidade da fase
  02-source-validation (`validador-cetesb-mtr`).
- OpenAPI, examples, `operations.ts`, rotas, services, repos,
  migrations, worker, frontend, testes — responsabilidades das fases
  03 a 08.
- Atualização final de `estado-atual.md` (DMR como IMPLEMENTADO) e
  novo `PROXIMO_PROMPT.md` — responsabilidade da fase 09-docs-final.

## Handoff para a fase 02 (`validador-cetesb-mtr`)

**Próximo agente**: `validador-cetesb-mtr`.
**Próxima fase**: `02-source-validation`.
**Próximo checkpoint**: `docs/handoffs/dmr-fluxo-base/02-source-validation.md`.

### Entregas obrigatórias da fase 02

1. Capturar e versionar em [docs/cetesb/](../../cetesb/) os HARs DMR
   listados em
   [docs/04-arquitetura/dmr-sicat.md §5](../../04-arquitetura/dmr-sicat.md#5-mapeamento-contra-evid%C3%AAncia-cetesb):
   - `mtr.cetesb.sp.gov.br_listar_dmr.har`
   - `mtr.cetesb.sp.gov.br_consolidar_dmr.har` (se a CETESB expuser
     endpoint próprio)
   - `mtr.cetesb.sp.gov.br_enviar_dmr.har`
   - `mtr.cetesb.sp.gov.br_consultar_dmr.har`
   - `mtr.cetesb.sp.gov.br_baixar_dmr.har` (opcional)
2. Atualizar [docs/cetesb/README.md](../../cetesb/README.md) com o novo
   inventário.
3. Validar contra estrutura esperada do gateway (script
   `npm run validate:har-gateway`).
4. Espelhar payloads canônicos em
   [tests/unit/cetesb-source-of-truth.test.js](../../../tests/unit/cetesb-source-of-truth.test.js)
   onde já houver contrato a fixar.
5. Registrar no checkpoint 02 quais campos da §3 (esquema de dados)
   foram confirmados pelo HAR e quais permanecem suposição (R2/R3/R4
   da §7 do baseline).

### Bloqueios e riscos a comunicar

- Fase 03 não pode iniciar sem o pacote HAR DMR.
- Caso a CETESB não exponha endpoint dedicado de consolidação, fase 04
  deve absorver a consolidação 100% no `dmr-service` (a partir de MTRs
  locais), sem chamar a CETESB nesse passo.

### Prompt sugerido para o próximo agente

```text
work_id: dmr-fluxo-base
fase: 02-source-validation
agente: validador-cetesb-mtr

Capture e valide a evidência CETESB DMR conforme listado em
docs/04-arquitetura/dmr-sicat.md §5 e em
docs/handoffs/dmr-fluxo-base/01-baseline-docs.md §"Handoff para a fase 02".

Mínimo: 4 HARs DMR em docs/cetesb/, README de cetesb atualizado,
validate:har-gateway verde, checkpoint
docs/handoffs/dmr-fluxo-base/02-source-validation.md publicado, e
00-orchestration.md §6 atualizado (fase 02 concluída, fase 03 ativa).
```
