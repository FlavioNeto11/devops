<script setup>
const props = defineProps({
  title: {
    type: String,
    default: 'Confirmacao necessaria'
  },
  description: {
    type: String,
    default: 'Esta acao exige confirmacao explicita antes de ser executada.'
  },
  action: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['confirm', 'cancel']);
</script>

<template>
  <article class="result-card" aria-label="action_confirmation">
    <header class="result-card-header">
      <v-icon size="16">mdi-shield-alert-outline</v-icon>
      <h4>{{ title }}</h4>
    </header>

    <p class="confirmation-text">{{ description }}</p>

    <div class="confirmation-actions">
      <v-btn size="small" color="primary" @click="emit('confirm', action)">Confirmar</v-btn>
      <v-btn size="small" variant="text" color="secondary" @click="emit('cancel', action)">Cancelar</v-btn>
    </div>
  </article>
</template>

<style scoped>
.result-card {
  border: 1px solid rgba(var(--v-theme-warning), 0.35);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(var(--v-theme-warning), 0.08);
}

.result-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.result-card-header h4 {
  margin: 0;
  font-size: 0.82rem;
}

.confirmation-text {
  margin: 0 0 10px;
  font-size: 0.8rem;
}

.confirmation-actions {
  display: flex;
  gap: 8px;
}
</style>
