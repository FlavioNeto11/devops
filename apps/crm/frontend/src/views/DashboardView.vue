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
.stage-card { background: #fff; border-radius: 8px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); border-left: 4px solid #cbd5e1; }
.stage-card.lead      { border-left-color: #94a3b8; }
.stage-card.qualified { border-left-color: #3b82f6; }
.stage-card.proposal  { border-left-color: #f59e0b; }
.stage-card.won       { border-left-color: #22c55e; }
.stage-card.lost      { border-left-color: #ef4444; }
.stage-label { font-size: .8rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .05em; margin-bottom: .25rem; }
.stage-count { font-size: 2rem; font-weight: 700; color: #1e293b; line-height: 1.1; }
.stage-total { font-size: .85rem; color: #64748b; margin-top: .25rem; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
th { background: #f8fafc; text-align: left; padding: .75rem 1rem; font-size: .875rem; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0; }
td { padding: .75rem 1rem; border-bottom: 1px solid #f1f5f9; font-size: .9rem; }
td.empty { text-align: center; color: #94a3b8; padding: 2.5rem; }
.badge { padding: .2rem .6rem; border-radius: 12px; font-size: .8rem; font-weight: 500; }
.badge.lead      { background: #f1f5f9; color: #64748b; }
.badge.qualified { background: #dbeafe; color: #1d4ed8; }
.badge.proposal  { background: #fef3c7; color: #b45309; }
.badge.won       { background: #dcfce7; color: #15803d; }
.badge.lost      { background: #fee2e2; color: #b91c1c; }
.msg { padding: .75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.msg.error { background: #fee2e2; color: #b91c1c; }
</style>
