<template>
  <UiPageLayout
    eyebrow="Comunicação com o cliente"
    title="Notificações"
    subtitle="Histórico de notificações multicanal (e-mail, SMS, push e WhatsApp) disparadas a cada evento de pedido."
    width="wide"
    :error="errorMessage"
    @retry="reload"
  >
    <!-- Ações de cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton
        variant="subtle"
        :disabled="!filteredRows.length || loading"
        @click="exportCsv"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
    </template>

    <!-- Aviso de degradação graciosa: canais pulados por falta de URL configurada -->
    <template v-if="degraded.length && !loading" #banner>
      <div class="ntf-banner" role="status">
        <span class="ntf-banner-icon" aria-hidden="true">⚠</span>
        <div class="ntf-banner-text">
          <strong>Degradação graciosa ativa.</strong>
          {{ degradedLabel }} sem URL de webhook configurada — os envios desses canais são
          <em>pulados</em> em vez de falhar. Configure a URL do canal para reativar a entrega.
        </div>
      </div>
    </template>

    <!-- Filtros (client-side sobre o histórico real carregado) -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="noop"
        @clear="noop"
      />
    </template>

    <!-- KPIs derivados das entregas reais -->
    <div class="ntf-kpis" role="group" aria-label="Indicadores de notificações">
      <UiMetricCard
        label="Entregas"
        :value="kpis.total"
        tone="primary"
        :hint="kpis.events + ' evento(s) notificado(s)'"
        :loading="loading"
      />
      <UiMetricCard
        label="Enviadas"
        :value="kpis.sent"
        tone="success"
        :hint="kpis.deliveryRate + '% de sucesso'"
        :loading="loading"
      />
      <UiMetricCard
        label="Puladas"
        :value="kpis.skipped"
        tone="warning"
        hint="Canal sem URL configurada"
        :loading="loading"
      />
      <UiMetricCard
        label="Falharam"
        :value="kpis.failed"
        tone="error"
        hint="Webhook indisponível ou com erro"
        :loading="loading"
      />
    </div>

    <!-- Tabela: uma linha por canal de cada evento (histórico multicanal) -->
    <UiCard title="Histórico de envios" :subtitle="resultSummary">
      <template #actions>
        <UiStatusBadge
          v-if="hasActiveFilter"
          tone="running"
          status="Filtro ativo"
          :with-dot="true"
        />
      </template>

      <UiDataTable
        :columns="columns"
        :rows="pagedRows"
        row-key="rowId"
        density="comfortable"
        clickable-rows
        :loading="loading"
        :sort="sort"
        :page="page"
        :page-size="pageSize"
        :total="filteredRows.length"
        paginated
        :empty="emptyState"
        @row-click="openDetail"
        @update:sort="onSort"
        @update:page="onPage"
        @update:page-size="onPageSize"
      >
        <!-- Evento que disparou a notificação -->
        <template #cell-event="{ row }">
          <div class="ntf-event">
            <span class="ntf-event-icon" aria-hidden="true">{{ eventIcon(row.event) }}</span>
            <span class="ntf-event-label">{{ eventLabel(row.event) }}</span>
          </div>
        </template>

        <!-- Canal (ChannelBadge) -->
        <template #cell-channel="{ row }">
          <span class="ntf-chan" :data-channel="row.channel">
            <span class="ntf-chan-icon" aria-hidden="true">{{ channelIcon(row.channel) }}</span>
            {{ channelLabel(row.channel) }}
          </span>
        </template>

        <!-- Situação (StatusBadge em pt-BR) -->
        <template #cell-status="{ row }">
          <UiStatusBadge :status="row.status" :tone="toneFor(row.status)" :label="statusLabelPt(row.status)" />
        </template>

        <!-- Enviada em -->
        <template #cell-at="{ value }">
          <span class="ntf-time">{{ format.formatDateTime(value) }}</span>
        </template>

        <!-- Ações por linha -->
        <template #cell-actions="{ row }">
          <div class="ntf-actions" @click.stop>
            <UiButton variant="ghost" size="sm" @click="openDetail(row)">Detalhes</UiButton>
          </div>
        </template>

        <!-- Sem resultados após filtro -->
        <template #empty-action>
          <UiButton v-if="hasActiveFilter" variant="ghost" @click="clearFilters">Limpar filtros</UiButton>
          <UiButton v-else variant="ghost" @click="reload">Recarregar</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Modal: detalhe do evento com TODOS os canais -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <div v-if="detailEvent" class="ntf-detail">
        <dl class="ntf-detail-meta">
          <div class="ntf-detail-row">
            <dt>Evento</dt>
            <dd>
              <span class="ntf-event-icon" aria-hidden="true">{{ eventIcon(detailEvent.event) }}</span>
              {{ eventLabel(detailEvent.event) }}
            </dd>
          </div>
          <div class="ntf-detail-row">
            <dt>Disparado em</dt>
            <dd>{{ format.formatDateTime(detailEvent.at) }}</dd>
          </div>
          <div class="ntf-detail-row">
            <dt>Resultado geral</dt>
            <dd>
              <UiStatusBadge
                :status="detailEvent.status"
                :tone="toneFor(detailEvent.status)"
                :label="statusLabelPt(detailEvent.status)"
              />
            </dd>
          </div>
        </dl>

        <h4 class="ntf-detail-heading">Canais ({{ detailEvent.channels.length }})</h4>
        <ul class="ntf-channels">
          <li v-for="c in detailEvent.channels" :key="c.channel" class="ntf-channel-item">
            <span class="ntf-chan" :data-channel="c.channel">
              <span class="ntf-chan-icon" aria-hidden="true">{{ channelIcon(c.channel) }}</span>
              {{ channelLabel(c.channel) }}
            </span>
            <UiStatusBadge :status="c.status" :tone="toneFor(c.status)" :label="statusLabelPt(c.status)" size="sm" />
          </li>
        </ul>
        <p v-if="detailEvent.channels.some((c) => c.status === 'skipped')" class="ntf-detail-note ui-muted">
          Canais <em>pulados</em> não têm URL de webhook configurada — o sistema degrada graciosamente
          e segue entregando pelos canais disponíveis.
        </p>
      </div>
      <UiEmptyState
        v-else
        title="Sem detalhes"
        description="Selecione um envio na lista para ver os canais."
        icon="🔔"
      />
      <template #footer>
        <UiButton variant="primary" @click="detailOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
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
  useToast,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// ---------------------------------------------------------------------------
// Recurso REAL: GET /v1/notifications → { data: [{ at, event, status, channels:[{channel,status}] }] }.
// O endpoint não pagina/filtra no servidor (retorna as últimas notificações), então
// carregamos o histórico e refinamos no cliente sobre as linhas REAIS.
//
// Leitura com degradação graciosa (espelha OrderDetailView): se o integrador expuser o
// resourceFactory `api.notifications.list`, usamos ele; senão caímos para o endpoint REAL
// de api.js (`api.store.notifications()`, que já desembrulha o envelope .data). Sem nenhum
// dos dois, lançamos um erro honesto em vez de um TypeError opaco. A normalização abaixo
// aceita as duas formas (array cru OU envelope { data | items }).
// ---------------------------------------------------------------------------
const toast = useToast();

async function fetchNotifications() {
  if (api.notifications && typeof api.notifications.list === 'function') {
    return api.notifications.list();
  }
  if (api.store && typeof api.store.notifications === 'function') {
    return api.store.notifications();
  }
  throw new Error('Recurso de notificações indisponível');
}

const events = ref([]); // registros crus por evento (com channels[])
const loading = ref(false);
const error = ref(null);
const errorMessage = computed(() => (error.value ? error.value.message || String(error.value) : null));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetchNotifications();
    const list = Array.isArray(res) ? res : res && (res.data || res.items) ? res.data || res.items : [];
    // normaliza: garante channels[] e ordena do mais recente para o mais antigo.
    events.value = (list || [])
      .map((r) => ({
        at: r.at || r.sentAt || r.created_at || null,
        event: r.event || '',
        status: r.status || deriveStatus(r.channels),
        channels: Array.isArray(r.channels) ? r.channels : [],
      }))
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  } catch (e) {
    error.value = e;
    events.value = [];
  } finally {
    loading.value = false;
  }
}
async function reload() {
  await load();
  if (!error.value) toast.success('Histórico de notificações atualizado.');
  else toast.error('Falha ao atualizar', { detail: errorMessage.value });
}

// status geral derivado dos canais (mesma regra do backend), caso não venha pronto.
function deriveStatus(channels) {
  const cs = Array.isArray(channels) ? channels : [];
  if (cs.some((c) => c.status === 'sent')) return 'sent';
  if (cs.length && cs.every((c) => c.status === 'skipped')) return 'skipped';
  return cs.length ? 'failed' : 'skipped';
}

// ---------------------------------------------------------------------------
// Achatado: uma linha por (evento × canal) = histórico multicanal real.
// rowId estável a partir do evento + timestamp + canal + índice.
// ---------------------------------------------------------------------------
const flatRows = computed(() => {
  const out = [];
  events.value.forEach((ev, ei) => {
    const chans = ev.channels.length ? ev.channels : [{ channel: '—', status: ev.status }];
    chans.forEach((c, ci) => {
      out.push({
        rowId: ei + ':' + ci + ':' + (c.channel || '') + ':' + (ev.at || ''),
        event: ev.event,
        channel: c.channel,
        status: c.status,
        at: ev.at,
        _event: ev, // referência ao registro completo para o detalhe
      });
    });
  });
  return out;
});

// ---------------------------------------------------------------------------
// Rótulos / ícones de domínio (enums conhecidos; humanize como fallback).
// ---------------------------------------------------------------------------
const EVENT_LABELS = {
  'pedido.criado': 'Pedido criado',
  'pagamento.aprovado': 'Pagamento aprovado',
  'pagamento.falhou': 'Pagamento recusado',
  'nf-e.emitida': 'NF-e emitida',
};
const EVENT_ICONS = {
  'pedido.criado': '🛒',
  'pagamento.aprovado': '💳',
  'pagamento.falhou': '⛔',
  'nf-e.emitida': '🧾',
};
const eventLabel = (v) => EVENT_LABELS[v] || format.humanize(v);
const eventIcon = (v) => EVENT_ICONS[v] || '🔔';

const CHANNEL_LABELS = { email: 'E-mail', sms: 'SMS', push: 'Push', whatsapp: 'WhatsApp' };
const CHANNEL_ICONS = { email: '✉', sms: '💬', push: '🔔', whatsapp: '🟢' };
const channelLabel = (v) => CHANNEL_LABELS[v] || format.humanize(v);
const channelIcon = (v) => CHANNEL_ICONS[v] || '📡';

const STATUS_LABELS = { sent: 'Enviada', skipped: 'Pulada', failed: 'Falhou', enviada: 'Enviada', pulada: 'Pulada', falhou: 'Falhou' };
const statusLabelPt = (v) => STATUS_LABELS[v] || format.humanize(v);
// tom explícito: pulada é neutra (degradação esperada), não um erro.
const STATUS_TONES = { sent: 'success', enviada: 'success', skipped: 'neutral', pulada: 'neutral', failed: 'error', falhou: 'error' };
const toneFor = (v) => STATUS_TONES[v] || 'neutral';

// ---------------------------------------------------------------------------
// Filtros (client-side sobre as linhas reais).
// ---------------------------------------------------------------------------
const filterFields = [
  {
    key: 'event',
    label: 'Evento',
    type: 'select',
    options: [
      { value: 'pedido.criado', label: 'Pedido criado' },
      { value: 'pagamento.aprovado', label: 'Pagamento aprovado' },
      { value: 'pagamento.falhou', label: 'Pagamento recusado' },
      { value: 'nf-e.emitida', label: 'NF-e emitida' },
    ],
  },
  {
    key: 'channel',
    label: 'Canal',
    type: 'select',
    options: [
      { value: 'email', label: 'E-mail' },
      { value: 'sms', label: 'SMS' },
      { value: 'push', label: 'Push' },
      { value: 'whatsapp', label: 'WhatsApp' },
    ],
  },
  {
    key: 'status',
    label: 'Situação',
    type: 'select',
    options: [
      { value: 'sent', label: 'Enviada' },
      { value: 'skipped', label: 'Pulada' },
      { value: 'failed', label: 'Falhou' },
    ],
  },
];
const blankFilters = () => ({ event: '', channel: '', status: '' });
const filters = ref(blankFilters());
const hasActiveFilter = computed(() => Object.values(filters.value).some((v) => v));
const noop = () => {};
function clearFilters() {
  filters.value = blankFilters();
}

const filteredRows = computed(() => {
  const f = filters.value;
  return flatRows.value.filter((row) => {
    if (f.event && row.event !== f.event) return false;
    if (f.channel && row.channel !== f.channel) return false;
    if (f.status && row.status !== f.status) return false;
    return true;
  });
});

// reset de página ao mudar filtro.
watch(filteredRows, () => {
  if ((page.value - 1) * pageSize.value >= filteredRows.value.length) page.value = 1;
});

// ---------------------------------------------------------------------------
// Ordenação + paginação locais.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'event', label: 'Evento', sortable: true },
  { key: 'channel', label: 'Canal', sortable: true },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'at', label: 'Enviada em', sortable: true },
  { key: 'actions', label: '', align: 'right' },
];
const sort = ref({ key: 'at', dir: 'desc' });
const page = ref(1);
const pageSize = ref(25);

const sortedRows = computed(() => {
  const s = sort.value;
  if (!s || !s.key) return filteredRows.value;
  const mul = s.dir === 'desc' ? -1 : 1;
  return [...filteredRows.value].sort((a, b) => {
    const x = a[s.key];
    const y = b[s.key];
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * mul;
  });
});
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});
function onSort(s) {
  sort.value = s;
  page.value = 1;
}
function onPage(p) {
  page.value = p;
}
function onPageSize(size) {
  pageSize.value = size;
  page.value = 1;
}

// ---------------------------------------------------------------------------
// KPIs derivados das entregas reais (sobre o filtro corrente).
// ---------------------------------------------------------------------------
const kpis = computed(() => {
  const rows = filteredRows.value;
  const sent = rows.filter((r) => r.status === 'sent').length;
  const skipped = rows.filter((r) => r.status === 'skipped').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const attempted = sent + failed; // tentativas reais (puladas não são tentativa)
  const eventSet = new Set(rows.map((r) => r.event + '|' + r.at));
  return {
    total: rows.length,
    sent,
    skipped,
    failed,
    events: eventSet.size,
    deliveryRate: attempted ? Math.round((sent / attempted) * 100) : 0,
  };
});

// canais distintos atualmente pulados (degradação graciosa).
const degraded = computed(() => {
  const set = new Set();
  for (const r of flatRows.value) if (r.status === 'skipped' && r.channel && r.channel !== '—') set.add(r.channel);
  return [...set];
});
const degradedLabel = computed(() => {
  const names = degraded.value.map(channelLabel);
  if (names.length === 1) return 'O canal ' + names[0] + ' está';
  return 'Os canais ' + names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1] + ' estão';
});

// ---------------------------------------------------------------------------
// Resumo + estado vazio.
// ---------------------------------------------------------------------------
const resultSummary = computed(() => {
  if (loading.value) return 'Carregando…';
  const total = filteredRows.value.length;
  if (!flatRows.value.length) return 'Nenhuma notificação registrada';
  if (hasActiveFilter.value) return total + ' de ' + flatRows.value.length + ' envios (filtro ativo)';
  return total + ' envio(s) em ' + kpis.value.events + ' evento(s)';
});
const emptyState = computed(() =>
  hasActiveFilter.value
    ? { title: 'Nenhum envio no filtro', description: 'Ajuste evento, canal ou situação.', icon: '🔍' }
    : {
        title: 'Nenhuma notificação ainda',
        description: 'Os disparos aparecerão aqui assim que um evento de pedido (criação, pagamento ou NF-e) ocorrer.',
        icon: '🔔',
      },
);

// ---------------------------------------------------------------------------
// Detalhe (modal por evento, sobre o registro já carregado).
// ---------------------------------------------------------------------------
const detailOpen = ref(false);
const detailEvent = ref(null);
const detailTitle = computed(() => (detailEvent.value ? eventLabel(detailEvent.value.event) : 'Notificação'));
function openDetail(row) {
  detailEvent.value = row._event || null;
  detailOpen.value = true;
}

// ---------------------------------------------------------------------------
// Exportar CSV (cliente, CSP-safe via Blob; uma linha por canal).
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
  const head = ['Evento', 'Canal', 'Situação', 'Enviada em'];
  const lines = [head.join(';')];
  for (const r of rows) {
    lines.push(
      [csvCell(eventLabel(r.event)), csvCell(channelLabel(r.channel)), csvCell(statusLabelPt(r.status)), csvCell(r.at)].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notificacoes-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' envios).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e.message });
  }
}

onMounted(load);
</script>

<style scoped>
.ntf-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* Banner de degradação graciosa */
.ntf-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  background: rgb(var(--ui-warn) / 0.1);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4);
  color: rgb(var(--ui-fg));
}
.ntf-banner-icon {
  color: rgb(var(--ui-warn));
  font-size: var(--ui-text-lg);
  line-height: 1.3;
  flex-shrink: 0;
}
.ntf-banner-text {
  font-size: var(--ui-text-sm);
  line-height: 1.5;
}

/* Evento */
.ntf-event {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.ntf-event-icon {
  font-size: var(--ui-text-md);
}
.ntf-event-label {
  font-weight: 600;
}

/* ChannelBadge */
.ntf-chan {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  color: rgb(var(--ui-fg));
  white-space: nowrap;
}
/* Cor por canal: tratamento coerente para os 4 canais (não arbitrário) — cada um
   mapeia para um tom semântico do tema, todos via tokens (CSP-safe pelo data-channel). */
.ntf-chan[data-channel="email"] {
  background: rgb(var(--ui-info) / 0.12);
  border-color: rgb(var(--ui-info) / 0.35);
  color: rgb(var(--ui-info));
}
.ntf-chan[data-channel="sms"] {
  background: rgb(var(--ui-warn) / 0.12);
  border-color: rgb(var(--ui-warn) / 0.35);
  color: rgb(var(--ui-warn));
}
.ntf-chan[data-channel="push"] {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent) / 0.35);
  color: rgb(var(--ui-accent-strong));
}
.ntf-chan[data-channel="whatsapp"] {
  background: rgb(var(--ui-ok) / 0.12);
  border-color: rgb(var(--ui-ok) / 0.35);
  color: rgb(var(--ui-ok));
}
.ntf-chan-icon {
  font-size: var(--ui-text-sm);
  line-height: 1;
}

.ntf-time {
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-muted));
}

.ntf-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}

/* Detalhe */
.ntf-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.ntf-detail-meta {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
}
.ntf-detail-row {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ntf-detail-row:last-child {
  border-bottom: none;
}
.ntf-detail-meta dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.ntf-detail-meta dd {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.ntf-detail-heading {
  margin: 0;
  font-size: var(--ui-text-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-muted));
}
.ntf-channels {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.ntf-channel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.ntf-detail-note {
  margin: 0;
  font-size: var(--ui-text-sm);
  line-height: 1.5;
}

@media (max-width: 980px) {
  .ntf-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .ntf-kpis {
    grid-template-columns: 1fr;
  }
  .ntf-detail-row {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }
}
</style>
