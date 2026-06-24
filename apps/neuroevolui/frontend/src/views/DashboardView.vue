<template>
  <UiPageLayout title="Painel" eyebrow="NeuroEvolui" subtitle="Visão geral do sistema." :loading="loading" :error="error" @retry="load">
    <template #actions><UiButton to="/records/new">Novo registro</UiButton></template>
    <div class="dash-metrics">
      <UiMetricCard label="Registros" :value="total" tone="primary" />
      <UiMetricCard label="API" :value="live ? 'No ar' : 'Fora'" :tone="live ? 'success' : 'error'" />
      <UiMetricCard label="Recentes" :value="recent.length" tone="neutral" hint="últimos carregados" />
    </div>
    <UiCard title="Registros recentes">
      <UiDataTable :columns="columns" :rows="recent" :empty="{ title: 'Sem registros', description: 'Crie o primeiro registro.' }" clickable-rows @row-click="open" />
    </UiCard>
  </UiPageLayout>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton } from '../ui/index.js';
import { records, health } from '../api.js';
const router = useRouter();
const columns = [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Título' }, { key: 'status', label: 'Status', format: 'badge' }];
const loading = ref(true), error = ref(null), total = ref(0), live = ref(false), recent = ref([]);
async function load() {
  loading.value = true; error.value = null;
  try {
    try { await health(); live.value = true; } catch { live.value = false; }
    const r = await records.list({ pageSize: 5 });
    recent.value = r.data || []; total.value = r.total ?? recent.value.length;
  } catch (e) { error.value = e; } finally { loading.value = false; }
}
const open = (row) => router.push('/records/' + row.id);
onMounted(load);
</script>
<style scoped>
.dash-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--ui-space-4); }
</style>
