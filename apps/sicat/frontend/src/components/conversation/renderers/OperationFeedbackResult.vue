<script setup>
import { computed } from 'vue';
import { asRecord, toNullableText, formatProgress } from './result-helpers.js';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['action']);

const feedbackType = computed(() => toNullableText(props.data.feedbackType || props.data.type || 'unknown'));
const operationStatus = computed(() => toNullableText(props.data.status || props.data.operationStatus));
const progress = computed(() => formatProgress(props.data.progress || {}));
const failureDetails = computed(() => asRecord(props.data.failureDetails || {}));
const successDetails = computed(() => asRecord(props.data.successDetails || {}));
const retryable = computed(() => Boolean(props.data.retryable));

const title = computed(() => {
  const titleMap = {
    'partial_failure': 'Execução Parcial',
    'retry_available': 'Operação com Sucesso Parcial',
    'operation_success': 'Operação Concluída',
    'operation_failure': 'Operação Falhou',
    'batch_feedback': 'Feedback de Lote'
  };
  return titleMap[feedbackType.value] || 'Feedback da Operação';
});

const icon = computed(() => {
  const iconMap = {
    'partial_failure': 'mdi-alert-circle-outline',
    'retry_available': 'mdi-check-circle-outline',
    'operation_success': 'mdi-check-circle',
    'operation_failure': 'mdi-close-circle-outline',
    'batch_feedback': 'mdi-information-outline'
  };
  return iconMap[feedbackType.value] || 'mdi-information-outline';
});

const colorScheme = computed(() => {
  const colorMap = {
    'partial_failure': 'warning',
    'retry_available': 'success',
    'operation_success': 'success',
    'operation_failure': 'error',
    'batch_feedback': 'info'
  };
  return colorMap[feedbackType.value] || 'info';
});

const progressPercentage = computed(() => {
  if (progress.value.total === 0) return 0;
  return Math.round((progress.value.completed / progress.value.total) * 100);
});

function onRetry() {
  emit('action', {
    kind: 'retry_operation',
    feedbackType: feedbackType.value,
    failedItems: failureDetails.value.itemIds || []
  });
}

function onDismiss() {
  emit('action', {
    kind: 'dismiss_feedback'
  });
}
</script>

<template>
  <article :class="['result-card', `result-card--${colorScheme}`]" :aria-label="`feedback_${feedbackType}`">
    <header class="result-card-header">
      <v-icon :size="16" :color="colorScheme">{{ icon }}</v-icon>
      <h4>{{ title }}</h4>
    </header>

    <div v-if="progress.total > 0" class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${progressPercentage}%` }" />
      </div>
      <div class="progress-stats">
        <div class="stat">
          <span class="stat-label">Concluídos:</span>
          <span class="stat-value">{{ progress.completed }}/{{ progress.total }}</span>
        </div>
        <div v-if="progress.failed > 0" class="stat error">
          <span class="stat-label">Falhas:</span>
          <span class="stat-value">{{ progress.failed }}</span>
        </div>
        <div v-if="progress.pending > 0" class="stat">
          <span class="stat-label">Pendentes:</span>
          <span class="stat-value">{{ progress.pending }}</span>
        </div>
      </div>
    </div>

    <div v-if="Object.keys(successDetails).length > 0" class="success-details">
      <h5 class="detail-title">Itens Bem-Sucedidos</h5>
      <ul class="detail-list">
        <li v-for="(value, key) in successDetails" :key="key" class="detail-item success">
          <v-icon size="12" color="success">mdi-check-circle-outline</v-icon>
          <span>{{ key }}: {{ toNullableText(value) }}</span>
        </li>
      </ul>
    </div>

    <div v-if="Object.keys(failureDetails).length > 0" class="failure-details">
      <h5 class="detail-title">Itens Falhados</h5>
      <ul class="detail-list">
        <li v-for="(value, key) in failureDetails" :key="key" class="detail-item failure">
          <v-icon size="12" color="error">mdi-alert-circle-outline</v-icon>
          <span>{{ key }}: {{ toNullableText(value) }}</span>
        </li>
      </ul>
    </div>

    <div class="feedback-actions">
      <v-btn
        v-if="retryable"
        color="warning"
        size="small"
        variant="tonal"
        @click="onRetry"
      >
        Tentar Novamente
      </v-btn>
      <v-btn
        size="small"
        variant="text"
        color="secondary"
        @click="onDismiss"
      >
        Fechar
      </v-btn>
    </div>
  </article>
</template>

<style scoped>
.result-card {
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.result-card--success {
  border: 1px solid rgba(var(--v-theme-success), 0.2);
  background: rgba(var(--v-theme-success), 0.08);
}

.result-card--warning {
  border: 1px solid rgba(var(--v-theme-warning), 0.2);
  background: rgba(var(--v-theme-warning), 0.08);
}

.result-card--error {
  border: 1px solid rgba(var(--v-theme-error), 0.2);
  background: rgba(var(--v-theme-error), 0.08);
}

.result-card--info {
  border: 1px solid rgba(var(--v-theme-info), 0.2);
  background: rgba(var(--v-theme-info), 0.08);
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

.progress-section {
  margin-bottom: 8px;
}

.progress-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(var(--v-theme-on-surface), 0.12);
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(var(--v-theme-success), 0.8), rgba(var(--v-theme-success), 1));
  transition: width 300ms ease-out;
}

.progress-stats {
  display: flex;
  gap: 8px;
  font-size: 0.75rem;
  flex-wrap: wrap;
}

.stat {
  display: flex;
  gap: 4px;
}

.stat-label {
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-weight: 500;
}

.stat-value {
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.87);
}

.stat.error .stat-value {
  color: rgba(var(--v-theme-error), 1);
}

.success-details,
.failure-details {
  margin-bottom: 8px;
}

.detail-title {
  margin: 0 0 4px;
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: rgba(var(--v-theme-on-surface), 0.64);
}

.detail-list {
  margin: 0;
  padding: 4px;
  list-style: none;
  border-radius: 4px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.3);
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  font-size: 0.74rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-item.success {
  color: rgba(var(--v-theme-success), 0.87);
}

.detail-item.failure {
  color: rgba(var(--v-theme-error), 0.87);
}

.feedback-actions {
  display: flex;
  gap: 8px;
}
</style>
