// SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`.
// @flavioneto11/ui-vue — barrel. Importe componentes + composables + libs de um lugar:
//   import { UiPageLayout, UiDataTable, useToast, useForm } from './ui/index.js';
export { default as UiButton } from './components/UiButton.vue';
export { default as UiCard } from './components/UiCard.vue';
export { default as UiMetricCard } from './components/UiMetricCard.vue';
export { default as UiStatusBadge } from './components/UiStatusBadge.vue';
export { default as UiEmptyState } from './components/UiEmptyState.vue';
export { default as UiLoadingState } from './components/UiLoadingState.vue';
export { default as UiErrorState } from './components/UiErrorState.vue';
export { default as UiPageLayout } from './components/UiPageLayout.vue';
export { default as UiDataTable } from './components/UiDataTable.vue';
export { default as UiPagination } from './components/UiPagination.vue';
export { default as UiFiltersPanel } from './components/UiFiltersPanel.vue';
export { default as UiFormField } from './components/UiFormField.vue';
export { default as UiFormSection } from './components/UiFormSection.vue';
export { default as UiModal } from './components/UiModal.vue';
export { default as UiConfirmDialog } from './components/UiConfirmDialog.vue';
export { default as UiToast } from './components/UiToast.vue';
export { default as UiAppShell } from './components/UiAppShell.vue';
export { default as UiFileDrop } from './components/UiFileDrop.vue';
export { default as UiInput } from './components/UiInput.vue';
export { default as UiSelect } from './components/UiSelect.vue';
export { default as UiTextarea } from './components/UiTextarea.vue';

export { useToast } from './composables/useToast.js';
export { useConfirm } from './composables/useConfirm.js';
export { useForm } from './composables/useForm.js';
export { useResource } from './composables/useResource.js';

export * as validators from './lib/validators.js';
export * as format from './lib/format.js';
export { resolveTone, statusLabel } from './lib/status-map.js';
export { resolveGlyph } from './lib/glyphs.js';
