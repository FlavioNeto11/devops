<script setup>
import { computed } from 'vue';
import SicatLoadingState from './SicatLoadingState.vue';
import SicatEmptyState from './SicatEmptyState.vue';
import SicatErrorState from './SicatErrorState.vue';

const props = defineProps({
  /** Headers no formato Vuetify: { title, key, align, width, sortable }. */
  headers: { type: Array, required: true },
  items: { type: Array, default: () => [] },
  /** Chave única de cada item (default 'id'). */
  itemValue: { type: String, default: 'id' },
  loading: { type: Boolean, default: false },
  loadingMessage: { type: String, default: 'Carregando…' },
  /** Mensagem de erro. Quando preenchida, substitui a tabela. */
  error: { type: [String, Object, null], default: null },
  retryable: { type: Boolean, default: false },
  /** Config do estado vazio. */
  empty: {
    type: Object,
    default: () => ({ title: 'Nenhum registro encontrado', description: '', icon: 'mdi-tray-remove' })
  },
  density: {
    type: String,
    default: 'comfortable',
    validator: (value) => ['comfortable', 'compact', 'default'].includes(value)
  },
  hover: { type: Boolean, default: true },
  /** Habilita seleção múltipla (checkbox). v-model:selected. */
  selectable: { type: Boolean, default: false },
  selected: { type: Array, default: () => [] },
  /** Mostra o footer de paginação (padrão ERP). Desligue com :show-footer="false". */
  showFooter: { type: Boolean, default: true },
  /** Linhas por página (padrão 10). Use -1 para mostrar tudo. */
  itemsPerPage: { type: Number, default: 10 },
  /** Opções do seletor "linhas por página". */
  itemsPerPageOptions: {
    type: Array,
    default: () => [
      { value: 10, title: '10' },
      { value: 25, title: '25' },
      { value: 50, title: '50' },
      { value: 100, title: '100' },
      { value: -1, title: 'Tudo' }
    ]
  }
});

const emit = defineEmits(['update:selected', 'row-click', 'retry']);

const emptyConfig = computed(() => ({
  title: props.empty?.title || 'Nenhum registro encontrado',
  description: props.empty?.description || '',
  icon: props.empty?.icon || 'mdi-tray-remove'
}));

const normalizedError = computed(() => {
  if (!props.error) return null;
  if (typeof props.error === 'string') return { message: props.error, code: '' };
  return {
    message: props.error.message || 'Erro ao carregar dados',
    code: props.error.code || props.error.correlationId || ''
  };
});

// Slots de célula/expansão repassados ao v-data-table (exceto os que tratamos aqui).
const RESERVED_SLOTS = new Set(['loading', 'no-data', 'error', 'footer']);
const slots = defineSlots();
const passthroughSlotNames = computed(() =>
  Object.keys(slots).filter((name) => !RESERVED_SLOTS.has(name))
);

function onSelectionUpdate(value) {
  emit('update:selected', value);
}
</script>

<template>
  <div class="sicat-data-table">
    <SicatErrorState
      v-if="normalizedError"
      :message="normalizedError.message"
      :code="normalizedError.code"
      :retryable="retryable"
      @retry="emit('retry')"
    />

    <v-data-table
      v-else
      :headers="headers"
      :items="items"
      :item-value="itemValue"
      :loading="loading"
      :density="density"
      :hover="hover"
      :show-select="selectable"
      :model-value="selected"
      :items-per-page="itemsPerPage"
      :items-per-page-options="itemsPerPageOptions"
      items-per-page-text="Linhas por página:"
      :hide-default-footer="!showFooter"
      class="sicat-data-table__table"
      @update:model-value="onSelectionUpdate"
      @click:row="(event, ctx) => emit('row-click', ctx?.item)"
    >
      <template v-for="name in passthroughSlotNames" #[name]="slotProps" :key="name">
        <slot :name="name" v-bind="slotProps ?? {}" />
      </template>

      <template #loading>
        <slot name="loading">
          <SicatLoadingState :title="loadingMessage" variant="skeleton" :skeleton-lines="4" />
        </slot>
      </template>

      <template #no-data>
        <slot name="no-data">
          <SicatEmptyState
            :title="emptyConfig.title"
            :description="emptyConfig.description"
            :icon="emptyConfig.icon"
            compact
          />
        </slot>
      </template>
    </v-data-table>

    <div v-if="$slots.footer" class="sicat-data-table__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.sicat-data-table {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}

.sicat-data-table__table {
  border-radius: var(--radius-md);
  overflow: hidden;
}

.sicat-data-table__table :deep(thead th) {
  text-transform: uppercase;
  font-size: 0.72rem !important;
  font-weight: 800 !important;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.6) !important;
  background: rgba(var(--v-theme-surface-light, var(--v-theme-surface)), 0.6);
  white-space: nowrap;
}

.sicat-data-table__table :deep(tbody tr) {
  cursor: inherit;
}

/* Legibilidade padrão ERP: zebra striping + hover destacado + footer compacto. */
.sicat-data-table__table :deep(tbody tr:nth-child(even)) td {
  background: rgba(var(--v-theme-on-surface), 0.025);
}

.sicat-data-table__table :deep(tbody tr:hover) td {
  background: rgba(var(--v-theme-primary), 0.06) !important;
}

.sicat-data-table__table :deep(tbody td) {
  font-size: 0.85rem;
}

.sicat-data-table__table :deep(.v-data-table-footer) {
  padding: 6px 10px;
  font-size: 0.8rem;
  border-top: 1px solid rgba(var(--v-border-color), 0.14);
}

.sicat-data-table__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-2);
}
</style>
