<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<template>
  <section class="ui-card" :data-padded="padded ? 'true' : 'false'">
    <header v-if="title || $slots.header || $slots.actions" class="ui-card-head">
      <div>
        <h3 v-if="title" class="ui-card-title">{{ title }}</h3>
        <p v-if="subtitle" class="ui-card-sub">{{ subtitle }}</p>
        <slot name="header" />
      </div>
      <div v-if="$slots.actions" class="ui-card-actions"><slot name="actions" /></div>
    </header>
    <div class="ui-card-body"><slot /></div>
    <footer v-if="$slots.footer" class="ui-card-foot"><slot name="footer" /></footer>
  </section>
</template>
<script setup>
defineProps({ title: String, subtitle: String, padded: { type: Boolean, default: true } });
</script>
<style scoped>
.ui-card { background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-lg); box-shadow: var(--ui-shadow-sm); overflow: hidden; }
.ui-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ui-space-4); padding: var(--ui-space-4) var(--ui-space-5); border-bottom: 1px solid rgb(var(--ui-border)); }
.ui-card-title { font-size: var(--ui-text-lg); }
.ui-card-sub { margin: 2px 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ui-card-actions { display: flex; gap: var(--ui-space-2); flex-shrink: 0; }
.ui-card[data-padded="true"] .ui-card-body { padding: var(--ui-space-5); }
.ui-card-foot { padding: var(--ui-space-3) var(--ui-space-5); border-top: 1px solid rgb(var(--ui-border)); background: rgb(var(--ui-surface-2)); }
</style>
