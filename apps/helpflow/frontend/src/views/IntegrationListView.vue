<template>
  <UiPageLayout
    eyebrow="Gateway de integrações"
    title="Integrações"
    subtitle="Conexões externas (e-mail, telefonia, webhook, central) roteadas pelo gateway centralizado do service desk."
    width="wide"
    :error="r.error.value"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">
        <template #icon-left><span class="ifl-ico" aria-hidden="true">↻</span></template>
        Recarregar
      </UiButton>
      <UiButton to="/integrations/new">
        <template #icon-left><span class="ifl-ico" aria-hidden="true">＋</span></template>
        Nova integração
      </UiButton>
    </template>

    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- Resumo de saúde do parque de integrações (derivado dos dados carregados) -->
    <section class="ifl-kpis" aria-label="Resumo de situação das integrações">
      <UiMetricCard
        label="Total de integrações"
        :value="kpis.total"
        :loading="r.loading.value"
        tone="primary"
        hint="conexões cadastradas"
      />
      <UiMetricCard
        label="Ativas"
        :value="kpis.active"
        :loading="r.loading.value"
        tone="success"
        :hint="pageScopedHint('operando normalmente')"
      />
      <UiMetricCard
        label="Degradadas"
        :value="kpis.degraded"
        :loading="r.loading.value"
        tone="warning"
        :hint="pageScopedHint('responder com atenção')"
      />
      <UiMetricCard
        label="Inativas"
        :value="kpis.inactive"
        :loading="r.loading.value"
        tone="error"
        :hint="pageScopedHint('fora do ar')"
      />
    </section>

    <UiCard title="Conexões externas" :subtitle="tableSubtitle">
      <UiDataTable
        :columns="columns"
        :rows="r.items.value"
        :loading="r.loading.value"
        row-key="id"
        density="comfortable"
        clickable-rows
        server-mode
        :sort="r.sort.value"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        :empty="emptyState"
        @update:sort="r.setSort"
        @update:page="r.setPage"
        @update:page-size="onPageSize"
        @row-click="openDetails"
      >
        <!-- Nome + tipo legível -->
        <template #cell-name="{ row }">
          <div class="ifl-name">
            <span class="ifl-name-main">{{ row.name || '—' }}</span>
            <span class="ifl-name-kind">{{ kindLabel(row.kind) }}</span>
          </div>
        </template>

        <!-- Situação: HealthDot (reflete último teste do gateway) + StatusBadge configurado -->
        <template #cell-status="{ row }">
          <span class="ifl-status">
            <span class="ifl-dot" :data-tone="healthDotTone(row)" aria-hidden="true" />
            <UiStatusBadge
              :status="row.status"
              :tone="statusTone(row.status)"
              :label="statusText(row.status)"
              :with-dot="false"
              size="sm"
            />
          </span>
        </template>

        <!-- URL base (monoespaçada, truncada via classe) -->
        <template #cell-base_url="{ value }">
          <span v-if="value" class="ifl-url ui-mono" :title="value">{{ value }}</span>
          <span v-else class="ifl-faint">—</span>
        </template>

        <!-- Resiliência: timeout + retries -->
        <template #cell-resilience="{ row }">
          <span class="ifl-resil">
            <span class="ifl-resil-pill">{{ formatTimeout(row.timeout_ms) }}</span>
            <span class="ifl-resil-sep" aria-hidden="true">·</span>
            <span class="ifl-resil-pill">{{ formatRetries(row.retries) }}</span>
          </span>
        </template>

        <!-- Última sincronização: timestamp da auditoria (quando disponível) + latência -->
        <template #cell-last_check_at="{ row, value }">
          <span class="ifl-sync-cell">
            <span :class="(row.connection_health?.checked_at || value) ? 'ifl-check' : 'ifl-faint'">
              {{ formatLastSync(row) }}
            </span>
            <span v-if="row.connection_health?.latency_ms != null" class="ifl-latency">
              {{ row.connection_health.latency_ms }}&nbsp;ms
            </span>
          </span>
        </template>

        <!-- Ação por linha: afordância FOCÁVEL para abrir o detalhe (a linha clicável
             do kit não é alcançável por teclado). RouterLink p/ a rota de detalhe
             existente. @click.stop evita disparar o @row-click (modal) junto. -->
        <template #cell-actions="{ row }">
          <span class="ifl-rowactions" @click.stop>
            <UiButton variant="subtle" size="sm" :to="'/integrations/' + row.id">Abrir</UiButton>
          </span>
        </template>

        <template #empty-action>
          <UiButton to="/integrations/new">Cadastrar primeira integração</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Detalhe da integração (somente leitura — usa a linha já carregada, sem novo endpoint) -->
    <UiModal v-model="detailsOpen" :title="selected ? selected.name : 'Integração'" width="lg">
      <div v-if="selected" class="ifl-detail">
        <div class="ifl-detail-head">
          <span class="ifl-dot ifl-dot-lg" :data-tone="healthDotTone(selected)" aria-hidden="true" />
          <UiStatusBadge
            :status="selected.status"
            :tone="statusTone(selected.status)"
            :label="statusText(selected.status)"
            :with-dot="false"
          />
          <span class="ifl-detail-kind">{{ kindLabel(selected.kind) }}</span>
        </div>

        <dl class="ifl-dl">
          <div class="ifl-dl-row">
            <dt>Nome</dt>
            <dd>{{ selected.name || '—' }}</dd>
          </div>
          <div class="ifl-dl-row">
            <dt>Tipo</dt>
            <dd>{{ kindLabel(selected.kind) }}</dd>
          </div>
          <div class="ifl-dl-row">
            <dt>URL base</dt>
            <dd>
              <span v-if="selected.base_url" class="ui-mono">{{ selected.base_url }}</span>
              <span v-else class="ifl-faint">não definida</span>
            </dd>
          </div>
          <div class="ifl-dl-row">
            <dt>Timeout</dt>
            <dd>{{ formatTimeout(selected.timeout_ms) }}</dd>
          </div>
          <div class="ifl-dl-row">
            <dt>Tentativas</dt>
            <dd>{{ formatRetries(selected.retries) }}</dd>
          </div>
          <div class="ifl-dl-row">
            <dt>Última sincronização</dt>
            <dd>{{ formatLastSync(selected) }}</dd>
          </div>
          <div v-if="selected.connection_health" class="ifl-dl-row">
            <dt>Saúde da conexão</dt>
            <dd>
              <span class="ifl-status">
                <span class="ifl-dot" :data-tone="selected.connection_health.ok ? 'success' : 'error'" aria-hidden="true" />
                <span>{{ selected.connection_health.ok ? 'Conexão OK' : 'Conexão falhou' }}</span>
                <span v-if="selected.connection_health.latency_ms != null" class="ifl-resil-pill ifl-resil-sep-gap">
                  {{ selected.connection_health.latency_ms }}&nbsp;ms
                </span>
                <span v-if="selected.connection_health.status_code" class="ifl-resil-pill">
                  HTTP {{ selected.connection_health.status_code }}
                </span>
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="detailsOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiFiltersPanel,
  UiStatusBadge,
  UiButton,
  UiModal,
  useResource,
  useToast,
  format,
} from '../ui/index.js';
import { integrations as integrationsApi } from '../api.js';

// Wraps the list call to include ?withStatus=true, returning each integration enriched
// with connection_health (latest gateway audit result: ok, status_code, latency_ms,
// checked_at). Parâmetro transparente para o useResource (sobrevive a filter clears).
const integrations = {
  ...integrationsApi,
  list: (params) => integrationsApi.list({ ...params, withStatus: 'true' }),
};

const toast = useToast();
const r = useResource(integrations, { pageSize: 25, sort: { key: 'name', dir: 'asc' } });

// --- Tipos de integração (rótulos legíveis para os enums do backend) ---
const KIND_LABELS = {
  email: 'E-mail',
  telephony: 'Telefonia',
  webhook: 'Webhook',
  external_central: 'Central externa',
  chat: 'Chat',
};
const kindLabel = (k) => KIND_LABELS[k] || format.humanize(k) || '—';

// --- Situação (tom semântico estável; "degraded" não está no mapa genérico) ---
const STATUS_LABELS = { active: 'Ativa', degraded: 'Degradada', inactive: 'Inativa' };
const STATUS_TONES = { active: 'success', degraded: 'warning', inactive: 'error' };
const statusTone = (s) => STATUS_TONES[s] || 'neutral';
const statusText = (s) => STATUS_LABELS[s] || format.humanize(s) || '—';

// Tom do ponto de saúde: prioriza o último resultado do gateway (connection_health.ok)
// quando disponível; cai no status armazenado quando não há auditoria ainda.
const healthDotTone = (row) => {
  if (row.connection_health) return row.connection_health.ok ? 'success' : 'error';
  return statusTone(row.status);
};

// --- Colunas ---
const columns = [
  { key: 'name', label: 'Integração', sortable: true },
  { key: 'base_url', label: 'URL base' },
  { key: 'resilience', label: 'Resiliência' },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'last_check_at', label: 'Última sincronização', sortable: true, align: 'right' },
  { key: 'actions', label: '', align: 'right' },
];

// --- Filtros ---
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'nome ou URL' },
  {
    key: 'kind',
    label: 'Tipo',
    type: 'select',
    options: [
      { value: 'email', label: 'E-mail' },
      { value: 'telephony', label: 'Telefonia' },
      { value: 'webhook', label: 'Webhook' },
      { value: 'external_central', label: 'Central externa' },
      { value: 'chat', label: 'Chat' },
    ],
  },
  {
    key: 'status',
    label: 'Situação',
    type: 'select',
    options: [
      { value: 'active', label: 'Ativa' },
      { value: 'degraded', label: 'Degradada' },
      { value: 'inactive', label: 'Inativa' },
    ],
  },
];
const filters = ref({ q: '', kind: '', status: '' });
const applyFilters = () => r.setFilters({ ...filters.value });
// "Limpar" precisa ZERAR o v-model local (o @clear do painel não o faz por nós);
// só então reaplicamos o filtro vazio ao recurso (padrão da AgentListView.onClear).
const onClear = () => {
  filters.value = { q: '', kind: '', status: '' };
  r.setFilters({ ...filters.value });
};

// --- Formatadores de valor ---
// Usa o timestamp do último resultado de auditoria (connection_health) quando disponível;
// cai no last_check_at armazenado quando ainda não há auditoria.
const formatLastSync = (row) => {
  const ts = row?.connection_health?.checked_at || row?.last_check_at;
  return ts ? format.formatDateTime(ts) : 'Nunca sincronizada';
};
const formatTimeout = (v) =>
  v === null || v === undefined || v === '' ? 'timeout —' : format.formatNumber(v) + ' ms';
const formatRetries = (v) =>
  v === null || v === undefined || v === '' ? '0 tentativas' : format.formatNumber(v) + ' tentativas';

// --- KPIs ---
// "Total" vem do servidor (r.total, todas as páginas). Os contadores por situação
// (active/degraded/inactive) são derivados SÓ da página carregada (máx. pageSize) —
// o backend ainda não expõe agregação. Quando há mais integrações do que cabem na
// página, sinalizamos "nesta página" no hint para não enganar o painel de saúde.
const kpis = computed(() => {
  const rows = r.items.value || [];
  const tally = { total: r.total.value || rows.length, active: 0, degraded: 0, inactive: 0 };
  for (const it of rows) {
    if (it.status === 'active') tally.active += 1;
    else if (it.status === 'degraded') tally.degraded += 1;
    else if (it.status === 'inactive') tally.inactive += 1;
  }
  return tally;
});

// true quando há mais integrações no total do que as exibidas nesta página.
const isPaged = computed(() => (r.total.value || 0) > (r.items.value || []).length);
// Acrescenta a ressalva "· nesta página" aos KPIs page-local quando paginado.
const pageScopedHint = (base) => (isPaged.value ? base + ' · nesta página' : base);

const tableSubtitle = computed(() => {
  const n = r.total.value || 0;
  if (r.loading.value) return 'Carregando conexões…';
  if (!n) return 'Nenhuma conexão cadastrada.';
  return n === 1 ? '1 conexão cadastrada.' : format.formatNumber(n) + ' conexões cadastradas.';
});

const emptyState = {
  title: 'Nenhuma integração',
  description:
    'Ainda não há conexões externas roteadas pelo gateway. As integrações aparecem aqui assim que forem cadastradas.',
  icon: 'link',
};

// --- Detalhe (sem endpoint extra: usa a linha já carregada) ---
const detailsOpen = ref(false);
const selected = ref(null);
const openDetails = (row) => {
  selected.value = row;
  detailsOpen.value = true;
};

// --- Ações ---
async function reload() {
  try {
    await r.load();
    if (!r.error.value) toast.success('Integrações atualizadas.');
  } catch (e) {
    toast.error('Não foi possível atualizar.', { detail: e && e.message });
  }
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

onMounted(r.load);
</script>

<style scoped>
.ifl-ico {
  font-size: 1.05em;
  line-height: 1;
}

/* KPIs */
.ifl-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* Nome + tipo */
.ifl-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ifl-name-main {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.ifl-name-kind {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* HealthDot + status */
.ifl-status {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.ifl-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgb(var(--ui-muted));
  box-shadow: 0 0 0 3px rgb(var(--ui-muted) / 0.16);
}
.ifl-dot[data-tone="success"] {
  background: rgb(var(--ui-ok));
  box-shadow: 0 0 0 3px rgb(var(--ui-ok) / 0.18);
}
.ifl-dot[data-tone="warning"] {
  background: rgb(var(--ui-warn));
  box-shadow: 0 0 0 3px rgb(var(--ui-warn) / 0.2);
}
.ifl-dot[data-tone="error"] {
  background: rgb(var(--ui-danger));
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.18);
}
.ifl-dot-lg {
  width: 12px;
  height: 12px;
}

/* URL */
.ifl-url {
  display: inline-block;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.ifl-faint {
  color: rgb(var(--ui-muted));
}

/* Resiliência */
.ifl-resil {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.ifl-resil-pill {
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: 1px var(--ui-space-2); /* vertical fino (geometria); horizontal via token */
  font-variant-numeric: tabular-nums;
}
.ifl-resil-sep {
  opacity: 0.5;
}

.ifl-check {
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

/* Célula de sincronização: timestamp + latência (gateway health) */
.ifl-sync-cell {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-end;
}
.ifl-latency {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}
.ifl-resil-sep-gap {
  margin-left: var(--ui-space-2);
}

/* Ações por linha (afordância de teclado p/ abrir o detalhe) */
.ifl-rowactions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}

/* Detalhe */
.ifl-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.ifl-detail-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.ifl-detail-kind {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ifl-dl {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  overflow: hidden;
}
.ifl-dl-row {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ifl-dl-row:last-child {
  border-bottom: none;
}
.ifl-dl dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.ifl-dl dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  word-break: break-word;
}

@media (max-width: 860px) {
  .ifl-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
  .ifl-url {
    max-width: 160px;
  }
  .ifl-dl-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
