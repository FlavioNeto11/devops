<template>
  <UiPageLayout title="Contas a Receber" subtitle="Gerencie suas receitas e valores a receber." :error="r.error.value" @retry="r.load">
    <template #actions>
      <UiButton @click="openNew">Nova conta</UiButton>
    </template>

    <div class="filters">
      <select v-model="r.filters.status" @change="r.load" class="filter-select">
        <option value="">Todos os status</option>
        <option value="pendente">Pendente</option>
        <option value="recebido">Recebido</option>
        <option value="vencido">Vencido</option>
        <option value="cancelado">Cancelado</option>
      </select>
      <input v-model="r.filters.categoria" @change="r.load" placeholder="Categoria" class="filter-input" />
      <input v-model="r.filters.period_start" type="date" @change="r.load" class="filter-input" />
      <input v-model="r.filters.period_end" type="date" @change="r.load" class="filter-input" />
    </div>

    <UiCard title="Lançamentos">
      <UiDataTable :columns="columns" :rows="r.items.value" :loading="r.loading.value" row-key="id"
        :empty="{ title: 'Nenhuma conta a receber', description: 'Cadastre sua primeira receita.' }"
        clickable-rows @row-click="openDetail">
        <template #empty-action><UiButton @click="openNew">Cadastrar receita</UiButton></template>
      </UiDataTable>
    </UiCard>

    <UiModal v-model:open="showForm" :title="editing ? 'Editar conta a receber' : 'Nova conta a receber'">
      <form @submit.prevent="save" class="modal-form">
        <UiFormSection title="Dados do lançamento" :columns="2">
          <UiFormField label="Cliente" :required="true">
            <template #default="{ id }">
              <input :id="id" v-model="form.contraparte" placeholder="Nome do cliente" />
            </template>
          </UiFormField>
          <UiFormField label="Categoria">
            <template #default="{ id }">
              <input :id="id" v-model="form.categoria" placeholder="Serviço, Produto, Honorários…" />
            </template>
          </UiFormField>
          <UiFormField label="Valor" :required="true">
            <template #default="{ id }">
              <input :id="id" v-model.number="form.valor" type="number" step="0.01" min="0" />
            </template>
          </UiFormField>
          <UiFormField label="Vencimento" :required="true">
            <template #default="{ id }">
              <input :id="id" v-model="form.data" type="date" />
            </template>
          </UiFormField>
          <UiFormField label="Forma de Recebimento">
            <template #default="{ id }">
              <input :id="id" v-model="form.forma_recebimento" placeholder="Transferência, Dinheiro, PIX…" />
            </template>
          </UiFormField>
          <UiFormField label="Status">
            <template #default="{ id }">
              <select :id="id" v-model="form.status">
                <option value="pendente">Pendente</option>
                <option value="recebido">Recebido</option>
                <option value="vencido">Vencido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Descrição">
            <template #default="{ id }">
              <input :id="id" v-model="form.descricao" placeholder="Descrição do lançamento" />
            </template>
          </UiFormField>
          <UiFormField label="Anexo (URL)">
            <template #default="{ id }">
              <input :id="id" v-model="form.comprovante_url" placeholder="Nota fiscal, contrato…" />
            </template>
          </UiFormField>
        </UiFormSection>
        <div class="form-actions">
          <UiButton variant="ghost" type="button" @click="showForm = false">Cancelar</UiButton>
          <UiButton type="submit" :loading="saving">{{ editing ? 'Salvar' : 'Cadastrar' }}</UiButton>
        </div>
      </form>
    </UiModal>
  </UiPageLayout>
</template>
<script setup>
import { ref, reactive, onMounted } from 'vue';
import { UiPageLayout, UiCard, UiDataTable, UiButton, UiModal, UiFormSection, UiFormField, useResource, useToast } from '../ui/index.js';
import { accountsReceivable } from '../api.js';

const toast = useToast();
const r = useResource(accountsReceivable, { filters: { status: '', categoria: '', period_start: '', period_end: '' } });
const showForm = ref(false);
const editing = ref(null);
const saving = ref(false);
const emptyForm = () => ({ contraparte: '', categoria: '', valor: null, data: '', forma_recebimento: '', status: 'pendente', descricao: '', comprovante_url: '' });
const form = reactive(emptyForm());

const columns = [
  { key: 'contraparte', label: 'Cliente', sortable: true },
  { key: 'descricao', label: 'Descrição' },
  { key: 'valor', label: 'Valor', format: 'currency' },
  { key: 'data', label: 'Vencimento', format: 'date' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'status', label: 'Status', format: 'badge' },
];

function openNew() {
  editing.value = null;
  Object.assign(form, emptyForm());
  showForm.value = true;
}

function openDetail(row) {
  editing.value = row.id;
  Object.assign(form, { ...emptyForm(), ...row, data: row.data?.slice(0, 10) || '' });
  showForm.value = true;
}

async function save() {
  if (!form.contraparte || !form.valor || !form.data) { toast.error('Cliente, valor e data são obrigatórios'); return; }
  saving.value = true;
  try {
    const payload = { ...form };
    if (!payload.forma_recebimento) delete payload.forma_recebimento;
    if (editing.value) await accountsReceivable.update(editing.value, payload);
    else await accountsReceivable.create(payload);
    toast.success(editing.value ? 'Conta atualizada' : 'Conta cadastrada');
    showForm.value = false;
    r.load();
  } catch (e) { toast.error(e.message); } finally { saving.value = false; }
}

onMounted(r.load);
</script>
<style scoped>
.filters { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; margin-bottom: var(--ui-space-4); }
.filter-select, .filter-input { padding: var(--ui-space-1) var(--ui-space-2); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); font-size: var(--ui-text-sm); }
.modal-form { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.form-actions { display: flex; justify-content: flex-end; gap: var(--ui-space-2); }
</style>
