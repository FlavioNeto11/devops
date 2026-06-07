<script setup>
import { computed } from 'vue';
import { asArray, toNullableText } from './result-helpers.js';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['action']);

const intent = computed(() => toNullableText(props.data.intent));
const items = computed(() => asArray(props.data.selectedItems || props.data.items || []));
const maxBatchSize = computed(() => Number(props.data.maxBatchSize || 0));
const snapshotToken = computed(() => toNullableText(props.data.selectionSnapshot || props.data.snapshotToken));
const totalCount = computed(() => items.value.length);

const intentLabel = computed(() => {
  const intentMap = {
    'manifest.batch_cancel_selected': 'Cancelar Manifestos',
    'manifest.batch_submit_selected': 'Submeter Manifestos',
    'manifest.batch_print_selected': 'Imprimir Manifestos',
    'manifest.replicate_segmented': 'Replicar Manifestos em Lote',
    'cdf.download_batch_selected': 'Download CDF em Lote'
  };
  return intentMap[intent.value] || 'Operação em Lote';
});

const operationIcon = computed(() => {
  const iconMap = {
    'manifest.batch_cancel_selected': 'mdi-cancel',
    'manifest.batch_submit_selected': 'mdi-send-check',
    'manifest.batch_print_selected': 'mdi-printer',
    'manifest.replicate_segmented': 'mdi-content-duplicate',
    'cdf.download_batch_selected': 'mdi-download-multiple'
  };
  return iconMap[intent.value] || 'mdi-list-box';
});

const isWithinLimit = computed(() => {
  return maxBatchSize.value === 0 || totalCount.value <= maxBatchSize.value;
});

function onConfirm() {
  emit('action', {
    kind: 'confirm_batch_selection',
    intent: intent.value,
    snapshotToken: snapshotToken.value,
    itemCount: totalCount.value
  });
}

function onCancel() {
  emit('action', {
    kind: 'cancel_batch_selection',
    intent: intent.value
  });
}
</script>

<template>
  <article class="result-card batch-preview" aria-label="batch_preview">
    <header class="result-card-header">
      <v-icon :size="16" color="primary">{{ operationIcon }}</v-icon>
      <h4>{{ intentLabel }} - Preview</h4>
    </header>

    <div class="batch-summary">
      <div class="summary-stat">
        <span class="stat-label">Itens selecionados:</span>
        <span class="stat-value">{{ totalCount }}</span>
      </div>
      <div v-if="maxBatchSize > 0" class="summary-stat" :class="{ 'stat-exceeded': !isWithinLimit }">
        <span class="stat-label">Limite:</span>
        <span class="stat-value">{{ maxBatchSize }}</span>
      </div>
    </div>

    <div class="batch-items">
      <div
        v-for="(item, index) in items.slice(0, 5)"
        :key="index"
        class="batch-item"
      >
        <span class="item-index">{{ index + 1 }}</span>
        <span class="item-label">
          {{ toNullableText(item.manifestNumber || item.manifestId || item.id || `Item ${index + 1}`) }}
        </span>
        <span v-if="item.status" class="item-status">{{ toNullableText(item.status) }}</span>
      </div>
      <div v-if="totalCount > 5" class="batch-more">
        <v-icon size="12">mdi-plus</v-icon>
        <span>{{ totalCount - 5 }} mais itens...</span>
      </div>
    </div>

    <div v-if="snapshotToken" class="snapshot-info">
      <v-icon size="12" color="info">mdi-information-outline</v-icon>
      <span>Preview congelado. Confirme para executar.</span>
    </div>

    <div class="batch-actions">
      <v-btn
        color="primary"
        size="small"
        variant="tonal"
        :disabled="!isWithinLimit"
        @click="onConfirm"
      >
        Confirmar ({{ totalCount }})
      </v-btn>
      <v-btn
        size="small"
        variant="text"
        color="secondary"
        @click="onCancel"
      >
        Cancelar
      </v-btn>
    </div>
  </article>
</template>

<style scoped>
.result-card {
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(var(--v-theme-surface), 0.9);
}

.result-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.result-card-header h4 {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.batch-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.06);
}

.summary-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.stat-value {
  font-size: 0.95rem;
  font-weight: 700;
  color: rgba(var(--v-theme-primary), 1);
}

.stat-exceeded .stat-value {
  color: rgba(var(--v-theme-error), 1);
}

.batch-items {
  margin-bottom: 8px;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.5);
}

.batch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 0.78rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.batch-item:last-child {
  border-bottom: none;
}

.item-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.2);
  color: rgba(var(--v-theme-primary), 1);
  font-weight: 600;
  font-size: 0.7rem;
}

.item-label {
  flex: 1;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.87);
}

.item-status {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.64);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.batch-more {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  font-size: 0.76rem;
  color: rgba(var(--v-theme-on-surface), 0.64);
  background: rgba(var(--v-theme-on-surface), 0.04);
  text-align: center;
}

.snapshot-info {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: rgba(var(--v-theme-info), 0.08);
  font-size: 0.75rem;
  color: rgba(var(--v-theme-info), 1);
}

.batch-actions {
  display: flex;
  gap: 8px;
}
</style>
