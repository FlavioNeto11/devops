<template>
  <UiPageLayout
    :title="client ? client.razao_social : 'Carregando…'"
    eyebrow="Cliente NF"
    :subtitle="client ? client.cnpj : ''"
    width="wide"
    :loading="loadingClient"
    :error="errorClient"
    @retry="loadClient"
  >
    <template #actions>
      <UiButton variant="ghost" to="/nf-clients">Voltar à lista</UiButton>
    </template>

    <!-- ── KPIs ─────────────────────────────────────────────────────── -->
    <div class="nfc-kpi-row">
      <UiMetricCard
        label="NFs Emitidas"
        :value="kpis.total"
        tone="primary"
        :loading="loadingNf"
        hint="total de notas"
      />
      <UiMetricCard
        label="NFs Canceladas"
        :value="kpis.canceladas"
        tone="error"
        :loading="loadingNf"
        hint="cancelamentos"
      />
      <UiMetricCard
        label="NFs Ativas"
        :value="kpis.ativas"
        tone="success"
        :loading="loadingNf"
        hint="vigentes"
      />
      <UiMetricCard
        label="Valor Total Faturado"
        :value="fmtCurrency(kpis.valorTotal)"
        tone="neutral"
        :loading="loadingNf"
        hint="soma das NFs emitidas"
      />
    </div>

    <!-- ── Abas ──────────────────────────────────────────────────────── -->
    <nav class="nfc-tabs" aria-label="Seções do cliente NF">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="nfc-tab"
        :data-active="activeTab === tab.key ? 'true' : null"
        :aria-current="activeTab === tab.key ? 'page' : undefined"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- ── ABA: DADOS CADASTRAIS ─────────────────────────────────────── -->
    <div v-if="activeTab === 'cadastro'" class="nfc-tab-body">
      <div class="nfc-detail-grid">
        <UiCard title="Identificação" subtitle="Dados fiscais do cliente">
          <dl class="nfc-dl">
            <div class="nfc-dl-row">
              <dt class="nfc-dl-label">Razão Social</dt>
              <dd class="nfc-dl-value">{{ client?.razao_social || '—' }}</dd>
            </div>
            <div class="nfc-dl-row">
              <dt class="nfc-dl-label">CNPJ</dt>
              <dd class="nfc-dl-value nfc-dl-mono">{{ client?.cnpj || '—' }}</dd>
            </div>
            <div class="nfc-dl-row">
              <dt class="nfc-dl-label">Inscrição Estadual</dt>
              <dd class="nfc-dl-value nfc-dl-mono">{{ client?.inscricao_estadual || '—' }}</dd>
            </div>
            <div class="nfc-dl-row">
              <dt class="nfc-dl-label">Inscrição Municipal</dt>
              <dd class="nfc-dl-value nfc-dl-mono">{{ client?.inscricao_municipal || '—' }}</dd>
            </div>
            <div class="nfc-dl-row">
              <dt class="nfc-dl-label">Tipo de Cliente</dt>
              <dd class="nfc-dl-value">
                <UiStatusBadge
                  v-if="client?.tipo_cliente"
                  :status="client.tipo_cliente"
                  :label="tipoClienteLabel(client.tipo_cliente)"
                />
                <span v-else>—</span>
              </dd>
            </div>
          </dl>
        </UiCard>

        <UiCard title="Contato e Localização" subtitle="Endereço e dados de contato">
          <dl class="nfc-dl">
            <div class="nfc-dl-row nfc-dl-row--block">
              <dt class="nfc-dl-label">Endereço</dt>
              <dd class="nfc-dl-value nfc-dl-pre">{{ client?.endereco || '—' }}</dd>
            </div>
            <div class="nfc-dl-row nfc-dl-row--block">
              <dt class="nfc-dl-label">Contato</dt>
              <dd class="nfc-dl-value nfc-dl-pre">{{ client?.contato || '—' }}</dd>
            </div>
          </dl>
        </UiCard>
      </div>
    </div>

    <!-- ── ABA: NOTAS FISCAIS ────────────────────────────────────────── -->
    <div v-if="activeTab === 'nf'" class="nfc-tab-body">
      <UiCard title="Histórico de Notas Fiscais" subtitle="NFs emitidas para este cliente">
        <template #actions>
          <div class="nfc-filter-row">
            <label for="nfc-status-filter" class="nfc-filter-label">Status</label>
            <select
              id="nfc-status-filter"
              class="nfc-select"
              :value="nfStatusFilter"
              aria-label="Filtrar por status"
              @change="e => { nfStatusFilter = e.target.value; applyNfFilters(); }"
            >
              <option value="">Todos</option>
              <option value="emitida">Emitida</option>
              <option value="cancelada">Cancelada</option>
              <option value="pendente">Pendente</option>
            </select>
          </div>
        </template>

        <UiDataTable
          :columns="nfCols"
          :rows="rNf.items.value"
          :loading="rNf.loading.value"
          :error="rNf.error.value"
          row-key="id"
          server-mode
          paginated
          :page="rNf.page.value"
          :page-size="rNf.pageSize.value"
          :total="rNf.total.value"
          clickable-rows
          :sort="rNf.sort.value"
          :empty="{ title: 'Nenhuma nota fiscal', description: 'Ainda não há notas fiscais emitidas para este cliente.' }"
          @update:sort="rNf.setSort"
          @update:page="rNf.setPage"
          @row-click="openNfModal"
          @retry="rNf.load"
        >
          <template #cell-valor_total="{ value }">
            {{ fmtCurrency(value) }}
          </template>
          <template #cell-data_emissao="{ value }">
            {{ fmtDate(value) }}
          </template>
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" :label="statusNfLabel(value)" />
          </template>
          <template #empty-action>
            <UiButton variant="ghost" to="/nf-clients">Ver todos os clientes</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- ── Modal: Detalhe da NF ──────────────────────────────────────── -->
    <UiModal
      :open="!!selectedNf"
      title="Detalhe da Nota Fiscal"
      width="md"
      @update:open="v => { if (!v) selectedNf = null; }"
    >
      <div v-if="selectedNf" class="nfc-modal-body">
        <div class="nfc-modal-row">
          <span class="nfc-modal-label">Número</span>
          <span class="nfc-modal-value nfc-dl-mono">{{ selectedNf.numero || '—' }}</span>
        </div>
        <div class="nfc-modal-row">
          <span class="nfc-modal-label">Série</span>
          <span class="nfc-modal-value">{{ selectedNf.serie || '—' }}</span>
        </div>
        <div class="nfc-modal-row">
          <span class="nfc-modal-label">Emissão</span>
          <span class="nfc-modal-value">{{ fmtDate(selectedNf.data_emissao) }}</span>
        </div>
        <div class="nfc-modal-row">
          <span class="nfc-modal-label">Competência</span>
          <span class="nfc-modal-value">{{ fmtDate(selectedNf.data_competencia) }}</span>
        </div>
        <div class="nfc-modal-row">
          <span class="nfc-modal-label">Valor Total</span>
          <span class="nfc-modal-value nfc-modal-value--strong">{{ fmtCurrency(selectedNf.valor_total) }}</span>
        </div>
        <div class="nfc-modal-row">
          <span class="nfc-modal-label">Status</span>
          <UiStatusBadge :status="selectedNf.status" :label="statusNfLabel(selectedNf.status)" with-dot />
        </div>
        <div v-if="selectedNf.chave_acesso" class="nfc-modal-row nfc-modal-row--block">
          <span class="nfc-modal-label">Chave de Acesso</span>
          <span class="nfc-modal-value nfc-dl-mono nfc-chave">{{ selectedNf.chave_acesso }}</span>
        </div>
        <div v-if="selectedNf.descricao" class="nfc-modal-row nfc-modal-row--block">
          <span class="nfc-modal-label">Descrição</span>
          <span class="nfc-modal-value">{{ selectedNf.descricao }}</span>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="selectedNf = null">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton,
  UiModal, UiStatusBadge,
  useResource, useToast,
  format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// ── rota ────────────────────────────────────────────────────────────────────
const route = useRoute();
const clientId = computed(() => route.params.id);

// ── apis ─────────────────────────────────────────────────────────────────────
const apiNfClients = resourceFactory('nf-clients');
const apiNf        = resourceFactory('nf');

// ── composables ──────────────────────────────────────────────────────────────
const toast = useToast();

// ── estado do cliente ────────────────────────────────────────────────────────
const client        = ref(null);
const loadingClient = ref(true);
const errorClient   = ref(null);

async function loadClient() {
  loadingClient.value = true;
  errorClient.value = null;
  try {
    client.value = await apiNfClients.get(clientId.value);
  } catch (e) {
    errorClient.value = e;
    toast.error(e?.message || 'Erro ao carregar dados do cliente.');
  } finally {
    loadingClient.value = false;
  }
}

// ── abas ─────────────────────────────────────────────────────────────────────
const tabs = [
  { key: 'cadastro', label: 'Dados Cadastrais' },
  { key: 'nf',       label: 'Notas Fiscais' },
];
const activeTab = ref('cadastro');

// ── KPIs calculados a partir das NFs ────────────────────────────────────────
const loadingNf = ref(false);
const kpis = ref({ total: 0, canceladas: 0, ativas: 0, valorTotal: 0 });

async function loadKpis() {
  loadingNf.value = true;
  try {
    // busca todas as NFs do cliente para cálculo de totais
    const res = await apiNf.list({ nf_client_id: clientId.value, pageSize: 9999 });
    const rows = Array.isArray(res) ? res : (res.data || []);
    const canceladas = rows.filter(r => (r.status || '').toLowerCase() === 'cancelada').length;
    const ativas = rows.filter(r => (r.status || '').toLowerCase() !== 'cancelada').length;
    const valorTotal = rows
      .filter(r => (r.status || '').toLowerCase() !== 'cancelada')
      .reduce((s, r) => s + Number(r.valor_total || 0), 0);
    kpis.value = { total: rows.length, canceladas, ativas, valorTotal };
  } catch {
    kpis.value = { total: 0, canceladas: 0, ativas: 0, valorTotal: 0 };
  } finally {
    loadingNf.value = false;
  }
}

// ── Notas Fiscais: tabela paginada ───────────────────────────────────────────
const nfStatusFilter = ref('');

const rNf = useResource({
  list: (params) => apiNf.list({
    ...params,
    nf_client_id: clientId.value,
    ...(nfStatusFilter.value ? { status: nfStatusFilter.value } : {}),
  }),
  get:    apiNf.get,
  create: apiNf.create,
  update: apiNf.update,
  remove: apiNf.remove,
});

function applyNfFilters() {
  rNf.setFilters({ nf_client_id: clientId.value, ...(nfStatusFilter.value ? { status: nfStatusFilter.value } : {}) });
}

const nfCols = [
  { key: 'numero',         label: 'Número',      sortable: true },
  { key: 'serie',          label: 'Série' },
  { key: 'data_emissao',   label: 'Emissão',     sortable: true },
  { key: 'valor_total',    label: 'Valor Total',  align: 'right' },
  { key: 'status',         label: 'Status' },
];

// ── modal de detalhe de NF ──────────────────────────────────────────────────
const selectedNf = ref(null);
function openNfModal(row) { selectedNf.value = row; }

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtCurrency = (v) => format.formatCurrency(v ?? 0);
const fmtDate = (d) => d ? format.formatDate(d) : '—';

function tipoClienteLabel(tipo) {
  const map = {
    empresa:         'Empresa',
    consumidor_final: 'Consumidor Final',
    orgao_publico:   'Órgão Público',
  };
  return map[tipo] || tipo || '—';
}

function statusNfLabel(status) {
  const map = {
    emitida:   'Emitida',
    cancelada: 'Cancelada',
    pendente:  'Pendente',
  };
  return map[(status || '').toLowerCase()] || status || '—';
}

// ── inicialização ────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadClient();
  loadKpis();
  rNf.load();
});
</script>

<style scoped>
/* ── KPI row ────────────────────────────────────────────────────────── */
.nfc-kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
  margin-bottom: var(--ui-space-2);
}

/* ── Abas ────────────────────────────────────────────────────────────── */
.nfc-tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid rgb(var(--ui-border));
  overflow-x: auto;
  flex-wrap: nowrap;
  scrollbar-width: none;
}
.nfc-tabs::-webkit-scrollbar { display: none; }

.nfc-tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  padding: var(--ui-space-3) var(--ui-space-4);
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 500;
  color: rgb(var(--ui-muted));
  cursor: pointer;
  white-space: nowrap;
  transition: color .15s, border-color .15s;
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
}
.nfc-tab:hover { color: rgb(var(--ui-fg)); }
.nfc-tab:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.nfc-tab[data-active="true"] {
  color: rgb(var(--ui-accent-strong));
  border-bottom-color: rgb(var(--ui-accent-strong));
  font-weight: 700;
}

/* ── Tab body ────────────────────────────────────────────────────────── */
.nfc-tab-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Detail grid ─────────────────────────────────────────────────────── */
.nfc-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
}
@media (max-width: 860px) {
  .nfc-detail-grid { grid-template-columns: 1fr; }
}

/* ── Definition list ─────────────────────────────────────────────────── */
.nfc-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.nfc-dl-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.nfc-dl-row:last-child { border-bottom: none; }
.nfc-dl-row--block {
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ui-space-1);
}
.nfc-dl-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-weight: 500;
  flex-shrink: 0;
}
.nfc-dl-value {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
}
.nfc-dl-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  letter-spacing: 0.03em;
}
.nfc-dl-pre {
  white-space: pre-wrap;
  text-align: left;
  line-height: 1.6;
}

/* ── Filtros inline da tabela ────────────────────────────────────────── */
.nfc-filter-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.nfc-filter-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-weight: 500;
  white-space: nowrap;
}
.nfc-select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 6px 10px;
  font: inherit;
  font-size: var(--ui-text-sm);
  cursor: pointer;
}
.nfc-select:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 1px;
}

/* ── Modal body ──────────────────────────────────────────────────────── */
.nfc-modal-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.nfc-modal-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
  font-size: var(--ui-text-sm);
}
.nfc-modal-row:last-child { border-bottom: none; }
.nfc-modal-row--block {
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ui-space-1);
}
.nfc-modal-label {
  color: rgb(var(--ui-muted));
  font-weight: 500;
  flex-shrink: 0;
}
.nfc-modal-value {
  color: rgb(var(--ui-fg));
  text-align: right;
}
.nfc-modal-value--strong {
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-base);
}
.nfc-chave {
  font-size: var(--ui-text-xs);
  letter-spacing: 0.04em;
  word-break: break-all;
  text-align: left;
}
</style>
