<script setup>
import { reactive, watch } from 'vue';
import { normalizeBrDateInput } from '../utils/date-format.js';

const props = defineProps({
  filters: {
    type: Object,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['apply', 'reset', 'page-size-change']);

const localFilters = reactive({
  integrationAccountId: '',
  dateFrom: '',
  dateTo: '',
  page: 1,
  pageSize: 20
});

watch(
  () => props.filters,
  (nextFilters) => {
    localFilters.integrationAccountId = nextFilters.integrationAccountId || '';
    localFilters.dateFrom = nextFilters.dateFrom || '';
    localFilters.dateTo = nextFilters.dateTo || '';
    localFilters.page = nextFilters.page || 1;
    localFilters.pageSize = nextFilters.pageSize || 20;
  },
  { immediate: true, deep: true }
);

function onSubmit() {
  emit('apply', {
    integrationAccountId: localFilters.integrationAccountId.trim(),
    dateFrom: localFilters.dateFrom,
    dateTo: localFilters.dateTo,
    page: Number(localFilters.page || 1),
    pageSize: Number(localFilters.pageSize || 20)
  });
}

function onReset() {
  emit('reset');
}

function onPageSizeChange() {
  emit('page-size-change', Number(localFilters.pageSize || 20));
}

function normalizeDate(field) {
  localFilters[field] = normalizeBrDateInput(localFilters[field]);
}
</script>

<template>
  <form class="filters-shell" @submit.prevent="onSubmit">
    <div class="filters-header">
      <h3>Filtros de busca</h3>
      <p class="text-muted">Refine os resultados locais por conta e período.</p>
    </div>

    <div class="filters-grid">
      <label class="form-field">
        <span>Integration Account ID *</span>
        <input
          v-model="localFilters.integrationAccountId"
          type="text"
          required
          placeholder="acc_nova_it_prod"
          autocomplete="off"
        />
      </label>

      <label class="form-field">
        <span>Data inicial</span>
        <input
          v-model="localFilters.dateFrom"
          type="text"
          inputmode="numeric"
          placeholder="dd/mm/yyyy"
          @blur="normalizeDate('dateFrom')"
        />
      </label>

      <label class="form-field">
        <span>Data final</span>
        <input
          v-model="localFilters.dateTo"
          type="text"
          inputmode="numeric"
          placeholder="dd/mm/yyyy"
          @blur="normalizeDate('dateTo')"
        />
      </label>

      <label class="form-field field-page-size">
        <span>Itens por página</span>
        <select v-model.number="localFilters.pageSize" @change="onPageSizeChange">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </label>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn btn-primary" :disabled="loading">Buscar</button>
      <button type="button" class="btn btn-secondary" :disabled="loading" @click="onReset">Limpar</button>
    </div>
  </form>
</template>

<style scoped>
.filters-shell {
  display: grid;
  gap: var(--space-4);
}

.filters-header {
  display: grid;
  gap: var(--space-1);
}

.filters-grid {
  display: grid;
  gap: var(--space-3);
}

@media (min-width: 768px) {
  .filters-grid {
    grid-template-columns: 1fr;
  }
}
</style>
