---
title: "Arquitetura alvo — SICAT Transporte (transporte rodoviário remunerado de cargas)"
status: target-architecture
applies_to: [sicat]
updated: 2026-08-15
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
| `029_transport_vpo.sql` | `vpo_providers` (cadastro de referência, `version`+trigger), `vpo_allocations` (`version`+trigger, MUTÁVEL — uma linha por operação), `vpo_events` (append-only) — ✅ entregue (PR-D1, provedor `mock`) | D1 |
| `030_transport_fiscal_documents.sql` | `dfe_schema_registry` (`version`+trigger, SEM tenancy), `fiscal_documents` (`version`+trigger), `fiscal_document_links` (append-only), `fiscal_document_events` (append-only) — ✅ entregue (PR-E1) | E1 |
| `031_transport_insurance.sql` | `insurance_policies` (`version`+trigger), `risk_management_plans`/PGR (`version`+trigger), `insurance_verifications` (append-only) — ✅ entregue (PR-F2, provider `mock`) | F2 |
| `032_transport_dfe_issuance.sql` | `dfe_issuances` (`version`+trigger), `dfe_issuance_events` (append-only) — ⚠️ entregue SANDBOX-READY (PR-G, atrás de `DFE_ISSUANCE_MODE=off`) | G |
| `033_transport_regulatory_watch.sql` | `regulatory_watch_items` (`version`+trigger), `regulatory_watch_events` (append-only, `watch_item_id` nulo só em `check_run_no_change`) — ✅ entregue (PR-H1, backend; atrás de `REGULATORY_WATCH_MODE=off`) | H1 |

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

**PR-D1 (Fase D, VPO — Vale-Pedágio Obrigatório):**

```text
POST /v1/transporte/operacoes/{id}/vpo/avaliar-aplicabilidade   (200 síncrono — VpoApplicabilityEngine, upsert em vpo_allocations)
POST /v1/transporte/operacoes/{id}/vpo/registrar-aquisicao      (200 síncrono — aquisição MANUAL, exige applicable)
POST /v1/transporte/operacoes/{id}/vpo/adquirir                 (202 — aquisição via provedor, exige applicable)
GET  /v1/transporte/operacoes/{id}/vpo                          (allocation atual + eventos paginados)
GET  /v1/transporte/vpo/fornecedoras                            (200 read-only — cadastro configurável)
```

Tag `Transporte - Vale-Pedagio`. Diferente do CIOT: `vpo_allocations` é um recurso MUTÁVEL — UMA
linha por `operation_id` (`unique (operation_id)`), não uma linha por tentativa; `avaliar-
aplicabilidade` faz upsert nessa linha via `lib/transport/vpo-applicability-engine.ts`
(`determineVpoApplicability`, PURO), que decide `applicable: true|false|null` a partir de
`route.tollExpected`/`cargoRegime`/múltiplos embarcadores (Res. ANTT 6.024/2023) — carga
fracionada ou >1 parte `shipper` sempre cai em `applicable: null` (exige análise humana), mesmo com
pedágio esperado. TODO desfecho `not_applicable` grava `applicability_reason_code` — constraint
`chk_vpoalloc_not_applicable_reason` torna isso estrutural, não convenção de código.

Aquisição em dois caminhos: `registrar-aquisicao` (síncrono, evidência declarada pelo operador,
`evidenceSource=manual`) e `adquirir` (assíncrono, via `gateways/vpo-gateway.ts`, só `mode: 'mock'`
— nenhuma fornecedora integrada tecnicamente, [EXTERNAL DEPENDENCY] P6; `VPO_PROVIDER_MODE=real`
recusa com `VPO_PROVIDER_NOT_CONFIGURED`). Os dois caminhos atualizam `transport_operations.vpo_amount`
via `updateOperationById` (CAS por `version`) **NUMA transação** com a escrita de `vpo_allocations`
(`withTransaction`, `db/pool.ts`) — nunca somado a `freight_offered_amount`/`freight_contracted_amount`.

Padrão **DL-102 replicado** (decisão do PR-D1, NÃO reuso do CIOT — bounded context próprio,
`lib/transport/vpo-correlation.ts` + `services/vpo-reconciler.ts`, marcador determinístico a
partir do `vpoAllocationId`, sem coluna própria — diferente de `ciot_operations.correlation_marker`,
necessária lá porque o CIOT tem múltiplas tentativas por operação): a referência do provedor
(`providerReference`) nasce na RESPOSTA do `acquireVpo`; resposta perdida DEPOIS do dispatch vira
`acquisition_unconfirmed` (NUNCA falha definitiva), resolvido pelo job `transporte.vpo.reconcile`
(enfileirado pelo side-effect terminal e por uma varredura periódica própria,
`enqueueTransporteVpoReconcileSweepIfNeeded`, molde exato da varredura do CIOT). Rejeição
DEFINITIVA do provedor (`VPO_PROVIDER_REJECTED_TEST` no mock — rota sem distância válida para
calcular o pedágio) volta a `applicable` (libera novo `adquirir`/`registrar-aquisicao` sem esperar
reconciliação). `entityType 'vpo_allocation'` usa `entityId = operationId` (mesmo molde do CIOT —
dedupe e link por operação; `payload.vpoAllocationId` carrega o id da alocação).

Evaluator TR-VPO-001 EVOLUÍDO (usa `ctx.vpoAllocation` em vez de só `route.tollExpected`) e
TR-VPO-002 NOVO (saiu de `RULES_WITHOUT_EVALUATOR_YET`) em `rule-evaluators.ts`; `ctx.vpoAllocation`
é carregado por `transport-compliance-service.ts` a partir de
`vpo-repo.findVpoAllocationByOperationId`, mesmo molde de `ctx.ciotOperation` (PR-C2).

**PR-E1 (Fase E, importação e validação de DF-e — TUDO síncrono, sem job/gateway):**

```text
POST /v1/transporte/documentos-fiscais/importar                        (201 — parse+valida+grava, dedupe 409)
POST /v1/transporte/documentos-fiscais/{id}/vincular                    (200 — associa a uma operação)
POST /v1/transporte/documentos-fiscais/{id}/desvincular                 (200)
POST /v1/transporte/documentos-fiscais/{id}/revalidar                   (200 — reprocessa com registry/operação ATUAIS)
GET  /v1/transporte/operacoes/{operationId}/documentos-fiscais          (200 — lista da operação)
GET  /v1/transporte/documentos-fiscais/{id}                             (200 — detalhe com issues+links)
```

Tag `Transporte - Documentos Fiscais`. Parser (`lib/transport/dfe-parser.ts`) + validador
(`lib/transport/dfe-validator.ts`) PUROS sobre `xmlContent` (string) — dependência de runtime NOVA
`fast-xml-parser` (zero deps nativas; `packages/fiscal-kit` só CONSTRÓI XML simplificado próprio
para emissão, nunca interpreta o layout real da SEFAZ). Schema registry versionado
(`dfe_schema_registry`, migration `030`, seed próprio `bootstrap/dfe-schema-seed.ts`) resolve a
entrada vigente por `(document_type, layout_version)` na data de EMISSÃO do documento — mesmo
predicado temporal do catálogo regulatório (`resolveVersionFromList` reaproveitado, não duplicado);
nenhuma regra de XML depende de um schema "eterno". `fiscal_documents` NUNCA guarda o XML — só
`xmlStorageRef`/`xmlHash` (`STORAGE_DIR/transporte-dfe/<hash>.xml`); `fiscal_document_links`
(NF-e↔CT-e↔MDF-e) são resolvidos automaticamente na importação, cruzando as chaves referenciadas no
XML contra documentos já importados na mesma conta.

Antecipação em TESTE das rejeições da NT MDF-e 2026.001 (CIOT obrigatório no MDF-e para transporte
remunerado por terceiros, pendência P7 do guia): a entrada `MDFE/3.00/NT MDF-e 2026.001` do schema
registry nasce com `validationProfile.mdfeRequiresCiot=true` e `effectiveFrom` **[ASSUMPTION]**
`2026-10-01` (cronograma técnico oficial ainda não publicado) — antes dessa data resolve para a
entrada BASELINE (`validationProfile: {}`) e o mesmo MDF-e sem CIOT não gera o issue
`MDFE_CIOT_MISSING`; a mudança de comportamento segue só a DATA DE EMISSÃO do documento, nunca um
`if` hardcoded. Cross-check CIOT↔MDF-e (`MDFE_CIOT_MISMATCH`, quando o CIOT registrado da operação
não bate com o `infCIOT` do MDF-e) e o side-effect `vpo_allocations.mdfe_reference` (MDF-e com
`valePed` + alocação `acquired`) rodam na importação (quando `operationId` já vem no request) e em
`vincular` (sobre o snapshot já extraído, sem reler o XML); `revalidar` é quem de fato relê o XML e
reprocessa a validação INTEIRA contra o registry/operação ATUAIS — mas NUNCA reescreve
`xmlStorageRef`/`xmlHash`/campos extraídos do documento original.

6 evaluators novos saíram de `RULES_WITHOUT_EVALUATOR_YET` (`TR-NFE-001`/`TR-CTE-001`/
`TR-MDFE-001`/`TR-MDFE-002`/`TR-CIOT-005`/`TR-VPO-004`, `rule-evaluators.ts`) — `RULES_WITHOUT_
EVALUATOR_YET` agora só tem `TR-RNTRC-003` (aguardando regulamentação ANTT, sem alvo de fase
definido). `ctx.fiscalDocuments` (lista da operação, montada por `transport-compliance-service.ts`
a partir de `transport-fiscal-repo.ts#listFiscalDocumentsForOperation`) é o recorte MÍNIMO que os
evaluators consomem — inclusive `validationIssueCodes` (só os `code`, nunca o objeto inteiro), que
é como `TR-MDFE-002` sabe se o perfil da NT exigiu CIOT sem recalcular a regra por conta própria.

Lockstep obrigatório no mesmo PR: OpenAPI → `examples/` (ou exemplo inline no YAML, molde RNTRC) →
`gen:operations` **+ `sync-operations-ts.mjs`** → rotas → testes de contrato. Rotas sempre atrás de
`sicatAuthMiddleware`; RBAC `transporte.read`/`transporte.write` + papel `sicat.transporte.operator`
(nunca alargar `sicat.reader`). **Nota (decisão do PR-A2):** as chaves RBAC entram quando houver
mecanismo de enforcement por rota HTTP ou tools conversacionais da vertical — hoje o enforcement
por `permission_key` existe só no gate do chat, e o meta-teste do catálogo
(`tests/unit/conversation-permission-catalog.test.js`) rejeita chave semeada sem consumidor. O
PR-A2 seguiu o padrão da casa (DMR): rota só com `sicatAuthMiddleware`.

**PR-F2 (Fase F, seguros obrigatórios do transportador + PGR — TUDO síncrono, sem job/gateway):**

```text
POST /v1/transporte/transportadores/{partyId}/apolices              (201 — registro manual, evidência)
GET  /v1/transporte/transportadores/{partyId}/apolices               (200 — lista, isCurrentlyValid/daysToExpiry derivados)
POST /v1/transporte/transportadores/{partyId}/apolices/verificar     (200 — roda o provider abstraído; 501 se antt/real)
PATCH /v1/transporte/transportadores/{partyId}/apolices/{policyId}   (200 — locking otimista; validFrom/Until gera verification nova)
POST /v1/transporte/transportadores/{partyId}/pgr                    (201 — registro manual)
GET  /v1/transporte/transportadores/{partyId}/pgr                    (200 — lista)
GET  /v1/transporte/seguros/vencimentos                              (200 — alertas: expiring_soon + expired_with_open_operation)
```

Tag `Transporte - Seguros`. `InsuranceVerificationProvider` (`gateways/insurance-verification-
provider.ts`) segue o MESMO molde de `ciot-provider-gateway.ts`/`vpo-gateway.ts`: interface abstrata
+ hoje só `mode: mock` (consulta determinística e SEM ESTADO — ao contrário de CIOT/VPO, não há
Map por processo, porque `verifyCarrier`/`verifyPolicy` são leitura pura, não mutação a lembrar
entre chamadas); `INSURANCE_PROVIDER_MODE=antt` ou `real` recusa com `501
INSURANCE_PROVIDER_NOT_CONFIGURED` ([EXTERNAL DEPENDENCY] P8). VIGÊNCIA NA DATA DA OPERAÇÃO, não
"cadastrada" (mesmo racional de RNTRC, pendência P4): `insurance_policies.status`/
`risk_management_plans.status` são ADMINISTRATIVOS — a vigência real é sempre `validFrom <=
referenceDate <= validUntil` (`validUntil` pode ser nulo em `risk_management_plans`, vigência
indeterminada). Alterar `validFrom`/`validUntil` via `PATCH` NUNCA é silencioso: gera uma
`insurance_verifications` NOVA (append-only) com o resultado da alteração, mesmo a apólice em si
sendo atualizada in-place (cadastro administrativo, não histórico por tentativa). LGPD: `evidence`
aceita só `notes`/`documentRef` — nunca condições comerciais completas.

4 evaluators novos saíram de `RULES_WITHOUT_EVALUATOR_YET` (`TR-SEG-001`/`TR-SEG-002`/`TR-SEG-003`/
`TR-PGR-001`, `rule-evaluators.ts`) — `RULES_WITHOUT_EVALUATOR_YET` agora só tem `TR-RNTRC-003`
(aguardando regulamentação ANTT). `ctx.carrierInsurance` (`{policies, pgr}`, montado por
`transport-compliance-service.ts` a partir de
`transport-insurance-repo.ts#findApplicablePolicyForPartyAndType`/`findApplicablePlanForParty`, uma
consulta por tipo de apólice + uma para o PGR) é o recorte MÍNIMO que os evaluators consomem — a
apólice/PGR que MELHOR cobre a `referenceDate` do gate, nunca a "mais recente" cega. TR-PGR-001
exige o PGR quando o carrier tem apólice RCTR-C OU RC-DC REGISTRADA (independente da vigência
daquelas — assunto de TR-SEG-001/002); RC-V isolado não aciona a exigência.

**PR-G (Fase G, emissão de DF-e SANDBOX-READY — condicional a go/no-go comercial, pendência P9):**

```text
POST /v1/transporte/operacoes/{id}/emissoes             (202 — cria dfe_issuances + enfileira transporte.dfe.issue)
GET  /v1/transporte/operacoes/{id}/emissoes              (200 — lista de emissões da operação + eventos)
POST /v1/transporte/emissoes/{issuanceId}/cancelar       (202 — sandbox only, sem chamada remota)
```

Tag `Transporte - Emissao Fiscal`. A Fase G é CONDICIONAL a go/no-go comercial + certificado digital
+ credenciamento SEFAZ ([LEGAL REVIEW REQUIRED]+[EXTERNAL DEPENDENCY], pendência P9) — este PR
entrega a ARQUITETURA completa, sandbox-ready, atrás da flag de CONFIGURAÇÃO `DFE_ISSUANCE_MODE`
(`off` por default; `POST .../emissoes` recusa com `409 DFE_ISSUANCE_FEATURE_DISABLED` enquanto
desligada — a flag é checada NA ROTA, antes de criar qualquer `dfe_issuances`, para uma feature
desligada não deixar rastro de tentativas). `gateways/dfe-issuance-gateway.ts` embrulha o
`@flavioneto11/fiscal-kit` REAL (pacote novo, `packages/fiscal-kit`, vendorizado em
`vendor/flavioneto11-fiscal-kit-0.1.0.tgz` — mesmo mecanismo de `oidc-kit`): `mode: 'sandbox'` chama
de verdade `buildNfeXml`/`signXml`/`submit`/`queryStatus` do kit (determinístico, sem certificado,
sem rede — comportamento REAL observado: `submit`/`queryStatus` respondem IMEDIATAMENTE
`authorized`, o sandbox do kit nunca rejeita); `mode: 'off'` recusa TODA chamada com
`DFE_ISSUANCE_DISABLED`. Só `documentType: 'NFE'` tem implementação — `CTE`/`MDFE` recusam com
`DFE_ISSUANCE_TYPE_NOT_SUPPORTED` (o kit não cobre; aguardam emissor dedicado, também P9).

O XML do kit (formato PRÓPRIO minimalista, incompatível com o parser real da SEFAZ da Fase E) NUNCA
é o que persiste: o gateway tece o resultado REAL do kit (digest da assinatura, recibo, protocolo)
dentro de um envelope no layout real da SEFAZ (`lib/transport/dfe-issuance-nfe-mapper.ts`, PURO —
`infNFe`/`ide`/`emit`/`dest`/`total`/`protNFe`, com uma chave de acesso de 44 dígitos SANDBOX
sintetizada mas estruturalmente VÁLIDA — DV/modelo/CNPJ coerentes), para a emissão autorizada poder
ser reimportada ao acervo da Fase E (`transport-fiscal-service.importarDocumentoFiscal`, reuso
interno) SEM alterar uma linha de `dfe-parser.ts`/`dfe-validator.ts`. Mapeamento mínimo honesto:
emitente = parte `contractor`, destinatário = parte `consignee`, itens a partir da `cargo` (valor
declarado) — campo faltante vira `422 DFE_ISSUANCE_INCOMPLETE_DATA`, nunca um XML fabricado.

Padrão **DL-102 aplicado à emissão fiscal**: `correlation_marker` (`[sicat-dfe:<issuanceId>]`,
prefixo distinto do CIOT) gravado na CRIAÇÃO de `dfe_issuances`, ANTES de qualquer chamada; o status
vira `submitting` IMEDIATAMENTE ANTES do dispatch remoto (`gateway.submitDocument`) — falha DEPOIS
desse ponto vira `submit_unconfirmed` (NUNCA `failed_validation`), resolvida só pelo reconciliador
(`transporte.dfe.issue.reconcile`, `services/dfe-issuance-reconciler.ts`, molde exato de
`ciot-reconciler.ts`, enfileirado pelo side-effect terminal e por uma varredura periódica própria,
`enqueueTransporteDfeIssuanceReconcileSweepIfNeeded`). Diferente do CIOT/VPO: a classificação
LOCAL-vs-DL-102 não depende de código de erro — é 100% pelo STATUS da linha no momento do terminal
(`markDfeIssuanceSubmitUnconfirmed` tentado primeiro, guardado por `status='submitting'`; se não
aplicar, cai para `markDfeIssuanceFailedValidation`, guardado pelos estados pré-`submitting`) — mais
robusto a esquecer um código novo na lista. AUTORIZADA: grava o XML em
`STORAGE_DIR/transporte-dfe-issuance/<hash>.xml` e reimporta automaticamente ao acervo — a emissão
vira um `fiscal_documents` comum, avaliado pelos evaluators TR-NFE/CTE/MDFE JÁ EXISTENTES (nenhum
evaluator novo, `RULES_WITHOUT_EVALUATOR_YET` intocado). `cancelar` é sandbox only (o kit não tem
operação de cancelamento) mas ainda 202/job, por consistência com o resto da fila.

Migration `032_transport_dfe_issuance.sql`: `dfe_issuances` (`version`+trigger, uma linha por
TENTATIVA — molde `ciot_operations`, não `vpo_allocations`) + `dfe_issuances_events` (append-only).
3 job types novos (`transporte.dfe.issue{,.cancel,.reconcile}`), registrados em `lib/retry.ts`
(prioridade/backoff mesmo nível do CIOT/VPO) e em `workers/operation-handlers.ts`/`job-runner.ts`
(handlers sem parâmetro `gateway`, terminal side-effect nos dois pontos de `job-runner.ts`, sweep
periódico). Lockstep: OpenAPI (tag `Transporte - Emissao Fiscal`) → `gen:operations` +
`sync-operations-ts.mjs` → rotas → `tests/unit/dfe-issuance-gateway.test.js` +
`tests/worker/transporte-dfe-issuance.test.js` + `tests/api/transporte-emissoes.test.js`.

**PR-H1 (Fase H, Regulatory Watch + Centro Operacional):**

```text
GET  /v1/transporte/watch[?status=…]                                  (lista itens)
GET  /v1/transporte/watch/{itemId}                                    (item + trilha de eventos)
POST /v1/transporte/watch/{itemId}/revisar                            (human_review → approved|rejected)
POST /v1/transporte/watch/{itemId}/aplicar                            (approved → active_applied; cria versão SEMPRE blocking=false)
POST /v1/transporte/watch/verificar-agora                             (202 CommandAccepted — dispara a varredura sob demanda)
POST /v1/transporte/regras/{code}/versoes/{versionLabel}/promover     (200 — ÚNICO caminho para blocking=true)
GET  /v1/transporte/operations/overview?integrationAccountId=…        (Centro Operacional da vertical)
```

Tag `Transporte - Regulatory Watch` (+ `promover` na tag `Transporte - Regras`; `overview` na tag
`Transporte - Operações`, sem tocar `/v1/operations/overview` nem `/v1/dashboard/overview`).

Fluxo DETECTED → INGESTED → AI_ANALYZED/AI_SKIPPED → HUMAN_REVIEW → APPROVED/REJECTED →
ACTIVE_APPLIED, produzido pelo worker (`transporte.regulatory.watch_check`, 1 job type — varredura
periódica default 24h só quando `REGULATORY_WATCH_MODE=live`, molde das sweeps de reconciliação de
`workers/job-runner.ts` mas dedupe em ENTIDADE GLOBAL `regulatory_watch_sweep:global`, já que a
varredura processa TODAS as fontes monitoradas dentro do MESMO job — não uma linha por fonte).
`regulatory-watch-gateway.ts` faz o fetch REAL da `source_url` (sha256 do corpo, etag/last-modified,
timeout curto, User-Agent identificado); em `mode: off` devolve `{ skipped: true }` sem tocar rede
nem lançar — NO-OP LIMPO, ao contrário do fail-closed dos demais gateways da vertical. Detecção de
mudança compara com `source_hash` conhecido; hash igual gera só o evento `check_run_no_change` (sem
item novo); hash diferente cria `regulatory_watch_items` (guarda o `newHash` — `source_hash` só
muda em `aplicar`, senão uma rejeição perderia a capacidade de redetectar a MESMA mudança). Uma
mudança já com item NÃO-TERMINAL pendente não duplica (retry do job não cria um segundo item).

Passo de IA OPCIONAL: com `OPENAI_API_KEY`/`AI_CONTROL_ENABLED`, um resumo minimalista do conteúdo
baixado (prompt fixo, NUNCA decisão) marca `ai_analyzed`; sem chave, ou em qualquer falha da
chamada, `ai_skipped` — o job NUNCA falha por causa da IA. Ambos avançam para `human_review`.

`revisar`/`aplicar` são os ÚNICOS pontos de decisão humana no ciclo do item; `aplicar` cria uma
`regulatory_rule_version` NOVA (via `insertRuleVersion`, `regulatory-repo.ts`) SEM o campo
`blocking` no request — nasce sempre `false`. `promover`
(`promoteRuleVersionBlocking`/`promoteTransportRuleVersionService`) é o ÚNICO caminho para
`blocking=true`: exige `reviewNotes` (400 sem ele) e `implementation_state='ACTIVE'` (409 caso
contrário), grava `reviewedBy`/`reviewedAt`/`blocking` na MESMA linha — a trava de banco
`chk_regrulev_blocking_reviewed` (migration 021) sustenta isso independentemente do código.

`GET .../operations/overview` REÚSA a infraestrutura do Centro Operacional (fase 04,
`operations-repo.ts`/`lib/operational-status.ts`) — agregados por conta (operações por status, top
regras que mais bloqueiam na avaliação mais recente, ofertas abaixo do piso, CIOT/VPO/fiscal/seguro/
RNTRC/jobs `transporte.*`), exceto `watch.pendingHumanReviewGlobal` (GLOBAL — o catálogo/Watch não
tem tenancy). Passo a passo de promoção documentado em
[`transporte-guia.md`](../30-transporte/transporte-guia.md#como-promover-uma-regra-a-bloqueante).

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

## 8. Frontend (Onda 1.5 → PR-H2, completo)

Grupo "Transporte" no módulo `operacao` atrás de `VITE_FEATURE_TRANSPORTE` (default desligada).
Nasceu mínimo na Onda 1.5 (PR-F1): rotas `/transporte/operacoes[/:id]` + `/transporte/regras`
(read-only), domínios `transport-operation`/`compliance` em `lib/status-map.js`, painel de
conformidade **componível** (`SicatCard` + `SicatInlineAlert` + `SicatStatusBadge` +
`SicatStatusTimeline`). O PR-H2 completou a vertical no frontend — **sem componente novo de design
system em nenhum dos dois PRs**:

- **9 rotas** (todas atrás da mesma flag, `requiresActiveCetesbAccount: true`, ANTES do catch-all):
  `/transporte/operacoes[/:operationId]`, `/transporte/pendencias`,
  `/transporte/transportadores[/:partyId]`, `/transporte/veiculos`, `/transporte/regras`,
  `/transporte/watch[/:itemId]`, `/transporte/piso/tabelas`.
- **`lib/status-map.js`**: 10 domínios novos (`rntrc-status`, `rntrc-verification`,
  `vpo-allocation`, `fiscal-validation`, `fiscal-authorization`, `insurance-policy`, `pgr-status`,
  `piso-tabela-review`, `dfe-issuance`, `watch-item`) + correção do domínio `ciot` existente
  (faltava `request_unconfirmed`, o estado DL-102).
- **Stores** (todas factory functions sem estado de módulo compartilhado, molde do PR-F1):
  `transporteStore.js` estendida (piso/CIOT/VPO/documentos fiscais/emissões escopados à operação
  selecionada — comandos 202 via `useJobAwait`) + `transportadoresStore.js`, `veiculosStore.js`,
  `watchStore.js`, `transportePendenciasStore.js` novas.
- **7 telas novas** + **2 telas estendidas** (`TransporteOperacaoDetailView` ganha 5 seções; 
  `TransporteRegrasView` ganha histórico de versões + promoção administrativa a bloqueante).
- Glossário ganha DF-e, emissão sandbox e Regulatory Watch (CIOT/MDF-e/CT-e/RNTRC/VPO/piso/PGR/
  RCTR-C/RC-DC/RC-V já vinham do PR-F1).
- **Desvio de contrato conhecido** (não deste PR — backend congelado): `TransportRuleVersionResource`
  (histórico de regra) não expõe o `version` de locking otimista que `POST .../promover` exige; a
  UI usa `1` (valor real de toda versão nunca promovida) e memoriza em sessão o `version` devolvido
  por uma promoção bem-sucedida.

Molde geral: par MTR-Provisório (lista/detalhe + store composable + service fino).

## 9. Feature flags e rollout

Dois níveis: flag por capacidade (`transporte.core`, `transporte.freight_floor`,
`transporte.ciot`, `transporte.vpo`, `transporte.fiscal_import`, `transporte.insurance`,
`transporte.fiscal_issuance`, `transporte.regulatory_watch`) + enforcement por regra no catálogo
(dado, não deploy). Migrations inéditas ⇒ **rollout escalonado api → Ready → worker** (armadilha
13). Ondas: ver [guia, seção "Ondas do programa"](../30-transporte/transporte-guia.md).

**PR-G acrescenta um TERCEIRO nível, específico da emissão fiscal**: `DFE_ISSUANCE_MODE` é uma
variável de CONFIGURAÇÃO do backend (`off`|`sandbox`, `lib/config.ts`), não um deploy flag do
frontend — controla se `gateways/dfe-issuance-gateway.ts` aceita chamadas, independente de
`transporte.fiscal_issuance` (flag de capacidade, ainda não conectada a nenhuma tela). Default
`off` em TODO ambiente até decisão comercial+legal (P9); ligar `DFE_ISSUANCE_MODE=sandbox` habilita
só o pipeline sandbox (build→sign→submit via `@flavioneto11/fiscal-kit`, sem certificado, sem SEFAZ
real) — nunca emissão real, que exigiria um modo/configuração ainda não implementados.

## 10. Riscos e suposições

- **[LEGAL REVIEW REQUIRED]** — baseline de 13/08/2026 aceita como ponto de partida, não parecer
  jurídico; pendências P1–P3/P9/P10 do guia antes de qualquer flip para bloqueante.
- **[EXTERNAL DEPENDENCY]** — credenciamento ANTT (P4), provedor CIOT/PEF (P5), fornecedoras VPO
  (P6), XMLs reais + NT MDF-e 2026.001 (P7), integração técnica de seguros com ANTT/seguradora (P8,
  CRUD + `mode: mock` já entregues no PR-F2): travam C–F, não A/B.
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
| D1 | migration 029, `vpo-applicability-engine.ts`, `vpo-correlation.ts`, `vpo-reconciler.ts`, `vpo-repo.ts`, `transport-vpo-service.ts`, `load-vpo-providers.js`, TR-VPO-002 | VPO (avaliar-aplicabilidade 200 + registrar-aquisicao 200 + adquirir 202 + GET + fornecedoras) | este doc, DL-022 doc, estado-atual, guia |
| E1 | migration 030, `dfe-parser.ts`, `dfe-validator.ts`, `dfe-schema-seed.ts`, `dfe-schema-registry-repo.ts`, `transport-fiscal-repo.ts`, `transport-fiscal-service.ts`, `vpo-repo.ts#setVpoAllocationMdfeReference`, TR-NFE-001/CTE-001/MDFE-001/002/CIOT-005/VPO-004 | DF-e (importar 201 + vincular/desvincular/revalidar 200 + GET lista/detalhe) | este doc, DL-022 doc, estado-atual, guia |
| F2 | migration 031, `insurance-verification-provider.ts`, `transport-insurance-repo.ts`, `transport-insurance-service.ts`, TR-SEG-001/002/003/TR-PGR-001 | apólices (criar 201 + listar/verificar/atualizar 200) + PGR (criar 201 + listar 200) + vencimentos (200) | este doc, DL-022 doc, estado-atual, guia |

## 12. Critérios de pronto da Fase A

Backend 100% entregue (PR-A1..A6); frontend mínimo entregue na Onda 1.5 (PR-F1) e completo no
PR-H2 (ver §8) — critérios abaixo continuam descrevendo a Fase A backend, não o frontend completo.

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
