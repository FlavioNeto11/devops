---
title: "SICAT Transporte — Guia do programa (camada viva sobre a baseline regulatória)"
status: reference
applies_to: [sicat]
updated: 2026-08-13
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
| 1 | Bounded context **Transporte** separado do ambiental (MTR ambiental ≠ MDF-e; não reutilizar `manifest`) | ⚠️ | DL-103 + migrations `021..023` (PR-A1..A3) — em construção: cadastros entregues (PR-A3); agregado TransportOperation no PR-A4 |
| 2 | Agregado central **TransportOperation** com máquina de estados explícita; transição só via gate | 📋 | `transport-state-machine.ts` (PR-A4) |
| 3 | **Catálogo regulatório temporal** (fontes, regras TR-*, versões com vigência) — nunca if/else espalhado | ✅ | PR-A1: `021_transporte_regulatory_catalog.sql` + seed (`regulatory-rules-seed.ts`) + repo (`regulatory-repo.ts`) |
| 4 | **TransportComplianceService**: gateway traz fatos, motor decide; resposta com ruleCode/base legal/versão/evidência | 📋 | PR-A5 |
| 5 | Nenhuma regra nasce bloqueante; promoção a `blocking=true` exige revisão humana | ✅ | Check constraint + seed (PR-A1: `chk_regrulev_blocking_reviewed`, seed 100% `blocking=false`); clamp BLOCK→WARN no motor fica no PR-A5 |
| 6 | `FreightFloorEngine` versionado, coeficiente **jamais** hardcoded; validação em GATE_PROPOSAL (antes da oferta) | 🕓 | Fase B — bloqueado por [LEGAL REVIEW REQUIRED] das tabelas vigentes |
| 7 | **Não** implementar antecipação fixa de 70% do frete (dispositivo vetado — Veto 43/2026) | ✅ | Recusa registrada; monitorar veto (pendência P1) |
| 8 | CIOT: ciclo completo com provedor abstraído; `REGISTERED ≠ COMPLIANT` | 🕓 | Fase C — bloqueado por [EXTERNAL DEPENDENCY] |
| 9 | `VpoApplicabilityEngine` (VPO não é checkbox universal; NOT_APPLICABLE com justificativa) | 📋 | Fase D |
| 10 | Fiscal: começar por **importação + validação** de XML; emissão só em fase posterior com go/no-go | ✅ | Decisão de roadmap adotada (Fases E e G) |
| 11 | Seguros RCTR-C/RC-DC/RC-V + PGR com verificação multiestrategia (`InsuranceVerificationProvider`) | 📋 | Fase F |
| 12 | Regulatory Watch com aprovação humana obrigatória (IA sugere, humano ativa) | 📋 | Fase H |
| 13 | Testes regulatórios como categoria própria + fixtures de fronteira temporal (24/05/2026, 06/08/2026) | ⚠️ | `tests/regulatory/effective-dates.test.js` nasceu no PR-A1 (fronteira 24/05/2026 coberta); consolida no PR-A6 |
| 14 | Regra de engenharia: mudança de `RegulatoryRuleVersion` exige fixture antes/depois da vigência | 📋 | Meta-guarda no PR-A6 |
| 15 | Reutilizar fila/jobs/DLQ, auditoria por correlationId, idempotência, RBAC, Centro Operacional, design system `Sicat*` | ✅ | Padrão da casa confirmado na exploração; sem segundo framework |
| 16 | Compliance da Fase A **síncrono** (sem chamada externa; job types só quando houver integração) | ⚠️ | Adaptação ao relatório: 202/job fica para a Fase C (decisão D1 do plano) |
| 17 | UX: painel "CONFORMIDADE DA OPERAÇÃO" (PASS/WARN/BLOCK por requisito) na ficha da operação | 📋 | Onda 1.5 (PR-F1), componível com `Sicat*` existentes |
| 18 | LGPD: minimização de dados de risco; reason code + evidência, nunca cópia integral de retorno externo | 📋 | NFR + Fases C/F |

## Matriz de rastreabilidade

LEGAL SOURCE → REQ → regra TR-* → entidade/DB → API → gate → UI → teste → evidência.
Todas as regras vivem no catálogo (REQ-SICAT-0018) e são avaliadas pelo motor de compliance
(REQ-SICAT-0019); a coluna REQ aponta o requisito que implementa a regra em si. A coluna Teste
será preenchida conforme os testes nascerem (`tests/regulatory/`).

| Regra | Título curto | Base legal principal | Gate default | Fase | REQ | Teste | Estado |
|---|---|---|---|---|---|---|---|
| TR-RNTRC-001 | RNTRC regular para a operação | Lei 11.442/2007 + Res. ANTT 5.982/2022 | GATE_CONTRACT | A (evaluator local) / C (verificação) | REQ-SICAT-0024 | a criar | 📋 |
| TR-RNTRC-002 | Veículo compatível com transportador/operação | Res. ANTT 5.982/2022 | GATE_PRE_BOARDING | C | REQ-SICAT-0024 | a criar | 📋 |
| TR-RNTRC-003 | Revalidação anual quando exigível | Lei 15.485/2026 (dep. regulamentação ANTT) | GATE_CONTRACT | C | REQ-SICAT-0024 | a criar | 🕓 AWAITING_REGULATION |
| TR-PMF-001 | Determinar aplicabilidade do piso | Lei 13.703/2018 + Res. ANTT 5.867/2020 | GATE_PROPOSAL | A/B | REQ-SICAT-0022 | a criar | 📋 |
| TR-PMF-002 | Não permitir oferta/publicação abaixo do piso | Lei 13.703/2018 + Lei 15.485/2026 | GATE_PROPOSAL | B | REQ-SICAT-0023 | a criar | 📋 |
| TR-PMF-003 | Não permitir contratação abaixo do piso | Lei 13.703/2018 + Lei 15.485/2026 | GATE_CONTRACT | B | REQ-SICAT-0023 | a criar | 📋 |
| TR-PMF-004 | Usar versão do piso vigente na data | Res. ANTT 5.867/2020 (tabelas vigentes) | GATE_PROPOSAL | B | REQ-SICAT-0022 | a criar | 📋 |
| TR-CIOT-001 | Obrigatoriedade do CIOT | Res. 5.862/2019 + Res. 6.078/2026 + Lei 15.485/2026 | GATE_CIOT | A (catálogo) / C (ciclo) | REQ-SICAT-0025 | `tests/regulatory/effective-dates.test.js` | 📋 |
| TR-CIOT-002 | CIOT antes do início da operação | Res. ANTT 6.078/2026 | GATE_RELEASE | C | REQ-SICAT-0025 | a criar | 📋 |
| TR-CIOT-003 | Responsável pelo CIOT conforme enquadramento | Lei 15.485/2026 | GATE_CIOT | C | REQ-SICAT-0025 | a criar | 📋 |
| TR-CIOT-004 | Dados obrigatórios do CIOT completos | Lei 15.485/2026 | GATE_CIOT | A (completude local) | REQ-SICAT-0025 | a criar | 📋 |
| TR-CIOT-005 | CIOT vinculado ao MDF-e quando aplicável | Lei 15.485/2026 + NT MDF-e 2026.001 | GATE_FISCAL | E | REQ-SICAT-0027 | a criar | 🕓 UNDER_REVIEW |
| TR-PAY-001 | Prazo/forma de pagamento conforme norma vigente | Lei 15.485/2026 (30 dias úteis) | GATE_CONTRACT | A (declarativo) | REQ-SICAT-0025 | a criar | 📋 |
| TR-VPO-001 | Determinar aplicabilidade do VPO | Lei 10.209/2001 + Res. ANTT 6.024/2023 | GATE_PRE_BOARDING | A (declarativo) / D (engine) | REQ-SICAT-0026 | a criar | 📋 |
| TR-VPO-002 | VPO antecipado antes do embarque | Lei 10.209/2001 | GATE_PRE_BOARDING | D | REQ-SICAT-0026 | a criar | 📋 |
| TR-VPO-003 | VPO separado do valor do frete | Lei 10.209/2001 | GATE_CONTRACT | A (modelagem) | REQ-SICAT-0026 | a criar | 📋 |
| TR-VPO-004 | Referência do VPO no MDF-e quando exigida | Res. ANTT 6.024/2023 + regras MDF-e | GATE_FISCAL | E | REQ-SICAT-0027 | a criar | 🕓 UNDER_REVIEW |
| TR-NFE-001 | NF-e autorizada e compatível | Ajustes SINIEF/MOC NF-e | GATE_FISCAL | E | REQ-SICAT-0027 | a criar | 📋 |
| TR-CTE-001 | CT-e autorizado e compatível | Ajustes SINIEF/MOC CT-e | GATE_FISCAL | E | REQ-SICAT-0027 | a criar | 📋 |
| TR-MDFE-001 | MDF-e autorizado e compatível | Ajustes SINIEF/MOC MDF-e | GATE_FISCAL | E | REQ-SICAT-0027 | a criar | 📋 |
| TR-MDFE-002 | CIOT presente no MDF-e quando obrigatório | NT MDF-e 2026.001 | GATE_FISCAL | E | REQ-SICAT-0027 | a criar | 🕓 UNDER_REVIEW |
| TR-SEG-001 | RCTR-C vigente | Lei 14.599/2023 | GATE_PRE_BOARDING | F | REQ-SICAT-0028 | a criar | 📋 |
| TR-SEG-002 | RC-DC vigente | Lei 14.599/2023 | GATE_PRE_BOARDING | F | REQ-SICAT-0028 | a criar | 📋 |
| TR-SEG-003 | RC-V vigente | Lei 14.599/2023 | GATE_PRE_BOARDING | F | REQ-SICAT-0028 | a criar | 📋 |
| TR-PGR-001 | PGR vigente quando requerido | Lei 14.599/2023 + regulamentação securitária | GATE_PRE_BOARDING | F | REQ-SICAT-0028 | a criar | 📋 |
| TR-COMP-001 | Conjunto mínimo para liberação aprovado | Conjunto regulatório | GATE_RELEASE | A (estrutura) / C+ (efetivo) | REQ-SICAT-0019 | a criar | 📋 |

## Pendências [LEGAL REVIEW REQUIRED] e [EXTERNAL DEPENDENCY]

Registro vivo. Nada aqui bloqueia a Fase A (que não tem integração externa nem regra bloqueante);
tudo aqui bloqueia a promoção das fases correspondentes.

| ID | Tipo | Pendência | Bloqueia | Dono | Status |
|---|---|---|---|---|---|
| P1 | LEGAL | Monitorar **Veto nº 43/2026** (Lei 15.485/2026): eventual derrubada reintroduz dispositivos (ex.: antecipação de 70% do frete). Enquanto vigente o veto, a regra NÃO existe no produto | Catálogo (nova rule_version se mudar) | operador | 🕓 monitorando |
| P2 | LEGAL | Regulamentação ANTT complementar à Lei 15.485/2026 (ex.: revalidação anual do RNTRC — TR-RNTRC-003 em `AWAITING_REGULATION`) | Fase C (flip de TR-RNTRC-003) | operador | 🕓 monitorando |
| P3 | LEGAL | Validação jurídica das tabelas/coeficientes de piso vigentes (Res. 5.867/2020 + atualizações 2026) antes de qualquer coeficiente entrar no catálogo e de TR-PMF-002/003 virarem bloqueantes | Fase B (FreightFloorEngine efetivo) | operador | 📋 |
| P4 | EXTERNAL | Credenciamento/integração ANTT para verificação de RNTRC (consulta operacional ≠ dados abertos) | Fase C | operador | 📋 |
| P5 | EXTERNAL | Contratação/homologação de provedor CIOT/PEF (instituições habilitadas ANTT/Bacen) | Fase C | operador | 📋 |
| P6 | EXTERNAL | Fornecedoras de VPO habilitadas (catálogo configurável, não hardcoded) | Fase D | operador | 📋 |
| P7 | EXTERNAL | XMLs reais (NF-e/CT-e/MDF-e) de clientes/design partner + acompanhamento do cronograma da NT MDF-e 2026.001 | Fase E | operador | 📋 |
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
| 1.5 | A (UI) | Navegação Transporte + operações lista/detalhe + painel de conformidade + regras read-only | Onda 1 |
| 2 | B | FreightFloorEngine + gates de oferta/contratação (shadow WARN → canário → BLOCK) | P3 |
| 3 | C | RNTRC + CIOT (gateways dedicados, jobs, reconciliação) | P4, P5 |
| 4 | D | VPO applicability + antecipação + evidência | P6 |
| 5 | E | Import/validação NF-e/CT-e/MDF-e + vínculos CIOT/VPO↔MDF-e | P7 |
| 6 | F | Seguros RCTR-C/RC-DC/RC-V + PGR | P8 |
| 7 | G | Emissão fiscal (go/no-go com ADR próprio) | P9 |
| 8 | H | Regulatory Watch + analytics + hardening | Ondas 1–6 |
