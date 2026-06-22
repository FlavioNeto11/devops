<template>
  <UiPageLayout
    eyebrow="Reposição de estoque"
    title="Notificações"
    subtitle="Histórico de notificações multicanal por evento, com o desfecho de cada canal e o status agregado."
    width="wide"
    :error="r.error.value"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">Atualizar</UiButton>
      <UiButton to="/channels" variant="subtle">Canais</UiButton>
      <UiButton to="/products">Ver produtos</UiButton>
    </template>

    <!-- Banner explicando a degradação graciosa (sinal didático do REQ-0007) -->
    <template #banner>
      <div class="nl-banner" role="note">
        <span class="nl-banner-icon" aria-hidden="true">◉</span>
        <p class="nl-banner-text">
          Cada evento (<strong>ruptura</strong> de estoque ou <strong>falha no pedido</strong>) dispara
          envio por e-mail, push e WhatsApp. Um canal sem configuração é <strong>pulado</strong>
          (<em>skipped</em>) sem derrubar os outros — degradação graciosa. A operação de negócio nunca
          espera pelo envio.
        </p>
      </div>
    </template>

    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="onFilter"
        @clear="onFilter"
      />
    </template>

    <!-- KPIs agregados (recalculados sobre todo o conjunto carregado) -->
    <div class="nl-metrics" role="group" aria-label="Resumo das notificações">
      <UiMetricCard
        label="Eventos"
        :value="metrics.total"
        tone="primary"
        hint="No histórico carregado"
        :loading="r.loading.value"
        clickable
        @click="setStatusFilter('')"
      />
      <UiMetricCard
        label="Entregues"
        :value="metrics.sent"
        tone="success"
        :hint="pct(metrics.sent)"
        :loading="r.loading.value"
        clickable
        @click="setStatusFilter('sent')"
      />
      <UiMetricCard
        label="Falharam"
        :value="metrics.failed"
        tone="error"
        :hint="pct(metrics.failed)"
        :loading="r.loading.value"
        clickable
        @click="setStatusFilter('failed')"
      />
      <UiMetricCard
        label="Pulados"
        :value="metrics.skipped"
        tone="warning"
        hint="Todos os canais sem config"
        :loading="r.loading.value"
        clickable
        @click="setStatusFilter('skipped')"
      />
    </div>

    <!-- Cobertura por canal: evidencia a degradação graciosa de forma agregada -->
    <UiCard
      v-if="!r.loading.value && metrics.total > 0"
      title="Cobertura por canal"
      subtitle="Entregas, falhas e pulos somados sobre todos os eventos carregados."
    >
      <ul class="nl-coverage" aria-label="Cobertura por canal">
        <li
          v-for="cov in channelCoverage"
          :key="cov.channel"
          class="nl-cov"
          :data-dominant="cov.dominant"
        >
          <span class="nl-cov-glyph" aria-hidden="true">{{ channelGlyph(cov.channel) }}</span>
          <div class="nl-cov-body">
            <span class="nl-cov-name">{{ channelLabel(cov.channel) }}</span>
            <div class="nl-cov-bar" role="img" :aria-label="coverageAria(cov)">
              <span class="nl-cov-seg" data-seg="sent" :data-w="barWidth(cov.sent, cov.total)" />
              <span class="nl-cov-seg" data-seg="failed" :data-w="barWidth(cov.failed, cov.total)" />
              <span class="nl-cov-seg" data-seg="skipped" :data-w="barWidth(cov.skipped, cov.total)" />
            </div>
            <div class="nl-cov-legend">
              <span class="nl-cov-stat" data-seg="sent">{{ cov.sent }} enviados</span>
              <span class="nl-cov-stat" data-seg="failed">{{ cov.failed }} falhas</span>
              <span class="nl-cov-stat" data-seg="skipped">{{ cov.skipped }} pulados</span>
            </div>
          </div>
        </li>
      </ul>
    </UiCard>

    <UiCard title="Linha do tempo de notificações" :subtitle="resultSummary">
      <UiDataTable
        :columns="columns"
        :rows="pageRows"
        :loading="r.loading.value"
        row-key="id"
        density="comfortable"
        clickable-rows
        :sort="sort"
        :page="page"
        :page-size="pageSize"
        :total="filtered.length"
        paginated
        :empty="emptyState"
        @row-click="openDetail"
        @update:sort="onSort"
        @update:page="onPage"
        @update:pageSize="onPageSize"
      >
        <template #cell-tipo="{ value }">
          <span class="nl-event" :data-event="value">
            <span class="nl-event-dot" aria-hidden="true" />
            {{ eventLabel(value) }}
          </span>
        </template>

        <template #cell-referencia_id="{ row }">
          <button
            v-if="row.referencia_id != null"
            type="button"
            class="nl-ref"
            @click.stop="openReference(row)"
          >
            {{ referenceLabel(row) }}
          </button>
          <span v-else class="ui-muted">—</span>
        </template>

        <template #cell-canais="{ value }">
          <span class="nl-chips" role="list" aria-label="Desfecho por canal">
            <span
              v-for="ch in normalizeChannels(value)"
              :key="ch.channel"
              class="nl-chip"
              :data-status="ch.status"
              role="listitem"
              :title="channelTitle(ch)"
            >
              <span class="nl-chip-glyph" aria-hidden="true">{{ channelGlyph(ch.channel) }}</span>
              <span class="nl-chip-name">{{ channelLabel(ch.channel) }}</span>
              <span class="nl-chip-status">{{ channelStatusLabel(ch.status) }}</span>
            </span>
            <span v-if="!normalizeChannels(value).length" class="ui-muted nl-chip-empty">—</span>
          </span>
        </template>

        <template #cell-status="{ value }">
          <UiStatusBadge :status="value" :label="aggregateLabel(value)" />
        </template>

        <template #cell-tentativas="{ value }">
          <span class="nl-attempts" :data-warn="Number(value) > 1 ? 'true' : null">{{ value ?? '—' }}</span>
        </template>

        <template #cell-created_at="{ value }">
          <span class="nl-when">{{ format.formatDateTime(value) }}</span>
        </template>

        <template #empty-action>
          <UiButton to="/products" variant="subtle">Ver produtos monitorados</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <template #footer>
      <p class="nl-foot">
        Notificações são geradas pelo worker de forma assíncrona (REQ-STOCKPILOT-0007). Esta tela é
        somente leitura — o histórico reflete os eventos do seu tenant.
      </p>
    </template>

    <!-- Detalhe do evento (modal) -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <div v-if="selected" class="nl-detail">
        <dl class="nl-dl">
          <div class="nl-dl-row">
            <dt>Evento</dt>
            <dd>
              <span class="nl-event" :data-event="selected.tipo">
                <span class="nl-event-dot" aria-hidden="true" />
                {{ eventLabel(selected.tipo) }}
              </span>
            </dd>
          </div>
          <div class="nl-dl-row">
            <dt>Status agregado</dt>
            <dd><UiStatusBadge :status="selected.status" :label="aggregateLabel(selected.status)" /></dd>
          </div>
          <div class="nl-dl-row">
            <dt>Referência</dt>
            <dd>
              <button
                v-if="selected.referencia_id != null"
                type="button"
                class="nl-ref"
                @click="openReference(selected)"
              >
                {{ referenceLabel(selected) }}
              </button>
              <span v-else class="ui-muted">—</span>
            </dd>
          </div>
          <div class="nl-dl-row">
            <dt>Tentativas</dt>
            <dd>{{ selected.tentativas ?? '—' }}</dd>
          </div>
          <div class="nl-dl-row">
            <dt>Usuário</dt>
            <dd>{{ selected.usuario_id || 'Sistema' }}</dd>
          </div>
          <div class="nl-dl-row">
            <dt>Criado em</dt>
            <dd>{{ format.formatDateTime(selected.created_at) }}</dd>
          </div>
          <div class="nl-dl-row">
            <dt>Atualizado em</dt>
            <dd>{{ format.formatDateTime(selected.updated_at) }}</dd>
          </div>
        </dl>

        <h3 class="nl-detail-head">Desfecho por canal</h3>
        <ul class="nl-channels" aria-label="Desfecho por canal">
          <li
            v-for="ch in normalizeChannels(selected.canais)"
            :key="ch.channel"
            class="nl-channel"
            :data-status="ch.status"
          >
            <span class="nl-channel-glyph" aria-hidden="true">{{ channelGlyph(ch.channel) }}</span>
            <div class="nl-channel-body">
              <span class="nl-channel-name">{{ channelLabel(ch.channel) }}</span>
              <span v-if="reasonLabel(ch)" class="nl-channel-reason">{{ reasonLabel(ch) }}</span>
            </div>
            <UiStatusBadge
              :status="ch.status"
              :tone="channelTone(ch.status)"
              :label="channelStatusLabel(ch.status)"
              size="sm"
            />
          </li>
          <li v-if="!normalizeChannels(selected.canais).length" class="nl-channel-empty ui-muted">
            Nenhum canal registrado para este evento.
          </li>
        </ul>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
        <UiButton
          v-if="selected && selected.referencia_id != null"
          variant="subtle"
          @click="goReferenceFromModal"
        >
          Abrir referência
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiDataTable,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiFiltersPanel,
  UiModal,
  useResource,
  useToast,
  format,
} from '../ui/index.js';
import { notifications } from '../api.js';

const router = useRouter();
const toast = useToast();
const r = useResource(notifications, { pageSize: 25 });

// --- catálogos de domínio (REQ-STOCKPILOT-0007) ---
const EVENTS = {
  ruptura: 'Ruptura de estoque',
  falha_pedido: 'Falha no pedido',
};
const AGGREGATE = {
  pending: 'Pendente',
  sent: 'Enviado',
  failed: 'Falhou',
  skipped: 'Pulado',
};
const CHANNELS = {
  email: { label: 'E-mail', glyph: '✉' },
  push: { label: 'Push', glyph: '◔' },
  whatsapp: { label: 'WhatsApp', glyph: '✆' },
};
const CHANNEL_STATUS = {
  sent: 'enviado',
  failed: 'falhou',
  skipped: 'pulado',
  pending: 'pendente',
};

const columns = [
  { key: 'tipo', label: 'Evento', sortable: true },
  { key: 'referencia_id', label: 'Referência' },
  { key: 'canais', label: 'Canais (desfecho)' },
  { key: 'status', label: 'Status agregado', sortable: true },
  { key: 'tentativas', label: 'Tentativas', align: 'right', sortable: true },
  { key: 'created_at', label: 'Criado em', align: 'right', sortable: true },
];

const filterFields = [
  { key: 'tipo', label: 'Evento', type: 'select', options: [
    { value: 'ruptura', label: 'Ruptura de estoque' },
    { value: 'falha_pedido', label: 'Falha no pedido' },
  ] },
  { key: 'status', label: 'Status agregado', type: 'select', options: [
    { value: 'sent', label: 'Enviado' },
    { value: 'failed', label: 'Falhou' },
    { value: 'skipped', label: 'Pulado' },
    { value: 'pending', label: 'Pendente' },
  ] },
];
const filters = reactive({ tipo: '', status: '' });

// O backend devolve o histórico do tenant (lista, sem paginação server-side):
// filtro/ordenação/paginação são CLIENT-side sobre o conjunto carregado.
const sort = ref({ key: 'created_at', dir: 'desc' });
const page = ref(1);
const pageSize = ref(25);

const filtered = computed(() => {
  let rows = r.items.value || [];
  if (filters.tipo) rows = rows.filter((x) => x.tipo === filters.tipo);
  if (filters.status) rows = rows.filter((x) => x.status === filters.status);
  const { key, dir } = sort.value || {};
  if (key) {
    const mul = dir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (x == null) return 1;
      if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * mul;
    });
  }
  return rows;
});

const pageRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

const metrics = computed(() => {
  const rows = r.items.value || [];
  const by = (s) => rows.filter((x) => x.status === s).length;
  return { total: rows.length, sent: by('sent'), failed: by('failed'), skipped: by('skipped') };
});

// Cobertura agregada por canal: soma os desfechos de cada canal sobre TODOS os eventos.
const channelCoverage = computed(() => {
  const order = ['email', 'push', 'whatsapp'];
  const acc = {};
  for (const row of r.items.value || []) {
    for (const ch of normalizeChannels(row.canais)) {
      const c = acc[ch.channel] || (acc[ch.channel] = { channel: ch.channel, sent: 0, failed: 0, skipped: 0, total: 0 });
      if (ch.status === 'sent') c.sent += 1;
      else if (ch.status === 'failed') c.failed += 1;
      else if (ch.status === 'skipped') c.skipped += 1;
      c.total += 1;
    }
  }
  const known = order.filter((k) => acc[k]).map((k) => acc[k]);
  const extras = Object.values(acc).filter((c) => !order.includes(c.channel));
  return [...known, ...extras].map((c) => ({ ...c, dominant: dominantOutcome(c) }));
});

function dominantOutcome(c) {
  if (c.total === 0) return 'skipped';
  const max = Math.max(c.sent, c.failed, c.skipped);
  if (c.sent === max) return 'sent';
  if (c.failed === max) return 'failed';
  return 'skipped';
}

// Largura da barra em buckets de 5% (data-attr CSS-safe — sem :style).
function barWidth(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 20) * 5;
}

function coverageAria(cov) {
  return (
    channelLabel(cov.channel) + ': ' +
    cov.sent + ' enviados, ' + cov.failed + ' falhas, ' + cov.skipped + ' pulados.'
  );
}

const resultSummary = computed(() => {
  const n = filtered.value.length;
  if (!n) return 'Nenhuma notificação no filtro atual.';
  const active = [];
  if (filters.tipo) active.push(eventLabel(filters.tipo));
  if (filters.status) active.push(aggregateLabel(filters.status));
  const scope = active.length ? ' · ' + active.join(' · ') : '';
  return n + (n === 1 ? ' notificação' : ' notificações') + scope;
});

const emptyState = computed(() => {
  const filtering = filters.tipo || filters.status;
  return filtering
    ? { title: 'Nada neste filtro', description: 'Ajuste o evento ou o status para ver outras notificações.', icon: 'search' }
    : { title: 'Sem notificações ainda', description: 'Quando um produto entrar em ruptura ou um pedido falhar, o evento aparece aqui.', icon: 'clock' };
});

function pct(n) {
  const total = metrics.value.total;
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '% do total';
}

// --- rótulos / normalização ---
const eventLabel = (t) => EVENTS[t] || format.humanize(t);
const aggregateLabel = (s) => AGGREGATE[s] || format.humanize(s);
const channelLabel = (c) => (CHANNELS[c] && CHANNELS[c].label) || format.humanize(c);
const channelGlyph = (c) => (CHANNELS[c] && CHANNELS[c].glyph) || '•';
const channelStatusLabel = (s) => CHANNEL_STATUS[s] || format.humanize(s);

function channelTone(status) {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'skipped') return 'warning';
  return 'neutral';
}

// `reason` vem do fan-out: 'unconfigured' p/ canal sem config (skipped) ou a MENSAGEM de erro (failed).
function reasonLabel(ch) {
  if (!ch.reason) return '';
  if (ch.reason === 'unconfigured') return 'Canal sem configuração (pulado)';
  if (ch.status === 'failed') return 'Erro: ' + ch.reason;
  return ch.reason;
}

function channelTitle(ch) {
  const base = channelLabel(ch.channel) + ': ' + channelStatusLabel(ch.status);
  const reason = reasonLabel(ch);
  return reason ? base + ' — ' + reason : base;
}

// `canais` pode vir como array de {channel,status,reason} (desfecho) OU como lista de nomes (pendente).
function normalizeChannels(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (entry && typeof entry === 'object') {
      return { channel: entry.channel || entry.name || '?', status: entry.status || 'pending', reason: entry.reason || '' };
    }
    return { channel: String(entry), status: 'pending', reason: '' };
  });
}

function referenceLabel(row) {
  if (row.referencia_id == null) return '—';
  const noun = row.tipo === 'ruptura' ? 'Produto' : 'Pedido';
  return noun + ' #' + row.referencia_id;
}

// --- interações ---
function reload() {
  r.load()
    .then(() => { if (!r.error.value) toast.success('Notificações atualizadas.'); })
    .catch(() => toast.error('Não foi possível atualizar as notificações.'));
}

function onFilter() {
  page.value = 1;
}

function setStatusFilter(status) {
  filters.status = status;
  page.value = 1;
}

function onSort(s) {
  sort.value = s;
  page.value = 1;
}
function onPage(p) {
  page.value = p;
}
function onPageSize(ps) {
  pageSize.value = ps;
  page.value = 1;
}

// Detalhe
const detailOpen = ref(false);
const selected = ref(null);
const detailTitle = computed(() => (selected.value ? eventLabel(selected.value.tipo) + ' · #' + selected.value.id : 'Notificação'));

function openDetail(row) {
  router.push('/notifications/' + row.id);
}

// Navega para a entidade de DOMÍNIO referenciada (produto/pedido) — só rotas reais.
function openReference(row) {
  if (row.referencia_id == null) {
    toast.info('Este evento não tem referência associada.');
    return;
  }
  const path = row.tipo === 'ruptura' ? '/products/' : '/orders/';
  router.push(path + row.referencia_id);
}

function goReferenceFromModal() {
  if (selected.value) openReference(selected.value);
  detailOpen.value = false;
}

onMounted(r.load);
</script>

<style scoped>
/* Banner didático */
.nl-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.22);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.nl-banner-icon { color: rgb(var(--ui-accent-strong)); font-size: 1rem; line-height: 1.5; }
.nl-banner-text { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.nl-banner-text strong { font-weight: 700; }

/* KPIs */
.nl-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* Cobertura por canal */
.nl-coverage {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--ui-space-4);
}
.nl-cov {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.nl-cov[data-dominant="sent"] { border-left-color: rgb(var(--ui-ok)); }
.nl-cov[data-dominant="failed"] { border-left-color: rgb(var(--ui-danger)); }
.nl-cov[data-dominant="skipped"] { border-left-color: rgb(var(--ui-warn)); }
.nl-cov-glyph { font-size: 1.15rem; color: rgb(var(--ui-accent-strong)); width: 1.4rem; text-align: center; }
.nl-cov-body { flex: 1 1 auto; display: flex; flex-direction: column; gap: var(--ui-space-2); min-width: 0; }
.nl-cov-name { font-weight: 600; font-size: var(--ui-text-sm); }
.nl-cov-bar {
  display: flex;
  height: 8px;
  border-radius: var(--ui-radius-pill);
  overflow: hidden;
  background: rgb(var(--ui-muted) / 0.16);
}
.nl-cov-seg { height: 100%; transition: width .2s ease; }
.nl-cov-seg[data-seg="sent"] { background: rgb(var(--ui-ok)); }
.nl-cov-seg[data-seg="failed"] { background: rgb(var(--ui-danger)); }
.nl-cov-seg[data-seg="skipped"] { background: rgb(var(--ui-warn)); }
.nl-cov-seg[data-w="0"] { width: 0; }
.nl-cov-seg[data-w="5"] { width: 5%; }
.nl-cov-seg[data-w="10"] { width: 10%; }
.nl-cov-seg[data-w="15"] { width: 15%; }
.nl-cov-seg[data-w="20"] { width: 20%; }
.nl-cov-seg[data-w="25"] { width: 25%; }
.nl-cov-seg[data-w="30"] { width: 30%; }
.nl-cov-seg[data-w="35"] { width: 35%; }
.nl-cov-seg[data-w="40"] { width: 40%; }
.nl-cov-seg[data-w="45"] { width: 45%; }
.nl-cov-seg[data-w="50"] { width: 50%; }
.nl-cov-seg[data-w="55"] { width: 55%; }
.nl-cov-seg[data-w="60"] { width: 60%; }
.nl-cov-seg[data-w="65"] { width: 65%; }
.nl-cov-seg[data-w="70"] { width: 70%; }
.nl-cov-seg[data-w="75"] { width: 75%; }
.nl-cov-seg[data-w="80"] { width: 80%; }
.nl-cov-seg[data-w="85"] { width: 85%; }
.nl-cov-seg[data-w="90"] { width: 90%; }
.nl-cov-seg[data-w="95"] { width: 95%; }
.nl-cov-seg[data-w="100"] { width: 100%; }
.nl-cov-legend { display: flex; flex-wrap: wrap; gap: var(--ui-space-3); font-size: var(--ui-text-xs); }
.nl-cov-stat { display: inline-flex; align-items: center; gap: var(--ui-space-1); color: rgb(var(--ui-muted)); font-weight: 600; }
.nl-cov-stat::before { content: ""; width: 8px; height: 8px; border-radius: 2px; }
.nl-cov-stat[data-seg="sent"]::before { background: rgb(var(--ui-ok)); }
.nl-cov-stat[data-seg="failed"]::before { background: rgb(var(--ui-danger)); }
.nl-cov-stat[data-seg="skipped"]::before { background: rgb(var(--ui-warn)); }

/* Evento (chip de tipo) */
.nl-event { display: inline-flex; align-items: center; gap: var(--ui-space-2); font-weight: 600; font-size: var(--ui-text-sm); white-space: nowrap; }
.nl-event-dot { width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--ui-muted)); flex-shrink: 0; }
.nl-event[data-event="ruptura"] .nl-event-dot { background: rgb(var(--ui-danger)); }
.nl-event[data-event="falha_pedido"] .nl-event-dot { background: rgb(var(--ui-warn)); }

/* Referência (botão-link p/ domínio) */
.nl-ref {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: rgb(var(--ui-accent-strong));
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.nl-ref:hover { filter: brightness(1.1); }

/* Channel chips */
.nl-chips { display: inline-flex; flex-wrap: wrap; gap: var(--ui-space-2); }
.nl-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: 3px 9px;
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border: 1px solid transparent;
  white-space: nowrap;
}
.nl-chip-glyph { font-size: 0.85em; line-height: 1; }
.nl-chip-status { opacity: 0.85; font-weight: 500; }
.nl-chip[data-status="sent"] { background: rgb(var(--ui-ok) / 0.14); color: rgb(var(--ui-ok)); border-color: rgb(var(--ui-ok) / 0.30); }
.nl-chip[data-status="failed"] { background: rgb(var(--ui-danger) / 0.14); color: rgb(var(--ui-danger)); border-color: rgb(var(--ui-danger) / 0.30); }
.nl-chip[data-status="skipped"] { background: rgb(var(--ui-warn) / 0.16); color: rgb(var(--ui-warn)); border-color: rgb(var(--ui-warn) / 0.32); }
.nl-chip[data-status="pending"] { background: rgb(var(--ui-muted) / 0.14); color: rgb(var(--ui-muted)); border-color: rgb(var(--ui-border-strong)); }
.nl-chip-empty { font-size: var(--ui-text-sm); }

/* Tentativas */
.nl-attempts { font-variant-numeric: tabular-nums; font-weight: 600; }
.nl-attempts[data-warn="true"] { color: rgb(var(--ui-warn)); }
.nl-when { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); white-space: nowrap; }

.nl-foot { margin: 0; }

/* Detalhe */
.nl-detail { display: flex; flex-direction: column; gap: var(--ui-space-5); }
.nl-dl { display: grid; grid-template-columns: 1fr; gap: var(--ui-space-2); margin: 0; }
.nl-dl-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.nl-dl-row:last-child { border-bottom: none; padding-bottom: 0; }
.nl-dl dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.nl-dl dd { margin: 0; text-align: right; font-weight: 600; }

.nl-detail-head { font-size: var(--ui-text-md); margin: 0; }
.nl-channels { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.nl-channel {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.nl-channel[data-status="sent"] { border-left-color: rgb(var(--ui-ok)); }
.nl-channel[data-status="failed"] { border-left-color: rgb(var(--ui-danger)); }
.nl-channel[data-status="skipped"] { border-left-color: rgb(var(--ui-warn)); }
.nl-channel-glyph { font-size: 1.1rem; color: rgb(var(--ui-muted)); width: 1.4rem; text-align: center; }
.nl-channel-body { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.nl-channel-name { font-weight: 600; }
.nl-channel-reason { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); word-break: break-word; }
.nl-channel-empty { padding: var(--ui-space-3); }

@media (max-width: 860px) {
  .nl-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .nl-metrics { grid-template-columns: 1fr; }
  .nl-dl dd { text-align: left; }
}
</style>
