<template>
  <UiPageLayout
    title="Receitas e Despesas"
    eyebrow="Financeiro"
    subtitle="Lista geral de lançamentos de receitas e despesas para pessoas físicas e jurídicas."
    width="wide"
    :error="r.error.value ? (r.error.value.message || 'Erro ao carregar lançamentos') : null"
    @retry="r.load"
  >
    <!-- ── ações de topo ───────────────────────────────────────────── -->
    <template #actions>
      <div class="ie-top-actions">
        <UiButton variant="ghost" @click="openNew('despesa')">
          <span aria-hidden="true" class="ie-btn-icon ie-btn-icon--despesa">−</span>
          Nova Despesa
        </UiButton>
        <UiButton variant="primary" @click="openNew('receita')">
          <span aria-hidden="true" class="ie-btn-icon ie-btn-icon--receita">+</span>
          Nova Receita
        </UiButton>
      </div>
    </template>

    <!-- ── painel de filtros ──────────────────────────────────────── -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- ── métricas resumo ────────────────────────────────────────── -->
    <div class="ie-metrics" role="region" aria-label="Resumo financeiro">
      <UiMetricCard
        label="Total Receitas"
        :value="fmt.formatCurrency(totals.receita)"
        tone="success"
        hint="Soma das receitas no filtro atual"
      />
      <UiMetricCard
        label="Total Despesas"
        :value="fmt.formatCurrency(totals.despesa)"
        tone="error"
        hint="Soma das despesas no filtro atual"
      />
      <UiMetricCard
        label="Saldo Líquido"
        :value="fmt.formatCurrency(totals.saldo)"
        :tone="totals.saldo >= 0 ? 'success' : 'error'"
        hint="Receitas menos Despesas"
      />
      <UiMetricCard
        label="Total de Lançamentos"
        :value="String(r.total.value)"
        tone="neutral"
        hint="Resultado dos filtros aplicados"
      />
    </div>

    <!-- ── toggle de tipo ─────────────────────────────────────────── -->
    <div class="ie-type-toggle" role="group" aria-label="Filtrar por tipo de lançamento">
      <button
        class="ie-toggle-btn"
        :data-active="activeTypeFilter === ''"
        :aria-pressed="activeTypeFilter === ''"
        @click="setTypeFilter('')"
      >
        Todos
      </button>
      <button
        class="ie-toggle-btn ie-toggle-btn--receita"
        :data-active="activeTypeFilter === 'receita'"
        :aria-pressed="activeTypeFilter === 'receita'"
        @click="setTypeFilter('receita')"
      >
        <span aria-hidden="true">↑</span>
        Receitas
      </button>
      <button
        class="ie-toggle-btn ie-toggle-btn--despesa"
        :data-active="activeTypeFilter === 'despesa'"
        :aria-pressed="activeTypeFilter === 'despesa'"
        @click="setTypeFilter('despesa')"
      >
        <span aria-hidden="true">↓</span>
        Despesas
      </button>
    </div>

    <!-- ── tabela principal ───────────────────────────────────────── -->
    <UiCard :padded="false">
      <template #actions>
        <span class="ie-count" aria-live="polite">
          {{ r.total.value }} {{ r.total.value === 1 ? 'lançamento' : 'lançamentos' }}
        </span>
      </template>

      <UiDataTable
        :columns="columns"
        :rows="r.items.value"
        :loading="r.loading.value"
        row-key="id"
        server-mode
        :sort="r.sort.value"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        clickable-rows
        :empty="emptyState"
        @update:sort="r.setSort"
        @update:page="r.setPage"
        @row-click="openDetail"
      >
        <!-- Entidade: tipo + id badge -->
        <template #cell-entity_type="{ value, row }">
          <span class="ie-entity-cell">
            <span
              class="ie-entity-badge"
              :data-kind="value"
              :aria-label="value === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'"
            >
              {{ value === 'pj' ? 'PJ' : 'PF' }}
            </span>
            <span class="ie-entity-id" aria-label="ID da entidade">
              #{{ row.entity_id }}
            </span>
          </span>
        </template>

        <!-- Tipo: receita / despesa com ícone direcional -->
        <template #cell-tipo="{ value }">
          <span class="ie-tipo-cell" :data-tipo="value">
            <span aria-hidden="true" class="ie-tipo-arrow">
              {{ value === 'receita' ? '↑' : '↓' }}
            </span>
            {{ value === 'receita' ? 'Receita' : 'Despesa' }}
          </span>
        </template>

        <!-- Valor com coloração por tipo -->
        <template #cell-valor="{ value, row }">
          <span
            class="ie-valor-cell"
            :data-tipo="row.tipo"
            :aria-label="`${row.tipo === 'receita' ? 'Receita' : 'Despesa'} de ${fmt.formatCurrency(value)}`"
          >
            {{ fmt.formatCurrency(value) }}
          </span>
        </template>

        <!-- Data formatada -->
        <template #cell-data="{ value }">
          <span class="ie-date-cell">{{ fmt.formatDate(value) }}</span>
        </template>

        <!-- Status com badge semântico -->
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value || 'pendente'" with-dot />
        </template>

        <!-- Ações em linha -->
        <template #cell-_actions="{ row }">
          <div class="ie-row-actions">
            <button
              class="ie-action-btn"
              data-tone="neutral"
              :aria-label="`Editar lançamento de ${fmt.formatCurrency(row.valor)}`"
              @click.stop="openEdit(row)"
            >
              <span aria-hidden="true">✎</span>
              Editar
            </button>
            <button
              class="ie-action-btn"
              data-tone="danger"
              :aria-label="`Excluir lançamento de ${fmt.formatCurrency(row.valor)}`"
              :disabled="deletingId === row.id"
              @click.stop="deleteRow(row)"
            >
              <span aria-hidden="true">✕</span>
              {{ deletingId === row.id ? 'Excluindo…' : 'Excluir' }}
            </button>
          </div>
        </template>

        <template #empty-action>
          <div class="ie-empty-actions">
            <UiButton variant="ghost" @click="openNew('despesa')">Nova Despesa</UiButton>
            <UiButton variant="primary" @click="openNew('receita')">Nova Receita</UiButton>
          </div>
        </template>
      </UiDataTable>

      <!-- ── rodapé com totalizações ───────────────────────────────── -->
      <template #footer>
        <div class="ie-footer-totals" aria-label="Totalizações dos lançamentos visíveis">
          <div class="ie-footer-item">
            <span class="ie-footer-label">Receitas</span>
            <span class="ie-footer-value" data-tone="success">
              {{ fmt.formatCurrency(totals.receita) }}
            </span>
          </div>
          <div class="ie-footer-sep" aria-hidden="true" />
          <div class="ie-footer-item">
            <span class="ie-footer-label">Despesas</span>
            <span class="ie-footer-value" data-tone="error">
              {{ fmt.formatCurrency(totals.despesa) }}
            </span>
          </div>
          <div class="ie-footer-sep" aria-hidden="true" />
          <div class="ie-footer-item">
            <span class="ie-footer-label">Pendentes</span>
            <span class="ie-footer-value" data-tone="warning">
              {{ fmt.formatCurrency(totals.pendente) }}
            </span>
          </div>
          <div class="ie-footer-sep" aria-hidden="true" />
          <div class="ie-footer-item ie-footer-item--total">
            <span class="ie-footer-label">Saldo</span>
            <span
              class="ie-footer-value ie-footer-value--saldo"
              :data-positive="totals.saldo >= 0"
            >
              {{ fmt.formatCurrency(totals.saldo) }}
            </span>
          </div>
        </div>
      </template>
    </UiCard>

    <!-- ── modal: criar / editar lançamento ──────────────────────── -->
    <UiModal
      :open="showForm"
      :title="editing ? 'Editar Lançamento' : (formData.tipo === 'receita' ? 'Nova Receita' : 'Nova Despesa')"
      width="lg"
      @update:open="showForm = $event"
      @close="showForm = false"
    >
      <form class="ie-form" @submit.prevent="save">
        <!-- Tipo de lançamento -->
        <div class="ie-tipo-toggle-form" role="group" aria-label="Tipo de lançamento">
          <button
            type="button"
            class="ie-tipo-btn"
            :data-active="formData.tipo === 'receita'"
            :aria-pressed="formData.tipo === 'receita'"
            :disabled="!!editing"
            @click="setFormField('tipo', 'receita')"
          >
            <span aria-hidden="true">↑</span>
            Receita
          </button>
          <button
            type="button"
            class="ie-tipo-btn ie-tipo-btn--despesa"
            :data-active="formData.tipo === 'despesa'"
            :aria-pressed="formData.tipo === 'despesa'"
            :disabled="!!editing"
            @click="setFormField('tipo', 'despesa')"
          >
            <span aria-hidden="true">↓</span>
            Despesa
          </button>
        </div>

        <UiFormSection title="Identificação e valor" :columns="2">
          <UiFormField label="Tipo de Entidade" :required="true" :error="formErrors.entity_type">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="formData.entity_type"
                @change="setFormField('entity_type', $event.target.value)"
              >
                <option value="">Selecione…</option>
                <option value="pf">Pessoa Física (PF)</option>
                <option value="pj">Pessoa Jurídica (PJ)</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="ID da Entidade" :required="true" :error="formErrors.entity_id">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                min="1"
                :value="formData.entity_id"
                placeholder="Ex.: 42"
                @input="setFormField('entity_id', parseInt($event.target.value) || null)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Valor" :required="true" :error="formErrors.valor">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                step="0.01"
                min="0"
                :value="formData.valor"
                placeholder="0,00"
                @input="setFormField('valor', parseFloat($event.target.value) || null)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Data" :required="true" :error="formErrors.data">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="date"
                :value="formData.data"
                @input="setFormField('data', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Categoria" :error="formErrors.categoria">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="formData.categoria"
                placeholder="Ex.: Salário, Aluguel, Serviços…"
                @input="setFormField('categoria', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Contraparte" :error="formErrors.contraparte">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="formData.contraparte"
                placeholder="Nome do cliente, fornecedor ou pagador"
                @input="setFormField('contraparte', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Detalhes adicionais" :columns="2">
          <UiFormField label="Centro de Custo">
            <template #default="{ id }">
              <input
                :id="id"
                :value="formData.centro_custo"
                placeholder="Departamento ou centro de custo"
                @input="setFormField('centro_custo', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Status">
            <template #default="{ id }">
              <select
                :id="id"
                :value="formData.status"
                @change="setFormField('status', $event.target.value)"
              >
                <option value="pendente">Pendente</option>
                <option value="pago">Pago / Recebido</option>
                <option value="atrasado">Atrasado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Recorrente">
            <template #default="{ id }">
              <label class="ie-checkbox-row" :for="id">
                <input
                  :id="id"
                  type="checkbox"
                  class="ie-checkbox"
                  :checked="formData.recorrente"
                  @change="setFormField('recorrente', $event.target.checked)"
                />
                Lançamento recorrente
              </label>
            </template>
          </UiFormField>

          <UiFormField label="Descrição">
            <template #default="{ id }">
              <textarea
                :id="id"
                :value="formData.descricao"
                placeholder="Observações ou detalhes sobre este lançamento"
                rows="3"
                class="ie-textarea"
                @input="setFormField('descricao', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <div class="ie-form-actions">
          <UiButton variant="ghost" type="button" @click="showForm = false">Cancelar</UiButton>
          <UiButton
            variant="primary"
            type="submit"
            :loading="saving"
          >
            {{ editing ? 'Salvar alterações' : (formData.tipo === 'receita' ? 'Cadastrar Receita' : 'Cadastrar Despesa') }}
          </UiButton>
        </div>
      </form>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
  UiStatusBadge,
  UiMetricCard,
  UiModal,
  UiFormField,
  UiFormSection,
  useResource,
  useToast,
  useConfirm,
  useForm,
  validators,
  format as fmt,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// ─── recurso de API ──────────────────────────────────────────────────────────
const incomeExpenses = resourceFactory('income-expenses');

const router  = useRouter();
const toast   = useToast();
const ask     = useConfirm();

// ─── recurso reativo ─────────────────────────────────────────────────────────
const r = useResource(incomeExpenses, {
  filters: { tipo: '', entity_type: '', categoria: '', status: '', period_start: '', period_end: '' },
});

// ─── toggle de tipo (acima da tabela) ────────────────────────────────────────
const activeTypeFilter = ref('');

function setTypeFilter(tipo) {
  activeTypeFilter.value = tipo;
  filters.value.tipo = tipo;
  applyFilters();
}

// ─── filtros ─────────────────────────────────────────────────────────────────
const filters = ref({
  tipo:         '',
  entity_type:  '',
  categoria:    '',
  status:       '',
  period_start: '',
  period_end:   '',
});

const filterFields = [
  {
    key: 'entity_type', label: 'Entidade', type: 'select',
    options: [
      { value: 'pf', label: 'Pessoa Física (PF)' },
      { value: 'pj', label: 'Pessoa Jurídica (PJ)' },
    ],
  },
  {
    key: 'tipo', label: 'Tipo', type: 'select',
    options: [
      { value: 'receita', label: 'Receita' },
      { value: 'despesa', label: 'Despesa' },
    ],
  },
  { key: 'categoria',    label: 'Categoria',   type: 'text', placeholder: 'Ex.: Salário, Aluguel…' },
  {
    key: 'status', label: 'Status', type: 'select',
    options: [
      { value: 'pendente',  label: 'Pendente' },
      { value: 'pago',      label: 'Pago / Recebido' },
      { value: 'atrasado',  label: 'Atrasado' },
      { value: 'cancelado', label: 'Cancelado' },
    ],
  },
  { key: 'period_start', label: 'Data de', type: 'date' },
  { key: 'period_end',   label: 'Data até', type: 'date' },
];

function applyFilters() {
  activeTypeFilter.value = filters.value.tipo || '';
  r.setFilters({ ...filters.value });
}

function clearFilters() {
  Object.keys(filters.value).forEach((k) => (filters.value[k] = ''));
  activeTypeFilter.value = '';
  r.setFilters({});
}

// ─── colunas da tabela ────────────────────────────────────────────────────────
const columns = [
  { key: 'entity_type', label: 'Entidade',    sortable: true },
  { key: 'tipo',        label: 'Tipo',         sortable: true },
  { key: 'categoria',   label: 'Categoria',    sortable: true },
  { key: 'valor',       label: 'Valor',        sortable: true, align: 'right' },
  { key: 'data',        label: 'Data',         sortable: true },
  { key: 'status',      label: 'Status',       sortable: true },
  { key: 'contraparte', label: 'Contraparte',  sortable: true },
  { key: '_actions',    label: '',             align: 'right' },
];

// ─── estado vazio ─────────────────────────────────────────────────────────────
const emptyState = {
  title:       'Nenhum lançamento encontrado',
  description: 'Registre sua primeira receita ou despesa, ou ajuste os filtros.',
};

// ─── totalizações computadas ──────────────────────────────────────────────────
const totals = computed(() => {
  const rows    = r.items.value;
  const receita = rows
    .filter((x) => x.tipo === 'receita')
    .reduce((acc, x) => acc + Number(x.valor || 0), 0);
  const despesa = rows
    .filter((x) => x.tipo === 'despesa')
    .reduce((acc, x) => acc + Number(x.valor || 0), 0);
  const pendente = rows
    .filter((x) => x.status === 'pendente')
    .reduce((acc, x) => acc + Number(x.valor || 0), 0);
  return { receita, despesa, pendente, saldo: receita - despesa };
});

// ─── navegação ao clicar na linha ────────────────────────────────────────────
function openDetail(row) {
  router.push('/income-expenses/' + row.id + '/edit');
}

// ─── exclusão ────────────────────────────────────────────────────────────────
const deletingId = ref(null);

async function deleteRow(row) {
  const label = row.tipo === 'receita' ? 'receita' : 'despesa';
  const ok = await ask({
    title:        `Excluir ${label}`,
    message:      `Confirma a exclusão do lançamento de ${fmt.formatCurrency(row.valor)}${row.contraparte ? ` (${row.contraparte})` : ''}? Esta ação não pode ser desfeita.`,
    confirmLabel: 'Excluir',
    danger:       true,
  });
  if (!ok) return;

  deletingId.value = row.id;
  try {
    await incomeExpenses.remove(row.id);
    toast.success('Lançamento excluído com sucesso.');
    r.load();
  } catch (e) {
    toast.error(`Erro ao excluir: ${e.message}`);
  } finally {
    deletingId.value = null;
  }
}

// ─── formulário modal ─────────────────────────────────────────────────────────
const showForm = ref(false);
const editing  = ref(null);
const saving   = ref(false);

const emptyFormData = () => ({
  entity_type: '',
  entity_id:   null,
  tipo:        'receita',
  categoria:   '',
  descricao:   '',
  valor:       null,
  data:        '',
  recorrente:  false,
  centro_custo:'',
  contraparte: '',
  status:      'pendente',
});

const form = useForm({
  initial: emptyFormData(),
  rules: {
    entity_type: [validators.required('Selecione o tipo de entidade.')],
    entity_id:   [validators.required('Informe o ID da entidade.'), validators.min(1, 'ID deve ser maior que zero.')],
    valor:       [validators.required('Informe um valor.'), validators.min(0.01, 'Informe um valor maior que zero.')],
    data:        [validators.required('A data é obrigatória.')],
  },
});

// Aliases para o template usar a mesma API que antes
const formData   = form.values;
const formErrors = form.errors;
function setFormField(key, value) { form.setField(key, value); }

function openNew(tipo) {
  editing.value = null;
  form.reset();
  form.values.tipo = tipo || 'receita';
  showForm.value = true;
}

function openEdit(row) {
  editing.value = row.id;
  form.reset();
  Object.assign(form.values, {
    ...emptyFormData(),
    ...row,
    data: row.data?.slice(0, 10) || '',
  });
  showForm.value = true;
}

async function save() {
  if (!form.validate()) return;
  saving.value = true;
  try {
    const payload = { ...form.values };
    if (!payload.categoria)    delete payload.categoria;
    if (!payload.descricao)    delete payload.descricao;
    if (!payload.centro_custo) delete payload.centro_custo;
    if (!payload.contraparte)  delete payload.contraparte;

    if (editing.value) {
      await incomeExpenses.update(editing.value, payload);
      toast.success('Lançamento atualizado com sucesso.');
    } else {
      await incomeExpenses.create(payload);
      toast.success(
        form.values.tipo === 'receita'
          ? 'Receita registrada com sucesso.'
          : 'Despesa registrada com sucesso.'
      );
    }
    showForm.value = false;
    r.load();
  } catch (e) {
    toast.error(`Erro ao salvar: ${e.message}`);
  } finally {
    saving.value = false;
  }
}

// ─── montagem ─────────────────────────────────────────────────────────────────
onMounted(r.load);
</script>

<style scoped>
/* ── botões de topo ────────────────────────────────────────────────── */
.ie-top-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.ie-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-weight: 700;
  font-size: var(--ui-text-sm);
  line-height: 1;
}
.ie-btn-icon--receita {
  background: rgb(var(--ui-ok) / 0.18);
  color: rgb(var(--ui-ok));
}
.ie-btn-icon--despesa {
  background: rgb(var(--ui-danger) / 0.14);
  color: rgb(var(--ui-danger));
}

/* ── métricas ──────────────────────────────────────────────────────── */
.ie-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ui-space-4);
}

/* ── toggle de tipo ────────────────────────────────────────────────── */
.ie-type-toggle {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.ie-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-bg-raised));
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.ie-toggle-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.ie-toggle-btn[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.1);
  color: rgb(var(--ui-accent-strong));
  border-color: rgb(var(--ui-accent) / 0.4);
}
.ie-toggle-btn--receita[data-active="true"] {
  background: rgb(var(--ui-ok) / 0.1);
  color: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok) / 0.35);
}
.ie-toggle-btn--despesa[data-active="true"] {
  background: rgb(var(--ui-danger) / 0.1);
  color: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger) / 0.35);
}
.ie-toggle-btn:not([data-active="true"]):hover {
  background: rgb(var(--ui-bg-elevated));
  color: rgb(var(--ui-fg));
}

/* ── contagem no cabeçalho do card ────────────────────────────────── */
.ie-count {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

/* ── célula de entidade ────────────────────────────────────────────── */
.ie-entity-cell {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.ie-entity-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 7px;
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.ie-entity-badge[data-kind="pj"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}
.ie-entity-id {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

/* ── célula de tipo ────────────────────────────────────────────────── */
.ie-tipo-cell {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.ie-tipo-cell[data-tipo="receita"] {
  color: rgb(var(--ui-ok));
}
.ie-tipo-cell[data-tipo="despesa"] {
  color: rgb(var(--ui-danger));
}
.ie-tipo-arrow {
  font-size: 1em;
  line-height: 1;
}

/* ── célula de valor ───────────────────────────────────────────────── */
.ie-valor-cell {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.ie-valor-cell[data-tipo="receita"] {
  color: rgb(var(--ui-ok));
}
.ie-valor-cell[data-tipo="despesa"] {
  color: rgb(var(--ui-danger));
}

/* ── célula de data ────────────────────────────────────────────────── */
.ie-date-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: rgb(var(--ui-fg));
}

/* ── ações em linha ────────────────────────────────────────────────── */
.ie-row-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}
.ie-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  background: none;
  color: rgb(var(--ui-muted));
}
.ie-action-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}
.ie-action-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.ie-action-btn[data-tone="neutral"]:not(:disabled):hover {
  background: rgb(var(--ui-accent) / 0.08);
  color: rgb(var(--ui-accent-strong));
  border-color: rgb(var(--ui-accent) / 0.3);
}
.ie-action-btn[data-tone="danger"]:not(:disabled):hover {
  background: rgb(var(--ui-danger) / 0.1);
  color: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger) / 0.3);
}

/* ── empty actions ─────────────────────────────────────────────────── */
.ie-empty-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* ── rodapé com totais ─────────────────────────────────────────────── */
.ie-footer-totals {
  display: flex;
  align-items: center;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
}
.ie-footer-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ie-footer-item--total {
  margin-left: auto;
}
.ie-footer-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ie-footer-value {
  font-size: var(--ui-text-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}
.ie-footer-value[data-tone="success"] { color: rgb(var(--ui-ok)); }
.ie-footer-value[data-tone="error"]   { color: rgb(var(--ui-danger)); }
.ie-footer-value[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.ie-footer-value--saldo[data-positive="true"]  { color: rgb(var(--ui-ok)); }
.ie-footer-value--saldo[data-positive="false"] { color: rgb(var(--ui-danger)); }
.ie-footer-sep {
  width: 1px;
  height: 32px;
  background: rgb(var(--ui-border));
  flex-shrink: 0;
}

/* ── formulário modal ──────────────────────────────────────────────── */
.ie-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

/* toggle de tipo dentro do formulário */
.ie-tipo-toggle-form {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding-bottom: var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ie-tipo-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: var(--ui-radius-md);
  border: 2px solid rgb(var(--ui-border));
  background: rgb(var(--ui-bg-raised));
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.ie-tipo-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.ie-tipo-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.ie-tipo-btn[data-active="true"] {
  background: rgb(var(--ui-ok) / 0.1);
  color: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok) / 0.5);
}
.ie-tipo-btn--despesa[data-active="true"] {
  background: rgb(var(--ui-danger) / 0.1);
  color: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger) / 0.5);
}

.ie-checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  cursor: pointer;
}
.ie-checkbox {
  width: 16px;
  height: 16px;
  accent-color: rgb(var(--ui-accent));
  cursor: pointer;
}

.ie-textarea {
  width: 100%;
  min-height: 72px;
  resize: vertical;
  font: inherit;
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 7px 10px;
  box-sizing: border-box;
}
.ie-textarea:focus {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.ie-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
  border-top: 1px solid rgb(var(--ui-border));
}

/* ── responsivo ≤860px ─────────────────────────────────────────────── */
@media (max-width: 860px) {
  .ie-metrics {
    grid-template-columns: 1fr 1fr;
  }
  .ie-row-actions {
    flex-direction: column;
    align-items: flex-end;
    gap: var(--ui-space-1);
  }
  .ie-footer-totals {
    gap: var(--ui-space-3);
  }
  .ie-footer-item--total {
    margin-left: 0;
    width: 100%;
  }
  .ie-top-actions {
    flex-direction: column;
    align-items: stretch;
    gap: var(--ui-space-2);
  }
}
@media (max-width: 480px) {
  .ie-metrics {
    grid-template-columns: 1fr;
  }
  .ie-type-toggle {
    gap: var(--ui-space-1);
  }
  .ie-toggle-btn {
    padding: 5px 12px;
    font-size: var(--ui-text-xs);
  }
}
</style>
