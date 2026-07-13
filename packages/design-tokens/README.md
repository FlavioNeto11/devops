# @flavioneto11/design-tokens — camada universal do design system

Fonte **única** dos tokens de design da plataforma NovaIT (Fase 0 do roadmap de UX/design).
Mata a fragmentação: hoje cada produto redefine paleta/dark-mode/espaçamento por conta própria
(8 fontes, 3 frameworks). Aqui os tokens vivem em **um** lugar (`tokens.json`).

## Por que codegen-sync (e não um import de pacote)
Cada app frontend builda em **contexto Docker isolado** (`docker build apps/<app>`), então o build
**não alcança `packages/`**. Por isso o token é **gerado para dentro de cada app** (`src/tokens.generated.css`)
e versionado, com um **drift-check** no CI — exatamente o idioma da baseline de `specs/`.

- Editar tokens: **só** em `tokens.json`, depois `node build.mjs`.
- **Nunca** editar os `*.generated.css` nos apps (são saída).
- CI roda `node build.mjs --check` (falha se algum app estiver fora de sincronia).

## O que cada marca define
Estrutura **compartilhada** (fontes Sora/Inter, sombras, animação `floaty`, escala) + **cores por marca**
(`:root` claro e, quando há, `.dark`) + parâmetros de componente (`--gradient-brand`, `--btn-*`,
`--*-alpha`) que deixam o `@layer` de componentes **idêntico** entre apps (a nuance vive nos tokens).

## Consumo no app (ex.: rmambiental, anarabottini)
`src/index.css`:
```css
@import './tokens.generated.css';   /* :root/.dark + scrollbar/selection (gerado) */
@tailwind base;
@tailwind components;
@tailwind utilities;
@layer components { /* .btn/.eyebrow/.glass/.text-gradient usam as vars dos tokens */ }
```
O `tailwind.config.js` continua mapeando `brand.* → rgb(var(--x) / <alpha-value>)` (as vars agora vêm
do arquivo gerado).

## Marca da PLATAFORMA (casca global `--p-*`)
A paleta neutra da casca (`packages/platform-shell/platform-tokens.css`) também é gerada daqui
(marca `platform`, renderer `renderers/platform.mjs`) — valores TRANSCRITOS do CSS histórico
(zero mudança visual). O alvo é o **arquivo-fonte do codegen da casca**: este build regenera só o
bloco entre `/* @generated-tokens:start */ ... /* @generated-tokens:end */` e depois o
`packages/platform-shell/build.mjs` distribui a cópia para os 4 frontends (portal, reqhub,
console, portal-recorder). Mapeamento 1:1 (detalhado no `note` de `brands.platform`):
`--p-<nome>` ↔ `palette.<modo>.<nome>` · `--p-font-*`/`--p-text-*`/`--p-space-*`/`--p-radius-*`/
`--p-z-*` ↔ `structural.*` · `--p-shadow-<t>` ↔ `shadows.<modo>.<t>`.

## Marcas ADOTADAS (brownfield — hoje: sicat; gymops/imobia ainda não adotados)
Apps adotados pela Forja (`origin: adopted` em `specs/products/`) têm frontend pré-Forja com paleta
artesanal própria — o `discoverForgeApps()` os **pula de propósito** (não sobrescreve com a marca
default). A adoção dos tokens é **opt-in explícito por marca** no `build.mjs`, com renderer próprio
em `renderers/<app>.mjs` que **transcreve a paleta atual do app** (zero mudança visual):
- **sicat** → `apps/sicat/frontend/src/styles/tokens.generated.css` + `src/plugins/vuetify-theme.generated.js`
  (tema Vuetify importado pelo plugin). Fonte: `tokens.json` (`brands.sicat`).

## Roadmap das próximas camadas (ver plano de UX/design)
- **B — `packages/ui-react`**: primitivos React (Button/Card/Input/EmptyState/Skeleton/DataTable/AiPanel…).
- **C — `ui-vanilla.css`**: `.btn/.card/.table` para Portal/Console/Reqhub/Recorder (CSS puro).
