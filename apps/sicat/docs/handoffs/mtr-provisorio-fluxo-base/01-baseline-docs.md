# 01 — Baseline Documental — MTR provisório (cadeia `mtr-provisorio-fluxo-base`)

## Objetivo da fase

Produzir o baseline documental que vai dirigir as fases 02–09 da cadeia
[mtr-provisorio-fluxo-base](00-orchestration.md), sem implementar
código de produto. Mapear evidência CETESB existente, identificar
lacunas e publicar a arquitetura alvo do MTR provisório (Frente 3 do
backlog CTO).

Esta fase é estritamente documental.

## Arquivos analisados

- [docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md](00-orchestration.md)
- [docs/_inputs/fonte-de-verdade-backlog-cto.md](../../_inputs/fonte-de-verdade-backlog-cto.md)
  (§4.4 gap, §5 Frente 3)
- [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
  (§2 escolha MTR provisório, §3 prompt original)
- [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
- [docs/04-arquitetura/dmr-sicat.md](../../04-arquitetura/dmr-sicat.md)
  (referência editorial e estrutural)
- [docs/handoffs/dmr-fluxo-base/01-baseline-docs.md](../dmr-fluxo-base/01-baseline-docs.md)
  (template de baseline-docs)
- [docs/cetesb/](../../cetesb/) — inventário completo (8 HARs + README)
- [docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har)
  — evidência direta de discriminador (`tipoManifesto`,
  `mtrProvisorioNumero`) e endpoint
  `/api/mtr/manifesto/provisorio/{parCodigo}/{flag}`
- [docs/cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har)
  — listagem unificada com `mtrProvisorioNumero` e
  `mtrProvisorioDataRecebimento`
- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  (estrutura para planejar bloco MTR provisório)
- [src/routes/api-routes.ts](../../../src/routes/api-routes.ts) e
  [src/services/manifest-service.ts](../../../src/services/manifest-service.ts)
  (padrão a reaproveitar)
- [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  (espelho TS dos 13 estados canônicos)
- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
  (superfície atual de `/v1/manifestos`)
- [AGENTS.md](../../../AGENTS.md) e
  [.github/copilot-instructions.md](../../../.github/copilot-instructions.md)
  (fronteira `route → service → repository → job → worker → gateway`)

## Decisões registradas

1. **Reuso da tabela `manifests`** com discriminador tipado `kind`
   (default `'definitivo'`) em vez de tabela própria
   `manifests_provisorios`. MTR provisório é a mesma entidade
   transacional com variante de ciclo, diferente do caso DMR
   (declaratório, justificou tabela própria).
2. **Reuso da fila DL-022 sem novo `operation_type`**:
   `manifest.submit` e `manifest.print` ramificam por `payload.kind`,
   sem alterar schema da tabela `jobs` nem suas 5 constraints.
3. **Reuso do worker e dos handlers existentes**: nenhuma rota nova de
   worker; ramificação interna no handler em
   [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts).
4. **Bloco MTR provisório isolado dentro de
   [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)**
   (única exceção JS — DL-093). Nenhum endpoint hardcoded fora do
   gateway.
5. **Mapeamento à taxonomia operacional já consolidada** (13 estados
   canônicos). MTR provisório não inventa estado novo; reaproveita o
   mapeamento existente em
   [src/lib/operational-status.ts](../../../src/lib/operational-status.ts).
6. **Comandos assíncronos `202` + `command-accepted`** para
   `POST /v1/mtr-provisorio` (cria + submete) e
   `POST /v1/mtr-provisorio/:id/print`. Demais operações (detalhe,
   listagem, delete de rascunho) são síncronas.
7. **Idempotência via `Idempotency-Key`** obrigatória nos comandos
   assíncronos (replay via
   [src/services/idempotency-service.ts](../../../src/services/idempotency-service.ts)).
8. **Decisão arquitetural-chave — recomendação inicial**: superfície
   HTTP em **família dedicada** `/v1/mtr-provisorio/*` (Opção A em
   [docs/04-arquitetura/mtr-provisorio-sicat.md §4.4](../../04-arquitetura/mtr-provisorio-sicat.md#44-decis%C3%A3o-arquitetural-chave-a-confirmar-na-fase-04)),
   com persistência única em `manifests`. Justificativa em §4.4 do
   documento de arquitetura. **Confirmação obrigatória na fase 04**
   (`programador-backend-mtr`).
9. **Cobertura HAR atual é parcialmente suficiente**: o discriminador
   `tipoManifesto` e o endpoint
   `/api/mtr/manifesto/provisorio/{parCodigo}/{flag}` estão presentes
   em [docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har)
   e [docs/cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har).
   **Lacunas a validar pela fase 02**: request puro de criação de MTR
   provisório, request puro de impressão da variante e eventual
   detalhe dedicado. A fase 02 decide se há gap exigindo nova captura
   humana.
10. **Lockstep mapeado por fase** em
    [docs/04-arquitetura/mtr-provisorio-sicat.md §6](../../04-arquitetura/mtr-provisorio-sicat.md#6-lockstep-artefatos-a-tocar-nas-fases-posteriores):
    OpenAPI, examples, `operations.ts`, rotas, services, repositórios,
    migrations, worker handler, frontend e testes.

## Arquivos criados

- [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)
  — arquitetura alvo, esquema preliminar de persistência, fluxos
  críticos (com diagrama Mermaid), mapeamento de evidência CETESB,
  decisão arquitetural-chave (família dedicada vs flag tipada,
  recomendação inicial registrada), lockstep por fase, riscos e
  critérios de pronto.
- [docs/handoffs/mtr-provisorio-fluxo-base/01-baseline-docs.md](01-baseline-docs.md)
  (este arquivo).

## Arquivos alterados

- [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
  — MTR provisório adicionado em §3 EM PROGRESSO citando esta cadeia
  e o checkpoint 00-orchestration.
- [docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md](00-orchestration.md)
  §6 — fase 01 marcada como CONCLUÍDA, fase 02 como ATIVA.

## Validações realizadas

A fase é baseline-only. Validações executadas:

- inventário cruzado de [docs/cetesb/](../../cetesb/) confirmando que
  o discriminador `tipoManifesto` e o endpoint dedicado
  `/api/mtr/manifesto/provisorio/...` aparecem nos HARs atuais
  (`gerar_mtr` e `imprimir_mtr`); demais variantes precisam de
  veredicto da fase 02;
- conferência da fronteira arquitetural contra
  [src/routes/api-routes.ts](../../../src/routes/api-routes.ts),
  [src/services/manifest-service.ts](../../../src/services/manifest-service.ts),
  [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
  e [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js);
- conferência da taxonomia operacional canônica contra
  [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  (13 estados, 5 buckets) — mapeamento proposto não inventa estado
  novo;
- execução de `npm run validate:md-links` para garantir zero links
  quebrados nos arquivos criados/alterados — **resultado: ver
  §Validação de links abaixo**.

Não foram executados testes de código, smokes, typecheck ou build —
pertencem à fase 08-qa-validation.

### Validação de links

`npm run validate:md-links` executado ao final da fase. Resultado
registrado no relatório do agente para o orquestrador.

## Status

Fase 01-baseline-docs: **concluída**.

## Itens pendentes ou explicitamente não cobertos

- **Validação de evidência CETESB para os caminhos puros de criação e
  impressão de MTR provisório** — responsabilidade da fase
  02-source-validation (`validador-cetesb-mtr`).
- OpenAPI, examples, `operations.ts`, rotas, services, repos,
  migrations, worker handler, validador, frontend, testes —
  responsabilidades das fases 03 a 08.
- Atualização final de
  [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
  (MTR provisório como IMPLEMENTADO) e novo
  [PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md) —
  responsabilidade da fase 09-docs-final.
- Conversão provisório → definitivo, batch operations, recebimento e
  CDF da variante provisória — fora do escopo desta cadeia base.

## Handoff para a fase 02 (`validador-cetesb-mtr`)

**Próximo agente**: `validador-cetesb-mtr`.
**Próxima fase**: `02-source-validation`.
**Próximo checkpoint**: `docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md`.

### Entregas obrigatórias da fase 02

1. **Inventário evidencial** dos HARs existentes em
   [docs/cetesb/](../../cetesb/) com veredicto explícito por
   operação MTR provisório (cadastro, listagem, detalhe, impressão):
   - quais campos do esquema §3.1 de
     [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md#3-esquema-preliminar-de-persist%C3%AAncia)
     estão **confirmados** pelo HAR atual;
   - quais permanecem **suposição** (riscos R1 e R2 da §7).
2. **Decisão sobre captura humana adicional**: a fase 02 deve declarar
   formalmente se os HARs atuais bastam para a fase 03 ou se há
   necessidade de capturar requests/respostas dedicados. Mínimo
   sugerido (caso decida-se pela captura):
   - `mtr.cetesb.sp.gov.br_gerar_mtr_provisorio.har` — request puro
     de criação de MTR provisório (operador clicando "novo MTR
     provisório" no portal CETESB);
   - `mtr.cetesb.sp.gov.br_imprimir_mtr_provisorio.har` — request
     puro de impressão da variante, se diferir do MTR comum;
   - (opcional) `mtr.cetesb.sp.gov.br_listar_mtr_provisorio.har`
     — listagem dedicada via `/api/mtr/manifesto/provisorio/...`.
3. **Atualização de [docs/cetesb/README.md](../../cetesb/README.md)**
   se houver novas capturas, com inventário consolidado.
4. **Validação contra estrutura esperada do gateway** via
   `npm run validate:har-gateway` (se aplicável aos HARs atuais).
5. **Espelho de payloads canônicos** em
   [tests/unit/cetesb-source-of-truth.test.js](../../../tests/unit/cetesb-source-of-truth.test.js)
   onde já houver contrato a fixar (campos
   `tipoManifesto`, `mtrProvisorioNumero`,
   `mtrProvisorioDataRecebimento`).
6. **Veredicto sobre a recomendação §4.4**: à luz da evidência
   consolidada, confirmar (ou apontar reservas) se a Opção A
   (família dedicada `/v1/mtr-provisorio/*`) deve ser adotada na
   fase 04.

### Bloqueios e riscos a comunicar

- Fase 03 não deve iniciar sem veredicto formal sobre suficiência da
  evidência HAR. Se a fase 02 indicar que os HARs atuais bastam, a
  fase 03 prossegue; caso contrário, abre-se janela humana de
  captura antes de continuar.
- Se a CETESB exigir endpoint distinto para criação ou impressão de
  MTR provisório, o gateway (fase 03) precisa modelar isso como bloco
  isolado dentro de
  [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js).

### Prompt sugerido para o próximo agente

```text
work_id: mtr-provisorio-fluxo-base
fase: 02-source-validation
agente: validador-cetesb-mtr

Valide a evidência CETESB para o fluxo base de MTR provisório
(cadastro, listagem, detalhe, impressão) usando os HARs existentes
em docs/cetesb/ — em especial gerar_mtr.har e imprimir_mtr.har —
conforme baseline em
docs/04-arquitetura/mtr-provisorio-sicat.md §5 e em
docs/handoffs/mtr-provisorio-fluxo-base/01-baseline-docs.md
§"Handoff para a fase 02".

Saídas obrigatórias:
- veredicto formal por operação (cadastro/listagem/detalhe/impressão)
  declarando o que está confirmado vs em suposição;
- decisão explícita sobre necessidade (ou não) de nova captura HAR
  humana, com lista mínima de capturas se houver gap;
- (se houver capturas novas) atualização de docs/cetesb/README.md;
- espelho de payloads canônicos em
  tests/unit/cetesb-source-of-truth.test.js conforme aplicável;
- confirmação ou reservas à recomendação §4.4 do baseline (família
  dedicada /v1/mtr-provisorio/* vs flag tipada);
- checkpoint
  docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md;
- 00-orchestration.md §6 atualizado (fase 02 concluída, fase 03
  ativa).
```
