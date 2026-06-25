<!--
  NotificationPreferenceEditView — Editar Preferência de Notificação
  ──────────────────────────────────────────────────────────────────────────────
  Edição de canal, endereço/contato e estado ativo/inativo de uma preferência
  específica (GET /v1/notification-preferences/:id + PUT /v1/notification-preferences/:id).

  Estados: loading (skeleton) · error (retry) · notFound (404/empty) · normal.

  ChannelSelector: cards visuais (email / push / whatsapp) com ícone + rótulo.
  ToggleSwitch: interruptor acessível com role=switch.
  TextInput: endereço/contato com validação cruzada (ativo exige contato válido).

  CSP-safe: sem style= inline, sem :style, sem v-html.
  Estado visual por class + data-* attributes.
  a11y: labels vinculados, role=switch, aria-* onde necessário, foco visível.
  Responsivo ≤ 860px.

  Rota: /notification-preferences/:id/edit
  Back/Cancelar → /notification-preferences (lista de domínio)
-->
<template>
  <UiPageLayout
    eyebrow="Notificações"
    :title="pageTitle"
    subtitle="Ajuste o canal, endereço de contato e se esta preferência está ativa."
    width="narrow"
    :loading="loading"
    loading-message="Carregando preferência…"
    :error="loadError"
    @retry="load"
  >
    <!-- ── AÇÕES DO TOPO ─────────────────────────────────────────────────── -->
    <template #actions>
      <UiButton variant="ghost" to="/notification-preferences">Voltar</UiButton>
    </template>

    <!-- ── BANNER DE CONTEXTO (canal ativo sem contato) ───────────────── -->
    <template #banner>
      <div
        v-if="!loading && !loadError && !notFound && warnNoContact"
        class="npe-banner"
        data-tone="warn"
        role="status"
        aria-label="Aviso: canal ativo sem endereço de contato"
      >
        <span class="npe-banner-icon" aria-hidden="true">◔</span>
        <p class="npe-banner-text">
          Este canal está ativo mas não tem endereço de contato configurado — as notificações serão ignoradas silenciosamente.
        </p>
      </div>
    </template>

    <!-- ── ESTADO: NOT FOUND ────────────────────────────────────────────── -->
    <UiEmptyState
      v-if="!loading && !loadError && notFound"
      title="Preferência não encontrada"
      description="Esta preferência pode ter sido removida ou o endereço está incorreto."
      icon="search"
    >
      <template #action>
        <UiButton to="/notification-preferences">Voltar para preferências</UiButton>
      </template>
    </UiEmptyState>

    <!-- ── ESTADO NORMAL: formulário ────────────────────────────────────── -->
    <div v-else-if="!loading && !loadError && !notFound" class="npe-root">

      <!-- Métricas de contexto -->
      <div class="npe-metrics" aria-label="Resumo da preferência">
        <UiMetricCard
          label="Canal"
          :value="channelLabel(f.values.channel)"
          :tone="channelTone(f.values.channel)"
          hint="Canal de entrega das notificações"
        />
        <UiMetricCard
          label="Estado"
          :value="f.values.enabled ? 'Ativo' : 'Inativo'"
          :tone="f.values.enabled ? 'success' : 'neutral'"
          :hint="f.values.enabled ? 'Notificações habilitadas' : 'Notificações desabilitadas'"
        />
        <UiMetricCard
          label="Contato"
          :value="contactSummary"
          :tone="contactSummaryTone"
          hint="Endereço ou número para entrega"
        />
      </div>

      <!-- Formulário principal -->
      <UiCard
        title="Editar preferência"
        subtitle="Canal, endereço e estado são editáveis. O usuário vinculado é somente leitura."
      >
        <template #actions>
          <UiStatusBadge
            :tone="f.values.enabled ? 'success' : 'neutral'"
            :label="f.values.enabled ? 'Ativo' : 'Inativo'"
            with-dot
          />
        </template>

        <form class="npe-form" novalidate @submit.prevent="save">

          <!-- Leitura: user_id (imutável) -->
          <div v-if="pref.user_id" class="npe-readonly-block" aria-label="Usuário vinculado (somente leitura)">
            <p class="npe-readonly-label">Usuário vinculado — somente leitura</p>
            <div class="npe-readonly-kv">
              <span class="npe-readonly-key">ID do usuário</span>
              <span class="npe-readonly-val">{{ pref.user_id }}</span>
            </div>
          </div>

          <!-- ChannelSelector ──────────────────────────────────────────── -->
          <UiFormSection
            title="Canal de notificação"
            description="Escolha o meio pelo qual as notificações serão entregues."
            :columns="1"
          >
            <UiFormField
              label="Canal"
              :required="true"
              :error="f.errors.channel"
              hint="Define onde a notificação será entregue."
              full-width
            >
              <template #default="{ id, describedBy }">
                <div
                  class="npe-channel-selector"
                  role="radiogroup"
                  :aria-labelledby="id"
                  :aria-describedby="describedBy || undefined"
                  :aria-invalid="f.errors.channel ? 'true' : undefined"
                >
                  <label
                    v-for="opt in CHANNEL_OPTIONS"
                    :key="opt.value"
                    class="npe-channel-card"
                    :data-selected="f.values.channel === opt.value ? 'true' : 'false'"
                    :data-tone="opt.tone"
                  >
                    <input
                      class="npe-channel-radio"
                      type="radio"
                      :name="id + '-channel'"
                      :value="opt.value"
                      :checked="f.values.channel === opt.value"
                      @change="onChannelChange(opt.value)"
                    />
                    <span class="npe-channel-glyph" aria-hidden="true">{{ opt.glyph }}</span>
                    <span class="npe-channel-body">
                      <span class="npe-channel-title">{{ opt.label }}</span>
                      <span class="npe-channel-hint">{{ opt.hint }}</span>
                    </span>
                    <span v-if="f.values.channel === opt.value" class="npe-channel-check" aria-hidden="true">✓</span>
                  </label>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Endereço de contato ──────────────────────────────────────── -->
          <UiFormSection
            title="Endereço de contato"
            description="Para onde enviamos a notificação neste canal."
            :columns="1"
          >
            <UiFormField
              :label="contactFieldLabel"
              :hint="contactFieldHint"
              :error="f.errors.contact_value"
              full-width
            >
              <template #default="{ id, describedBy, hasError }">
                <UiInput
                  :id="id"
                  :type="contactInputType"
                  :model-value="f.values.contact_value"
                  :placeholder="contactInputPlaceholder"
                  :described-by="describedBy"
                  :error="hasError"
                  :autocomplete="contactInputAutocomplete"
                  @update:model-value="f.setField('contact_value', $event)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- ToggleSwitch ─────────────────────────────────────────────── -->
          <UiFormSection
            title="Estado da preferência"
            description="Quando inativo, as notificações deste canal não são enviadas."
            :columns="1"
          >
            <div class="npe-toggle-row" role="group" aria-labelledby="npe-toggle-heading">
              <div class="npe-toggle-copy" id="npe-toggle-heading">
                <p class="npe-toggle-title">{{ f.values.enabled ? 'Preferência ativa' : 'Preferência inativa' }}</p>
                <p class="npe-toggle-desc">
                  {{ f.values.enabled
                    ? 'Notificações por ' + channelLabel(f.values.channel) + ' estão habilitadas.'
                    : 'Notificações por ' + channelLabel(f.values.channel) + ' estão desabilitadas.' }}
                </p>
              </div>
              <button
                type="button"
                class="npe-switch"
                role="switch"
                :aria-checked="f.values.enabled ? 'true' : 'false'"
                :aria-label="'Ativar notificações por ' + channelLabel(f.values.channel)"
                :data-on="f.values.enabled ? 'true' : null"
                @click="onToggleEnabled"
              >
                <span class="npe-switch-knob" aria-hidden="true"></span>
              </button>
            </div>
          </UiFormSection>

          <!-- Ações do formulário ──────────────────────────────────────── -->
          <div class="npe-form-actions">
            <p v-if="!dirty" class="npe-no-changes" role="status">
              Nenhuma alteração pendente.
            </p>
            <div class="npe-form-btns">
              <UiButton
                variant="ghost"
                type="button"
                :disabled="f.submitting.value"
                @click="cancel"
              >
                Cancelar
              </UiButton>
              <UiButton
                type="submit"
                variant="primary"
                :loading="f.submitting.value"
                :disabled="!dirty || f.submitting.value"
              >
                Salvar alterações
              </UiButton>
            </div>
          </div>

        </form>
      </UiCard>

      <!-- Card lateral: resumo e auditoria ─────────────────────────────── -->
      <UiCard
        title="Detalhes do registro"
        subtitle="Dados de criação e identificação desta preferência."
      >
        <dl class="npe-kv">
          <div>
            <dt>ID</dt>
            <dd class="npe-kv-mono">{{ pref.id || '—' }}</dd>
          </div>
          <div v-if="pref.user_id">
            <dt>Usuário</dt>
            <dd class="npe-kv-mono">{{ pref.user_id }}</dd>
          </div>
          <div>
            <dt>Canal</dt>
            <dd>
              <UiStatusBadge
                :tone="channelTone(f.values.channel)"
                :label="channelLabel(f.values.channel)"
              />
            </dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <UiStatusBadge
                :tone="f.values.enabled ? 'success' : 'neutral'"
                :label="f.values.enabled ? 'Ativo' : 'Inativo'"
                with-dot
              />
            </dd>
          </div>
          <div v-if="pref.created_at">
            <dt>Criado em</dt>
            <dd>{{ format.formatDateTime(pref.created_at) }}</dd>
          </div>
        </dl>
      </UiCard>

    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiFormSection,
  UiFormField,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  UiInput,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// ── Props ─────────────────────────────────────────────────────────────────────
const props = defineProps({ id: { type: String, required: true } });

// ── Services ──────────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// Recurso REST → /v1/notification-preferences
const npResource =
  api['notification-preferences'] ||
  (api.resourceFactory ? api.resourceFactory('notification-preferences') : null);

// ── Rota de domínio de retorno ───────────────────────────────────────────────
const backTo = '/notification-preferences';

// ── Estado de tela ────────────────────────────────────────────────────────────
const loading = ref(true);
const loadError = ref(null);
const pref = reactive({});

const notFound = computed(
  () => !loading.value && !loadError.value && !pref.id
);

const pageTitle = computed(() => {
  if (pref.id) return 'Editar preferência — ' + channelLabel(pref.channel);
  return 'Editar preferência de notificação';
});

// ── Opções de canal (ChannelSelector) ─────────────────────────────────────────
const CHANNEL_OPTIONS = [
  {
    value: 'email',
    label: 'E-mail',
    hint: 'Resumos e confirmações na sua caixa de entrada.',
    glyph: '✉',
    tone: 'running',
  },
  {
    value: 'push',
    label: 'Push (navegador)',
    hint: 'Avisos instantâneos mesmo com a aba fechada.',
    glyph: '◉',
    tone: 'primary',
  },
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    hint: 'Mensagens diretas no número cadastrado.',
    glyph: '◎',
    tone: 'success',
  },
];

function channelLabel(value) {
  const opt = CHANNEL_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : (value ? format.humanize(value) : '—');
}

function channelTone(value) {
  const opt = CHANNEL_OPTIONS.find((o) => o.value === value);
  return opt ? opt.tone : 'neutral';
}

// ── Formulário (canal + contato + enabled) ────────────────────────────────────
const f = useForm({
  initial: { channel: '', contact_value: '', enabled: false },
  rules: {
    channel: [validators.required('Selecione um canal de notificação.')],
    contact_value: [
      (v, all) => {
        if (all.channel === 'push') return ''; // push não exige contato textual
        if (!all.enabled) return ''; // inativo: não exige
        return validators.required('Informe um endereço de contato para ativar este canal.')(v);
      },
      (v, all) => {
        if (!v || all.channel === 'push') return '';
        if (all.channel === 'email') {
          return validators.email('E-mail inválido. Verifique o endereço.')(v);
        }
        if (all.channel === 'whatsapp') {
          return validators.pattern(
            /^\+?[0-9\s().-]{8,20}$/,
            'Telefone inválido. Use DDI/DDD, ex.: +55 11 99999-0000.'
          )(v);
        }
        return '';
      },
    ],
  },
});

// Snapshot para detectar alterações não salvas
const snapshot = ref('');
function currentSnapshot() {
  return JSON.stringify({
    channel: f.values.channel,
    contact_value: f.values.contact_value,
    enabled: f.values.enabled,
  });
}
const dirty = computed(() => snapshot.value !== currentSnapshot());

// ── Derivados do formulário ───────────────────────────────────────────────────
const contactFieldLabel = computed(() => {
  if (f.values.channel === 'whatsapp') return 'Telefone (com DDD)';
  if (f.values.channel === 'email') return 'Endereço de e-mail';
  return 'Endereço de contato';
});

const contactFieldHint = computed(() => {
  if (f.values.channel === 'email') return 'Para onde enviamos e-mails de notificação.';
  if (f.values.channel === 'whatsapp') return 'Número no formato internacional, ex.: +55 11 99999-0000.';
  if (f.values.channel === 'push') return 'Push é vinculado ao dispositivo — não requer endereço textual.';
  return 'Informe o contato para entrega da notificação.';
});

const contactInputType = computed(() => {
  if (f.values.channel === 'email') return 'email';
  if (f.values.channel === 'whatsapp') return 'tel';
  return 'text';
});

const contactInputPlaceholder = computed(() => {
  if (f.values.channel === 'email') return 'voce@clinica.com.br';
  if (f.values.channel === 'whatsapp') return '+55 11 99999-0000';
  return '';
});

const contactInputAutocomplete = computed(() => {
  if (f.values.channel === 'email') return 'email';
  if (f.values.channel === 'whatsapp') return 'tel';
  return undefined;
});

const contactSummary = computed(() => {
  const v = (f.values.contact_value || '').trim();
  if (f.values.channel === 'push') return 'Por dispositivo';
  return v || '—';
});

const contactSummaryTone = computed(() => {
  if (f.values.channel === 'push') return 'primary';
  const v = (f.values.contact_value || '').trim();
  if (f.values.enabled && !v) return 'warning';
  return v ? 'success' : 'neutral';
});

// Avisa se canal ativo sem contato (exceto push)
const warnNoContact = computed(() => {
  if (!f.values.enabled) return false;
  if (f.values.channel === 'push') return false;
  return !(f.values.contact_value || '').trim();
});

// ── Carga inicial ─────────────────────────────────────────────────────────────
function hydrate(rec) {
  Object.keys(pref).forEach((k) => delete pref[k]);
  Object.assign(pref, rec || {});
  f.values.channel = rec.channel || '';
  f.values.contact_value = rec.contact_value || '';
  f.values.enabled = !!rec.enabled;
  snapshot.value = currentSnapshot();
}

async function load() {
  loading.value = true;
  loadError.value = null;
  Object.keys(pref).forEach((k) => delete pref[k]);

  if (!npResource) {
    loadError.value = new Error('Recurso de preferências de notificação indisponível.');
    loading.value = false;
    return;
  }

  try {
    const rec = await npResource.get(props.id);
    if (rec && rec.id) {
      hydrate(rec);
    }
  } catch (e) {
    if (e && e.status === 404) {
      // notFound derivado pelo computed (pref sem id)
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}

// ── Handlers de interação ─────────────────────────────────────────────────────
function onChannelChange(value) {
  f.setField('channel', value);
  // Limpa validação do contato ao trocar de canal (regra muda)
  if (f.errors.contact_value) f.errors.contact_value = '';
}

async function onToggleEnabled() {
  const turningOff = f.values.enabled;
  if (turningOff) {
    const ok = await confirm({
      title: 'Desativar preferência?',
      message:
        'Notificações por ' +
        channelLabel(f.values.channel) +
        ' serão suspensas. Você pode reativar a qualquer momento.',
      confirmLabel: 'Desativar',
      cancelLabel: 'Manter ativo',
      danger: true,
    });
    if (!ok) return;
  }
  f.setField('enabled', !f.values.enabled);
}

// ── Salvar ────────────────────────────────────────────────────────────────────
function save() {
  if (!dirty.value) {
    toast.info('Nenhuma alteração detectada.');
    return;
  }

  f.handleSubmit(async (vals) => {
    try {
      await npResource.update(props.id, {
        channel: vals.channel,
        contact_value: vals.channel === 'push' ? '' : (vals.contact_value || '').trim(),
        enabled: !!vals.enabled,
      });
      // Atualiza snapshot após salvar (dirty → false)
      hydrate({ ...pref, ...vals });
      toast.success('Preferência de notificação salva com sucesso.');
    } catch (e) {
      if (e && e.status === 404) {
        toast.error('Esta preferência não foi encontrada. Ela pode ter sido removida.');
        return;
      }
      if (e && e.status === 403) {
        toast.error('Sem permissão para editar esta preferência.');
        return;
      }
      toast.error(e.message || 'Não foi possível salvar a preferência.', {
        detail: e.message,
        code: e.status,
      });
    }
  });
}

// ── Cancelar (confirma se dirty) ──────────────────────────────────────────────
async function cancel() {
  if (dirty.value) {
    const ok = await confirm({
      title: 'Descartar alterações?',
      message: 'As alterações ainda não foram salvas. Descartar e voltar para a lista?',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  if (pref.id) {
    window.history.length > 2
      ? router.back()
      : router.push(backTo);
  } else {
    router.push(backTo);
  }
}

onMounted(load);
</script>

<style scoped>
/* ── Propriedades locais (geométricas) ───────────────────────────────────── */
/*    Valores de tamanho sem token direto ficam aqui como props locais,       */
/*    sempre referenciando tokens --ui-* quando possível.                     */
:root,
.npe-root,
.npe-channel-card,
.npe-switch {
  /* glifo do canal: maior que --ui-text-xl (20 px) → escalonamento relativo */
  --_glyph-size: calc(var(--ui-text-xl) * 1.25);
  /* check badge (posição absoluta no card) */
  --_check-size: var(--ui-space-5);
  /* switch — trilho */
  --_track-w: calc(var(--ui-space-5) + var(--ui-space-4));   /* 24+16 = 40px */
  --_track-h: calc(var(--ui-space-4) + var(--ui-space-1) * 2.75); /* ≈27px */
  /* switch — botão deslizante */
  --_knob-size: calc(var(--_track-h) - var(--ui-space-1) * 2);
  /* transição padrão */
  --_duration: var(--ui-duration-fast, 0.15s);
}

/* ── Root ────────────────────────────────────────────────────────────────── */
.npe-root {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

/* ── Métricas de contexto ────────────────────────────────────────────────── */
.npe-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-4);
}

/* ── Banner de aviso ─────────────────────────────────────────────────────── */
.npe-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-warn) / 0.5);
  background: rgb(var(--ui-warn) / 0.10);
}
.npe-banner-icon {
  font-size: var(--ui-text-xl);
  line-height: var(--ui-leading-tight, 1);
  color: rgb(var(--ui-warn));
  flex-shrink: 0;
}
.npe-banner-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* ── Bloco somente leitura (user_id) ─────────────────────────────────────── */
.npe-readonly-block {
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-muted) / 0.05);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.npe-readonly-label {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: rgb(var(--ui-muted));
}
.npe-readonly-kv {
  display: flex;
  gap: var(--ui-space-3);
  align-items: baseline;
  flex-wrap: wrap;
}
.npe-readonly-key {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.npe-readonly-val {
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-all;
}

/* ── ChannelSelector ─────────────────────────────────────────────────────── */
.npe-channel-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-3);
}
.npe-channel-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-4) var(--ui-space-3);
  border: 2px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  cursor: pointer;
  text-align: center;
  position: relative;
  transition: border-color var(--_duration) ease, background var(--_duration) ease, box-shadow var(--_duration) ease;
}
.npe-channel-card[data-selected="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.12);
}
.npe-channel-card[data-selected="true"][data-tone="success"] {
  border-color: rgb(var(--ui-success));
  background: rgb(var(--ui-success) / 0.06);
  box-shadow: 0 0 0 3px rgb(var(--ui-success) / 0.10);
}
.npe-channel-card[data-selected="true"][data-tone="running"] {
  border-color: rgb(var(--ui-info));
  background: rgb(var(--ui-info) / 0.06);
  box-shadow: 0 0 0 3px rgb(var(--ui-info) / 0.10);
}
.npe-channel-card:hover:not([data-selected="true"]) {
  border-color: rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
}
.npe-channel-card:focus-within {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.npe-channel-radio {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.npe-channel-glyph {
  font-size: var(--_glyph-size);
  line-height: var(--ui-leading-tight, 1);
  flex-shrink: 0;
}
.npe-channel-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-width: 0;
}
.npe-channel-title {
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: var(--ui-leading-snug, 1.2);
}
.npe-channel-hint {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: var(--ui-leading-snug, 1.35);
}
.npe-channel-check {
  position: absolute;
  top: var(--ui-space-2);
  right: var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  width: var(--_check-size);
  height: var(--_check-size);
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── ToggleSwitch ────────────────────────────────────────────────────────── */
.npe-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.npe-toggle-copy { min-width: 0; flex: 1 1 auto; }
.npe-toggle-title {
  margin: 0;
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.npe-toggle-desc {
  margin: var(--ui-space-1) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: var(--ui-leading-normal, 1.45);
}

/* Switch acessível (role=switch) */
.npe-switch {
  position: relative;
  flex-shrink: 0;
  width: var(--_track-w);
  height: var(--_track-h);
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  cursor: pointer;
  padding: 0;
  transition: background var(--_duration) ease, border-color var(--_duration) ease;
}
.npe-switch[data-on="true"] {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}
.npe-switch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.28);
}
.npe-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.npe-switch-knob {
  position: absolute;
  top: var(--ui-space-1);
  left: var(--ui-space-1);
  width: var(--_knob-size);
  height: var(--_knob-size);
  border-radius: 50%;
  background: rgb(var(--ui-bg));
  box-shadow: var(--ui-shadow-sm);
  transition: transform var(--_duration) ease;
}
.npe-switch[data-on="true"] .npe-switch-knob {
  transform: translateX(calc(var(--_track-w) - var(--_knob-size) - var(--ui-space-1) * 2));
}

@media (prefers-reduced-motion: reduce) {
  .npe-switch,
  .npe-switch-knob { transition: none; }
}

/* ── Ações do formulário ─────────────────────────────────────────────────── */
.npe-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.npe-form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding-top: var(--ui-space-3);
  border-top: 1px solid rgb(var(--ui-border));
}
.npe-no-changes {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.npe-form-btns {
  display: flex;
  gap: var(--ui-space-2);
  margin-left: auto;
}

/* ── Card de detalhes (KV) ───────────────────────────────────────────────── */
.npe-kv {
  display: grid;
  gap: var(--ui-space-3);
  margin: 0;
}
.npe-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.npe-kv dd {
  margin: var(--ui-space-1) 0 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  line-height: var(--ui-leading-snug, 1.4);
}
.npe-kv-mono {
  font-family: var(--ui-font-mono);
  word-break: break-all;
}

/* ── Responsivo ──────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .npe-metrics {
    grid-template-columns: 1fr;
  }
  .npe-channel-selector {
    grid-template-columns: 1fr;
  }
  .npe-toggle-row {
    flex-direction: row;
  }
}

@media (max-width: 560px) {
  .npe-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .npe-form-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .npe-form-btns {
    width: 100%;
    margin-left: 0;
  }
}
</style>
