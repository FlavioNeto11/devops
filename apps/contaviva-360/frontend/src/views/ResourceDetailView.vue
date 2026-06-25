<template>
  <UiPageLayout :title="'Registro #' + id" width="narrow" :loading="loading" :error="error" @retry="load">
    <template #actions>
      <UiButton variant="ghost" to="/records">Voltar</UiButton>
      <UiButton :to="'/records/' + id + '/edit'">Editar</UiButton>
    </template>
    <UiCard>
      <dl class="kv">
        <div><dt>Título</dt><dd>{{ rec.title }}</dd></div>
        <div><dt>Status</dt><dd><UiStatusBadge :status="rec.status" /></dd></div>
      </dl>
    </UiCard>
  </UiPageLayout>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { UiPageLayout, UiCard, UiButton, UiStatusBadge } from '../ui/index.js';
import { records } from '../api.js';
const props = defineProps({ id: { type: String, required: true } });
const loading = ref(true), error = ref(null), rec = ref({});
async function load() { loading.value = true; error.value = null; try { rec.value = await records.get(props.id); } catch (e) { error.value = e; } finally { loading.value = false; } }
onMounted(load);
</script>
<style scoped>
.kv { display: grid; gap: var(--ui-space-3); margin: 0; }
.kv dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.kv dd { margin: 2px 0 0; }
</style>
