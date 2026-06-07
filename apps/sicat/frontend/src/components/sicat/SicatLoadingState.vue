<script setup>
defineProps({
  /** Texto principal exibido junto ao spinner. */
  title: { type: String, default: 'Carregando…' },
  /** Texto secundário/descritivo. */
  description: { type: String, default: '' },
  /** Variante visual. */
  variant: {
    type: String,
    default: 'spinner',
    validator: (value) => ['spinner', 'skeleton', 'progress'].includes(value)
  },
  /** Tamanho compacto (uso inline em listas/cards). */
  compact: { type: Boolean, default: false },
  /** Quantas linhas de skeleton renderizar (apenas variant=skeleton). */
  skeletonLines: { type: Number, default: 3 }
});
</script>

<template>
  <output
    class="sicat-loading-state"
    :data-variant="variant"
    :data-compact="compact ? 'true' : 'false'"
    role="status"
    aria-live="polite"
  >
    <template v-if="variant === 'spinner'">
      <v-progress-circular
        :size="compact ? 24 : 40"
        :width="compact ? 3 : 4"
        color="primary"
        indeterminate
        aria-hidden="true"
      />
    </template>

    <template v-else-if="variant === 'progress'">
      <v-progress-linear color="primary" indeterminate rounded class="sicat-loading-state__progress" />
    </template>

    <template v-else-if="variant === 'skeleton'">
      <div class="sicat-loading-state__skeleton">
        <span
          v-for="line in skeletonLines"
          :key="line"
          class="sicat-loading-state__skeleton-line"
          :style="{ width: `${100 - line * 8}%` }"
        />
      </div>
    </template>

    <div v-if="title || description" class="sicat-loading-state__text">
      <span v-if="title" class="sicat-loading-state__title">{{ title }}</span>
      <span v-if="description" class="sicat-loading-state__description">{{ description }}</span>
    </div>
  </output>
</template>

<style scoped>
.sicat-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: var(--space-7) var(--space-5);
  border-radius: var(--radius-md);
  border: 1px dashed rgba(var(--v-border-color), 0.28);
  background: rgba(var(--v-theme-surface-light, var(--v-theme-surface)), 0.5);
  text-align: center;
}

.sicat-loading-state[data-compact='true'] {
  flex-direction: row;
  gap: 10px;
  padding: var(--space-3) var(--space-4);
  text-align: left;
  border: none;
  background: transparent;
}

.sicat-loading-state[data-variant='progress'] {
  padding: var(--space-3);
}

.sicat-loading-state__progress {
  width: 100%;
}

.sicat-loading-state__skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 480px;
}

.sicat-loading-state__skeleton-line {
  height: 10px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    rgba(var(--v-border-color), 0.18) 0%,
    rgba(var(--v-border-color), 0.32) 50%,
    rgba(var(--v-border-color), 0.18) 100%
  );
  background-size: 200% 100%;
  animation: sicat-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes sicat-skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.sicat-loading-state__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sicat-loading-state__title {
  font-weight: 700;
  font-size: 0.95rem;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.sicat-loading-state__description {
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
