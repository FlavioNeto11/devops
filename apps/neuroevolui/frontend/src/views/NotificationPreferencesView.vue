<template>
  <UiPageLayout
    eyebrow="Configurações"
    title="Notificações"
    subtitle="Escolha como o NeuroEvolui fala com você: e-mail, push no navegador e WhatsApp."
    width="default"
    :loading="loading"
    loading-message="Carregando suas preferências…"
    :error="loadError"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="ghost" to="/consultations">Voltar à agenda</UiButton>
      <UiButton
        variant="subtle"
        :loading="savingAll"
        :disabled="loading || savingAll"
        @click="saveAll"
      >Salvar tudo</UiButton>
    </template>

    <!-- Banner de degradação graciosa por ambiente -->
    <template #banner>
      <div v-if="banner" class="np-banner" :data-tone="banner.tone" role="status">
        <span class="np-banner-icon" aria-hidden="true">{{ banner.icon }}</span>
        <p class="np-banner-text">{{ banner.text }}</p>
      </div>
    </template>

    <!-- Resumo dos canais -->
    <section class="np-metrics" aria-label="Resumo dos canais">
      <UiMetricCard
        label="Canais ativos"
        :value="activeCount + ' de 3'"
        :tone="activeCount > 0 ? 'success' : 'neutral'"
        :hint="activeCount > 0 ? 'Você será avisado por estes canais' : 'Nenhum canal ativo no momento'"
      />
      <UiMetricCard
        label="Push neste dispositivo"
        :value="pushStateLabel"
        :tone="pushTone"
        :hint="pushSupported ? 'Assinatura por dispositivo (VAPID)' : 'Não suportado neste navegador'"
      />
      <UiMetricCard
        label="Contatos informados"
        :value="contactsFilled + ' de 2'"
        :tone="contactsFilled === 2 ? 'success' : contactsFilled === 0 ? 'warning' : 'neutral'"
        hint="E-mail e telefone para WhatsApp"
      />
    </section>

    <!-- Estado vazio: nenhuma preferência ainda (primeiro acesso) -->
    <UiCard
      v-if="!loading && !loadError && !hasAnyPreference"
      title="Tudo começa aqui"
    >
      <UiEmptyState
        icon="bell"
        title="Você ainda não configurou nenhum canal"
        description="Ative pelo menos um canal abaixo para receber lembretes de consultas, novas evoluções e avisos de cobrança."
      >
        <template #action>
          <UiButton variant="primary" @click="enableEmailQuick">Começar pelo e-mail</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- Canais -->
    <div v-if="!loading && !loadError" class="np-channels">
      <UiCard
        v-for="ch in channels"
        :key="ch.key"
        :title="ch.title"
        :subtitle="ch.subtitle"
      >
        <template #actions>
          <UiStatusBadge
            :tone="channelTone(ch)"
            :label="channelStatusLabel(ch)"
            size="md"
          />
        </template>

        <UiFormSection :columns="1">
          <!-- Linha do interruptor -->
          <div class="np-toggle-row">
            <div class="np-toggle-copy">
              <p class="np-toggle-title">{{ channelEnabled(ch) ? 'Ativado' : 'Desativado' }}</p>
              <p class="np-toggle-hint">{{ ch.toggleHint }}</p>
            </div>
            <button
              type="button"
              class="np-switch"
              role="switch"
              :aria-checked="channelEnabled(ch) ? 'true' : 'false'"
              :aria-label="'Ativar canal ' + ch.title"
              :data-on="channelEnabled(ch) ? 'true' : null"
              :data-busy="channelBusy(ch) ? 'true' : null"
              :disabled="channelBusy(ch) || (ch.key === 'push' && !pushSupported)"
              @click="onToggle(ch)"
            >
              <span class="np-switch-knob" aria-hidden="true" />
            </button>
          </div>

          <!-- Campo de contato (e-mail / whatsapp) — validação via useForm -->
          <UiFormField
            v-if="ch.key !== 'push'"
            :label="ch.contactLabel"
            :hint="ch.contactHint"
            :error="formFor(ch).errors.contact_value"
          >
            <template #default="{ id, describedBy, hasError }">
              <UiInput
                :id="id"
                :type="ch.inputType"
                :model-value="formFor(ch).values.contact_value"
                :placeholder="ch.placeholder"
                :described-by="describedBy"
                :error="hasError"
                :autocomplete="ch.autocomplete"
                @update:model-value="formFor(ch).setField('contact_value', $event)"
                @blur="formFor(ch).validateField('contact_value')"
              />
            </template>
          </UiFormField>

          <!-- Push: bloco de assinatura por dispositivo -->
          <div v-else class="np-push">
            <p v-if="!pushSupported" class="np-push-note" data-tone="warn">
              Este navegador não suporta notificações push. Você ainda pode usar e-mail e WhatsApp.
            </p>
            <template v-else>
              <p class="np-push-note" :data-tone="pushSubscribed ? 'ok' : 'muted'">
                {{ pushSubscribed
                  ? 'Este dispositivo está inscrito para receber push.'
                  : 'Registre este dispositivo para receber push. A inscrição vale apenas neste navegador.' }}
              </p>
              <div class="np-push-actions">
                <UiButton
                  v-if="!pushSubscribed"
                  variant="primary"
                  size="sm"
                  :loading="push.busy"
                  :disabled="push.busy"
                  @click="subscribePush()"
                >Registrar este dispositivo</UiButton>
                <UiButton
                  v-else
                  variant="danger"
                  size="sm"
                  :loading="push.busy"
                  :disabled="push.busy"
                  @click="unsubscribePush()"
                >Remover este dispositivo</UiButton>
              </div>
            </template>
          </div>
        </UiFormSection>

        <template #footer>
          <div class="np-card-foot">
            <span class="np-card-foot-hint">{{ ch.footerHint }}</span>
            <UiButton
              v-if="ch.key !== 'push'"
              variant="subtle"
              size="sm"
              :loading="formFor(ch).submitting.value"
              :disabled="formFor(ch).submitting.value"
              @click="saveChannel(ch)"
            >Salvar canal</UiButton>
          </div>
        </template>
      </UiCard>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
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
  useToast,
  useConfirm,
  useForm,
  validators,
} from '../ui/index.js';
import { notificationPrefs } from '../api.js';

const toast = useToast();
const confirm = useConfirm();

const loading = ref(true);
const loadError = ref(null);
const savingAll = ref(false);

// VAPID + estado do push neste dispositivo
const pushSupported = ref(false);
const pushSubscribed = ref(false);
const vapidKey = ref('');

// Metadados estáticos de cada canal (cópia de tela). O ESTADO EDITÁVEL (enabled/contact_value)
// dos canais de contato vive no respectivo useForm; o canal push usa `push` (sem formulário).
const channels = [
  {
    key: 'email',
    title: 'E-mail',
    subtitle: 'Resumos e confirmações na sua caixa de entrada.',
    contactLabel: 'Endereço de e-mail',
    contactHint: 'Para onde enviamos consultas agendadas, evoluções e avisos.',
    placeholder: 'voce@clinica.com.br',
    inputType: 'email',
    autocomplete: 'email',
    toggleHint: 'Receber notificações por e-mail.',
    footerHint: 'Sem credencial de e-mail no servidor, este canal é ignorado silenciosamente.',
  },
  {
    key: 'push',
    title: 'Push (navegador)',
    subtitle: 'Avisos instantâneos mesmo com a aba fechada.',
    toggleHint: 'Ativar o recebimento de push neste navegador.',
    footerHint: 'A inscrição é por dispositivo. Remova ao trocar de computador.',
  },
  {
    key: 'whatsapp',
    title: 'WhatsApp',
    subtitle: 'Mensagens diretas no número do paciente ou responsável.',
    contactLabel: 'Telefone (com DDD)',
    contactHint: 'Número no formato internacional, ex.: +55 11 99999-0000.',
    placeholder: '+55 11 99999-0000',
    inputType: 'tel',
    autocomplete: 'tel',
    toggleHint: 'Receber notificações por WhatsApp.',
    footerHint: 'Sem provedor de WhatsApp configurado, este canal é ignorado silenciosamente.',
  },
];

// ── Formulários por canal de contato (validação via useForm do kit) ──────────
// Cada form guarda { contact_value, enabled }. A regra cross-field 'ativo exige contato'
// lê `all.enabled` (a régua SICAT/GymOps: toda validação de input passa pelo useForm).
const emailForm = useForm({
  initial: { contact_value: '', enabled: false },
  rules: {
    contact_value: [
      (v, all) => (all.enabled ? validators.required('Informe um e-mail para ativar este canal.')(v) : ''),
      validators.email('E-mail inválido. Verifique o endereço.'),
    ],
  },
});
const whatsappForm = useForm({
  initial: { contact_value: '', enabled: false },
  rules: {
    contact_value: [
      (v, all) => (all.enabled ? validators.required('Informe um telefone para ativar este canal.')(v) : ''),
      validators.pattern(/^\+?[0-9\s()-]{8,20}$/, 'Telefone inválido. Use DDI/DDD, ex.: +55 11 99999-0000.'),
    ],
  },
});
// Estado do canal push (sem contato → sem useForm; só anti-duplo-clique).
const push = reactive({ enabled: false, busy: false });

const formFor = (ch) => (ch.key === 'email' ? emailForm : whatsappForm);

// Lê o estado "ativado" de qualquer canal (form para contato, `push` para push).
function channelEnabled(ch) {
  if (ch.key === 'push') return push.enabled;
  return formFor(ch).values.enabled;
}
function channelBusy(ch) {
  if (ch.key === 'push') return push.busy;
  return formFor(ch).submitting.value;
}
function contactValue(ch) {
  return ((formFor(ch).values.contact_value || '') + '').trim();
}

// ── Métricas derivadas ──────────────────────────────────────────────────────
const activeCount = computed(
  () => (emailForm.values.enabled ? 1 : 0) + (push.enabled ? 1 : 0) + (whatsappForm.values.enabled ? 1 : 0),
);
const contactsFilled = computed(
  () =>
    ((emailForm.values.contact_value || '').trim() ? 1 : 0) +
    ((whatsappForm.values.contact_value || '').trim() ? 1 : 0),
);
const hasAnyPreference = computed(
  () =>
    emailForm.values.enabled ||
    push.enabled ||
    whatsappForm.values.enabled ||
    (emailForm.values.contact_value || '').trim() ||
    (whatsappForm.values.contact_value || '').trim(),
);
const pushStateLabel = computed(() => {
  if (!pushSupported.value) return 'Indisponível';
  return pushSubscribed.value ? 'Inscrito' : 'Não inscrito';
});
const pushTone = computed(() => {
  if (!pushSupported.value) return 'neutral';
  return pushSubscribed.value ? 'success' : 'warning';
});
const banner = computed(() => {
  if (loading.value || loadError.value) return null;
  if (!pushSupported.value) {
    return {
      tone: 'warn',
      icon: '◔',
      text: 'Push não é suportado neste navegador — os demais canais continuam funcionando normalmente.',
    };
  }
  if (activeCount.value === 0) {
    return {
      tone: 'info',
      icon: '◌',
      text: 'Nenhum canal ativo: você não receberá lembretes nem avisos até ativar pelo menos um.',
    };
  }
  return null;
});

// ── Badges por canal ────────────────────────────────────────────────────────
function channelTone(ch) {
  if (ch.key === 'push' && !pushSupported.value) return 'neutral';
  return channelEnabled(ch) ? 'success' : 'neutral';
}
function channelStatusLabel(ch) {
  if (ch.key === 'push') {
    if (!pushSupported.value) return 'Indisponível';
    if (push.enabled && pushSubscribed.value) return 'Ativo neste dispositivo';
    if (push.enabled) return 'Ativo — registre o dispositivo';
    return 'Desativado';
  }
  const enabled = channelEnabled(ch);
  if (enabled && !contactValue(ch)) return 'Ativo — sem contato';
  return enabled ? 'Ativo' : 'Desativado';
}

// ── Carga inicial ───────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    // VAPID (independente das preferências). Falha não derruba a tela.
    try {
      vapidKey.value = await notificationPrefs.vapidKey();
    } catch {
      vapidKey.value = '';
    }

    // Suporte do navegador + estado da inscrição local
    await detectPushState();

    // Preferências persistidas do usuário (shape {data:[...]})
    const res = await notificationPrefs.list();
    const prefs = (res && res.data) || [];
    const byKey = (k) => prefs.find((x) => x.channel === k);

    const e = byKey('email');
    emailForm.values.enabled = e ? e.enabled !== false : false;
    emailForm.values.contact_value = (e && e.contact_value) || '';

    const w = byKey('whatsapp');
    whatsappForm.values.enabled = w ? w.enabled !== false : false;
    whatsappForm.values.contact_value = (w && w.contact_value) || '';

    const p = byKey('push');
    push.enabled = p ? p.enabled !== false : false;
  } catch (e) {
    loadError.value = e.message || 'Não foi possível carregar suas preferências.';
  } finally {
    loading.value = false;
  }
}

async function detectPushState() {
  pushSupported.value =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  if (!pushSupported.value) {
    pushSubscribed.value = false;
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    pushSubscribed.value = !!sub;
  } catch {
    pushSubscribed.value = false;
  }
}

// ── Persistência ─────────────────────────────────────────────────────────────
async function persistContact(ch, values) {
  await notificationPrefs.put(ch.key, !!values.enabled, (values.contact_value || '').trim());
}
async function persistPush() {
  await notificationPrefs.put('push', push.enabled, '');
}

// Salva UM canal de contato. handleSubmit → valida (incl. cross-field) + anti-duplo-submit via submitting.
async function saveChannel(ch) {
  const f = formFor(ch);
  if (!f.validate()) {
    toast.warning('Confira os dados do canal ' + ch.title + '.');
    return;
  }
  await f.handleSubmit(async (values) => {
    try {
      await persistContact(ch, values);
      toast.success('Canal ' + ch.title + ' salvo.');
    } catch (e) {
      toast.error('Falha ao salvar ' + ch.title + '.', { detail: e.message, code: e.status });
    }
  });
}

async function saveAll() {
  // valida todos os canais de contato via useForm antes de persistir qualquer coisa
  const okEmail = emailForm.validate();
  const okWhats = whatsappForm.validate();
  if (!okEmail || !okWhats) {
    toast.warning('Corrija os campos destacados antes de salvar.');
    return;
  }
  savingAll.value = true;
  try {
    await persistContact(channels[0], emailForm.values); // email
    await persistContact(channels[2], whatsappForm.values); // whatsapp
    await persistPush();
    toast.success('Preferências salvas.');
  } catch (e) {
    toast.error('Não foi possível salvar todas as preferências.', { detail: e.message, code: e.status });
  } finally {
    savingAll.value = false;
  }
}

// ── Interruptor (ativar/desativar canal) ────────────────────────────────────
async function onToggle(ch) {
  if (ch.key === 'push') return onTogglePush(ch);

  const f = formFor(ch);
  const turningOff = f.values.enabled;

  // Desligar um canal ativo é destrutivo (deixa de notificar) → confirmar.
  if (turningOff) {
    const ok = await confirm({
      title: 'Desativar ' + ch.title + '?',
      message: 'Você deixará de receber notificações por ' + ch.title + '. É possível reativar quando quiser.',
      confirmLabel: 'Desativar',
      cancelLabel: 'Manter ativo',
      danger: true,
    });
    if (!ok) return;
  }

  // Ativar exige contato válido: marca enabled=true e valida UMA vez (a regra cross-field
  // lê all.enabled). Se inválido, reverte e mostra o erro no campo — sem clone+mutate+rollback.
  const next = !f.values.enabled;
  f.values.enabled = next;
  if (next && !f.validateField('contact_value')) {
    f.values.enabled = false;
    toast.warning('Informe um contato válido antes de ativar ' + ch.title + '.');
    return;
  }

  try {
    await persistContact(ch, f.values);
    toast.success(ch.title + (next ? ' ativado.' : ' desativado.'));
  } catch (e) {
    f.values.enabled = !next; // rollback otimista
    toast.error('Não foi possível atualizar ' + ch.title + '.', { detail: e.message, code: e.status });
  }
}

async function onTogglePush(ch) {
  if (!pushSupported.value) return;
  const turningOff = push.enabled;
  if (turningOff) {
    const ok = await confirm({
      title: 'Desativar ' + ch.title + '?',
      message: 'Você deixará de receber notificações por ' + ch.title + '. É possível reativar quando quiser.',
      confirmLabel: 'Desativar',
      cancelLabel: 'Manter ativo',
      danger: true,
    });
    if (!ok) return;
  }
  const next = !push.enabled;
  push.busy = true;
  try {
    push.enabled = next;
    await persistPush();
    if (next && !pushSubscribed.value) {
      await subscribePush({ silent: true });
    } else if (!next && pushSubscribed.value) {
      await removeSubscription({ silent: true });
    }
    toast.success(ch.title + (next ? ' ativado.' : ' desativado.'));
  } catch (e) {
    push.enabled = !next; // rollback otimista
    toast.error('Não foi possível atualizar ' + ch.title + '.', { detail: e.message, code: e.status });
  } finally {
    push.busy = false;
  }
}

function enableEmailQuick() {
  emailForm.values.enabled = true;
  // foco implícito: o usuário preenche e salva o canal
  toast.info('Informe seu e-mail e salve o canal.');
}

// ── Push: assinatura VAPID ──────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureServiceWorker() {
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    // SW mínimo embutido para receber push; sem arquivo externo → Blob URL.
    const swSource =
      "self.addEventListener('push',function(e){var d={};try{d=e.data?e.data.json():{}}catch(_){}" +
      "var t=d.title||'NeuroEvolui';e.waitUntil(self.registration.showNotification(t,{body:d.body||'',data:{url:d.url||'/'}}))});" +
      "self.addEventListener('notificationclick',function(e){e.notification.close();" +
      "e.waitUntil(clients.openWindow((e.notification.data&&e.notification.data.url)||'/'))});";
    const url = URL.createObjectURL(new Blob([swSource], { type: 'text/javascript' }));
    reg = await navigator.serviceWorker.register(url);
    await navigator.serviceWorker.ready;
  }
  return reg;
}

async function subscribePush(opts = {}) {
  const silent = !!opts.silent;
  if (!pushSupported.value) {
    if (!silent) toast.warning('Push não é suportado neste navegador.');
    return;
  }
  if (!vapidKey.value) {
    if (!silent) toast.error('Chave de push (VAPID) indisponível no servidor.');
    throw new Error('VAPID indisponível');
  }
  if (!silent) push.busy = true;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (!silent) toast.warning('Permissão de notificação negada pelo navegador.');
      // mantém o canal desligado quando a permissão falha
      push.enabled = false;
      await persistPush().catch(() => {});
      return;
    }
    const reg = await ensureServiceWorker();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey.value),
    });
    const json = sub.toJSON();
    await notificationPrefs.subscribe(json.endpoint, json.keys.p256dh, json.keys.auth);
    pushSubscribed.value = true;
    if (!push.enabled) {
      push.enabled = true;
      await persistPush().catch(() => {});
    }
    if (!silent) toast.success('Dispositivo registrado para push.');
  } catch (e) {
    if (!silent) toast.error('Falha ao registrar push.', { detail: e.message, code: e.status });
    if (!silent) throw e;
  } finally {
    if (!silent) push.busy = false;
  }
}

async function removeSubscription(opts = {}) {
  const silent = !!opts.silent;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await notificationPrefs.unsubscribe(endpoint).catch((e) => {
      if (!silent) throw e;
    });
  }
  pushSubscribed.value = false;
}

async function unsubscribePush() {
  const ok = await confirm({
    title: 'Remover este dispositivo?',
    message: 'Este navegador deixará de receber notificações push. Você pode registrar novamente depois.',
    confirmLabel: 'Remover',
    cancelLabel: 'Manter',
    danger: true,
  });
  if (!ok) return;
  push.busy = true;
  try {
    await removeSubscription();
    toast.success('Dispositivo removido do push.');
  } catch (e) {
    toast.error('Falha ao remover o dispositivo.', { detail: e.message, code: e.status });
  } finally {
    push.busy = false;
  }
}

onMounted(load);
</script>

<style scoped>
.np-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-4);
}

.np-channels {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}

/* Banner de degradação graciosa — tons derivados da escala canônica do kit
   (--ui-warn / --ui-accent), os mesmos tokens que UiStatusBadge usa. */
.np-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.np-banner[data-tone="warn"] {
  border-color: rgb(var(--ui-warn) / 0.5);
  background: rgb(var(--ui-warn) / 0.10);
}
.np-banner[data-tone="info"] {
  border-color: rgb(var(--ui-accent) / 0.4);
  background: rgb(var(--ui-accent) / 0.08);
}
.np-banner-icon { font-size: 1.2rem; line-height: 1; color: rgb(var(--ui-accent-strong)); }
.np-banner-text { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }

/* Linha do interruptor */
.np-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
}
.np-toggle-copy { min-width: 0; }
.np-toggle-title { margin: 0; font-weight: 600; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.np-toggle-hint { margin: 2px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* Switch acessível */
.np-switch {
  position: relative;
  flex-shrink: 0;
  width: 46px;
  height: 26px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  cursor: pointer;
  padding: 0;
  transition: background .15s ease, border-color .15s ease;
}
.np-switch[data-on="true"] {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}
.np-switch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.25);
}
.np-switch:disabled { opacity: .5; cursor: not-allowed; }
.np-switch[data-busy="true"] { cursor: progress; }
.np-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgb(var(--ui-bg));
  box-shadow: var(--ui-shadow-sm);
  transition: transform .15s ease;
}
.np-switch[data-on="true"] .np-switch-knob { transform: translateX(20px); }

@media (prefers-reduced-motion: reduce) {
  .np-switch,
  .np-switch-knob { transition: none; }
}

/* Bloco push */
.np-push { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.np-push-note { margin: 0; font-size: var(--ui-text-sm); }
.np-push-note[data-tone="ok"] { color: rgb(var(--ui-ok)); }
.np-push-note[data-tone="warn"] { color: rgb(var(--ui-warn)); }
.np-push-note[data-tone="muted"] { color: rgb(var(--ui-muted)); }
.np-push-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* Rodapé do card */
.np-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.np-card-foot-hint { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

@media (max-width: 860px) {
  .np-metrics { grid-template-columns: 1fr; }
  .np-channels { grid-template-columns: 1fr; }
}
</style>
