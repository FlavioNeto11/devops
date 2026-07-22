---
title: "Design System da plataforma NovaIT"
status: canonical
applies_to: [platform]
updated: 2026-07-22
language: pt-BR
---

# Design System da plataforma NovaIT

> Governança de UX/design da plataforma. Fonte dos tokens:
> [`packages/design-tokens`](./packages/design-tokens/README.md). Kit de componentes:
> [`packages/ui-vue`](./packages/ui-vue). Casca global:
> [`packages/platform-shell`](./packages/platform-shell). Plano de evolução:
> [`docs/plans/ux-design-master-plan.md`](./docs/plans/ux-design-master-plan.md) (§9 — Design System;
> Onda 0/1, ver #254).

## Por que existe
A plataforma tem ~14 frontends em vários frameworks (Vuetify/SICAT, Vue standalone/apps da Forja,
Tailwind/GymOps·rmambiental·anarabottini, React/Console·portal-recorder·zapbridge, CSS
vanilla/Portal·Reqhub). Sem governança, cada um reinventa paleta/dark-mode/espaçamento e
componentes — e a divergência vira bug e custo. Este documento define **uma** linguagem e, acima
de tudo, descreve **o que realmente existe** hoje (não uma intenção).

## Arquitetura em camadas (a heterogeneidade de framework é proposital)
Um único pacote React não serve Vue nem CSS puro. Então o DS é em **três camadas reais**, todas
distribuídas por **codegen-sync + drift-gate** (o app builda em contexto Docker isolado e **não
alcança `packages/`**, por isso o artefato é gerado/copiado para dentro de cada app e versionado):

| Camada | Pacote real | O que entrega | Como chega ao app | Consumidores |
|---|---|---|---|---|
| **A — Tokens** | [`packages/design-tokens`](./packages/design-tokens) | `tokens.json` → CSS de variáveis (`--bg/--fg/--neon`, `--ui-*`, `--p-*`) + tema Vuetify | `src/tokens.generated.css` por app (4 rotas de codegen) | todos os frontends adotados |
| **B — Kit Vue** | [`packages/ui-vue`](./packages/ui-vue) | 19 componentes `Ui*` + 4 composables + libs | `apps/<app>/frontend/src/ui/**` (sync) | apps Vue gerados pela Forja |
| **C — Casca global** | [`packages/platform-shell`](./packages/platform-shell) | web component `<platform-shell>` + paleta `--p-*` | `platform-shell.{js,css}` + `platform-tokens.css` por superfície | 4 superfícies internas da plataforma |

> **`ui-react` e `ui-vanilla.css` NÃO existem.** Foram propostos em versões antigas deste doc como
> camadas B/C. O papel de **B** foi cumprido por **`ui-vue`** (kit Vue real) e o de **C** por
> **`platform-shell`** (casca global vanilla, framework-agnóstica). Não crie `packages/ui-react` nem
> `ui-vanilla.css` — contribua nos pacotes reais acima. A convergência das superfícies vanilla/React
> para um kit compartilhado é assunto do plano de evolução (§9), não um pacote pendente.

### Camada A — `packages/design-tokens` (fonte única + 4 rotas de codegen)
Fonte: `tokens.json`. Build: `node packages/design-tokens/build.mjs` (determinístico). As 4 rotas:

1. **Marcas hand-authored (`TARGETS`)** — `rmambiental`, `anarabottini`: `render()` emite
   `apps/<app>/src/tokens.generated.css` (paleta `--bg/--fg/--surface/--neon/...` + scrollbar/selection).
   O `tailwind.config.js` mapeia `brand.* → rgb(var(--x) / <alpha>)`.
2. **Plataforma (`renderers/platform.mjs`)** — gera a paleta neutra `--p-*` **entre marcadores**
   dentro de [`packages/platform-shell/platform-tokens.css`](./packages/platform-shell/platform-tokens.css);
   depois o `platform-shell/build.mjs` distribui a cópia às 4 superfícies (camada C).
3. **Adotados (`renderers/sicat.mjs`)** — `sicat` (brownfield): transcreve a paleta artesanal do app
   (zero mudança visual) para `apps/sicat/frontend/src/styles/tokens.generated.css` **+**
   `apps/sicat/frontend/src/plugins/vuetify-theme.generated.js` (tema Vuetify).
4. **Apps da Forja (`forge-brand.mjs` → `--ui-*`)** — descoberta determinística em `specs/products/`
   (produto com `interfaces: [web]`, frontend no disco, `origin != adopted`): `contaviva-360`,
   `contaviva-pro`, `neuroevolui`. A marca vem de `specs/products/<app>/brand.json`; `deriveForgeTokensCss`
   emite `--ui-*` com **contraste AA por construção** (`ensureContrast`).

**Editar tokens:** só em `tokens.json` → `node build.mjs`. **Nunca** editar os `*.generated.*` nos
apps (são saída). O gate `design-tokens-gate` falha se houver drift.

### Camada B — `packages/ui-vue` (kit Vue real)
Barrel [`src/index.js`](./packages/ui-vue/src/index.js). Consome os tokens `--ui-*` da camada A.
Sincronizado por `node packages/ui-vue/build.mjs` para `apps/<app>/frontend/src/ui/**` nos apps Vue
gerados pela Forja (**pula** os `origin: adopted`). Um **grep-gate de CSP** (sem `style=`/`:style`/`v-html`)
+ drift-check protegem o kit.

**19 componentes** (`Ui*`):
- **Estrutura/layout:** `UiAppShell`, `UiPageLayout`, `UiCard`, `UiFormSection`.
- **Dados:** `UiDataTable`, `UiPagination`, `UiFiltersPanel`, `UiMetricCard`.
- **Formulário:** `UiFormField`, `UiInput`, `UiFileDrop`.
- **Ação/feedback/estado:** `UiButton`, `UiStatusBadge`, `UiEmptyState`, `UiLoadingState`,
  `UiErrorState`, `UiToast`, `UiModal`, `UiConfirmDialog`.

**4 composables:** `useToast`, `useConfirm`, `useForm` (anti-duplo-submit + validação inline),
`useResource`. **Libs:** `validators`, `format`, `status-map` (`resolveTone`/`statusLabel`),
`glyphs` (`resolveGlyph`).

### Camada C — `packages/platform-shell` (casca global)
Web component **`<platform-shell>`** vanilla e **CSP-safe** (DOM só via `createElement`/`textContent`;
zero `innerHTML`/inline/CDN — passa na CSP estrita do reqhub), framework-agnóstico (vanilla + React).
Estilo em `shell.css`; paleta `--p-*` em `platform-tokens.css` (gerada pela camada A). Entrega
launcher de superfícies (manifesto canônico `SURFACES`), identidade/SSO (`me-url`), toggle de tema e
saúde por probes. Distribuída por `node packages/platform-shell/build.mjs` (sync + drift-check +
`shell.test.js`) a **4 frontends**: `portal`, `apps/reqhub`, `console`, `apps/portal-recorder`.

## Matriz de adoção real (por frontend)
Estado verificado no código (commit atual). "✓ A" = recebe `tokens.generated.css`/`--p-*`; "✓ B" =
recebe o kit `ui-vue`; "✓ C" = embute a casca `<platform-shell>`.

| Frontend | A tokens | B ui-vue | C casca | Framework | Origem / observação |
|---|:---:|:---:|:---:|---|---|
| `portal` | `--p-*` | — | ✓ C | vanilla | superfície da plataforma |
| `console` | `--p-*` | — | ✓ C | React | superfície da plataforma |
| `apps/reqhub` | `--p-*` | — | ✓ C | vanilla | superfície da plataforma |
| `apps/portal-recorder` | `--p-*` | — | ✓ C | React | superfície da plataforma |
| `apps/sicat` | ✓ A | — | — | Vue/Vuetify | adotado (renderer + tema Vuetify) |
| `apps/rmambiental` | ✓ A | — | — | Tailwind/React | marca hand-authored (`TARGETS`) |
| `apps/anarabottini` | ✓ A | — | — | Tailwind | marca hand-authored (`TARGETS`) |
| `apps/contaviva-360` | ✓ A `--ui-*` | ✓ B | — | Vue | app da Forja (kit completo) |
| `apps/contaviva-pro` | ✓ A `--ui-*` | ✓ B | — | Vue | app da Forja (kit completo) |
| `apps/neuroevolui` | ✓ A `--ui-*` | ✓ B | — | Vue | app da Forja (kit completo) |
| `apps/gymops` | — | — | — | Next.js/Tailwind | adotado, **fora** (paleta própria; bloco `.dark` sem toggler → UX-DS-010) |
| `apps/imobia` | — | — | — | Vue | adotado, **fora** (`--im-*`; adoção prevista p/ "F3+") |
| `apps/besc` | — | — | — | Vue | **fora** (CSS próprio; nem em `specs/products/`) |
| `apps/zapbridge` | — | — | — | React PWA | adotado, **fora** (identidade própria) |
| `apps/forge-pilot-v2`, `apps/ai-control-plane` | — | — | — | tooling | interno da Forja; **não auditado** nesta camada |

**Como ler a origem:** `origin: adopted` (em `specs/products/<app>/product.json`) marca frontends
pré-Forja com paleta artesanal — o codegen os **pula de propósito** (não sobrescreve). A adoção é
**opt-in explícito**: `sicat`/`rmambiental`/`anarabottini` já foram trazidos à camada A por renderer/
`TARGETS`; `gymops`/`imobia`/`besc`/`zapbridge` seguem com identidade própria. "Fora" ≠ proibido —
é uma escolha de identidade que **deve ser declarada** (não um acidente). A convergência do mínimo
universal (foco visível, reduced-motion, dark coerente) para os apps fora é trabalho do plano de
evolução (§9; ver UX-DS-007/UX-DS-010).

## Gate de CI — `design-tokens-gate`
[`.github/workflows/design-tokens-gate.yml`](./.github/workflows/design-tokens-gate.yml), sempre-on
(sem path-filter; pode ser check exigido). Roda:
- `node packages/design-tokens/build.mjs --check` — drift dos tokens gerados.
- `node packages/platform-shell/build.mjs --check` — drift da casca distribuída.
- `node packages/ui-vue/build.mjs --check` — drift do kit + **grep-gate de CSP**.
- `node --test packages/platform-shell/shell.test.js` — funções puras da casca.
- `node --test` (em `packages/ui-vue`) — funções puras do kit.

> **Lacuna conhecida:** `packages/design-tokens/forge-brand.test.mjs` (garantia de contraste AA do
> gerador de marcas) **ainda não** roda no gate — rastreado em UX-DS-003. Também não há galeria/
> regressão visual/axe sobre o `ui-vue` (UX-DS-009). Não descreva essas verificações como existentes.

## Dark mode — estado real (em convergência)
Hoje **não** há uma estratégia única implementada: os renderers emitem seletores diferentes
(`.dark` em `build.mjs`; `[data-theme="dark"], .dark` no `forge-brand.mjs`) e as superfícies usam
chaves de `localStorage` distintas (`nvit-theme` na casca; `sicat.ui.theme` no SICAT; `rmamb-theme`
no rmambiental). O alvo declarado — `[data-theme="dark"], .dark` + fallback `prefers-color-scheme` +
chave única `nvit-theme` — é trabalho do plano de evolução (UX-DS-004). Apps de identidade própria
(ex.: anarabottini, bem-estar/luz) podem manter aparência, mas devem **ler/gravar a mesma chave** e
adotar o mínimo universal. Descreva o dark como **fragmentado hoje**, não como resolvido.

## Checklist de acessibilidade (WCAG 2.1 AA) — obrigatório em todo componente
- **Foco visível:** `outline`/`ring` de 2px + offset; nunca `outline: none` sem alternativa (o
  `ui.css` do kit já tem `:focus-visible` universal).
- **Alvos de toque ≥ 44×44px** (a casca faz bump mobile; o kit ainda tem alvos pequenos —
  ver UX-DS-006).
- **`aria-label`** em botões só-ícone; **`aria-current="page"`** no item de navegação ativo;
  **`aria-expanded`** em disclosure/menus mobile; `aria-live` em regiões dinâmicas (busca, toasts).
- **`label` associado a `input`** (`htmlFor`/`id`) ou `aria-label`.
- **Contraste ≥ 4.5:1** (texto) — validar em light E dark.
- **`prefers-reduced-motion: reduce`** respeitado em toda animação.
- **Cor nunca sozinha:** status com cor + texto/ícone.

## Padrões de UX (estados, formulários, IA)
- **Estados:** loading com **skeleton** (altura fixa, anti-CLS), **empty com ação** contextual,
  **erro acionável** (retry; distinguir timeout × offline), confirmar **toda** ação destrutiva.
  O kit `ui-vue` já entrega isso em `UiLoadingState`/`UiEmptyState`/`UiErrorState`/`UiConfirmDialog`.
- **Formulários:** validação **inline** (blur/change) + hint/microcopy; **anti-duplo-submit**
  (`useForm` desabilita + spinner durante a requisição); erros **por campo** (`UiFormField`).
- **Feedback:** "salvando…" visível em autosave/debounce; toast que não some antes de ser lido
  (`useToast`/`UiToast`); confirmação central em deletes (`useConfirm`).
- **UX de IA:** spinner "pensando…", **timeout + cancelar**, retry com backoff, erros **estruturados**
  (não "tente de novo" genérico), RBAC-aware (não sugerir ação sem permissão), transparência de token.
- **Tabelas:** header sticky, sort com seta clara. **Nota:** `UiDataTable` hoje só faz `overflow-x`
  no mobile — 1ª coluna sticky e layout-card são **futuro** (UX-DS-008).

## Regra de contribuição (aponta para pacotes que EXISTEM)
- **Token novo / paleta / dark / espaçamento** → **só** em
  [`packages/design-tokens/tokens.json`](./packages/design-tokens/tokens.json) → `node build.mjs`
  (o gate `design-tokens-gate` barra redefinição divergente). Nunca redefinir `--bg`/`--ui-*`/`--p-*`
  à mão num app.
- **Componente Vue compartilhado** → nasce em
  [`packages/ui-vue/src/components/`](./packages/ui-vue/src/components) (`Ui*`), exportado no barrel
  `src/index.js`, sem `style=`/`v-html` (CSP), e propagado por `node packages/ui-vue/build.mjs`.
  **Não duplique** `.btn`/`.card` nem crie `packages/ui-react`/`ui-vanilla.css` (não existem).
- **Navegação/casca global** (launcher, identidade, tema, saúde) → em
  [`packages/platform-shell`](./packages/platform-shell) (`shell.js`/`shell.css` + `SURFACES`),
  distribuída por `node packages/platform-shell/build.mjs`.
- **App de identidade própria** (fora das 3 camadas): a exceção deve ser **declarada** (em
  `specs/products/<app>` e nesta matriz), adotando ainda assim o mínimo universal de a11y.
- Todo PR de frontend passa pelo checklist de a11y acima.

---
_Camada de tokens: [`packages/design-tokens/README.md`](./packages/design-tokens/README.md) · Kit:
[`packages/ui-vue`](./packages/ui-vue) · Casca: [`packages/platform-shell`](./packages/platform-shell) ·
Plano de evolução (Onda 0/1): [`docs/plans/ux-design-master-plan.md`](./docs/plans/ux-design-master-plan.md) §9 (ver #254)._
