<script setup>
import { computed } from 'vue';
import { toNullableText } from './result-helpers.js';

const props = defineProps({
  decision: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['action']);

const reasonCode = computed(() => toNullableText(props.decision.reasonCode));
const reason = computed(() => toNullableText(props.decision.reason));
const maxBatchSize = computed(() => Number(props.decision.maxBatchSize || 0));
const enforcedScope = computed(() => toNullableText(props.decision.enforcedScope));

const title = computed(() => {
  switch (reasonCode.value) {
    case 'BATCH_LIMIT_EXCEEDED':
      return 'Limite de lote excedido';
    case 'CROSS_ACCOUNT_VIOLATION':
      return 'Violação de escopo de conta';
    case 'SESSION_SCOPE_MISMATCH':
      return 'Sessão expirada';
    case 'CHANNEL_BLOCKED':
      return 'Canal bloqueado para esta operação';
    case 'PERMISSION_DENIED':
      return 'Permissão negada';
    default:
      return 'Ação bloqueada por política de segurança';
  }
});

const icon = computed(() => {
  switch (reasonCode.value) {
    case 'BATCH_LIMIT_EXCEEDED':
      return 'mdi-format-list-checks';
    case 'CROSS_ACCOUNT_VIOLATION':
      return 'mdi-account-convert';
    case 'SESSION_SCOPE_MISMATCH':
      return 'mdi-lock-clock';
    default:
      return 'mdi-shield-alert-outline';
  }
});

const colorScheme = computed(() => {
  switch (reasonCode.value) {
    case 'BATCH_LIMIT_EXCEEDED':
      return 'warning';
    case 'CROSS_ACCOUNT_VIOLATION':
      return 'error';
    case 'SESSION_SCOPE_MISMATCH':
      return 'error';
    case 'PERMISSION_DENIED':
      return 'error';
    default:
      return 'warning';
  }
});

const suggestedAction = computed(() => {
  switch (reasonCode.value) {
    case 'BATCH_LIMIT_EXCEEDED':
      return {
        label: `Reduza para ${maxBatchSize.value} itens`,
        kind: 'reduce_selection',
        hint: `Máximo ${maxBatchSize.value} itens para este canal`
      };
    case 'CROSS_ACCOUNT_VIOLATION':
      return {
        label: 'Gerar novo preview',
        kind: 'regenerate_preview',
        hint: 'Preview gerado em outra conta operacional'
      };
    case 'SESSION_SCOPE_MISMATCH':
      return {
        label: 'Reautenticar',
        kind: 'reauthenticate',
        hint: 'Sua sessão CETESB foi renovada'
      };
    default:
      return null;
  }
});

function onAction(kind) {
  emit('action', {
    kind,
    reasonCode: reasonCode.value,
    decision: props.decision
  });
}
</script>

<template>
  <article :class="['result-card', `result-card--${colorScheme}`]" :aria-label="`policy_error_${reasonCode}`">
    <header class="result-card-header">
      <v-icon :size="16" :color="colorScheme">{{ icon }}</v-icon>
      <h4>{{ title }}</h4>
    </header>

    <div v-if="reason" class="error-reason">
      {{ reason }}
    </div>

    <div v-if="reasonCode === 'BATCH_LIMIT_EXCEEDED'" class="batch-limit-details">
      <div class="detail-row">
        <span class="detail-label">Limite deste canal:</span>
        <span class="detail-value">{{ maxBatchSize }} itens</span>
      </div>
    </div>

    <div v-if="enforcedScope" class="scope-details">
      <div class="detail-row">
        <span class="detail-label">Escopo protegido:</span>
        <span class="detail-value">{{ enforcedScope }}</span>
      </div>
    </div>

    <div v-if="suggestedAction" class="suggested-action">
      <v-btn
        :color="colorScheme"
        size="small"
        variant="tonal"
        @click="onAction(suggestedAction.kind)"
      >
        {{ suggestedAction.label }}
      </v-btn>
      <span class="action-hint">{{ suggestedAction.hint }}</span>
    </div>
  </article>
</template>

<style scoped>
.result-card {
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.result-card--warning {
  border: 1px solid rgba(var(--v-theme-warning), 0.35);
  background: rgba(var(--v-theme-warning), 0.08);
}

.result-card--error {
  border: 1px solid rgba(var(--v-theme-error), 0.35);
  background: rgba(var(--v-theme-error), 0.08);
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

.error-reason {
  font-size: 0.8rem;
  line-height: 1.4;
  margin-bottom: 8px;
  color: rgba(var(--v-theme-on-surface), 0.87);
}

.batch-limit-details,
.scope-details {
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.5);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.78rem;
  align-items: center;
}

.detail-label {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-weight: 500;
}

.detail-value {
  color: rgba(var(--v-theme-on-surface), 0.87);
  font-weight: 600;
}

.suggested-action {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  flex-wrap: wrap;
}

.action-hint {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-style: italic;
}

@media (max-width: 480px) {
  .suggested-action {
    flex-direction: column;
    align-items: stretch;
  }

  .suggested-action > :first-child {
    width: 100%;
  }
}
</style>
