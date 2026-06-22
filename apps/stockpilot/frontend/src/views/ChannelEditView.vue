<!--
  ChannelEditView — Editar canal de notificacao (REQ-STOCKPILOT-0007)
  Rota: /channels/:id/edit  ·  entidade: channels  ·  kind: edit

  Edita a configuracao de UM canal de notificacao multicanal: tipo do canal
  (email / push / whatsapp), webhook de entrega, eventos assinados (ruptura /
  falha de pedido) e habilitar/desabilitar — com validacao por campo, sumario
  de erros navegavel (a11y), pre-visualizacao do impacto na entrega, confirmacao
  em acao sensivel e toast de desfecho. Todos os estados sao renderizados:
  loading, error (com retry), nao-encontrado (empty + CTA) e normal.

  Endpoints REAIS (api.js):
    · GET  /v1/channels/{id}  — carrega o canal (api.channels.get)
    · PUT  /v1/channels/{id}  — persiste     (api.channels.update)
  O screen contract marca o PUT como "a criar". Enquanto ele nao entra no
  contrato do backend, a GRAVACAO fica fail-closed (regra dura: sem endpoint
  real → nao dispara a acao): banner honesto + botao "Salvar" desabilitado.
  A capacidade e ligada por flag de ambiente; default = desligado.

  Marca StockPilot (estoque/reposicao, teal/graphite) só via tokens --ui-*.
  CSP-safe: só classes + data-*; sem style inline / :style / v-html.
  Links de dominio do inventario (só rotas reais): /channels.
-->
<template>
  <UiPageLayout
    width="narrow"
    eyebrow="StockPilot · Canais de notificacao"
    :title="pageTitle"
    subtitle="Ajuste o webhook de entrega, os eventos assinados e o estado do canal. Mudancas passam por confirmacao antes de salvar."
    :loading="loading"
    loading-message="Carregando canal…"
    :error="loadError"
    @retry="load"
  >
    <!-- ações do cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :to="listRoute">
        <template #icon-left><span class="ce-ic" aria-hidden="true">‹</span></template>
        Canais
      </UiButton>
      <UiButton v-if="hasChannel" variant="ghost" :loading="testing" @click="onCheckConfig">
        Conferir configuracao
      </UiButton>
    </template>

    <!-- banner de capacidade: gravação ainda não publicada pelo backend -->
    <template v-if="hasChannel && !canPersist" #banner>
      <div class="ce-banner" role="status">
        <span class="ce-banner-ic" aria-hidden="true">⚑</span>
        <div class="ce-banner-txt">
          <p class="ce-banner-title">Gravacao ainda nao disponivel</p>
          <p class="ce-banner-sub">
            A edicao depende de <code class="ce-code">PUT /v1/channels/{id}</code>, que ainda nao foi
            publicado pela API. Voce pode revisar e validar as mudancas aqui — salvar sera habilitado
            assim que o endpoint entrar no contrato.
          </p>
        </div>
      </div>
    </template>

    <!-- ESTADO: canal inexistente (carregou, id não bate) -->
    <UiCard v-if="!loading && !loadError && !hasChannel">
      <UiEmptyState
        icon="bell"
        title="Canal nao encontrado"
        :description="emptyDescription"
      >
        <template #action>
          <UiButton :to="listRoute">Voltar para canais</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: normal — resumo vivo + formulário -->
    <template v-else-if="hasChannel">
      <!-- resumo vivo do canal (reflete o formulário em tempo real) -->
      <div class="ce-summary">
        <UiMetricCard
          label="Estado"
          :value="enabledLabel"
          :tone="enabledTone"
          :hint="enabledHint"
        />
        <UiMetricCard
          label="Eventos assinados"
          :value="subscribedCountLabel"
          :tone="subscribedTone"
          hint="gatilhos que disparam este canal"
        />
        <UiMetricCard
          label="Ultimo desfecho"
          :value="lastStatusLabel"
          :tone="lastStatusTone"
          :hint="lastStatusHint"
        />
      </div>

      <UiCard>
        <template #header>
          <div class="ce-card-head">
            <div class="ce-card-id">
              <span class="ce-kind" :data-kind="channelKind" aria-hidden="true">{{ channelGlyph }}</span>
              <div class="ce-card-titles">
                <h3 class="ce-card-title">{{ channelLabel }}</h3>
                <p class="ce-card-meta ce-mono">#{{ id }} · atualizado {{ updatedAtLabel }}</p>
              </div>
            </div>
            <UiStatusBadge
              :status="f.values.enabled ? 'enabled' : 'disabled'"
              :tone="f.values.enabled ? 'success' : 'neutral'"
              :label="enabledLabel"
              size="lg"
            />
          </div>
          <p class="ce-card-sub">
            Configuracao de entrega multicanal. Campos com <span class="ce-req" aria-hidden="true">*</span> sao obrigatorios.
          </p>
        </template>

        <form class="ce-form" novalidate @submit.prevent="onSubmit">
          <!-- sumário de validação navegável (a11y) -->
          <div
            v-if="showValidationSummary"
            ref="summaryRef"
            class="ce-valsum"
            role="alert"
            tabindex="-1"
            :aria-label="'Ha ' + errorList.length + ' erro(s) no formulario'"
          >
            <p class="ce-valsum-title">Revise os campos abaixo</p>
            <ul class="ce-valsum-list">
              <li v-for="e in errorList" :key="e.key">
                <button type="button" class="ce-valsum-link" @click="focusField(e.key)">
                  {{ e.label }}: {{ e.message }}
                </button>
              </li>
            </ul>
          </div>

          <!-- Form · SelectField + TextField -->
          <UiFormSection
            title="Identidade do canal"
            description="O tipo do canal define o formato da entrega. O webhook recebe o payload estruturado da notificacao."
            :columns="2"
          >
            <UiFormField
              label="Canal"
              :required="true"
              :error="f.errors.channel"
              hint="Tipo de entrega da notificacao."
            >
              <template #default="{ id: fid, describedBy }">
                <select
                  :id="fid"
                  class="ce-input"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.channel ? 'true' : null"
                  :value="f.values.channel"
                  @change="f.setField('channel', $event.target.value)"
                >
                  <option value="" disabled>Selecione o canal</option>
                  <option v-for="opt in CHANNEL_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField label="ID interno" hint="Identificador imutavel do canal.">
              <template #default="{ id: fid }">
                <input
                  :id="fid"
                  class="ce-input ce-readonly"
                  type="text"
                  :value="'#' + id"
                  readonly
                  aria-readonly="true"
                  tabindex="-1"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="Webhook URL"
              :required="true"
              :error="f.errors.webhook_url"
              :full-width="true"
              :hint="webhookHint"
            >
              <template #default="{ id: fid, describedBy }">
                <input
                  :id="fid"
                  ref="webhookRef"
                  class="ce-input"
                  type="url"
                  inputmode="url"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="https://hooks.exemplo.com/stockpilot/email"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.webhook_url ? 'true' : null"
                  :value="f.values.webhook_url"
                  @input="f.setField('webhook_url', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- MultiCheck · eventos assinados -->
          <UiFormSection
            title="Eventos assinados"
            description="Marque quais gatilhos disparam este canal. Sem nenhum evento, o canal nao recebe notificacoes."
            :columns="1"
          >
            <UiFormField
              label="Eventos"
              :error="f.errors.events"
              :full-width="true"
              hint="Selecione um ou mais gatilhos do dominio de estoque."
            >
              <template #default="{ describedBy }">
                <div class="ce-multi" role="group" aria-label="Eventos assinados" :aria-describedby="describedBy">
                  <label
                    v-for="ev in EVENT_OPTIONS"
                    :key="ev.value"
                    class="ce-check"
                    :data-on="isSubscribed(ev.value) ? 'true' : null"
                  >
                    <input
                      type="checkbox"
                      class="ce-check-box"
                      :checked="isSubscribed(ev.value)"
                      @change="toggleEvent(ev.value, $event.target.checked)"
                    />
                    <span class="ce-check-glyph" aria-hidden="true">{{ ev.glyph }}</span>
                    <span class="ce-check-text">
                      <span class="ce-check-name">{{ ev.label }}</span>
                      <span class="ce-check-desc">{{ ev.description }}</span>
                    </span>
                  </label>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- boolean · estado do canal -->
          <UiFormSection
            title="Estado do canal"
            description="Um canal desabilitado fica configurado, mas e ignorado no fan-out de notificacoes (degradacao graciosa)."
            :columns="1"
          >
            <UiFormField :full-width="true">
              <template #default>
                <label class="ce-toggle" :data-on="f.values.enabled ? 'true' : null">
                  <input
                    type="checkbox"
                    class="ce-toggle-box"
                    :checked="f.values.enabled"
                    @change="f.setField('enabled', $event.target.checked)"
                  />
                  <span class="ce-toggle-track" aria-hidden="true"><span class="ce-toggle-knob" /></span>
                  <span class="ce-toggle-text">
                    <span class="ce-toggle-name">{{ f.values.enabled ? 'Canal habilitado' : 'Canal desabilitado' }}</span>
                    <span class="ce-toggle-desc">{{ enabledHint }}</span>
                  </span>
                </label>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- pré-visualização do impacto na entrega -->
          <div class="ce-impact" :data-tone="impactTone" aria-live="polite">
            <span class="ce-impact-ic" aria-hidden="true">{{ impactGlyph }}</span>
            <p class="ce-impact-txt">{{ impactMessage }}</p>
          </div>

          <!-- FormActions -->
          <FormActions
            :dirty="isDirty"
            :can-persist="canPersist"
            :saving="f.submitting.value"
            @reset="onResetRequest"
            @cancel="onCancel"
          />
        </form>
      </UiCard>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, reactive, onMounted, nextTick, h } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormSection,
  UiFormField,
  UiMetricCard,
  UiStatusBadge,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { channels } from '../api.js';

/* channels: recurso REST REAL exposto por api.js (resourceFactory('channels') → /v1/channels).
   channels.get(id) → GET /v1/channels/{id} · channels.update(id, body) → PUT /v1/channels/{id}
   (screen contract: o PUT é "a criar"; ver `canPersist`). */

const props = defineProps({ id: { type: [String, Number], required: true } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

/* ---- rota de DOMINIO (só rotas reais do inventário) ---------------------- */
const listRoute = '/channels';

/* ---- catálogo de domínio (canais + eventos) ------------------------------ */
const CHANNEL_OPTIONS = [
  { value: 'email', label: 'E-mail' },
  { value: 'push', label: 'Push web' },
  { value: 'whatsapp', label: 'WhatsApp' },
];
const CHANNEL_META = {
  email: { label: 'E-mail', glyph: '✉', sample: 'https://hooks.exemplo.com/stockpilot/email' },
  push: { label: 'Push web', glyph: '🔔', sample: 'https://hooks.exemplo.com/stockpilot/push' },
  whatsapp: { label: 'WhatsApp', glyph: '💬', sample: 'https://hooks.exemplo.com/stockpilot/whatsapp' },
};
const EVENT_OPTIONS = [
  {
    value: 'ruptura',
    label: 'Ruptura de estoque',
    glyph: '📦',
    description: 'Produto entra abaixo do estoque minimo.',
  },
  {
    value: 'falha_pedido',
    label: 'Falha no pedido',
    glyph: '🛒',
    description: 'Submissao do pedido ao fornecedor falha (DLQ).',
  },
];
const LAST_STATUS = {
  sent: { label: 'Entregue', tone: 'success', hint: 'ultimo envio confirmado' },
  failed: { label: 'Falhou', tone: 'error', hint: 'ultimo envio nao entregou' },
  skipped: { label: 'Pulado', tone: 'warning', hint: 'canal pulado por falta de config' },
};
const FIELD_LABELS = { channel: 'Canal', webhook_url: 'Webhook URL', events: 'Eventos' };

/* ---- capacidade de gravar (fail-closed honesto) --------------------------
   Sem endpoint real publicado, a gravação fica desligada por padrão; uma flag
   de ambiente liga assim que o backend publicar o PUT. */
const canPersist = computed(() => {
  try {
    return String(import.meta.env.VITE_CHANNELS_WRITE_ENABLED || '').toLowerCase() === 'true';
  } catch {
    return false;
  }
});

/* ---- estado de carga ----------------------------------------------------- */
const loading = ref(true);
const loadError = ref(null);
const channel = ref(null);
const hasChannel = computed(() => !!channel.value);

const emptyDescription = computed(
  () =>
    'Nenhum canal de notificacao com o id ' +
    props.id +
    '. Ele pode ter sido removido ou pertencer a outro tenant.',
);

/* ---- formulário ---------------------------------------------------------- */
const baseline = reactive({ channel: '', webhook_url: '', events: [], enabled: false });
const webhookRef = ref(null);
const summaryRef = ref(null);

const f = useForm({
  initial: { channel: '', webhook_url: '', events: [], enabled: false },
  rules: {
    channel: [validators.required('Selecione o tipo do canal')],
    webhook_url: [
      validators.required('Informe a URL do webhook'),
      validators.pattern(/^https?:\/\/[^\s]+$/i, 'Use uma URL http(s) valida (sem espacos)'),
    ],
  },
});

/* ---- carregar canal ------------------------------------------------------ */
async function load() {
  loading.value = true;
  loadError.value = null;
  channel.value = null;
  try {
    const res = await channels.get(props.id);
    const data = res && res.data !== undefined ? res.data : res || null;
    channel.value = data || null;
    if (data) hydrate(data);
  } catch (e) {
    if (e && e.status === 404) {
      channel.value = null; // → estado "nao encontrado"
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}

function hydrate(c) {
  const vals = {
    channel: c.channel ?? '',
    webhook_url: c.webhook_url ?? '',
    events: normalizeEvents(c.events),
    enabled: !!c.enabled,
  };
  Object.assign(f.values, vals);
  baseline.channel = vals.channel;
  baseline.webhook_url = vals.webhook_url;
  baseline.events = [...vals.events];
  baseline.enabled = vals.enabled;
  for (const k of Object.keys(f.errors)) delete f.errors[k];
}

/* events pode vir como array, CSV ou valor único — normaliza p/ array */
function normalizeEvents(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

onMounted(load);

/* ---- MultiCheck de eventos ----------------------------------------------- */
function isSubscribed(value) {
  return Array.isArray(f.values.events) && f.values.events.includes(value);
}
function toggleEvent(value, on) {
  const cur = Array.isArray(f.values.events) ? [...f.values.events] : [];
  const idx = cur.indexOf(value);
  if (on && idx === -1) cur.push(value);
  if (!on && idx !== -1) cur.splice(idx, 1);
  f.setField('events', cur);
}

/* ---- derivações vivas ---------------------------------------------------- */
const channelKind = computed(() => f.values.channel || channel.value?.channel || '');
const channelMeta = computed(() => CHANNEL_META[channelKind.value] || null);
const channelGlyph = computed(() => channelMeta.value?.glyph || '📡');
const channelLabel = computed(
  () => channelMeta.value?.label || format.humanize(channelKind.value) || 'Canal de notificacao',
);

const webhookHint = computed(() => {
  const sample = channelMeta.value?.sample;
  return sample
    ? 'Endpoint http(s) que recebe o payload. Ex.: ' + sample
    : 'Endpoint http(s) que recebe o payload estruturado da notificacao.';
});

const enabledLabel = computed(() => (f.values.enabled ? 'Habilitado' : 'Desabilitado'));
const enabledTone = computed(() => (f.values.enabled ? 'success' : 'neutral'));
const enabledHint = computed(() =>
  f.values.enabled ? 'recebe notificacoes no fan-out' : 'ignorado no fan-out (degradacao graciosa)',
);

const subscribedCount = computed(() =>
  Array.isArray(f.values.events) ? f.values.events.length : 0,
);
const subscribedCountLabel = computed(() => subscribedCount.value + ' de ' + EVENT_OPTIONS.length);
const subscribedTone = computed(() => {
  if (subscribedCount.value === 0) return 'warning';
  if (subscribedCount.value === EVENT_OPTIONS.length) return 'success';
  return 'running';
});

const lastStatusMeta = computed(() => LAST_STATUS[channel.value?.last_status] || null);
const lastStatusLabel = computed(
  () =>
    lastStatusMeta.value?.label ||
    (channel.value?.last_status ? format.humanize(channel.value.last_status) : 'Sem envios'),
);
const lastStatusTone = computed(() => lastStatusMeta.value?.tone || 'neutral');
const lastStatusHint = computed(
  () => lastStatusMeta.value?.hint || 'nenhuma entrega registrada ainda',
);

const updatedAtLabel = computed(() => format.formatDateTime(channel.value?.updated_at));

const pageTitle = computed(() => {
  if (hasChannel.value && channelMeta.value) return 'Editar canal — ' + channelMeta.value.label;
  return 'Editar canal';
});

/* ---- pré-visualização do impacto na entrega ------------------------------ */
const impactTone = computed(() => {
  if (!isDirty.value) return 'neutral';
  if (!f.values.enabled) return 'warning';
  if (subscribedCount.value === 0) return 'warning';
  return 'success';
});
const impactGlyph = computed(() => {
  switch (impactTone.value) {
    case 'success':
      return '●';
    case 'warning':
      return '◆';
    default:
      return 'ℹ';
  }
});
const impactMessage = computed(() => {
  if (!isDirty.value) {
    return 'Nenhuma alteracao pendente. Edite um campo para ver o impacto na entrega.';
  }
  if (!f.values.enabled) {
    return 'Com estas mudancas o canal fica DESABILITADO — sera pulado no fan-out, mesmo com eventos assinados.';
  }
  if (subscribedCount.value === 0) {
    return 'O canal esta habilitado, mas SEM eventos assinados — nao recebera nenhuma notificacao. Marque ao menos um gatilho.';
  }
  const evs = f.values.events
    .map((e) => EVENT_OPTIONS.find((o) => o.value === e)?.label || e)
    .join(' e ');
  return 'Com estas mudancas o canal entrega em ' + channelLabel.value + ' para: ' + evs + '.';
});

/* ---- dirty / validação --------------------------------------------------- */
const isDirty = computed(
  () =>
    str(f.values.channel) !== str(baseline.channel) ||
    str(f.values.webhook_url) !== str(baseline.webhook_url) ||
    !!f.values.enabled !== !!baseline.enabled ||
    !sameSet(f.values.events, baseline.events),
);
function str(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}
function sameSet(a, b) {
  const aa = Array.isArray(a) ? [...a].sort() : [];
  const bb = Array.isArray(b) ? [...b].sort() : [];
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

const errorList = computed(() =>
  Object.keys(f.errors)
    .filter((k) => f.errors[k])
    .map((k) => ({ key: k, label: FIELD_LABELS[k] || k, message: f.errors[k] })),
);
const showValidationSummary = computed(() => errorList.value.length > 0);

/* ---- foco em campo a partir do sumário de erros -------------------------- */
function focusField(key) {
  if (typeof document === 'undefined') return;
  const id = activeFieldId(key);
  const el = id ? document.getElementById(id) : null;
  if (el && el.focus) el.focus();
}
function activeFieldId(key) {
  if (typeof document === 'undefined') return '';
  const label = FIELD_LABELS[key];
  const labels = document.querySelectorAll('.ce-form .ui-field-label');
  for (const l of labels) {
    const text = (l.textContent || '').replace(/\s*\*\s*$/, '').trim();
    if (text === label) return l.getAttribute('for') || '';
  }
  return '';
}

/* ---- submit (PUT, fail-closed + confirmação) ----------------------------- */
async function onSubmit() {
  if (!canPersist.value) {
    toast.warning('Gravacao indisponivel', {
      detail: 'O endpoint PUT /v1/channels/{id} ainda nao foi publicado pela API.',
    });
    return;
  }
  await f.handleSubmit(async (vals) => {
    if (errorList.value.length) {
      await nextTick();
      if (summaryRef.value && summaryRef.value.focus) summaryRef.value.focus();
      return;
    }
    const ok = await confirm({
      title: 'Salvar configuracao do canal?',
      message: confirmMessage(vals),
      confirmLabel: 'Salvar canal',
      cancelLabel: 'Revisar',
      danger: !vals.enabled,
    });
    if (!ok) return;
    try {
      const payload = {
        channel: str(vals.channel),
        webhook_url: str(vals.webhook_url),
        events: Array.isArray(vals.events) ? [...vals.events] : [],
        enabled: !!vals.enabled,
      };
      const updated = await channels.update(props.id, payload);
      const data = updated && updated.data !== undefined ? updated.data : updated;
      const next = data && data.id ? data : { ...channel.value, ...payload };
      channel.value = next;
      hydrate(next);
      toast.success('Canal atualizado', { detail: channelLabel.value });
      router.push(listRoute);
    } catch (e) {
      toast.error('Nao foi possivel salvar', {
        detail: e.message,
        code: e.status ? 'HTTP ' + e.status : '',
      });
    }
  });
}

function confirmMessage(vals) {
  const parts = [];
  if (str(vals.channel) !== str(baseline.channel)) parts.push('tipo do canal');
  if (str(vals.webhook_url) !== str(baseline.webhook_url)) parts.push('webhook');
  if (!sameSet(vals.events, baseline.events)) parts.push('eventos assinados');
  if (!!vals.enabled !== !!baseline.enabled) parts.push('estado');
  const what = parts.length ? 'Alterando: ' + parts.join(', ') + '. ' : '';
  const state = vals.enabled ? 'habilitado' : 'desabilitado';
  const n = Array.isArray(vals.events) ? vals.events.length : 0;
  return what + 'Apos salvar, o canal fica ' + state + ' com ' + n + ' evento(s) assinado(s).';
}

/* ---- descartar mudanças (destrutivo → confirmação) ----------------------- */
async function onResetRequest() {
  if (!isDirty.value) return;
  const ok = await confirm({
    title: 'Descartar alteracoes?',
    message: 'Os campos voltarao aos valores carregados do servidor. Esta acao nao pode ser desfeita.',
    confirmLabel: 'Descartar',
    cancelLabel: 'Manter editando',
    danger: true,
  });
  if (!ok) return;
  Object.assign(f.values, {
    channel: baseline.channel,
    webhook_url: baseline.webhook_url,
    events: [...baseline.events],
    enabled: baseline.enabled,
  });
  for (const k of Object.keys(f.errors)) delete f.errors[k];
  toast.info('Alteracoes descartadas');
}

/* ---- cancelar (guarda de saída com mudanças não salvas) ------------------ */
async function onCancel() {
  if (isDirty.value) {
    const ok = await confirm({
      title: 'Sair sem salvar?',
      message: 'Ha alteracoes nao salvas que serao perdidas.',
      confirmLabel: 'Sair sem salvar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }
  router.push(listRoute);
}

/* ---- conferência de configuração (validação local honesta) ---------------
   Não há endpoint de teste no contrato → conferimos consistência localmente,
   sem fingir uma entrega que o backend não oferece. */
const testing = ref(false);
async function onCheckConfig() {
  testing.value = true;
  try {
    const url = str(f.values.webhook_url);
    const valid = /^https?:\/\/[^\s]+$/i.test(url);
    if (!url) {
      toast.warning('Sem webhook', { detail: 'Informe a URL antes de conferir.' });
    } else if (!valid) {
      toast.error('Webhook invalido', {
        detail: 'A URL precisa comecar com http(s):// e nao conter espacos.',
      });
    } else if (!f.values.enabled) {
      toast.warning('Canal desabilitado', {
        detail: 'A URL parece valida, mas o canal esta desabilitado e seria pulado no fan-out.',
      });
    } else if (subscribedCount.value === 0) {
      toast.warning('Sem eventos assinados', {
        detail: 'A URL parece valida, mas o canal nao assina nenhum evento.',
      });
    } else {
      toast.success('Configuracao consistente', {
        detail:
          'Webhook valido, canal habilitado e com eventos assinados. O envio real ocorre no fan-out do worker.',
      });
    }
  } finally {
    testing.value = false;
  }
}

/* ---- FormActions: barra de ações (RenderFn — só UiButton + classes) ------- */
const FormActions = {
  name: 'FormActions',
  props: { dirty: Boolean, canPersist: Boolean, saving: Boolean },
  emits: ['reset', 'cancel'],
  setup(p, { emit }) {
    return () =>
      h('div', { class: 'ce-actions' }, [
        h('div', { class: 'ce-actions-left' }, [
          h(
            UiButton,
            { variant: 'ghost', type: 'button', disabled: !p.dirty, onClick: () => emit('reset') },
            { default: () => 'Descartar mudancas' },
          ),
        ]),
        h('div', { class: 'ce-actions-right' }, [
          h(
            UiButton,
            { variant: 'ghost', type: 'button', onClick: () => emit('cancel') },
            { default: () => 'Cancelar' },
          ),
          h(
            UiButton,
            {
              variant: 'primary',
              type: 'submit',
              loading: p.saving,
              disabled: !p.canPersist || !p.dirty || p.saving,
            },
            { default: () => (p.canPersist ? 'Salvar canal' : 'Salvar (indisponivel)') },
          ),
        ]),
      ]);
  },
};
</script>

<style scoped>
/* ---- marca StockPilot (estoque/reposicao, teal/graphite) via tokens --ui-* -- */

/* monospace utilitário (sem depender de classe global) */
.ce-mono,
.ce-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.ce-code {
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-surface-2));
  padding: 1px 5px;
  border-radius: var(--ui-radius-sm);
}

/* banner de capacidade */
.ce-banner {
  display: flex;
  gap: var(--ui-space-3);
  align-items: flex-start;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  border-left: 3px solid rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.1);
  border-radius: var(--ui-radius-md);
}
.ce-banner-ic {
  font-size: 1.2rem;
  color: rgb(var(--ui-warn));
  line-height: 1.4;
}
.ce-banner-txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ce-banner-title {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-sm);
}
.ce-banner-sub {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

/* resumo de métricas vivas */
.ce-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--ui-space-4);
}

/* cabeçalho do card */
.ce-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.ce-card-id {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
}
.ce-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  font-size: 1.4rem;
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-accent) / 0.12);
  border: 1px solid rgb(var(--ui-accent) / 0.28);
}
.ce-kind[data-kind='whatsapp'] {
  background: rgb(var(--ui-ok) / 0.12);
  border-color: rgb(var(--ui-ok) / 0.28);
}
.ce-kind[data-kind='push'] {
  background: rgb(var(--ui-warn) / 0.12);
  border-color: rgb(var(--ui-warn) / 0.28);
}
.ce-card-titles {
  min-width: 0;
}
.ce-card-title {
  font-size: var(--ui-text-lg);
  margin: 0;
}
.ce-card-meta {
  margin: 2px 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.ce-card-sub {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.ce-req {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}

/* formulário */
.ce-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.ce-ic {
  font-size: 1.1em;
  line-height: 1;
}

/* controles base (input/select herdam o estilo :deep do UiFormField; aqui só o readonly) */
.ce-readonly {
  background: rgb(var(--ui-surface-2)) !important;
  color: rgb(var(--ui-muted)) !important;
  cursor: default;
}

/* sumário de validação */
.ce-valsum {
  border: 1px solid rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.08);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  margin-bottom: var(--ui-space-3);
}
.ce-valsum:focus-visible {
  outline: 2px solid rgb(var(--ui-danger));
  outline-offset: 2px;
}
.ce-valsum-title {
  margin: 0 0 var(--ui-space-2);
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
}
.ce-valsum-list {
  margin: 0;
  padding-left: var(--ui-space-4);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ce-valsum-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
  cursor: pointer;
  text-align: left;
  text-decoration: underline;
}
.ce-valsum-link:focus-visible {
  outline: 2px solid rgb(var(--ui-danger));
  outline-offset: 2px;
}

/* MultiCheck de eventos */
.ce-multi {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--ui-space-3);
}
.ce-check {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-bg));
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.ce-check:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
}
.ce-check[data-on='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
}
.ce-check-box {
  margin-top: 2px;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: rgb(var(--ui-accent));
}
.ce-check-box:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.ce-check-glyph {
  font-size: 1.2rem;
  line-height: 1.2;
  flex-shrink: 0;
}
.ce-check-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.ce-check-name {
  font-weight: 600;
  font-size: var(--ui-text-sm);
}
.ce-check-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* toggle de estado (boolean) — checkbox visualmente oculto, track/knob CSS */
.ce-toggle {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-bg));
  cursor: pointer;
}
.ce-toggle[data-on='true'] {
  border-color: rgb(var(--ui-ok) / 0.5);
  background: rgb(var(--ui-ok) / 0.06);
}
.ce-toggle-box {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.ce-toggle-track {
  position: relative;
  width: 42px;
  height: 24px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint) / 0.5);
  transition: background 0.15s ease;
}
.ce-toggle[data-on='true'] .ce-toggle-track {
  background: rgb(var(--ui-ok));
}
.ce-toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(var(--ui-bg));
  transition: transform 0.15s ease;
}
.ce-toggle[data-on='true'] .ce-toggle-knob {
  transform: translateX(18px);
}
.ce-toggle-box:focus-visible + .ce-toggle-track {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.ce-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.ce-toggle-name {
  font-weight: 600;
  font-size: var(--ui-text-sm);
}
.ce-toggle-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* pré-visualização de impacto */
.ce-impact {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  margin: var(--ui-space-3) 0 var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.ce-impact-ic {
  font-size: 0.85rem;
  flex-shrink: 0;
}
.ce-impact-txt {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.ce-impact[data-tone='success'] {
  border-color: rgb(var(--ui-ok) / 0.4);
  background: rgb(var(--ui-ok) / 0.08);
}
.ce-impact[data-tone='success'] .ce-impact-ic {
  color: rgb(var(--ui-ok));
}
.ce-impact[data-tone='warning'] {
  border-color: rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
}
.ce-impact[data-tone='warning'] .ce-impact-ic {
  color: rgb(var(--ui-warn));
}
.ce-impact[data-tone='neutral'] .ce-impact-ic {
  color: rgb(var(--ui-muted));
}

/* barra de ações */
.ce-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
  flex-wrap: wrap;
}
.ce-actions-right {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .ce-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .ce-actions-left,
  .ce-actions-right {
    width: 100%;
  }
  .ce-actions-right {
    justify-content: stretch;
  }
}
</style>
