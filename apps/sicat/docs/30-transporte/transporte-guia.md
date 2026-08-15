---
title: "SICAT Transporte — Guia do programa (camada viva sobre a baseline regulatória)"
status: reference
applies_to: [sicat]
updated: 2026-08-15
language: pt-BR
---

# SICAT Transporte — Guia do programa

> **Este é o documento vivo do programa Transporte.** Ele cura, rastreia e mantém atualizada a
> adoção do estudo [`deep-research-report.md`](./deep-research-report.md) (snapshot imutável de
> 13/08/2026), que é a **baseline regulatória e arquitetural aceita pelo produto**. Todo PR do
> programa referencia a seção deste guia que o motiva e atualiza a tabela de adoção no mesmo PR.

## Status da baseline

| Item | Valor |
|---|---|
| Fonte | Pesquisa profunda (deep research) — snapshot em [`deep-research-report.md`](./deep-research-report.md) |
| Data de referência regulatória | 13/08/2026 |
| Status | ✅ Aceita como baseline do programa (decisão do operador em 13/08/2026) |
| Natureza | Especificação de produto/engenharia — **não substitui parecer jurídico** |
| Regra de ouro | Nenhuma regra derivada vira **bloqueante** em produção sem item [LEGAL REVIEW REQUIRED] resolvido por revisão humana (trava também em DDL: `ACTIVE + blocking=true` exige `reviewed_by`/`reviewed_at`) |

## Convenções de manutenção (obrigatórias)

1. **O relatório é somente leitura.** Correções e evoluções regulatórias entram NESTE guia e,
   quando viram regra de produto, no catálogo regulatório versionado do backend
   (`regulatory_rule_versions`) como **nova versão** — nunca como edição do snapshot.
2. **Todo PR do programa** cita no corpo a seção do guia/relatório que o motiva e atualiza a
   [tabela de adoção](#tabela-de-adoção) quando adota/adapta/recusa uma recomendação.
3. **Mudança normativa detectada** (ex.: deliberação sobre o Veto 43/2026, regulamentação ANTT
   complementar) → registrar primeiro na seção de [pendências](#pendências-legal-review-required-e-external-dependency),
   depois seguir o fluxo do catálogo (nova `rule_version` com `effective_from` e revisão humana).

Legenda de estado usada nas tabelas: ✅ adotado · ⚠️ adotado com adaptação · ⛔ recusado ·
🕓 aguardando (bloqueado por dependência) · 📋 planejado (ainda não iniciado).

## Índice curado do relatório

| Seção do relatório | O que contém | Uso no programa |
|---|---|---|
| Conclusão executiva e atualização jurídica crítica | Lei 15.485/2026 (conversão da MP 1.343/2026), Veto 43/2026, tese do motor preventivo | Fundamenta o bounded context e os gates; monitorar veto |
| Diagnóstico do SICAT no GitHub | O que reutilizar (fila, auditoria, Centro Operacional, contract-first) e o cuidado MTR ambiental ≠ MDF-e | Regra dura do programa (DL-103) |
| Mapa regulatório vigente | RNTRC, CIOT, piso, VPO, fiscal, seguros/PGR + matriz consolidada | Fonte do seed de `regulatory_sources` e das 26 regras TR-* |
| Arquitetura alvo | TransportOperation, Compliance Gate, gates, estados, catálogo de regras | Base das migrations 021–025 e dos services da Fase A |
| Regras de negócio, modelo de dados e controles | Catálogo TR-*, schema sugerido, snapshot de compliance, APIs, UX, LGPD | Especificação de referência dos PRs A1–A6 e F1 |
| Roadmap de implementação e estratégia de testes | Ordem fundação → piso → RNTRC/CIOT → VPO → fiscal → seguros → hardening; testes regulatórios/time-travel | Estrutura das ondas; `tests/regulatory/` |
| Prompt mestre (entregáveis A–AH) | Especificação completa de investigação + entregáveis | Checklist de completude do programa |

## Tabela de adoção

Decisões estruturantes do relatório e o estado de adoção no produto. Atualizar a coluna
"Estado" e "Onde" a cada PR.

| # | Recomendação do relatório | Estado | Onde / observação |
|---|---|---|---|
| 1 | Bounded context **Transporte** separado do ambiental (MTR ambiental ≠ MDF-e; não reutilizar `manifest`) | ⚠️ | DL-103 + migrations `021..024` (PR-A1..A4) — em construção: catálogo, cadastros e agregado `TransportOperation` entregues; motor de compliance no PR-A5 |
| 2 | Agregado central **TransportOperation** com máquina de estados explícita; transição só via gate | ✅ | PR-A4: migration `024_transport_operations.sql` + `transport-state-machine.ts` (grafo completo, 13 estados/23 transições) — gates plugados no PR-A5 |
| 3 | **Catálogo regulatório temporal** (fontes, regras TR-*, versões com vigência) — nunca if/else espalhado | ✅ | PR-A1: `021_transporte_regulatory_catalog.sql` + seed (`regulatory-rules-seed.ts`) + repo (`regulatory-repo.ts`) |
| 4 | **TransportComplianceService**: gateway traz fatos, motor decide; resposta com ruleCode/base legal/versão/evidência | ✅ | PR-A5: `transport-compliance-service.ts` + `rule-evaluators.ts` (10 evaluators Fase A) + migration `025` (append-only) |
| 5 | Nenhuma regra nasce bloqueante; promoção a `blocking=true` exige revisão humana | ✅ | Check constraint + seed (PR-A1: `chk_regrulev_blocking_reviewed`, seed 100% `blocking=false`); clamp BLOCK→WARN entregue (PR-A5: `applyEnforcementClamp`, `RULE_NOT_ENFORCEABLE`) |
| 6 | `FreightFloorEngine` versionado, coeficiente **jamais** hardcoded; validação em GATE_PROPOSAL (antes da oferta) | ⚠️ | Engine entregue em MODO SHADOW (PR-B1, migration `026`): coeficientes REAIS da Tabela A (Res. ANTT 6.084/2026) transcritos e carregáveis via `npm run load:freight-floor` — sempre como `review_status=pending_review`. TR-PMF-002/003/004 avaliam de verdade contra o cálculo persistido, mas o clamp de enforcement mantém tudo em WARN (seed 100% `blocking=false`). Flip a bloqueante exige P3 (revisão jurídica humana) |
| 7 | **Não** implementar antecipação fixa de 70% do frete (dispositivo vetado — Veto 43/2026) | ✅ | Recusa registrada; monitorar veto (pendência P1) |
| 8 | CIOT: ciclo completo com provedor abstraído; `REGISTERED ≠ COMPLIANT` | ⚠️ | ciclo completo entregue com provedor `mock` (PR-C2, padrão DL-102 desde o dia 1: marcador de correlação, `request_unconfirmed`, reconciliador que pergunta ao provedor) — pré-validação, solicitação (202), registro, retificação, cancelamento, encerramento, rejeição/bloqueio; provedor real segue bloqueado por [EXTERNAL DEPENDENCY] P5 |
| 9 | `VpoApplicabilityEngine` (VPO não é checkbox universal; NOT_APPLICABLE com justificativa) | ⚠️ | Fase D entregue (PR-D1): engine puro (`vpo-applicability-engine.ts`) + `vpo_allocations`/`vpo_events` (migration `029`) + cadastro configurável de fornecedoras (`vpo_providers`, `npm run load:vpo-providers`, 16 fornecedoras reais da ANTT). Aquisição em dois caminhos — manual (síncrono, evidência declarada) e via provedor abstraído (assíncrono, padrão DL-102 replicado do CIOT); provedor real segue bloqueado por [EXTERNAL DEPENDENCY] P6 |
| 10 | Fiscal: começar por **importação + validação** de XML; emissão só em fase posterior com go/no-go | ✅ | Fase E entregue (PR-E1): `importarDocumentoFiscal`/`vincular`/`desvincular`/`revalidar` síncronos, schema registry versionado (`dfe_schema_registry`), parser/validador puros (`dfe-parser.ts`/`dfe-validator.ts`, dependência nova `fast-xml-parser`), vínculos automáticos NF-e↔CT-e↔MDF-e, antecipação em TESTE das rejeições da NT MDF-e 2026.001 (`MDFE_CIOT_MISSING`). Emissão segue Fase G (fiscal-kit, atrás de flag) |
| 11 | Seguros RCTR-C/RC-DC/RC-V + PGR com verificação multiestrategia (`InsuranceVerificationProvider`) | 📋 | Fase F |
| 12 | Regulatory Watch com aprovação humana obrigatória (IA sugere, humano ativa) | 📋 | Fase H |
| 13 | Testes regulatórios como categoria própria + fixtures de fronteira temporal (24/05/2026, 06/08/2026) | ✅ | PR-A6: categoria consolidada — `tests/regulatory/` (`effective-dates`, `compliance-gates`, `freight-floor-applicability`, `rule-catalog-invariants`, `time-travel-integration`) + `tests/fixtures/regulatory/`; fronteiras 24/05/2026 e 06/08/2026 cobertas |
| 14 | Regra de engenharia: mudança de `RegulatoryRuleVersion` exige fixture antes/depois da vigência | ✅ | PR-A6: meta-guarda 3 (`tests/regulatory/rule-catalog-invariants.test.js`) valida `fixtures-manifest.json` contra o seed — toda `(code, version_label)` com fixture `{before, on, after}` |
| 15 | Reutilizar fila/jobs/DLQ, auditoria por correlationId, idempotência, RBAC, Centro Operacional, design system `Sicat*` | ✅ | Padrão da casa confirmado na exploração; sem segundo framework |
| 16 | Compliance da Fase A **síncrono** (sem chamada externa; job types só quando houver integração) | ⚠️ | Adaptação ao relatório: 202/job fica para a Fase C (decisão D1 do plano) |
| 17 | UX: painel "CONFORMIDADE DA OPERAÇÃO" (PASS/WARN/BLOCK por requisito) na ficha da operação | ✅ | Onda 1.5 (PR-F1) — `TransporteOperacaoDetailView.vue`, 100% `Sicat*` existentes (nenhum componente novo); atrás de `VITE_FEATURE_TRANSPORTE` (default desligada) |
| 18 | LGPD: minimização de dados de risco; reason code + evidência, nunca cópia integral de retorno externo | 📋 | NFR + Fases C/F |

## Matriz de rastreabilidade

LEGAL SOURCE → REQ → regra TR-* → entidade/DB → API → gate → UI → teste → evidência.
Todas as regras vivem no catálogo (REQ-SICAT-0018) e são avaliadas pelo motor de compliance
(REQ-SICAT-0019); a coluna REQ aponta o requisito que implementa a regra em si. A coluna Teste
será preenchida conforme os testes nascerem (`tests/regulatory/`).

| Regra | Título curto | Base legal principal | Gate default | Fase | REQ | Teste | Estado |
|---|---|---|---|---|---|---|---|
| TR-RNTRC-001 | RNTRC regular para a operação | Lei 11.442/2007 + Res. ANTT 5.982/2022 | GATE_CONTRACT | A (evaluator local) / C (verificação) | REQ-SICAT-0024 | `tests/regulatory/compliance-gates.test.js` + `tests/unit/rule-evaluators.test.js` + `tests/api/transporte-rntrc.test.js` + `tests/worker/transporte-rntrc-verify.test.js` | ⚠️ PR-C1: considera a última verificação (`rntrc_verifications`) com janela de frescor de 90 dias; `open_data` (dados abertos ANTT) nunca produz um "verificado" conclusivo sozinho — `pass` vem sempre com `strategy`/`dataReferenceDate` explícitos (cache informativo); `manual` (evidência declarada) também aceito; `antt` (credenciada) reservado |
| TR-RNTRC-002 | Veículo compatível com transportador/operação | Res. ANTT 5.982/2022 | GATE_PRE_BOARDING | C | REQ-SICAT-0024 | `tests/unit/rule-evaluators.test.js` | ⚠️ PR-C1: evaluator declarativo entregue — veículo de tração da operação com vínculo (`transport_vehicle_links`, `owned\|leased\|aggregated\|rntrc_fleet`) ao carrier |
| TR-RNTRC-003 | Revalidação anual quando exigível | Lei 15.485/2026 (dep. regulamentação ANTT) | GATE_CONTRACT | C | REQ-SICAT-0024 | a criar | 🕓 AWAITING_REGULATION |
| TR-PMF-001 | Determinar aplicabilidade do piso | Lei 13.703/2018 + Res. ANTT 5.867/2020 | GATE_PROPOSAL | A/B | REQ-SICAT-0022 | `tests/regulatory/freight-floor-applicability.test.js` | ⚠️ evaluator declarativo entregue (Fase A); verificação externa/cálculo nas fases B/C+ |
| TR-PMF-002 | Não permitir oferta/publicação abaixo do piso | Lei 13.703/2018 + Lei 15.485/2026 + Res. ANTT 6.076/2026 + Res. ANTT 6.084/2026 | GATE_PROPOSAL | B | REQ-SICAT-0023 | `tests/regulatory/freight-floor-engine.test.js` | ⚠️ shadow (PR-B1): cálculo real avaliado, `block` clampado para `warn` (seed `blocking=false`); tabela `pending_review` também rebaixa `pass`→`warn FLOOR_TABLE_PENDING_REVIEW` |
| TR-PMF-003 | Não permitir contratação abaixo do piso | Lei 13.703/2018 + Lei 15.485/2026 + Res. ANTT 6.076/2026 + Res. ANTT 6.084/2026 | GATE_CONTRACT | B | REQ-SICAT-0023 | `tests/regulatory/freight-floor-engine.test.js` | ⚠️ shadow (PR-B1) — mesmo comportamento de TR-PMF-002, campo `contractedAmount` |
| TR-PMF-004 | Usar versão do piso vigente na data | Res. ANTT 5.867/2020 (tabelas vigentes) + Res. ANTT 6.076/2026 + Res. ANTT 6.084/2026 | GATE_PROPOSAL | B | REQ-SICAT-0022 | `tests/regulatory/freight-floor-engine.test.js` | ⚠️ shadow (PR-B1): verifica se o cálculo mais recente usou a tabela vigente na `referenceDate`; `pending_review`/sem tabela → `warn` |
| TR-CIOT-001 | Obrigatoriedade do CIOT | Res. 5.862/2019 + Res. 6.078/2026 + Lei 15.485/2026 | GATE_CIOT | A (catálogo) / C (ciclo) | REQ-SICAT-0025 | `tests/regulatory/effective-dates.test.js` + `tests/regulatory/compliance-gates.test.js` + `tests/unit/rule-evaluators.test.js` | ⚠️ PR-C2: evaluator entregue — operação remunerada sem CIOT registrado → WARN `CIOT_NOT_REGISTERED` (quem de fato bloqueia é TR-CIOT-002/GATE_RELEASE); com CIOT `registered`/`rectified` → PASS com a nota explícita `REGISTERED ≠ COMPLIANT` |
| TR-CIOT-002 | CIOT antes do início da operação | Res. ANTT 6.078/2026 | GATE_RELEASE | C | REQ-SICAT-0025 | `tests/regulatory/compliance-gates.test.js` | ⚠️ PR-C2: evaluator entregue — CIOT ausente/`request_unconfirmed`/`rejected` → BLOCK bruto `CIOT_MISSING_FOR_RELEASE` (clamp mantém WARN enquanto `blocking=false` no seed); `registered`/`rectified` → PASS |
| TR-CIOT-003 | Responsável pelo CIOT conforme enquadramento | Lei 15.485/2026 | GATE_CIOT | C | REQ-SICAT-0025 | `tests/regulatory/effective-dates.test.js` (fronteira 06/08/2026) + `tests/regulatory/compliance-gates.test.js` | ⚠️ PR-C2: evaluator declarativo — confere se `responsibleParty` foi declarado na solicitação (`contractor` por default; `subcontractor` quando a operação é subcontratada) → PASS/WARN `CIOT_RESPONSIBLE_UNDECLARED` |
| TR-CIOT-004 | Dados obrigatórios do CIOT completos | Lei 15.485/2026 | GATE_CIOT | A (completude local) | REQ-SICAT-0025 | `tests/regulatory/compliance-gates.test.js` + `tests/regulatory/time-travel-integration.test.js` | ⚠️ evaluator declarativo entregue (Fase A); verificação externa/cálculo nas fases B/C+ |
| TR-CIOT-005 | CIOT vinculado ao MDF-e quando aplicável | Lei 15.485/2026 + NT MDF-e 2026.001 | GATE_FISCAL | E | REQ-SICAT-0027 | `tests/regulatory/compliance-gates.test.js` + `tests/api/transporte-dfe.test.js` | ⚠️ PR-E1: evaluator entregue — CIOT `registered`/`rectified` presente no `infCIOT` do MDF-e vinculado → PASS; sem MDF-e ainda → NOT_APPLICABLE; CIOT registrado sem MDF-e vinculado, ou MDF-e sem o número → WARN `CIOT_MDFE_LINK_PENDING`. Versão do seed segue `UNDER_REVIEW` (clamp mantém WARN) |
| TR-PAY-001 | Prazo/forma de pagamento conforme norma vigente | Lei 15.485/2026 (30 dias úteis) | GATE_CONTRACT | A (declarativo) | REQ-SICAT-0025 | `tests/regulatory/compliance-gates.test.js` | ⚠️ evaluator declarativo entregue (Fase A); verificação externa/cálculo nas fases B/C+ |
| TR-VPO-001 | Determinar aplicabilidade do VPO | Lei 10.209/2001 + Res. ANTT 6.024/2023 | GATE_PRE_BOARDING | A (declarativo) / D (engine) | REQ-SICAT-0026 | `tests/regulatory/compliance-gates.test.js` + `tests/unit/rule-evaluators.test.js` + `tests/unit/vpo-applicability-engine.test.js` | ⚠️ PR-D1: evoluído para usar o `VpoApplicabilityEngine` + `vpo_allocations` persistida — `not_applicable` sempre com `applicabilityReasonCode` (constraint de banco); `applicable`/`acquired` → PASS `vpoRequired=true`; sem avaliação → WARN `VPO_APPLICABILITY_NOT_EVALUATED`; indeterminado (carga fracionada/múltiplos embarcadores) → WARN |
| TR-VPO-002 | VPO antecipado antes do embarque | Lei 10.209/2001 | GATE_PRE_BOARDING | D | REQ-SICAT-0026 | `tests/regulatory/compliance-gates.test.js` + `tests/unit/rule-evaluators.test.js` | ⚠️ PR-D1: evaluator entregue — `applicable` sem `acquired` → BLOCK bruto `VPO_NOT_ACQUIRED` (clamp mantém WARN enquanto `blocking=false` no seed); `acquired` (amount>0 + provider/evidência manual) → PASS; `not_applicable` → NOT_APPLICABLE com o reason evidenciado |
| TR-VPO-003 | VPO separado do valor do frete | Lei 10.209/2001 | GATE_CONTRACT | A (modelagem) / D (rastreabilidade) | REQ-SICAT-0026 | `tests/regulatory/compliance-gates.test.js` + `tests/unit/rule-evaluators.test.js` | ⚠️ PR-D1: além da separação ESTRUTURAL (campo decomposto, Fase A), agora confere se `vpoAmount` bate com o valor efetivamente adquirido na alocação — divergência → WARN `VPO_AMOUNT_MISMATCH` |
| TR-VPO-004 | Referência do VPO no MDF-e quando exigida | Res. ANTT 6.024/2023 + regras MDF-e | GATE_FISCAL | E | REQ-SICAT-0027 | `tests/regulatory/compliance-gates.test.js` + `tests/api/transporte-dfe.test.js` | ⚠️ PR-E1: evaluator entregue — `acquired` + MDF-e com `valePed` vinculado → PASS (`vpo_allocations.mdfe_reference` preenchida pelo side-effect de `transport-fiscal-service.ts`); `acquired` sem `valePed` no MDF-e → WARN `VPO_MDFE_REFERENCE_MISSING`. Versão do seed segue `UNDER_REVIEW` (clamp mantém WARN) |
| TR-NFE-001 | NF-e autorizada e compatível | Ajustes SINIEF/MOC NF-e | GATE_FISCAL | E | REQ-SICAT-0027 | `tests/regulatory/compliance-gates.test.js` + `tests/unit/dfe-parser.test.js` + `tests/unit/dfe-validator.test.js` + `tests/api/transporte-dfe.test.js` | ✅ PR-E1: evaluator entregue — NF-e ausente → WARN `DFE_MISSING_NFE` (pode legitimamente faltar); autorizada + válida → PASS; `invalid`/`cancelled`/`denied` → BLOCK bruto |
| TR-CTE-001 | CT-e autorizado e compatível | Ajustes SINIEF/MOC CT-e | GATE_FISCAL | E | REQ-SICAT-0027 | `tests/regulatory/compliance-gates.test.js` + `tests/unit/dfe-parser.test.js` + `tests/unit/dfe-validator.test.js` + `tests/api/transporte-dfe.test.js` | ✅ PR-E1: mesmo evaluator de TR-NFE-001, aplicado ao CT-e — ausente → WARN `DFE_MISSING_CTE` |
| TR-MDFE-001 | MDF-e autorizado e compatível | Ajustes SINIEF/MOC MDF-e | GATE_FISCAL | E | REQ-SICAT-0027 | `tests/regulatory/compliance-gates.test.js` + `tests/unit/dfe-parser.test.js` + `tests/unit/dfe-validator.test.js` + `tests/api/transporte-dfe.test.js` | ✅ PR-E1: MDF-e é o ÚNICO dos três com ausência em BLOCK bruto `MDFE_MISSING` (documento obrigatório para o transporte) |
| TR-MDFE-002 | CIOT presente no MDF-e quando obrigatório | NT MDF-e 2026.001 | GATE_FISCAL | E | REQ-SICAT-0027 | `tests/regulatory/compliance-gates.test.js` + `tests/unit/dfe-validator.test.js` + `tests/regulatory/dfe-schema-registry-time-travel.test.js` | ⚠️ PR-E1: evaluator lê `validationIssueCodes` do documento (`MDFE_CIOT_MISSING`/`MDFE_CIOT_MISMATCH`, já decididos por `dfe-validator.ts` contra o perfil do schema registry) — nunca recalcula a regra da NT por conta própria. `MDFE_CIOT_MISSING` é a antecipação em TESTE da NT 2026.001 (`dfe_schema_registry` com `validationProfile.mdfeRequiresCiot=true`, `effectiveFrom` [ASSUMPTION] 2026-10-01). Versão do seed segue `UNDER_REVIEW` (clamp mantém WARN) |
| TR-SEG-001 | RCTR-C vigente | Lei 14.599/2023 | GATE_PRE_BOARDING | F | REQ-SICAT-0028 | a criar | 📋 |
| TR-SEG-002 | RC-DC vigente | Lei 14.599/2023 | GATE_PRE_BOARDING | F | REQ-SICAT-0028 | a criar | 📋 |
| TR-SEG-003 | RC-V vigente | Lei 14.599/2023 | GATE_PRE_BOARDING | F | REQ-SICAT-0028 | a criar | 📋 |
| TR-PGR-001 | PGR vigente quando requerido | Lei 14.599/2023 + regulamentação securitária | GATE_PRE_BOARDING | F | REQ-SICAT-0028 | a criar | 📋 |
| TR-COMP-001 | Conjunto mínimo para liberação aprovado | Conjunto regulatório | GATE_RELEASE | A (estrutura) / C+ (efetivo) | REQ-SICAT-0019 | `tests/regulatory/compliance-gates.test.js` | ⚠️ evaluator declarativo entregue (Fase A); verificação externa/cálculo nas fases B/C+ |

## Pendências [LEGAL REVIEW REQUIRED] e [EXTERNAL DEPENDENCY]

Registro vivo. Nada aqui bloqueia a Fase A (que não tem integração externa nem regra bloqueante);
tudo aqui bloqueia a promoção das fases correspondentes.

| ID | Tipo | Pendência | Bloqueia | Dono | Status |
|---|---|---|---|---|---|
| P1 | LEGAL | Monitorar **Veto nº 43/2026** (Lei 15.485/2026): eventual derrubada reintroduz dispositivos (ex.: antecipação de 70% do frete). Enquanto vigente o veto, a regra NÃO existe no produto — verificado em 14/08/2026: veto mantido, "Aguardando Decreto Legislativo" no Congresso | Catálogo (nova rule_version se mudar) | operador | 🕓 monitorando |
| P2 | LEGAL | Regulamentação ANTT complementar à Lei 15.485/2026 (ex.: revalidação anual do RNTRC — TR-RNTRC-003 em `AWAITING_REGULATION`) | Fase C (flip de TR-RNTRC-003) | operador | 🕓 monitorando |
| P3 | LEGAL | Validação jurídica das tabelas/coeficientes de piso vigentes (Res. 5.867/2020 + atualizações 2026) antes de TR-PMF-002/003 virarem bloqueantes — Tabela A transcrita da fonte oficial e carregável via `npm run load:freight-floor` como `pending_review`; Tabelas B/C/D pendentes de transcrição conferida; conferência contra o DOU pendente | Fase B (flip de TR-PMF-002/003/004 a bloqueante) | operador | 🕓 Tabela A carregada, aguardando conferência |
| P4 | EXTERNAL | Credenciamento/integração ANTT para verificação de RNTRC (consulta operacional ≠ dados abertos) — dados abertos integrados como CACHE INFORMATIVO (PR-C1, evidência da sondagem real de 14/08/2026: `package_show` 200 com ~70 resources mensais; `datastore_search` 200 com filtro exato por documento mascarado/`numero_rntrc`, `total: 1` confirmado; resource do mês corrente com `datastore_active=false` no dia da sondagem → fallback de download streaming do CSV, com cache local por resource id; `situacao_rntrc` só assume `ATIVO`/`PENDENTE` no dado publicado — `not_found` nunca prova irregularidade); consulta operacional credenciada (`strategy: 'antt'`) segue [EXTERNAL DEPENDENCY], interface reservada sem implementação | Fase C | operador | ⚠️ dados abertos entregues (PR-C1); credenciada pendente |
| P5 | EXTERNAL | Contratação/homologação de provedor CIOT/PEF (instituições habilitadas ANTT/Bacen) — ciclo completo entregue com provedor `mock` (PR-C2, `gateways/ciot-provider-gateway.ts`, padrão DL-102 desde o dia 1); `CIOT_PROVIDER_MODE=real` recusa com `CIOT_PROVIDER_NOT_CONFIGURED` até um provedor ser contratado | Fase C | operador | ⚠️ ciclo mock entregue; provedor real pendente |
| P6 | EXTERNAL | Fornecedoras de VPO habilitadas (catálogo configurável, não hardcoded) — cadastro `vpo_providers` entregue (PR-D1) e carregado via `npm run load:vpo-providers` a partir de `reference-data/vpo/fornecedoras-habilitadas.json` (16 fornecedoras reais pesquisadas em gov.br/antt em 14/08/2026: Sem Parar, Repom, Roadcard, Target, Move Mais, PagBem, Bradesco, nstech, Veloe, ConectCar, Logcard, Strada Pay, NDD Tech, Extratta, AuthPay, Ailog Bank — desde 2025 a ANTT exige meios exclusivamente eletrônicos). Falta a INTEGRAÇÃO TÉCNICA com qualquer uma delas — `gateways/vpo-gateway.ts` só tem `mode: 'mock'`; `VPO_PROVIDER_MODE=real` recusa com `VPO_PROVIDER_NOT_CONFIGURED` | Fase D (aquisição via provedor real) | operador | ⚠️ cadastro configurável entregue; integração técnica pendente |
| P7 | EXTERNAL | XMLs reais (NF-e/CT-e/MDF-e) de clientes/design partner + acompanhamento do cronograma da NT MDF-e 2026.001 — import/validação entregue com XMLs SINTÉTICOS (PR-E1, `tests/fixtures/regulatory/dfe/`, estruturalmente corretos mas fictícios); XMLs reais de design partner seguem pendentes para calibração fina do parser contra variações de layout do mundo real. `effectiveFrom` da entrada NT 2026.001 no schema registry é [ASSUMPTION] (2026-10-01, ~45 dias após a baseline) — cronograma técnico oficial da SEFAZ/CONFAZ ainda não publicado | Fase E | operador | ⚠️ import/validação com XMLs sintéticos entregue; XMLs reais + cronograma oficial da NT pendentes |
| P8 | EXTERNAL | Integração ANTT-seguros ou parceiro segurador (fallback: evidência manual) | Fase F | operador | 📋 |
| P9 | LEGAL+EXTERNAL | Go/no-go de emissão fiscal própria (certificados digitais, SEFAZ, responsabilidade fiscal) — exige ADR próprio | Fase G | operador | 📋 |
| P10 | LEGAL | Revalidação periódica da baseline (o relatório é de 13/08/2026; normas de 2026 seguem em transição) | Programa contínuo | operador | 🕓 monitorando |

## Ondas do programa

Resumo executivo do roadmap (detalhe no relatório, seção "Roadmap de implementação", e no plano
aprovado do programa). REQs: `REQ-SICAT-0017+` (criação na Onda 0).

| Onda | Fase | Entrega | Pré-condição |
|---|---|---|---|
| 0 | Fundação | Baseline em docs (este PR) + REQs em `specs/` + DL-103/ADRs | — |
| 1 | A | Catálogo regulatório + transportadores/veículos + TransportOperation + motor de compliance (sem integração externa) | Onda 0 |
| 1.5 | A (UI) | ✅ Navegação Transporte + operações lista/detalhe + painel de conformidade + regras read-only (PR-F1, atrás de `VITE_FEATURE_TRANSPORTE`) | Onda 1 |
| 2 | B | FreightFloorEngine + gates de oferta/contratação (shadow WARN → canário → BLOCK) | P3 |
| 3 | C | RNTRC + CIOT (gateways dedicados, jobs, reconciliação) | P4, P5 |
| 4 | D | ✅ VPO applicability + antecipação + evidência (PR-D1) — cadastro configurável de fornecedoras entregue; integração técnica real segue em P6 | P6 |
| 5 | E | ✅ Import/validação NF-e/CT-e/MDF-e + vínculos CIOT/VPO↔MDF-e (PR-E1) — schema registry versionado, XMLs sintéticos; XMLs reais de design partner seguem em P7 | P7 |
| 6 | F | Seguros RCTR-C/RC-DC/RC-V + PGR | P8 |
| 7 | G | Emissão fiscal (go/no-go com ADR próprio) | P9 |
| 8 | H | Regulatory Watch + analytics + hardening | Ondas 1–6 |
