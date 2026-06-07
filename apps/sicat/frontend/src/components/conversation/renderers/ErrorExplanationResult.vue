<script setup>
const props = defineProps({
  title: {
    type: String,
    default: 'error_explanation'
  },
  detail: {
    type: String,
    default: ''
  }
});
</script>

<template>
  <article class="result-card" aria-label="error_explanation">
    <header class="result-card-header">
      <v-icon size="16">mdi-alert-octagon-outline</v-icon>
      <h4>{{ title }}</h4>
    </header>

    <p class="error-text">{{ detail || 'Nao foi possivel concluir a operacao solicitada.' }}</p>
  </article>
</template>

<style scoped>
.result-card {
  border: 1px solid rgba(var(--v-theme-error), 0.35);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(var(--v-theme-error), 0.06);
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

.error-text {
  margin: 0;
  font-size: 0.8rem;
}
</style>
