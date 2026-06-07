# SICAT — Design System (Sicat\*)

Referência dos componentes base do design system SICAT (prefixo `Sicat*`). Todos vivem em [`frontend/src/components/sicat/`](../src/components/sicat) e consomem os tokens em [`frontend/src/styles/tokens.css`](../src/styles/tokens.css) e o tema Vuetify configurado em [`frontend/src/plugins/vuetify.js`](../src/plugins/vuetify.js).

> **Playground visual**: rode o app autenticado e abra `/dev/components` para ver cada componente com todas as variantes em ação.

---

## Princípios

1. **Vuetify primeiro**: componentes Sicat\* são wrappers/composições sobre Vuetify, não substitutos. Inputs continuam sendo `v-text-field`, `v-select`, `v-data-table` etc. — Sicat só adiciona o que falta (estados, status, layout consistente).
2. **Tokens como fonte única**: cores, raios, sombras, espaçamento e tipografia vêm sempre de `tokens.css` (claro e escuro) ou do tema Vuetify (`primary`, `success`, `warning`, `error`, `info`). Nunca hardcode hex.
3. **Status sempre via `SicatStatusBadge`**: pinte status (manifesto, job, CDF, DMR, conta CETESB) pelo componente. Helpers locais (`statusClass`, `normalizeManifestStatusClass`, etc.) estão deprecated.
4. **Estados de UI sempre via componentes Sicat**: `SicatLoadingState`, `SicatEmptyState`, `SicatErrorState` substituem `v-alert` + `v-progress-circular` inline em listas.
5. **Feedback global via `useNotification`**: snackbars/toasts ficam centralizados; nunca crie `v-snackbar` próprio em uma view.
6. **Confirmações via `useConfirmDialog`** + `SicatConfirmDialog`: padrão único; nunca crie `v-dialog` próprio para confirmação destrutiva.
7. **A11y**: `aria-label` em icon-only, `role` adequado em estados, `aria-live` em mensagens dinâmicas, focus management em dialogs.

---

## Catálogo

| Componente | Caminho | Função |
|---|---|---|
| `SicatPageLayout` | `components/sicat/SicatPageLayout.vue` | Wrapper de página: header + filters + body + footer com loading/error globais |
| `SicatPageHeader` | `components/shell/SicatPageHeader.vue` | Header de página: breadcrumbs + kicker + título + descrição + ações + meta |
| `SicatCard` | `components/sicat/SicatCard.vue` | Card padronizado com variantes default/glass/metric/system |
| `SicatStatusBadge` | `components/sicat/SicatStatusBadge.vue` | Badge de status localizado, consome `lib/status-map.js` |
| `SicatLoadingState` | `components/sicat/SicatLoadingState.vue` | Estado de carregamento (spinner/skeleton/progress) |
| `SicatEmptyState` | `components/sicat/SicatEmptyState.vue` | Estado vazio com ícone, descrição e ações |
| `SicatErrorState` | `components/sicat/SicatErrorState.vue` | Estado de erro com mensagem, código, detalhe e retry opcional |
| `SicatSnackbar` | `components/sicat/SicatSnackbar.vue` | Stack global de toasts (montado uma vez em `App.vue`) |
| `SicatConfirmDialog` | `components/sicat/SicatConfirmDialog.vue` | Dialog de confirmação reutilizável |
| `SicatDataTable` | `components/sicat/SicatDataTable.vue` | Wrapper de `v-data-table` com estados loading/empty/error, seleção e slots de célula |
| `SicatFiltersPanel` | `components/sicat/SicatFiltersPanel.vue` | Painel de filtros colapsável com chips ativos e ações limpar/aplicar |
| `SicatActionBar` | `components/sicat/SicatActionBar.vue` | Barra de ações com modo seleção em lote |
| `SicatFormSection` | `components/sicat/SicatFormSection.vue` | Seção de formulário (título, descrição, grade) — base de wizards |
| `SicatFormField` | `components/sicat/SicatFormField.vue` | Wrapper de campo (label + slot input + erro + hint), com id acessível |
| `SicatSearchInput` | `components/sicat/SicatSearchInput.vue` | Input de busca com debounce |
| `SicatMetricCard` | `components/sicat/SicatMetricCard.vue` | Card de métrica (label/valor/trend/tone) |
| `SicatStatusTimeline` | `components/sicat/SicatStatusTimeline.vue` | Linha do tempo de status (etapas done/current/pending/error) |
| `SicatInlineAlert` | `components/sicat/SicatInlineAlert.vue` | Alerta contextual inline (info/success/warning/error) |
| `useNotification` | `composables/useNotification.js` | Composable para disparar toasts globais |
| `useConfirmDialog` | `composables/useConfirmDialog.js` | Composable para abrir dialogs de confirmação |
| `useJobAwait` | `composables/useJobAwait.js` | Polling de job (202+jobId) até estado terminal, com cleanup no unmount |
| `useJobStream` | `composables/useJobStream.js` | SSE de eventos de job com cleanup garantido no unmount |
| `lib/status-map.js` | `lib/status-map.js` | Mapas de status (tones + labels pt-BR) por domínio |

---

## Tokens (resumo)

Tokens em [`tokens.css`](../src/styles/tokens.css) (light + dark):

- **Cores**: `--color-primary`, `--color-success`, `--color-warning`, `--color-error`, `--color-info`, surfaces (`--color-surface`, `--color-surface-raised`, `--color-surface-subtle`), texto (`--color-text`, `--color-text-muted`), bordas (`--color-border`, `--color-border-strong`).
- **Status**: `--color-status-{neutral|running|success|error|warning}-{bg|fg}`.
- **Espaçamento**: `--space-1` (4px) a `--space-8` (40px), escala 4-40.
- **Raios**: `--radius-sm` (10px), `--radius-md` (16px), `--radius-lg` (24px).
- **Sombras**: `--shadow-sm`, `--shadow-md`, `--shadow-lg`.
- **Tipografia**: `--font-family-base` (Public Sans), `--font-family-display` (Manrope), `--font-family-mono`.
- **Breakpoints**: `--breakpoint-tablet` (768), `--breakpoint-desktop` (1200), `--app-max-width` (1440).
- **Gradients**: `--gradient-primary`, `--gradient-hero`.

Tema Vuetify (`plugins/vuetify.js`): `primary #0F9D72` (light) / `#34C993` (dark) e variantes em sincronia com tokens. **Sempre use o tema Vuetify dentro de componentes Vuetify**; use tokens.css em componentes/CSS custom.

---

## SicatPageLayout

Wrapper padrão de uma página. Substitui o padrão atual de declarar `v-row`+`v-col` ad-hoc em cada view.

### Props
| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `loading` | Boolean | `false` | Quando true, body vira `SicatLoadingState`. |
| `loadingMessage` | String | `"Carregando…"` | Mensagem do spinner. |
| `error` | String\|Object\|null | `null` | Quando preenchido, body vira `SicatErrorState`. Objeto pode ter `message`, `code`, `correlationId`. |
| `retryable` | Boolean | `false` | Mostra botão "Tentar de novo" no error state. Emite `@retry`. |
| `width` | `narrow`\|`default`\|`wide`\|`full` | `default` | Largura máxima. |

### Slots
`header`, `banner`, `filters`, `actions`, `default` (corpo), `footer`.

### Exemplo
```vue
<SicatPageLayout :loading="store.isLoading" :error="store.error" retryable @retry="store.refresh">
  <template #header>
    <SicatPageHeader title="Manifestos" description="Acompanhe, cancele e replique MTRs.">
      <template #actions>
        <v-btn color="primary" :to="{ name: 'ManifestoNovo' }" prepend-icon="mdi-plus">Emitir MTR</v-btn>
      </template>
    </SicatPageHeader>
  </template>

  <template #filters>
    <ManifestFilters v-model="filters" />
  </template>

  <ManifestList :items="items" />

  <template #footer>
    {{ items.length }} de {{ totalItems }} manifestos.
  </template>
</SicatPageLayout>
```

---

## SicatPageHeader

Header de página em uso pelo App Shell. Foi estendido com `kicker` e `tone`.

### Props relevantes (novas)
| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `kicker` | String | `''` | Texto curto uppercase acima do título. Quando vazio e `tone="system"`, vira "Sistema · SRE" automático. |
| `tone` | `'default'`\|`'system'`\|`null` | `null` | Tom visual. Se `null`, lê `route.meta.audience` (a partir da Fase 2). |

### Props legadas
`breadcrumbs`, `title`, `section`, `description`, `compact`, `activeAccountTypeLabel`, `activeCetesbAccountLabel`.

### Slots
`actions` (botões à direita), `meta` (área de contexto à direita do card).

### Exemplos
```vue
<!-- Header operacional padrão -->
<SicatPageHeader title="Manifestos" kicker="MTR" description="Lista, criação e detalhe de manifestos." />

<!-- Header de seção Sistema (SRE) -->
<SicatPageHeader title="Console de Jobs" tone="system" description="Diagnóstico avançado e requeue de DLQ." />
```

---

## SicatCard

Card padronizado. Substitui `v-card` inline em listas/grids.

### Props
| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `variant` | `default`\|`glass`\|`metric`\|`system` | `default` | Variante visual. |
| `title` | String | `''` | Título no header. |
| `subtitle` | String | `''` | Subtítulo. |
| `icon` | String | `''` | Ícone mdi opcional. |
| `clickable` | Boolean | `false` | Card vira `role="button"` com tabindex, foco visível, hover destacado. Emite `@click`. |
| `dense` | Boolean | `false` | Paddings reduzidos. |
| `flushBody` | Boolean | `false` | Remove padding do body (útil para enviar componente que já tem padding próprio). |

### Slots
`header` (header completo custom), `header-actions` (ações pequenas no header), `default` (corpo), `footer`, `actions` (CTA principal).

### Exemplo
```vue
<SicatCard title="MTR #12345" subtitle="Emitido em 28/05/2026" icon="mdi-file-document-outline" clickable @click="openDetail">
  <template #header-actions>
    <SicatStatusBadge status="submitted" domain="manifest" />
  </template>
  <p>Transportador: Transmares Ltda</p>
  <template #actions>
    <v-btn color="primary" variant="flat" prepend-icon="mdi-printer">Imprimir</v-btn>
  </template>
</SicatCard>
```

---

## SicatStatusBadge

Badge consistente para status. **Substitui** `v-chip` com lógica `statusClass`/`statusLabel` inline em views.

### Props
| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `status` | String\|Number\|null | `null` | Status bruto do backend. |
| `domain` | `manifest`\|`job`\|`cdf`\|`dmr`\|`account-health` | `manifest` | Define qual mapa de status usar. |
| `label` | String | `null` | Sobrescreve o label resolvido. |
| `tone` | `neutral`\|`running`\|`warning`\|`success`\|`error`\|`null` | `null` | Força um tom específico. |
| `size` | `sm`\|`md`\|`lg` | `md` | Tamanho do badge. |
| `withDot` | Boolean | `false` | Adiciona um dot indicador antes do label. |

### Como adicionar um novo status
Edite [`lib/status-map.js`](../src/lib/status-map.js):
```js
const MANIFEST_STATUS_TONES = Object.freeze({
  // ...
  novo_status: 'warning'
});

const MANIFEST_STATUS_LABELS = Object.freeze({
  // ...
  novo_status: 'Aguardando análise'
});
```
Pronto: `<SicatStatusBadge status="novo_status" domain="manifest" />` já pinta com warning + label localizado.

---

## SicatLoadingState / SicatEmptyState / SicatErrorState

Substitui `v-alert` + `v-progress` inline em listas/cards.

### SicatLoadingState
| Prop | Default | Descrição |
|---|---|---|
| `title` | `"Carregando…"` | Texto principal. |
| `description` | `''` | Texto secundário. |
| `variant` | `spinner` | `spinner`/`skeleton`/`progress`. |
| `compact` | `false` | Layout horizontal pequeno (uso em linhas). |
| `skeletonLines` | `3` | Quantas linhas no variant=skeleton. |

### SicatEmptyState
| Prop | Default | Descrição |
|---|---|---|
| `title` | (obrigatório) | Título. |
| `description` | `''` | Texto descritivo. |
| `icon` | `mdi-tray-remove` | Ícone mdi. |
| `compact` | `false` | Compacto. |

Slot `actions` para CTAs.

### SicatErrorState
| Prop | Default | Descrição |
|---|---|---|
| `title` | `"Algo deu errado"` | Título. |
| `message` | `''` | Mensagem principal. |
| `detail` | `''` | Detalhe técnico (mono, área menor). |
| `code` | `''` | Código/correlationId. |
| `icon` | `mdi-alert-circle-outline` | Ícone. |
| `compact` | `false` | Compacto inline. |
| `retryable` | `false` | Mostra botão; emite `@retry`. |
| `retryLabel` | `"Tentar de novo"` | Label do botão. |

Slot `actions` sobrescreve o botão padrão.

---

## SicatSnackbar + useNotification

### Setup
`SicatSnackbar` já está montado uma vez em `App.vue`. Não precisa importar/montar em outra view. Basta usar o composable:

```js
import { useNotification } from '@/composables/useNotification.js';

const notify = useNotification();

notify.success('MTR emitido com sucesso.');
notify.error('Falha ao gerar CDF', { detail: 'Tempo esgotado.', code: 'CDF_TIMEOUT' });
notify.warning('Conta CETESB expira em 3 dias.', {
  actionLabel: 'Renovar',
  onAction: () => router.push('/sessao')
});
notify.info('Job 4521 enfileirado.');
```

### Opções (options)
- `timeout`: override do timeout. Defaults: success 4s, info 5s, warning 7s, error sem timeout.
- `detail`: texto secundário pequeno.
- `code`: código/correlationId mono.
- `actionLabel` + `onAction`: botão de ação no toast.

### API
`success`, `error`, `warning`, `info`, `notify(tone, msg, opts)`, `dismiss(id)`, `dismissAll()`.

### Limites
Stack máximo de 3 toasts. Excedido descarta o mais antigo.

---

## SicatConfirmDialog + useConfirmDialog

Padrão de confirmação destrutiva. Importe o componente uma vez na view, conecte ao composable:

```vue
<script setup>
import SicatConfirmDialog from '@/components/sicat/SicatConfirmDialog.vue';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';

const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel, dialogCancelLabel,
  dialogDanger, dialogShowCancel, confirm, accept, cancel
} = useConfirmDialog();

async function handleDelete() {
  const ok = await confirm({
    title: 'Cancelar MTR?',
    message: 'Esta ação é irreversível.',
    confirmLabel: 'Cancelar MTR',
    cancelLabel: 'Manter',
    danger: true
  });
  if (ok) await store.cancelManifest(id);
}
</script>

<template>
  <!-- ... -->
  <SicatConfirmDialog
    :visible="dialogVisible"
    :title="dialogTitle"
    :message="dialogMessage"
    :confirm-label="dialogConfirmLabel"
    :cancel-label="dialogCancelLabel"
    :danger="dialogDanger"
    :show-cancel="dialogShowCancel"
    @confirm="accept"
    @cancel="cancel"
    @close="cancel"
  />
</template>
```

---

## Padrões visuais

### Header de página
Kicker (12px uppercase muted) → h1 (28-32px) → descrição (16px muted) → ações à direita.

### Card
Padding `--space-6` (24px), sombra `--shadow-sm`, raio `--radius-lg`, hover sobe pra `--shadow-md`.

### Tabela (a ser materializada em SicatDataTable na Fase 3)
- Densidade `comfortable` (parceiro) / `compact` (SRE).
- Header sticky em listas longas.
- Coluna status sempre `SicatStatusBadge`, largura ~120px.
- Coluna ações sempre por último, alinhada à direita.
- Mobile <768 → cards.

### Hierarquia de botões
| Hierarquia | Vuetify | Quando usar |
|---|---|---|
| Primary | `variant="flat" color="primary"` | 1 por contexto |
| Secondary | `variant="tonal" color="primary"` | Complementar |
| Tertiary | `variant="outlined"` | Alternativa |
| Ghost | `variant="text"` | Cancelar/voltar |
| Danger | `variant="flat" color="error"` + confirm | Destrutiva |
| Icon-only | `variant="text" icon` + **`aria-label` obrigatório** | Ações em tabela |

### Espaçamento
Escala fixa 4/8/12/16/24/32/40 (tokens). Padding card 24, gap seções 32, gap items 16.

### Responsividade
Breakpoints 768 (tablet) e 1200 (desktop). Drawer vira mobile <768. Tabelas viram cards <768.

### A11y
- `aria-label` obrigatório em icon-only;
- Focus trap em dialogs;
- `aria-live="polite"` em snackbar/banner;
- `role="status"` em loading;
- Contraste WCAG AA validado nos tokens.

---

## Estado da refatoração (concluída)

Todas as fases entregues e validadas (build verde):

- **Fase 1** — design system base (este documento)
- **Fase 2** — navegação: drawer único com Sistema/Administração gated por role, `/sistema/jobs` + redirects, `meta.audience`, breadcrumbs, "Minha sessão" no UserMenu
- **Fase 3A/3B/3C** — componentes P1, `useJobAwait`/`useJobStream`, Dashboard intencional (`features/dashboard/`)
- **Fase 3D** — telas operacionais: CDF lista; DMR (lista/pendentes/criar/detalhe); MTR-Provisório (lista/detalhe)
- **Fase 3E** — `ManifestsView` decomposta: lógica pura → `features/mtr/list/manifestHelpers.js`; dropdown manual (~370 linhas) → `v-menu` nativo; status → `SicatStatusBadge`; page chrome via `SicatPageLayout/Header` (2.900 → ~2.000 linhas)
- **Fase 3F** — `ManifestCreateForm` (wizard) com alerts em `SicatInlineAlert`
- **Fase 4** — telas técnicas (Sistema, tone system): OperationsDashboard, Saúde CETESB, Command Center, Relatório MTR, Audit Explorer, Acessos, Jobs (`/sistema/jobs` consolidado), Relatório dos MTRs, CDF criar
- **Fase 5** — `HomeLandingView` reescrita estática; `DestinadorCdfWorkspace` e `CdfCreateView` convertidos aos componentes Sicat; código morto removido: `CdfView.vue`, `JobsConsoleView.vue`, subsistema landing (15 arquivos canvas), `UiState.vue`, `CetesbOperationalFlowsPanel.vue` (órfão/corrompido), composables de scroll/story
- **`base.css` limpo**: classes legadas mortas removidas (`.sicat-card/header/body`, `.sicat-table`, `.sicat-status`, `.sicat-grid-*`, `.sicat-metric`, `.sicat-form-grid`, `.sicat-field`, `.sicat-select`, `.sicat-empty`, `.sicat-glass-card`, `.sicat-table-card`, `.sicat-subtitle`, `.sicat-title`, `.sicat-ghost-btn`, `.sicat-actions-row`, `.ui-state*`). 1.253 → 1.033 linhas, **zero classes sem uso**. Restam apenas `.sicat-input`/`.sicat-btn`, usadas legitimamente pelo componente compartilhado `SicatDateInput`.

Ver [CHANGELOG-DL-100](../../docs/CHANGELOG-DL-100-REFATORACAO-UX-DESIGN-SYSTEM.md) e
[FRONTEND-COMPONENTS-ARCHITECTURE.md](../../docs/FRONTEND-COMPONENTS-ARCHITECTURE.md) para o contexto completo da refatoração.
