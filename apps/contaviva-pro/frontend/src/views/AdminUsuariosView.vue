<!--
  AdminUsuariosView — gerência de usuários (bloco contas-acesso). SÓ admin (guard de rota + nav).
  Lista /v1/users, cria (modal), muda papel, ativa/desativa. O backend impõe o cap de papel; a UI
  só oferece as ações. Confirmação destrutiva via useConfirm. Só o kit ui-vue + tokens --ui-*.
-->
<template>
  <UiPageLayout title="Usuários" eyebrow="Administração" subtitle="Gerencie quem acessa o sistema." :loading="loading" :error="error" @retry="load">
    <template #actions><UiButton @click="openCreate">Novo usuário</UiButton></template>
    <UiDataTable :columns="columns" :rows="rows" row-key="id"
      :empty="{ title: 'Nenhum usuário', description: 'Crie o primeiro usuário.' }">
      <template #cell-role="{ row }">
        <UiStatusBadge :tone="row.role === 'admin' ? 'success' : 'neutral'" :label="row.role" size="sm" />
      </template>
      <template #cell-is_active="{ row }">
        <UiStatusBadge :tone="row.is_active ? 'success' : 'neutral'" :label="row.is_active ? 'ativo' : 'inativo'" size="sm" />
      </template>
      <template #cell-actions="{ row }">
        <div class="usr-actions">
          <UiButton variant="ghost" size="sm" @click="toggleRole(row)">{{ row.role === 'admin' ? 'Tornar membro' : 'Tornar admin' }}</UiButton>
          <UiButton variant="ghost" size="sm" @click="toggleActive(row)">{{ row.is_active ? 'Desativar' : 'Reativar' }}</UiButton>
        </div>
      </template>
    </UiDataTable>
  </UiPageLayout>

  <UiModal v-model:open="creating" title="Novo usuário">
    <form id="usr-form" @submit.prevent="create">
      <UiFormSection :columns="1">
        <UiFormField label="Nome" :required="true" :error="cf.errors.name">
          <template #default="{ id, describedBy }">
            <UiInput :id="id" :described-by="describedBy" :model-value="cf.values.name" @update:model-value="cf.setField('name', $event)" />
          </template>
        </UiFormField>
        <UiFormField label="E-mail" :required="true" :error="cf.errors.email">
          <template #default="{ id, describedBy }">
            <UiInput :id="id" :described-by="describedBy" type="email" :model-value="cf.values.email" @update:model-value="cf.setField('email', $event)" />
          </template>
        </UiFormField>
        <UiFormField label="Senha" :required="true" :error="cf.errors.password" hint="Mínimo de 8 caracteres.">
          <template #default="{ id, describedBy }">
            <UiInput :id="id" :described-by="describedBy" type="password" :model-value="cf.values.password" autocomplete="new-password" @update:model-value="cf.setField('password', $event)" />
          </template>
        </UiFormField>
        <UiFormField label="Papel">
          <template #default="{ id }">
            <select :id="id" :value="cf.values.role" @change="cf.setField('role', $event.target.value)">
              <option value="member">membro</option>
              <option value="admin">admin</option>
            </select>
          </template>
        </UiFormField>
      </UiFormSection>
    </form>
    <template #footer>
      <UiButton variant="ghost" @click="creating = false">Cancelar</UiButton>
      <UiButton type="submit" form="usr-form" :loading="cf.submitting.value">Criar</UiButton>
    </template>
  </UiModal>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { UiPageLayout, UiDataTable, UiButton, UiStatusBadge, UiModal, UiFormSection, UiFormField, UiInput, useForm, validators, useToast, useConfirm } from '../ui/index.js';
import { users } from '../api.js';
import { useAuth } from '../composables/useAuth.js';
const toast = useToast();
const ask = useConfirm();
const account = useAuth();
const columns = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'role', label: 'Papel' },
  { key: 'is_active', label: 'Status' },
  { key: 'actions', label: '', align: 'right' },
];
const rows = ref([]);
const loading = ref(true);
const error = ref(null);
const creating = ref(false);
const cf = useForm({ initial: { name: '', email: '', password: '', role: 'member' }, rules: { name: [validators.required()], email: [validators.required(), validators.email()], password: [validators.required(), validators.minLen(8)] } });

async function load() {
  loading.value = true; error.value = null;
  try { const r = await users.list({ pageSize: 100 }); rows.value = r.data || []; }
  catch (e) { error.value = e.message || 'Não foi possível carregar os usuários.'; }
  finally { loading.value = false; }
}

function openCreate() { cf.reset(); creating.value = true; }

function create() {
  cf.handleSubmit(async (vals) => {
    try {
      await users.create({ name: vals.name, email: vals.email, password: vals.password, role: vals.role });
      toast.success('Usuário criado.');
      creating.value = false;
      await load();
    } catch (e) { toast.error(e.status === 409 ? 'Já existe um usuário com este e-mail.' : (e.message || 'Não foi possível criar.')); }
  });
}

async function toggleRole(row) {
  const next = row.role === 'admin' ? 'member' : 'admin';
  try { await users.update(row.id, { role: next }); row.role = next; toast.success('Papel atualizado.'); }
  catch (e) { toast.error(e.status === 403 ? 'Sem permissão para esta ação.' : (e.message || 'Não foi possível atualizar.')); }
}

async function toggleActive(row) {
  if (row.is_active) {
    const ok = await ask({ title: 'Desativar usuário', message: 'Desativar ' + (row.email || 'este usuário') + '? Ele perde o acesso imediatamente.', danger: true, confirmLabel: 'Desativar' });
    if (!ok) return;
    try { await users.remove(row.id); row.is_active = false; toast.success('Usuário desativado.'); }
    catch (e) { toast.error(e.message || 'Não foi possível desativar.'); }
  } else {
    try { await users.update(row.id, { is_active: true }); row.is_active = true; toast.success('Usuário reativado.'); }
    catch (e) { toast.error(e.message || 'Não foi possível reativar.'); }
  }
}

onMounted(async () => { if (!account.user.value) await account.fetchMe(); await load(); });
</script>
<style scoped>
.usr-actions { display: inline-flex; gap: var(--ui-space-2); justify-content: flex-end; flex-wrap: wrap; }
</style>
