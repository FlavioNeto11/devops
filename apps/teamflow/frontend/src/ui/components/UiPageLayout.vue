<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<template>
  <div class="ui-page" :data-width="width">
    <header v-if="title || $slots.header || $slots.actions" class="ui-page-head">
      <div class="ui-page-titles">
        <p v-if="eyebrow" class="ui-page-eyebrow">{{ eyebrow }}</p>
        <h1 v-if="title" class="ui-page-title">{{ title }}</h1>
        <p v-if="subtitle" class="ui-page-sub">{{ subtitle }}</p>
        <slot name="header" />
      </div>
      <div v-if="$slots.actions" class="ui-page-actions"><slot name="actions" /></div>
    </header>
    <div v-if="$slots.banner" class="ui-page-banner"><slot name="banner" /></div>
    <div v-if="$slots.filters" class="ui-page-filters"><slot name="filters" /></div>
    <UiLoadingState v-if="loading" :title="loadingMessage" />
    <UiErrorState v-else-if="error" :message="error" :retryable="retryable" @retry="$emit('retry')" />
    <div v-else class="ui-page-body"><slot /></div>
    <footer v-if="$slots.footer" class="ui-page-foot"><slot name="footer" /></footer>
  </div>
</template>
<script setup>
import UiLoadingState from './UiLoadingState.vue';
import UiErrorState from './UiErrorState.vue';
defineProps({
  title: String, subtitle: String, eyebrow: String,
  width: { type: String, default: 'default' }, // narrow | default | wide | full
  loading: Boolean, loadingMessage: String,
  error: { type: [String, Object], default: null }, retryable: { type: Boolean, default: true },
});
defineEmits(['retry']);
</script>
<style scoped>
.ui-page { margin: 0 auto; padding: var(--ui-space-5); display: flex; flex-direction: column; gap: var(--ui-space-5); }
.ui-page[data-width="narrow"] { max-width: 760px; }
.ui-page[data-width="default"] { max-width: 1140px; }
.ui-page[data-width="wide"] { max-width: 1480px; }
.ui-page[data-width="full"] { max-width: none; }
.ui-page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--ui-space-4); flex-wrap: wrap; }
.ui-page-eyebrow { margin: 0 0 2px; text-transform: uppercase; letter-spacing: .08em; font-size: var(--ui-text-xs); color: rgb(var(--ui-accent-strong)); font-weight: 700; }
.ui-page-title { font-size: 1.6rem; }
.ui-page-sub { margin: 4px 0 0; color: rgb(var(--ui-muted)); }
.ui-page-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }
.ui-page-body { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.ui-page-foot { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
</style>
