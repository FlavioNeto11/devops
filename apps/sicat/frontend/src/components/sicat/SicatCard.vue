<script setup>
const props = defineProps({
  /** Variante visual. */
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'metric', 'glass', 'system'].includes(value)
  },
  /** Título exibido no header. Slot 'header' tem prioridade. */
  title: { type: String, default: '' },
  /** Subtítulo/descrição opcional no header. */
  subtitle: { type: String, default: '' },
  /** Ícone mdi opcional ao lado do título. */
  icon: { type: String, default: '' },
  /** Marca o card como clicável (cursor, hover destacado, role). */
  clickable: { type: Boolean, default: false },
  /** Compactar paddings internos. */
  dense: { type: Boolean, default: false },
  /** Remove o padding interno do corpo (default slot). */
  flushBody: { type: Boolean, default: false }
});

const emit = defineEmits(['click']);

function handleClick(event) {
  if (props.clickable) {
    emit('click', event);
  }
}

function handleKeydown(event) {
  if (!props.clickable) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('click', event);
  }
}
</script>

<template>
  <article
    class="sicat-card"
    :data-variant="variant"
    :data-clickable="clickable ? 'true' : 'false'"
    :data-dense="dense ? 'true' : 'false'"
    :role="clickable ? 'button' : null"
    :tabindex="clickable ? 0 : null"
    @click="handleClick"
    @keydown="handleKeydown"
  >
    <header v-if="$slots.header || title || subtitle" class="sicat-card__header">
      <slot name="header">
        <div class="sicat-card__header-text">
          <div class="sicat-card__title-row">
            <v-icon v-if="icon" :icon="icon" size="20" class="sicat-card__icon" />
            <h3 v-if="title" class="sicat-card__title">{{ title }}</h3>
          </div>
          <p v-if="subtitle" class="sicat-card__subtitle">{{ subtitle }}</p>
        </div>
        <div v-if="$slots['header-actions']" class="sicat-card__header-actions">
          <slot name="header-actions" />
        </div>
      </slot>
    </header>

    <div class="sicat-card__body" :data-flush="flushBody ? 'true' : 'false'">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="sicat-card__footer">
      <slot name="footer" />
    </footer>

    <div v-if="$slots.actions" class="sicat-card__actions">
      <slot name="actions" />
    </div>
  </article>
</template>

<style scoped>
.sicat-card {
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), 0.14);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
  overflow: hidden;
}

.sicat-card[data-clickable='true'] {
  cursor: pointer;
}

.sicat-card[data-clickable='true']:hover,
.sicat-card[data-clickable='true']:focus-visible {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
  border-color: rgba(var(--v-theme-primary), 0.32);
}

.sicat-card[data-clickable='true']:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.4);
  outline-offset: 2px;
}

.sicat-card[data-variant='glass'] {
  background: linear-gradient(
    135deg,
    rgba(var(--v-theme-surface), 0.94) 0%,
    rgba(var(--v-theme-surface), 0.8) 58%,
    rgba(var(--v-theme-primary), 0.06) 100%
  );
  backdrop-filter: blur(14px);
}

.sicat-card[data-variant='metric'] {
  border-radius: var(--radius-md);
}

.sicat-card[data-variant='system'] {
  border-color: rgba(var(--v-theme-warning), 0.32);
  background: linear-gradient(
    135deg,
    rgb(var(--v-theme-surface)) 0%,
    rgba(var(--v-theme-warning), 0.04) 100%
  );
}

.sicat-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: var(--space-5) var(--space-6) 0;
}

.sicat-card[data-dense='true'] .sicat-card__header {
  padding: var(--space-3) var(--space-4) 0;
}

.sicat-card__header-text {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.sicat-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sicat-card__icon {
  color: rgba(var(--v-theme-primary), 0.85);
}

.sicat-card__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.92);
  letter-spacing: -0.01em;
}

.sicat-card__subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.58);
}

.sicat-card__header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sicat-card__body {
  padding: var(--space-6);
  flex: 1;
  min-width: 0;
}

.sicat-card[data-dense='true'] .sicat-card__body {
  padding: var(--space-4);
}

.sicat-card__body[data-flush='true'] {
  padding: 0;
}

.sicat-card__footer {
  padding: var(--space-3) var(--space-6) var(--space-5);
  border-top: 1px solid rgba(var(--v-border-color), 0.1);
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.85rem;
}

.sicat-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 var(--space-6) var(--space-5);
}

.sicat-card[data-dense='true'] .sicat-card__actions {
  padding: 0 var(--space-4) var(--space-3);
}

@media (max-width: 599px) {
  .sicat-card__body {
    padding: var(--space-4);
  }

  .sicat-card__header {
    padding: var(--space-4) var(--space-4) 0;
  }

  .sicat-card__actions {
    padding: 0 var(--space-4) var(--space-4);
  }
}
</style>
