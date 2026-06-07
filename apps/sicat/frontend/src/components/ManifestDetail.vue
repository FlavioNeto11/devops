<script setup>
import { formatDateTimeBr } from '../utils/date-format.js';

const props = defineProps({
  manifest: {
    type: Object,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  },
  isOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close']);

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  return formatDateTimeBr(value);
}
</script>

<template>
  <div class="detail-shell">
    <div class="detail-header">
      <h2>Detalhe do manifesto</h2>
      <button v-if="isOpen" class="btn btn-secondary" type="button" @click="emit('close')">Fechar</button>
    </div>

    <div v-if="!isOpen" class="detail-placeholder text-muted">
      Selecione um manifesto na lista para visualizar detalhes.
    </div>

    <div v-else-if="loading" class="detail-placeholder">Carregando detalhes...</div>

    <div v-else-if="manifest" class="detail-content">
      <div class="detail-group">
        <span class="detail-label">ID</span>
        <strong class="detail-value detail-code">{{ manifest.id }}</strong>
      </div>
      <div class="detail-group">
        <span class="detail-label">Status</span>
        <strong class="detail-value">{{ manifest.status }} / {{ manifest.externalStatus || '-' }}</strong>
      </div>
      <div class="detail-group">
        <span class="detail-label">Número MTR</span>
        <strong class="detail-value">{{ manifest.externalReference?.manNumero || '-' }}</strong>
      </div>
      <div class="detail-group">
        <span class="detail-label">Código externo</span>
        <strong class="detail-value">{{ manifest.externalReference?.manCodigo || '-' }}</strong>
      </div>
      <div class="detail-group">
        <span class="detail-label">Gerador</span>
        <strong class="detail-value">{{ manifest.generator?.description || '-' }}</strong>
      </div>
      <div class="detail-group">
        <span class="detail-label">Transportador</span>
        <strong class="detail-value">{{ manifest.carrier?.description || '-' }}</strong>
      </div>
      <div class="detail-group">
        <span class="detail-label">Destinatário</span>
        <strong class="detail-value">{{ manifest.receiver?.description || '-' }}</strong>
      </div>
      <div class="detail-group">
        <span class="detail-label">Última sincronização</span>
        <strong class="detail-value">{{ formatDateTime(manifest.lastSyncAt) }}</strong>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  background: #fbfcff;
}

.detail-label {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  margin-bottom: 2px;
}

.detail-value {
  display: block;
  font-size: 0.95rem;
  word-break: break-word;
}

.detail-code {
  font-family: var(--font-family-mono);
}
</style>
