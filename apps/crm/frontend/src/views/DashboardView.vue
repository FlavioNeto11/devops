<template>
  <div>
    <div class="toolbar">
      <h1>Painel</h1>
    </div>

    <div v-if="loading" class="msg">Carregando...</div>
    <div v-else-if="error" class="msg error">{{ error }}</div>
    <template v-else>
      <div class="stage-cards">
        <div v-for="s in STAGES" :key="s.key" class="stage-card" :class="s.key">
          <div class="stage-label">{{ s.label }}</div>
          <div class="stage-count">{{ stageData[s.key]?.count ?? 0 }}</div>
          <div class="stage-total">{{ formatCurrency(stageData[s.key]?.total) }}</div>
        </div>
      </div>

      <h2>Últimos negócios</h2>
      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Valor</th>
            <th>Estágio</th>
            <th>Contato</th>
            <th>Empresa</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="recent.length === 0">
            <td colspan="5" class="empty">Nenhum negócio ainda.</td>
          </tr>
          <tr v-for="d in recent" :key="d.id">
            <td>{{ d.title }}</td>
            <td>{{ formatCurrency(d.amount) }}</td>
            <td><span class="badge" :class="d.stage">{{ stageLabel(d.stage) }}</span></td>
            <td>{{ d.contact_name || '—' }}</td>
            <td>{{ d.company_name || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'

const STAGES = [
  { key: 'lead',      label: 'Lead' },
  { key: 'qualified', label: 'Qualificado' },
  { key: 'proposal',  label: 'Proposta' },
  { key: 'won',       label: 'Ganho' },
  { key: 'lost',      label: 'Perdido' },
]

const loading = ref(false)
const error = ref('')
const byStage = ref([])
const recent = ref([])

const stageData = computed(() => {
  const m = {}
  for (const row of byStage.value) m[row.stage] = row
  return m
})

function stageLabel(key) {
  return STAGES.find(s => s.key === key)?.label ?? key
}

function formatCurrency(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.deals.summary()
    byStage.value = data.byStage
    recent.value = data.recent
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.toolbar { margin-bottom: 1.5rem; }
h1 { font-size: 1.5rem; font-weight: 700; }
h2 { font-size: 1.125rem; font-weight: 600; margin: 1.5rem 0 1rem; }
.stage-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.stage-card { background: rgb(var(--p-surface)); border-radius: 8px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); border-left: 4px solid rgb(var(--p-border)); }
.stage-card.lead      { border-left-color: rgb(var(--p-muted)); }
.stage-card.qualified { border-left-color: #4f46e5; }
.stage-card.proposal  { border-left-color: rgb(var(--p-warn)); }
.stage-card.won       { border-left-color: rgb(var(--p-ok)); }
.stage-card.lost      { border-left-color: rgb(var(--p-danger)); }
.stage-label { font-size: .8rem; font-weight: 600; color: rgb(var(--p-muted)); text-transform: uppercase; letter-spacing: .05em; margin-bottom: .25rem; }
.stage-count { font-size: 2rem; font-weight: 700; color: rgb(var(--p-fg)); line-height: 1.1; }
.stage-total { font-size: .85rem; color: rgb(var(--p-muted)); margin-top: .25rem; }
table { width: 100%; border-collapse: collapse; background: rgb(var(--p-surface)); border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
th { background: rgb(var(--p-bg)); text-align: left; padding: .75rem 1rem; font-size: .875rem; font-weight: 600; color: rgb(var(--p-muted)); border-bottom: 1px solid rgb(var(--p-border)); }
td { padding: .75rem 1rem; border-bottom: 1px solid rgb(var(--p-surface2)); font-size: .9rem; }
td.empty { text-align: center; color: rgb(var(--p-muted)); padding: 2.5rem; }
.badge { padding: .2rem .6rem; border-radius: 12px; font-size: .8rem; font-weight: 500; }
.badge.lead      { background: rgb(var(--p-surface2)); color: rgb(var(--p-muted)); }
.badge.qualified { background: rgb(79 70 229 / 0.12); color: #4f46e5; }
.badge.proposal  { background: rgb(var(--p-warn) / 0.16); color: rgb(var(--p-warn)); }
.badge.won       { background: rgb(var(--p-ok) / 0.16); color: rgb(var(--p-ok)); }
.badge.lost      { background: rgb(var(--p-danger) / 0.14); color: rgb(var(--p-danger)); }
.msg { padding: .75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.msg.error { background: rgb(var(--p-danger) / 0.14); color: rgb(var(--p-danger)); }
</style>
