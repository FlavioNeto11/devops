<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  /** Ícone mdi exibido acima do título. */
  icon: { type: String, default: 'mdi-tray-remove' },
  /** Compacto (uso inline em tabelas/listas). */
  compact: { type: Boolean, default: false }
});
</script>

<template>
  <output
    class="sicat-empty-state"
    :data-compact="compact ? 'true' : 'false'"
    role="status"
    aria-live="polite"
  >
    <v-icon v-if="icon" :icon="icon" :size="compact ? 28 : 44" class="sicat-empty-state__icon" aria-hidden="true" />
    <div class="sicat-empty-state__text">
      <span class="sicat-empty-state__title">{{ title }}</span>
      <span v-if="description" class="sicat-empty-state__description">{{ description }}</span>
    </div>
    <div v-if="$slots.actions" class="sicat-empty-state__actions">
      <slot name="actions" />
    </div>
  </output>
</template>

<style scoped>
.sicat-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: var(--space-7) var(--space-5);
  border-radius: var(--radius-md);
  border: 1px dashed rgba(var(--v-border-color), 0.28);
  background: rgba(var(--v-theme-surface-light, var(--v-theme-surface)), 0.4);
  text-align: center;
}

.sicat-empty-state[data-compact='true'] {
  padding: var(--space-4);
  gap: 8px;
}

.sicat-empty-state__icon {
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.sicat-empty-state__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 56ch;
}

.sicat-empty-state__title {
  font-weight: 700;
  font-size: 1rem;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.sicat-empty-state__description {
  font-size: 0.88rem;
  color: rgba(var(--v-theme-on-surface), 0.58);
}

.sicat-empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
</style>
