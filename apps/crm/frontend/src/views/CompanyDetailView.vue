<template>
  <div>
    <RouterLink to="/empresas" class="back">← Empresas</RouterLink>

    <div v-if="loading" class="msg">Carregando...</div>
    <div v-else-if="error" class="msg error">{{ error }}</div>
    <div v-else-if="company">
      <div class="header">
        <h1>{{ company.name }}</h1>
        <button class="btn-primary" @click="openEdit">Editar</button>
      </div>

      <dl class="info">
        <dt>Segmento</dt>
        <dd>{{ company.segment || '—' }}</dd>
        <dt>Site</dt>
        <dd>
          <a v-if="company.website" :href="company.website" target="_blank" rel="noopener noreferrer">
            {{ company.website }}
          </a>
          <span v-else>—</span>
        </dd>
      </dl>

      <h2>Contatos vinculados</h2>
      <p v-if="company.contacts.length === 0" class="empty">Nenhum contato vinculado a esta empresa.</p>
      <table v-else>
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Telefone</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in company.contacts" :key="c.id">
            <td>{{ c.name }}</td>
            <td>{{ c.email || '—' }}</td>
            <td>{{ c.phone || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal editar -->
    <div v-if="showForm" class="backdrop" @click.self="showForm = false">
      <div class="modal" role="dialog" aria-label="Editar empresa">
        <h2>Editar empresa</h2>
        <form @submit.prevent="submitEdit">
          <label>
            Nome *
            <input v-model="form.name" required />
          </label>
          <label>
            Segmento
            <input v-model="form.segment" />
          </label>
          <label>
            Site
            <input v-model="form.website" type="url" />
          </label>
          <div v-if="formError" class="msg error">{{ formError }}</div>
          <div class="modal-actions">
            <button type="button" @click="showForm = false">Cancelar</button>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'

const route = useRoute()
const company = ref(null)
const loading = ref(false)
const error = ref('')
const showForm = ref(false)
const saving = ref(false)
const formError = ref('')
const form = ref({ name: '', segment: '', website: '' })

async function load() {
  loading.value = true
  error.value = ''
  try {
    company.value = await api.companies.get(route.params.id)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function openEdit() {
  form.value = {
    name: company.value.name,
    segment: company.value.segment || '',
    website: company.value.website || '',
  }
  formError.value = ''
  showForm.value = true
}

async function submitEdit() {
  saving.value = true
  formError.value = ''
  try {
    company.value = await api.companies.update(route.params.id, form.value)
    showForm.value = false
  } catch (e) {
    formError.value = e.message
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.back { display: inline-block; color: rgb(var(--p-neon)); text-decoration: none; margin-bottom: 1.5rem; font-size: .9rem; }
.back:hover { text-decoration: underline; }
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .75rem; }
h1 { font-size: 1.75rem; font-weight: 700; }
h2 { font-size: 1.125rem; font-weight: 600; margin: 1.5rem 0 .75rem; }
.btn-primary { background: #4f46e5; color: #fff; border: none; border-radius: 6px; padding: .5rem 1rem; cursor: pointer; font-size: .95rem; font-weight: 500; transition: background-color .15s ease, color .15s ease, box-shadow .15s ease; }
.btn-primary:hover { background: #4338ca; }
.btn-primary:disabled { opacity: .6; cursor: not-allowed; }
.info { display: grid; grid-template-columns: 120px 1fr; gap: .4rem .75rem; background: rgb(var(--p-surface)); padding: 1rem 1.25rem; border-radius: 8px; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
dt { font-size: .875rem; font-weight: 500; color: rgb(var(--p-muted)); align-self: center; }
dd { font-size: .95rem; align-self: center; }
table { width: 100%; border-collapse: collapse; background: rgb(var(--p-surface)); border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
th { background: rgb(var(--p-bg)); text-align: left; padding: .75rem 1rem; font-size: .875rem; font-weight: 600; color: rgb(var(--p-muted)); border-bottom: 1px solid rgb(var(--p-border)); }
td { padding: .75rem 1rem; border-bottom: 1px solid rgb(var(--p-surface2)); font-size: .9rem; }
.empty { color: rgb(var(--p-muted)); padding: .5rem 0; }
a { color: rgb(var(--p-neon)); text-decoration: none; }
a:hover { text-decoration: underline; }
.msg { padding: .75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.msg.error { background: rgb(var(--p-danger) / 0.14); color: rgb(var(--p-danger)); }
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
.modal { background: rgb(var(--p-surface)); border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 480px; }
.modal h2 { margin-bottom: 1rem; font-size: 1.125rem; font-weight: 600; }
label { display: flex; flex-direction: column; gap: .3rem; margin-bottom: .85rem; font-size: .875rem; font-weight: 500; color: rgb(var(--p-fg) / 0.78); }
label input { padding: .5rem .75rem; border: 1px solid rgb(var(--p-border)); border-radius: 6px; font-size: .95rem; outline: none; background: rgb(var(--p-surface)); color: rgb(var(--p-fg)); }
label input:focus-visible { border-color: #4f46e5; box-shadow: 0 0 0 2px rgb(79 70 229 / 0.35); }
.modal-actions { display: flex; justify-content: flex-end; gap: .75rem; margin-top: 1.25rem; }
</style>
