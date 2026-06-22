<!--
  ChannelCreateView — Novo canal de notificação (REQ-STOCKPILOT-0007)
  Rota: /channels/new  ·  entidade: channels  ·  kind: create

  Configura um canal de notificação multicanal: tipo (email / push / whatsapp),
  webhook de entrega, evento assinado (ruptura / falha de pedido) e estado
  (habilitado), com checagem de consistência antes de salvar.

  ── Endpoints REAIS (api.js → resourceFactory('channels') → /v1/channels) ──
    · POST /v1/channels  — cria o canal (channels.create) — usado neste fluxo
    · GET  /v1/channels  — lista os canais já configurados (painel lateral)
  NÃO existe rota de "teste de envio" no backend (server.js / openapi.yaml). A
  regra dura proíbe inventar endpoint, então o "Testar" faz uma CHECAGEM LOCAL
  de consistência (URL bem-formada, canal e evento coerentes) — honesta, sem
  fingir uma entrega que a API não oferece. O envio real ocorre no fan-out do
  worker depois que o canal está salvo.

  ── Contrato do campo `events` (OpenAPI ChannelInput) ──
    `events` é um ENUM ÚNICO opcional (ruptura | falha_pedido), NÃO um array.
    Por isso a seleção de evento é de escolha única (com opção "nenhum"); o
    payload envia uma string (ou omite o campo).

  Marca StockPilot (estoque/reposição, teal/graphite) só via tokens --ui-*.
  CSP-safe: apenas class + data-*; sem style inline / :style / v-html.
  Links sempre de DOMÍNIO do inventário (/notifications, /products, /orders) —
  só rotas reais.
-->
<template>
  <UiPageLayout
    width="wide"
    eyebrow="StockPilot · Canais de notificação"
    title="Novo canal"
    subtitle="Configure por onde os alertas de ruptura e falha de pedido serão entregues. Campos com * são obrigatórios."
  >
    <!-- ações do cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :to="CHANNELS_ROUTE">
        <template #icon-left><span class="cc-ic" aria-hidden="true">‹</span></template>
        Voltar para canais
      </UiButton>
    </template>

    <!-- banner didático: como o canal entra na esteira de alertas -->
    <template #banner>
      <div class="cc-banner" role="note">
        <span class="cc-banner-ic" aria-hidden="true">◉</span>
        <p class="cc-banner-txt">
          Um canal recebe o evento que você assina — <strong>ruptura</strong> de estoque ou
          <strong>falha no pedido</strong> — e o entrega via webhook. Sem configuração válida o
          canal é <strong>pulado</strong> sem derrubar os outros (degradação graciosa).
        </p>
      </div>
    </template>

    <div class="cc-grid">
      <!-- ════════════════ COLUNA DO FORMULÁRIO ════════════════ -->
      <div class="cc-main">
        <!-- sumário de validação: só após tentativa de envio com erros -->
        <div
          v-if="showSummary"
          ref="summaryRef"
          class="cc-valsum"
          role="alert"
          tabindex="-1"
          :aria-label="'Há ' + errorList.length + ' campo(s) com problema'"
        >
          <div class="cc-valsum-head">
            <span class="cc-valsum-ic" aria-hidden="true">!</span>
            <div>
              <p class="cc-valsum-title">Revise os campos destacados</p>
              <p class="cc-valsum-sub">
                {{ errorList.length }}
                {{ errorList.length === 1 ? 'campo precisa' : 'campos precisam' }} de atenção antes de salvar.
              </p>
            </div>
          </div>
          <ul class="cc-valsum-list">
            <li v-for="item in errorList" :key="item.key">
              <button type="button" class="cc-valsum-link" @click="focusField(item.key)">
                {{ item.label }}: {{ item.message }}
              </button>
            </li>
          </ul>
        </div>

        <!-- erro de API (falha no POST) -->
        <div v-if="submitError" class="cc-apierr" role="alert">
          <span class="cc-apierr-ic" aria-hidden="true">×</span>
          <div>
            <p class="cc-apierr-title">Não foi possível salvar o canal</p>
            <p class="cc-apierr-sub">{{ submitError }}</p>
          </div>
        </div>

        <UiCard title="Dados do canal" subtitle="Defina o tipo, o endpoint e o que o canal assina.">
          <form class="cc-form" novalidate @submit.prevent="onSubmit">
            <!-- ───── Tipo do canal (SelectField → cards de rádio) ───── -->
            <UiFormSection
              title="Tipo de canal"
              description="Escolha como o operador será notificado."
              :columns="1"
            >
              <UiFormField
                label="Canal"
                :required="true"
                :error="f.errors.channel"
                :hint="channelHint"
                full-width
              >
                <template #default="{ id, describedBy, hasError }">
                  <div
                    class="cc-choices"
                    role="radiogroup"
                    aria-label="Tipo de canal"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                  >
                    <button
                      v-for="(opt, idx) in CHANNEL_OPTIONS"
                      :id="idx === 0 ? id : null"
                      :key="opt.value"
                      ref="channelRefs"
                      type="button"
                      role="radio"
                      class="cc-choice"
                      :data-kind="opt.value"
                      :data-active="f.values.channel === opt.value ? 'true' : null"
                      :aria-checked="f.values.channel === opt.value ? 'true' : 'false'"
                      @click="selectChannel(opt.value)"
                    >
                      <span class="cc-choice-glyph" aria-hidden="true">{{ opt.glyph }}</span>
                      <span class="cc-choice-body">
                        <span class="cc-choice-name">{{ opt.label }}</span>
                        <span class="cc-choice-desc">{{ opt.desc }}</span>
                      </span>
                      <span class="cc-choice-check" aria-hidden="true">✓</span>
                    </button>
                  </div>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- ───── Endpoint (TextField) ───── -->
            <UiFormSection
              title="Endpoint de entrega"
              description="O webhook que recebe o payload estruturado do evento."
              :columns="1"
            >
              <UiFormField
                label="Webhook URL"
                :required="true"
                :error="f.errors.webhook_url"
                :hint="webhookHint"
                full-width
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="webhookRef"
                    type="url"
                    inputmode="url"
                    class="cc-mono"
                    :value="f.values.webhook_url"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    :placeholder="webhookSample"
                    autocomplete="off"
                    spellcheck="false"
                    @input="f.setField('webhook_url', $event.target.value.trim())"
                    @blur="f.validateField('webhook_url')"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- ───── Evento assinado (MultiCheck honrando enum único) ───── -->
            <UiFormSection
              title="Evento assinado"
              description="Qual acontecimento dispara uma notificação por este canal."
              :columns="1"
            >
              <UiFormField
                label="Evento"
                :error="f.errors.events"
                :hint="eventsHint"
                full-width
              >
                <template #default="{ describedBy, hasError }">
                  <fieldset
                    class="cc-checks"
                    role="radiogroup"
                    aria-label="Evento assinado"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                  >
                    <legend class="cc-sr-only">Evento assinado</legend>
                    <button
                      v-for="ev in EVENT_OPTIONS"
                      :key="ev.value"
                      type="button"
                      role="radio"
                      class="cc-check"
                      :data-active="f.values.events === ev.value ? 'true' : null"
                      :aria-checked="f.values.events === ev.value ? 'true' : 'false'"
                      @click="selectEvent(ev.value)"
                    >
                      <span class="cc-check-mark" :data-on="f.values.events === ev.value ? 'true' : null" aria-hidden="true">
                        <span class="cc-check-dot-inner" />
                      </span>
                      <span class="cc-check-body">
                        <span class="cc-check-name">
                          <span class="cc-check-dot" :data-event="ev.value" aria-hidden="true" />
                          {{ ev.label }}
                        </span>
                        <span class="cc-check-desc">{{ ev.desc }}</span>
                      </span>
                    </button>
                  </fieldset>
                  <p class="cc-hint-note">{{ EVENT_NOTE }}</p>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- ───── Estado (boolean) ───── -->
            <UiFormSection
              title="Estado do canal"
              description="Um canal desabilitado fica guardado, mas é ignorado no fan-out (degradação graciosa)."
              :columns="1"
            >
              <UiFormField label="Habilitado" full-width>
                <template #default="{ id, describedBy }">
                  <button
                    :id="id"
                    type="button"
                    class="cc-toggle"
                    role="switch"
                    :aria-checked="f.values.enabled ? 'true' : 'false'"
                    :aria-describedby="describedBy"
                    :data-on="f.values.enabled ? 'true' : null"
                    @click="toggleEnabled"
                  >
                    <span class="cc-toggle-track" aria-hidden="true"><span class="cc-toggle-knob" /></span>
                    <span class="cc-toggle-text">
                      <span class="cc-toggle-name">{{ f.values.enabled ? 'Canal habilitado' : 'Canal desabilitado' }}</span>
                      <span class="cc-toggle-desc">{{ enabledHint }}</span>
                    </span>
                  </button>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- ───── FormActions ───── -->
            <div class="cc-actions">
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="onCancel">
                Cancelar
              </UiButton>
              <UiButton type="submit" :loading="f.submitting.value">
                {{ f.submitting.value ? 'Salvando…' : 'Criar canal' }}
              </UiButton>
            </div>
          </form>
        </UiCard>
      </div>

      <!-- ════════════════ COLUNA LATERAL ════════════════ -->
      <aside class="cc-aside">
        <!-- prévia viva + TestButton -->
        <UiCard title="Prévia" subtitle="Como o canal entrará na esteira de alertas.">
          <dl class="cc-preview">
            <div class="cc-preview-row">
              <dt>Canal</dt>
              <dd>
                <span class="cc-preview-channel">
                  <span class="cc-preview-glyph" aria-hidden="true">{{ selectedChannel.glyph }}</span>
                  {{ selectedChannel.label }}
                </span>
              </dd>
            </div>
            <div class="cc-preview-row">
              <dt>Endpoint</dt>
              <dd class="cc-mono cc-preview-url">{{ f.values.webhook_url || '—' }}</dd>
            </div>
            <div class="cc-preview-row">
              <dt>Evento</dt>
              <dd>
                <span v-if="selectedEvent" class="cc-tag" :data-event="selectedEvent.value">{{ selectedEvent.label }}</span>
                <span v-else class="cc-muted">Nenhum</span>
              </dd>
            </div>
            <div class="cc-preview-row">
              <dt>Estado</dt>
              <dd>
                <UiStatusBadge
                  :status="f.values.enabled ? 'enabled' : 'disabled'"
                  :tone="f.values.enabled ? 'success' : 'neutral'"
                  :label="f.values.enabled ? 'Habilitado' : 'Desabilitado'"
                  with-dot
                />
              </dd>
            </div>
          </dl>

          <template #footer>
            <div class="cc-test">
              <div class="cc-test-head">
                <p class="cc-test-title">Testar configuração</p>
                <UiStatusBadge
                  v-if="testOutcome"
                  :status="testOutcome"
                  :tone="outcomeTone(testOutcome)"
                  :label="TEST_LABELS[testOutcome]"
                  size="sm"
                />
              </div>
              <p class="cc-test-hint">{{ testHint }}</p>
              <UiButton
                variant="subtle"
                block
                type="button"
                :loading="testing"
                :disabled="testing"
                @click="runTest"
              >
                <template #icon-left><span class="cc-ic" aria-hidden="true">⇅</span></template>
                {{ testing ? 'Checando…' : 'Checar configuração' }}
              </UiButton>
            </div>
          </template>
        </UiCard>

        <!-- canais já configurados — estado de dados COMPLETO -->
        <UiCard title="Canais configurados" :subtitle="recentSummary">
          <UiLoadingState v-if="recent.loading" variant="skeleton" :skeleton-lines="3" />
          <UiErrorState
            v-else-if="recent.error"
            :message="recent.error"
            :retryable="true"
            @retry="loadRecent"
          />
          <UiEmptyState
            v-else-if="!recent.items.length"
            icon="bell"
            title="Nenhum canal ainda"
            description="Este será o primeiro destino de notificações do tenant."
          >
            <template #action>
              <UiButton :to="NOTIFICATIONS_ROUTE" variant="subtle">Ver notificações</UiButton>
            </template>
          </UiEmptyState>
          <ul v-else class="cc-recent" aria-label="Canais já configurados">
            <li v-for="c in recent.items" :key="c.id" class="cc-recent-item">
              <RouterLink :to="NOTIFICATIONS_ROUTE" class="cc-recent-link">
                <span class="cc-recent-glyph" :data-kind="c.channel" aria-hidden="true">{{ channelGlyph(c.channel) }}</span>
                <span class="cc-recent-body">
                  <span class="cc-recent-name">{{ channelLabel(c.channel) }}</span>
                  <span class="cc-recent-url cc-mono">{{ c.webhook_url || '—' }}</span>
                </span>
                <span class="cc-recent-meta">
                  <UiStatusBadge
                    v-if="c.last_status"
                    :status="c.last_status"
                    :tone="outcomeTone(c.last_status)"
                    :label="OUTCOME_LABELS[c.last_status] || c.last_status"
                    size="sm"
                  />
                  <UiStatusBadge
                    :status="c.enabled ? 'enabled' : 'disabled'"
                    :tone="c.enabled ? 'success' : 'neutral'"
                    :label="c.enabled ? 'On' : 'Off'"
                    size="sm"
                  />
                </span>
              </RouterLink>
            </li>
          </ul>
        </UiCard>

        <!-- atalhos de domínio (só rotas reais do inventário) -->
        <UiCard title="Atalhos do inventário" subtitle="Origem dos eventos deste canal.">
          <div class="cc-links">
            <RouterLink class="cc-link" to="/products">
              <span class="cc-link-glyph" aria-hidden="true">📦</span>
              <span class="cc-link-body">
                <span class="cc-link-name">Produtos</span>
                <span class="cc-link-desc">Itens que entram em ruptura.</span>
              </span>
              <span class="cc-link-arrow" aria-hidden="true">›</span>
            </RouterLink>
            <RouterLink class="cc-link" to="/orders">
              <span class="cc-link-glyph" aria-hidden="true">🛒</span>
              <span class="cc-link-body">
                <span class="cc-link-name">Pedidos</span>
                <span class="cc-link-desc">Reposições que podem falhar (DLQ).</span>
              </span>
              <span class="cc-link-arrow" aria-hidden="true">›</span>
            </RouterLink>
          </div>
        </UiCard>
      </aside>
    </div>

    <!-- modal de resultado da checagem de configuração -->
    <UiModal v-model:open="testModalOpen" :title="testModalTitle" width="md">
      <div v-if="testResult" class="cc-tres">
        <div class="cc-tres-banner" :data-outcome="testResult.outcome">
          <span class="cc-tres-glyph" aria-hidden="true">{{ TEST_GLYPHS[testResult.outcome] }}</span>
          <div>
            <p class="cc-tres-title">{{ TEST_LABELS[testResult.outcome] }}</p>
            <p class="cc-tres-sub">{{ testResult.message }}</p>
          </div>
        </div>
        <dl class="cc-tres-dl">
          <div class="cc-tres-row">
            <dt>Canal</dt>
            <dd>{{ selectedChannel.label }}</dd>
          </div>
          <div class="cc-tres-row">
            <dt>Endpoint</dt>
            <dd class="cc-mono cc-preview-url">{{ f.values.webhook_url || '—' }}</dd>
          </div>
          <div class="cc-tres-row">
            <dt>Evento</dt>
            <dd>{{ selectedEvent ? selectedEvent.label : 'Nenhum' }}</dd>
          </div>
          <div v-if="testResult.detail" class="cc-tres-row">
            <dt>Detalhe</dt>
            <dd>{{ testResult.detail }}</dd>
          </div>
        </dl>
        <p class="cc-tres-foot">
          Esta é uma checagem local de consistência. O envio real ocorre no fan-out do worker
          depois que o canal estiver salvo.
        </p>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="testModalOpen = false">Fechar</UiButton>
        <UiButton
          v-if="testResult && testResult.outcome === 'sent'"
          variant="primary"
          :loading="f.submitting.value"
          @click="confirmFromModal"
        >
          Criar canal
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  UiModal,
  UiLoadingState,
  UiErrorState,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
} from '../ui/index.js';
import { channels } from '../api.js';

const router = useRouter();
const toast = useToast();
const ask = useConfirm();

/* ── rotas de DOMÍNIO (só rotas reais do inventário) ─────────────────────── */
const CHANNELS_ROUTE = '/channels';
const NOTIFICATIONS_ROUTE = '/notifications';

/* ── catálogo de domínio (REQ-STOCKPILOT-0007) ──────────────────────────── */
const CHANNEL_OPTIONS = [
  { value: 'email', label: 'E-mail', glyph: '✉', desc: 'Resumo do evento na caixa do operador.', sample: 'https://hooks.exemplo.com/stockpilot/email' },
  { value: 'push', label: 'Push web', glyph: '🔔', desc: 'Notificação instantânea no navegador.', sample: 'https://hooks.exemplo.com/stockpilot/push' },
  { value: 'whatsapp', label: 'WhatsApp', glyph: '💬', desc: 'Mensagem direta no celular de plantão.', sample: 'https://hooks.exemplo.com/stockpilot/whatsapp' },
];
const CHANNEL_BY_VALUE = Object.fromEntries(CHANNEL_OPTIONS.map((c) => [c.value, c]));

/* `events` é ENUM ÚNICO (ChannelInput) → seleção de escolha única + "nenhum". */
const EVENT_OPTIONS = [
  { value: 'ruptura', label: 'Ruptura de estoque', desc: 'Quando um produto fica sem unidades.' },
  { value: 'falha_pedido', label: 'Falha no pedido', desc: 'Quando o envio ao fornecedor falha (DLQ).' },
];
const EVENT_BY_VALUE = Object.fromEntries(EVENT_OPTIONS.map((e) => [e.value, e]));
const EVENT_NOTE = 'Cada canal assina um evento. Para cobrir os dois, crie um canal por evento.';

const TEST_LABELS = { sent: 'Configuração consistente', failed: 'Configuração inválida', skipped: 'Seria pulado' };
const TEST_GLYPHS = { sent: '✓', failed: '×', skipped: '–' };
const OUTCOME_LABELS = { sent: 'Último envio: OK', failed: 'Último envio: falhou', skipped: 'Último envio: pulado' };

/* ── refs de campo (foco a partir do sumário de validação) ──────────────── */
const webhookRef = ref(null);
const channelRefs = ref([]);
const summaryRef = ref(null);
const fieldLabels = { channel: 'Canal', webhook_url: 'Webhook URL', events: 'Evento' };

/* ── formulário (regras alinhadas ao ChannelInput) ──────────────────────── */
const f = useForm({
  initial: { channel: 'email', webhook_url: '', events: '', enabled: true },
  rules: {
    channel: [validators.required('Selecione o tipo de canal')],
    webhook_url: [
      validators.required('Informe a URL do webhook'),
      validators.pattern(/^https?:\/\/[^\s]+$/i, 'Use uma URL http(s) válida'),
    ],
  },
});

const submitError = ref('');

/* ── derivados ──────────────────────────────────────────────────────────── */
const selectedChannel = computed(() => CHANNEL_BY_VALUE[f.values.channel] || CHANNEL_OPTIONS[0]);
const selectedEvent = computed(() => EVENT_BY_VALUE[f.values.events] || null);
const channelHint = computed(() => selectedChannel.value.desc);
const webhookSample = computed(() => selectedChannel.value.sample);
const webhookHint = computed(() => 'Use HTTPS. Ex.: ' + selectedChannel.value.sample);
const eventsHint = computed(() =>
  selectedEvent.value
    ? 'Este canal será disparado em: ' + selectedEvent.value.label + '.'
    : 'Opcional, mas sem evento o canal não recebe notificações.',
);
const enabledHint = computed(() =>
  f.values.enabled ? 'Recebe notificações no fan-out do worker.' : 'Ignorado no fan-out (degradação graciosa).',
);

const errorList = computed(() =>
  Object.keys(fieldLabels)
    .filter((k) => f.errors[k])
    .map((k) => ({ key: k, label: fieldLabels[k], message: f.errors[k] })),
);
const showSummary = computed(() => errorList.value.length > 0);

const isDirty = computed(
  () => !!f.values.webhook_url || !!f.values.events || f.values.channel !== 'email' || f.values.enabled !== true,
);

/* ── rótulos auxiliares ─────────────────────────────────────────────────── */
const channelLabel = (c) => (CHANNEL_BY_VALUE[c] && CHANNEL_BY_VALUE[c].label) || c || '—';
const channelGlyph = (c) => (CHANNEL_BY_VALUE[c] && CHANNEL_BY_VALUE[c].glyph) || '📡';
function outcomeTone(s) {
  if (s === 'sent') return 'success';
  if (s === 'failed') return 'error';
  if (s === 'skipped') return 'warning';
  return 'neutral';
}

/* ── edição de campos compostos ─────────────────────────────────────────── */
function selectChannel(value) {
  f.setField('channel', value);
  testOutcome.value = '';
}
function selectEvent(value) {
  // escolha única + desmarcar (enum opcional): clicar no ativo limpa.
  f.setField('events', f.values.events === value ? '' : value);
  testOutcome.value = '';
}
function toggleEnabled() {
  f.setField('enabled', !f.values.enabled);
  testOutcome.value = '';
}

function focusField(key) {
  if (key === 'webhook_url' && webhookRef.value && webhookRef.value.focus) {
    webhookRef.value.focus();
    return;
  }
  if (key === 'channel') {
    const list = channelRefs.value || [];
    const el = list.find((b) => b && b.getAttribute && b.getAttribute('data-active') === 'true') || list[0];
    if (el && el.focus) el.focus();
  }
}

/* ── TestButton: CHECAGEM LOCAL de consistência (sem endpoint de teste) ────
   Não há POST /v1/channels/test no backend; a regra dura proíbe inventar
   rota. Validamos a configuração localmente e mostramos um desfecho honesto
   no mesmo vocabulário do fan-out (sent / skipped / failed). */
const testing = ref(false);
const testOutcome = ref(''); // sent | failed | skipped
const testResult = ref(null);
const testModalOpen = ref(false);

const testModalTitle = computed(() => 'Checagem · ' + selectedChannel.value.label);
const testHint = computed(() => {
  if (testOutcome.value === 'sent') return 'Configuração pronta para o fan-out do worker.';
  if (testOutcome.value === 'failed') return 'Há um problema na configuração. Veja os detalhes.';
  if (testOutcome.value === 'skipped') return 'A configuração entregaria, mas o canal seria pulado.';
  return 'Valida a configuração localmente antes de salvar (não envia nada).';
});

function evaluateConfig() {
  const url = String(f.values.webhook_url || '').trim();
  const validUrl = /^https?:\/\/[^\s]+$/i.test(url);
  if (!url) return { outcome: 'failed', message: 'Informe o webhook antes de checar.', detail: 'Webhook URL é obrigatório.' };
  if (!validUrl) return { outcome: 'failed', message: 'A URL do webhook é inválida.', detail: 'Deve começar com http(s):// e não conter espaços.' };
  if (!f.values.channel) return { outcome: 'failed', message: 'Selecione o tipo de canal.', detail: 'Canal é obrigatório.' };
  if (!f.values.enabled) {
    return { outcome: 'skipped', message: 'A URL é válida, mas o canal está desabilitado — seria pulado no fan-out.', detail: 'Habilite o canal para que ele entregue.' };
  }
  if (!f.values.events) {
    return { outcome: 'skipped', message: 'A URL é válida, mas o canal não assina nenhum evento — não receberá notificações.', detail: 'Assine ruptura ou falha de pedido.' };
  }
  return {
    outcome: 'sent',
    message: 'Webhook válido, canal habilitado e com evento assinado.',
    detail: 'Pronto para o fan-out em ' + selectedChannel.value.label + ' para "' + (selectedEvent.value ? selectedEvent.value.label : '') + '".',
  };
}

async function runTest() {
  if (testing.value) return;
  testing.value = true;
  submitError.value = '';
  try {
    const res = evaluateConfig();
    testOutcome.value = res.outcome;
    testResult.value = res;
    testModalOpen.value = true;
    if (res.outcome === 'sent') toast.success('Configuração consistente', { detail: selectedChannel.value.label });
    else if (res.outcome === 'skipped') toast.warning('Canal seria pulado', { detail: res.detail });
    else toast.error('Configuração inválida', { detail: res.detail });
  } finally {
    testing.value = false;
  }
}

async function confirmFromModal() {
  testModalOpen.value = false;
  await onSubmit();
}

/* ── canais já configurados (estado de dados completo, endpoint real) ────── */
const recent = reactive({ items: [], loading: false, error: '' });
const recentSummary = computed(() => {
  if (recent.loading) return 'Carregando…';
  if (recent.error) return 'Não foi possível carregar.';
  const n = recent.items.length;
  if (!n) return 'Nenhum canal cadastrado.';
  return n + (n === 1 ? ' canal no tenant.' : ' canais no tenant.');
});
async function loadRecent() {
  recent.loading = true;
  recent.error = '';
  try {
    const r = await channels.list({ pageSize: 6, sort: 'updated_at', dir: 'desc' });
    recent.items = (r.data || []).slice(0, 6);
  } catch (e) {
    recent.error = (e && e.message) || 'Falha ao carregar os canais.';
  } finally {
    recent.loading = false;
  }
}
onMounted(loadRecent);

/* ── navegação / submit ─────────────────────────────────────────────────── */
async function onCancel() {
  if (isDirty.value) {
    const ok = await ask({
      title: 'Descartar canal?',
      message: 'Você fez alterações que ainda não foram salvas. Sair agora descarta este canal.',
      confirmLabel: 'Descartar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }
  router.push(CHANNELS_ROUTE);
}

async function onSubmit() {
  submitError.value = '';
  if (!f.validate()) {
    await nextTick();
    if (summaryRef.value && summaryRef.value.focus) summaryRef.value.focus();
    return;
  }
  await f.handleSubmit(async (vals) => {
    try {
      // payload alinhado ao ChannelInput: events é string única (omitida se vazia).
      const payload = {
        channel: vals.channel,
        webhook_url: String(vals.webhook_url).trim(),
        enabled: !!vals.enabled,
      };
      if (vals.events) payload.events = vals.events;
      await channels.create(payload); // POST /v1/channels (real)
      toast.success('Canal criado', { detail: selectedChannel.value.label });
      router.push(CHANNELS_ROUTE);
    } catch (e) {
      const msg = (e && e.message) || 'Erro inesperado ao salvar.';
      submitError.value = msg;
      toast.error('Falha ao criar canal', { detail: msg, code: e && e.status ? 'HTTP ' + e.status : '' });
    }
  });
}
</script>

<style scoped>
/* ── marca StockPilot (estoque/reposição, teal/graphite) via tokens --ui-* ── */
.cc-ic {
  font-size: 1.1em;
  line-height: 1;
}
.cc-muted {
  color: rgb(var(--ui-muted));
}

/* ── banner didático ── */
.cc-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.22);
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.cc-banner-ic {
  color: rgb(var(--ui-accent-strong));
  font-size: 1rem;
  line-height: 1.5;
  flex-shrink: 0;
}
.cc-banner-txt {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.cc-banner-txt strong {
  font-weight: 700;
}

/* ── layout em duas colunas ── */
.cc-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.cc-main,
.cc-aside {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}

.cc-form {
  display: flex;
  flex-direction: column;
}

/* ── sumário de validação ── */
.cc-valsum {
  border: 1px solid rgb(var(--ui-danger) / 0.45);
  background: rgb(var(--ui-danger) / 0.08);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4);
}
.cc-valsum:focus-visible {
  outline: 2px solid rgb(var(--ui-danger));
  outline-offset: 2px;
}
.cc-valsum-head {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
}
.cc-valsum-ic {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
  font-weight: 800;
  font-size: var(--ui-text-sm);
  line-height: 1;
}
.cc-valsum-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.cc-valsum-sub {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.cc-valsum-list {
  list-style: none;
  margin: var(--ui-space-3) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.cc-valsum-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: rgb(var(--ui-danger));
  text-decoration: underline;
  text-underline-offset: 2px;
}
.cc-valsum-link:hover {
  filter: brightness(1.08);
}

/* ── erro de API ── */
.cc-apierr {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-danger) / 0.45);
  background: rgb(var(--ui-danger) / 0.08);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4);
}
.cc-apierr-ic {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
  font-weight: 800;
  line-height: 1;
}
.cc-apierr-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.cc-apierr-sub {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ── seletor de canal (radio cards) ── */
.cc-choices {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-3);
}
.cc-choice {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  text-align: left;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  cursor: pointer;
  font: inherit;
  color: rgb(var(--ui-fg));
  transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
}
.cc-choice:hover {
  border-color: rgb(var(--ui-accent) / 0.55);
  background: rgb(var(--ui-surface-2));
}
.cc-choice:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.cc-choice[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: 0 0 0 1px rgb(var(--ui-accent) / 0.45);
}
.cc-choice-glyph {
  font-size: 1.3rem;
  line-height: 1;
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
}
.cc-choice-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cc-choice-name {
  font-weight: 700;
}
.cc-choice-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.cc-choice-check {
  position: absolute;
  top: var(--ui-space-2);
  right: var(--ui-space-3);
  font-size: var(--ui-text-sm);
  font-weight: 800;
  color: rgb(var(--ui-accent-strong));
  opacity: 0;
  transition: opacity 0.12s ease;
}
.cc-choice[data-active="true"] .cc-choice-check {
  opacity: 1;
}

/* ── evento assinado (radio com marca circular) ── */
.cc-checks {
  border: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.cc-check {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  background: rgb(var(--ui-surface));
  font: inherit;
  color: rgb(var(--ui-fg));
  text-align: left;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.cc-check:hover {
  border-color: rgb(var(--ui-accent) / 0.5);
  background: rgb(var(--ui-surface-2));
}
.cc-check:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.cc-check[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.07);
}
.cc-check-mark {
  margin-top: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border-strong));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.12s ease;
}
.cc-check-mark[data-on="true"] {
  border-color: rgb(var(--ui-accent));
}
.cc-check-dot-inner {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-accent));
  transform: scale(0);
  transition: transform 0.12s ease;
}
.cc-check-mark[data-on="true"] .cc-check-dot-inner {
  transform: scale(1);
}
.cc-check-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cc-check-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.cc-check-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-muted));
  flex-shrink: 0;
}
.cc-check-dot[data-event="ruptura"] {
  background: rgb(var(--ui-danger));
}
.cc-check-dot[data-event="falha_pedido"] {
  background: rgb(var(--ui-warn));
}
.cc-check-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.cc-hint-note {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── toggle (habilitado) ── */
.cc-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-3);
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  color: rgb(var(--ui-fg));
  text-align: left;
}
.cc-toggle:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 3px;
  border-radius: var(--ui-radius-sm);
}
.cc-toggle-track {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint) / 0.5);
  border: 1px solid rgb(var(--ui-border-strong));
  transition: background 0.15s ease, border-color 0.15s ease;
  flex-shrink: 0;
}
.cc-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.15s ease;
}
.cc-toggle[data-on="true"] .cc-toggle-track {
  background: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok));
}
.cc-toggle[data-on="true"] .cc-toggle-knob {
  transform: translateX(20px);
}
.cc-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.cc-toggle-name {
  font-weight: 600;
  font-size: var(--ui-text-sm);
}
.cc-toggle-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── ações do form ── */
.cc-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
  flex-wrap: wrap;
}

/* ── prévia ── */
.cc-preview {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.cc-preview-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.cc-preview-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  flex-shrink: 0;
  padding-top: 2px;
}
.cc-preview-row dd {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--ui-fg));
  text-align: right;
  overflow-wrap: anywhere;
  min-width: 0;
}
.cc-preview-channel {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.cc-preview-glyph {
  color: rgb(var(--ui-accent-strong));
  font-size: 1.05rem;
  line-height: 1;
}
.cc-preview-url {
  font-size: var(--ui-text-xs);
}
.cc-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  background: rgb(var(--ui-muted) / 0.14);
  color: rgb(var(--ui-fg));
}
.cc-tag[data-event="ruptura"] {
  background: rgb(var(--ui-danger) / 0.14);
  color: rgb(var(--ui-danger));
}
.cc-tag[data-event="falha_pedido"] {
  background: rgb(var(--ui-warn) / 0.16);
  color: rgb(var(--ui-warn));
}

/* ── bloco de teste (footer da prévia) ── */
.cc-test {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.cc-test-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.cc-test-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.cc-test-hint {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── canais configurados ── */
.cc-recent {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.cc-recent-item + .cc-recent-item {
  border-top: 1px solid rgb(var(--ui-border));
}
.cc-recent-link {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  padding: var(--ui-space-2) var(--ui-space-1);
  border-radius: var(--ui-radius-sm);
}
.cc-recent-link:hover {
  background: rgb(var(--ui-surface-2));
}
.cc-recent-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: -2px;
}
.cc-recent-glyph {
  font-size: 1.1rem;
  width: 1.6rem;
  height: 1.6rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-accent) / 0.1);
  flex-shrink: 0;
}
.cc-recent-glyph[data-kind="whatsapp"] {
  background: rgb(var(--ui-ok) / 0.12);
}
.cc-recent-glyph[data-kind="push"] {
  background: rgb(var(--ui-warn) / 0.12);
}
.cc-recent-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}
.cc-recent-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.cc-recent-url {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc-recent-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* ── atalhos de domínio ── */
.cc-links {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.cc-link {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  text-decoration: none;
  color: inherit;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.cc-link:hover {
  border-color: rgb(var(--ui-accent) / 0.5);
  background: rgb(var(--ui-surface-2));
}
.cc-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.cc-link-glyph {
  font-size: 1.2rem;
  flex-shrink: 0;
}
.cc-link-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 auto;
  min-width: 0;
}
.cc-link-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.cc-link-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.cc-link-arrow {
  color: rgb(var(--ui-muted));
  font-size: 1.2rem;
  flex-shrink: 0;
}

/* ── modal de resultado da checagem ── */
.cc-tres {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.cc-tres-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
}
.cc-tres-banner[data-outcome="sent"] {
  background: rgb(var(--ui-ok) / 0.1);
  border-color: rgb(var(--ui-ok) / 0.32);
}
.cc-tres-banner[data-outcome="failed"] {
  background: rgb(var(--ui-danger) / 0.1);
  border-color: rgb(var(--ui-danger) / 0.32);
}
.cc-tres-banner[data-outcome="skipped"] {
  background: rgb(var(--ui-warn) / 0.12);
  border-color: rgb(var(--ui-warn) / 0.34);
}
.cc-tres-glyph {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  font-weight: 800;
  flex-shrink: 0;
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-fg));
}
.cc-tres-banner[data-outcome="sent"] .cc-tres-glyph {
  background: rgb(var(--ui-ok) / 0.18);
  color: rgb(var(--ui-ok));
}
.cc-tres-banner[data-outcome="failed"] .cc-tres-glyph {
  background: rgb(var(--ui-danger) / 0.18);
  color: rgb(var(--ui-danger));
}
.cc-tres-banner[data-outcome="skipped"] .cc-tres-glyph {
  background: rgb(var(--ui-warn) / 0.2);
  color: rgb(var(--ui-warn));
}
.cc-tres-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.cc-tres-sub {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.cc-tres-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.cc-tres-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.cc-tres-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.cc-tres-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
  flex-shrink: 0;
}
.cc-tres-row dd {
  margin: 0;
  text-align: right;
  font-weight: 600;
  overflow-wrap: anywhere;
  min-width: 0;
}
.cc-tres-foot {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── utilitários ── */
.cc-mono {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
.cc-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── responsivo ── */
@media (max-width: 980px) {
  .cc-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .cc-choices {
    grid-template-columns: 1fr;
  }
  .cc-actions {
    flex-direction: column-reverse;
  }
}
</style>
