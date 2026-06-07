<script setup>
import { computed } from 'vue';
import { resolveStatusLabel, resolveStatusTone } from '../../lib/status-map.js';

const props = defineProps({
  /** Status bruto vindo do backend (ex: "submitted", "failed_validation"). */
  status: { type: [String, Number, null], default: null },
  /** Domínio do status. Define qual mapa de tone/label usar. */
  domain: {
    type: String,
    default: 'manifest',
    validator: (value) => ['manifest', 'job', 'cdf', 'dmr', 'account-health'].includes(value)
  },
  /** Label customizado. Se informado, ignora o mapa de labels. */
  label: { type: String, default: null },
  /** Tom visual forçado. Se omitido, é resolvido pelo status-map. */
  tone: {
    type: String,
    default: null,
    validator: (value) =>
      value === null || ['neutral', 'running', 'warning', 'success', 'error'].includes(value)
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  /** Exibe um dot indicador antes do label. */
  withDot: { type: Boolean, default: false }
});

const resolvedTone = computed(() => props.tone || resolveStatusTone(props.domain, props.status));
const resolvedLabel = computed(() => props.label || resolveStatusLabel(props.domain, props.status));
</script>

<template>
  <span class="sicat-status-badge" :data-tone="resolvedTone" :data-size="size" role="status">
    <span v-if="withDot" class="sicat-status-badge__dot" aria-hidden="true" />
    <span class="sicat-status-badge__label">{{ resolvedLabel }}</span>
  </span>
</template>

<style scoped>
.sicat-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.75rem;
  letter-spacing: 0.02em;
  line-height: 1.2;
  white-space: nowrap;
  border: 1px solid transparent;
}

.sicat-status-badge[data-size='sm'] {
  padding: 2px 8px;
  font-size: 0.7rem;
}

.sicat-status-badge[data-size='lg'] {
  padding: 6px 14px;
  font-size: 0.85rem;
}

.sicat-status-badge__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.sicat-status-badge[data-tone='neutral'] {
  background: var(--color-status-neutral-bg);
  color: var(--color-status-neutral-fg);
}

.sicat-status-badge[data-tone='running'] {
  background: var(--color-status-running-bg);
  color: var(--color-status-running-fg);
}

.sicat-status-badge[data-tone='warning'] {
  background: var(--color-status-warning-bg);
  color: var(--color-status-warning-fg);
}

.sicat-status-badge[data-tone='success'] {
  background: var(--color-status-success-bg);
  color: var(--color-status-success-fg);
}

.sicat-status-badge[data-tone='error'] {
  background: var(--color-status-error-bg);
  color: var(--color-status-error-fg);
}
</style>
