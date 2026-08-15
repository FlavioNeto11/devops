# QA guards — guardas estáticos de UX (sem servidor)

Fundação de QA que roda **só com Node** (`fs` + regex/parse leve, ESM puro, sem
dependências externas, sem Postgres/Playwright). Dois guardas determinísticos travam
a **regressão** dos anti-padrões de UX mais caros do
[Plano Mestre de UX/UI](../../docs/plans/ux-design-master-plan.md):

| Guarda | Arquivo | Pega | Achado-classe |
|---|---|---|---|
| **route-integrity** | [`route-integrity.mjs`](./route-integrity.mjs) | navegação morta — `to=`/`router.push` para rota **não declarada** no router | UX-NEURO-002 (18 links mortos) |
| **a11y-static** | [`a11y-static.mjs`](./a11y-static.mjs) | clicável-sem-teclado — elemento não-interativo com clique sem `role`+`tabindex`+teclado | UX-A11Y-001 (P0, WCAG 2.1.1) |

CI: [`.github/workflows/qa-guards.yml`](../../.github/workflows/qa-guards.yml) roda os
dois em `--check` nos PRs que tocam `apps/**`, `console/**`, `portal/**`.

---

## Como rodar

```bash
# relatório humano (exit 0 sempre) — mostra violações por app + amostra
node scripts/qa/route-integrity.mjs
node scripts/qa/a11y-static.mjs

# modo CI: falha (exit 1) SÓ em violação NOVA vs. o baseline commitado
node scripts/qa/route-integrity.mjs --check
node scripts/qa/a11y-static.mjs --check

# (re)gravar o baseline com o estado atual
node scripts/qa/route-integrity.mjs --update
node scripts/qa/a11y-static.mjs --update
```

> Rodar sempre com `node <arquivo.mjs>` (nunca `npx`/`node -e`/`npm exec`).

## Baseline adotável (como funciona)

Cada guarda grava as violações **pré-existentes** em `scripts/qa/<guarda>.baseline.json`.
No `--check`, só uma violação cuja **chave** não está no baseline falha o CI — ou seja,
o gate barra **regressão**, não o débito histórico. A chave é estável a movimentação de
linhas:

- **route-integrity:** `app | kind(path/name) | alvo` (independe de arquivo/linha).
- **a11y-static:** `arquivo | trecho-normalizado-da-tag` (independe da linha).

### Ao **corrigir** uma violação

1. Corrija (rota real no router; ou `role`+`tabindex`+`@keydown`, ou troque por `<button>`/`<a>`).
2. Rode o guarda com `--update` para **encolher** o baseline.
3. Commite o `*.baseline.json` menor junto com a correção. O baseline só deve diminuir.

### Ao adicionar uma violação **intencional** (raro)

O CI vai falhar apontando a chave nova. Se for realmente intencional, rode `--update` e
commite o baseline maior **com justificativa no PR** — é uma decisão explícita, não silenciosa.

---

## Retrato atual (baseline gerado nesta branch de integração)

Rodado sobre `ux/onda-integration` (todas as correções de UX aplicadas), por isso sai
**quase limpo**:

### route-integrity — navegações mortas

| App | rotas registradas | navegações mortas |
|---|---|---|
| contaviva-360 | 16 | 0 |
| contaviva-pro | 10 | 0 |
| imobia | 16 | 0 |
| neuroevolui | 43 | **1** |
| sicat | 32 | 0 |

A única navegação morta é **real** e digna de correção:
`apps/neuroevolui/frontend/src/views/SystemHealthView.vue:23` —
`<UiButton to="/api-docs">Documentação da API</UiButton>` aponta para `/api-docs`, que o
`router.js` **não declara** (o próprio comentário do arquivo cita uma "rota interna
/api-docs" / `ApiDocsView` que não existe). Clicar cai no catch-all/404. Ficou no baseline
(tolerada) até virar correção — quando resolvida, rode `--update`.

### a11y-static — clicável sem teclado (34 violações em 10 superfícies)

| Superfície | violações |
|---|---|
| apps/anarabottini | 5 |
| apps/rmambiental | 5 |
| console | 5 |
| apps/besc | 3 |
| apps/contaviva-360 | 3 |
| apps/contaviva-pro | 3 |
| apps/gymops | 3 |
| apps/neuroevolui | 3 |
| apps/imobia | 2 |
| apps/zapbridge | 2 |

Predominam **backdrops/scrims de modal com click-to-close** e **linhas de tabela
clicáveis** (`<tr class="clickable" @click>`), a espinha do UX-A11Y-001.

---

## Heurísticas (por que o ruído é baixo)

**route-integrity**
- Extrai os paths registrados percorrendo o array de rotas do `router.js`: resolve
  `children` (junta com o path do pai, semântica vue-router), `alias` e spreads de const
  locais (`...moduleRoutes`).
- Normaliza params: `/patients/:id` casa `/patients/123`; `${id}` vira um segmento.
- Valida alvos por `path` **e** por `name` (nomes de rota declarados).
- Exclui o catch-all (`/:pathMatch(.*)*`) do conjunto válido — é o 404: se um alvo só
  casa nele, é justamente navegação morta.
- Ignora API/assets/auth (`/v1`, `/api`, `/auth`, `/oauth2`, `/assets`…), âncoras,
  URLs externas e alvos que não começam com `/`.

**a11y-static**
- Só as 7 tags não-interativas: `div, span, li, tr, td, article, section`. Componentes
  (PascalCase) e nativos interativos (`button/a/input/select/textarea`) ficam de fora.
- Lê a **tag de abertura inteira** (cruza linhas; ignora `>` dentro de strings e de
  `{...}`/`(...)`, ex.: `() =>`).
- Exige **valor** no handler de clique: `@click.stop` "pelado" (só barra propagação) não
  conta; `@click="fn"`/`onClick={...}` contam. Handler React que **só** faz
  `stopPropagation()`/`preventDefault()` também é ignorado (não é ação).
- Comentários (HTML e JS) são apagados antes de varrer (código comentado não gera FP).
- Violação = tem clique **e** falta **qualquer** um de `role` / teclado / `tabindex`.

---

## Esteira futura (precisa de infra de CI: Postgres/Playwright)

Estes guardas são a **camada estática, sem servidor** — a base da pirâmide. As frentes
que exigem runtime autenticado / browser vivem na §16 do
[Plano Mestre de UX/UI](../../docs/plans/ux-design-master-plan.md) (§16.3, "Seis harnesses
reutilizáveis") e ainda não estão implementadas:

| # | Harness | O que faria | Depende de |
|---|---|---|---|
| **H1** | Rota-smoke por papel | Para cada rota estática × papel: `goto` → assert de heading/≠NotFound → zero erro de console. Molde: [`apps/gymops/apps/web/e2e/smoke/*.smoke.spec.ts`](../../apps/gymops/apps/web/e2e/smoke) (fixtures `PROFILES`). | Playwright + Postgres (dados por papel) |
| **H3** | axe automatizado | `@axe-core/playwright` injetado nas páginas do H1 + galeria `ui-vue`; começa `warning`, promove a required. | Playwright + H1 |
| **H5** | Visual-diff do DS | Galeria estática `ui-vue` + casca + tokens em light/dark com `toHaveScreenshot`. | Playwright (só no design-system) |
| **H6** | Sessão/erro por interceptação | `page.route` devolvendo 401/500 → assert de redirect-com-aviso e estado de erro com retry. | Playwright |

Relação com o estático de hoje: **route-integrity** é o teto sem-servidor do que o **H1**
cobriria em runtime (rota morta pega aqui; jornada/guard por papel só no H1). **a11y-static**
é o teto sem-servidor do **H3** (o clicável-sem-teclado pega aqui; contraste/foco/leitor de
tela só no axe em runtime). Ordem de adoção sugerida na §16.4 do plano.
