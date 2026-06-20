<template>
  <div>
    <div class="toolbar">
      <h1>Negócios</h1>
      <div class="toolbar-right">
        <input
          v-model="search"
          @input="onSearch"
          placeholder="Buscar negócio..."
          class="search"
          aria-label="Buscar negócios"
        />
        <button class="btn-primary" @click="openCreate">+ Novo negócio</button>
      </div>
    </div>

    <div class="stage-tabs">
      <button
        v-for="s in [{ key: '', label: 'Todos' }, ...STAGES]"
        :key="s.key"
        class="tab"
        :class="{ active: stageFilter === s.key }"
        @click="setStageFilter(s.key)"
      >
        {{ s.label }}
      </button>
    </div>

    <div v-if="loading" class="msg">Carregando...</div>
    <div v-else-if="error" class="msg error">{{ error }}</div>
    <template v-else>
      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Valor</th>
            <th>Estágio</th>
            <th>Contato</th>
            <th>Empresa</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="deals.length === 0">
            <td colspan="6" class="empty">Nenhum negócio encontrado.</td>
          </tr>
          <tr v-for="d in deals" :key="d.id">
            <td>{{ d.title }}</td>
            <td>{{ formatCurrency(d.amount) }}</td>
            <td><span class="badge" :class="d.stage">{{ stageLabel(d.stage) }}</span></td>
            <td>{{ d.contact_name || '—' }}</td>
            <td>{{ d.company_name || '—' }}</td>
            <td class="actions">
              <button class="btn-sm" @click="openEdit(d)">Editar</button>
              <button class="btn-sm" @click="openMoveStage(d)">Mover</button>
              <button class="btn-sm btn-danger" @click="confirmDelete(d)">Remover</button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- Modal: criar/editar -->
    <div v-if="showForm" class="backdrop" @click.self="closeForm">
      <div class="modal" role="dialog" :aria-label="editTarget ? 'Editar negócio' : 'Novo negócio'">
        <h2>{{ editTarget ? 'Editar negócio' : 'Novo negócio' }}</h2>
        <form @submit.prevent="submitForm">
          <label>
            Título *
            <input v-model="form.title" required placeholder="Ex.: Proposta Sistema ERP" />
          </label>
          <label>
            Valor (R$)
            <input v-model="form.amount" type="number" step="0.01" min="0" placeholder="0,00" />
          </label>
          <label>
            Estágio
            <select v-model="form.stage">
              <option v-for="s in STAGES" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
          </label>
          <label>
            Contato
            <select v-model="form.contact_id">
              <option :value="null">— sem contato —</option>
              <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <label>
            Empresa
            <select v-model="form.company_id">
              <option :value="null">— sem empresa —</option>
              <option v-for="co in companies" :key="co.id" :value="co.id">{{ co.name }}</option>
            </select>
          </label>
          <div v-if="formError" class="msg error">{{ formError }}</div>
          <div class="modal-actions">
            <button type="button" @click="closeForm">Cancelar</button>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? 'Salvando...' : (editTarget ? 'Salvar' : 'Criar') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: mover estágio -->
    <div v-if="moveTarget" class="backdrop" @click.self="moveTarget = null">
      <div class="modal" role="dialog" aria-label="Mover estágio">
        <h2>Mover estágio</h2>
        <p><strong>{{ moveTarget.title }}</strong></p>
        <label>
          Novo estágio
          <select v-model="newStage">
            <option v-for="s in STAGES" :key="s.key" :value="s.key">{{ s.label }}</option>
          </select>
        </label>
        <div v-if="moveError" class="msg error">{{ moveError }}</div>
        <div class="modal-actions">
          <button @click="moveTarget = null">Cancelar</button>
          <button class="btn-primary" :disabled="saving" @click="doMoveStage">
            {{ saving ? 'Movendo...' : 'Mover' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: confirmar exclusão -->
    <div v-if="deleteTarget" class="backdrop" @click.self="deleteTarget = null">
      <div class="modal" role="dialog" aria-label="Confirmar exclusão">
        <h2>Remover negócio</h2>
        <p>
          Remover <strong>{{ deleteTarget.title }}</strong>?
          Esta ação não pode ser desfeita.
        </p>
        <div class="modal-actions">
          <button @click="deleteTarget = null">Cancelar</button>
          <button class="btn-danger" :disabled="saving" @click="doDelete">
            {{ saving ? 'Removendo...' : 'Remover' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'

const STAGES = [
  { key: 'lead',      label: 'Lead' },
  { key: 'qualified', label: 'Qualificado' },
  { key: 'proposal',  label: 'Proposta' },
  { key: 'won',       label: 'Ganho' },
  { key: 'lost',      label: 'Perdido' },
]

const deals = ref([])
const contacts = ref([])
const companies = ref([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const stageFilter = ref('')
const showForm = ref(false)
const editTarget = ref(null)
const deleteTarget = ref(null)
const moveTarget = ref(null)
const newStage = ref('lead')
const saving = ref(false)
const formError = ref('')
const moveError = ref('')
const form = ref({ title: '', amount: '', stage: 'lead', contact_id: null, company_id: null })

let searchTimer = null

function stageLabel(key) {
  return STAGES.find(s => s.key === key)?.label ?? key
}

function formatCurrency(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function currentParams() {
  const p = {}
  if (stageFilter.value) p.stage = stageFilter.value
  if (search.value) p.q = search.value
  return p
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    deals.value = await api.deals.list(currentParams())
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
}

function setStageFilter(key) {
  stageFilter.value = key
  load()
}

async function loadSelectData() {
  try {
    if (!contacts.value.length) contacts.value = await api.contacts.list()
    if (!companies.value.length) companies.value = await api.companies.list()
  } catch (_) {}
}

async function openCreate() {
  editTarget.value = null
  form.value = { title: '', amount: '', stage: 'lead', contact_id: null, company_id: null }
  formError.value = ''
  await loadSelectData()
  showForm.value = true
}

async function openEdit(d) {
  editTarget.value = d
  form.value = {
    title: d.title,
    amount: d.amount ?? '',
    stage: d.stage,
    contact_id: d.contact_id || null,
    company_id: d.company_id || null,
  }
  formError.value = ''
  await loadSelectData()
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editTarget.value = null
}

async function submitForm() {
  saving.value = true
  formError.value = ''
  try {
    const payload = {
      title: form.value.title,
      amount: form.value.amount !== '' ? Number(form.value.amount) : null,
      stage: form.value.stage,
      contact_id: form.value.contact_id,
      company_id: form.value.company_id,
    }
    if (editTarget.value) {
      await api.deals.update(editTarget.value.id, payload)
    } else {
      await api.deals.create(payload)
    }
    closeForm()
    load()
  } catch (e) {
    formError.value = e.message
  } finally {
    saving.value = false
  }
}

function openMoveStage(d) {
  moveTarget.value = d
  newStage.value = d.stage
  moveError.value = ''
}

async function doMoveStage() {
  saving.value = true
  moveError.value = ''
  try {
    await api.deals.changeStage(moveTarget.value.id, newStage.value)
    moveTarget.value = null
    load()
  } catch (e) {
    moveError.value = e.message
  } finally {
    saving.value = false
  }
}

function confirmDelete(d) {
  deleteTarget.value = d
}

async function doDelete() {
  saving.value = true
  try {
    await api.deals.remove(deleteTarget.value.id)
    deals.value = deals.value.filter(d => d.id !== deleteTarget.value.id)
    deleteTarget.value = null
  } catch (e) {
    error.value = e.message
    deleteTarget.value = null
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
.toolbar-right { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; }
h1 { font-size: 1.5rem; font-weight: 700; }
.search { padding: .5rem .75rem; border: 1px solid rgb(var(--p-border)); border-radius: 6px; font-size: .95rem; width: 240px; outline: none; background: rgb(var(--p-surface)); color: rgb(var(--p-fg)); }
.search:focus-visible { border-color: #4f46e5; box-shadow: 0 0 0 2px rgb(79 70 229 / 0.35); }
.stage-tabs { display: flex; gap: .5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.tab { padding: .35rem .85rem; min-height: 2.25rem; border: 1px solid rgb(var(--p-border)); border-radius: 20px; background: rgb(var(--p-surface)); cursor: pointer; font-size: .875rem; color: rgb(var(--p-muted)); transition: background-color .15s ease, color .15s ease, box-shadow .15s ease; }
.tab:hover { background: rgb(var(--p-surface2)); }
.tab.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
.btn-primary { background: #4f46e5; color: #fff; border: none; border-radius: 6px; padding: .5rem 1rem; cursor: pointer; font-size: .95rem; font-weight: 500; transition: background-color .15s ease, color .15s ease, box-shadow .15s ease; }
.btn-primary:hover { background: #4338ca; }
.btn-primary:disabled { opacity: .6; cursor: not-allowed; }
.btn-sm { padding: .25rem .65rem; min-height: 2.25rem; border: 1px solid rgb(var(--p-border)); border-radius: 4px; background: rgb(var(--p-surface)); cursor: pointer; font-size: .85rem; transition: background-color .15s ease, color .15s ease, box-shadow .15s ease; }
.btn-sm:hover { background: rgb(var(--p-surface2)); }
.btn-danger { background: rgb(var(--p-danger)); color: #fff; border: none; border-radius: 6px; padding: .5rem 1rem; cursor: pointer; font-size: .95rem; transition: background-color .15s ease, color .15s ease, box-shadow .15s ease; }
.btn-danger:hover { background: rgb(var(--p-danger)); }
.btn-danger:disabled { opacity: .6; cursor: not-allowed; }
.btn-sm.btn-danger { padding: .25rem .65rem; font-size: .85rem; border-radius: 4px; }
@media (pointer: coarse) { .btn-sm, .tab { min-height: 2.75rem; } }
table { width: 100%; border-collapse: collapse; background: rgb(var(--p-surface)); border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
th { background: rgb(var(--p-bg)); text-align: left; padding: .75rem 1rem; font-size: .875rem; font-weight: 600; color: rgb(var(--p-muted)); border-bottom: 1px solid rgb(var(--p-border)); }
td { padding: .75rem 1rem; border-bottom: 1px solid rgb(var(--p-surface2)); font-size: .9rem; vertical-align: middle; }
td.actions { white-space: nowrap; display: flex; gap: .5rem; align-items: center; }
td.empty { text-align: center; color: rgb(var(--p-muted)); padding: 2.5rem; }
.badge { padding: .2rem .6rem; border-radius: 12px; font-size: .8rem; font-weight: 500; }
.badge.lead      { background: rgb(var(--p-surface2)); color: rgb(var(--p-muted)); }
.badge.qualified { background: rgb(79 70 229 / 0.12); color: #4f46e5; }
.badge.proposal  { background: rgb(var(--p-warn) / 0.16); color: rgb(var(--p-warn)); }
.badge.won       { background: rgb(var(--p-ok) / 0.16); color: rgb(var(--p-ok)); }
.badge.lost      { background: rgb(var(--p-danger) / 0.14); color: rgb(var(--p-danger)); }
.msg { padding: .75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.msg.error { background: rgb(var(--p-danger) / 0.14); color: rgb(var(--p-danger)); }
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
.modal { background: rgb(var(--p-surface)); border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 480px; }
.modal h2 { margin-bottom: 1rem; font-size: 1.125rem; font-weight: 600; }
.modal p { margin-bottom: 1rem; color: rgb(var(--p-fg) / 0.78); line-height: 1.5; }
label { display: flex; flex-direction: column; gap: .3rem; margin-bottom: .85rem; font-size: .875rem; font-weight: 500; color: rgb(var(--p-fg) / 0.78); }
label input, label select { padding: .5rem .75rem; border: 1px solid rgb(var(--p-border)); border-radius: 6px; font-size: .95rem; outline: none; background: rgb(var(--p-surface)); color: rgb(var(--p-fg)); }
label input:focus-visible, label select:focus-visible { border-color: #4f46e5; box-shadow: 0 0 0 2px rgb(79 70 229 / 0.35); }
.modal-actions { display: flex; justify-content: flex-end; gap: .75rem; margin-top: 1.25rem; }
</style>
