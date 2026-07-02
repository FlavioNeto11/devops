<template>
  <UiPageLayout
    title="Contas a Pagar"
    eyebrow="Financeiro"
    subtitle="Gerencie despesas, vencimentos e pagamentos por fornecedor."
    width="wide"
    :error="r.error.value ? (r.error.value.message || 'Erro ao carregar contas a pagar') : null"
    @retry="r.load"
  >
    <template #actions>
      <UiButton variant="primary" @click="openNew">Nova Conta a Pagar</UiButton>
    </template>

    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- Métricas de topo -->
    <div class="ap-metrics">
      <UiMetricCard
        label="Total a Pagar"
        :value="fmt.formatCurrency(totals.pendente + totals.vencido)"
        tone="warning"
        hint="Pendente + Vencido"
      />
      <UiMetricCard
        label="Vencido"
        :value="fmt.formatCurrency(totals.vencido)"
        tone="error"
        hint="Requer atenção imediata"
      />
      <UiMetricCard
        label="Pago no período"
        :value="fmt.formatCurrency(totals.pago)"
        tone="success"
        hint="Liquidados"
      />
      <UiMetricCard
        label="Total de lançamentos"
        :value="String(r.total.value)"
        tone="neutral"
        hint="Resultado atual dos filtros"
      />
    </div>

    <!-- Tabela principal -->
    <UiCard title="Lançamentos" :padded="false">
      <template #actions>
        <span class="ap-count" aria-live="polite">
          {{ r.total.value }} {{ r.total.value === 1 ? 'conta' : 'contas' }}{{ hasActiveFilters ? ' (filtradas)' : ' encontradas' }}
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
        :empty="emptyState"
        @update:sort="r.setSort"
        @update:page="r.setPage"
      >
        <!-- Status com badge -->
        <template #cell-status="{ value, row }">
          <UiStatusBadge :status="value" with-dot />
        </template>

        <!-- Valor formatado com destaque para vencidos -->
        <template #cell-valor="{ value, row }">
          <span
            class="ap-valor"
            :data-overdue="isOverdue(row)"
          >
            {{ fmt.formatCurrency(value) }}
          </span>
        </template>

        <!-- Vencimento com alerta visual -->
        <template #cell-data="{ value, row }">
          <span
            class="ap-due"
            :data-overdue="isOverdue(row)"
            :data-near="isNearDue(row)"
          >
            {{ fmt.formatDate(value) }}
            <span v-if="isOverdue(row)" class="ap-due-badge" aria-label="Vencida">atrasada</span>
            <span v-else-if="isNearDue(row)" class="ap-due-badge" data-warn aria-label="Vence em breve">vence hoje</span>
          </span>
        </template>

        <!-- Ações em linha -->
        <template #cell-_actions="{ row }">
          <div class="ap-row-actions">
            <button
              v-if="row.status !== 'pago' && row.status !== 'cancelado'"
              class="ap-action-btn"
              data-tone="success"
              :aria-label="'Marcar como pago: ' + row.contraparte"
              :disabled="markingPaid === row.id"
              @click.stop="markAsPaid(row)"
            >
              <span aria-hidden="true">✓</span>
              {{ markingPaid === row.id ? 'Salvando…' : 'Marcar pago' }}
            </button>
            <button
              class="ap-action-btn"
              data-tone="neutral"
              :aria-label="'Editar: ' + row.contraparte"
              @click.stop="openEdit(row)"
            >
              <span aria-hidden="true">✎</span>
              Editar
            </button>
          </div>
        </template>

        <template #empty-action>
          <UiButton variant="primary" @click="openNew">Cadastrar primeira despesa</UiButton>
        </template>
      </UiDataTable>

      <!-- Rodapé com totalizações -->
      <template #footer>
        <div class="ap-footer-totals" aria-label="Totalizações da página">
          <div class="ap-footer-item">
            <span class="ap-footer-label">Pendente</span>
            <span class="ap-footer-value" data-tone="warning">{{ fmt.formatCurrency(totals.pendente) }}</span>
          </div>
          <div class="ap-footer-sep" aria-hidden="true" />
          <div class="ap-footer-item">
            <span class="ap-footer-label">Vencido</span>
            <span class="ap-footer-value" data-tone="error">{{ fmt.formatCurrency(totals.vencido) }}</span>
          </div>
          <div class="ap-footer-sep" aria-hidden="true" />
          <div class="ap-footer-item">
            <span class="ap-footer-label">Pago</span>
            <span class="ap-footer-value" data-tone="success">{{ fmt.formatCurrency(totals.pago) }}</span>
          </div>
          <div class="ap-footer-sep" aria-hidden="true" />
          <div class="ap-footer-item ap-footer-item--total">
            <span class="ap-footer-label">Total</span>
            <span class="ap-footer-value">{{ fmt.formatCurrency(totals.total) }}</span>
          </div>
        </div>
      </template>
    </UiCard>

    <!-- Modal: Nova / Editar conta -->
    <UiModal
      :open="showForm"
      :title="editing ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'"
      width="lg"
      @update:open="showForm = $event"
      @close="showForm = false"
    >
      <form class="ap-form" @submit.prevent="save">
        <UiFormSection title="Fornecedor e valores" :columns="2">
          <UiFormField label="Fornecedor" :required="true" :error="form.errors.contraparte">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="form.values.contraparte"
                placeholder="Nome do fornecedor ou empresa"
                autocomplete="organization"
                class="ap-first-field"
                @input="form.setField('contraparte', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Categoria" :error="form.errors.categoria">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="form.values.categoria"
                placeholder="Aluguel, Folha, Energia, Fornecedor…"
                @input="form.setField('categoria', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Valor" :required="true" :error="form.errors.valor">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                step="0.01"
                min="0"
                :value="form.values.valor"
                placeholder="0,00"
                @input="form.setField('valor', parseFloat($event.target.value) || null)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Data de Vencimento" :required="true" :error="form.errors.data">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="date"
                :value="form.values.data"
                @input="form.setField('data', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Centro de Custo">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="form.values.centro_custo"
                placeholder="Centro de custo ou departamento"
                @input="form.setField('centro_custo', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Forma de Pagamento">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="form.values.forma_pagamento"
                @change="form.setField('forma_pagamento', $event.target.value)"
              >
                <option value="">Selecione…</option>
                <option value="cheque">Cheque</option>
                <option value="TED">TED</option>
                <option value="cartão">Cartão</option>
                <option value="boleto">Boleto</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Recorrência e status" :columns="2">
          <UiFormField label="Recorrência">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="form.values.recorrencia_tipo"
                @change="form.setField('recorrencia_tipo', $event.target.value)"
              >
                <option value="">Não recorrente</option>
                <option value="mensal">Mensal</option>
                <option value="bimestral">Bimestral</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Status">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="form.values.status"
                @change="form.setField('status', $event.target.value)"
              >
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Descrição">
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :value="form.values.descricao"
                placeholder="Detalhes ou observações sobre este lançamento"
                rows="3"
                class="ap-textarea"
                @input="form.setField('descricao', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <div class="ap-form-actions">
          <UiButton variant="ghost" type="button" @click="showForm = false">Cancelar</UiButton>
          <UiButton variant="primary" type="submit" :loading="saving">
            {{ editing ? 'Salvar alterações' : 'Cadastrar conta' }}
          </UiButton>
        </div>
      </form>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
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
import { accountsPayable } from '../api.js';

// ─── dados e estado ──────────────────────────────────────────────────────────
const toast    = useToast();
const ask      = useConfirm();

const r = useResource(accountsPayable, {
  filters: { status: '', categoria: '', fornecedor: '', centro_custo: '', period_start: '', period_end: '' },
});

// ─── filtros ─────────────────────────────────────────────────────────────────
const filters = ref({
  status:       '',
  categoria:    '',
  fornecedor:   '',
  centro_custo: '',
  period_start: '',
  period_end:   '',
});

const filterFields = [
  {
    key: 'status', label: 'Status', type: 'select',
    options: [
      { value: 'pendente',  label: 'Pendente' },
      { value: 'pago',      label: 'Pago' },
      { value: 'vencido',   label: 'Vencido' },
      { value: 'cancelado', label: 'Cancelado' },
    ],
  },
  { key: 'fornecedor',   label: 'Fornecedor',     type: 'text', placeholder: 'Nome do fornecedor' },
  { key: 'categoria',    label: 'Categoria',       type: 'text', placeholder: 'Ex.: Aluguel, Energia' },
  { key: 'centro_custo', label: 'Centro de Custo', type: 'text', placeholder: 'Centro de custo' },
  { key: 'period_start', label: 'Vencimento de',   type: 'date' },
  { key: 'period_end',   label: 'Vencimento até',  type: 'date' },
];

const hasActiveFilters = computed(() => Object.values(filters.value).some((v) => v !== ''));

function applyFilters() { r.setFilters({ ...filters.value }); }
function clearFilters()  { Object.keys(filters.value).forEach((k) => (filters.value[k] = '')); r.setFilters({}); }

// ─── colunas ─────────────────────────────────────────────────────────────────
const columns = [
  { key: 'contraparte',    label: 'Fornecedor',      sortable: true },
  { key: 'valor',          label: 'Valor',            sortable: true, align: 'right' },
  { key: 'data',           label: 'Vencimento',       sortable: true, format: 'date' },
  { key: 'categoria',      label: 'Categoria',        sortable: true },
  { key: 'centro_custo',   label: 'Centro de Custo' },
  { key: 'forma_pagamento',label: 'Forma Pgto.' },
  { key: 'status',         label: 'Status',           sortable: true },
  { key: '_actions',       label: '',                 align: 'right' },
];

// ─── estado vazio ─────────────────────────────────────────────────────────────
const emptyState = {
  title:       'Nenhuma conta a pagar',
  description: 'Cadastre sua primeira despesa ou ajuste os filtros aplicados.',
};

// ─── totalizações do rodapé ───────────────────────────────────────────────────
const totals = computed(() => {
  const rows = r.items.value;
  const sum  = (status) => rows.filter((x) => x.status === status).reduce((acc, x) => acc + Number(x.valor || 0), 0);
  const pendente = sum('pendente');
  const vencido  = sum('vencido');
  const pago     = sum('pago');
  return { pendente, vencido, pago, total: pendente + vencido + pago + sum('cancelado') };
});

// ─── helpers de data ──────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function isOverdue(row) {
  if (!row.data || row.status === 'pago' || row.status === 'cancelado') return false;
  return row.data.slice(0, 10) < todayStr();
}

function isNearDue(row) {
  if (!row.data || row.status === 'pago' || row.status === 'cancelado') return false;
  return row.data.slice(0, 10) === todayStr();
}

// ─── ação em linha: marcar como pago ─────────────────────────────────────────
const markingPaid = ref(null);

async function markAsPaid(row) {
  const ok = await ask({
    title:        'Marcar como Pago',
    message:      `Confirma o pagamento de ${fmt.formatCurrency(row.valor)} para "${row.contraparte}"?`,
    confirmLabel: 'Marcar como Pago',
    danger:       false,
  });
  if (!ok) return;

  markingPaid.value = row.id;
  try {
    await accountsPayable.update(row.id, { ...row, status: 'pago' });
    toast.success(`Conta de ${row.contraparte} marcada como paga.`);
    r.load();
  } catch (e) {
    toast.error(`Erro ao atualizar: ${e.message}`);
  } finally {
    markingPaid.value = null;
  }
}

// ─── formulário ──────────────────────────────────────────────────────────────
const showForm = ref(false);
const editing  = ref(null);
const saving   = ref(false);

const formInitial = {
  contraparte:     '',
  categoria:       '',
  valor:           null,
  data:            '',
  centro_custo:    '',
  forma_pagamento: '',
  recorrente:      false,
  recorrencia_tipo:'',
  status:          'pendente',
  descricao:       '',
};

const form = useForm({
  initial: { ...formInitial },
  rules: {
    contraparte: [validators.required('Fornecedor é obrigatório.')],
    valor:       [validators.required('Informe um valor maior que zero.'), validators.min(0.01, 'Informe um valor maior que zero.')],
    data:        [validators.required('A data de vencimento é obrigatória.')],
  },
});

function openNew() {
  editing.value = null;
  form.reset();
  showForm.value = true;
  nextTick(() => document.querySelector('.ap-first-field')?.focus());
}

function openEdit(row) {
  editing.value = row.id;
  form.reset();
  const rowData = { ...formInitial, ...row, data: row.data?.slice(0, 10) || '' };
  for (const [k, v] of Object.entries(rowData)) {
    form.values[k] = v;
  }
  showForm.value = true;
  nextTick(() => document.querySelector('.ap-first-field')?.focus());
}

async function save() {
  if (!form.validate()) return;
  saving.value = true;
  try {
    const payload = { ...form.values };
    if (!payload.recorrencia_tipo) delete payload.recorrencia_tipo;
    if (!payload.forma_pagamento)  delete payload.forma_pagamento;
    if (!payload.centro_custo)     delete payload.centro_custo;

    if (editing.value) {
      await accountsPayable.update(editing.value, payload);
      toast.success('Conta atualizada com sucesso.');
    } else {
      await accountsPayable.create(payload);
      toast.success('Conta cadastrada com sucesso.');
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
/* ── métricas ─────────────────────────────────────────────────────── */
.ap-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--ui-metric-card-min, 14rem), 1fr));
  gap: var(--ui-space-4);
}

/* ── contagem no cabeçalho do card ───────────────────────────────── */
.ap-count {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

/* ── células de valor ────────────────────────────────────────────── */
.ap-valor {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.ap-valor[data-overdue="true"] {
  color: rgb(var(--ui-danger));
}

/* ── células de vencimento ───────────────────────────────────────── */
.ap-due {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-variant-numeric: tabular-nums;
}
.ap-due[data-overdue="true"] {
  color: rgb(var(--ui-danger));
  font-weight: 600;
}
.ap-due[data-near="true"] {
  color: rgb(var(--ui-warn));
  font-weight: 600;
}
.ap-due-badge {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-danger) / 0.14);
  color: rgb(var(--ui-danger));
  white-space: nowrap;
}
.ap-due-badge[data-warn] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}

/* ── ações em linha ──────────────────────────────────────────────── */
.ap-row-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}
.ap-action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: var(--ui-space-1) var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
  background: none;
  color: rgb(var(--ui-muted));
  border-color: rgb(var(--ui-border));
}
.ap-action-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}
.ap-action-btn[data-tone="success"]:not(:disabled):hover {
  background: rgb(var(--ui-ok) / 0.14);
  color: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok) / 0.35);
}
.ap-action-btn[data-tone="neutral"]:not(:disabled):hover {
  background: rgb(var(--ui-accent) / 0.08);
  color: rgb(var(--ui-accent-strong));
  border-color: rgb(var(--ui-accent) / 0.3);
}
.ap-action-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* ── rodapé com totais ───────────────────────────────────────────── */
.ap-footer-totals {
  display: flex;
  align-items: center;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
}
.ap-footer-item {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.ap-footer-item--total {
  margin-left: auto;
}
.ap-footer-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ap-footer-value {
  font-size: var(--ui-text-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}
.ap-footer-value[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.ap-footer-value[data-tone="error"]   { color: rgb(var(--ui-danger)); }
.ap-footer-value[data-tone="success"] { color: rgb(var(--ui-ok)); }
.ap-footer-sep {
  width: 1px;
  height: var(--ui-space-8, 2rem);
  background: rgb(var(--ui-border));
  flex-shrink: 0;
}

/* ── formulário modal ────────────────────────────────────────────── */
.ap-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.ap-textarea {
  width: 100%;
  min-height: var(--ui-space-18, 4.5rem);
  resize: vertical;
  font: inherit;
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  box-sizing: border-box;
}
.ap-textarea:focus {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.ap-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
  border-top: 1px solid rgb(var(--ui-border));
}

/* ── responsivo ≤860px ───────────────────────────────────────────── */
@media (max-width: 860px) {
  .ap-metrics {
    grid-template-columns: 1fr 1fr;
  }
  .ap-row-actions {
    flex-direction: column;
    align-items: flex-end;
    gap: var(--ui-space-1);
  }
  .ap-footer-totals {
    gap: var(--ui-space-3);
  }
  .ap-footer-item--total {
    margin-left: 0;
  }
}
@media (max-width: 480px) {
  .ap-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
