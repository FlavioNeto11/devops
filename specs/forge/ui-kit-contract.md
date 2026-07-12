# Contrato de UI da Forja — kit `@flavioneto11/ui-vue` + mapeamento REF→Vue

> Este é o **contrato** que TODO builder de tela (o agente P2 do motor `generate-ui`) segue ao
> implementar uma view. É também a referência para construir telas à mão. Objetivo: telas **ricas,
> robustas e bonitas** (nível SICAT/GymOps), com **marca própria por app**, **CSP-safe** e a11y.

## Regras inquebráveis

1. **Use SÓ o kit** (`import { ... } from '../ui/index.js'`). Nada de `<table>`/`<input>` cru em volta
   sem os componentes do kit, nada de biblioteca externa, nada de CSS framework.
2. **Tokens `--ui-*` apenas** em qualquer CSS (`rgb(var(--ui-fg))`, `var(--ui-space-4)`,
   `var(--ui-radius-md)`…). **Nunca** hex cru, nunca `--p-*`, nunca `--v-theme-*`. A marca (cores
   light+dark) vem de `tokens.generated.css` derivado de `brand.json` — não a edite.
3. **CSP**: proibido `style="..."` inline e `:style`; proibido `v-html`. Estado visual por `class` +
   `data-*` em `<style scoped>`. (Há grep-gate que falha o build.)
4. **Só endpoints REAIS.** Cada chamada usa `api.js` (`resourceFactory(name)` → `/v1/<name>`). Não
   invente rota; confira contra o OpenAPI/rotas do backend. Sem endpoint → não construa a ação.
5. **Todos os estados** de uma tela de dados: loading (skeleton), empty (com CTA), error (com retry),
   normal. Use os componentes de estado — nunca uma tela em branco.
6. **a11y**: labels em todo input (via `UiFormField`), foco visível (já no kit), `aria-*` onde o kit
   pede, navegação por teclado. Responsivo (o kit já trata; teste ≤860px).
7. **Nunca** toque em `apps/<app>/tests/locked/**` nem em `*.generated.css`/`ui/**` (sincronizados).

## Componentes do kit (props essenciais)

| Componente | Uso | Props/slots/eventos principais |
|---|---|---|
| `UiAppShell` | casca (topbar+sidebar) — já no `App.vue` | `title`, `nav`, `meUrl` |
| `UiPageLayout` | moldura de toda tela | `title`, `eyebrow`, `subtitle`, `width`(narrow/default/wide/full), `loading`, `error`, `@retry`; slots `actions`/`filters`/`banner`/`footer`. Sincroniza `document.title` ("`<title>` · `<app>`") automaticamente |
| `UiCard` | bloco de conteúdo | `title`, `subtitle`; slots `actions`/`footer` |
| `UiMetricCard` | KPI no dashboard | `label`, `value`, `tone`, `hint`, `trend`, `clickable`, `@click` |
| `UiDataTable` | listas | `columns`[{key,label,align,sortable,format}], `rows`, `rowKey`, `loading`, `error`, `empty`, `density`, `selectable`+`selected`(v-model), `clickableRows`+`@row-click`, `serverMode`+`sort`/`page`/`pageSize`/`total`+`paginated`; slots `cell-<key>`, `empty-action` |
| `UiPagination` | paginação | `page`,`pageSize`,`total` (v-model:page/pageSize) |
| `UiFiltersPanel` | filtros | `modelValue`(v-model), `fields`[{key,label,type,options}], `@apply`/`@clear` |
| `UiFormField` | campo de formulário | `label`, `required`, `error`, `hint`; slot-prop `{ id, describedBy }` p/ ligar ao controle |
| `UiFormSection` | grupo de campos | `title`, `description`, `columns`(1/2/3) |
| `UiStatusBadge` | status | `status` (resolve tom por palavra), `tone`(override), `label`, `withDot` |
| `UiEmptyState` | vazio | `title`, `description`, `icon`; slot `action` |
| `UiLoadingState` | carregando | `variant`(spinner/skeleton), `skeletonLines` |
| `UiErrorState` | erro | `message`, `code`, `retryable`, `@retry`; slot `action` |
| `UiModal` | diálogo | `open`(v-model), `title`, `width`, `persistent`; slot `footer` |
| `UiConfirmDialog` | confirmação (host 1x no App.vue) | usa `useConfirm()` |
| `UiToast` | toasts (host 1x no App.vue) | usa `useToast()` |
| `UiButton` | ação | `variant`(primary/ghost/subtle/danger), `size`, `to`/`href`, `loading`, `block` |

**Composables:** `useResource(api.<recurso>)` (items/loading/error/page/sort/filters + load/get/create/update/remove);
`useForm({ initial, rules })` (values/errors/submitting + setField/handleSubmit, anti-duplo-submit);
`useToast()` (success/error/warning/info); `useConfirm()` (`await ask({title,message,danger})`).
**Libs:** `validators` (required/minLen/email/numeric/min/max/pattern), `format` (humanize/formatValue), `resolveTone`.

## Mapeamento REF→Vue (determinístico)

Um refinement (`specs/schema/refinement.schema.json`) descreve a tela. Mapeie assim:

- **`kind: screen`** → uma `views/<Pascal(name|rota)>View.vue` em `<UiPageLayout>`; rota em `surface.route`
  (registre em `router.js`); `surface.roles` → `meta.roles`; item em `nav.js`.
- **`behavior.states[]`** → render por estado: `normal` (conteúdo), `loading` (`:loading` do PageLayout/DataTable),
  `error` (`:error`+`@retry`), `empty` (`UiEmptyState`/`:empty` da tabela). Estados custom: `v-if` por condição.
- **`behavior.data[]`** (coleção) → colunas do `UiDataTable`: `{ key: field, label: humanize(field),
  sortable: true, format: <date|currency|number|boolean|badge|fn> }`. `source` (`api:/v1/...`) define o recurso.
- **`behavior.data[]`** (formulário, `editable:true`) → `UiFormField` + controle por `format`
  (date→`type=date`, enum→`<select>`, boolean→checkbox, number→`type=number`, senão texto) + regra `useForm`.
- **`behavior.data[]`** (detalhe, `editable:false`) → linha `dt/dd` no `UiCard`; status → `UiStatusBadge`.
- **`behavior.interactions[]`** (`{trigger,action,result}`) → handler: trigger (click/submit/row-click/filter) →
  ação (`api.<recurso>.*`, `router.push`, `UiModal`, `await useConfirm()`) → resultado (`useToast`, `refresh`, set error).
  **Ação destrutiva SEMPRE** via `useConfirm`.
- **`behavior.flows[]`** → ordem de passos (wizard com `UiCard` por etapa, ou ordena botões/foco).

## Exemplar canônico — tela de lista de domínio (copie o estilo, não o conteúdo)

```vue
<template>
  <UiPageLayout title="Produtos" subtitle="Catálogo da loja." :error="r.error.value" @retry="r.load">
    <template #actions><UiButton to="/produtos/novo">Novo produto</UiButton></template>
    <template #filters>
      <UiFiltersPanel v-model="filters" :fields="filterFields" @apply="applyFilters" @clear="applyFilters" />
    </template>
    <UiDataTable :columns="columns" :rows="r.items.value" :loading="r.loading.value" row-key="id"
      clickable-rows :sort="r.sort.value" server-mode :page="r.page.value" :page-size="r.pageSize.value"
      :total="r.total.value" paginated
      :empty="{ title: 'Nenhum produto', description: 'Cadastre o primeiro produto.' }"
      @update:sort="r.setSort" @update:page="r.setPage" @row-click="open">
      <template #cell-price="{ value }">{{ format.formatCurrency(value) }}</template>
      <template #empty-action><UiButton to="/produtos/novo">Cadastrar produto</UiButton></template>
    </UiDataTable>
  </UiPageLayout>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { UiPageLayout, UiDataTable, UiButton, UiFiltersPanel, useResource, format } from '../ui/index.js';
import { products } from '../api.js';
const router = useRouter();
const columns = [
  { key: 'name', label: 'Nome', sortable: true },
  { key: 'sku', label: 'SKU' },
  { key: 'price', label: 'Preço', align: 'right', format: 'currency' },
  { key: 'status', label: 'Status', format: 'badge' },
];
const filterFields = [{ key: 'q', label: 'Buscar', type: 'text', placeholder: 'nome ou SKU' },
  { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] }];
const filters = ref({ q: '', status: '' });
const r = useResource(products);
const applyFilters = () => r.setFilters(filters.value);
const open = (row) => router.push('/produtos/' + row.id);
onMounted(r.load);
</script>
```

> Na dúvida sobre um componente, leia o `.vue` em `apps/<app>/frontend/src/ui/components/`. O kit é a
> verdade; este doc é o guia.
