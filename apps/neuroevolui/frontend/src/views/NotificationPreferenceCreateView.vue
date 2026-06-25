<template>
  <UiPageLayout
    eyebrow="Notificações"
    title="Nova Preferência de Notificação"
    subtitle="Cadastre um canal de notificação para receber lembretes de consultas, evoluções e avisos."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/notifications">Voltar</UiButton>
    </template>

    <!-- Banner informativo sobre canais -->
    <template #banner>
      <div class="npc-banner" role="note">
        <span class="npc-banner-icon" aria-hidden="true">◎</span>
        <p class="npc-banner-text">
          Cada preferência vincula um canal ao usuário. Você pode cadastrar mais de um canal
          (e-mail, push e WhatsApp) e ativar ou desativar individualmente.
        </p>
      </div>
    </template>

    <form class="npc-form" novalidate @submit.prevent="submit">

      <!-- SEÇÃO 1: Seleção do canal -->
      <UiCard
        title="Canal de notificação"
        subtitle="Escolha por onde deseja receber os avisos do NeuroEvolui."
      >
        <!-- Seletor de canal: radio group acessível -->
        <div
          class="npc-channels"
          role="radiogroup"
          aria-label="Canal de notificação"
          aria-required="true"
        >
          <button
            v-for="ch in channelOptions"
            :key="ch.value"
            type="button"
            class="npc-channel"
            role="radio"
            :aria-checked="f.values.channel === ch.value ? 'true' : 'false'"
            :data-active="f.values.channel === ch.value ? 'true' : 'false'"
            :data-tone="ch.tone"
            @click="selectChannel(ch.value)"
          >
            <span class="npc-channel-icon" aria-hidden="true">{{ ch.icon }}</span>
            <span class="npc-channel-body">
              <span class="npc-channel-title">{{ ch.label }}</span>
              <span class="npc-channel-sub">{{ ch.hint }}</span>
            </span>
            <span
              class="npc-channel-check"
              aria-hidden="true"
              :data-checked="f.values.channel === ch.value ? 'true' : 'false'"
            >✓</span>
          </button>
        </div>
        <p
          v-if="f.errors.channel && f.touched.channel"
          class="npc-channel-error"
          role="alert"
        >{{ f.errors.channel }}</p>
      </UiCard>

      <!-- SEÇÃO 2: Endereço de contato + ativação -->
      <UiCard
        title="Configuração do canal"
        :subtitle="contactCardSubtitle"
      >
        <UiFormSection :columns="1">

          <!-- Campo de contato: só exibido para email e whatsapp (push não usa endereço) -->
          <UiFormField
            v-if="needsContact"
            :label="contactLabel"
            :required="needsContact"
            :error="f.errors.contact_value"
            :hint="contactHint"
            full-width
          >
            <template #default="{ id, describedBy, hasError }">
              <UiInput
                :id="id"
                :type="contactInputType"
                :model-value="f.values.contact_value"
                :placeholder="contactPlaceholder"
                :described-by="describedBy"
                :error="hasError"
                :autocomplete="contactAutocomplete"
                @update:model-value="f.setField('contact_value', $event)"
                @blur="f.validateField('contact_value')"
              />
            </template>
          </UiFormField>

          <!-- Bloco informativo para push (sem campo de contato) -->
          <div v-if="isPush" class="npc-push-info" role="note">
            <span class="npc-push-icon" aria-hidden="true">⬛</span>
            <div class="npc-push-copy">
              <p class="npc-push-title">Notificação push via navegador</p>
              <p class="npc-push-desc">
                A assinatura push é feita por dispositivo diretamente no navegador.
                Cadastre esta preferência e registre o dispositivo na tela de configurações
                de notificações após salvar.
              </p>
            </div>
          </div>

          <!-- Interruptor "Ativo" -->
          <div class="npc-toggle-wrap">
            <div class="npc-toggle-copy">
              <p class="npc-toggle-title" :id="toggleLabelId">
                {{ f.values.enabled ? 'Canal ativo' : 'Canal inativo' }}
              </p>
              <p class="npc-toggle-hint">
                {{ f.values.enabled
                  ? 'Você receberá notificações por este canal imediatamente após salvar.'
                  : 'O canal será cadastrado mas não enviará notificações até ser ativado.' }}
              </p>
            </div>
            <button
              type="button"
              class="npc-switch"
              role="switch"
              :aria-checked="f.values.enabled ? 'true' : 'false'"
              :aria-labelledby="toggleLabelId"
              :data-on="f.values.enabled ? 'true' : null"
              @click="f.setField('enabled', !f.values.enabled)"
            >
              <span class="npc-switch-knob" aria-hidden="true" />
            </button>
          </div>

        </UiFormSection>
      </UiCard>

      <!-- SEÇÃO 3: Resumo antes de salvar -->
      <UiCard
        v-if="hasSummary"
        title="Resumo da preferência"
        subtitle="Confirme os dados antes de cadastrar."
      >
        <div class="npc-summary" aria-label="Resumo da nova preferência">
          <div class="npc-summary-row">
            <span class="npc-summary-label">Canal</span>
            <span class="npc-summary-value">{{ selectedChannelOption ? selectedChannelOption.label : '—' }}</span>
          </div>
          <div v-if="needsContact && f.values.contact_value" class="npc-summary-row">
            <span class="npc-summary-label">{{ contactLabel }}</span>
            <span class="npc-summary-value">{{ f.values.contact_value }}</span>
          </div>
          <div class="npc-summary-row">
            <span class="npc-summary-label">Estado inicial</span>
            <UiStatusBadge
              :tone="f.values.enabled ? 'success' : 'neutral'"
              :label="f.values.enabled ? 'Ativo' : 'Inativo'"
              with-dot
            />
          </div>
        </div>
      </UiCard>

      <!-- Ações do formulário -->
      <div class="npc-actions">
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
          :loading="f.submitting.value"
          :disabled="f.submitting.value"
        >
          Cadastrar preferência
        </UiButton>
      </div>

    </form>
  </UiPageLayout>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiButton,
  UiStatusBadge,
  useForm,
  useToast,
  validators,
} from '../ui/index.js';
import { notificationPreferences } from '../api.js';

const router = useRouter();
const toast = useToast();

// ID estável para aria-labelledby do switch
const toggleLabelId = 'npc-toggle-label';

// Opções de canal disponíveis (enum do backend: email | push | whatsapp)
const channelOptions = [
  {
    value: 'email',
    label: 'E-mail',
    hint: 'Resumos e confirmações na sua caixa de entrada.',
    icon: '✉',
    tone: 'info',
    contactLabel: 'Endereço de e-mail',
    contactHint: 'Use o e-mail que você consulta regularmente.',
    placeholder: 'voce@clinica.com.br',
    inputType: 'email',
    autocomplete: 'email',
  },
  {
    value: 'push',
    label: 'Push (navegador)',
    hint: 'Avisos instantâneos mesmo com a aba fechada.',
    icon: '◉',
    tone: 'accent',
    contactLabel: null,
    contactHint: null,
    placeholder: '',
    inputType: 'text',
    autocomplete: undefined,
  },
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    hint: 'Mensagens diretas no seu telefone.',
    icon: '◈',
    tone: 'success',
    contactLabel: 'Telefone (com DDD)',
    contactHint: 'Número no formato internacional, ex.: +55 11 99999-0000.',
    placeholder: '+55 11 99999-0000',
    inputType: 'tel',
    autocomplete: 'tel',
  },
];

// Regra condicional para contact_value: obrigatório quando canal exige contato (não push)
const contactRequiredRule = (v, all) => {
  if (!all || all.channel === 'push') return '';
  return validators.required('Informe o endereço de contato para ativar este canal.')(v);
};

// Regra de formato por canal
const contactFormatRule = (v, all) => {
  if (!v || !all) return '';
  if (all.channel === 'email') {
    return validators.email('E-mail inválido. Verifique o endereço.')(v);
  }
  if (all.channel === 'whatsapp') {
    return validators.pattern(
      /^\+?[0-9\s()[\]-]{7,20}$/,
      'Telefone inválido. Use DDI/DDD, ex.: +55 11 99999-0000.',
    )(v);
  }
  return '';
};

const f = useForm({
  initial: {
    channel: 'email',
    contact_value: '',
    enabled: true,
  },
  rules: {
    channel: [validators.required('Selecione um canal de notificação.')],
    contact_value: [contactRequiredRule, contactFormatRule],
  },
});

// ── Derivados ────────────────────────────────────────────────────────────────

const selectedChannelOption = computed(
  () => channelOptions.find((c) => c.value === f.values.channel) || null,
);

const isPush = computed(() => f.values.channel === 'push');
const needsContact = computed(() => !!f.values.channel && f.values.channel !== 'push');

const contactLabel = computed(() =>
  selectedChannelOption.value ? (selectedChannelOption.value.contactLabel || 'Contato') : 'Contato',
);
const contactHint = computed(() =>
  selectedChannelOption.value ? selectedChannelOption.value.contactHint || '' : '',
);
const contactPlaceholder = computed(() =>
  selectedChannelOption.value ? selectedChannelOption.value.placeholder : '',
);
const contactInputType = computed(() =>
  selectedChannelOption.value ? selectedChannelOption.value.inputType : 'text',
);
const contactAutocomplete = computed(() =>
  selectedChannelOption.value ? selectedChannelOption.value.autocomplete : undefined,
);

const contactCardSubtitle = computed(() => {
  if (isPush.value) return 'O push não exige endereço de contato. Defina se este canal começa ativo.';
  return 'Informe o endereço onde as notificações serão entregues e defina o estado inicial.';
});

// Mostra o resumo quando o usuário já escolheu o canal e, se não for push, preencheu o contato.
const hasSummary = computed(() => {
  if (!f.values.channel) return false;
  if (needsContact.value) return (f.values.contact_value || '').trim().length > 0;
  return true; // push não precisa de contato
});

// ── Handlers ─────────────────────────────────────────────────────────────────

function selectChannel(value) {
  if (f.values.channel === value) return;
  f.setField('channel', value);
  // Limpa o contato ao trocar de canal para evitar valor órfão com formato errado.
  f.setField('contact_value', '');
  if (f.errors.contact_value) delete f.errors.contact_value;
}

function cancel() {
  router.push('/notifications');
}

// ── Submit ───────────────────────────────────────────────────────────────────
async function submit() {
  await f.handleSubmit(async (vals) => {
    const body = {
      channel: vals.channel,
      enabled: !!vals.enabled,
    };
    // contact_value só vai no payload quando o canal exige contato e há valor preenchido
    if (vals.channel !== 'push') {
      body.contact_value = (vals.contact_value || '').trim();
    }

    try {
      await notificationPreferences.create(body);
      toast.success('Preferência de notificação cadastrada com sucesso.');
      router.push('/notifications');
    } catch (e) {
      toast.error(
        e && e.message ? e.message : 'Não foi possível cadastrar a preferência.',
        { code: e && e.status },
      );
    }
  });
}
</script>

<style scoped>
/* Layout do formulário */
.npc-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* Banner informativo */
.npc-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.06);
}
.npc-banner-icon {
  font-size: 1.1rem;
  line-height: 1.45;
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
}
.npc-banner-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.5;
}

/* Seletor de canal */
.npc-channels {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-3);
}
.npc-channel {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border: 1.5px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  cursor: pointer;
  text-align: left;
  position: relative;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  width: 100%;
}
.npc-channel:hover {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.04);
}
.npc-channel:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.22);
}
.npc-channel[data-active='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: inset 0 0 0 1px rgb(var(--ui-accent) / 0.35);
}
.npc-channel-icon {
  font-size: 1.5rem;
  line-height: 1;
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
  margin-top: 1px;
}
.npc-channel-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}
.npc-channel-title {
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
}
.npc-channel-sub {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.4;
}
.npc-channel-check {
  position: absolute;
  top: var(--ui-space-2);
  right: var(--ui-space-2);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 0.65rem;
  font-weight: 800;
  color: rgb(var(--ui-bg));
  background: rgb(var(--ui-border-strong));
  transition: background 0.15s ease, opacity 0.15s ease;
  opacity: 0;
}
.npc-channel-check[data-checked='true'] {
  background: rgb(var(--ui-accent));
  opacity: 1;
}

/* Erro do seletor de canal */
.npc-channel-error {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-danger));
}

/* Bloco informativo push */
.npc-push-info {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.npc-push-icon {
  font-size: 1.2rem;
  line-height: 1.4;
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
}
.npc-push-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.npc-push-title {
  margin: 0;
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.npc-push-desc {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.5;
}

/* Toggle ativo/inativo */
.npc-toggle-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
}
.npc-toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.npc-toggle-title {
  margin: 0;
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.npc-toggle-hint {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.4;
}

/* Switch acessível */
.npc-switch {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 28px;
  border-radius: var(--ui-radius-pill);
  border: 1.5px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.npc-switch[data-on='true'] {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}
.npc-switch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.25);
}
.npc-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.npc-switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgb(var(--ui-bg));
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.15s ease;
}
.npc-switch[data-on='true'] .npc-switch-knob {
  transform: translateX(20px);
}

/* Resumo da preferência */
.npc-summary {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.npc-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.npc-summary-row:last-child {
  border-bottom: none;
}
.npc-summary-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-weight: 500;
}
.npc-summary-value {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}

/* Ações */
.npc-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

/* Responsivo */
@media (max-width: 860px) {
  .npc-channels {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 480px) {
  .npc-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}

@media (prefers-reduced-motion: reduce) {
  .npc-switch,
  .npc-switch-knob,
  .npc-channel,
  .npc-channel-check {
    transition: none;
  }
}
</style>
