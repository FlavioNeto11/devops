<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '—' },
  /** Texto auxiliar abaixo do valor (ex: "vs. ontem"). */
  hint: { type: String, default: '' },
  icon: { type: String, default: '' },
  /** Tom do indicador/ícone. */
  tone: {
    type: String,
    default: 'neutral',
    validator: (value) => ['neutral', 'running', 'warning', 'success', 'error', 'primary'].includes(value)
  },
  /** Variação percentual (número). Positivo = verde, negativo = vermelho. */
  trend: { type: Number, default: null },
  loading: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false }
});

const emit = defineEmits(['click']);

const trendInfo = computed(() => {
  if (props.trend === null || Number.isNaN(props.trend)) return null;
  const positive = props.trend >= 0;
  return {
    positive,
    icon: positive ? 'mdi-trending-up' : 'mdi-trending-down',
    text: `${positive ? '+' : ''}${props.trend}%`
  };
});

function handleClick(event) {
  if (props.clickable) emit('click', event);
}
</script>

<template>
  <article
    class="sicat-metric-card"
    :data-tone="tone"
    :data-clickable="clickable ? 'true' : 'false'"
    :role="clickable ? 'button' : null"
    :tabindex="clickable ? 0 : null"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <div class="sicat-metric-card__top">
      <span class="sicat-metric-card__label">{{ label }}</span>
      <span v-if="icon" class="sicat-metric-card__icon">
        <v-icon :icon="icon" size="20" />
      </span>
    </div>

    <div class="sicat-metric-card__value-row">
      <v-progress-circular v-if="loading" size="22" width="2" indeterminate color="primary" />
      <span v-else class="sicat-metric-card__value">{{ value }}</span>
      <span v-if="!loading && trendInfo" class="sicat-metric-card__trend" :data-positive="trendInfo.positive">
        <v-icon :icon="trendInfo.icon" size="14" />
        {{ trendInfo.text }}
      </span>
    </div>

    <span v-if="hint" class="sicat-metric-card__hint">{{ hint }}</span>
    <slot />
  </article>
</template>

<style scoped>
.sicat-metric-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--space-5);
  border-radius: var(--radius-md);
  border: 1px solid rgba(var(--v-border-color), 0.14);
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--shadow-sm);
  border-left: 3px solid rgba(var(--v-theme-on-surface), 0.12);
}

.sicat-metric-card[data-tone='primary'] { border-left-color: rgb(var(--v-theme-primary)); }
.sicat-metric-card[data-tone='success'] { border-left-color: rgb(var(--v-theme-success)); }
.sicat-metric-card[data-tone='warning'] { border-left-color: rgb(var(--v-theme-warning)); }
.sicat-metric-card[data-tone='error'] { border-left-color: rgb(var(--v-theme-error)); }
.sicat-metric-card[data-tone='running'] { border-left-color: rgb(var(--v-theme-info)); }

.sicat-metric-card[data-clickable='true'] {
  cursor: pointer;
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}

.sicat-metric-card[data-clickable='true']:hover,
.sicat-metric-card[data-clickable='true']:focus-visible {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
  outline: none;
}

.sicat-metric-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sicat-metric-card__label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.sicat-metric-card__icon {
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.sicat-metric-card__value-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.sicat-metric-card__value {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.1;
  color: rgba(var(--v-theme-on-surface), 0.92);
}

.sicat-metric-card__trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.8rem;
  font-weight: 700;
  color: rgb(var(--v-theme-error));
}

.sicat-metric-card__trend[data-positive='true'] {
  color: rgb(var(--v-theme-success));
}

.sicat-metric-card__hint {
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
</style>
