---
title: "Índice de Handoffs e Checkpoints"
status: reference
applies_to: [sicat]
updated: 2026-06-09
language: pt-BR
---

# Índice de Handoffs e Checkpoints

Documento de navegação para os checkpoints versionados da plataforma SICAT, organizados por área de entrega e cadeia de trabalho.

## Como usar

1. **Busque por work_id** (ex.: `centro-operacional-sicat`, `frontend-ux-navegacao-shell`) nas tabelas abaixo.
2. **Cada linha aponta para o checkpoint inicial** de uma frente operacional.
3. **Dentro de cada pasta**, siga o protocolo: `00-orchestration.md` → `01-baseline-docs.md` → ... → `10-documentation-final.md`.
4. **Decision log** — consulte [docs/copilot/13-decision-log.md](../copilot/13-decision-log.md) para decisões arquiteturais associadas (ex.: DL-093, DL-022).

## Handoffs por Cadeia (docs/handoffs/)

### Centro Operacional e Relatórios

| Work ID | Descrição | Checkpoint | Status |
|---|---|---|---|
| `centro-operacional-sicat` | Camada operacional dedicada: operations-dashboard, jobs-console, audit-explorer, cetesb-health, mtr-reports | [00-orchestration.md](centro-operacional-sicat/00-orchestration.md) | ✅ COMPLETADO |
| `sigor-sicat-gap-map` | Mapa de lacunas entre SIGOR (novo) e SICAT; estratégia de reuso/substituição | [10-documentation-final.md](sigor-sicat-gap-map/10-documentation-final.md) | ✅ COMPLETADO |

### Frontend UX

| Work ID | Descrição | Checkpoint | Status |
|---|---|---|---|
| `frontend-ux-navegacao-shell` | App Shell decomposto em `Sicat*` + fonte declarativa única de navegação | [00-orchestration.md](frontend-ux-navegacao-shell/00-orchestration.md) | ✅ COMPLETADO |
| `frontend-ux-tema-cdf-modulos` | Tema autenticado alinhado à home + navegação modular por domínio + módulo CDF | [00-orchestration.md](frontend-ux-tema-cdf-modulos/00-orchestration.md) | ✅ COMPLETADO |
| `frontend-cetesb-flows-hardening` | Hardening de fluxos CETESB no frontend (validação, tratamento de erros, resiliência) | [00-orchestration.md](frontend-cetesb-flows-hardening/00-orchestration.md) | ✅ COMPLETADO |

### Infraestrutura e Backend

| Work ID | Descrição | Checkpoint | Status |
|---|---|---|---|
| `mtr-provisorio-fluxo-base` | Fluxo base do MTR Provisório (wizard, validação, submissão) | [00-orchestration.md](mtr-provisorio-fluxo-base/00-orchestration.md) | ✅ COMPLETADO |
| `mtr-provisorio-wizard-frontend` | Frontend do wizard do MTR Provisório (passos, validação, UX) | [08-qa-validation.md](mtr-provisorio-wizard-frontend/08-qa-validation.md) | ✅ COMPLETADO |
| `dmr-fluxo-base` | Fluxo base do DMR (emissão, validação, integração CETESB) | [00-orchestration.md](dmr-fluxo-base/00-orchestration.md) | ✅ COMPLETADO |

### Inteligência Artificial e Chat

| Work ID | Descrição | Checkpoint | Status |
|---|---|---|---|
| `conversacional-operacional-ia` | Camada conversacional operacional com IA (orquestrador, intenções, ações, memory) | [README.md](conversacional-operacional-ia/README.md) | ✅ COMPLETADO |
| `chat-copiloto-operacional` | Chat orquestrador do Centro Operacional (UI, roteamento, observabilidade) | [00-orchestration.md](chat-copiloto-operacional/00-orchestration.md) | ✅ COMPLETADO |
| `chat-sicat-cost-optimization` | Otimização de custo de IA (caching, batching, modelo econômico) | [00-orchestration.md](chat-sicat-cost-optimization/00-orchestration.md) | ✅ COMPLETADO |

### Automação e CI

| Work ID | Descrição | Checkpoint | Status |
|---|---|---|---|
| `ci-quality-gate-automatizado` | CI com quality gates automáticos (contrato, smoke, cobertura) | [00-orchestration.md](ci-quality-gate-automatizado/00-orchestration.md) | ✅ COMPLETADO |
| `enforce-agent-delegation` | Enforcement de delegação de agentes (orquestrador → especialistas) | [00-orchestration.md](enforce-agent-delegation/00-orchestration.md) | ✅ COMPLETADO |

### Outras Cadeias

| Work ID | Descrição | Checkpoint | Status |
|---|---|---|---|
| `docs-structure-current-reorg` | Reorganização atual da estrutura de documentação | [10-documentation-final.md](docs-structure-current-reorg/10-documentation-final.md) | ✅ COMPLETADO |
| `job-stuck-manifest-print` | Diagnóstico e resolução de jobs presos em manifest print | [07-observability-admin.md](job-stuck-manifest-print/07-observability-admin.md) | ✅ COMPLETADO |

## Handoffs Técnicos (docs/copilot/handoffs/)

Pastas DL-### contêm checkpoints detalhados associados a decisões arquiteturais.

Exemplos:

| DL | Tema | Handoff | Status |
|---|---|---|---|
| DL-100 | Refatoração UX/UI corporativa — design system `Sicat*` | [docs/copilot/handoffs/DL-100/](../copilot/handoffs/DL-100/) | ✅ COMPLETADO |
| DL-099 | Tema autenticado alinhado à home + navegação modular | [docs/copilot/handoffs/DL-099/](../copilot/handoffs/DL-099/) | ✅ COMPLETADO |
| DL-098 | App Shell decomposto + fonte declarativa de navegação | [docs/copilot/handoffs/DL-098/](../copilot/handoffs/DL-098/) | ✅ COMPLETADO |
| DL-093 | Migração completa JS → TypeScript + CORS | [docs/copilot/handoffs/DL-093/](../copilot/handoffs/DL-093/) | ✅ COMPLETADO |
| DL-022 | Evolução de persistência, fila e observabilidade | [docs/copilot/handoffs/DL-022/](../copilot/handoffs/DL-022/) | ✅ COMPLETADO |

**Para lista completa de DL-###**, consulte a tabela em [docs/copilot/decisions-INDEX.md](../copilot/decisions-INDEX.md).

## Protocolo de Checkpoint

Cada handoff segue o padrão de fases:

1. `00-orchestration.md` — visão geral, dependências, time
2. `01-baseline-docs.md` — estado inicial e artefatos de entrada
3. `02-...` até `08-...` — fases técnicas de implementação
4. `09-qa-validation.md` — validação, testes, aprovação
5. `10-documentation-final.md` — documentação final, lições aprendidas

Nem todos os checkpoints existem em todas as cadeias (protocolo é flexível por tipo de trabalho).

## Referências

- [docs/README.md](../README.md) — índice estrutural geral
- [docs/copilot/README.md](../copilot/README.md) — documentação da camada Copilot
- [docs/copilot/13-decision-log.md](../copilot/13-decision-log.md) — decisões arquiteturais (DL-###)
- [docs/10-estado-atual/estado-atual.md](../10-estado-atual/estado-atual.md) — estado atual do produto
- [../../AGENTS.md](../../AGENTS.md) — fronteiras app-wide
- [../../backend/AGENTS.md](../../backend/AGENTS.md) — fronteiras backend
