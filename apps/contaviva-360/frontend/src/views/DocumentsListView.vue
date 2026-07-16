<template>
  <UiPageLayout
    title="Documentos"
    eyebrow="Gestão Fiscal"
    subtitle="Gerenciamento central de documentos do tenant. Envie, consulte e acompanhe o status de todos os documentos fiscais."
    width="wide"
    :error="r.error.value ? (r.error.value.message || 'Erro ao carregar documentos') : null"
    @retry="r.load"
  >
    <template #actions>
      <UiButton variant="primary" @click="openUpload">Enviar Documento</UiButton>
    </template>

    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="id"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="{ title: 'Nenhum documento encontrado', description: 'Envie o primeiro documento do tenant ou ajuste os filtros aplicados.' }"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @row-click="openDetail"
    >
      <template #cell-tipo="{ value }">
        <span class="doc-type-tag">{{ value || '—' }}</span>
      </template>

      <template #cell-entity_type="{ row }">
        <span class="entity-pill" :data-kind="row.entity_type">
          {{ entityTypeLabel(row.entity_type) }}
          <span v-if="row.entity_id" class="entity-id">#{{ row.entity_id }}</span>
        </span>
      </template>

      <template #cell-mes_ano="{ row }">
        <span v-if="row.mes && row.ano" class="mes-ano">
          {{ mesPadded(row.mes) }}/{{ row.ano }}
        </span>
        <span v-else class="muted-dash">—</span>
      </template>

      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" with-dot />
      </template>

      <template #cell-versoes="{ row }">
        <span class="versoes-badge" :data-count="(row.versoes || row.version_count || 0)">
          {{ row.versoes || row.version_count || 0 }}
        </span>
      </template>

      <template #cell-updated_at="{ value }">
        <span class="date-cell">{{ format.formatDateTime(value) }}</span>
      </template>

      <template #cell-file_size="{ value }">
        <span class="size-cell">{{ formatBytes(value) }}</span>
      </template>

      <template #empty-action>
        <UiButton variant="primary" @click="openUpload">Enviar primeiro documento</UiButton>
      </template>
    </UiDataTable>

    <!-- Modal: envio de documento -->
    <UiModal
      :open="showUpload"
      title="Enviar Documento"
      width="lg"
      persistent
      @update:open="showUpload = $event"
    >
      <form id="upload-form" class="upload-form" @submit.prevent="submitUpload">
        <UiFormSection title="Identificação do Documento" :columns="2">
          <UiFormField label="Tipo de Documento" :required="true" :error="uploadErrors.tipo">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="text"
                :model-value="uploadValues.tipo"
                placeholder="Ex: SPED, NFe, ECD, DCTF…"
                :error="uploadErrors.tipo"
                :required="true"
                @update:model-value="setUploadField('tipo', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Tipo de Entidade" :error="uploadErrors.entity_type">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                class="ui-select"
                :value="uploadValues.entity_type"
                @change="setUploadField('entity_type', $event.target.value)"
              >
                <option value="">Selecione…</option>
                <option value="pf">Pessoa Física (PF)</option>
                <option value="pj">Pessoa Jurídica (PJ)</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="ID da Entidade" :error="uploadErrors.entity_id">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="number"
                :model-value="uploadValues.entity_id"
                placeholder="ID numérico"
                min="1"
                inputmode="numeric"
                :error="uploadErrors.entity_id"
                @update:model-value="setUploadField('entity_id', $event ? Number($event) : null)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Mês de Referência" :error="uploadErrors.mes">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                class="ui-select"
                :value="uploadValues.mes"
                @change="setUploadField('mes', $event.target.value ? Number($event.target.value) : null)"
              >
                <option value="">Selecione…</option>
                <option v-for="m in meses" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Ano de Referência" :error="uploadErrors.ano">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="number"
                :model-value="uploadValues.ano"
                placeholder="Ex: 2025"
                min="2000"
                max="2099"
                inputmode="numeric"
                :error="uploadErrors.ano"
                @update:model-value="setUploadField('ano', $event ? Number($event) : null)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Nome do Arquivo" :error="uploadErrors.filename">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="text"
                :model-value="uploadValues.filename"
                placeholder="documento.xml, relatorio.pdf…"
                :error="uploadErrors.filename"
                @update:model-value="setUploadField('filename', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </form>

      <template #footer>
        <UiButton variant="ghost" type="button" @click="showUpload = false">Cancelar</UiButton>
        <UiButton variant="primary" type="submit" form="upload-form" :loading="uploading">Enviar Documento</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
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
  useResource,
  useToast,
  useForm,
  validators,
  format,
} from '../ui/index.js';
import { documents } from '../api.js';

const router = useRouter();
const toast = useToast();

// ─── recurso ───────────────────────────────────────────────────────────────
const r = useResource(documents);

// ─── colunas da tabela ─────────────────────────────────────────────────────
const columns = [
  { key: 'tipo',        label: 'Tipo',          sortable: true },
  { key: 'entity_type', label: 'Entidade',       sortable: false },
  { key: 'mes_ano',     label: 'Mês/Ano',        sortable: false },
  { key: 'status',      label: 'Status',         sortable: true },
  { key: 'versoes',     label: 'Versões',        align: 'center', sortable: false },
  { key: 'updated_at',  label: 'Atualizado em',  sortable: true },
  { key: 'file_size',   label: 'Tamanho',        align: 'right',  sortable: false },
];

// ─── filtros ───────────────────────────────────────────────────────────────
const anoAtual = new Date().getFullYear();
const anosOpcoes = Array.from({ length: 6 }, (_, i) => String(anoAtual - i));

const filterFields = [
  {
    key: 'tipo',
    label: 'Tipo de Documento',
    type: 'text',
    placeholder: 'SPED, NFe, ECD…',
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'pendente',    label: 'Pendente' },
      { value: 'enviado',     label: 'Enviado' },
      { value: 'aprovado',    label: 'Aprovado' },
      { value: 'rejeitado',   label: 'Rejeitado' },
      { value: 'cancelado',   label: 'Cancelado' },
      { value: 'processando', label: 'Processando' },
    ],
  },
  {
    key: 'mes',
    label: 'Mês',
    type: 'select',
    options: [
      { value: '1',  label: 'Janeiro' },
      { value: '2',  label: 'Fevereiro' },
      { value: '3',  label: 'Março' },
      { value: '4',  label: 'Abril' },
      { value: '5',  label: 'Maio' },
      { value: '6',  label: 'Junho' },
      { value: '7',  label: 'Julho' },
      { value: '8',  label: 'Agosto' },
      { value: '9',  label: 'Setembro' },
      { value: '10', label: 'Outubro' },
      { value: '11', label: 'Novembro' },
      { value: '12', label: 'Dezembro' },
    ],
  },
  {
    key: 'ano',
    label: 'Ano',
    type: 'select',
    options: anosOpcoes.map((a) => ({ value: a, label: a })),
  },
  {
    key: 'entity_type',
    label: 'Tipo de Entidade',
    type: 'select',
    options: [
      { value: 'pf', label: 'Pessoa Física (PF)' },
      { value: 'pj', label: 'Pessoa Jurídica (PJ)' },
    ],
  },
];

const filters = ref({ tipo: '', status: '', mes: '', ano: '', entity_type: '' });

function applyFilters() {
  r.setFilters({ ...filters.value });
}

function clearFilters() {
  filters.value = { tipo: '', status: '', mes: '', ano: '', entity_type: '' };
  r.setFilters({});
}

// ─── navegação ─────────────────────────────────────────────────────────────
function openDetail(row) {
  router.push('/documents/' + row.id);
}

// ─── upload modal ──────────────────────────────────────────────────────────
const showUpload = ref(false);
const uploading = ref(false);

const emptyUploadForm = () => ({
  tipo: '',
  entity_type: '',
  entity_id: null,
  mes: null,
  ano: null,
  filename: '',
});

const {
  values: uploadValues,
  errors: uploadErrors,
  setField: setUploadField,
  validate: validateUpload,
  reset: resetUpload,
} = useForm({
  initial: emptyUploadForm(),
  rules: {
    tipo: [validators.required('O tipo de documento é obrigatório.')],
  },
});

const meses = [
  { value: 1,  label: 'Janeiro' },
  { value: 2,  label: 'Fevereiro' },
  { value: 3,  label: 'Março' },
  { value: 4,  label: 'Abril' },
  { value: 5,  label: 'Maio' },
  { value: 6,  label: 'Junho' },
  { value: 7,  label: 'Julho' },
  { value: 8,  label: 'Agosto' },
  { value: 9,  label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

function openUpload() {
  resetUpload();
  showUpload.value = true;
}

async function submitUpload() {
  if (!validateUpload()) return;
  uploading.value = true;
  try {
    const payload = { tipo: uploadValues.tipo.trim() };
    if (uploadValues.entity_type) payload.entity_type = uploadValues.entity_type;
    if (uploadValues.entity_id)   payload.entity_id = uploadValues.entity_id;
    if (uploadValues.mes)         payload.mes = uploadValues.mes;
    if (uploadValues.ano)         payload.ano = uploadValues.ano;
    if (uploadValues.filename)    payload.filename = uploadValues.filename.trim();
    await documents.create(payload);
    toast.success('Documento enviado com sucesso.');
    showUpload.value = false;
    r.load();
  } catch (e) {
    toast.error(e.message || 'Erro ao enviar documento. Tente novamente.');
  } finally {
    uploading.value = false;
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────
function entityTypeLabel(type) {
  if (type === 'pf') return 'PF';
  if (type === 'pj') return 'PJ';
  return type || '—';
}

function mesPadded(mes) {
  return String(mes).padStart(2, '0');
}

function formatBytes(bytes) {
  if (bytes == null || bytes === '') return '—';
  const n = Number(bytes);
  if (!isFinite(n) || n < 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

// ─── init ──────────────────────────────────────────────────────────────────
onMounted(r.load);
</script>

<style scoped>
/* ── select sem UiSelect nativo do kit ── */
.ui-select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  transition: border-color .15s ease, box-shadow .15s ease;
  appearance: auto;
}
.ui-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.ui-select[aria-invalid="true"] {
  border-color: rgb(var(--ui-danger));
}

/* ── tipo tag ── */
.doc-type-tag {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.1);
  border-radius: var(--ui-radius-sm);
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  white-space: nowrap;
}

/* ── entidade pill ── */
.entity-pill {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--ui-space-1) + calc(var(--ui-space-1) / 2));
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border-radius: var(--ui-radius-pill);
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  white-space: nowrap;
}
.entity-pill[data-kind="pf"] {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}
.entity-pill[data-kind="pj"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}
.entity-pill:not([data-kind="pf"]):not([data-kind="pj"]) {
  background: rgb(var(--ui-muted) / 0.12);
  color: rgb(var(--ui-muted));
}
.entity-id {
  font-weight: 400;
  opacity: 0.75;
}

/* ── mês/ano ── */
.mes-ano {
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.muted-dash {
  color: rgb(var(--ui-muted));
}

/* ── versões badge ── */
.versoes-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--ui-space-6);
  height: var(--ui-space-6);
  padding: 0 var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  border: 1px solid rgb(var(--ui-border));
}
.versoes-badge[data-count="0"] {
  opacity: 0.45;
}

/* ── datas / tamanho ── */
.date-cell {
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
}
.size-cell {
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── modal form ── */
.upload-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
</style>
