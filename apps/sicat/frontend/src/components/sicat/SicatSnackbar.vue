<script setup>
import { computed } from 'vue';
import { useNotification } from '../../composables/useNotification.js';

const { toasts, dismiss, triggerAction } = useNotification();

const TONE_TO_ICON = {
  success: 'mdi-check-circle-outline',
  error: 'mdi-alert-circle-outline',
  warning: 'mdi-alert-outline',
  info: 'mdi-information-outline'
};

const stack = computed(() => toasts);

function iconFor(tone) {
  return TONE_TO_ICON[tone] || TONE_TO_ICON.info;
}
</script>

<template>
  <div class="sicat-snackbar-stack" aria-live="polite" aria-atomic="false">
    <transition-group name="sicat-toast" tag="div" class="sicat-snackbar-stack__list">
      <article
        v-for="toast in stack"
        :key="toast.id"
        class="sicat-snackbar"
        :data-tone="toast.tone"
        role="status"
      >
        <v-icon :icon="iconFor(toast.tone)" class="sicat-snackbar__icon" size="22" aria-hidden="true" />
        <div class="sicat-snackbar__body">
          <p class="sicat-snackbar__message">{{ toast.message }}</p>
          <p v-if="toast.detail" class="sicat-snackbar__detail">{{ toast.detail }}</p>
          <p v-if="toast.code" class="sicat-snackbar__code">{{ toast.code }}</p>
        </div>
        <div class="sicat-snackbar__actions">
          <v-btn
            v-if="toast.actionLabel"
            variant="text"
            size="small"
            class="sicat-snackbar__action"
            @click="triggerAction(toast.id)"
          >
            {{ toast.actionLabel }}
          </v-btn>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            density="comfortable"
            aria-label="Fechar notificação"
            @click="dismiss(toast.id)"
          />
        </div>
      </article>
    </transition-group>
  </div>
</template>

<style scoped>
.sicat-snackbar-stack {
  position: fixed;
  bottom: 18px;
  right: 18px;
  z-index: 2400;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}

.sicat-snackbar-stack__list {
  display: flex;
  flex-direction: column-reverse;
  gap: 10px;
  max-width: min(420px, calc(100vw - 36px));
}

.sicat-snackbar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(var(--v-border-color), 0.2);
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--shadow-md);
  pointer-events: auto;
  min-width: 280px;
}

.sicat-snackbar[data-tone='success'] {
  border-left: 4px solid rgb(var(--v-theme-success));
}

.sicat-snackbar[data-tone='error'] {
  border-left: 4px solid rgb(var(--v-theme-error));
}

.sicat-snackbar[data-tone='warning'] {
  border-left: 4px solid rgb(var(--v-theme-warning));
}

.sicat-snackbar[data-tone='info'] {
  border-left: 4px solid rgb(var(--v-theme-info));
}

.sicat-snackbar__icon {
  margin-top: 2px;
}

.sicat-snackbar[data-tone='success'] .sicat-snackbar__icon {
  color: rgb(var(--v-theme-success));
}

.sicat-snackbar[data-tone='error'] .sicat-snackbar__icon {
  color: rgb(var(--v-theme-error));
}

.sicat-snackbar[data-tone='warning'] .sicat-snackbar__icon {
  color: rgb(var(--v-theme-warning));
}

.sicat-snackbar[data-tone='info'] .sicat-snackbar__icon {
  color: rgb(var(--v-theme-info));
}

.sicat-snackbar__body {
  min-width: 0;
}

.sicat-snackbar__message {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.92);
  line-height: 1.35;
}

.sicat-snackbar__detail {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
  line-height: 1.35;
}

.sicat-snackbar__code {
  margin: 4px 0 0;
  font-family: var(--font-family-mono);
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.sicat-snackbar__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.sicat-snackbar__action {
  text-transform: none !important;
  letter-spacing: 0;
}

.sicat-toast-enter-active,
.sicat-toast-leave-active {
  transition: transform 0.24s ease, opacity 0.24s ease;
}

.sicat-toast-enter-from {
  transform: translateY(12px);
  opacity: 0;
}

.sicat-toast-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

@media (max-width: 599px) {
  .sicat-snackbar-stack {
    left: 12px;
    right: 12px;
    bottom: 12px;
    justify-content: stretch;
  }

  .sicat-snackbar-stack__list {
    max-width: 100%;
  }

  .sicat-snackbar {
    min-width: 0;
  }
}
</style>
