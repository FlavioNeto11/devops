---
title: "Arquitetura alvo — SICAT Transporte (transporte rodoviário remunerado de cargas)"
status: target-architecture
applies_to: [sicat]
updated: 2026-08-13
language: pt-BR
---

# Arquitetura alvo — SICAT Transporte

> Vertical nova de **transporte rodoviário remunerado de cargas** como bounded context separado do
> ambiental. Decisões e recusas: [DL-103](../copilot/13-decision-log.md#dl-103). Baseline
> regulatória e guia vivo: [`docs/30-transporte/`](../30-transporte/transporte-guia.md).
> Requisitos: `REQ-SICAT-0017..0031` + `REQ-SICAT-NFR-0009..0012`.

## 1. Definição funcional

O SICAT Transporte previne, valida, registra, evidencia e audita a conformidade de operações de
transporte rodoviário remunerado de cargas: RNTRC (TAC/ETC/CTC), Política Nacional de Pisos
Mínimos, CIOT, Vale-Pedágio Obrigatório, documentos fiscais (NF-e/CT-e/MDF-e), seguros
(RCTR-C/RC-DC/RC-V) e PGR. O núcleo do produto **não** é "emitir CIOT": é impedir que uma operação
avance sem saber, demonstrar e registrar por que está conforme.

**Escopo da Fase A (Onda 1):** catálogo regulatório temporal + cadastros (transportadores/veículos)
+ agregado `TransportOperation` com máquina de estados + motor de compliance com gates — **sem
nenhuma chamada externa** (ANTT/SEFAZ/provedores entram nas fases C+). **Fora da Fase A:** cálculo
de piso (B), verificação RNTRC e ciclo CIOT (C), VPO (D), fiscal (E), seguros (F), emissão (G),
Regulatory Watch (H).

## 2. Posição na fronteira arquitetural

- Camadas estritas preservadas: `route → service → repository → job → worker → gateway`.
- **Não tocar:** entidades ambientais (`manifests`, `dmr_declarations`…), gateway CETESB
  (`cetesb-gateway.js`, DL-093), fluxo MTR/CDF/DMR. O "transportador" ambiental
  (`partner_role='transportador'`) é papel do MTR de **resíduos** — falso amigo do carrier do TRC.
- Nomes do domínio novo em inglês (`carrier`, `contractor`, `shipper`, `subcontractor`,
  `consignee`, `driver`); nenhum arquivo novo com `mtr`/`manifest` no nome.
- Fase A é 100% local: **zero** job type novo, zero touch em `operation-handlers.ts`/`lib/retry.ts`/
  `command-response.ts`. Gateways novos (fases C+) nascem **em TS** (`antt-*-gateway.ts`,
  `dfe-gateway.ts`, `vpo-gateway.ts`, `insurance-gateway.ts`), instanciados no worker, com
  202/command-accepted, retry/DLQ e o padrão DL-102 (marcador de correlação + `*_unconfirmed` +
  reconciliador) para operações cuja identidade remota nasce na resposta.
- **✅ Confirmado no PR-C1**: `src/gateways/antt-rntrc-gateway.ts` é o primeiro gateway externo REAL
  e `transporte.rntrc.verify` o primeiro job type assíncrono da vertical — integração com o Portal
  de Dados Abertos da ANTT (`dados.antt.gov.br`, CKAN público). Handler do worker SEM parâmetro
  `gateway` (molde `handleWhatsAppInboundMessage`: dependências por import direto, não amplia o
  tipo inline de 14 métodos do gateway CETESB). `padrão DL-102` (marcador + reconciliador) **não**
  se aplica aqui: `lookupCarrier` é uma CONSULTA idempotente, não uma escrita remota com identidade
  incerta — não há nada para reconciliar.

## 3. Modelo de domínio e máquina de estados

Agregado central `TransportOperation` (nunca `Manifest`): partes (com snapshot congelado no
vínculo), veículos, carga, rota, valores do frete **decompostos** (`offered/contracted/floor/toll/
vpo/other/total` — VPO jamais somado ao frete), pagamento, e — nas fases seguintes — CIOT, VPO,
documentos fiscais, seguros e PGR.

Estados (lowercase no banco e contrato):

```text
draft → validating → { blocked → draft (reopen) | ready_for_contract }
ready_for_contract → contracted → ciot_pending → ciot_registered → fiscal_pending
→ ready_for_release → in_transit → completion_pending → completed
qualquer não-terminal → cancelled (exige cancelledReason)
```

- Grafo completo declarado em `lib/transport-state-machine.ts` (puro), com `phase` por transição;
  **só transições da fase corrente têm endpoint** — na Fase A: `submit_validation`,
  `approve_validation` (GATE_PROPOSAL), `reject_validation`, `reopen`, `contract` (GATE_CONTRACT),
  `cancel`. **PR-C2 ATIVOU** `request_ciot` (`contracted → ciot_pending`, `GATE_CIOT`) e
  `confirm_ciot` (`ciot_pending → ciot_registered`, sem gate — CAS aplicado pelo worker no sucesso
  do registro/reconciliação do CIOT). Estados de `fiscal_pending` em diante seguem inalcançáveis
  por API até a Fase E.
- Anti-transição arbitrária em 3 camadas: `PATCH` rejeita campo `status` (422); repo transiciona
  por compare-and-swap (`where status=$from and version=$v`, 0 linhas ⇒ 409); service exige
  `assertTransition` + gate sem BLOCK.

## 4. Catálogo regulatório temporal

Entidades: `regulatory_sources` (normas com hash/vigência/monitoramento), `regulatory_rules`
(26 códigos estáveis `TR-*` — ver matriz no [guia](../30-transporte/transporte-guia.md)),
`regulatory_rule_versions` (vigência `effective_from/until`, `implementation_state`
`DRAFT|UNDER_REVIEW|ACTIVE|FUTURE|SUPERSEDED|REVOKED|AWAITING_REGULATION`, `blocking`, base legal).

- Consulta fundacional: `resolveRuleVersionAt(code, date)`; versões da mesma regra não se
  sobrepõem no tempo (exclusion constraint).
- **Nenhuma regra nasce bloqueante** (seed 100% `blocking=false`); check constraint exige
  `reviewed_by/reviewed_at` para `ACTIVE + blocking=true`; fluxo de promoção: [LEGAL REVIEW
  REQUIRED] resolvido → fixtures antes/depois da vigência → canário em WARN → flip.
- Coeficientes de piso **jamais** em código/seed sem revisão (`freight_floor_versions/
  coefficients` com `review_status`).

## 5. Esquema de dados (migrations 021+)

| Migration | Tabelas | PR |
|---|---|---|
| `021_transporte_regulatory_catalog.sql` | `regulatory_sources`, `regulatory_rules`, `regulatory_rule_versions` | A1 |
| `022_transporte_freight_floor_catalog.sql` | `freight_floor_versions`, `freight_floor_coefficients` (sem seed de coeficientes) | A1 |
| `023_transport_parties_vehicles.sql` | `transport_parties`, `transport_party_roles`, `transport_vehicles`, `transport_vehicle_links` | A3 |
| `024_transport_operations.sql` | `transport_operations` + `_parties`, `_vehicles`, `_cargo`, `_routes` | A4 |
| `025_transport_compliance.sql` | `compliance_evaluations` (append-only), `compliance_checks`, `compliance_evidence` | A5 |
| `026_transport_freight_floor_calculations.sql` | `freight_floor_calculations` (append-only) — ✅ entregue (PR-B1, modo shadow) | B1 |
| `027_transport_rntrc_verifications.sql` | `rntrc_verifications` (append-only) — ✅ entregue (PR-C1) | C1 |
| `028_transport_ciot.sql` | `ciot_operations` (`version`+trigger), `ciot_events` (append-only) — ✅ entregue (PR-C2, provedor `mock`) | C2 |

Padrões (molde `013_dmr_declarations.sql`): PK `text` via `createPrefixedId`, coluna `version` +
trigger `increment_version()` (exceção: `compliance_evaluations`, append-only — desvio justificado
no header), checks idempotentes, `correlation_id`, tenancy por `integration_account_id`. JSONB só
para snapshots/payloads; campo consultado por compliance vira coluna.

## 6. Endpoints `/v1/transporte/*` (contract-first)

Fase A (todos síncronos; comandos 202 chegam com as integrações na Fase C):

```text
GET  /v1/transporte/regras?vigenteEm=…        GET /v1/transporte/regras/{code}[/historico]
POST/GET /v1/transporte/transportadores        GET/PATCH /v1/transporte/transportadores/{id}
POST/GET /v1/transporte/veiculos               GET/PATCH /v1/transporte/veiculos/{id}
POST/GET /v1/transporte/operacoes              GET/PATCH /v1/transporte/operacoes/{id}
POST /v1/transporte/operacoes/{id}/submeter-validacao   (GATE_PROPOSAL → ready_for_contract|blocked)
POST /v1/transporte/operacoes/{id}/validar-conformidade (200 — avaliação ad-hoc por gate, sem transição)
GET  /v1/transporte/operacoes/{id}/conformidade         (overview: última avaliação por gate)
POST /v1/transporte/operacoes/{id}/contratar             (GATE_CONTRACT)
POST /v1/transporte/operacoes/{id}/reabrir               (blocked → draft, sem gate)
POST /v1/transporte/operacoes/{id}/cancelar
```

Entregue no PR-A5 exatamente como declarado acima (tags `Transporte - Operações` +
`Transporte - Conformidade`, esta última nova). `submeter-validacao` e `contratar` respondem
`{ operation, evaluation }` (`TransporteOperacaoComAvaliacaoResponse`) — a operação já refletindo
a transição aplicada (ou não, em bloqueio de `contratar`) + a avaliação que decidiu.

**PR-C1 (Fase C, primeiro 202 da vertical):**

```text
POST /v1/transporte/transportadores/{partyId}/verificar-rntrc        (manual: 200 síncrono · open_data: 202 CommandAccepted)
GET  /v1/transporte/transportadores/{partyId}/verificacoes-rntrc     (histórico paginado, mais recente primeiro)
```

Tag `Transporte - RNTRC`. `manual` grava direto (sem fila); `open_data` enfileira
`transporte.rntrc.verify` (idempotente via `Idempotency-Key`, dedupe por
`(entityType=transport_party, entityId, operation)` como todo comando da fila). `entityType
'transport_party'` entra no ternário de `links.entity` de `command-response.ts`/`job-service.ts`
(→ `/v1/transporte/transportadores/{id}`).

**PR-C2 (Fase C, ciclo completo do CIOT — provedor ABSTRAÍDO):**

```text
POST /v1/transporte/operacoes/{id}/ciot/pre-validar   (200 síncrono — GATE_CIOT ad-hoc, sem transição)
POST /v1/transporte/operacoes/{id}/ciot/solicitar      (202 — cria ciot_operations + CAS ciot_pending)
POST /v1/transporte/operacoes/{id}/ciot/retificar       (202 — exige ciot registered)
POST /v1/transporte/operacoes/{id}/ciot/cancelar        (202 — exige ciot registered; NÃO cancela a operação)
POST /v1/transporte/operacoes/{id}/ciot/encerrar        (202 — exige ciot registered/rectified)
GET  /v1/transporte/operacoes/{id}/ciot                 (ciot atual + eventos paginados)
```

Tag `Transporte - CIOT`. NÃO existe provedor CIOT contratado/homologado ([EXTERNAL DEPENDENCY] P5)
— `gateways/ciot-provider-gateway.ts` só implementa `mode: 'mock'` (sandbox determinístico e
stateful em memória por processo); `CIOT_PROVIDER_MODE=real` recusa com
`CIOT_PROVIDER_NOT_CONFIGURED`. Padrão **DL-102 replicado** (não reaproveitado do MTR — bounded
context próprio, `lib/transport/ciot-correlation.ts` + `services/ciot-reconciler.ts`): marcador de
correlação (`[sicat:<ciotId>]`) gravado na CRIAÇÃO da `ciot_operations`, ANTES de qualquer chamada
ao provedor; resposta perdida DEPOIS do dispatch vira `request_unconfirmed` (NUNCA `failed`),
resolvido pelo job `transporte.ciot.reconcile` (enfileirado pelo side-effect terminal e por uma
varredura periódica própria, `enqueueTransporteCiotReconcileSweepIfNeeded`, molde da varredura do
MTR). Rejeição DEFINITIVA do provedor (`CIOT_PROVIDER_REJECTED_TEST` no mock) vira `rejected` —
`transport_operations` PERMANECE `ciot_pending` (rejeição de UMA tentativa não cancela a operação) e
um novo `solicitar` cria uma NOVA `ciot_operations`. `entityType 'ciot_operation'` usa `entityId =
operationId` (a `transport_operations` PAI, não o id da tentativa — dedupe e link por operação; o
id da tentativa ativa vai em `payload.ciotOperationId`), com link explícito via o novo parâmetro
`entityLink` de `buildCommandAccepted` (`command-response.ts`) apontando para
`/v1/transporte/operacoes/{operationId}/ciot`. 3 evaluators novos (TR-CIOT-001/002/003,
`rule-evaluators.ts`) saíram de `RULES_WITHOUT_EVALUATOR_YET`; `ctx.ciotOperation` (a tentativa mais
recente) é carregado por `transport-compliance-service.ts` a partir de
`ciot-repo.findLatestCiotOperationForOperation`, mesmo molde de `ctx.carrierRntrcVerification` (PR-C1).

Lockstep obrigatório no mesmo PR: OpenAPI → `examples/` (ou exemplo inline no YAML, molde RNTRC) →
`gen:operations` **+ `sync-operations-ts.mjs`** → rotas → testes de contrato. Rotas sempre atrás de
`sicatAuthMiddleware`; RBAC `transporte.read`/`transporte.write` + papel `sicat.transporte.operator`
(nunca alargar `sicat.reader`). **Nota (decisão do PR-A2):** as chaves RBAC entram quando houver
mecanismo de enforcement por rota HTTP ou tools conversacionais da vertical — hoje o enforcement
por `permission_key` existe só no gate do chat, e o meta-teste do catálogo
(`tests/unit/conversation-permission-catalog.test.js`) rejeita chave semeada sem consumidor. O
PR-A2 seguiu o padrão da casa (DMR): rota só com `sicatAuthMiddleware`.

## 7. Motor de compliance

`TransportComplianceService` (worker-callable desde o nascimento): resolve regras do gate → versão
vigente na `reference_date` (≠ `evaluated_at`) → evaluator puro por `ruleCode`
(`lib/transport/rule-evaluators.ts`) → **clamp de enforcement** (regra não-ACTIVE ou não-blocking:
BLOCK vira WARN, `raw_status` preservado, `RULE_NOT_ENFORCEABLE`) → persiste avaliação + checks +
evidências em transação. Regra sem versão vigente ⇒ `NOT_APPLICABLE`
(`RULE_NOT_YET_EFFECTIVE`/`RULE_NO_LONGER_EFFECTIVE`). Bloqueio de transição ⇒ 409
`TRANSPORT_GATE_BLOCKED` com checks bloqueantes no `problem+json`.

Gates: `GATE_PROPOSAL`, `GATE_CONTRACT`, `GATE_CIOT`, `GATE_FISCAL`, `GATE_PRE_BOARDING`,
`GATE_RELEASE`, `GATE_IN_TRANSIT`, `GATE_COMPLETION`.

## 8. Frontend (Onda 1.5)

Grupo "Transporte" no módulo `operacao` atrás de feature flag; rotas `/transporte/operacoes[/:id]`
+ `/admin/transporte/regras` (read-only); domínios novos em `lib/status-map.js`
(`transport-operation`, `compliance`: `pass→success`, `warn→warning`, `block→error`,
`not_applicable→neutral`); painel de conformidade **componível** (`SicatCard` + `SicatInlineAlert`
+ `SicatStatusBadge` + `SicatStatusTimeline`) — sem componente novo de design system; glossário
ganha CIOT/MDF-e/CT-e/RNTRC/VPO/piso/PGR/RCTR-C/RC-DC/RC-V. Molde: par MTR-Provisório
(lista/detalhe + store composable + service fino).

## 9. Feature flags e rollout

Dois níveis: flag por capacidade (`transporte.core`, `transporte.freight_floor`,
`transporte.ciot`, `transporte.vpo`, `transporte.fiscal_import`, `transporte.insurance`,
`transporte.fiscal_issuance`, `transporte.regulatory_watch`) + enforcement por regra no catálogo
(dado, não deploy). Migrations inéditas ⇒ **rollout escalonado api → Ready → worker** (armadilha
13). Ondas: ver [guia, seção "Ondas do programa"](../30-transporte/transporte-guia.md).

## 10. Riscos e suposições

- **[LEGAL REVIEW REQUIRED]** — baseline de 13/08/2026 aceita como ponto de partida, não parecer
  jurídico; pendências P1–P3/P9/P10 do guia antes de qualquer flip para bloqueante.
- **[EXTERNAL DEPENDENCY]** — credenciamento ANTT (P4), provedor CIOT/PEF (P5), fornecedoras VPO
  (P6), XMLs reais + NT MDF-e 2026.001 (P7), integração seguros (P8): travam C–F, não A/B.
- **[ASSUMPTION]** — `btree_gist` disponível no Postgres 16 do cluster (exclusion constraint);
  fallback: validação de sobreposição no service + teste.
- Colisão de numeração de migration (`021_` já teve precedente de colisão `012_` dupla) — conferir
  no rebase.
- Duplicação de efeito externo em re-execução de job (fases C+): guarda de idempotência no handler
  + reconciliador, nunca confiar só no claim da fila.

## 11. Lockstep — artefatos a tocar por PR

| PR | Backend | Contrato | Docs |
|---|---|---|---|
| A1 | migrations 021/022, `regulatory-repo.ts`, seed, `lib/transport/regulatory-types.ts` | — | este doc, DL-022 doc, estado-atual, guia |
| A2 | `transporte-routes.ts`, `transporte-regras-service.ts` (RBAC adiado — ver nota do §6) | 3 GETs de regras + schemas + examples | estado-atual |
| A3 | migration 023, repos/services/validator de parties/vehicles | CRUD transportadores/veículos | estado-atual |
| A4 | migration 024, `transport-state-machine.ts`, repo/service de operações, registry operacional | CRUD operações + cancelar | estado-atual, guia |
| A5 | migration 025, `transport-compliance-service.ts`, `rule-evaluators.ts` | conformidade + submeter-validacao + contratar | estado-atual, guia |
| A6 | `tests/regulatory/` + fixtures + meta-guardas | — | fechamento Fase A (este doc + estado-atual + guia) |
| B1 | migration 026, `freight-floor-service.ts` (modo shadow) | cálculo de piso + histórico | estado-atual, guia |
| C1 | migration 027, `antt-rntrc-gateway.ts`, `transport-rntrc-verification-service.ts`, TR-RNTRC-002 | verificação RNTRC (manual 200 + open_data 202) | estado-atual, guia |
| C2 | migration 028, `ciot-provider-gateway.ts`, `ciot-correlation.ts`, `ciot-reconciler.ts`, `ciot-repo.ts`, `transport-ciot-service.ts`, TR-CIOT-001/002/003 | ciclo do CIOT (pre-validar 200 + solicitar/retificar/cancelar/encerrar 202 + GET) | este doc, DL-022 doc, estado-atual, guia |

## 12. Critérios de pronto da Fase A

Backend 100% entregue (PR-A1..A6); frontend é a Onda 1.5 (PR-F1), ainda não iniciado.

1. ✅ Operação navega `draft → validating → ready_for_contract → contracted` (e `blocked/reopen`,
   `cancelled`) exclusivamente por comandos com gate; matriz estados×comandos coberta por teste. —
   `transport-state-machine.ts` (grafo 13 estados × 23 transições) +
   `tests/unit/transport-state-machine.test.js` + `tests/api/transporte-operacoes.test.js`/
   `transporte-conformidade.test.js` (ciclo `submeter-validacao`/`contratar`/`reabrir`).
2. ✅ Catálogo com 26 regras TR-* consultável por API com resolução temporal (`vigenteEm`), zero
   regras bloqueantes, testes de fronteira 23/24/25-05-2026 e 05/06/07-08-2026 verdes. —
   `tests/regulatory/effective-dates.test.js` (as duas fronteiras, mais fixtures de regra futura/
   revogada/superseded) + `tests/regulatory/rule-catalog-invariants.test.js` (meta-guarda 1: zero
   versão bloqueante sem revisão humana no catálogo real).
3. ✅ Toda avaliação de conformidade responde com ruleCode, status, base legal, versão, reasonCode,
   mensagem humana e evidências — e é reproduzível (append-only + snapshot). —
   `transport-compliance-service.ts` + `tests/regulatory/compliance-gates.test.js` (matriz gate×
   regra×resultado, e o clamp fim-a-fim provando que nada bloqueia com o seed real) +
   `tests/api/transporte-conformidade.test.js` (append-only contra o banco).
4. ✅ Suíte ambiental intacta (asserção negativa: `openapi-queue-contract.test.js` inalterado);
   validação obrigatória (§6 do `AGENTS.md`) verde em todos os PRs. — confirmado a cada PR (A1..A6);
   `openapi-queue-contract.test.js` segue sem diffs desde a fundação da vertical.
5. ✅ Guia (`30-transporte/transporte-guia.md`) com tabela de adoção e matriz atualizadas. —
   itens 13/14 da tabela de adoção fechados ✅ no PR-A6; matriz de rastreabilidade com coluna Teste
   preenchida para as 10 regras com evaluator.
6. ⚠️ Frontend (navegação Transporte + lista/detalhe de operações + painel de conformidade + regras
   read-only) — **pendente**: é a Onda 1.5 (PR-F1), fora do escopo backend da Fase A.

**Fase A backend: ✅ completa (PR-A1..A6).** Próximo PR do programa: PR-F1 (frontend mínimo,
Onda 1.5).
