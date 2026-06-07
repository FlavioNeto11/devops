<script setup>
const props = defineProps({
  tone: {
    type: String,
    default: 'info',
    validator: (value) => ['info', 'success', 'warning', 'error'].includes(value)
  },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  /** Ícone mdi. Se omitido, usa o ícone padrão do tone. */
  icon: { type: String, default: '' },
  dismissible: { type: Boolean, default: false }
});

const emit = defineEmits(['dismiss']);

const TONE_ICON = {
  info: 'mdi-information-outline',
  success: 'mdi-check-circle-outline',
  warning: 'mdi-alert-outline',
  error: 'mdi-alert-circle-outline'
};
</script>

<template>
  <div class="sicat-inline-alert" :data-tone="tone" role="alert">
    <v-icon :icon="icon || TONE_ICON[tone]" size="20" class="sicat-inline-alert__icon" aria-hidden="true" />
    <div class="sicat-inline-alert__body">
      <strong v-if="title" class="sicat-inline-alert__title">{{ title }}</strong>
      <p v-if="message" class="sicat-inline-alert__message">{{ message }}</p>
      <slot />
    </div>
    <div v-if="$slots.actions || dismissible" class="sicat-inline-alert__actions">
      <slot name="actions" />
      <v-btn
        v-if="dismissible"
        icon="mdi-close"
        variant="text"
        size="small"
        density="comfortable"
        aria-label="Dispensar aviso"
        @click="emit('dismiss')"
      />
    </div>
  </div>
</template>

<style scoped>
.sicat-inline-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
}

.sicat-inline-alert__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin-right: auto;
}

.sicat-inline-alert__title {
  font-size: 0.92rem;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.sicat-inline-alert__message {
  margin: 0;
  font-size: 0.88rem;
  color: rgba(var(--v-theme-on-surface), 0.74);
}

.sicat-inline-alert__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.sicat-inline-alert[data-tone='info'] {
  background: rgba(var(--v-theme-info), 0.08);
  border-color: rgba(var(--v-theme-info), 0.28);
}
.sicat-inline-alert[data-tone='info'] .sicat-inline-alert__icon { color: rgb(var(--v-theme-info)); }

.sicat-inline-alert[data-tone='success'] {
  background: rgba(var(--v-theme-success), 0.08);
  border-color: rgba(var(--v-theme-success), 0.28);
}
.sicat-inline-alert[data-tone='success'] .sicat-inline-alert__icon { color: rgb(var(--v-theme-success)); }

.sicat-inline-alert[data-tone='warning'] {
  background: rgba(var(--v-theme-warning), 0.08);
  border-color: rgba(var(--v-theme-warning), 0.28);
}
.sicat-inline-alert[data-tone='warning'] .sicat-inline-alert__icon { color: rgb(var(--v-theme-warning)); }

.sicat-inline-alert[data-tone='error'] {
  background: rgba(var(--v-theme-error), 0.08);
  border-color: rgba(var(--v-theme-error), 0.28);
}
.sicat-inline-alert[data-tone='error'] .sicat-inline-alert__icon { color: rgb(var(--v-theme-error)); }
</style>
