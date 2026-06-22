<!--
  InvoiceListView — Lista de NF-e (situação SEFAZ).
  Acompanha emissão: enfileiradas / processando / autorizadas / rejeitadas / DLQ.
  Tudo sobre o kit ui-vue (tokens --ui-*), CSP-safe (sem estilo inline, sem binding de estilo,
  sem HTML cru), todos os estados (loading / empty / error / normal / degradado), a11y.

  CONTRATO REAL (apps/shopdesk/api/openapi/openapi.yaml + server.js):
    POST /v1/invoices        → emite/reemite a NF-e (api.store.emitInvoice).
  NÃO existe (ainda) GET /v1/invoices (lista) nem GET /v1/invoices/:id no backend —
  `invoices` não é uma entidade CRUD (ver repositories/entities.js). Por isso esta tela:
    1) consome o recurso de LISTA de forma DEFENSIVA (igual InvoiceDetailView/InvoiceEmitView):
       só usa api.invoices.list se ele existir; senão entra num estado DEGRADADO honesto
       ("recurso de lista ainda não exposto") em vez de quebrar contra o client real;
    2) NÃO inventa rota — quando a esteira expuser GET /v1/invoices, a tela funciona sem mudar.
-->
<template>
  <UiPageLayout
    eyebrow="Fiscal"
    title="Notas fiscais"
    subtitle="Acompanhe a emissão de NF-e: enfileiradas, em processamento, autorizadas, rejeitadas ou na fila morta (DLQ)."
    width="wide"
    :error="r && r.error.value"
    @retry="reload"
  >
    <!-- Ações de cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :disabled="!listAvailable || (r && r.loading.value)" @click="reload">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton
        variant="subtle"
        :disabled="!filteredRows.length || (r && r.loading.value)"
        @click="exportCsv"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
    </template>

    <!-- Filtros estruturados (só quando o recurso de lista está disponível) -->
    <template v-if="listAvailable" #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- ESTADO DEGRADADO: o recurso de LISTA (GET /v1/invoices) ainda não foi exposto pela API.
         Honesto: não inventamos rota nem deixamos a tela quebrar. -->
    <template v-if="!listAvailable">
      <UiEmptyState
        title="Listagem de NF-e ainda não disponível"
        :description="unavailableReason"
        icon="doc"
      >
        <template #action>
          <UiButton variant="primary" to="/invoices/new">Emitir uma NF-e</UiButton>
        </template>
      </UiEmptyState>
    </template>

    <!-- TELA NORMAL: recurso de lista disponível -->
    <template v-else>
      <!-- KPIs derivados das notas reais carregadas. Escopo HONESTO: refletem só a
           página carregada (server-mode paginado), por isso o hint diz "nesta página". -->
      <div class="inv-kpis" role="group" aria-label="Indicadores de notas fiscais (nesta página)">
        <UiMetricCard
          label="Autorizadas"
          :value="kpis.autorizada"
          tone="success"
          hint="NF-e com protocolo · nesta página"
          :loading="r.loading.value"
        />
        <UiMetricCard
          label="Em processamento"
          :value="kpis.emProcessamento"
          tone="running"
          hint="Enfileiradas ou processando · nesta página"
          :loading="r.loading.value"
        />
        <UiMetricCard
          label="Rejeitadas"
          :value="kpis.rejeitada"
          tone="warning"
          hint="Recusadas pela SEFAZ · nesta página"
          :loading="r.loading.value"
        />
        <UiMetricCard
          label="Fila morta (DLQ)"
          :value="kpis.dlq"
          tone="error"
          hint="Esgotaram as tentativas · nesta página"
          :loading="r.loading.value"
        />
      </div>

      <!-- Chips de filtro rápido por situação (FilterChips) -->
      <div class="inv-chips" role="group" aria-label="Filtrar por situação">
        <button
          v-for="chip in statusChips"
          :key="chip.value"
          type="button"
          class="inv-chip"
          :data-tone="chip.tone"
          :data-active="activeStatus === chip.value ? 'true' : null"
          :aria-pressed="activeStatus === chip.value ? 'true' : 'false'"
          @click="toggleStatusChip(chip.value)"
        >
          <span class="inv-chip-dot" aria-hidden="true" />
          <span class="inv-chip-label">{{ chip.label }}</span>
          <span class="inv-chip-count">{{ chip.count }}</span>
        </button>
      </div>

      <!-- Tabela de notas fiscais -->
      <UiCard title="Lista de NF-e" :subtitle="resultSummary">
        <template #actions>
          <UiStatusBadge
            v-if="hasLocalFilter"
            tone="running"
            status="Filtro local ativo"
            label="Filtro local ativo"
            :with-dot="true"
          />
        </template>

        <UiDataTable
          :columns="columns"
          :rows="filteredRows"
          row-key="id"
          density="comfortable"
          clickable-rows
          server-mode
          :loading="r.loading.value"
          :sort="r.sort.value"
          :page="r.page.value"
          :page-size="r.pageSize.value"
          :total="r.total.value"
          paginated
          :empty="emptyState"
          @row-click="openDetail"
          @update:sort="r.setSort"
          @update:page="r.setPage"
          @update:page-size="onPageSize"
        >
          <!-- Número + pedido -->
          <template #cell-number="{ row }">
            <div class="inv-id">
              <span class="inv-id-number">{{ invoiceNumber(row) || '—' }}</span>
              <span class="inv-id-order">Pedido {{ orderIdOf(row) || '—' }}</span>
            </div>
          </template>

          <!-- Protocolo SEFAZ -->
          <template #cell-protocol="{ row }">
            <span v-if="protocolOf(row)" class="ui-mono inv-protocol">{{ protocolOf(row) }}</span>
            <span v-else class="ui-muted">—</span>
          </template>

          <!-- Total -->
          <template #cell-total="{ value }">
            <span class="inv-total">{{ format.formatCurrency(value) }}</span>
          </template>

          <!-- Situação: tom EXPLÍCITO pelo enum (o status-map casa termos no masculino e
               erra autorizada/rejeitada/enfileirada; aqui forçamos a hierarquia visual). -->
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" :label="labelFor(value)" :tone="toneFor(value)" />
          </template>

          <!-- Tentativas -->
          <template #cell-attempts="{ row }">
            <span :class="attemptsClass(row)">{{ attemptsOf(row) }}</span>
          </template>

          <!-- Emitida em -->
          <template #cell-issuedAt="{ row }">
            {{ format.formatDateTime(issuedAtOf(row)) }}
          </template>

          <!-- Ações por linha -->
          <template #cell-actions="{ row }">
            <div class="inv-actions" @click.stop>
              <UiButton variant="ghost" size="sm" @click="openDetail(row)">Ver</UiButton>
              <!-- DownloadXmlLink: só quando há XML real disponível na linha -->
              <UiButton
                v-if="hasXml(row)"
                variant="ghost"
                size="sm"
                @click="downloadXml(row)"
              >
                <template #icon-left><span aria-hidden="true">⬇</span></template>
                XML
              </UiButton>
              <span v-else class="inv-noxml" :title="xmlHint(row)">XML —</span>
              <UiButton
                v-if="canReprocess(row)"
                variant="danger"
                size="sm"
                :loading="busyId === row.id"
                @click="reprocess(row)"
              >
                Reprocessar
              </UiButton>
            </div>
          </template>

          <!-- Sem resultados após filtro -->
          <template #empty-action>
            <UiButton v-if="hasLocalFilter || activeStatus" variant="ghost" @click="onClear">Limpar filtros</UiButton>
            <UiButton v-else variant="ghost" @click="reload">Recarregar</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </template>

    <!-- Modal: detalhe da nota (fonte única de detalhe nesta tela — não há rota
         /invoices/:id registrada; o reprocess/download reusam os mesmos handlers). -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <UiLoadingState v-if="detailLoading" variant="spinner" />
      <UiErrorState
        v-else-if="detailError"
        :message="detailError"
        @retry="reloadDetail"
      />
      <dl v-else-if="detail" class="inv-detail">
        <div class="inv-detail-row">
          <dt>Número</dt>
          <dd class="ui-mono">{{ invoiceNumber(detail) || '—' }}</dd>
        </div>
        <div class="inv-detail-row">
          <dt>Pedido</dt>
          <dd class="ui-mono">{{ orderIdOf(detail) || '—' }}</dd>
        </div>
        <div class="inv-detail-row">
          <dt>Situação</dt>
          <dd><UiStatusBadge :status="detail.status" :label="labelFor(detail.status)" :tone="toneFor(detail.status)" /></dd>
        </div>
        <div class="inv-detail-row">
          <dt>Protocolo SEFAZ</dt>
          <dd class="ui-mono">{{ protocolOf(detail) || '—' }}</dd>
        </div>
        <div class="inv-detail-row">
          <dt>Total</dt>
          <dd class="inv-total">{{ format.formatCurrency(detail.total) }}</dd>
        </div>
        <div class="inv-detail-row">
          <dt>Tentativas</dt>
          <dd>{{ attemptsOf(detail) }}</dd>
        </div>
        <div class="inv-detail-row">
          <dt>Recibo</dt>
          <dd class="ui-mono">{{ receiptOf(detail) || '—' }}</dd>
        </div>
        <div class="inv-detail-row">
          <dt>Emitida em</dt>
          <dd>{{ format.formatDateTime(issuedAtOf(detail)) }}</dd>
        </div>
      </dl>
      <template #footer>
        <UiButton
          v-if="detail && detail.id != null"
          variant="ghost"
          @click="openDetailPage(detail)"
        >
          <template #icon-left><span aria-hidden="true">↗</span></template>
          Abrir página
        </UiButton>
        <UiButton
          v-if="detail && hasXml(detail)"
          variant="ghost"
          @click="downloadXml(detail)"
        >
          <template #icon-left><span aria-hidden="true">⬇</span></template>
          Baixar XML
        </UiButton>
        <UiButton
          v-if="detail && canReprocess(detail)"
          variant="danger"
          :loading="busyId === detail.id"
          @click="reprocess(detail)"
        >
          Reprocessar
        </UiButton>
        <UiButton variant="primary" @click="detailOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiFiltersPanel,
  UiStatusBadge,
  UiButton,
  UiModal,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// Abre a PÁGINA de detalhe (/invoices/:id) passando a nota inteira em router state —
// o backend não expõe GET /v1/invoices/:id, então a DetailView lê do state da navegação.
function openDetailPage(row) {
  if (!row || row.id == null) return;
  router.push({ name: 'invoice', params: { id: String(row.id) }, state: { invoice: { ...row } } });
}

// ---------------------------------------------------------------------------
// Consumo DEFENSIVO do recurso de lista (igual InvoiceDetailView/InvoiceEmitView).
// O backend REAL expõe só POST /v1/invoices (emissão). GET /v1/invoices (lista)
// pode ainda não estar exposto no client → guardamos para NÃO quebrar o useResource.
//   - listAvailable=false → estado degradado honesto (sem inventar rota).
//   - quando a esteira expuser api.invoices.list, a tela funciona sem alterações.
// ---------------------------------------------------------------------------
const invoicesApi =
  api.invoices && typeof api.invoices.list === 'function' ? api.invoices : null;
const listAvailable = computed(() => invoicesApi !== null);
const unavailableReason =
  'O recurso de consulta de notas (GET /v1/invoices) ainda não está exposto por esta API — ' +
  'apenas a emissão (POST /v1/invoices) está disponível. Assim que a esteira publicar o endpoint ' +
  'de listagem, esta tela passa a exibir as notas automaticamente.';

// useResource só é instanciado quando há recurso real; nunca passamos `undefined`.
const r = invoicesApi
  ? useResource(invoicesApi, { pageSize: 25, sort: { key: 'issuedAt', dir: 'desc' } })
  : null;

function reload() {
  if (r) r.load();
}

// ---------------------------------------------------------------------------
// Enums do domínio (situação da NF-e) com rótulos legíveis e TOM explícito.
// O status-map do kit resolve por substring no masculino (autorizado/rejeitado/
// enfileirado) e erra o feminino do domínio (autorizada/rejeitada/enfileirada) →
// passamos :tone explícito para garantir a hierarquia visual de situação.
// ---------------------------------------------------------------------------
const STATUS_LABELS = {
  enfileirada: 'Enfileirada',
  processando: 'Processando',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  dlq: 'Fila morta (DLQ)',
};
const STATUS_TONE = {
  enfileirada: 'running',
  processando: 'running',
  autorizada: 'success',
  rejeitada: 'warning',
  dlq: 'error',
};
const labelFor = (v) => STATUS_LABELS[v] || format.humanize(v);
const toneFor = (v) => STATUS_TONE[v] || null; // null → kit resolve por palavra-chave

// O backend pode serializar em snake_case (order_id, issued_at) ou camelCase
// (orderId, issuedAt). Lemos de forma tolerante sem inventar dados.
const pick = (row, ...keys) => {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return null;
};
const orderIdOf = (row) => pick(row, 'orderId', 'order_id');
const invoiceNumber = (row) => pick(row, 'number', 'nfe_number', 'numero');
const protocolOf = (row) => pick(row, 'protocol', 'protocolo');
const receiptOf = (row) => pick(row, 'receipt', 'recibo');
const issuedAtOf = (row) => pick(row, 'issuedAt', 'issued_at', 'created_at', 'createdAt');
const attemptsOf = (row) => {
  const a = pick(row, 'attempts', 'tentativas');
  return a == null ? 0 : Number(a);
};

// ---------------------------------------------------------------------------
// Colunas. `number`, `protocol`, `attempts` e `issuedAt` usam slots p/ render
// rico; status vira badge; total formata moeda.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'number', label: 'Número / Pedido', sortable: true },
  { key: 'protocol', label: 'Protocolo SEFAZ' },
  { key: 'total', label: 'Total', align: 'right', sortable: true },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'attempts', label: 'Tentativas', align: 'right', sortable: true },
  { key: 'issuedAt', label: 'Emitida em', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

// ---------------------------------------------------------------------------
// Filtros estruturados. `q` (busca) e `status` vão ao servidor; o intervalo de
// datas é refinado no cliente sobre as linhas REAIS, com aviso visível.
// ---------------------------------------------------------------------------
const STATUS_OPTIONS = [
  { value: 'enfileirada', label: 'Enfileirada' },
  { value: 'processando', label: 'Processando' },
  { value: 'autorizada', label: 'Autorizada' },
  { value: 'rejeitada', label: 'Rejeitada' },
  { value: 'dlq', label: 'Fila morta (DLQ)' },
];
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'número, pedido ou protocolo' },
  { key: 'status', label: 'Situação', type: 'select', options: STATUS_OPTIONS },
  { key: 'from', label: 'De', type: 'date' },
  { key: 'to', label: 'Até', type: 'date' },
];
const blankFilters = () => ({ q: '', status: '', from: '', to: '' });
const filters = ref(blankFilters());

// Só o que o servidor entende vira parâmetro do recurso.
function applyFilters() {
  if (!r) return;
  r.setFilters({
    q: filters.value.q || undefined,
    status: filters.value.status || undefined,
  });
}
function onClear() {
  filters.value = blankFilters();
  if (r) r.setFilters({ q: undefined, status: undefined });
}
function onPageSize(size) {
  if (!r) return;
  r.pageSize.value = size;
  r.setPage(1);
}

// ---------------------------------------------------------------------------
// Linhas da página atual (server-mode). Tudo derivado disto é, por definição,
// ESCOPO DA PÁGINA — rotulado honestamente como tal nos KPIs/summary.
// ---------------------------------------------------------------------------
const pageRows = computed(() => (r ? r.items.value : []));

// ---------------------------------------------------------------------------
// Chips de situação (FilterChips): sincronizados com o filtro de status do
// servidor. Clicar alterna; contagens vêm das linhas REAIS da página.
// ---------------------------------------------------------------------------
const activeStatus = computed(() => filters.value.status || '');
const statusChips = computed(() => {
  const rows = pageRows.value;
  const countBy = (v) => rows.filter((x) => x.status === v).length;
  return [
    { value: 'autorizada', label: 'Autorizadas', tone: 'success', count: countBy('autorizada') },
    { value: 'processando', label: 'Processando', tone: 'running', count: countBy('processando') },
    { value: 'enfileirada', label: 'Enfileiradas', tone: 'running', count: countBy('enfileirada') },
    { value: 'rejeitada', label: 'Rejeitadas', tone: 'warning', count: countBy('rejeitada') },
    { value: 'dlq', label: 'DLQ', tone: 'error', count: countBy('dlq') },
  ];
});
function toggleStatusChip(value) {
  filters.value.status = activeStatus.value === value ? '' : value;
  applyFilters();
}

// ---------------------------------------------------------------------------
// Refino local por intervalo de datas, sobre a página carregada.
// ---------------------------------------------------------------------------
const hasLocalFilter = computed(() => !!(filters.value.from || filters.value.to));
const filteredRows = computed(() => {
  const f = filters.value;
  const fromTs = f.from ? new Date(f.from + 'T00:00:00').getTime() : null;
  const toTs = f.to ? new Date(f.to + 'T23:59:59').getTime() : null;
  if (fromTs == null && toTs == null) return pageRows.value;
  return pageRows.value.filter((row) => {
    const raw = issuedAtOf(row);
    const ts = raw ? new Date(raw).getTime() : NaN;
    if (isNaN(ts)) return false;
    if (fromTs != null && ts < fromTs) return false;
    if (toTs != null && ts > toTs) return false;
    return true;
  });
});

// ---------------------------------------------------------------------------
// KPIs derivados das linhas reais exibidas (escopo HONESTO: nesta página).
// ---------------------------------------------------------------------------
const kpis = computed(() => {
  const rows = filteredRows.value;
  const by = (v) => rows.filter((x) => x.status === v).length;
  return {
    autorizada: by('autorizada'),
    emProcessamento: by('processando') + by('enfileirada'),
    rejeitada: by('rejeitada'),
    dlq: by('dlq'),
  };
});
const resultSummary = computed(() => {
  if (!r) return '';
  if (r.loading.value) return 'Carregando…';
  const shown = filteredRows.value.length;
  if (!r.total.value) return 'Nenhuma nota emitida';
  if (hasLocalFilter.value) return shown + ' de ' + pageRows.value.length + ' nesta página (filtro local)';
  return shown + ' nesta página · ' + r.total.value + ' no total';
});
const emptyState = computed(() =>
  hasLocalFilter.value || activeStatus.value
    ? { title: 'Nenhuma nota no filtro', description: 'Ajuste a situação, a busca ou o período.', icon: '🔍' }
    : { title: 'Nenhuma NF-e ainda', description: 'As notas fiscais aparecerão aqui assim que forem emitidas pela loja.', icon: '🧾' },
);

// ---------------------------------------------------------------------------
// Tentativas: destaque quando há retentativas acumuladas.
// ---------------------------------------------------------------------------
const attemptsClass = (row) => (attemptsOf(row) > 1 ? 'inv-attempts inv-attempts-hot' : 'inv-attempts');

// ---------------------------------------------------------------------------
// Download de XML (DownloadXmlLink). Honesto: só baixa quando a linha carrega
// o conteúdo XML real (campo `xml`). O backend de lista realisticamente NÃO
// embute o XML por linha (custo) — quando a esteira expuser GET /v1/invoices/:id/xml,
// trocar por <a :href> para a rota dedicada. Até lá, mantemos o indicador "XML —".
// ---------------------------------------------------------------------------
const hasXml = (row) => typeof (row && row.xml) === 'string' && row.xml.length > 0;
const xmlHint = (row) =>
  row && row.status === 'autorizada'
    ? 'XML completo indisponível na listagem; abra o detalhe ou aguarde a rota de download.'
    : 'XML disponível apenas após a autorização da SEFAZ.';

function downloadXml(row) {
  if (!hasXml(row)) {
    toast.warning('XML indisponível para esta nota.');
    return;
  }
  try {
    const name = 'nfe-' + (invoiceNumber(row) || orderIdOf(row) || row.id) + '.xml';
    const blob = new Blob([row.xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('XML baixado (' + name + ').');
  } catch (e) {
    toast.error('Falha ao baixar o XML', { detail: e.message });
  }
}

// ---------------------------------------------------------------------------
// Detalhe (GET /v1/invoices/:id quando disponível). Fonte única de detalhe
// desta tela (não há rota /invoices/:id registrada no router).
// ---------------------------------------------------------------------------
const detailOpen = ref(false);
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
let lastDetailId = null;
const detailTitle = computed(() =>
  detail.value ? 'NF-e ' + (invoiceNumber(detail.value) || detail.value.id) : 'Nota fiscal',
);

async function openDetail(row) {
  detailOpen.value = true;
  lastDetailId = row.id;
  detail.value = row; // mostra o que já temos; refina com o get se houver
  detailError.value = '';
  if (!invoicesApi || typeof invoicesApi.get !== 'function' || row.id == null) return;
  detailLoading.value = true;
  try {
    detail.value = await invoicesApi.get(row.id);
  } catch (e) {
    detailError.value = e.message || 'Não foi possível carregar a nota.';
  } finally {
    detailLoading.value = false;
  }
}
function reloadDetail() {
  if (lastDetailId != null) openDetail({ id: lastDetailId });
}

// ---------------------------------------------------------------------------
// Reprocessar (ação sensível): só para rejeitadas/DLQ. Confirmação + reemissão
// real via POST /v1/invoices. Preferimos api.store.emitInvoice (rota REAL e
// canônica do contrato); se um client futuro expuser invoices.create, usamos.
// ---------------------------------------------------------------------------
const REPROCESSABLE = new Set(['rejeitada', 'dlq']);
const canReemit =
  (api.store && typeof api.store.emitInvoice === 'function') ||
  (invoicesApi && typeof invoicesApi.create === 'function');
const canReprocess = (row) => REPROCESSABLE.has(row && row.status) && canReemit;

const busyId = ref(null);
async function reprocess(row) {
  if (!canReprocess(row)) return;
  const ok = await confirm({
    title: 'Reprocessar emissão',
    message:
      'Reenviar a NF-e do pedido ' +
      (orderIdOf(row) || row.id) +
      ' para a SEFAZ? Uma nova tentativa de emissão será disparada.',
    confirmLabel: 'Reprocessar',
    danger: true,
  });
  if (!ok) return;
  busyId.value = row.id;
  try {
    const orderId = orderIdOf(row) || row.id;
    const total = Number(row.total) || 0;
    if (api.store && typeof api.store.emitInvoice === 'function') {
      await api.store.emitInvoice(orderId, total);
    } else {
      await invoicesApi.create({ orderId, total });
    }
    toast.success('Reprocessamento da NF-e do pedido ' + orderId + ' disparado.');
    if (detail.value && detail.value.id === row.id) detailOpen.value = false;
    if (r) await r.refresh();
  } catch (e) {
    toast.error('Falha ao reprocessar', { detail: e.message, code: e.status ? 'HTTP ' + e.status : '' });
  } finally {
    busyId.value = null;
  }
}

// ---------------------------------------------------------------------------
// Exportar CSV (cliente, sobre as linhas filtradas; CSP-safe via Blob).
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const rows = filteredRows.value;
  if (!rows.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['Número', 'Pedido', 'Protocolo', 'Total', 'Situação', 'Tentativas', 'Emitida em'];
  const lines = [head.join(';')];
  for (const o of rows) {
    lines.push(
      [
        csvCell(invoiceNumber(o)),
        csvCell(orderIdOf(o)),
        csvCell(protocolOf(o)),
        csvCell(o.total),
        csvCell(labelFor(o.status)),
        csvCell(attemptsOf(o)),
        csvCell(issuedAtOf(o)),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notas-fiscais-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' notas).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e.message });
  }
}

onMounted(() => {
  if (r) r.load();
});
</script>

<style scoped>
.inv-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* FilterChips */
.inv-chips {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.inv-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
.inv-chip:hover {
  background: rgb(var(--ui-surface-2));
}
.inv-chip[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.inv-chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--ui-muted));
}
.inv-chip[data-tone="success"] .inv-chip-dot { background: rgb(var(--ui-ok)); }
.inv-chip[data-tone="running"] .inv-chip-dot { background: rgb(var(--ui-accent)); }
.inv-chip[data-tone="warning"] .inv-chip-dot { background: rgb(var(--ui-warn)); }
.inv-chip[data-tone="error"] .inv-chip-dot { background: rgb(var(--ui-danger)); }
.inv-chip-count {
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-pill);
  padding: 0 7px;
  min-width: 20px;
  text-align: center;
}
.inv-chip[data-active="true"] .inv-chip-count {
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.16);
}

/* Células */
.inv-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.inv-id-number {
  font-weight: 600;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
.inv-id-order {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.inv-protocol {
  font-size: var(--ui-text-sm);
}
.inv-total {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.inv-attempts {
  font-variant-numeric: tabular-nums;
}
.inv-attempts-hot {
  color: rgb(var(--ui-warn));
  font-weight: 600;
}
.inv-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
}
.inv-noxml {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  cursor: default;
}

/* Detalhe */
.inv-detail {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
}
.inv-detail-row {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.inv-detail-row:last-child {
  border-bottom: none;
}
.inv-detail dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.inv-detail dd {
  margin: 0;
}

@media (max-width: 980px) {
  .inv-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .inv-kpis {
    grid-template-columns: 1fr;
  }
  .inv-detail-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
