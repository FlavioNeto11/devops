<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<template>
  <fieldset class="ui-formsec" :data-cols="columns">
    <legend v-if="title" class="ui-formsec-legend">{{ title }}</legend>
    <p v-if="description" class="ui-formsec-desc">{{ description }}</p>
    <div class="ui-formsec-grid"><slot /></div>
  </fieldset>
</template>
<script setup>
defineProps({ title: String, description: String, columns: { type: Number, default: 2 } });
</script>
<style scoped>
.ui-formsec { border: none; padding: 0; margin: 0 0 var(--ui-space-5); min-inline-size: 0; }
.ui-formsec-legend { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-md); padding: 0; margin-bottom: var(--ui-space-2); }
.ui-formsec-desc { margin: 0 0 var(--ui-space-3); color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ui-formsec-grid { display: grid; gap: var(--ui-space-4); grid-template-columns: 1fr; }
.ui-formsec[data-cols="2"] .ui-formsec-grid { grid-template-columns: repeat(2, 1fr); }
.ui-formsec[data-cols="3"] .ui-formsec-grid { grid-template-columns: repeat(3, 1fr); }
@media (max-width: 640px) { .ui-formsec-grid { grid-template-columns: 1fr !important; } }
</style>
