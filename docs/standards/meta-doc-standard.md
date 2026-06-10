---
title: "Padrão de Meta-Documentação (CLAUDE.md / AGENTS.md / skills)"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Padrão de Meta-Documentação

> **Meta-documentação** é a camada que faz agentes de IA (Claude Code, GitHub Copilot e futuros)
> operarem com robustez e acerto neste monorepo. Este é o documento **canônico** de como autorar
> `AGENTS.md`, `CLAUDE.md` e skills em **todos os escopos** (plataforma → app → componente →
> pacote). Para o estilo de prosa, ver [`documentation-style.md`](./documentation-style.md).

## 1. Princípio central: AGENTS.md é a fonte única

Decisão da plataforma (operador único, múltiplas ferramentas de IA):

- **`AGENTS.md` é o contrato canônico, tool-agnóstico.** Contém escopo, ordem de leitura, matriz de
  decisão, fronteiras de operação (segura/com-aprovação/proibida) e protocolo de handoff. Qualquer
  agente (Claude, Copilot, Cursor, etc.) lê este arquivo primeiro.
- **`CLAUDE.md` é a camada específica do Claude.** Contém armadilhas do código, variáveis de
  ambiente, fluxo de debug/dev — e **aponta** para o `AGENTS.md` em vez de repetir as fronteiras.
- **`.github/` (Copilot) é implementação.** `copilot-instructions.md`, `agents/`, `prompts/` e
  `instructions/` permanecem como a forma de o Copilot executar; **não duplicam** o conteúdo de
  fronteira/decisão, que vive só no `AGENTS.md`.

**Regra anti-duplicação:**

| Conteúdo | Mora em |
|---|---|
| Escopo, fronteiras, matriz de decisão, handoff | `AGENTS.md` (só) |
| Execução específica do Copilot (prompts, instructions) | `.github/` (só) |
| Armadilhas, env vars, debug específicos do Claude | `CLAUDE.md` (só) |
| Regras de infra inegociáveis | [`hard-constraints.md`](./hard-constraints.md) (só) — referenciar |

## 2. Arquitetura por escopo

| Escopo | Arquivos | Propósito |
|---|---|---|
| **Raiz da plataforma** | `C:\devops\CLAUDE.md` + `AGENTS.md` | Ponto de entrada; mapa do monorepo; fronteiras globais |
| **Por app** (`apps/<name>/`) | `CLAUDE.md` + `AGENTS.md` | Stack, decisões, armadilhas, especialistas, handoff |
| **Componente** (`console/`, `portal/`) | `AGENTS.md` (+ README) | Stub: escopo, fronteiras mínimas |
| **Pacote** (`packages/<name>/`) | `AGENTS.md` (+ README) | Mínimo: propósito, exports, versionamento |
| **Componente de infra** (`platform/<x>/`) | `README.md` | Config, namespace, troubleshooting (sem CLAUDE/AGENTS) |

> A **ordem de leitura** vive **dentro** do CLAUDE.md/AGENTS.md de cada escopo (como no
> `apps/gymops/AGENTS.md`). Não criamos arquivos `reading-order.md` separados.

## 3. Precedência quando há conflito

Do mais específico ao mais geral:

1. `CLAUDE.md` / `AGENTS.md` do **escopo mais específico** (app) — prevalece se marcado explicitamente.
2. `docs/standards/*` — padrões da plataforma (incl. [`hard-constraints.md`](./hard-constraints.md)).
3. `C:\devops\CLAUDE.md` / `AGENTS.md` — contrato da plataforma.
4. `~/.claude/CLAUDE.md` — contrato global da máquina.

Em conflito de comportamento de agente, o `AGENTS.md` prevalece sobre o `CLAUDE.md` do mesmo escopo
(o humano lê CLAUDE.md para contexto; o agente segue AGENTS.md para operar).

## 4. Seções obrigatórias do `AGENTS.md`

Espelha o padrão maduro de [`apps/gymops/AGENTS.md`](../../apps/gymops/AGENTS.md):

1. **Front-matter** (`title`, `status`, `applies_to`, `updated`, `language`).
2. **Visão geral do escopo** — 1 parágrafo (o que é, stack em uma linha, estado).
3. **Como começar uma tarefa** — passos fixos (ler estado atual → planejar → executar → validar →
   atualizar docs → relatório).
4. **Ordem oficial de leitura** — tabela numerada dos docs a ler antes de implementar.
5. **Matriz de decisão** — tipo de tarefa → especialista/instrução/skill aplicável.
6. **Fronteiras de operação** — três tabelas: **seguras** (autônomas/idempotentes), **com aprovação**
   (efeito colateral/produção), **proibidas** (force push, editar segredos, etc.).
7. **Regras de segurança** do escopo.
8. **Validação obrigatória** — comandos a rodar antes de concluir.
9. **Política de atualização de docs** — o que atualizar quando mudar X.
10. **Princípios não-negociáveis** — a lista curta do que nunca quebrar.

## 5. Seções obrigatórias do `CLAUDE.md`

1. **Front-matter.**
2. **Ponteiro para o `AGENTS.md`** do escopo (e, no caso de app, para `C:\devops\CLAUDE.md` e
   `~/.claude/CLAUDE.md`) — "comece por aqui".
3. **O que é este escopo** — 1–2 parágrafos.
4. **Stack & decisões de arquitetura** — tabela componente → tecnologia → porquê.
5. **Armadilhas conhecidas** — gotchas reais do código + correção.
6. **Variáveis de ambiente chave** — tabela var → default → quando.
7. **Como trabalhar aqui** — adicionar feature, debugar, publicar, reverter.
8. **Regras inegociáveis** — referência a [`hard-constraints.md`](./hard-constraints.md) + as do escopo.

Stubs de componente/pacote podem ter só um `AGENTS.md` enxuto (seções 1, 2, 6 e 10).

## 6. Front-matter de meta-docs

Igual ao dos docs canônicos ([`documentation-style.md` §3](./documentation-style.md)):

```yaml
---
title: "<APP> — Manual para Claude Code"   # ou "Contrato de Agentes"
status: canonical
applies_to: [<app>]                         # platform | sicat | gymops | ...
updated: AAAA-MM-DD
language: pt-BR
---
```

## 7. Skills (`.claude/skills/`)

Quando um escopo definir skills procedurais reutilizáveis:

- Uma skill por pasta, com `SKILL.md` e front-matter mínimo `name` + `description` (a `description`
  decide o disparo — seja específico).
- Mantenha as instruções no corpo; use divulgação progressiva (a skill carrega só quando relevante).
- Skills da plataforma em `C:\devops\.claude/skills/`; por app em `apps/<app>/.claude/skills/`.

> Configuração do harness (`.claude/settings.json`, hooks, permissões) é **config**, não doc — fica
> fora deste padrão; tratar como tarefa separada.

## 8. Protocolo de handoff (quando aplicável)

Para trabalho em etapas que precisa registrar estado para retomada:

- Identifique por `work_id` estável (ex.: `sicat-auth-login-e2e-001`).
- Registre o efêmero em `docs/archive/AAAA-MM/` (ou na convenção do app), **não** misturado aos
  canônicos. Ver [`documentation-style.md` §7](./documentation-style.md).
- Um `INDEX.md` lista os work-ids com estado.

## 9. Reúso: templates

Para criar meta-docs de um app/componente novo, parta dos templates:

- [`../../templates/meta/AGENTS.md.template`](../../templates/meta/AGENTS.md.template)
- [`../../templates/meta/CLAUDE.md.template`](../../templates/meta/CLAUDE.md.template)
- [`../../templates/meta/app-README.md.template`](../../templates/meta/app-README.md.template)

## 10. Checklist de meta-doc

- [ ] `AGENTS.md` é a fonte única das fronteiras/decisão; `CLAUDE.md` aponta para ele.
- [ ] Sem duplicar regras de infra (referência a `hard-constraints.md`).
- [ ] Fronteiras de operação em três tabelas (segura/aprovação/proibida) ancoradas nos scripts reais.
- [ ] Front-matter presente; precedência respeitada.
- [ ] Ordem de leitura embutida (sem arquivo separado).

---
_Referências: [`documentation-style.md`](./documentation-style.md) · [`hard-constraints.md`](./hard-constraints.md) · padrão-ouro em [`apps/gymops/AGENTS.md`](../../apps/gymops/AGENTS.md)._
