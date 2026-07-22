<template>
  <UiPageLayout title="Contas a Pagar" subtitle="Gerencie suas despesas e vencimentos." :error="r.error.value" @retry="r.load">
    <template #actions>
      <UiButton @click="openNew">Nova conta</UiButton>
    </template>

    <div class="filters">
      <UiFormField label="Status">
        <template #default="{ id }">
          <select :id="id" v-model="r.filters.status" @change="r.load">
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="vencido">Vencido</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </template>
      </UiFormField>
      <UiFormField label="Categoria">
        <template #default="{ id }">
          <input :id="id" v-model="r.filters.categoria" @change="r.load" placeholder="Categoria" />
        </template>
      </UiFormField>
      <UiFormField label="Período — início">
        <template #default="{ id }">
          <input :id="id" v-model="r.filters.period_start" type="date" @change="r.load" />
        </template>
      </UiFormField>
      <UiFormField label="Período — fim">
        <template #default="{ id }">
          <input :id="id" v-model="r.filters.period_end" type="date" @change="r.load" />
        </template>
      </UiFormField>
    </div>

    <UiCard title="Lançamentos">
      <UiDataTable :columns="columns" :rows="r.items.value" :loading="r.loading.value" row-key="id"
        :sort="sort" @update:sort="s => (sort = s)"
        :empty="{ title: 'Nenhuma conta a pagar', description: 'Cadastre sua primeira despesa.' }"
        clickable-rows @row-click="openDetail">
        <template #empty-action><UiButton @click="openNew">Cadastrar despesa</UiButton></template>
      </UiDataTable>
    </UiCard>

    <UiModal v-model:open="showForm" :title="editing ? 'Editar conta a pagar' : 'Nova conta a pagar'">
      <form @submit.prevent="save" class="modal-form">
        <UiFormSection title="Dados do lançamento" :columns="2">
          <UiFormField label="Fornecedor" :required="true" :error="errors.contraparte">
            <template #default="{ id, describedBy, hasError }">
              <input :id="id" ref="contraparteEl" v-model="form.contraparte" placeholder="Nome do fornecedor"
                :aria-describedby="describedBy" :aria-invalid="hasError || undefined" @input="errors.contraparte = ''" />
            </template>
          </UiFormField>
          <UiFormField label="Categoria">
            <template #default="{ id }">
              <input :id="id" v-model="form.categoria" placeholder="Aluguel, Folha, Energia…" />
            </template>
          </UiFormField>
          <UiFormField label="Valor" :required="true" :error="errors.valor">
            <template #default="{ id, describedBy, hasError }">
              <input :id="id" ref="valorEl" v-model.number="form.valor" type="number" step="0.01" min="0"
                :aria-describedby="describedBy" :aria-invalid="hasError || undefined" @input="errors.valor = ''" />
            </template>
          </UiFormField>
          <UiFormField label="Vencimento" :required="true" :error="errors.data">
            <template #default="{ id, describedBy, hasError }">
              <input :id="id" ref="dataEl" v-model="form.data" type="date"
                :aria-describedby="describedBy" :aria-invalid="hasError || undefined" @input="errors.data = ''" />
            </template>
          </UiFormField>
          <UiFormField label="Centro de Custo">
            <template #default="{ id }">
              <input :id="id" v-model="form.centro_custo" placeholder="Centro de custo" />
            </template>
          </UiFormField>
          <UiFormField label="Forma de Pagamento">
            <template #default="{ id }">
              <select :id="id" v-model="form.forma_pagamento">
                <option value="">Selecione…</option>
                <option value="cheque">Cheque</option>
                <option value="TED">TED</option>
                <option value="cartão">Cartão</option>
                <option value="boleto">Boleto</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Recorrência">
            <template #default="{ id }">
              <select :id="id" v-model="form.recorrencia_tipo">
                <option value="">Não recorrente</option>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Status" hint="Use 'Cancelado' para anular um lançamento feito por engano.">
            <template #default="{ id, describedBy }">
              <select :id="id" v-model="form.status" :aria-describedby="describedBy">
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Data do Pagamento">
            <template #default="{ id }">
              <input :id="id" v-model="form.data_pagamento_realizado" type="date" />
            </template>
          </UiFormField>
          <UiFormField label="Descrição">
            <template #default="{ id }">
              <input :id="id" v-model="form.descricao" placeholder="Descrição do lançamento" />
            </template>
          </UiFormField>
        </UiFormSection>
        <div class="form-actions">
          <UiButton v-if="editing" variant="danger" type="button" :loading="deleting" @click="askDelete">Excluir</UiButton>
          <span v-if="editing" class="fa-spacer" aria-hidden="true"></span>
          <UiButton variant="ghost" type="button" @click="showForm = false">Cancelar</UiButton>
          <UiButton type="submit" :loading="saving">{{ editing ? 'Salvar' : 'Cadastrar' }}</UiButton>
        </div>
      </form>
    </UiModal>
  </UiPageLayout>
</template>
<script setup>
import { ref, reactive, nextTick, onMounted } from 'vue';
import { UiPageLayout, UiCard, UiDataTable, UiButton, UiModal, UiFormSection, UiFormField, useResource, useToast, useConfirm } from '../ui/index.js';
import { accountsPayable } from '../api.js';

const toast = useToast();
const confirm = useConfirm();
const r = useResource(accountsPayable, { filters: { status: '', categoria: '', period_start: '', period_end: '' } });
const showForm = ref(false);
const editing = ref(null);
const saving = ref(false);
const deleting = ref(false);
// Ordenação client-side sobre as linhas já carregadas (UX-CV360-011).
const sort = ref(null);
// Erro inline por campo obrigatório + refs p/ foco no primeiro inválido (UX-CV360-015).
const errors = reactive({ contraparte: '', valor: '', data: '' });
const contraparteEl = ref(null), valorEl = ref(null), dataEl = ref(null);
const clearErrors = () => Object.assign(errors, { contraparte: '', valor: '', data: '' });
const emptyForm = () => ({ contraparte: '', categoria: '', valor: null, data: '', centro_custo: '', forma_pagamento: '', recorrencia_tipo: '', status: 'pendente', data_pagamento_realizado: '', descricao: '' });
const form = reactive(emptyForm());

const columns = [
  { key: 'contraparte', label: 'Fornecedor', sortable: true },
  { key: 'descricao', label: 'Descrição' },
  { key: 'valor', label: 'Valor', format: 'currency' },
  { key: 'data', label: 'Vencimento', format: 'date' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'status', label: 'Status', format: 'badge' },
];

function openNew() {
  editing.value = null;
  Object.assign(form, emptyForm());
  clearErrors();
  showForm.value = true;
}

function openDetail(row) {
  editing.value = row.id;
  Object.assign(form, { ...emptyForm(), ...row, data: row.data?.slice(0, 10) || '', data_pagamento_realizado: row.data_pagamento_realizado?.slice(0, 10) || '' });
  clearErrors();
  showForm.value = true;
}

async function askDelete() {
  if (!editing.value) return;
  const ok = await confirm({ title: 'Excluir lançamento', message: 'Excluir esta conta a pagar? Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true });
  if (!ok) return;
  deleting.value = true;
  try {
    await accountsPayable.remove(editing.value);
    toast.success('Lançamento excluído');
    showForm.value = false;
    r.load();
  } catch (e) { toast.error(e.message); } finally { deleting.value = false; }
}

async function save() {
  errors.contraparte = form.contraparte ? '' : 'Informe o fornecedor.';
  errors.valor = form.valor ? '' : 'Informe um valor maior que zero.';
  errors.data = form.data ? '' : 'Informe o vencimento.';
  if (errors.contraparte || errors.valor || errors.data) {
    await nextTick();
    const el = errors.contraparte ? contraparteEl : errors.valor ? valorEl : dataEl;
    el.value?.focus?.();
    return;
  }
  saving.value = true;
  try {
    const payload = { ...form };
    if (!payload.recorrencia_tipo) delete payload.recorrencia_tipo;
    if (!payload.forma_pagamento) delete payload.forma_pagamento;
    if (!payload.data_pagamento_realizado) delete payload.data_pagamento_realizado;
    if (editing.value) await accountsPayable.update(editing.value, payload);
    else await accountsPayable.create(payload);
    toast.success(editing.value ? 'Conta atualizada' : 'Conta cadastrada');
    showForm.value = false;
    r.load();
  } catch (e) { toast.error(e.message); } finally { saving.value = false; }
}

onMounted(r.load);
</script>
<style scoped>
.filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--ui-space-3); margin-bottom: var(--ui-space-4); }
/* Os filtros usam UiFormField (rótulo + input estilizado pelo kit com borda/raio corretos); a antiga
   regra .filter-select/.filter-input referenciava tokens inexistentes (--ui-border cru, --ui-radius)
   e virou CSS morto após a rotulagem acessível — removida (UX-CV360-006). */
.modal-form { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.form-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--ui-space-2); }
.fa-spacer { flex: 1 1 auto; }
</style>
