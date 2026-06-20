<template>
  <div>
    <div class="toolbar">
      <h1>Contatos</h1>
      <div class="toolbar-right">
        <input
          v-model="search"
          @input="onSearch"
          placeholder="Buscar por nome ou e-mail..."
          class="search"
          aria-label="Buscar contatos"
        />
        <button class="btn-primary" @click="openCreate">+ Novo contato</button>
      </div>
    </div>

    <div v-if="loading" class="msg">Carregando...</div>
    <div v-else-if="error" class="msg error">{{ error }}</div>
    <template v-else>
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Telefone</th>
            <th>Empresa</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="contacts.length === 0">
            <td colspan="5" class="empty">Nenhum contato encontrado.</td>
          </tr>
          <tr v-for="c in contacts" :key="c.id">
            <td>{{ c.name }}</td>
            <td>{{ c.email || '—' }}</td>
            <td>{{ c.phone || '—' }}</td>
            <td>
              <RouterLink v-if="c.company_id" :to="'/empresas/' + c.company_id">
                {{ c.company_name || c.company_id }}
              </RouterLink>
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
      <div class="modal" role="dialog" :aria-label="editTarget ? 'Editar contato' : 'Novo contato'">
        <h2>{{ editTarget ? 'Editar contato' : 'Novo contato' }}</h2>
        <form @submit.prevent="submitForm">
          <label>
            Nome *
            <input v-model="form.name" required placeholder="Nome completo" />
          </label>
          <label>
            E-mail
            <input v-model="form.email" type="email" placeholder="email@exemplo.com" />
          </label>
          <label>
            Telefone
            <input v-model="form.phone" placeholder="(11) 9 0000-0000" />
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

    <!-- Modal: confirmar exclusão -->
    <div v-if="deleteTarget" class="backdrop" @click.self="deleteTarget = null">
      <div class="modal" role="dialog" aria-label="Confirmar exclusão">
        <h2>Remover contato</h2>
        <p>
          Remover <strong>{{ deleteTarget.name }}</strong>?
          Negócios vinculados a este contato perderão o vínculo.
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

const contacts = ref([])
const companies = ref([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const showForm = ref(false)
const editTarget = ref(null)
const deleteTarget = ref(null)
const saving = ref(false)
const formError = ref('')
const form = ref({ name: '', email: '', phone: '', company_id: null })

let searchTimer = null

async function load(q) {
  loading.value = true
  error.value = ''
  try {
    contacts.value = await api.contacts.list(q)
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

async function loadCompanies() {
  if (companies.value.length) return
  try {
    companies.value = await api.companies.list()
  } catch (_) {
    // silently ignore — usuário pode salvar sem empresa
  }
}

async function openCreate() {
  editTarget.value = null
  form.value = { name: '', email: '', phone: '', company_id: null }
  formError.value = ''
  await loadCompanies()
  showForm.value = true
}

async function openEdit(c) {
  editTarget.value = c
  form.value = { name: c.name, email: c.email || '', phone: c.phone || '', company_id: c.company_id || null }
  formError.value = ''
  await loadCompanies()
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
      name: form.value.name,
      email: form.value.email || null,
      phone: form.value.phone || null,
      company_id: form.value.company_id || null,
    }
    if (editTarget.value) {
      const updated = await api.contacts.update(editTarget.value.id, payload)
      const idx = contacts.value.findIndex((c) => c.id === updated.id)
      if (idx !== -1) {
        const co = companies.value.find((co) => co.id === updated.company_id)
        contacts.value[idx] = { ...updated, company_name: co ? co.name : null }
      }
    } else {
      const created = await api.contacts.create(payload)
      const co = companies.value.find((co) => co.id === created.company_id)
      contacts.value.push({ ...created, company_name: co ? co.name : null })
      contacts.value.sort((a, b) => a.name.localeCompare(b.name))
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
    await api.contacts.remove(deleteTarget.value.id)
    contacts.value = contacts.value.filter((c) => c.id !== deleteTarget.value.id)
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
label input, label select { padding: .5rem .75rem; border: 1px solid rgb(var(--p-border)); border-radius: 6px; font-size: .95rem; outline: none; background: rgb(var(--p-surface)); color: rgb(var(--p-fg)); }
label input:focus-visible, label select:focus-visible { border-color: #4f46e5; box-shadow: 0 0 0 2px rgb(79 70 229 / 0.35); }
.modal-actions { display: flex; justify-content: flex-end; gap: .75rem; margin-top: 1.25rem; }
</style>
