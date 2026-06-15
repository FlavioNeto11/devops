---
title: "Design System da plataforma NovaIT"
status: canonical
applies_to: [platform]
updated: 2026-06-14
language: pt-BR
---

# Design System da plataforma NovaIT

> Governança de UX/design da plataforma (Fase 5 do roadmap de UX). Fonte dos tokens:
> [`packages/design-tokens`](./packages/design-tokens/README.md). Plano completo de UX/design:
> `~/.claude/plans/fa-a-uma-varredura-completa-wiggly-zebra.md`.

## Por que existe
A plataforma tem ~8 frontends em **3 frameworks** (Vuetify/SICAT, Tailwind/GymOps·RM·Anara, CSS
vanilla/Portal·Console·Reqhub·Recorder). Sem governança, cada um reinventa paleta/dark-mode/espaçamento
e componentes — e a divergência vira bug e custo. Este documento define **uma** linguagem.

## Arquitetura em camadas (a heterogeneidade de framework é proposital)
Um único pacote React não serve Vue nem CSS puro. Então o DS é em camadas, do universal ao específico:

| Camada | Onde | Quem consome |
|---|---|---|
| **A — Tokens** | `packages/design-tokens/tokens.json` | TODOS (Vue, React, vanilla) — via **codegen-sync** |
| **B — `ui-react`** (futuro) | `packages/ui-react` | apps React/Next |
| **C — `ui-vanilla.css`** (futuro) | compartilhado | Portal, Console, Reqhub, Recorder |
| SICAT (Vuetify) | tema Vuetify lê os tokens | — |

### Codegen-sync (regra de ouro dos tokens)
Cada app builda em **contexto Docker isolado** (`docker build apps/<app>`), então **não alcança
`packages/`**. Por isso os tokens são **gerados para dentro de cada app** (`src/tokens.generated.css`)
e versionados, com **drift-check** no CI (`design-tokens-gate`). Mesmo idioma da baseline de `specs/`.
- **Editar tokens:** só em `packages/design-tokens/tokens.json` → `node build.mjs`.
- **Nunca** editar os `*.generated.*` nos apps (são saída). O gate falha se houver drift.

## Estratégia única de dark mode
Classe `.dark` no `<html>` + default por `prefers-color-scheme` + override persistido em `localStorage`.
Apps sem dark (ex.: Anarabottini — bem-estar/luz) são exceção **declarada**, não acidente.

## Checklist de acessibilidade (WCAG 2.1 AA) — obrigatório em todo componente
- **Foco visível:** `outline`/`ring` de 2px + offset; nunca `outline: none` sem alternativa.
- **Alvos de toque ≥ 44×44px** (WCAG 2.5.5).
- **`aria-label`** em botões só-ícone; **`aria-current="page"`** no item de navegação ativo;
  **`aria-expanded`** em disclosure/menus mobile; `aria-live` em regiões dinâmicas (busca, toasts).
- **`label` associado a `input`** (`htmlFor`/`id`) ou `aria-label`.
- **Contraste ≥ 4.5:1** (texto) — validar em light E dark.
- **`prefers-reduced-motion: reduce`** respeitado em toda animação.
- **Cor nunca sozinha:** status com cor + texto/ícone.

## Padrões de UX (estados, formulários, IA)
- **Estados:** loading com **skeleton** (altura fixa, anti-CLS), **empty com ação** contextual,
  **erro acionável** (retry; distinguir timeout × offline), confirmar **toda** ação destrutiva.
- **Formulários:** validação **inline** (blur/change) + hint/microcopy; **anti-duplo-submit**
  (desabilitar + spinner durante a requisição); erros **por campo**.
- **Feedback:** "salvando…" visível em autosave/debounce; toast que não some antes de ser lido;
  "desfazer" em deletes.
- **UX de IA:** spinner "pensando…", **timeout + cancelar**, retry com backoff, erros **estruturados**
  (não "tente de novo" genérico), RBAC-aware (não sugerir ação sem permissão), transparência de token.
- **Tabelas:** header sticky (+ 1ª coluna no mobile), sort com seta clara, layout-card no mobile.

## Regra de contribuição
- Token novo / mudança de paleta/dark/espaçamento → **só** em `packages/design-tokens` (o gate
  `design-tokens-gate` barra redefinição divergente).
- Componente compartilhado novo → nasce em `ui-react`/`ui-vanilla.css` (não duplicar `.btn`/`.card`).
- Todo PR de frontend passa pelo checklist de a11y acima.
