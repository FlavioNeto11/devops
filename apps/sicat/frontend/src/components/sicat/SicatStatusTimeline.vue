<script setup>
const props = defineProps({
  /**
   * Etapas: [{ title, description?, timestamp?, tone?, state? }]
   * state: 'done' | 'current' | 'pending' | 'error' (define o marcador).
   * tone opcional sobrescreve a cor do marcador.
   */
  steps: { type: Array, default: () => [] },
  /** Orientação. */
  orientation: {
    type: String,
    default: 'vertical',
    validator: (value) => ['vertical', 'horizontal'].includes(value)
  }
});

const STATE_ICON = {
  done: 'mdi-check',
  current: 'mdi-circle-medium',
  error: 'mdi-close',
  pending: ''
};

function markerIcon(step) {
  return STATE_ICON[step.state] ?? '';
}

function markerTone(step) {
  if (step.tone) return step.tone;
  if (step.state === 'done') return 'success';
  if (step.state === 'current') return 'running';
  if (step.state === 'error') return 'error';
  return 'neutral';
}
</script>

<template>
  <ol class="sicat-status-timeline" :data-orientation="orientation">
    <li
      v-for="(step, index) in steps"
      :key="index"
      class="sicat-status-timeline__step"
      :data-tone="markerTone(step)"
      :data-state="step.state || 'pending'"
    >
      <div class="sicat-status-timeline__marker">
        <v-icon v-if="markerIcon(step)" :icon="markerIcon(step)" size="14" />
      </div>
      <div v-if="index < steps.length - 1" class="sicat-status-timeline__connector" aria-hidden="true" />
      <div class="sicat-status-timeline__content">
        <div class="sicat-status-timeline__title-row">
          <span class="sicat-status-timeline__title">{{ step.title }}</span>
          <span v-if="step.timestamp" class="sicat-status-timeline__timestamp">{{ step.timestamp }}</span>
        </div>
        <p v-if="step.description" class="sicat-status-timeline__description">{{ step.description }}</p>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.sicat-status-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.sicat-status-timeline[data-orientation='horizontal'] {
  flex-direction: row;
}

.sicat-status-timeline__step {
  position: relative;
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 12px;
  padding-bottom: var(--space-5);
}

.sicat-status-timeline__step:last-child {
  padding-bottom: 0;
}

.sicat-status-timeline__marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  z-index: 1;
  border: 2px solid rgba(var(--v-border-color), 0.4);
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.sicat-status-timeline__step[data-tone='success'] .sicat-status-timeline__marker {
  background: rgb(var(--v-theme-success));
  border-color: rgb(var(--v-theme-success));
  color: var(--color-primary-contrast);
}

.sicat-status-timeline__step[data-tone='running'] .sicat-status-timeline__marker {
  background: rgb(var(--v-theme-info));
  border-color: rgb(var(--v-theme-info));
  color: var(--color-primary-contrast);
}

.sicat-status-timeline__step[data-tone='error'] .sicat-status-timeline__marker {
  background: rgb(var(--v-theme-error));
  border-color: rgb(var(--v-theme-error));
  color: var(--color-primary-contrast);
}

.sicat-status-timeline__step[data-tone='warning'] .sicat-status-timeline__marker {
  background: rgb(var(--v-theme-warning));
  border-color: rgb(var(--v-theme-warning));
  color: var(--color-primary-contrast);
}

.sicat-status-timeline__connector {
  position: absolute;
  left: 13px;
  top: 26px;
  bottom: 0;
  width: 2px;
  background: rgba(var(--v-border-color), 0.32);
}

.sicat-status-timeline__step[data-state='done'] .sicat-status-timeline__connector {
  background: rgba(var(--v-theme-success), 0.5);
}

.sicat-status-timeline__content {
  padding-top: 2px;
  min-width: 0;
}

.sicat-status-timeline__title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.sicat-status-timeline__title {
  font-weight: 700;
  font-size: 0.92rem;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.sicat-status-timeline__timestamp {
  font-size: 0.76rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-family: var(--font-family-mono);
}

.sicat-status-timeline__description {
  margin: 2px 0 0;
  font-size: 0.84rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

@media (max-width: 599px) {
  .sicat-status-timeline[data-orientation='horizontal'] {
    flex-direction: column;
  }
}
</style>
