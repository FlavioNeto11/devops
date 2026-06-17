<script setup>
/**
 * SicatActionCard — cartão GRANDE de ação, didático: ícone + título simples +
 * 1 linha de descrição (+ contador opcional). Para a tela inicial do operador
 * ("O que você quer fazer?") e para próximos passos. Alvo de toque grande
 * (>=48px), navegável por teclado. Vira <router-link> se `to` for passado,
 * senão é um <button> que emite `activate`.
 */
defineProps({
  icon: { type: String, default: 'mdi-arrow-right-circle-outline' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  /** Rota destino (opcional). */
  to: { type: String, default: '' },
  /** Acento de cor: primary | success | warning | info. */
  tone: { type: String, default: 'primary' },
  /** Contador opcional (ex.: nº de pendências). '' / null = oculto. */
  badge: { type: [String, Number], default: '' }
});
const emit = defineEmits(['activate']);
</script>

<template>
  <component
    :is="to ? 'router-link' : 'button'"
    :to="to || undefined"
    :type="to ? undefined : 'button'"
    class="sicat-action-card"
    :data-tone="tone"
    @click="emit('activate')"
  >
    <span class="sicat-action-card__icon">
      <v-icon :icon="icon" size="32" aria-hidden="true" />
    </span>
    <span class="sicat-action-card__body">
      <span class="sicat-action-card__title">
        {{ title }}
        <span
          v-if="badge !== '' && badge !== null && badge !== undefined"
          class="sicat-action-card__badge"
        >{{ badge }}</span>
      </span>
      <span v-if="description" class="sicat-action-card__desc">{{ description }}</span>
    </span>
    <v-icon class="sicat-action-card__chevron" icon="mdi-chevron-right" size="26" aria-hidden="true" />
  </component>
</template>

<style scoped>
.sicat-action-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
  min-height: 88px;
  padding: var(--space-4) var(--space-5);
  text-align: left;
  text-decoration: none;
  border: 1px solid rgba(var(--v-border-color), 0.16);
  border-radius: var(--radius-md);
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}
.sicat-action-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.45);
  box-shadow: var(--shadow-md);
}
.sicat-action-card:active { transform: translateY(1px); }
.sicat-action-card:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.sicat-action-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
}
.sicat-action-card__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  margin-right: auto;
}
.sicat-action-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.12rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: rgba(var(--v-theme-on-surface), 0.94);
}
.sicat-action-card__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgb(var(--v-theme-warning));
  color: #fff;
  font-size: 0.82rem;
  font-weight: 800;
}
.sicat-action-card__desc {
  font-size: 0.95rem;
  color: rgba(var(--v-theme-on-surface), 0.64);
}
.sicat-action-card__chevron {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

/* Acentos por tone (no ícone) */
.sicat-action-card[data-tone='primary'] .sicat-action-card__icon { background: rgba(var(--v-theme-primary), 0.12); color: rgb(var(--v-theme-primary)); }
.sicat-action-card[data-tone='success'] .sicat-action-card__icon { background: rgba(var(--v-theme-success), 0.12); color: rgb(var(--v-theme-success)); }
.sicat-action-card[data-tone='warning'] .sicat-action-card__icon { background: rgba(var(--v-theme-warning), 0.14); color: rgb(var(--v-theme-warning)); }
.sicat-action-card[data-tone='info'] .sicat-action-card__icon { background: rgba(var(--v-theme-info), 0.12); color: rgb(var(--v-theme-info)); }
.sicat-action-card[data-tone='primary']:hover { border-color: rgba(var(--v-theme-primary), 0.45); }
.sicat-action-card[data-tone='success']:hover { border-color: rgba(var(--v-theme-success), 0.45); }
.sicat-action-card[data-tone='warning']:hover { border-color: rgba(var(--v-theme-warning), 0.45); }
.sicat-action-card[data-tone='info']:hover { border-color: rgba(var(--v-theme-info), 0.45); }
</style>
