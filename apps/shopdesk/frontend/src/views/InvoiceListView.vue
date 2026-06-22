<!--
  InvoiceListView — Notas fiscais (NF-e) · REQ-SHOPDESK-0004.
  Lista de NF-e emitidas/em processamento/rejeitadas/DLQ com situação SEFAZ, protocolo
  e número, filtro por situação + busca + período, chips de situação (FilterChips) e link
  para baixar o XML (DownloadXmlLink). Reprocessar (rejeitada/DLQ) é AÇÃO SENSÍVEL: passa
  por confirmação (useConfirm) e reemite via POST /v1/invoices.

  Tudo sobre o kit ui-vue (tokens --ui-*), CSP-safe (sem style inline / :style / v-html,
  estado visual só por class + data-*), TODOS os estados (loading skeleton / empty com CTA /
  error com retry / degradado honesto / normal) e a11y (labels, aria-pressed nos chips,
  navegação por teclado, foco visível do kit).

  CONTRATO REAL (apps/shopdesk/api/src/server.js + openapi/openapi.yaml):
    POST /v1/invoices  → emite/reemite a NF-e (api.invoices.emit/reprocess; api.store.emitInvoice).
  GET /v1/invoices (lista) e GET /v1/invoices/:id (detalhe) NÃO são CRUD garantido — `invoices`
  não é entidade no repositório (ver repositories/entities.js). Por isso esta tela consome a
  LEITURA de forma DEFENSIVA: só usa api.invoices.list/get quando o integrador os expõe; sem
  o endpoint de lista, entra num estado DEGRADADO honesto (sem inventar rota). Quando a esteira
  publicar GET /v1/invoices, a tela passa a listar sem nenhuma alteração.

  Rotas usadas (todas de DOMÍNIO, registradas no router): /invoices (esta), /invoices/new
  (emitir), /invoices/:id (detalhe — recebe a nota via router state), /orders/:id (pedido).
-->
<template>
  <UiPageLayout
    eyebrow="Fiscal"
    title="Notas fiscais"
    subtitle="Acompanhe a emissão de NF-e: enfileiradas, em processamento, autorizadas, rejeitadas ou na fila morta (DLQ). Filtre por situação, busque e baixe o XML."
    width="wide"
    :error="r && r.error.value"
    @retry="reload"
  >
    <!-- Ações de cabeçalho -->
    <template #actions>
      <UiButton variant="primary" to="/invoices/new">
        <template #icon-left><span aria-hidden="true">＋</span></template>
        Emitir NF-e
      </UiButton>
      <UiButton
        v-if="listAvailable"
        variant="ghost"
        :loading="r && r.loading.value"
        @click="reload"
      >
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton
        v-if="listAvailable"
        variant="subtle"
        :disabled="!filteredRows.length || (r && r.loading.value)"
        @click="exportCsv"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
    </template>

    <!-- Filtros estruturados — só quando o recurso de lista está disponível. -->
    <template v-if="listAvailable" #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- ESTADO DEGRADADO: o recurso de LISTA (GET /v1/invoices) ainda não foi exposto.
         Honesto: não inventamos rota nem deixamos a tela quebrar; oferecemos o caminho real. -->
    <template v-if="!listAvailable">
      <UiCard title="Consulta de notas indisponível" subtitle="O que dá para fazer agora">
        <UiEmptyState
          title="Listagem de NF-e ainda não exposta"
          :description="unavailableReason"
          icon="doc"
        >
          <template #action>
            <UiButton variant="primary" to="/invoices/new">Emitir uma NF-e</UiButton>
          </template>
        </UiEmptyState>
      </UiCard>
    </template>

    <!-- TELA NORMAL -->
    <template v-else>
      <!-- KPIs derivados das notas REAIS carregadas. Escopo HONESTO: refletem a página
           carregada (server-mode paginado), por isso o hint diz "nesta página". -->
      <div class="inv-kpis" role="group" aria-label="Indicadores de notas fiscais nesta página">
        <UiMetricCard
          label="Autorizadas"
          :value="kpis.autorizada"
          tone="success"
          hint="Com protocolo SEFAZ · nesta página"
          :loading="r.loading.value"
        />
        <UiMetricCard
          label="Em processamento"
          :value="kpis.processando"
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

      <!-- FilterChips: filtro rápido por situação, sincronizado com o filtro do servidor.
           As contagens vêm das linhas reais da página. -->
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
        <button
          v-if="activeStatus || hasLocalFilter || filters.q"
          type="button"
          class="inv-chip inv-chip-clear"
          @click="onClear"
        >
          Limpar
        </button>
      </div>

      <!-- Tabela de NF-e -->
      <UiCard title="Lista de NF-e" :subtitle="resultSummary">
        <template #actions>
          <UiStatusBadge
            v-if="hasLocalFilter"
            tone="running"
            status="Filtro local ativo"
            label="Filtro de período (local)"
            :with-dot="true"
          />
        </template>

        <UiDataTable
          :columns="columns"
          :rows="filteredRows"
          row-key="rowKey"
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
              <span class="inv-id-number ui-mono">{{ invoiceNumber(row) || 'sem número' }}</span>
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

          <!-- Situação: tom EXPLÍCITO pelo enum (o status-map resolve no masculino e
               erra autorizada/rejeitada/enfileirada do domínio feminino). -->
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
              <!-- DownloadXmlLink: baixa quando há XML real na linha; senão indica o motivo. -->
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
                :loading="busyId === keyOf(row)"
                @click="reprocess(row)"
              >
                Reprocessar
              </UiButton>
            </div>
          </template>

          <!-- Sem resultados (após filtro ou base vazia) -->
          <template #empty-action>
            <UiButton v-if="hasAnyFilter" variant="ghost" @click="onClear">Limpar filtros</UiButton>
            <UiButton v-else variant="primary" to="/invoices/new">Emitir a primeira NF-e</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </template>

    <!-- Modal: detalhe rápido da nota (pré-visualização). "Abrir página" leva à rota de
         domínio /invoices/:id, passando a nota via router state (contrato da DetailView). -->
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
          <dt>Emitida em</dt>
          <dd>{{ format.formatDateTime(issuedAtOf(detail)) }}</dd>
        </div>
      </dl>
      <template #footer>
        <UiButton
          v-if="detail && orderIdOf(detail)"
          variant="ghost"
          @click="goToOrder(detail)"
        >
          <template #icon-left><span aria-hidden="true">↗</span></template>
          Ver pedido
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
          :loading="busyId === keyOf(detail)"
          @click="reprocess(detail)"
        >
          Reprocessar
        </UiButton>
        <UiButton variant="ghost" @click="openDetailPage(detail)">
          <template #icon-left><span aria-hidden="true">↗</span></template>
          Abrir página
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

// ---------------------------------------------------------------------------
// Consumo DEFENSIVO da leitura de NF-e. O backend REAL expõe só POST /v1/invoices.
// GET /v1/invoices (lista) só é usado se o integrador injetar api.invoices.list —
// senão a tela degrada honestamente, sem inventar rota nem quebrar o useResource.
// ---------------------------------------------------------------------------
const invoicesApi =
  api.invoices && typeof api.invoices.list === 'function' ? api.invoices : null;
const listAvailable = computed(() => invoicesApi !== null);
const unavailableReason =
  'O recurso de consulta de notas (GET /v1/invoices) ainda não está exposto por esta API — ' +
  'apenas a emissão (POST /v1/invoices) está disponível. Assim que a esteira publicar o endpoint ' +
  'de listagem, esta tela passa a exibir as notas automaticamente, sem nenhuma alteração.';

// useResource só é instanciado quando há recurso real (nunca passamos undefined).
const r = invoicesApi
  ? useResource(invoicesApi, { pageSize: 25, sort: { key: 'issuedAt', dir: 'desc' } })
  : null;

function reload() {
  if (r) r.load();
}

// ---------------------------------------------------------------------------
// Enum da situação da NF-e — rótulos legíveis e TOM explícito. O status-map do kit
// casa por substring no masculino (autorizado/rejeitado/enfileirado) e erra o feminino
// do domínio; por isso passamos :tone explícito para travar a hierarquia visual.
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

// O backend pode serializar em snake_case (order_id, issued_at) ou camelCase.
// Leitura tolerante, sem inventar dados.
const pick = (row, ...keys) => {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return null;
};
const orderIdOf = (row) => pick(row, 'orderId', 'order_id');
const invoiceNumber = (row) => pick(row, 'number', 'nfe_number', 'numero');
const protocolOf = (row) => pick(row, 'protocol', 'protocolo');
const issuedAtOf = (row) => pick(row, 'issuedAt', 'issued_at', 'createdAt', 'created_at');
const attemptsOf = (row) => {
  const a = pick(row, 'attempts', 'tentativas');
  return a == null ? 0 : Number(a);
};
// Chave estável por linha (id real do backend ou, na falta, o pedido) — usada como
// row-key da tabela e como alvo do estado de "ocupado" por ação.
const keyOf = (row) => (row && row.id != null ? row.id : orderIdOf(row) || invoiceNumber(row) || '');

// ---------------------------------------------------------------------------
// Colunas. number/protocol/status/total/attempts/issuedAt usam slots ou format.
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
// Filtros estruturados. q (busca) e status vão ao SERVIDOR; o período (from/to)
// é refinado no cliente sobre as linhas REAIS da página, com aviso visível.
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
// Linhas da página (server-mode). Garantimos uma rowKey estável para o DataTable
// (algumas notas podem chegar sem `id`), sem mutar o objeto original do backend.
// ---------------------------------------------------------------------------
const pageRows = computed(() =>
  (r ? r.items.value : []).map((row, i) => ({ ...row, rowKey: keyOf(row) || 'row-' + i })),
);

// FilterChips — alterna o filtro de situação do servidor; contagens das linhas reais.
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

// Refino local por período, sobre a página carregada.
const hasLocalFilter = computed(() => !!(filters.value.from || filters.value.to));
const hasAnyFilter = computed(
  () => hasLocalFilter.value || !!activeStatus.value || !!filters.value.q,
);
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

// KPIs derivados das linhas exibidas (escopo honesto: nesta página).
const kpis = computed(() => {
  const rows = filteredRows.value;
  const by = (v) => rows.filter((x) => x.status === v).length;
  return {
    autorizada: by('autorizada'),
    processando: by('processando') + by('enfileirada'),
    rejeitada: by('rejeitada'),
    dlq: by('dlq'),
  };
});
const resultSummary = computed(() => {
  if (!r) return '';
  if (r.loading.value) return 'Carregando…';
  const shown = filteredRows.value.length;
  if (!r.total.value) return 'Nenhuma nota emitida';
  if (hasLocalFilter.value) return shown + ' de ' + pageRows.value.length + ' nesta página (filtro de período)';
  return shown + ' nesta página · ' + r.total.value + ' no total';
});
const emptyState = computed(() =>
  hasAnyFilter.value
    ? { title: 'Nenhuma nota no filtro', description: 'Ajuste a situação, a busca ou o período.', icon: 'search' }
    : { title: 'Nenhuma NF-e ainda', description: 'As notas fiscais aparecerão aqui assim que forem emitidas pela loja.', icon: 'doc' },
);

// Tentativas: destaca retentativas acumuladas.
const attemptsClass = (row) => (attemptsOf(row) > 1 ? 'inv-attempts inv-attempts-hot' : 'inv-attempts');

// ---------------------------------------------------------------------------
// DownloadXmlLink. Honesto: só baixa quando a linha carrega o XML real (campo `xml`).
// A listagem realisticamente não embute o XML por linha (custo); até a esteira expor
// uma rota de download dedicada, mostramos o indicador "XML —" com o motivo.
// ---------------------------------------------------------------------------
const hasXml = (row) => typeof (row && row.xml) === 'string' && row.xml.length > 0;
const xmlHint = (row) =>
  row && row.status === 'autorizada'
    ? 'XML completo indisponível na listagem; abra o detalhe ou aguarde a rota de download.'
    : 'O XML fica disponível apenas após a autorização da SEFAZ.';

function downloadXml(row) {
  if (!hasXml(row)) {
    toast.warning('XML indisponível para esta nota.');
    return;
  }
  try {
    const name = 'nfe-' + (invoiceNumber(row) || orderIdOf(row) || keyOf(row)) + '.xml';
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
// Detalhe rápido (modal). Refina com api.invoices.get quando existir; senão usa
// a linha já carregada. "Abrir página" navega para /invoices/:id (rota de domínio),
// passando a nota via router state — contrato lido pela InvoiceDetailView.
// ---------------------------------------------------------------------------
const detailOpen = ref(false);
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
let lastDetailId = null;
const detailTitle = computed(() =>
  detail.value ? 'NF-e ' + (invoiceNumber(detail.value) || 'do pedido ' + (orderIdOf(detail.value) || '—')) : 'Nota fiscal',
);

async function openDetail(row) {
  detailOpen.value = true;
  lastDetailId = row.id != null ? row.id : null;
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
function openDetailPage(row) {
  if (!row) return;
  const id = row.id != null ? String(row.id) : orderIdOf(row) || invoiceNumber(row);
  if (!id) {
    toast.warning('Sem identificador para abrir a página da nota.');
    return;
  }
  router.push({ name: 'invoice', params: { id: String(id) }, state: { invoice: { ...row } } });
}
function goToOrder(row) {
  const oid = orderIdOf(row);
  if (!oid) return;
  router.push({ name: 'order', params: { id: String(oid) } });
}

// ---------------------------------------------------------------------------
// Reprocessar (AÇÃO SENSÍVEL): só para rejeitadas/DLQ. Confirmação (useConfirm) +
// reemissão REAL via POST /v1/invoices (api.invoices.reprocess/emit; fallback store).
// ---------------------------------------------------------------------------
const REPROCESSABLE = new Set(['rejeitada', 'dlq']);
const canReemit =
  (api.invoices && typeof api.invoices.reprocess === 'function') ||
  (api.invoices && typeof api.invoices.emit === 'function') ||
  (api.store && typeof api.store.emitInvoice === 'function');
const canReprocess = (row) => REPROCESSABLE.has(row && row.status) && canReemit;

const busyId = ref(null);
async function reprocess(row) {
  if (!canReprocess(row)) return;
  const orderId = orderIdOf(row) || row.id;
  const ok = await confirm({
    title: 'Reprocessar emissão',
    message:
      'Reenviar a NF-e do pedido ' +
      (orderId || '—') +
      ' para a SEFAZ? Uma nova tentativa de emissão será disparada.',
    confirmLabel: 'Reprocessar',
    danger: true,
  });
  if (!ok) return;
  busyId.value = keyOf(row);
  try {
    const total = Number(row.total) || 0;
    if (api.invoices && typeof api.invoices.reprocess === 'function') {
      await api.invoices.reprocess(orderId, total);
    } else if (api.invoices && typeof api.invoices.emit === 'function') {
      await api.invoices.emit(orderId, total);
    } else {
      await api.store.emitInvoice(orderId, total);
    }
    toast.success('Reprocessamento da NF-e do pedido ' + (orderId || '—') + ' disparado.');
    if (detail.value && keyOf(detail.value) === keyOf(row)) detailOpen.value = false;
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
  align-items: center;
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
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
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
.inv-chip-clear {
  color: rgb(var(--ui-muted));
  border-style: dashed;
}

/* Células */
.inv-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.inv-id-number {
  font-weight: 600;
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

/* Detalhe (modal) */
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
