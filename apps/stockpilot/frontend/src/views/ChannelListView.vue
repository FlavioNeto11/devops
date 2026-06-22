<template>
  <UiPageLayout
    eyebrow="Reposição de estoque"
    title="Canais de notificação"
    subtitle="Para onde a StockPilot avisa quando um produto entra em ruptura ou um pedido ao fornecedor falha. Cada canal entrega via webhook (e-mail, push ou WhatsApp) e degrada com graça: canal sem configuração é pulado, sem derrubar os outros."
    width="wide"
    :error="errorMessage"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">Atualizar</UiButton>
      <UiButton to="/notifications" variant="subtle">Ver notificações</UiButton>
      <UiButton to="/products" variant="ghost">Ver produtos</UiButton>
      <UiButton to="/channels/new" variant="primary">Configurar canal</UiButton>
    </template>

    <!-- Banner didático: o que é "configurado" vs "pulado" (degradação graciosa) -->
    <template #banner>
      <div class="cl-banner" role="note">
        <span class="cl-banner-icon" aria-hidden="true">◈</span>
        <p class="cl-banner-text">
          Um canal precisa estar <strong>habilitado</strong> e com <strong>webhook</strong> válido para
          entregar. Quando um aviso dispara, cada canal registra seu <strong>último desfecho</strong>
          (<em>enviado</em>, <em>falhou</em> ou <em>pulado</em>) — assim você vê de relance quais avisos
          estão de fato saindo.
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

    <!-- KPIs: leitura operacional rápida (recalculados sobre o conjunto carregado) -->
    <div class="cl-metrics" role="group" aria-label="Resumo dos canais">
      <UiMetricCard
        label="Canais configurados"
        :value="metrics.total"
        tone="primary"
        hint="Total cadastrado"
        :loading="r.loading.value"
        clickable
        @click="setQuickFilter('', '')"
      />
      <UiMetricCard
        label="Ativos"
        :value="metrics.enabled"
        tone="success"
        :hint="pct(metrics.enabled) + ' dos canais'"
        :loading="r.loading.value"
        clickable
        @click="setQuickFilter('true', '')"
      />
      <UiMetricCard
        label="Desativados"
        :value="metrics.disabled"
        tone="warning"
        hint="Avisos pulados aqui"
        :loading="r.loading.value"
        clickable
        @click="setQuickFilter('false', '')"
      />
      <UiMetricCard
        label="Com falha recente"
        :value="metrics.failing"
        tone="error"
        hint="Último desfecho: falhou"
        :loading="r.loading.value"
        clickable
        @click="setQuickFilter('', 'failed')"
      />
    </div>

    <UiCard title="Canais configurados" :subtitle="resultSummary">
      <template #actions>
        <span class="cl-density" role="group" aria-label="Densidade da tabela">
          <UiButton
            size="sm"
            :variant="density === 'comfortable' ? 'subtle' : 'ghost'"
            @click="density = 'comfortable'"
          >Confortável</UiButton>
          <UiButton
            size="sm"
            :variant="density === 'compact' ? 'subtle' : 'ghost'"
            @click="density = 'compact'"
          >Compacta</UiButton>
        </span>
      </template>

      <UiDataTable
        :columns="columns"
        :rows="pageRows"
        :loading="r.loading.value"
        row-key="id"
        :density="density"
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
        <!-- Canal: ícone + rótulo (ChannelIcon) -->
        <template #cell-channel="{ value }">
          <span class="cl-channel" :data-channel="value">
            <span class="cl-channel-icon" aria-hidden="true">{{ channelGlyph(value) }}</span>
            <span class="cl-channel-name">{{ channelLabel(value) }}</span>
          </span>
        </template>

        <!-- Evento assinado (enum único por canal) -->
        <template #cell-events="{ value }">
          <span v-if="value" class="cl-event" :data-event="value">
            <span class="cl-event-dot" aria-hidden="true" />
            {{ eventLabel(value) }}
          </span>
          <span v-else class="cl-all-events">Sem evento</span>
        </template>

        <!-- Webhook (truncado, com host em destaque) -->
        <template #cell-webhook_url="{ value }">
          <span class="cl-webhook ui-mono" :title="value || ''">
            {{ webhookHost(value) }}
          </span>
        </template>

        <!-- Habilitado: ToggleBadge -->
        <template #cell-enabled="{ row }">
          <span
            class="cl-toggle"
            :data-on="row.enabled ? 'true' : 'false'"
            role="status"
            :aria-label="row.enabled ? 'Canal habilitado' : 'Canal desabilitado'"
          >
            <span class="cl-toggle-track" aria-hidden="true"><span class="cl-toggle-knob" /></span>
            <span class="cl-toggle-text">{{ row.enabled ? 'Habilitado' : 'Desabilitado' }}</span>
          </span>
        </template>

        <!-- Último desfecho -->
        <template #cell-last_status="{ value }">
          <UiStatusBadge
            v-if="value"
            :status="value"
            :tone="statusTone(value)"
            :label="statusLabel(value)"
          />
          <span v-else class="cl-never ui-muted">Sem envios</span>
        </template>

        <template #cell-updated_at="{ value }">
          <span class="cl-when">{{ format.formatDateTime(value) }}</span>
        </template>

        <!-- Ações por linha -->
        <template #cell-_actions="{ row }">
          <span class="cl-actions" @click.stop>
            <UiButton
              size="sm"
              variant="subtle"
              :to="'/channels/' + row.id + '/edit'"
            >Editar</UiButton>
            <UiButton
              size="sm"
              :variant="row.enabled ? 'ghost' : 'subtle'"
              :loading="busyId === row.id"
              @click="toggleEnabled(row)"
            >{{ row.enabled ? 'Desativar' : 'Ativar' }}</UiButton>
            <UiButton
              size="sm"
              variant="danger"
              :loading="removingId === row.id"
              @click="removeChannel(row)"
            >Remover</UiButton>
          </span>
        </template>

        <template #empty-action>
          <UiButton to="/channels/new" variant="primary">{{ emptyActionLabel }}</UiButton>
          <UiButton to="/notifications" variant="subtle">Ver histórico de notificações</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Detalhe do canal (modal somente-leitura) -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <div v-if="selected" class="cl-detail">
        <div class="cl-detail-head" :data-channel="selected.channel">
          <span class="cl-detail-glyph" aria-hidden="true">{{ channelGlyph(selected.channel) }}</span>
          <div class="cl-detail-id">
            <span class="cl-detail-name">{{ channelLabel(selected.channel) }}</span>
            <span class="cl-detail-sub">Canal #{{ selected.id }}</span>
          </div>
          <span
            class="cl-toggle"
            :data-on="selected.enabled ? 'true' : 'false'"
            role="status"
            :aria-label="selected.enabled ? 'Canal habilitado' : 'Canal desabilitado'"
          >
            <span class="cl-toggle-track" aria-hidden="true"><span class="cl-toggle-knob" /></span>
            <span class="cl-toggle-text">{{ selected.enabled ? 'Habilitado' : 'Desabilitado' }}</span>
          </span>
        </div>

        <dl class="cl-dl">
          <div class="cl-dl-row">
            <dt>Evento assinado</dt>
            <dd>
              <span v-if="selected.events" class="cl-event" :data-event="selected.events">
                <span class="cl-event-dot" aria-hidden="true" />
                {{ eventLabel(selected.events) }}
              </span>
              <span v-else>Sem evento</span>
            </dd>
          </div>
          <div class="cl-dl-row">
            <dt>Último desfecho</dt>
            <dd>
              <UiStatusBadge
                v-if="selected.last_status"
                :status="selected.last_status"
                :tone="statusTone(selected.last_status)"
                :label="statusLabel(selected.last_status)"
              />
              <span v-else class="ui-muted">Nenhum envio registrado</span>
            </dd>
          </div>
          <div class="cl-dl-row cl-dl-row--stack">
            <dt>Webhook de entrega</dt>
            <dd class="cl-mono ui-mono">{{ selected.webhook_url || '—' }}</dd>
          </div>
          <div class="cl-dl-row">
            <dt>Criado em</dt>
            <dd>{{ format.formatDateTime(selected.created_at) }}</dd>
          </div>
          <div class="cl-dl-row">
            <dt>Atualizado em</dt>
            <dd>{{ format.formatDateTime(selected.updated_at) }}</dd>
          </div>
        </dl>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
        <UiButton
          v-if="selected"
          :variant="selected.enabled ? 'ghost' : 'subtle'"
          :loading="busyId === (selected && selected.id)"
          @click="toggleEnabled(selected)"
        >{{ selected && selected.enabled ? 'Desativar canal' : 'Ativar canal' }}</UiButton>
        <UiButton
          v-if="selected"
          variant="danger"
          :loading="removingId === (selected && selected.id)"
          @click="removeChannel(selected)"
        >Remover canal</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
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
  useConfirm,
  format,
} from '../ui/index.js';
import { channels } from '../api.js';

const toast = useToast();
const confirm = useConfirm();
// Recurso real: GET/PUT/DELETE /v1/channels (escopado por tenant na borda).
const r = useResource(channels, { pageSize: 25 });

// --- catálogos de domínio (REQ-STOCKPILOT-0007) ---
const CHANNELS = {
  email: { label: 'E-mail', glyph: '✉' },
  push: { label: 'Push web', glyph: '◔' },
  whatsapp: { label: 'WhatsApp', glyph: '✆' },
};
const EVENTS = {
  ruptura: 'Ruptura de estoque',
  falha_pedido: 'Falha no pedido',
};
const STATUS = {
  sent: 'Enviado',
  failed: 'Falhou',
  skipped: 'Pulado',
};

const columns = [
  { key: 'channel', label: 'Canal', sortable: true },
  { key: 'events', label: 'Evento assinado' },
  { key: 'webhook_url', label: 'Webhook' },
  { key: 'enabled', label: 'Estado', sortable: true, align: 'center' },
  { key: 'last_status', label: 'Último desfecho', sortable: true },
  { key: 'updated_at', label: 'Atualizado em', sortable: true, align: 'right' },
  { key: '_actions', label: 'Ações', align: 'right' },
];

const filterFields = [
  { key: 'channel', label: 'Tipo de canal', type: 'select', options: [
    { value: 'email', label: 'E-mail' },
    { value: 'push', label: 'Push web' },
    { value: 'whatsapp', label: 'WhatsApp' },
  ] },
  { key: 'enabled', label: 'Estado', type: 'select', options: [
    { value: 'true', label: 'Habilitado' },
    { value: 'false', label: 'Desabilitado' },
  ] },
  { key: 'last_status', label: 'Último desfecho', type: 'select', options: [
    { value: 'sent', label: 'Enviado' },
    { value: 'failed', label: 'Falhou' },
    { value: 'skipped', label: 'Pulado' },
  ] },
];
const filters = reactive({ channel: '', enabled: '', last_status: '' });

// Filtro/ordenação/paginação CLIENT-side sobre o conjunto carregado.
const density = ref('comfortable');
const sort = ref({ key: 'channel', dir: 'asc' });
const page = ref(1);
const pageSize = ref(25);

// useResource guarda o Error; UiPageLayout/UiErrorState querem uma mensagem string.
const errorMessage = computed(() => {
  const e = r.error.value;
  if (!e) return null;
  return e.message || 'Não foi possível carregar os canais.';
});

const filtered = computed(() => {
  let rows = r.items.value || [];
  if (filters.channel) rows = rows.filter((x) => x.channel === filters.channel);
  if (filters.enabled) rows = rows.filter((x) => Boolean(x.enabled) === (filters.enabled === 'true'));
  if (filters.last_status) rows = rows.filter((x) => x.last_status === filters.last_status);
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
  const enabled = rows.filter((x) => x.enabled).length;
  return {
    total: rows.length,
    enabled,
    disabled: rows.length - enabled,
    failing: rows.filter((x) => x.last_status === 'failed').length,
  };
});

const resultSummary = computed(() => {
  const n = filtered.value.length;
  if (!n) return 'Nenhum canal no filtro atual.';
  const active = [];
  if (filters.channel) active.push(channelLabel(filters.channel));
  if (filters.enabled) active.push(filters.enabled === 'true' ? 'habilitados' : 'desabilitados');
  if (filters.last_status) active.push(statusLabel(filters.last_status).toLowerCase());
  const scope = active.length ? ' · ' + active.join(' · ') : '';
  return n + (n === 1 ? ' canal' : ' canais') + scope;
});

const emptyState = computed(() => {
  const filtering = filters.channel || filters.enabled || filters.last_status;
  return filtering
    ? { title: 'Nada neste filtro', description: 'Ajuste o tipo, o estado ou o desfecho para ver outros canais.', icon: 'search' }
    : { title: 'Nenhum canal configurado', description: 'Sem canais, os avisos de ruptura e falha de pedido não saem. Configure ao menos um canal de entrega.', icon: 'inbox' };
});

// CTA do estado vazio: ao não haver NENHUM canal (sem filtro), o caminho primário é
// criar o primeiro; com filtro ativo, ainda oferecemos configurar um canal novo.
const emptyActionLabel = computed(() => {
  const filtering = filters.channel || filters.enabled || filters.last_status;
  return filtering ? 'Configurar canal' : 'Configurar primeiro canal';
});

function pct(n) {
  const total = metrics.value.total;
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}

// --- rótulos / helpers de exibição ---
const channelLabel = (c) => (CHANNELS[c] && CHANNELS[c].label) || format.humanize(c);
const channelGlyph = (c) => (CHANNELS[c] && CHANNELS[c].glyph) || '•';
const eventLabel = (e) => EVENTS[e] || format.humanize(e);
const statusLabel = (s) => STATUS[s] || format.humanize(s);

function statusTone(status) {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'skipped') return 'warning';
  return 'neutral';
}

// Mostra só o host do webhook (a URL completa fica no title= e no detalhe).
function webhookHost(url) {
  if (!url) return '—';
  try {
    const u = new URL(url);
    return u.host + (u.pathname && u.pathname !== '/' ? u.pathname : '');
  } catch {
    return String(url);
  }
}

// --- interações ---
function reload() {
  r.load()
    .then(() => { if (!r.error.value) toast.success('Canais atualizados.'); })
    .catch(() => toast.error('Não foi possível atualizar os canais.'));
}

function onFilter() {
  page.value = 1;
}

function setQuickFilter(enabled, lastStatus) {
  filters.channel = '';
  filters.enabled = enabled;
  filters.last_status = lastStatus;
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

// Alternar habilitado via PUT /v1/channels/:id (otimista com reconciliação no recarregamento).
const busyId = ref(null);
async function toggleEnabled(row) {
  if (!row || busyId.value) return;
  busyId.value = row.id;
  const next = !row.enabled;
  try {
    await r.update(row.id, { enabled: next });
    toast.success(channelLabel(row.channel) + (next ? ' habilitado.' : ' desabilitado.'));
    if (selected.value && selected.value.id === row.id) selected.value.enabled = next;
    await r.load();
  } catch (e) {
    toast.error('Não foi possível alterar o canal.', { detail: e && e.message });
  } finally {
    busyId.value = null;
  }
}

// Remover via DELETE /v1/channels/:id — destrutivo → confirmação obrigatória.
const removingId = ref(null);
async function removeChannel(row) {
  if (!row || removingId.value) return;
  const ok = await confirm({
    title: 'Remover canal de notificação',
    message: 'Remover o canal ' + channelLabel(row.channel) + ' (#' + row.id + ')? Os avisos deixarão de sair por este canal. Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover canal',
    danger: true,
  });
  if (!ok) return;
  removingId.value = row.id;
  try {
    await r.remove(row.id);
    toast.success('Canal removido.');
    if (selected.value && selected.value.id === row.id) detailOpen.value = false;
    await r.load();
  } catch (e) {
    toast.error('Não foi possível remover o canal.', { detail: e && e.message });
  } finally {
    removingId.value = null;
  }
}

// Detalhe
const detailOpen = ref(false);
const selected = ref(null);
const detailTitle = computed(() =>
  selected.value ? channelLabel(selected.value.channel) + ' · canal #' + selected.value.id : 'Canal'
);

function openDetail(row) {
  selected.value = row;
  detailOpen.value = true;
}

onMounted(r.load);
</script>

<style scoped>
/* Banner didático */
.cl-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.22);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.cl-banner-icon { color: rgb(var(--ui-accent-strong)); font-size: var(--ui-text-lg); line-height: 1.5; flex-shrink: 0; }
.cl-banner-text { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.cl-banner-text strong { font-weight: 700; }

/* KPIs */
.cl-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* Toggle de densidade no header do card */
.cl-density { display: inline-flex; gap: var(--ui-space-2); }

/* Canal (ícone + rótulo) — a marca StockPilot por iconografia, cor só por token */
.cl-channel { display: inline-flex; align-items: center; gap: var(--ui-space-2); font-weight: 600; white-space: nowrap; }
.cl-channel-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-md);
  flex-shrink: 0;
}
.cl-channel[data-channel="email"] .cl-channel-icon { background: rgb(var(--ui-accent) / 0.12); color: rgb(var(--ui-accent-strong)); }
.cl-channel[data-channel="push"] .cl-channel-icon { background: rgb(var(--ui-ok) / 0.14); color: rgb(var(--ui-ok)); }
.cl-channel[data-channel="whatsapp"] .cl-channel-icon { background: rgb(var(--ui-warn) / 0.16); color: rgb(var(--ui-warn)); }
.cl-channel-name { font-size: var(--ui-text-sm); }

/* Evento assinado */
.cl-event { display: inline-flex; align-items: center; gap: var(--ui-space-2); font-size: var(--ui-text-sm); font-weight: 600; white-space: nowrap; }
.cl-event-dot { width: var(--ui-space-2); height: var(--ui-space-2); border-radius: 50%; background: rgb(var(--ui-muted)); flex-shrink: 0; }
.cl-event[data-event="ruptura"] .cl-event-dot { background: rgb(var(--ui-danger)); }
.cl-event[data-event="falha_pedido"] .cl-event-dot { background: rgb(var(--ui-warn)); }
.cl-all-events { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-style: italic; }

/* Webhook */
.cl-webhook {
  display: inline-block;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ToggleBadge */
.cl-toggle { display: inline-flex; align-items: center; gap: var(--ui-space-2); white-space: nowrap; }
.cl-toggle-track {
  position: relative;
  width: 30px;
  height: 17px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.30);
  transition: background .15s ease;
  flex-shrink: 0;
}
.cl-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform .15s ease;
}
.cl-toggle[data-on="true"] .cl-toggle-track { background: rgb(var(--ui-ok) / 0.85); }
.cl-toggle[data-on="true"] .cl-toggle-knob { transform: translateX(13px); }
.cl-toggle-text { font-size: var(--ui-text-xs); font-weight: 600; }
.cl-toggle[data-on="true"] .cl-toggle-text { color: rgb(var(--ui-ok)); }
.cl-toggle[data-on="false"] .cl-toggle-text { color: rgb(var(--ui-muted)); }

/* Último desfecho — estado vazio */
.cl-never { font-size: var(--ui-text-sm); }
.cl-when { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); white-space: nowrap; }

/* Ações por linha */
.cl-actions { display: inline-flex; gap: var(--ui-space-2); justify-content: flex-end; }

/* Detalhe (modal) */
.cl-detail { display: flex; flex-direction: column; gap: var(--ui-space-5); }
.cl-detail-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface-2));
}
.cl-detail-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xl);
  flex-shrink: 0;
}
.cl-detail-head[data-channel="push"] .cl-detail-glyph { background: rgb(var(--ui-ok) / 0.14); color: rgb(var(--ui-ok)); }
.cl-detail-head[data-channel="whatsapp"] .cl-detail-glyph { background: rgb(var(--ui-warn) / 0.16); color: rgb(var(--ui-warn)); }
.cl-detail-id { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; }
.cl-detail-name { font-weight: 700; font-size: var(--ui-text-md); }
.cl-detail-sub { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

.cl-dl { display: grid; grid-template-columns: 1fr; gap: var(--ui-space-2); margin: 0; }
.cl-dl-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.cl-dl-row--stack { flex-direction: column; align-items: flex-start; gap: var(--ui-space-1); }
.cl-dl-row:last-child { border-bottom: none; padding-bottom: 0; }
.cl-dl dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.cl-dl dd { margin: 0; text-align: right; font-weight: 600; }
.cl-dl-row--stack dd { text-align: left; font-weight: 500; }
.cl-mono {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  word-break: break-all;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  width: 100%;
}

@media (max-width: 860px) {
  .cl-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cl-webhook { max-width: 140px; }
}
@media (max-width: 520px) {
  .cl-metrics { grid-template-columns: 1fr; }
  .cl-actions { flex-wrap: wrap; }
}
</style>
