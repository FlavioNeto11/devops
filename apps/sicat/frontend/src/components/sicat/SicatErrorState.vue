<script setup>
defineProps({
  title: { type: String, default: 'Algo deu errado' },
  /** Mensagem principal (resumo do erro). */
  message: { type: String, default: '' },
  /** Detalhe técnico opcional (mostrado em uma área menor). */
  detail: { type: String, default: '' },
  /** Código do erro (correlationId, http status, etc.). */
  code: { type: String, default: '' },
  /** Ícone mdi a exibir. */
  icon: { type: String, default: 'mdi-alert-circle-outline' },
  /** Modo compacto (uso inline em listas/cards). */
  compact: { type: Boolean, default: false },
  /** Permite tentativa de retry via emit. */
  retryable: { type: Boolean, default: false },
  retryLabel: { type: String, default: 'Tentar de novo' }
});

const emit = defineEmits(['retry']);
</script>

<template>
  <output
    class="sicat-error-state"
    :data-compact="compact ? 'true' : 'false'"
    role="alert"
    aria-live="assertive"
  >
    <v-icon v-if="icon" :icon="icon" :size="compact ? 24 : 40" class="sicat-error-state__icon" aria-hidden="true" />
    <div class="sicat-error-state__text">
      <span class="sicat-error-state__title">{{ title }}</span>
      <span v-if="message" class="sicat-error-state__message">{{ message }}</span>
      <span v-if="code" class="sicat-error-state__code">{{ code }}</span>
      <pre v-if="detail" class="sicat-error-state__detail">{{ detail }}</pre>
    </div>
    <div v-if="retryable || $slots.actions" class="sicat-error-state__actions">
      <slot name="actions">
        <v-btn
          v-if="retryable"
          color="error"
          variant="tonal"
          size="small"
          @click="emit('retry')"
        >
          {{ retryLabel }}
        </v-btn>
      </slot>
    </div>
  </output>
</template>

<style scoped>
.sicat-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: var(--space-6) var(--space-5);
  border-radius: var(--radius-md);
  border: 1px solid rgba(var(--v-theme-error), 0.28);
  background: rgba(var(--v-theme-error), 0.06);
  text-align: center;
}

.sicat-error-state[data-compact='true'] {
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  padding: var(--space-3) var(--space-4);
  text-align: left;
}

.sicat-error-state__icon {
  color: rgba(var(--v-theme-error), 0.85);
}

.sicat-error-state__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 60ch;
}

.sicat-error-state__title {
  font-weight: 700;
  font-size: 1rem;
  color: rgba(var(--v-theme-error), 0.95);
}

.sicat-error-state__message {
  color: rgba(var(--v-theme-on-surface), 0.85);
  font-size: 0.92rem;
}

.sicat-error-state__code {
  font-family: var(--font-family-mono);
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.sicat-error-state__detail {
  margin: 4px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-family: var(--font-family-mono);
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  white-space: pre-wrap;
  word-break: break-word;
  text-align: left;
}

.sicat-error-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
