<script setup>
import { formatDateBr } from '../utils/date-format.js';

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  selectedId: {
    type: String,
    default: ''
  },
  page: {
    type: Number,
    default: 1
  },
  pageSize: {
    type: Number,
    default: 20
  },
  totalItems: {
    type: Number,
    default: 0
  },
  totalPages: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['select', 'page-change']);

function formatDate(value) {
  return formatDateBr(value);
}

function goToPreviousPage() {
  if (props.page > 1) {
    emit('page-change', props.page - 1);
  }
}

function goToNextPage() {
  if (props.page < props.totalPages) {
    emit('page-change', props.page + 1);
  }
}

function displayManifestLabel(manifest) {
  if (manifest?.manifestNumber) {
    return manifest.manifestNumber;
  }

  if (manifest?.externalCode) {
    return `Código CETESB ${manifest.externalCode}`;
  }

  return 'Rascunho (número CETESB pendente)';
}
</script>

<template>
  <div class="list-wrapper">
    <div class="list-header">
      <div>
        <span class="manifest-list-kicker">Painel lateral</span>
        <h2>Manifestos</h2>
      </div>
      <p class="text-muted">
        {{ totalItems }} registro(s) · página {{ page }} de {{ totalPages || 1 }}
      </p>
    </div>

    <ul class="manifest-list">
      <li v-for="manifest in items" :key="manifest.id">
        <button
          type="button"
          class="manifest-item"
          :class="{ active: selectedId === manifest.id }"
          @click="emit('select', manifest.id)"
        >
          <div class="manifest-main">
            <strong>{{ displayManifestLabel(manifest) }}</strong>
            <span class="manifest-id">{{ manifest.id }}</span>
          </div>
          <div class="manifest-meta">
            <span class="status-chip">{{ manifest.status || '-' }}</span>
            <span>Data: {{ formatDate(manifest.expeditionDate) }}</span>
            <span>Gerador: {{ manifest.generator?.description || '-' }}</span>
          </div>
        </button>
      </li>
    </ul>

    <div class="pagination">
      <button class="btn btn-secondary" :disabled="page <= 1" @click="goToPreviousPage">Anterior</button>
      <span>Página {{ page }}</span>
      <button class="btn btn-secondary" :disabled="page >= totalPages" @click="goToNextPage">Próxima</button>
    </div>
  </div>
</template>

<style scoped>
.list-wrapper {
  gap: 16px;
}

.list-header {
  align-items: flex-start;
}

.manifest-list-kicker {
  display: inline-flex;
  width: fit-content;
  min-height: 28px;
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface) 90%);
  color: var(--color-primary);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.manifest-item {
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border) 68%, transparent 32%);
  background: color-mix(in srgb, var(--color-surface) 88%, var(--color-surface-raised) 12%);
  padding: 16px;
}

.manifest-item:hover {
  border-color: color-mix(in srgb, var(--color-primary) 38%, var(--color-border) 62%);
  background: color-mix(in srgb, var(--color-bg-accent) 24%, var(--color-surface) 76%);
}

.manifest-item.active {
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border) 56%);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface) 90%);
  box-shadow: inset 3px 0 0 var(--color-primary);
}

.manifest-id {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
}

.status-chip {
  width: fit-content;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border) 76%);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface) 90%);
  color: color-mix(in srgb, var(--color-primary) 84%, var(--color-text) 16%);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 0.78rem;
}

@media (max-width: 767px) {
  .list-header {
    flex-direction: column;
  }
}
</style>
