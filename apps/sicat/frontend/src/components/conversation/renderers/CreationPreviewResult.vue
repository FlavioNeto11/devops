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

const missingFields = computed(() => asArray(props.data.missingFields || []));
const creationSnapshot = computed(() => toNullableText(props.data.creationSnapshot || props.data.snapshotToken));
const providedFields = computed(() => {
  const payload = asRecord(props.data.payload || {});
  return Object.keys(payload)
    .filter((key) => payload[key] !== null && payload[key] !== undefined && payload[key] !== '')
    .map((key) => ({
      name: key,
      value: toNullableText(payload[key])
    }));
});

const fieldGroupsToShow = computed(() => {
  const requiredFields = [
    'gerador',
    'geradorCnpj',
    'motorista',
    'placa',
    'destinador',
    'rece_code'
  ];

  return {
    required: requiredFields,
    provided: providedFields.value,
    missing: missingFields.value
  };
});

const completeness = computed(() => {
  const total = fieldGroupsToShow.value.required.length;
  const filled = fieldGroupsToShow.value.provided.length;
  return Math.round((filled / total) * 100);
});

const canCreate = computed(() => {
  return missingFields.value.length === 0 && providedFields.value.length > 0;
});

function onCreateFromPreview() {
  emit('action', {
    kind: 'confirm_creation_snapshot',
    snapshotToken: creationSnapshot.value,
    itemCount: 1
  });
}

function onEditFields() {
  emit('action', {
    kind: 'edit_creation_fields',
    currentPayload: props.data.payload
  });
}
</script>

<template>
  <article class="result-card creation-preview" aria-label="creation_preview">
    <header class="result-card-header">
      <v-icon size="16" color="primary">mdi-file-plus</v-icon>
      <h4>Prévia de Criação</h4>
    </header>

    <div class="completeness-bar">
      <div class="bar-label">
        <span>Preenchimento:</span>
        <span class="bar-percentage">{{ completeness }}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${completeness}%` }" />
      </div>
    </div>

    <div class="fields-summary">
      <div v-if="providedFields.length > 0" class="field-group">
        <h5 class="field-group-title">Campos informados ({{ providedFields.length }})</h5>
        <ul class="field-list">
          <li v-for="field in providedFields" :key="field.name" class="field-item provided">
            <v-icon size="12" color="success">mdi-check-circle-outline</v-icon>
            <span class="field-name">{{ field.name }}:</span>
            <span class="field-value">{{ field.value }}</span>
          </li>
        </ul>
      </div>

      <div v-if="missingFields.length > 0" class="field-group">
        <h5 class="field-group-title">Campos faltantes ({{ missingFields.length }})</h5>
        <ul class="field-list">
          <li v-for="field in missingFields" :key="field" class="field-item missing">
            <v-icon size="12" color="error">mdi-alert-circle-outline</v-icon>
            <span class="field-name">{{ field }}</span>
            <span class="field-status">obrigatório</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="creation-actions">
      <v-btn
        v-if="canCreate"
        color="primary"
        size="small"
        variant="tonal"
        @click="onCreateFromPreview"
      >
        Criar Manifesto
      </v-btn>
      <v-btn
        v-else
        disabled
        size="small"
        variant="tonal"
        color="primary"
      >
        Preencha campos obrigatórios
      </v-btn>
      <v-btn
        size="small"
        variant="text"
        color="secondary"
        @click="onEditFields"
      >
        Editar
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

.completeness-bar {
  margin-bottom: 8px;
}

.bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  margin-bottom: 4px;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.bar-percentage {
  font-weight: 600;
  color: rgba(var(--v-theme-primary), 1);
}

.progress-bar {
  height: 4px;
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.12);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: rgb(var(--v-theme-primary));
  transition: width 200ms ease-out;
}

.fields-summary {
  margin-bottom: 8px;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.5);
}

.field-group {
  padding: 8px 0;
}

.field-group:not(:last-child) {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.field-group-title {
  margin: 0 8px 6px;
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: rgba(var(--v-theme-on-surface), 0.64);
}

.field-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.field-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 0.76rem;
}

.field-item.provided {
  background: rgba(var(--v-theme-success), 0.04);
}

.field-item.missing {
  background: rgba(var(--v-theme-error), 0.04);
}

.field-name {
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.87);
  min-width: 100px;
}

.field-value {
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-status {
  flex: 1;
  text-align: right;
  font-size: 0.7rem;
  color: rgba(var(--v-theme-error), 1);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.creation-actions {
  display: flex;
  gap: 8px;
}
</style>
