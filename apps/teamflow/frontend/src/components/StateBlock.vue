<template>
  <div v-if="loading" class="state" role="status" aria-live="polite">Carregando…</div>
  <div v-else-if="error" class="state state-error" role="alert">{{ error }}</div>
  <div v-else-if="empty" class="state state-empty">{{ emptyText || 'Nada por aqui ainda.' }}</div>
  <slot v-else />
</template>
<script setup>
defineProps({ loading: Boolean, error: String, empty: Boolean, emptyText: String });
</script>
