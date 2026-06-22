<template>
  <UiPageLayout
    width="default"
    eyebrow="StockPilot — Notificações"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    :loading="loading"
    :error="errorMessage"
    @retry="load"
  >
    <!-- DetailHeader: ações de navegação (sempre rotas de DOMÍNIO) -->
    <template #actions>
      <UiButton variant="ghost" to="/notifications">
        <template #icon-left><span aria-hidden="true">←</span></template>
        Voltar
      </UiButton>
      <UiButton v-if="referenceLink" variant="subtle" :to="referenceLink">
        {{ referenceActionLabel }}
      </UiButton>
      <UiButton variant="ghost" :loading="copying" @click="copyId">Copiar ID</UiButton>
    </template>

    <!-- ESTADO VAZIO: notificação inexistente (404 tratado, sem ser erro de rede) -->
    <UiCard v-if="loaded && !record">
      <UiEmptyState
        icon="bell"
        title="Notificação não encontrada"
        description="Esse evento de notificação não existe ou foi removido. Volte para a lista de notificações."
      >
        <template #action>
          <UiButton to="/notifications">Ver notificações</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO NORMAL -->
    <template v-else-if="record">
      <!-- DetailHeader: identidade do evento -->
      <UiCard padded>
        <div class="nd-head">
          <div class="nd-head-id">
            <span class="nd-head-kind" :data-kind="record.tipo" aria-hidden="true">{{ eventGlyph }}</span>
            <div class="nd-head-titles">
              <p class="nd-head-eyebrow">Evento de notificação</p>
              <h2 class="nd-head-name">{{ eventLabel }}</h2>
              <p class="nd-head-meta ui-mono">#{{ record.id }} · {{ eventDescription }}</p>
            </div>
          </div>
          <div class="nd-head-badges">
            <UiStatusBadge :status="record.status" :tone="statusTone" :label="statusLabelText" size="lg" />
          </div>
        </div>
      </UiCard>

      <!-- KPIs do desfecho -->
      <div class="nd-metrics" role="group" aria-label="Resumo do desfecho">
        <UiMetricCard
          label="Status agregado"
          :value="statusLabelText"
          :tone="statusTone"
          :hint="statusHint"
        />
        <UiMetricCard
          label="Canais entregues"
          :value="deliveredCountLabel"
          :tone="deliveredTone"
          hint="confirmaram o envio"
        />
        <UiMetricCard
          label="Canais pulados"
          :value="String(skippedCount)"
          :tone="skippedCount ? 'warning' : 'neutral'"
          hint="sem configuração (graciosa)"
        />
        <UiMetricCard
          label="Tentativas"
          :value="String(attempts)"
          :tone="attempts > 1 ? 'warning' : 'neutral'"
          hint="reprocessamentos do evento"
        />
      </div>

      <div class="nd-grid">
        <!-- ChannelResultList: desfecho por canal -->
        <UiCard
          title="Desfecho por canal"
          subtitle="Resultado do fan-out multicanal, com o motivo quando não houve envio."
        >
          <template #actions>
            <UiStatusBadge
              :tone="deliveredTone"
              :label="channelSummaryLabel"
              :with-dot="true"
              size="sm"
            />
          </template>

          <ul v-if="channels.length" class="nd-channels" aria-label="Desfecho por canal">
            <li
              v-for="ch in channels"
              :key="ch.channel"
              class="nd-channel"
              :data-status="ch.status"
            >
              <span class="nd-channel-icon" aria-hidden="true">{{ channelGlyph(ch.channel) }}</span>
              <div class="nd-channel-main">
                <p class="nd-channel-name">{{ channelLabel(ch.channel) }}</p>
                <p v-if="ch.reason" class="nd-channel-reason">{{ channelReasonText(ch) }}</p>
                <p v-else class="nd-channel-reason ui-muted">{{ channelOkText(ch) }}</p>
              </div>
              <UiStatusBadge
                :tone="channelTone(ch.status)"
                :label="channelStatusLabel(ch.status)"
                :with-dot="true"
                size="sm"
              />
            </li>
          </ul>

          <UiEmptyState
            v-else
            compact
            icon="inbox"
            title="Sem desfecho por canal"
            description="Este evento ainda não registrou resultado de envio em nenhum canal."
          />
        </UiCard>

        <!-- coluna lateral: referência + linha do tempo + metadados -->
        <div class="nd-side">
          <!-- Referência (produto / pedido de origem) — sempre rota de DOMÍNIO -->
          <UiCard title="Referência">
            <dl class="nd-kv">
              <div>
                <dt>Origem</dt>
                <dd>{{ referenceLabel }}</dd>
              </div>
              <div>
                <dt>Identificador</dt>
                <dd class="ui-mono">{{ referenceIdText }}</dd>
              </div>
              <div>
                <dt>Operador</dt>
                <dd>{{ record.usuario_id || 'Sistema (automático)' }}</dd>
              </div>
            </dl>
            <template #footer>
              <div class="nd-ref-foot">
                <UiButton v-if="referenceLink" variant="subtle" size="sm" :to="referenceLink">
                  {{ referenceActionLabel }}
                </UiButton>
                <span v-else class="ui-muted nd-ref-empty">Sem destino de referência para abrir.</span>
              </div>
            </template>
          </UiCard>

          <!-- Timeline -->
          <UiCard title="Linha do tempo" subtitle="Sequência do evento, do disparo ao desfecho.">
            <ol class="nd-timeline">
              <li
                v-for="(step, i) in timeline"
                :key="i"
                class="nd-tl-item"
                :data-tone="step.tone"
              >
                <span class="nd-tl-dot" aria-hidden="true" />
                <div class="nd-tl-body">
                  <p class="nd-tl-title">{{ step.title }}</p>
                  <p v-if="step.detail" class="nd-tl-detail">{{ step.detail }}</p>
                  <p v-if="step.at" class="nd-tl-at ui-mono">{{ step.at }}</p>
                </div>
              </li>
            </ol>
          </UiCard>

          <!-- Metadados (datas) -->
          <UiCard title="Registro">
            <dl class="nd-kv">
              <div>
                <dt>Criado em</dt>
                <dd>{{ format.formatDateTime(record.created_at) }}</dd>
              </div>
              <div>
                <dt>Atualizado em</dt>
                <dd>{{ format.formatDateTime(record.updated_at) }}</dd>
              </div>
            </dl>
          </UiCard>
        </div>
      </div>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout, UiCard, UiButton, UiMetricCard, UiStatusBadge, UiEmptyState,
  useToast, format,
} from '../ui/index.js';
import { notifications } from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });
const toast = useToast();

const loading = ref(true);
const loaded = ref(false);
const error = ref(null);
const record = ref(null);
const copying = ref(false);

const errorMessage = computed(() => {
  if (!error.value) return null;
  return error.value.message || 'Não foi possível carregar a notificação.';
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await notifications.get(props.id);
    record.value = data && data.data !== undefined ? data.data : data || null;
    loaded.value = true;
  } catch (e) {
    if (e && e.status === 404) {
      record.value = null;
      loaded.value = true;
    } else {
      error.value = e;
    }
  } finally {
    loading.value = false;
  }
}

// ---- evento (tipo) -----------------------------------------------------------
const EVENTS = {
  ruptura: {
    label: 'Ruptura de estoque',
    glyph: '◆',
    description: 'Produto entrou abaixo do estoque mínimo.',
    refLabel: 'Produto em ruptura',
    refRoute: (refId) => '/products/' + refId,
    refAction: 'Ver produto',
  },
  falha_pedido: {
    label: 'Falha no pedido',
    glyph: '◈',
    description: 'A submissão do pedido ao fornecedor falhou (DLQ).',
    refLabel: 'Pedido de reposição',
    refRoute: (refId) => '/orders/' + refId,
    refAction: 'Ver pedido',
  },
};
const eventMeta = computed(() => EVENTS[record.value?.tipo] || null);
const eventLabel = computed(() => eventMeta.value?.label || format.humanize(record.value?.tipo) || 'Notificação');
const eventGlyph = computed(() => eventMeta.value?.glyph || '◉');
const eventDescription = computed(() => eventMeta.value?.description || 'Evento de notificação.');

// ---- cabeçalho ---------------------------------------------------------------
const headerTitle = computed(() => (record.value ? 'Notificação #' + record.value.id : 'Notificação'));
const headerSubtitle = computed(() =>
  record.value
    ? eventLabel.value + ' — desfecho por canal, tentativas e linha do tempo.'
    : 'Detalhe do evento de notificação.'
);

// ---- status agregado ---------------------------------------------------------
const STATUS = {
  sent: { label: 'Enviado', tone: 'success', hint: 'ao menos um canal entregou' },
  failed: { label: 'Falhou', tone: 'error', hint: 'nenhum canal entregou' },
  skipped: { label: 'Pulado', tone: 'warning', hint: 'nenhum canal configurado' },
  pending: { label: 'Pendente', tone: 'running', hint: 'aguardando processamento' },
};
const statusMeta = computed(() =>
  STATUS[record.value?.status] || { label: format.humanize(record.value?.status), tone: 'neutral', hint: '' }
);
const statusLabelText = computed(() => statusMeta.value.label);
const statusTone = computed(() => statusMeta.value.tone);
const statusHint = computed(() => statusMeta.value.hint);

const attempts = computed(() => Number(record.value?.tentativas ?? 0) || 0);

// ---- canais (ChannelResultList) ----------------------------------------------
// `canais` pode vir como array de {channel,status,reason}, JSON-string, ou lista de nomes.
function normalizeChannels(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (entry && typeof entry === 'object') {
        return {
          channel: entry.channel || entry.name || '?',
          status: entry.status || 'pending',
          reason: entry.reason || '',
        };
      }
      return { channel: String(entry), status: 'pending', reason: '' };
    })
    .filter((x) => x.channel && x.channel !== '?');
}
const channels = computed(() => normalizeChannels(record.value?.canais));

const CHANNELS = {
  email: { label: 'E-mail', glyph: '✉' },
  push: { label: 'Push web', glyph: '◔' },
  whatsapp: { label: 'WhatsApp', glyph: '✆' },
};
const channelLabel = (name) => CHANNELS[name]?.label || format.humanize(name);
const channelGlyph = (name) => CHANNELS[name]?.glyph || '•';

const CHANNEL_STATUS = { sent: 'Entregue', failed: 'Falhou', skipped: 'Pulado', pending: 'Pendente' };
const channelStatusLabel = (s) => CHANNEL_STATUS[s] || format.humanize(s);

function channelTone(status) {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'skipped') return 'warning';
  return 'neutral';
}

function channelReasonText(ch) {
  if (ch.status === 'skipped' && ch.reason === 'unconfigured') {
    return 'Canal sem configuração — pulado (degradação graciosa).';
  }
  if (ch.status === 'failed') return 'Erro na entrega: ' + ch.reason;
  return String(ch.reason);
}
function channelOkText(ch) {
  if (ch.status === 'sent') return 'Entrega confirmada pelo gateway do canal.';
  if (ch.status === 'skipped') return 'Canal pulado nesta execução.';
  if (ch.status === 'pending') return 'Aguardando processamento da fila.';
  return 'Sem detalhes adicionais.';
}

const deliveredCount = computed(() => channels.value.filter((c) => c.status === 'sent').length);
const skippedCount = computed(() => channels.value.filter((c) => c.status === 'skipped').length);
const failedCount = computed(() => channels.value.filter((c) => c.status === 'failed').length);
const deliveredCountLabel = computed(() => deliveredCount.value + ' de ' + channels.value.length);
const deliveredTone = computed(() =>
  deliveredCount.value > 0 ? 'success' : channels.value.length ? 'warning' : 'neutral'
);
const channelSummaryLabel = computed(() => {
  const parts = [];
  if (deliveredCount.value) parts.push(deliveredCount.value + ' entregues');
  if (failedCount.value) parts.push(failedCount.value + ' falharam');
  if (skippedCount.value) parts.push(skippedCount.value + ' pulados');
  return parts.length ? parts.join(' · ') : 'Sem envios';
});

// ---- referência (rota de DOMÍNIO; só rotas reais do inventário) --------------
const referenceLabel = computed(() => eventMeta.value?.refLabel || 'Referência');
const referenceActionLabel = computed(() => eventMeta.value?.refAction || 'Ver referência');
const referenceIdText = computed(() => {
  const refId = record.value?.referencia_id;
  return refId !== null && refId !== undefined ? '#' + refId : '—';
});
const referenceLink = computed(() => {
  const refId = record.value?.referencia_id;
  if (refId === null || refId === undefined || !eventMeta.value) return null;
  return eventMeta.value.refRoute(refId);
});

// ---- timeline ----------------------------------------------------------------
const timeline = computed(() => {
  const r = record.value;
  if (!r) return [];
  const steps = [];
  steps.push({
    title: 'Evento disparado',
    detail: eventDescription.value,
    at: format.formatDateTime(r.created_at),
    tone: 'running',
  });
  if (attempts.value > 1) {
    steps.push({
      title: 'Reprocessado',
      detail: 'Evento reenfileirado ' + (attempts.value - 1) + 'x (retry/backoff da fila transacional).',
      at: '',
      tone: 'warning',
    });
  }
  for (const ch of channels.value) {
    steps.push({
      title: channelLabel(ch.channel) + ' — ' + channelStatusLabel(ch.status).toLowerCase(),
      detail: ch.reason ? channelReasonText(ch) : channelOkText(ch),
      at: '',
      tone: channelTone(ch.status),
    });
  }
  steps.push({
    title: 'Desfecho registrado — ' + statusLabelText.value.toLowerCase(),
    detail: statusHint.value,
    at: format.formatDateTime(r.updated_at),
    tone: statusTone.value === 'running' ? 'neutral' : statusTone.value,
  });
  return steps;
});

// ---- ações -------------------------------------------------------------------
async function copyId() {
  if (!record.value) return;
  copying.value = true;
  try {
    const text = 'notificacao#' + record.value.id;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      toast.success('ID copiado para a área de transferência.');
    } else {
      toast.warning('Cópia automática indisponível neste navegador.');
    }
  } catch {
    toast.error('Não foi possível copiar o ID.');
  } finally {
    copying.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
/* DetailHeader */
.nd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ui-space-4); flex-wrap: wrap; }
.nd-head-id { display: flex; align-items: flex-start; gap: var(--ui-space-4); min-width: 0; }
.nd-head-kind {
  display: inline-flex; align-items: center; justify-content: center;
  width: 52px; height: 52px; flex-shrink: 0;
  font-size: 1.6rem; border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-accent) / 0.12); border: 1px solid rgb(var(--ui-accent) / 0.28);
  color: rgb(var(--ui-accent-strong));
}
.nd-head-kind[data-kind="falha_pedido"] { background: rgb(var(--ui-danger) / 0.12); border-color: rgb(var(--ui-danger) / 0.30); color: rgb(var(--ui-danger)); }
.nd-head-titles { min-width: 0; }
.nd-head-eyebrow { margin: 0; text-transform: uppercase; letter-spacing: .08em; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); font-weight: 700; }
.nd-head-name { font-size: var(--ui-text-xl); margin: 2px 0 0; }
.nd-head-meta { margin: 4px 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.nd-head-badges { display: flex; gap: var(--ui-space-2); align-items: center; flex-shrink: 0; }

/* KPIs */
.nd-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--ui-space-4); }

/* layout principal */
.nd-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: var(--ui-space-4); align-items: start; }
.nd-side { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* ChannelResultList */
.nd-channels { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.nd-channel {
  display: flex; align-items: center; gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border)); border-left: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-md); background: rgb(var(--ui-surface-2));
}
.nd-channel[data-status="sent"] { border-left-color: rgb(var(--ui-ok)); }
.nd-channel[data-status="failed"] { border-left-color: rgb(var(--ui-danger)); }
.nd-channel[data-status="skipped"] { border-left-color: rgb(var(--ui-warn)); }
.nd-channel-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; flex-shrink: 0; font-size: 1.1rem;
  border-radius: var(--ui-radius-sm); background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border)); color: rgb(var(--ui-muted));
}
.nd-channel-main { flex: 1 1 auto; min-width: 0; }
.nd-channel-name { margin: 0; font-weight: 600; }
.nd-channel-reason { margin: 2px 0 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); word-break: break-word; }

/* referência + registro (key/value) */
.nd-kv { display: grid; gap: var(--ui-space-3); margin: 0; }
.nd-kv dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.nd-kv dd { margin: 2px 0 0; }
.nd-ref-foot { display: flex; align-items: center; gap: var(--ui-space-2); }
.nd-ref-empty { font-size: var(--ui-text-sm); }

/* Timeline */
.nd-timeline { list-style: none; margin: 0; padding: 0; position: relative; }
.nd-tl-item { position: relative; padding: 0 0 var(--ui-space-4) var(--ui-space-5); }
.nd-tl-item::before {
  content: ""; position: absolute; left: 6px; top: 14px; bottom: -2px;
  width: 2px; background: rgb(var(--ui-border));
}
.nd-tl-item:last-child { padding-bottom: 0; }
.nd-tl-item:last-child::before { display: none; }
.nd-tl-dot {
  position: absolute; left: 0; top: 4px; width: 14px; height: 14px;
  border-radius: 50%; background: rgb(var(--ui-surface));
  border: 3px solid rgb(var(--ui-faint));
}
.nd-tl-item[data-tone="success"] .nd-tl-dot { border-color: rgb(var(--ui-ok)); }
.nd-tl-item[data-tone="error"] .nd-tl-dot { border-color: rgb(var(--ui-danger)); }
.nd-tl-item[data-tone="warning"] .nd-tl-dot { border-color: rgb(var(--ui-warn)); }
.nd-tl-item[data-tone="running"] .nd-tl-dot { border-color: rgb(var(--ui-accent)); }
.nd-tl-title { margin: 0; font-weight: 600; }
.nd-tl-detail { margin: 2px 0 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); word-break: break-word; }
.nd-tl-at { margin: 3px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-faint)); }

@media (max-width: 860px) {
  .nd-grid { grid-template-columns: 1fr; }
  .nd-head { flex-direction: column; }
  .nd-head-badges { align-self: flex-start; }
}
</style>
