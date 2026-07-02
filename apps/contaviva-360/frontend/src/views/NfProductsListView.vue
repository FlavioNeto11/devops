<template>
  <UiPageLayout
    title="Produtos / Serviços NF"
    eyebrow="Nota Fiscal"
    subtitle="Catálogo de produtos e serviços para emissão de NF com configuração tributária completa."
    width="wide"
    :error="r.error.value ? (r.error.value.message || 'Erro ao carregar produtos') : null"
    @retry="r.load"
  >
    <template #actions>
      <UiButton variant="ghost" :to="null" @click="exportarCsv" aria-label="Exportar catálogo em CSV">
        Exportar CSV
      </UiButton>
      <UiButton variant="primary" @click="openNew" aria-label="Cadastrar novo produto ou serviço">
        Novo Produto
      </UiButton>
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
    <div class="nfp-metrics">
      <UiMetricCard
        label="Total de Itens"
        :value="String(r.total.value)"
        tone="neutral"
        hint="Produtos e serviços cadastrados"
      />
      <UiMetricCard
        label="Valor Médio"
        :value="fmtCurrency(avgValor)"
        tone="info"
        hint="Valor unitário médio do catálogo"
      />
      <UiMetricCard
        label="Com NCM / NBS"
        :value="String(countWithNcm)"
        tone="success"
        hint="Itens com classificação fiscal"
      />
      <UiMetricCard
        label="Sem CFOP"
        :value="String(countSemCfop)"
        :tone="countSemCfop > 0 ? 'warning' : 'neutral'"
        :hint="countSemCfop > 0 ? 'Requerem configuração de CFOP' : 'Todos configurados'"
      />
    </div>

    <!-- Tabela principal -->
    <UiCard title="Catálogo" :padded="false">
      <template #actions>
        <span class="nfp-count" aria-live="polite">
          {{ r.total.value }} {{ r.total.value === 1 ? 'item' : 'itens' }}
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
        @row-click="openEdit"
      >
        <!-- Código -->
        <template #cell-codigo="{ value }">
          <span class="nfp-code">{{ value || '—' }}</span>
        </template>

        <!-- Descrição -->
        <template #cell-descricao="{ value }">
          <span class="nfp-desc">{{ value }}</span>
        </template>

        <!-- Valor unitário -->
        <template #cell-valor_unitario="{ value }">
          <span class="nfp-valor">{{ fmtCurrency(value) }}</span>
        </template>

        <!-- CFOP com destaque se ausente -->
        <template #cell-cfop="{ value }">
          <span class="nfp-cfop" :data-missing="!value">{{ value || 'Não definido' }}</span>
        </template>

        <!-- Coluna de alíquotas agrupadas -->
        <template #cell-_aliquotas="{ row }">
          <div class="nfp-aliq-group" aria-label="Alíquotas tributárias">
            <span
              v-if="row.aliquota_icms != null && row.aliquota_icms !== ''"
              class="nfp-aliq-pill"
              data-tributo="icms"
              :title="'ICMS: ' + row.aliquota_icms + '%'"
            >
              ICMS {{ fmtAliq(row.aliquota_icms) }}
            </span>
            <span
              v-if="row.aliquota_iss != null && row.aliquota_iss !== ''"
              class="nfp-aliq-pill"
              data-tributo="iss"
              :title="'ISS: ' + row.aliquota_iss + '%'"
            >
              ISS {{ fmtAliq(row.aliquota_iss) }}
            </span>
            <span
              v-if="row.aliquota_pis != null && row.aliquota_pis !== ''"
              class="nfp-aliq-pill"
              data-tributo="pis"
              :title="'PIS: ' + row.aliquota_pis + '%'"
            >
              PIS {{ fmtAliq(row.aliquota_pis) }}
            </span>
            <span
              v-if="row.aliquota_cofins != null && row.aliquota_cofins !== ''"
              class="nfp-aliq-pill"
              data-tributo="cofins"
              :title="'COFINS: ' + row.aliquota_cofins + '%'"
            >
              COF {{ fmtAliq(row.aliquota_cofins) }}
            </span>
            <span
              v-if="!hasAnyAliq(row)"
              class="nfp-aliq-empty"
              aria-label="Sem alíquotas configuradas"
            >
              —
            </span>
          </div>
        </template>

        <!-- NCM / NBS -->
        <template #cell-ncm_nbs="{ value }">
          <span class="nfp-ncm" :data-missing="!value">{{ value || '—' }}</span>
        </template>

        <!-- Ações inline -->
        <template #cell-_actions="{ row }">
          <div class="nfp-row-actions">
            <button
              class="nfp-action-btn"
              data-tone="neutral"
              :aria-label="'Editar produto: ' + row.descricao"
              @click.stop="openEdit(row)"
            >
              <span aria-hidden="true">✎</span>
              Editar
            </button>
            <button
              class="nfp-action-btn"
              data-tone="danger"
              :aria-label="'Excluir produto: ' + row.descricao"
              :data-loading="deletingId === row.id"
              :disabled="deletingId === row.id"
              @click.stop="confirmDelete(row)"
            >
              <span aria-hidden="true">✕</span>
              {{ deletingId === row.id ? 'Excluindo…' : 'Excluir' }}
            </button>
          </div>
        </template>

        <!-- Estado vazio com CTA -->
        <template #empty-action>
          <UiButton variant="primary" @click="openNew">
            Cadastrar primeiro produto
          </UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Modal de Criação / Edição -->
    <UiModal
      :open="showForm"
      :title="editing ? 'Editar Produto / Serviço' : 'Novo Produto / Serviço'"
      width="lg"
      @update:open="showForm = $event"
      @close="closeForm"
    >
      <form class="nfp-form" @submit.prevent="save">
        <!-- Identificação -->
        <UiFormSection title="Identificação" description="Código interno, descrição e valor de referência." :columns="2">
          <UiFormField label="Código" hint="Código interno do produto (SKU, código de barras, etc.)">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.codigo"
                placeholder="Ex.: PROD-001"
                autocomplete="off"
                @input="f.setField('codigo', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Descrição" :required="true" :error="f.errors.descricao">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.descricao"
                placeholder="Nome completo do produto ou serviço"
                autocomplete="off"
                @input="f.setField('descricao', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Valor Unitário (R$)" :required="true" :error="f.errors.valor_unitario">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                step="0.01"
                min="0"
                :value="f.values.valor_unitario"
                placeholder="0,00"
                @input="f.setField('valor_unitario', parseFloat($event.target.value) || null)"
              />
            </template>
          </UiFormField>

          <UiFormField label="CFOP" hint="Código Fiscal de Operações e Prestações" :error="f.errors.cfop">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.cfop"
                placeholder="Ex.: 5102"
                maxlength="5"
                autocomplete="off"
                @input="f.setField('cfop', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="NCM / NBS" hint="Nomenclatura Comum do Mercosul ou Nomenclatura Brasileira de Serviços" :error="f.errors.ncm_nbs">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.ncm_nbs"
                placeholder="Ex.: 8471.30.19 ou 1.01.01.00"
                autocomplete="off"
                @input="f.setField('ncm_nbs', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Tributação -->
        <UiFormSection
          title="Alíquotas Tributárias"
          description="Percentuais aplicáveis à emissão de NF. Deixe em branco quando não aplicável."
          :columns="2"
        >
          <UiFormField label="Alíquota ICMS (%)" hint="Imposto sobre Circulação de Mercadorias e Serviços">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                step="0.01"
                min="0"
                max="100"
                :value="f.values.aliquota_icms"
                placeholder="0,00"
                @input="f.setField('aliquota_icms', parseFloat($event.target.value) ?? null)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Alíquota ISS (%)" hint="Imposto Sobre Serviços de Qualquer Natureza">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                step="0.01"
                min="0"
                max="100"
                :value="f.values.aliquota_iss"
                placeholder="0,00"
                @input="f.setField('aliquota_iss', parseFloat($event.target.value) ?? null)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Alíquota PIS (%)" hint="Programa de Integração Social">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                step="0.01"
                min="0"
                max="100"
                :value="f.values.aliquota_pis"
                placeholder="0,00"
                @input="f.setField('aliquota_pis', parseFloat($event.target.value) ?? null)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Alíquota COFINS (%)" hint="Contribuição para o Financiamento da Seguridade Social">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                step="0.01"
                min="0"
                max="100"
                :value="f.values.aliquota_cofins"
                placeholder="0,00"
                @input="f.setField('aliquota_cofins', parseFloat($event.target.value) ?? null)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Resumo tributário no modal -->
        <div v-if="hasAnyAliqForm" class="nfp-aliq-preview" aria-label="Pré-visualização das alíquotas">
          <span class="nfp-aliq-preview-label">Alíquotas configuradas:</span>
          <div class="nfp-aliq-preview-pills">
            <span v-if="f.values.aliquota_icms != null && f.values.aliquota_icms !== ''" class="nfp-aliq-pill" data-tributo="icms">
              ICMS {{ fmtAliq(f.values.aliquota_icms) }}
            </span>
            <span v-if="f.values.aliquota_iss != null && f.values.aliquota_iss !== ''" class="nfp-aliq-pill" data-tributo="iss">
              ISS {{ fmtAliq(f.values.aliquota_iss) }}
            </span>
            <span v-if="f.values.aliquota_pis != null && f.values.aliquota_pis !== ''" class="nfp-aliq-pill" data-tributo="pis">
              PIS {{ fmtAliq(f.values.aliquota_pis) }}
            </span>
            <span v-if="f.values.aliquota_cofins != null && f.values.aliquota_cofins !== ''" class="nfp-aliq-pill" data-tributo="cofins">
              COF {{ fmtAliq(f.values.aliquota_cofins) }}
            </span>
          </div>
        </div>

        <!-- Ações do formulário -->
        <div class="nfp-form-actions">
          <UiButton variant="ghost" type="button" @click="closeForm">Cancelar</UiButton>
          <UiButton variant="primary" type="submit" :loading="f.submitting">
            {{ editing ? 'Salvar alterações' : 'Cadastrar produto' }}
          </UiButton>
        </div>
      </form>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
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

// ─── API resource (REQ-CONTAVIVA360-0006) ────────────────────────────────────
const nfProductsApi = resourceFactory('nf-products');

// ─── composables ─────────────────────────────────────────────────────────────
const toast = useToast();
const ask   = useConfirm();

const r = useResource(nfProductsApi, {
  filters: { q: '', cfop: '' },
});

// ─── filtros ─────────────────────────────────────────────────────────────────
const filters = ref({ q: '', cfop: '' });

const filterFields = [
  { key: 'q',    label: 'Buscar',  type: 'text', placeholder: 'Descrição ou código' },
  { key: 'cfop', label: 'CFOP',    type: 'text', placeholder: 'Ex.: 5102' },
];

function applyFilters() { r.setFilters({ ...filters.value }); }
function clearFilters()  { Object.keys(filters.value).forEach((k) => (filters.value[k] = '')); r.setFilters({}); }

// ─── colunas ─────────────────────────────────────────────────────────────────
const columns = [
  { key: 'codigo',        label: 'Código',        sortable: true },
  { key: 'descricao',     label: 'Descrição',      sortable: true },
  { key: 'valor_unitario', label: 'Valor Unit.',   sortable: true, align: 'right' },
  { key: 'cfop',          label: 'CFOP',           sortable: true, align: 'center' },
  { key: '_aliquotas',    label: 'Alíquotas',      align: 'left' },
  { key: 'ncm_nbs',       label: 'NCM / NBS',      sortable: true },
  { key: '_actions',      label: '',               align: 'right' },
];

// ─── estado vazio ─────────────────────────────────────────────────────────────
const emptyState = {
  title:       'Nenhum produto ou serviço cadastrado',
  description: 'Cadastre o primeiro item do catálogo para emitir NF.',
};

// ─── métricas computadas ──────────────────────────────────────────────────────
const avgValor = computed(() => {
  const rows = r.items.value;
  if (!rows.length) return 0;
  const total = rows.reduce((acc, x) => acc + Number(x.valor_unitario || 0), 0);
  return total / rows.length;
});

const countWithNcm = computed(() =>
  r.items.value.filter((x) => x.ncm_nbs && String(x.ncm_nbs).trim()).length
);

const countSemCfop = computed(() =>
  r.items.value.filter((x) => !x.cfop || !String(x.cfop).trim()).length
);

// ─── formatadores locais ──────────────────────────────────────────────────────
function fmtCurrency(v) { return fmt.formatCurrency(v); }
function fmtAliq(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '%';
}

// ─── helpers de alíquota ──────────────────────────────────────────────────────
function hasAnyAliq(row) {
  return (
    (row.aliquota_icms   != null && row.aliquota_icms   !== '') ||
    (row.aliquota_iss    != null && row.aliquota_iss    !== '') ||
    (row.aliquota_pis    != null && row.aliquota_pis    !== '') ||
    (row.aliquota_cofins != null && row.aliquota_cofins !== '')
  );
}

// ─── formulário ──────────────────────────────────────────────────────────────
const showForm   = ref(false);
const editing    = ref(null);
const deletingId = ref(null);

const emptyFormData = () => ({
  codigo:           '',
  descricao:        '',
  valor_unitario:   null,
  cfop:             '',
  ncm_nbs:          '',
  aliquota_icms:    null,
  aliquota_iss:     null,
  aliquota_pis:     null,
  aliquota_cofins:  null,
});

const f = useForm({
  initial: emptyFormData(),
  rules: {
    descricao:     [validators.required('A descrição é obrigatória.')],
    valor_unitario:[validators.required('Valor obrigatório.'), validators.min(0, 'Deve ser ≥ 0.')],
    cfop:          [validators.pattern(/^\d{4}$/, 'CFOP deve ter 4 dígitos numéricos.')],
    ncm_nbs:       [validators.pattern(/^(\d{4}\.\d{2}\.\d{2}|\d{8}|\d+\.\d+\.\d+\.\d+)$/, 'Formato NCM ou NBS inválido.')],
  },
});

const hasAnyAliqForm = computed(() =>
  (f.values.aliquota_icms   != null && f.values.aliquota_icms   !== '') ||
  (f.values.aliquota_iss    != null && f.values.aliquota_iss    !== '') ||
  (f.values.aliquota_pis    != null && f.values.aliquota_pis    !== '') ||
  (f.values.aliquota_cofins != null && f.values.aliquota_cofins !== '')
);

function openNew() {
  editing.value = null;
  f.reset();
  showForm.value = true;
}

function openEdit(row) {
  editing.value = row.id;
  f.reset();
  Object.assign(f.values, { ...emptyFormData(), ...row });
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
  editing.value  = null;
  f.reset();
}

async function save() {
  await f.handleSubmit(async (values) => {
    const payload = { ...values };
    // remove campos vazios de alíquota (envia null para limpar)
    ['aliquota_icms', 'aliquota_iss', 'aliquota_pis', 'aliquota_cofins'].forEach((k) => {
      if (payload[k] === '' || payload[k] === undefined) payload[k] = null;
    });
    if (!payload.codigo?.trim())   delete payload.codigo;
    if (!payload.cfop?.trim())     delete payload.cfop;
    if (!payload.ncm_nbs?.trim())  delete payload.ncm_nbs;

    try {
      if (editing.value) {
        await nfProductsApi.update(editing.value, payload);
        toast.success('Produto atualizado com sucesso.');
      } else {
        await nfProductsApi.create(payload);
        toast.success('Produto cadastrado com sucesso.');
      }
      showForm.value = false;
      r.load();
    } catch (e) {
      toast.error('Erro ao salvar: ' + (e.message || 'Tente novamente.'));
    }
  });
}

// ─── exclusão com confirmação ─────────────────────────────────────────────────
async function confirmDelete(row) {
  const ok = await ask({
    title:        'Excluir Produto',
    message:      `Deseja excluir "${row.descricao}" permanentemente? Esta ação não pode ser desfeita.`,
    confirmLabel: 'Excluir',
    danger:       true,
  });
  if (!ok) return;

  deletingId.value = row.id;
  try {
    await nfProductsApi.remove(row.id);
    toast.success(`"${row.descricao}" excluído com sucesso.`);
    r.load();
  } catch (e) {
    toast.error('Erro ao excluir: ' + (e.message || 'Tente novamente.'));
  } finally {
    deletingId.value = null;
  }
}

// ─── exportar CSV ─────────────────────────────────────────────────────────────
function exportarCsv() {
  const rows = r.items.value;
  if (!rows.length) {
    toast.warning('Nenhum produto no catálogo para exportar.');
    return;
  }
  const headers = ['Código', 'Descrição', 'Valor Unitário', 'CFOP', 'NCM/NBS', 'ICMS%', 'ISS%', 'PIS%', 'COFINS%'];
  const lines = [
    headers.join(';'),
    ...rows.map((r) =>
      [
        r.codigo       || '',
        r.descricao    || '',
        (r.valor_unitario != null ? Number(r.valor_unitario).toFixed(2) : ''),
        r.cfop         || '',
        r.ncm_nbs      || '',
        (r.aliquota_icms    != null ? String(r.aliquota_icms)    : ''),
        (r.aliquota_iss     != null ? String(r.aliquota_iss)     : ''),
        (r.aliquota_pis     != null ? String(r.aliquota_pis)     : ''),
        (r.aliquota_cofins  != null ? String(r.aliquota_cofins)  : ''),
      ].join(';')
    ),
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'catalogo-nf.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success('Exportação concluída.');
}

// ─── montagem ─────────────────────────────────────────────────────────────────
onMounted(r.load);
</script>

<style scoped>
/* ── métricas ──────────────────────────────────────────────────────── */
.nfp-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ui-space-4);
}

/* ── contagem no cabeçalho ─────────────────────────────────────────── */
.nfp-count {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

/* ── célula: código ────────────────────────────────────────────────── */
.nfp-code {
  font-family: monospace;
  font-size: var(--ui-text-sm);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-1) var(--ui-space-2);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
}

/* ── célula: descrição ─────────────────────────────────────────────── */
.nfp-desc {
  font-weight: 500;
  color: rgb(var(--ui-fg));
}

/* ── célula: valor unitário ────────────────────────────────────────── */
.nfp-valor {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

/* ── célula: CFOP ──────────────────────────────────────────────────── */
.nfp-cfop {
  font-family: monospace;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-fg));
}
.nfp-cfop[data-missing="true"] {
  color: rgb(var(--ui-warn));
  font-style: italic;
  font-weight: 400;
}

/* ── célula: NCM/NBS ───────────────────────────────────────────────── */
.nfp-ncm {
  font-family: monospace;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.nfp-ncm[data-missing="true"] {
  color: rgb(var(--ui-border-strong));
}

/* ── pills de alíquota ─────────────────────────────────────────────── */
.nfp-aliq-group {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  flex-wrap: wrap;
}
.nfp-aliq-empty {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.nfp-aliq-pill {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  white-space: nowrap;
  /* default: neutro */
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  border: 1px solid rgb(var(--ui-border));
}
.nfp-aliq-pill[data-tributo="icms"] {
  background: rgb(var(--ui-accent) / 0.10);
  color: rgb(var(--ui-accent-strong));
  border-color: rgb(var(--ui-accent) / 0.25);
}
.nfp-aliq-pill[data-tributo="iss"] {
  background: rgb(var(--ui-ok) / 0.10);
  color: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok) / 0.25);
}
.nfp-aliq-pill[data-tributo="pis"] {
  background: rgb(var(--ui-warn) / 0.10);
  color: rgb(var(--ui-warn));
  border-color: rgb(var(--ui-warn) / 0.25);
}
.nfp-aliq-pill[data-tributo="cofins"] {
  background: rgb(var(--ui-danger) / 0.10);
  color: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger) / 0.25);
}

/* ── ações em linha ────────────────────────────────────────────────── */
.nfp-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
.nfp-action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  background: none;
  color: rgb(var(--ui-muted));
}
.nfp-action-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}
.nfp-action-btn[data-tone="neutral"]:not(:disabled):hover {
  background: rgb(var(--ui-accent) / 0.08);
  color: rgb(var(--ui-accent-strong));
  border-color: rgb(var(--ui-accent) / 0.3);
}
.nfp-action-btn[data-tone="danger"]:not(:disabled):hover {
  background: rgb(var(--ui-danger) / 0.10);
  color: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger) / 0.30);
}
.nfp-action-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* ── formulário no modal ───────────────────────────────────────────── */
.nfp-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.nfp-aliq-preview {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  flex-wrap: wrap;
}
.nfp-aliq-preview-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.nfp-aliq-preview-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}
.nfp-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
  border-top: 1px solid rgb(var(--ui-border));
}

/* ── responsivo ≤860px ─────────────────────────────────────────────── */
@media (max-width: 860px) {
  .nfp-metrics {
    grid-template-columns: 1fr 1fr;
  }
  .nfp-row-actions {
    flex-direction: column;
    align-items: flex-end;
    gap: var(--ui-space-1);
  }
  .nfp-aliq-group {
    gap: var(--ui-space-1);
  }
}
@media (max-width: 480px) {
  .nfp-metrics {
    grid-template-columns: 1fr;
  }
  .nfp-aliq-preview {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
