<script setup>
defineProps({
  /** Posição da barra. */
  position: {
    type: String,
    default: 'top',
    validator: (value) => ['top', 'bottom', 'sticky'].includes(value)
  },
  /** Número de itens selecionados (modo seleção em lote). */
  selectionCount: { type: Number, default: 0 },
  selectionLabel: { type: String, default: 'selecionado(s)' }
});

const emit = defineEmits(['clear-selection']);
</script>

<template>
  <div class="sicat-action-bar" :data-position="position" :data-selection="selectionCount > 0 ? 'true' : 'false'">
    <div v-if="selectionCount > 0" class="sicat-action-bar__selection">
      <v-btn
        icon="mdi-close"
        variant="text"
        size="small"
        density="comfortable"
        aria-label="Limpar seleção"
        @click="emit('clear-selection')"
      />
      <strong>{{ selectionCount }}</strong>
      <span>{{ selectionLabel }}</span>
      <slot name="selection" />
    </div>

    <div v-else class="sicat-action-bar__main">
      <div class="sicat-action-bar__lead">
        <slot name="lead" />
      </div>
      <div class="sicat-action-bar__actions">
        <slot name="secondary" />
        <slot name="primary" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sicat-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), 0.14);
}

.sicat-action-bar[data-position='sticky'] {
  position: sticky;
  top: 12px;
  z-index: 3;
  box-shadow: var(--shadow-sm);
}

.sicat-action-bar[data-position='bottom'] {
  position: sticky;
  bottom: 12px;
  z-index: 3;
  box-shadow: var(--shadow-md);
}

.sicat-action-bar[data-selection='true'] {
  background: rgba(var(--v-theme-primary), 0.08);
  border-color: rgba(var(--v-theme-primary), 0.28);
}

.sicat-action-bar__selection {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.sicat-action-bar__selection strong {
  font-size: 1rem;
  color: rgba(var(--v-theme-primary), 1);
}

.sicat-action-bar__selection span {
  color: rgba(var(--v-theme-on-surface), 0.7);
  margin-right: auto;
}

.sicat-action-bar__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
}

.sicat-action-bar__lead {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.9rem;
  min-width: 0;
}

.sicat-action-bar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

@media (max-width: 599px) {
  .sicat-action-bar__main {
    flex-direction: column;
    align-items: stretch;
  }

  .sicat-action-bar__actions {
    justify-content: flex-end;
  }
}
</style>
