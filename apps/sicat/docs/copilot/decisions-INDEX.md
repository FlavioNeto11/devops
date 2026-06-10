---
title: "Índice de Decisões Arquiteturais"
status: reference
applies_to: [sicat]
updated: 2026-06-09
language: pt-BR
---

# Índice de Decisões Arquiteturais (DL-###)

Índice navegável de todas as decisões técnicas da plataforma SICAT. Cada decisão está documentada em [docs/copilot/13-decision-log.md](13-decision-log.md) com detalhes completos.

## Como usar

1. **Busque pelo DL-number** (ex.: DL-093) na tabela abaixo.
2. **Clique no link âncora** para ir direto para a seção no decision-log.
3. **Leia Planejamento, Decisões e Validação** para entender o raciocínio e estado atual.
4. **Consulte Handoff** para checkpoints de implementação (se houver).

## Decisões Arquiteturais (DL-100 a DL-001)

| DL | Título | Status | Handoff/Referência |
|---|---|---|---|
| [DL-100](#dl-100) | Refatoração UX/UI corporativa — design system `Sicat*`, navegação por audiência e decomposição de telas-monstro | ✅ COMPLETADO | [docs/copilot/handoffs/DL-100/](handoffs/DL-100/) |
| [DL-099](#dl-099) | Tema autenticado alinhado à home + navegação modular por domínio + módulo CDF | ✅ COMPLETADO | [docs/copilot/handoffs/DL-099/](handoffs/DL-099/) |
| [DL-098](#dl-098) | App Shell decomposto em `Sicat*` + fonte declarativa única de navegação | ✅ COMPLETADO | [docs/copilot/handoffs/DL-098/](handoffs/DL-098/) |
| [DL-097](#dl-097) | App light conversacional integrado no shell autenticado | ✅ COMPLETADO | — |
| [DL-096](#dl-096) | Migração rule-based → LangChain + LangGraph + LangSmith | ✅ COMPLETADO | — |
| [DL-095](#dl-095) | Memória orquestrada opcional com mempalace na estrutura Copilot | ✅ COMPLETADO | — |
| [DL-094](#dl-094) | Estrutura reutilizável de auditoria externa com Playwright | ✅ COMPLETADO | — |
| [DL-093](#dl-093) | Migração completa JavaScript → TypeScript do backend SICAT + CORS | ✅ COMPLETADO | — |
| [DL-092](#dl-092) | Refatoração estrutural do `executor-handoffs` para protocolo de execução por fases | ✅ COMPLETADO | — |
| [DL-091](#dl-091) | Refatoração estrutural do `orquestrador-mtr` para protocolo de classificação e roteamento | ✅ COMPLETADO | — |
| [DL-090](#dl-090) | Submissão em lote de manifestos a partir da listagem operacional | ✅ COMPLETADO | — |
| [DL-089](#dl-089) | Lote de manifestos com criação homogênea, replicação e cancelamento agrupado | ✅ COMPLETADO | — |
| [DL-088](#dl-088) | Bootstrap automático do kit observável ao disparar o preset `Executar Frente Operacional Coordenada + QA/Docs` | ✅ COMPLETADO | — |
| [DL-087](#dl-087) | Kit observável para frente operacional coordenada com board, briefings e atualização de status | ✅ COMPLETADO | — |
| [DL-086](#dl-086) | Preset operacional coordenado no `orquestrador-mtr` com fechamento serial de QA e documentação | ✅ COMPLETADO | — |
| [DL-085](#dl-085) | Auditoria de redundâncias entre agentes por entregáveis/telas e refinamento de fronteiras | ✅ COMPLETADO | — |
| [DL-084](#dl-084) | Reauditoria estrutural de agents/prompts/skills/instructions/workflows | ✅ COMPLETADO | — |
| [DL-083](#dl-083) | Criação do agente `estrutura-vscode-mtr` para governança da pasta `.vscode` | ✅ COMPLETADO | [docs/copilot/handoffs/DL-083/](handoffs/DL-083/) |
| [DL-082](#dl-082) | Backlog executável da Fase 1 do módulo de Perfis e Acessos | ✅ COMPLETADO | [docs/copilot/handoffs/DL-082/](handoffs/DL-082/) |
| [DL-081](#dl-081) | Criação do agente `perfis-acessos-admin-mtr` e plano do módulo administrativo | ✅ COMPLETADO | — |

### Decisões Anteriores (DL-080 a DL-001)

Para decisões anteriores e histórico completo, consulte [docs/copilot/13-decision-log.md](13-decision-log.md).

## Grouping por Tema

### Frontend UX (DL-100, DL-099, DL-098, DL-097)

- **DL-100**: Design system corporativo
- **DL-099**: Navegação modular e tema autenticado
- **DL-098**: App Shell decomposto
- **DL-097**: Chat integrado

### Backend e Arquitetura (DL-093, DL-022, DL-021)

- **DL-093**: TypeScript + CORS
- **DL-022**: Persistência, fila e observabilidade
- **DL-021**: Reorganização estrutural

### IA e Conversação (DL-096, DL-095)

- **DL-096**: LangChain + LangGraph
- **DL-095**: Memória orquestrada

### Governança Copilot (DL-091, DL-092, DL-088, DL-087, DL-086)

- **DL-091**: Orquestrador
- **DL-092**: Executor de handoffs
- **DL-088/087/086**: Kit observável e preset coordenado

### Operacional (DL-090, DL-089)

- **DL-090/089**: Submissão em lote de manifestos

## Referências

- [docs/copilot/13-decision-log.md](13-decision-log.md) — documento completo
- [docs/handoffs/INDEX.md](../handoffs/INDEX.md) — navegação de checkpoints
- [docs/copilot/README.md](README.md) — guia da camada Copilot
- [../../AGENTS.md](../../AGENTS.md) — fronteiras e contrato
