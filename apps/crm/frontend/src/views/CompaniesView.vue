<template>
  <div>
    <div class="toolbar">
      <h1>Empresas</h1>
      <div class="toolbar-right">
        <input
          v-model="search"
          @input="onSearch"
          placeholder="Buscar por nome ou segmento..."
          class="search"
          aria-label="Buscar empresas"
        />
        <button class="btn-primary" @click="openCreate">+ Nova empresa</button>
      </div>
    </div>

    <div v-if="loading" class="msg">Carregando...</div>
    <div v-else-if="error" class="msg error">{{ error }}</div>
    <template v-else>
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Segmento</th>
            <th>Site</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="companies.length === 0">
            <td colspan="4" class="empty">Nenhuma empresa encontrada.</td>
          </tr>
          <tr v-for="c in companies" :key="c.id">
            <td>
              <RouterLink :to="'/empresas/' + c.id">{{ c.name }}</RouterLink>
            </td>
            <td>{{ c.segment || '—' }}</td>
            <td>
              <a v-if="c.website" :href="c.website" target="_blank" rel="noopener noreferrer">{{ c.website }}</a>
              <span v-else>—</span>
            </td>
            <td class="actions">
              <button class="btn-sm" @click="openEdit(c)">Editar</button>
              <button class="btn-sm btn-danger" @click="confirmDelete(c)">Remover</button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- Modal: criar/editar -->
    <div v-if="showForm" class="backdrop" @click.self="closeForm">
      <div class="modal" role="dialog" :aria-label="editTarget ? 'Editar empresa' : 'Nova empresa'">
        <h2>{{ editTarget ? 'Editar empresa' : 'Nova empresa' }}</h2>
        <form @submit.prevent="submitForm">
          <label>
            Nome *
            <input v-model="form.name" required placeholder="Razão social ou nome fantasia" />
          </label>
          <label>
            Segmento
            <input v-model="form.segment" placeholder="Ex: Tecnologia, Indústria" />
          </label>
          <label>
            Site
            <input v-model="form.website" placeholder="https://..." type="url" />
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

    <!-- Modal: confirmar exclusão -->
    <div v-if="deleteTarget" class="backdrop" @click.self="deleteTarget = null">
      <div class="modal" role="dialog" aria-label="Confirmar exclusão">
        <h2>Remover empresa</h2>
        <p>
          Remover <strong>{{ deleteTarget.name }}</strong>?
          Contatos e negócios vinculados perderão o vínculo com esta empresa.
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

const companies = ref([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const showForm = ref(false)
const editTarget = ref(null)
const deleteTarget = ref(null)
const saving = ref(false)
const formError = ref('')
const form = ref({ name: '', segment: '', website: '' })

let searchTimer = null

async function load(q) {
  loading.value = true
  error.value = ''
  try {
    companies.value = await api.companies.list(q)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => load(search.value || undefined), 300)
}

function openCreate() {
  editTarget.value = null
  form.value = { name: '', segment: '', website: '' }
  formError.value = ''
  showForm.value = true
}

function openEdit(c) {
  editTarget.value = c
  form.value = { name: c.name, segment: c.segment || '', website: c.website || '' }
  formError.value = ''
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
    if (editTarget.value) {
      const updated = await api.companies.update(editTarget.value.id, form.value)
      const idx = companies.value.findIndex((c) => c.id === updated.id)
      if (idx !== -1) companies.value[idx] = updated
    } else {
      const created = await api.companies.create(form.value)
      companies.value.push(created)
      companies.value.sort((a, b) => a.name.localeCompare(b.name))
    }
    closeForm()
  } catch (e) {
    formError.value = e.message
  } finally {
    saving.value = false
  }
}

function confirmDelete(c) {
  deleteTarget.value = c
}

async function doDelete() {
  saving.value = true
  try {
    await api.companies.remove(deleteTarget.value.id)
    companies.value = companies.value.filter((c) => c.id !== deleteTarget.value.id)
    deleteTarget.value = null
  } catch (e) {
    error.value = e.message
    deleteTarget.value = null
  } finally {
    saving.value = false
  }
}

onMounted(() => load())
</script>

<style scoped>
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
.toolbar-right { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; }
h1 { font-size: 1.5rem; font-weight: 700; }
.search { padding: .5rem .75rem; border: 1px solid rgb(var(--p-border)); border-radius: 6px; font-size: .95rem; width: 260px; outline: none; background: rgb(var(--p-surface)); color: rgb(var(--p-fg)); }
.search:focus-visible { border-color: #4f46e5; box-shadow: 0 0 0 2px rgb(79 70 229 / 0.35); }
.btn-primary { background: #4f46e5; color: #fff; border: none; border-radius: 6px; padding: .5rem 1rem; cursor: pointer; font-size: .95rem; font-weight: 500; transition: background-color .15s ease, color .15s ease, box-shadow .15s ease; }
.btn-primary:hover { background: #4338ca; }
.btn-primary:disabled { opacity: .6; cursor: not-allowed; }
.btn-sm { padding: .25rem .65rem; min-height: 2.25rem; border: 1px solid rgb(var(--p-border)); border-radius: 4px; background: rgb(var(--p-surface)); cursor: pointer; font-size: .85rem; transition: background-color .15s ease, color .15s ease, box-shadow .15s ease; }
.btn-sm:hover { background: rgb(var(--p-surface2)); }
.btn-danger { background: rgb(var(--p-danger)); color: #fff; border: none; border-radius: 6px; padding: .5rem 1rem; cursor: pointer; font-size: .95rem; transition: background-color .15s ease, color .15s ease, box-shadow .15s ease; }
.btn-danger:hover { background: rgb(var(--p-danger)); }
.btn-danger:disabled { opacity: .6; cursor: not-allowed; }
.btn-sm.btn-danger { padding: .25rem .65rem; font-size: .85rem; border-radius: 4px; }
@media (pointer: coarse) { .btn-sm { min-height: 2.75rem; } }
table { width: 100%; border-collapse: collapse; background: rgb(var(--p-surface)); border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
th { background: rgb(var(--p-bg)); text-align: left; padding: .75rem 1rem; font-size: .875rem; font-weight: 600; color: rgb(var(--p-muted)); border-bottom: 1px solid rgb(var(--p-border)); }
td { padding: .75rem 1rem; border-bottom: 1px solid rgb(var(--p-surface2)); font-size: .9rem; vertical-align: middle; }
td.actions { white-space: nowrap; display: flex; gap: .5rem; align-items: center; }
td.empty { text-align: center; color: rgb(var(--p-muted)); padding: 2.5rem; }
a { color: #4f46e5; text-decoration: none; }
a:hover { text-decoration: underline; }
.msg { padding: .75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.msg.error { background: rgb(var(--p-danger) / 0.14); color: rgb(var(--p-danger)); }
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
.modal { background: rgb(var(--p-surface)); border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 480px; }
.modal h2 { margin-bottom: 1rem; font-size: 1.125rem; font-weight: 600; }
.modal p { margin-bottom: 1rem; color: rgb(var(--p-fg) / 0.78); line-height: 1.5; }
label { display: flex; flex-direction: column; gap: .3rem; margin-bottom: .85rem; font-size: .875rem; font-weight: 500; color: rgb(var(--p-fg) / 0.78); }
label input { padding: .5rem .75rem; border: 1px solid rgb(var(--p-border)); border-radius: 6px; font-size: .95rem; outline: none; background: rgb(var(--p-surface)); color: rgb(var(--p-fg)); }
label input:focus-visible { border-color: #4f46e5; box-shadow: 0 0 0 2px rgb(79 70 229 / 0.35); }
.modal-actions { display: flex; justify-content: flex-end; gap: .75rem; margin-top: 1.25rem; }
</style>
