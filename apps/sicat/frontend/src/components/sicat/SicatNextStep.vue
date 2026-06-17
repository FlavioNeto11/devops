<script setup>
/**
 * SicatNextStep — faixa "Próximo passo recomendado", mostrada depois de uma ação
 * para responder ao "e agora?". Tom amigável, ícone, e um botão grande de ação
 * (router-link se `to`, senão emite `action`). role="status" para leitores de tela.
 */
defineProps({
  title: { type: String, default: 'Próximo passo' },
  message: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  to: { type: String, default: '' },
  icon: { type: String, default: 'mdi-arrow-right-bold-circle-outline' }
});
const emit = defineEmits(['action']);
</script>

<template>
  <div class="sicat-next-step" role="status">
    <v-icon :icon="icon" size="28" class="sicat-next-step__icon" aria-hidden="true" />
    <div class="sicat-next-step__body">
      <strong class="sicat-next-step__title">{{ title }}</strong>
      <p v-if="message" class="sicat-next-step__message">{{ message }}</p>
      <slot />
    </div>
    <component
      v-if="actionLabel"
      :is="to ? 'router-link' : 'button'"
      :to="to || undefined"
      :type="to ? undefined : 'button'"
      class="sicat-next-step__action"
      @click="emit('action')"
    >
      {{ actionLabel }}
      <v-icon icon="mdi-arrow-right" size="18" aria-hidden="true" />
    </component>
  </div>
</template>

<style scoped>
.sicat-next-step {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  border: 1px solid rgba(var(--v-theme-primary), 0.28);
  background: rgba(var(--v-theme-primary), 0.07);
}
.sicat-next-step__icon { color: rgb(var(--v-theme-primary)); flex-shrink: 0; }
.sicat-next-step__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; margin-right: auto; }
.sicat-next-step__title { font-size: 1rem; color: rgba(var(--v-theme-on-surface), 0.92); }
.sicat-next-step__message { margin: 0; font-size: 0.92rem; color: rgba(var(--v-theme-on-surface), 0.72); }
.sicat-next-step__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--radius-sm);
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary-contrast, 255 255 255));
  font-size: 0.95rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}
.sicat-next-step__action:hover { filter: brightness(1.06); }
.sicat-next-step__action:focus-visible { outline: 2px solid rgb(var(--v-theme-on-surface)); outline-offset: 2px; }

@media (max-width: 640px) {
  .sicat-next-step { flex-wrap: wrap; }
  .sicat-next-step__action { width: 100%; justify-content: center; }
}
</style>
