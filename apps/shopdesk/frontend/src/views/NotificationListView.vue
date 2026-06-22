<template>
  <UiPageLayout
    eyebrow="Comunicação com o cliente"
    title="Notificações"
    subtitle="Histórico multicanal (e-mail, SMS, push e WhatsApp) disparado a cada evento de pedido. Canal sem URL de webhook é pulado com graça, sem derrubar os demais."
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
      <UiButton variant="ghost" to="/orders">
        <template #icon-left><span aria-hidden="true">↗</span></template>
        Ver pedidos
      </UiButton>
    </template>

    <!-- Aviso de degradação graciosa: canais pulados por falta de URL configurada -->
    <template v-if="degraded.length && !loading && !errorMessage" #banner>
      <div class="ntf-banner" role="status">
        <span class="ntf-banner-icon" aria-hidden="true">⚠</span>
        <div class="ntf-banner-text">
          <strong>Degradação graciosa ativa.</strong>
          {{ degradedLabel }} sem URL de webhook configurada — os envios desses canais são
          <em>pulados</em> em vez de falhar. Configure o canal em
          <RouterLink class="ntf-banner-link" to="/settings">Configurações</RouterLink> para reativar a entrega.
        </div>
      </div>
    </template>

    <!-- KPIs derivados das entregas reais (filtro corrente) -->
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
        :hint="kpis.deliveryRate + '% das tentativas'"
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
          size="sm"
        />
      </template>

      <!-- FilterChips: situação + canal (acessíveis, CSP-safe) + busca -->
      <div class="ntf-toolbar">
        <div class="ntf-chips" role="group" aria-label="Filtrar por situação">
          <span class="ntf-chips-label">Situação</span>
          <button
            v-for="opt in statusChips"
            :key="opt.value"
            type="button"
            class="ntf-chip"
            :data-tone="opt.tone"
            :data-active="filters.status === opt.value ? 'true' : null"
            :aria-pressed="filters.status === opt.value ? 'true' : 'false'"
            @click="toggleStatus(opt.value)"
          >
            <span class="ntf-chip-dot" aria-hidden="true" />
            {{ opt.label }}
            <span class="ntf-chip-count">{{ statusCounts[opt.value] || 0 }}</span>
          </button>
        </div>

        <div class="ntf-chips" role="group" aria-label="Filtrar por canal">
          <span class="ntf-chips-label">Canal</span>
          <button
            v-for="ch in channelChips"
            :key="ch.value"
            type="button"
            class="ntf-chip ntf-chip-channel"
            :data-channel="ch.value"
            :data-active="filters.channel === ch.value ? 'true' : null"
            :aria-pressed="filters.channel === ch.value ? 'true' : 'false'"
            @click="toggleChannel(ch.value)"
          >
            <span class="ntf-chip-glyph" aria-hidden="true">{{ channelIcon(ch.value) }}</span>
            {{ ch.label }}
            <span class="ntf-chip-count">{{ channelCounts[ch.value] || 0 }}</span>
          </button>
        </div>

        <div class="ntf-toolbar-grow">
          <label class="ntf-search">
            <span class="ntf-search-label">Buscar evento</span>
            <input
              v-model="filters.q"
              type="search"
              class="ntf-search-input"
              placeholder="pedido.criado, pagamento…"
              aria-label="Buscar por evento"
            />
          </label>
        </div>

        <UiButton v-if="hasActiveFilter" variant="ghost" size="sm" @click="clearFilters">
          Limpar filtros
        </UiButton>
      </div>

      <UiDataTable
        :columns="columns"
        :rows="pagedRows"
        row-key="rowId"
        density="comfortable"
        clickable-rows
        server-mode
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
            <span class="ntf-event-icon" :data-event="row.event" aria-hidden="true">{{ eventIcon(row.event) }}</span>
            <span class="ntf-event-text">
              <span class="ntf-event-label">{{ eventLabel(row.event) }}</span>
              <span class="ntf-event-key ui-mono">{{ row.event }}</span>
            </span>
          </div>
        </template>

        <!-- Canal (ChannelBadge) -->
        <template #cell-channel="{ row }">
          <span class="ntf-chan" :data-channel="row.channel">
            <span class="ntf-chan-icon" aria-hidden="true">{{ channelIcon(row.channel) }}</span>
            {{ channelLabel(row.channel) }}
          </span>
        </template>

        <!-- Situação do canal (StatusBadge em pt-BR) -->
        <template #cell-status="{ row }">
          <UiStatusBadge :status="row.status" :tone="toneFor(row.status)" :label="statusLabelPt(row.status)" />
        </template>

        <!-- Resultado agregado do evento -->
        <template #cell-eventStatus="{ row }">
          <UiStatusBadge :status="row.eventStatus" :tone="toneFor(row.eventStatus)" :label="statusLabelPt(row.eventStatus)" size="sm" />
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

        <!-- Sem resultados após filtro / vazio real -->
        <template #empty-action>
          <UiButton v-if="hasActiveFilter" variant="ghost" @click="clearFilters">Limpar filtros</UiButton>
          <UiButton v-else variant="primary" to="/orders">Ver pedidos</UiButton>
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
              <span class="ntf-event-icon" :data-event="detailEvent.event" aria-hidden="true">{{ eventIcon(detailEvent.event) }}</span>
              <span class="ntf-detail-evtext">
                {{ eventLabel(detailEvent.event) }}
                <span class="ntf-event-key ui-mono">{{ detailEvent.event }}</span>
              </span>
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
          <li v-for="(c, i) in detailEvent.channels" :key="i" class="ntf-channel-item" :data-status="c.status">
            <span class="ntf-chan" :data-channel="c.channel">
              <span class="ntf-chan-icon" aria-hidden="true">{{ channelIcon(c.channel) }}</span>
              {{ channelLabel(c.channel) }}
            </span>
            <UiStatusBadge :status="c.status" :tone="toneFor(c.status)" :label="statusLabelPt(c.status)" size="sm" />
            <span v-if="c.status === 'skipped'" class="ntf-channel-note">Sem URL de webhook configurada</span>
            <span v-else-if="c.status === 'failed'" class="ntf-channel-note ntf-channel-note-err">Webhook respondeu com erro</span>
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
        icon="bell"
      />
      <template #footer>
        <UiButton variant="ghost" to="/settings">Configurar canais</UiButton>
        <UiButton variant="primary" @click="detailOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiButton,
  UiModal,
  UiEmptyState,
  useToast,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// ---------------------------------------------------------------------------
// Recurso REAL: GET /v1/notifications → { data: [{ at, event, status,
//   channels:[{ channel, status }] }] }. O endpoint não pagina/filtra no servidor
// (devolve as últimas notificações em memória), então carregamos o histórico e
// refinamos/ordenamos/paginamos no cliente sobre as linhas REAIS.
//
// Leitura com degradação graciosa: se o integrador expuser o resourceFactory
// `api.notifications.list`, usamos ele; senão caímos para `api.store.notifications()`
// (que já desembrulha o envelope .data). Sem nenhum dos dois, erro honesto — sem
// inventar rota. A normalização aceita as duas formas (array cru OU envelope).
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
    events.value = (list || [])
      .map((r) => {
        const channels = (Array.isArray(r.channels) ? r.channels : []).map((c) => ({
          channel: c.channel || c.name || '—',
          status: normStatus(c.status),
        }));
        return {
          at: r.at || r.sentAt || r.created_at || null,
          event: r.event || '',
          status: normStatus(r.status || deriveStatus(channels)),
          channels,
        };
      })
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
  if (!error.value) toast.success('Histórico de notificações atualizado.', { detail: events.value.length + ' evento(s)' });
  else toast.error('Falha ao atualizar', { detail: errorMessage.value });
}

// Normaliza status pt/en → chave canônica do domínio (enviada/pulada/falhou).
function normStatus(v) {
  const s = String(v ?? '').toLowerCase().trim();
  if (['sent', 'enviada', 'enviado', 'success', 'ok', 'delivered', 'entregue'].includes(s)) return 'sent';
  if (['skipped', 'pulada', 'pulado', 'skip'].includes(s)) return 'skipped';
  if (['failed', 'falhou', 'falha', 'error', 'erro'].includes(s)) return 'failed';
  return s || 'skipped';
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
        eventStatus: ev.status,
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
  'order.created': 'Pedido criado',
  'pagamento.aprovado': 'Pagamento aprovado',
  'order.paid': 'Pagamento aprovado',
  'payment.approved': 'Pagamento aprovado',
  'pagamento.falhou': 'Pagamento recusado',
  'payment.failed': 'Pagamento recusado',
  'nf-e.emitida': 'NF-e emitida',
  'invoice.emitted': 'NF-e emitida',
};
const eventLabel = (v) => EVENT_LABELS[String(v || '').toLowerCase()] || format.humanize(v);
function eventIcon(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('cria') || s.includes('created')) return '🛒';
  if (s.includes('falh') || s.includes('failed') || s.includes('recus')) return '⛔';
  if (s.includes('aprov') || s.includes('paid') || s.includes('approved')) return '💳';
  if (s.includes('nf') || s.includes('invoice')) return '🧾';
  return '🔔';
}

const CHANNEL_LABELS = { email: 'E-mail', sms: 'SMS', push: 'Push', whatsapp: 'WhatsApp' };
const channelLabel = (v) => CHANNEL_LABELS[String(v || '').toLowerCase()] || format.humanize(v);
function channelIcon(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'email') return '✉';
  if (s === 'sms') return '💬';
  if (s === 'push') return '🔔';
  if (s === 'whatsapp') return '🟢';
  return '📡';
}

const STATUS_LABELS = { sent: 'Enviada', skipped: 'Pulada', failed: 'Falhou' };
const statusLabelPt = (v) => STATUS_LABELS[normStatus(v)] || format.humanize(v);
// tom explícito: pulada é AVISO (degradação esperada), enviada sucesso, falhou erro.
function toneFor(v) {
  const s = normStatus(v);
  if (s === 'sent') return 'success';
  if (s === 'failed') return 'error';
  if (s === 'skipped') return 'warning';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// FilterChips: situação + canal (client-side sobre as linhas reais) + busca.
// ---------------------------------------------------------------------------
const statusChips = [
  { value: 'sent', label: 'Enviada', tone: 'success' },
  { value: 'skipped', label: 'Pulada', tone: 'warning' },
  { value: 'failed', label: 'Falhou', tone: 'error' },
];
const channelChips = [
  { value: 'email', label: 'E-mail' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const filters = reactive({ q: '', status: '', channel: '' });
const hasActiveFilter = computed(() => !!(filters.q || filters.status || filters.channel));
function toggleStatus(v) { filters.status = filters.status === v ? '' : v; page.value = 1; }
function toggleChannel(v) { filters.channel = filters.channel === v ? '' : v; page.value = 1; }
function clearFilters() { filters.q = ''; filters.status = ''; filters.channel = ''; page.value = 1; }

// contagens por chip (sobre TODAS as linhas carregadas, não as filtradas).
const statusCounts = computed(() => {
  const acc = { sent: 0, skipped: 0, failed: 0 };
  for (const r of flatRows.value) if (acc[r.status] !== undefined) acc[r.status]++;
  return acc;
});
const channelCounts = computed(() => {
  const acc = {};
  for (const r of flatRows.value) {
    const k = String(r.channel || '').toLowerCase();
    acc[k] = (acc[k] || 0) + 1;
  }
  return acc;
});

const filteredRows = computed(() => {
  const q = filters.q.trim().toLowerCase();
  return flatRows.value.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.channel && String(row.channel || '').toLowerCase() !== filters.channel) return false;
    if (q) {
      const hay = [row.event, eventLabel(row.event), channelLabel(row.channel)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

// reset de página ao mudar filtro / recarregar.
watch(filteredRows, () => {
  if ((page.value - 1) * pageSize.value >= filteredRows.value.length) page.value = 1;
});

// ---------------------------------------------------------------------------
// Ordenação + paginação locais.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'event', label: 'Evento', sortable: true },
  { key: 'channel', label: 'Canal', sortable: true },
  { key: 'status', label: 'Situação do canal', sortable: true },
  { key: 'eventStatus', label: 'Resultado', align: 'center' },
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
  const isDate = s.key === 'at';
  return [...filteredRows.value].sort((a, b) => {
    let x = a[s.key];
    let y = b[s.key];
    if (isDate) {
      x = x ? new Date(x).getTime() : 0;
      y = y ? new Date(y).getTime() : 0;
    } else {
      x = String(x ?? '').toLowerCase();
      y = String(y ?? '').toLowerCase();
    }
    return (x > y ? 1 : x < y ? -1 : 0) * mul;
  });
});
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});
function onSort(s) { sort.value = s; page.value = 1; }
function onPage(p) { page.value = p; }
function onPageSize(size) { pageSize.value = size; page.value = 1; }

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
  if (names.length === 2) return 'Os canais ' + names[0] + ' e ' + names[1] + ' estão';
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
    ? { title: 'Nenhum envio no filtro', description: 'Ajuste a situação, o canal ou a busca.', icon: 'search' }
    : {
        title: 'Nenhuma notificação ainda',
        description: 'Os disparos aparecem aqui assim que um evento de pedido (criação, pagamento ou NF-e) ocorrer.',
        icon: 'bell',
      },
);

// ---------------------------------------------------------------------------
// Detalhe (modal por evento, sobre o registro já carregado — sem chamada extra).
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
  const rows = sortedRows.value;
  if (!rows.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['Evento', 'Chave do evento', 'Canal', 'Situação', 'Resultado do evento', 'Enviada em'];
  const lines = [head.join(';')];
  for (const r of rows) {
    lines.push(
      [
        csvCell(eventLabel(r.event)),
        csvCell(r.event),
        csvCell(channelLabel(r.channel)),
        csvCell(statusLabelPt(r.status)),
        csvCell(statusLabelPt(r.eventStatus)),
        csvCell(r.at),
      ].join(';'),
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
.ntf-banner-link {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
  text-decoration: underline;
}

/* Toolbar (FilterChips + busca) */
.ntf-toolbar {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: var(--ui-space-4);
  margin-bottom: var(--ui-space-4);
}
.ntf-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.ntf-chips-label {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-muted));
  margin-right: 2px;
}
.ntf-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  padding: 5px 11px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.ntf-chip:hover {
  border-color: rgb(var(--ui-accent));
}
.ntf-chip:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.ntf-chip-count {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-muted) / 0.14);
  border-radius: var(--ui-radius-pill);
  padding: 1px 7px;
}
.ntf-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
}
.ntf-chip[data-tone="success"] .ntf-chip-dot { background: rgb(var(--ui-ok)); }
.ntf-chip[data-tone="warning"] .ntf-chip-dot { background: rgb(var(--ui-warn)); }
.ntf-chip[data-tone="error"] .ntf-chip-dot { background: rgb(var(--ui-danger)); }

/* Chip ativo: tom semântico por situação */
.ntf-chip[data-active="true"][data-tone="success"] {
  border-color: rgb(var(--ui-ok));
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}
.ntf-chip[data-active="true"][data-tone="warning"] {
  border-color: rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}
.ntf-chip[data-active="true"][data-tone="error"] {
  border-color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.12);
  color: rgb(var(--ui-danger));
}
.ntf-chip[data-active="true"] .ntf-chip-count {
  background: rgb(var(--ui-bg) / 0.55);
  color: inherit;
}

/* Chips de canal */
.ntf-chip-channel[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.ntf-chip-channel[data-active="true"] .ntf-chip-count {
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent-strong));
}
.ntf-chip-glyph {
  font-size: var(--ui-text-sm);
}

/* Busca */
.ntf-toolbar-grow {
  flex: 1 1 200px;
  min-width: 180px;
}
.ntf-search {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ntf-search-label {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-muted));
}
.ntf-search-input {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 7px 10px;
  font: inherit;
  width: 100%;
}
.ntf-search-input:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 1px;
  border-color: rgb(var(--ui-accent));
}

/* Evento */
.ntf-event {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.ntf-event-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-md);
  background: rgb(var(--ui-accent) / 0.12);
}
.ntf-event-icon[data-event*="falh"],
.ntf-event-icon[data-event*="failed"],
.ntf-event-icon[data-event*="recus"] {
  background: rgb(var(--ui-danger) / 0.12);
}
.ntf-event-icon[data-event*="aprov"],
.ntf-event-icon[data-event*="paid"],
.ntf-event-icon[data-event*="approved"] {
  background: rgb(var(--ui-ok) / 0.12);
}
.ntf-event-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.ntf-event-label {
  font-weight: 600;
}
.ntf-event-key {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
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
/* Cor por canal: cada um mapeia para um tom semântico do tema (todos via tokens). */
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
.ntf-detail-evtext {
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
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
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding: var(--ui-space-3);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.ntf-channel-item[data-status="sent"] { border-left: 3px solid rgb(var(--ui-ok)); }
.ntf-channel-item[data-status="skipped"] { border-left: 3px solid rgb(var(--ui-warn)); }
.ntf-channel-item[data-status="failed"] { border-left: 3px solid rgb(var(--ui-danger)); }
.ntf-channel-note {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.ntf-channel-note-err {
  color: rgb(var(--ui-danger));
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
