<script setup>
import { computed } from 'vue';
import { asRecord, toNullableText } from './result-helpers.js';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['action']);

const sourceManifest = computed(() => asRecord(props.data.sourceManifest || {}));
const patch = computed(() => asRecord(props.data.patch || {}));
const replicationSnapshot = computed(() => toNullableText(props.data.replicationSnapshot || props.data.snapshotToken));

const sourceDetails = computed(() => ({
  manifestNumber: toNullableText(sourceManifest.value.manifestNumber || sourceManifest.value.manifestId),
  status: toNullableText(sourceManifest.value.status || sourceManifest.value.externalStatus),
  gerador: toNullableText(sourceManifest.value.generator?.description || sourceManifest.value.generatorName),
  motorista: toNullableText(sourceManifest.value.driverName),
  placa: toNullableText(sourceManifest.value.vehiclePlate)
}));

const patchChanges = computed(() => {
  return Object.keys(patch.value)
    .filter((key) => patch.value[key] !== null && patch.value[key] !== undefined)
    .map((key) => ({
      field: key,
      value: toNullableText(patch.value[key])
    }));
});

const replicas = computed(() => {
  const count = Number(props.data.replicaCount || 1);
  return Math.max(1, count);
});

function onConfirmReplication() {
  emit('action', {
    kind: 'confirm_replication_snapshot',
    snapshotToken: replicationSnapshot.value,
    sourceManifestId: sourceDetails.value.manifestNumber,
    replicaCount: replicas.value,
    patch: patch.value
  });
}

function onCancelReplication() {
  emit('action', {
    kind: 'cancel_replication',
    sourceManifestId: sourceDetails.value.manifestNumber
  });
}
</script>

<template>
  <article class="result-card replication-preview" aria-label="replication_preview">
    <header class="result-card-header">
      <v-icon size="16" color="primary">mdi-content-duplicate</v-icon>
      <h4>Prévia de Replicação</h4>
    </header>

    <div class="replication-info">
      <div class="info-stat">
        <span class="stat-label">Manifestos a gerar:</span>
        <span class="stat-value">{{ replicas }}</span>
      </div>
    </div>

    <div class="source-section">
      <h5 class="section-title">Manifesto Base</h5>
      <div class="detail-grid">
        <div class="detail-row">
          <span class="detail-label">Número:</span>
          <span class="detail-value">{{ sourceDetails.manifestNumber }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status:</span>
          <span class="detail-value">{{ sourceDetails.status }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Gerador:</span>
          <span class="detail-value">{{ sourceDetails.gerador }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Motorista:</span>
          <span class="detail-value">{{ sourceDetails.motorista }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Placa:</span>
          <span class="detail-value">{{ sourceDetails.placa }}</span>
        </div>
      </div>
    </div>

    <div v-if="patchChanges.length > 0" class="patch-section">
      <h5 class="section-title">Alterações na Replicação</h5>
      <div class="patch-list">
        <div v-for="change in patchChanges" :key="change.field" class="patch-item">
          <v-icon size="12" color="warning">mdi-pencil</v-icon>
          <span class="patch-field">{{ change.field }}:</span>
          <span class="patch-value">{{ change.value }}</span>
        </div>
      </div>
    </div>

    <div v-if="replicationSnapshot" class="snapshot-info">
      <v-icon size="12" color="info">mdi-information-outline</v-icon>
      <span>Prévia congelada. Confirme para executar replicação.</span>
    </div>

    <div class="replication-actions">
      <v-btn
        color="primary"
        size="small"
        variant="tonal"
        @click="onConfirmReplication"
      >
        Confirmar Replicação
      </v-btn>
      <v-btn
        size="small"
        variant="text"
        color="secondary"
        @click="onCancelReplication"
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

.replication-info {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.06);
}

.info-stat {
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

.source-section,
.patch-section {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-surface-variant), 0.5);
}

.section-title {
  margin: 0 0 6px;
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: rgba(var(--v-theme-on-surface), 0.64);
}

.detail-grid {
  display: grid;
  gap: 4px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.76rem;
}

.detail-label {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-weight: 500;
  min-width: 100px;
}

.detail-value {
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.87);
  text-align: right;
}

.patch-list {
  display: grid;
  gap: 4px;
}

.patch-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 4px;
  background: rgba(var(--v-theme-warning), 0.06);
  font-size: 0.76rem;
}

.patch-field {
  font-weight: 600;
  color: rgba(var(--v-theme-warning), 1);
  min-width: 100px;
}

.patch-value {
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.87);
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

.replication-actions {
  display: flex;
  gap: 8px;
}
</style>
