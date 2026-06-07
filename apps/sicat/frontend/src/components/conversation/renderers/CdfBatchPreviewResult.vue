<script setup>
import { computed } from 'vue';
import { asArray, asRecord, toNullableText } from './result-helpers.js';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['action']);

const selectedCdfs = computed(() => asArray(props.data.selectedCdfs || props.data.cdfDocuments || []));
const associatedManifests = computed(() => asArray(props.data.manifestIds || props.data.manifestReferences || []));
const dateRange = computed(() => ({
  start: toNullableText(props.data.startDate),
  end: toNullableText(props.data.endDate)
}));

const cdfSummary = computed(() => {
  const cdfCount = selectedCdfs.value.length;
  const manifestCount = associatedManifests.value.length;

  return {
    totalCdfs: cdfCount,
    totalManifests: manifestCount,
    status: props.data.status || 'ready'
  };
});

const snapshotToken = computed(() => toNullableText(props.data.snapshotToken || props.data.cdfSnapshot));

function onDownloadBatch() {
  emit('action', {
    kind: 'confirm_cdf_download_batch',
    snapshotToken: snapshotToken.value,
    cdfCount: cdfSummary.value.totalCdfs,
    manifestCount: cdfSummary.value.totalManifests
  });
}

function onCancel() {
  emit('action', {
    kind: 'cancel_cdf_download_batch'
  });
}
</script>

<template>
  <article class="result-card cdf-batch-preview" aria-label="cdf_batch_preview">
    <header class="result-card-header">
      <v-icon size="16" color="primary">mdi-download-multiple</v-icon>
      <h4>Prévia de Download em Lote - CDF</h4>
    </header>

    <div class="cdf-summary">
      <div class="summary-stat">
        <span class="stat-label">CDF/CDR selecionados:</span>
        <span class="stat-value">{{ cdfSummary.totalCdfs }}</span>
      </div>
      <div class="summary-stat">
        <span class="stat-label">Manifestos associados:</span>
        <span class="stat-value">{{ cdfSummary.totalManifests }}</span>
      </div>
    </div>

    <div v-if="dateRange.start || dateRange.end" class="date-range">
      <v-icon size="12" color="on-surface-variant">mdi-calendar-range</v-icon>
      <span>
        <span v-if="dateRange.start">{{ dateRange.start }}</span>
        <span v-if="dateRange.start && dateRange.end"> até </span>
        <span v-if="dateRange.end">{{ dateRange.end }}</span>
      </span>
    </div>

    <div class="cdf-items">
      <div
        v-for="(cdf, index) in selectedCdfs.slice(0, 5)"
        :key="index"
        class="cdf-item"
      >
        <v-icon size="14">mdi-file-pdf-box</v-icon>
        <span class="item-label">
          {{ toNullableText(cdf.name || cdf.filename || cdf.documentId || `CDF ${index + 1}`) }}
        </span>
        <span class="item-size">
          {{ cdf.sizeBytes ? `${(Number(cdf.sizeBytes) / 1024).toFixed(1)} KB` : '-' }}
        </span>
      </div>
      <div v-if="selectedCdfs.length > 5" class="cdf-more">
        <v-icon size="12">mdi-plus</v-icon>
        <span>{{ selectedCdfs.length - 5 }} mais documentos...</span>
      </div>
    </div>

    <div v-if="snapshotToken" class="snapshot-info">
      <v-icon size="12" color="info">mdi-information-outline</v-icon>
      <span>Lote prévisualizador. Confirme para iniciar download.</span>
    </div>

    <div class="cdf-actions">
      <v-btn
        color="primary"
        size="small"
        variant="tonal"
        @click="onDownloadBatch"
      >
        Baixar Lote ({{ cdfSummary.totalCdfs }})
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

.cdf-summary {
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

.date-range {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: rgba(var(--v-theme-secondary), 0.08);
  font-size: 0.75rem;
  color: rgba(var(--v-theme-secondary), 1);
}

.cdf-items {
  margin-bottom: 8px;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.5);
}

.cdf-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 0.78rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.cdf-item:last-child {
  border-bottom: none;
}

.item-label {
  flex: 1;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.87);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-size {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.64);
}

.cdf-more {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  font-size: 0.76rem;
  color: rgba(var(--v-theme-on-surface), 0.64);
  background: rgba(var(--v-theme-on-surface), 0.04);
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

.cdf-actions {
  display: flex;
  gap: 8px;
}
</style>
