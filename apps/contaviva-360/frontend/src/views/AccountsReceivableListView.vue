<template>
  <UiPageLayout
    title="Contas a Receber"
    eyebrow="Financeiro"
    subtitle="Gerencie seus recebíveis, acompanhe vencimentos e marque como recebido."
    width="wide"
    :error="r.error.value"
    @retry="r.load"
  >
    <template #actions>
      <UiButton variant="primary" @click="openNew">Nova Conta a Receber</UiButton>
    </template>

    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <div class="summary-cards">
      <div class="summary-card" data-tone="warning">
        <span class="summary-label">Pendente</span>
        <span class="summary-value">{{ format.formatCurrency(totals.pendente) }}</span>
        <span class="summary-count">{{ counts.pendente }} lançamento{{ counts.pendente !== 1 ? 's' : '' }}</span>
      </div>
      <div class="summary-card" data-tone="success">
        <span class="summary-label">Recebido</span>
        <span class="summary-value">{{ format.formatCurrency(totals.recebido) }}</span>
        <span class="summary-count">{{ counts.recebido }} lançamento{{ counts.recebido !== 1 ? 's' : '' }}</span>
      </div>
      <div class="summary-card" data-tone="error">
        <span class="summary-label">Vencido</span>
        <span class="summary-value">{{ format.formatCurrency(totals.vencido) }}</span>
        <span class="summary-count">{{ counts.vencido }} lançamento{{ counts.vencido !== 1 ? 's' : '' }}</span>
      </div>
      <div class="summary-card" data-tone="neutral">
        <span class="summary-label">Total Geral</span>
        <span class="summary-value">{{ format.formatCurrency(totals.total) }}</span>
        <span class="summary-count">{{ r.total.value }} lançamento{{ r.total.value !== 1 ? 's' : '' }}</span>
      </div>
    </div>

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
      :empty="{ title: 'Nenhuma conta a receber', description: 'Cadastre o primeiro lançamento de recebível.' }"
      @update:sort="r.setSort"
      @update:page="r.setPage"
    >
      <template #cell-contraparte="{ row, value }">
        <div class="cell-client">
          <span class="cell-client-name">{{ value || '—' }}</span>
          <span v-if="row.recorrente" class="cell-recorrente" role="img" title="Lançamento recorrente" aria-label="Recorrente">↻</span>
        </div>
      </template>

      <template #cell-valor="{ value }">
        <span class="cell-currency">{{ format.formatCurrency(value) }}</span>
      </template>

      <template #cell-data="{ value, row }">
        <span :data-overdue="isOverdue(value, row.status) ? 'true' : null" class="cell-date">
          {{ format.formatDate(value) }}
        </span>
      </template>

      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" with-dot />
      </template>

      <template #cell-_acoes="{ row }">
        <div class="cell-actions">
          <button
            v-if="row.status !== 'recebido' && row.status !== 'cancelado'"
            class="action-btn action-btn--receive"
            :aria-label="'Marcar ' + (row.contraparte || 'lançamento') + ' como recebido'"
            :data-loading="markingId === row.id ? 'true' : null"
            @click.stop="markAsReceived(row)"
          >
            <span aria-hidden="true">✓</span>
            <span class="action-btn-label">Recebido</span>
          </button>
          <button
            class="action-btn action-btn--edit"
            :aria-label="'Editar ' + (row.contraparte || 'lançamento')"
            @click.stop="openEdit(row)"
          >
            <span aria-hidden="true">✎</span>
          </button>
        </div>
      </template>

      <template #empty-action>
        <UiButton variant="primary" @click="openNew">Cadastrar recebível</UiButton>
      </template>
    </UiDataTable>

    <template #footer>
      <div class="footer-totals">
        <div class="footer-total-item">
          <span class="footer-total-label">Pendente:</span>
          <span class="footer-total-value" data-tone="warning">{{ format.formatCurrency(totals.pendente) }}</span>
        </div>
        <div class="footer-total-sep" aria-hidden="true">·</div>
        <div class="footer-total-item">
          <span class="footer-total-label">Recebido:</span>
          <span class="footer-total-value" data-tone="success">{{ format.formatCurrency(totals.recebido) }}</span>
        </div>
        <div class="footer-total-sep" aria-hidden="true">·</div>
        <div class="footer-total-item">
          <span class="footer-total-label">Total:</span>
          <span class="footer-total-value footer-total-value--strong">{{ format.formatCurrency(totals.total) }}</span>
        </div>
      </div>
    </template>
  </UiPageLayout>

  <!-- Modal: Nova / Editar conta a receber -->
  <UiModal
    v-model:open="showForm"
    :title="editing ? 'Editar Conta a Receber' : 'Nova Conta a Receber'"
    width="lg"
  >
    <form id="form-ar" @submit.prevent="save">
      <UiFormSection title="Identificação" :columns="2">
        <UiFormField label="Cliente" :required="true" :error="formErrors.contraparte">
          <template #default="{ id, describedBy }">
            <UiInput
              :id="id"
              :described-by="describedBy"
              :model-value="formValues.contraparte"
              :error="formErrors.contraparte"
              :required="true"
              placeholder="Nome do cliente ou empresa"
              autocomplete="off"
              @update:model-value="setField('contraparte', $event)"
            />
          </template>
        </UiFormField>

        <UiFormField label="Categoria">
          <template #default="{ id }">
            <UiInput
              :id="id"
              :model-value="formValues.categoria"
              placeholder="Serviços, Produtos, Honorários…"
              autocomplete="off"
              @update:model-value="setField('categoria', $event)"
            />
          </template>
        </UiFormField>
      </UiFormSection>

      <UiFormSection title="Valores e Datas" :columns="2">
        <UiFormField label="Valor" :required="true" :error="formErrors.valor">
          <template #default="{ id, describedBy }">
            <UiInput
              :id="id"
              :described-by="describedBy"
              :model-value="formValues.valor"
              :error="formErrors.valor"
              :required="true"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              @update:model-value="setField('valor', $event ? Number($event) : '')"
            />
          </template>
        </UiFormField>

        <UiFormField label="Data de Vencimento" :required="true" :error="formErrors.data">
          <template #default="{ id, describedBy }">
            <UiInput
              :id="id"
              :described-by="describedBy"
              :model-value="formValues.data"
              :error="formErrors.data"
              :required="true"
              type="date"
              @update:model-value="setField('data', $event)"
            />
          </template>
        </UiFormField>
      </UiFormSection>

      <UiFormSection title="Detalhes" :columns="2">
        <UiFormField label="Forma de Recebimento">
          <template #default="{ id }">
            <select :id="id" class="ui-select" :value="formValues.forma_recebimento" @change="setField('forma_recebimento', $event.target.value)">
              <option value="">Selecione…</option>
              <option value="pix">Pix</option>
              <option value="ted">TED</option>
              <option value="boleto">Boleto</option>
              <option value="cartao">Cartão</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cheque">Cheque</option>
            </select>
          </template>
        </UiFormField>

        <UiFormField label="Status">
          <template #default="{ id }">
            <select :id="id" class="ui-select" :value="formValues.status" @change="setField('status', $event.target.value)">
              <option value="pendente">Pendente</option>
              <option value="recebido">Recebido</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </template>
        </UiFormField>

        <UiFormField label="Recorrente">
          <template #default="{ id }">
            <label :for="id" class="checkbox-label">
              <input
                :id="id"
                type="checkbox"
                :checked="formValues.recorrente"
                @change="setField('recorrente', $event.target.checked)"
              />
              Lançamento recorrente
            </label>
          </template>
        </UiFormField>
      </UiFormSection>

      <UiFormSection title="Observações" :columns="1">
        <UiFormField label="Descrição">
          <template #default="{ id }">
            <UiTextarea
              :id="id"
              :model-value="formValues.descricao"
              :rows="3"
              placeholder="Detalhes adicionais sobre este recebível…"
              @update:model-value="setField('descricao', $event)"
            />
          </template>
        </UiFormField>
      </UiFormSection>
    </form>

    <template #footer>
      <div class="modal-footer">
        <UiButton variant="ghost" @click="showForm = false">Cancelar</UiButton>
        <UiButton variant="primary" type="submit" form="form-ar" :loading="submitting">
          {{ editing ? 'Salvar alterações' : 'Cadastrar' }}
        </UiButton>
      </div>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
  UiStatusBadge,
  UiModal,
  UiFormField,
  UiFormSection,
  UiInput,
  UiTextarea,
  useResource,
  useToast,
  useConfirm,
  useForm,
  format,
} from '../ui/index.js';
import { accountsReceivable } from '../api.js';

// ── recursos ──────────────────────────────────────────────────────────────────
const toast = useToast();
const ask = useConfirm();

const r = useResource(accountsReceivable, {
  filters: { status: '', categoria: '', contraparte: '', period_start: '', period_end: '' },
  pageSize: 25,
});

// ── filtros ──────────────────────────────────────────────────────────────────
const filters = ref({
  status: '',
  categoria: '',
  contraparte: '',
  period_start: '',
  period_end: '',
});

const filterFields = [
  { key: 'contraparte', label: 'Cliente', type: 'text', placeholder: 'Nome do cliente…' },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'pendente', label: 'Pendente' },
      { value: 'recebido', label: 'Recebido' },
      { value: 'vencido', label: 'Vencido' },
      { value: 'cancelado', label: 'Cancelado' },
    ],
  },
  { key: 'categoria', label: 'Categoria', type: 'text', placeholder: 'Serviços, Produtos…' },
  { key: 'period_start', label: 'Vencimento de', type: 'date' },
  { key: 'period_end', label: 'Vencimento até', type: 'date' },
];

function applyFilters() {
  r.setFilters({ ...filters.value });
}

function clearFilters() {
  filters.value = { status: '', categoria: '', contraparte: '', period_start: '', period_end: '' };
  r.setFilters({ ...filters.value });
}

// ── colunas ──────────────────────────────────────────────────────────────────
const columns = [
  { key: 'contraparte', label: 'Cliente', sortable: true },
  { key: 'valor', label: 'Valor', align: 'right', sortable: true },
  { key: 'data', label: 'Vencimento', sortable: true },
  { key: 'categoria', label: 'Categoria' },
  { key: 'forma_recebimento', label: 'Forma de Recebimento' },
  { key: 'status', label: 'Status' },
  { key: '_acoes', label: 'Ações', align: 'right' },
];

// ── totalização ──────────────────────────────────────────────────────────────
const totals = computed(() => {
  const items = r.items.value;
  let pendente = 0, recebido = 0, vencido = 0, total = 0;
  for (const item of items) {
    const v = Number(item.valor) || 0;
    total += v;
    if (item.status === 'pendente') pendente += v;
    else if (item.status === 'recebido') recebido += v;
    else if (item.status === 'vencido') vencido += v;
  }
  return { pendente, recebido, vencido, total };
});

const counts = computed(() => {
  const items = r.items.value;
  let pendente = 0, recebido = 0, vencido = 0;
  for (const item of items) {
    if (item.status === 'pendente') pendente++;
    else if (item.status === 'recebido') recebido++;
    else if (item.status === 'vencido') vencido++;
  }
  return { pendente, recebido, vencido };
});

// ── helpers ──────────────────────────────────────────────────────────────────
function isOverdue(dateVal, status) {
  if (status !== 'pendente') return false;
  const d = dateVal ? new Date(dateVal) : null;
  return d && d < new Date();
}

// ── marcar como recebido (ação em linha) ──────────────────────────────────────
const markingId = ref(null);

async function markAsReceived(row) {
  const ok = await ask({
    title: 'Marcar como recebido',
    message: `Confirma que o lançamento de ${format.formatCurrency(row.valor)} de "${row.contraparte || 'cliente'}" foi recebido?`,
    confirmLabel: 'Sim, marcar como recebido',
  });
  if (!ok) return;

  markingId.value = row.id;
  try {
    await accountsReceivable.update(row.id, { ...row, status: 'recebido' });
    toast.success('Lançamento marcado como recebido.');
    r.load();
  } catch (e) {
    toast.error('Erro ao atualizar: ' + (e.message || 'tente novamente'));
  } finally {
    markingId.value = null;
  }
}

// ── formulário ───────────────────────────────────────────────────────────────
const showForm = ref(false);
const editing = ref(null);

const emptyFormValues = () => ({
  contraparte: '',
  categoria: '',
  valor: '',
  data: '',
  forma_recebimento: '',
  recorrente: false,
  status: 'pendente',
  descricao: '',
});

const { values: formValues, errors: formErrors, submitting, setField, handleSubmit, reset } = useForm({
  initial: emptyFormValues(),
  rules: {
    contraparte: (v) => (!v || !String(v).trim() ? 'Cliente é obrigatório' : null),
    valor: (v) => (!v && v !== 0 ? 'Valor é obrigatório' : Number(v) <= 0 ? 'Valor deve ser maior que zero' : null),
    data: (v) => (!v ? 'Data de vencimento é obrigatória' : null),
  },
});

function openNew() {
  editing.value = null;
  reset(emptyFormValues());
  showForm.value = true;
}

function openEdit(row) {
  editing.value = row.id;
  reset({
    contraparte: row.contraparte || '',
    categoria: row.categoria || '',
    valor: row.valor ?? '',
    data: row.data ? String(row.data).slice(0, 10) : '',
    forma_recebimento: row.forma_recebimento || '',
    recorrente: !!row.recorrente,
    status: row.status || 'pendente',
    descricao: row.descricao || '',
  });
  showForm.value = true;
}

const save = handleSubmit(async (values) => {
  const payload = {
    contraparte: values.contraparte,
    categoria: values.categoria || undefined,
    valor: Number(values.valor),
    data: values.data,
    forma_recebimento: values.forma_recebimento || undefined,
    recorrente: !!values.recorrente,
    status: values.status || 'pendente',
    descricao: values.descricao || undefined,
  };

  if (editing.value) {
    await accountsReceivable.update(editing.value, payload);
    toast.success('Conta a receber atualizada com sucesso.');
  } else {
    await accountsReceivable.create(payload);
    toast.success('Conta a receber cadastrada com sucesso.');
  }

  showForm.value = false;
  r.load();
});

onMounted(r.load);
</script>

<style scoped>
/* ── Cards de resumo ──────────────────────────────────────────────────── */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-3);
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  padding: var(--ui-space-4);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  position: relative;
  overflow: hidden;
}

.summary-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}

.summary-card[data-tone="warning"]::before { background: rgb(var(--ui-warn)); }
.summary-card[data-tone="success"]::before { background: rgb(var(--ui-ok)); }
.summary-card[data-tone="error"]::before   { background: rgb(var(--ui-danger)); }
.summary-card[data-tone="neutral"]::before { background: rgb(var(--ui-muted)); }

.summary-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: rgb(var(--ui-muted));
}

.summary-value {
  font-size: var(--ui-text-xl);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  line-height: 1.2;
}

.summary-card[data-tone="warning"] .summary-value { color: rgb(var(--ui-warn)); }
.summary-card[data-tone="success"] .summary-value { color: rgb(var(--ui-ok)); }
.summary-card[data-tone="error"]   .summary-value { color: rgb(var(--ui-danger)); }

.summary-count {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── Células customizadas ─────────────────────────────────────────────── */
.cell-client {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.cell-client-name {
  font-weight: 500;
}

.cell-recorrente {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.12);
  border-radius: var(--ui-radius-pill);
  padding: 1px 6px;
  font-weight: 700;
}

.cell-currency {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.cell-date {
  font-variant-numeric: tabular-nums;
}

.cell-date[data-overdue="true"] {
  color: rgb(var(--ui-danger));
  font-weight: 600;
}

/* ── Botões de ação em linha ──────────────────────────────────────────── */
.cell-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: var(--ui-space-1) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background var(--ui-transition-fast, 0.15s), color var(--ui-transition-fast, 0.15s);
  white-space: nowrap;
}

.action-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.action-btn[data-loading="true"] {
  opacity: 0.65;
  pointer-events: none;
}

.action-btn--receive {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok) / 0.25);
}

.action-btn--receive:hover {
  background: rgb(var(--ui-ok) / 0.2);
}

.action-btn--edit {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  border-color: rgb(var(--ui-border));
  padding: var(--ui-space-1) var(--ui-space-2);
}

.action-btn--edit:hover {
  background: rgb(var(--ui-border));
  color: rgb(var(--ui-fg));
}

.action-btn-label {
  display: inline;
}

/* ── Footer de totais ─────────────────────────────────────────────────── */
.footer-totals {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding: var(--ui-space-3) 0;
}

.footer-total-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.footer-total-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.footer-total-value {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.footer-total-value[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.footer-total-value[data-tone="success"] { color: rgb(var(--ui-ok)); }
.footer-total-value--strong {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-lg);
}

.footer-total-sep {
  color: rgb(var(--ui-border-strong));
  user-select: none;
}

/* ── Modal ────────────────────────────────────────────────────────────── */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}

/* ── Select nativo estilizado com tokens (sem UiSelect no kit) ─────────── */
.ui-select {
  display: block;
  width: 100%;
  box-sizing: border-box;
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  cursor: pointer;
  transition: border-color var(--ui-transition-fast, 0.15s) ease, box-shadow var(--ui-transition-fast, 0.15s) ease;
}

.ui-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.ui-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: rgb(var(--ui-surface-2));
}

/* ── Controles de formulário: checkbox ───────────────────────────────── */
.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  cursor: pointer;
  padding: var(--ui-space-2) 0;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: rgb(var(--ui-accent));
  cursor: pointer;
}

/* ── Responsividade ───────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .summary-cards {
    grid-template-columns: 1fr 1fr;
  }

  .action-btn-label {
    display: none;
  }

  .footer-totals {
    gap: var(--ui-space-3);
  }
}

@media (max-width: 540px) {
  .summary-cards {
    grid-template-columns: 1fr;
  }

  .footer-totals {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-space-2);
  }

  .footer-total-sep {
    display: none;
  }
}
</style>
