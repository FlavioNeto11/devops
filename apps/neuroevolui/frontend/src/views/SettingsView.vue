<!--
  SettingsView — Configurações da Clínica (REF-NEUROEVOLUI-0050)
  Seções: dados da clínica, notificações, integrações, preferências gerais.

  Endpoints:
    GET    /v1/settings            → { clinic_name, clinic_address, clinic_phone,
                                       clinic_email, timezone, locale, notification_defaults }
    PUT    /v1/settings            { ...campos } → configurações salvas
    DELETE /v1/settings/overrides  → restaura padrões do tenant

  Estados: loading (skeleton), error (banner), normal.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui"
    title="Configurações da Clínica"
    subtitle="Gerencie informações, notificações, integrações e preferências da clínica."
    width="default"
    :loading="loading"
    loading-message="Carregando configurações…"
    :error="loadError"
    @retry="loadSettings"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="resetting" :disabled="resetting || saving || loading" @click="onRestore">
        Restaurar Padrões
      </UiButton>
      <UiButton variant="primary" :loading="saving" :disabled="saving || loading" @click="onSave">
        Salvar
      </UiButton>
    </template>

    <!-- Banner de erro ao salvar -->
    <div v-if="saveError" class="st-banner st-banner-error" role="alert">
      <span class="st-banner-icon" aria-hidden="true">◎</span>
      <p class="st-banner-text">{{ saveError }}</p>
      <button type="button" class="st-banner-close" aria-label="Fechar aviso" @click="saveError = null">✕</button>
    </div>

    <div class="st-layout">
      <!-- ── Sidebar de seções ────────────────────────────────────────────────── -->
      <nav class="st-sidebar" aria-label="Seções de configuração">
        <button
          v-for="sec in sections"
          :key="sec.key"
          type="button"
          class="st-nav-item"
          :data-active="activeSection === sec.key ? 'true' : null"
          :aria-current="activeSection === sec.key ? 'page' : null"
          @click="activeSection = sec.key"
        >
          <span class="st-nav-icon" aria-hidden="true">{{ sec.icon }}</span>
          <span class="st-nav-label">{{ sec.label }}</span>
        </button>
      </nav>

      <!-- ── Painel principal ────────────────────────────────────────────────── -->
      <div class="st-panel">

        <!-- ══════════════════ SEÇÃO: Dados da Clínica ══════════════════════════ -->
        <section v-if="activeSection === 'clinic'" aria-labelledby="sec-clinic">
          <h2 id="sec-clinic" class="st-section-title">Dados da Clínica</h2>

          <UiCard
            title="Dados da Clínica"
            subtitle="Nome, endereço, telefone e e-mail de contato da clínica."
          >
            <div v-if="loading" class="st-sk-block" aria-busy="true" aria-label="Carregando campos">
              <div class="st-sk-line st-sk-w60" />
              <div class="st-sk-line st-sk-w40" />
              <div class="st-sk-line st-sk-w80" />
              <div class="st-sk-line st-sk-w50" />
            </div>

            <UiFormSection v-else :columns="1">
              <UiFormField
                label="Nome da clínica"
                hint="Nome exibido nos documentos e comunicações."
                :error="form.errors.clinic_name"
              >
                <template #default="{ id, describedBy, hasError }">
                  <UiInput
                    :id="id"
                    type="text"
                    :model-value="form.values.clinic_name"
                    :described-by="describedBy"
                    :error="hasError"
                    placeholder="Ex.: NeuroEvolui Clínica"
                    autocomplete="organization"
                    @update:model-value="form.setField('clinic_name', $event)"
                    @blur="form.validateField('clinic_name')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Endereço"
                hint="Endereço completo da clínica."
                :error="form.errors.clinic_address"
              >
                <template #default="{ id, describedBy, hasError }">
                  <UiInput
                    :id="id"
                    type="text"
                    :model-value="form.values.clinic_address"
                    :described-by="describedBy"
                    :error="hasError"
                    placeholder="Ex.: Rua das Flores, 100 — São Paulo, SP"
                    autocomplete="street-address"
                    @update:model-value="form.setField('clinic_address', $event)"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Telefone"
                hint="Telefone de contato da clínica (com DDI e DDD)."
                :error="form.errors.clinic_phone"
              >
                <template #default="{ id, describedBy, hasError }">
                  <UiInput
                    :id="id"
                    type="tel"
                    :model-value="form.values.clinic_phone"
                    :described-by="describedBy"
                    :error="hasError"
                    placeholder="+55 11 99999-0000"
                    autocomplete="tel"
                    @update:model-value="form.setField('clinic_phone', $event)"
                    @blur="form.validateField('clinic_phone')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="E-mail da clínica"
                hint="E-mail principal usado em confirmações e comunicações."
                :error="form.errors.clinic_email"
              >
                <template #default="{ id, describedBy, hasError }">
                  <UiInput
                    :id="id"
                    type="email"
                    :model-value="form.values.clinic_email"
                    :described-by="describedBy"
                    :error="hasError"
                    placeholder="contato@clinica.com.br"
                    autocomplete="email"
                    @update:model-value="form.setField('clinic_email', $event)"
                    @blur="form.validateField('clinic_email')"
                  />
                </template>
              </UiFormField>
            </UiFormSection>
          </UiCard>
        </section>

        <!-- ══════════════════ SEÇÃO: Notificações ══════════════════════════════ -->
        <section v-if="activeSection === 'notifications'" aria-labelledby="sec-notifications">
          <h2 id="sec-notifications" class="st-section-title">Notificações</h2>

          <UiCard
            title="Padrões de Canal"
            subtitle="Canais habilitados por padrão ao configurar novas preferências de notificação."
          >
            <div v-if="loading" class="st-sk-block" aria-busy="true">
              <div class="st-sk-line st-sk-w50" />
              <div class="st-sk-line st-sk-w70" />
              <div class="st-sk-line st-sk-w60" />
            </div>

            <UiFormSection v-else :columns="1">
              <div
                v-for="ch in notifChannels"
                :key="ch.key"
                class="st-toggle-row"
              >
                <div class="st-toggle-copy">
                  <p class="st-toggle-title">{{ ch.label }}</p>
                  <p class="st-toggle-hint">{{ ch.hint }}</p>
                </div>
                <button
                  type="button"
                  class="st-switch"
                  role="switch"
                  :aria-checked="notifDefaults[ch.key] ? 'true' : 'false'"
                  :data-on="notifDefaults[ch.key] ? 'true' : null"
                  :aria-label="'Ativar ' + ch.label + ' por padrão'"
                  @click="notifDefaults[ch.key] = !notifDefaults[ch.key]"
                >
                  <span class="st-switch-knob" aria-hidden="true" />
                </button>
              </div>
            </UiFormSection>

            <template #footer>
              <div class="st-card-foot">
                <span class="st-foot-hint">
                  Padrões aplicados a novos usuários. Para preferências individuais, acesse a tela dedicada.
                </span>
                <UiButton variant="ghost" size="sm" to="/notification-preferences">
                  Preferências de Notificação
                </UiButton>
              </div>
            </template>
          </UiCard>
        </section>

        <!-- ══════════════════ SEÇÃO: Integrações ══════════════════════════════ -->
        <section v-if="activeSection === 'integrations'" aria-labelledby="sec-integrations">
          <h2 id="sec-integrations" class="st-section-title">Integrações</h2>

          <UiCard
            title="Integrações Externas"
            subtitle="Webhooks e conexões com sistemas externos."
          >
            <UiEmptyState
              icon="◈"
              title="Integrações em breve"
              description="Configure webhooks, integrações com prontuários externos e outros sistemas. Esta seção estará disponível em uma próxima versão."
            />
          </UiCard>
        </section>

        <!-- ══════════════════ SEÇÃO: Preferências Gerais ══════════════════════ -->
        <section v-if="activeSection === 'general'" aria-labelledby="sec-general">
          <h2 id="sec-general" class="st-section-title">Preferências Gerais</h2>

          <UiCard
            title="Localização"
            subtitle="Fuso horário e idioma padrão da clínica."
          >
            <div v-if="loading" class="st-sk-block" aria-busy="true">
              <div class="st-sk-line st-sk-w40" />
              <div class="st-sk-line st-sk-w60" />
            </div>

            <UiFormSection v-else :columns="2">
              <UiFormField label="Fuso horário" :error="form.errors.timezone">
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    class="st-select"
                    :aria-describedby="describedBy"
                    :value="form.values.timezone"
                    @change="form.setField('timezone', $event.target.value)"
                  >
                    <option v-for="tz in timezones" :key="tz.value" :value="tz.value">
                      {{ tz.label }}
                    </option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField label="Idioma" :error="form.errors.locale">
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    class="st-select"
                    :aria-describedby="describedBy"
                    :value="form.values.locale"
                    @change="form.setField('locale', $event.target.value)"
                  >
                    <option v-for="loc in locales" :key="loc.value" :value="loc.value">
                      {{ loc.label }}
                    </option>
                  </select>
                </template>
              </UiFormField>
            </UiFormSection>
          </UiCard>

          <UiCard
            title="Aparência"
            subtitle="Tema da interface. Preferência salva localmente no navegador."
          >
            <UiFormSection :columns="1">
              <div class="st-toggle-row st-theme-row">
                <div class="st-toggle-copy">
                  <p class="st-toggle-title">{{ isDarkMode ? 'Tema escuro' : 'Tema claro' }}</p>
                  <p class="st-toggle-hint">
                    {{ isDarkMode
                      ? 'Fundo escuro, ideal para ambientes com pouca luz.'
                      : 'Fundo claro, ideal para ambientes bem iluminados.' }}
                  </p>
                </div>
                <button
                  type="button"
                  class="st-switch st-theme-switch"
                  role="switch"
                  :aria-checked="isDarkMode ? 'true' : 'false'"
                  :data-on="isDarkMode ? 'true' : null"
                  aria-label="Ativar tema escuro"
                  @click="toggleTheme"
                >
                  <span class="st-switch-knob" aria-hidden="true" />
                </button>
              </div>
            </UiFormSection>

            <template #footer>
              <div class="st-card-foot">
                <span class="st-foot-hint">
                  O tema é armazenado no navegador e não sincronizado com a conta.
                </span>
              </div>
            </template>
          </UiCard>
        </section>

      </div><!-- /st-panel -->
    </div><!-- /st-layout -->
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiButton,
  UiEmptyState,
  UiInput,
  useToast,
  useConfirm,
  useForm,
  validators,
} from '../ui/index.js';
import { clinicSettings } from '../api.js';

const toast = useToast();
const confirm = useConfirm();

// ── Estado de carregamento ─────────────────────────────────────────────────────
const loading = ref(true);
const loadError = ref(null);
const saving = ref(false);
const resetting = ref(false);
const saveError = ref(null);

// ── Seção ativa ───────────────────────────────────────────────────────────────
const activeSection = ref('clinic');

// ── Tema (localStorage — não vai para o servidor) ─────────────────────────────
const isDarkMode = ref(false);

// ── Formulário principal (campos do /v1/settings) ─────────────────────────────
const form = useForm({
  initial: {
    clinic_name: '',
    clinic_address: '',
    clinic_phone: '',
    clinic_email: '',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
  },
  rules: {
    clinic_email: [validators.email('E-mail inválido. Verifique o endereço.')],
    clinic_phone: [
      validators.pattern(/^(\+?[0-9\s()\-]{0,20})?$/, 'Telefone inválido. Use DDI/DDD, ex.: +55 11 99999-0000.'),
    ],
  },
});

// ── Padrões de notificação (notification_defaults) ────────────────────────────
const notifDefaults = reactive({ email: true, push: true, whatsapp: false });

// ── Metadados ─────────────────────────────────────────────────────────────────
const sections = [
  { key: 'clinic', label: 'Clínica', icon: '◈' },
  { key: 'notifications', label: 'Notificações', icon: '◉' },
  { key: 'integrations', label: 'Integrações', icon: '◌' },
  { key: 'general', label: 'Preferências', icon: '◐' },
];

const notifChannels = [
  { key: 'email', label: 'E-mail', hint: 'Enviar notificações por e-mail por padrão.' },
  { key: 'push', label: 'Push (navegador)', hint: 'Enviar notificações push por padrão.' },
  { key: 'whatsapp', label: 'WhatsApp', hint: 'Enviar notificações via WhatsApp por padrão.' },
];

const timezones = [
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC-3)' },
  { value: 'America/Manaus', label: 'Manaus (UTC-4)' },
  { value: 'America/Belem', label: 'Belém (UTC-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (UTC-3)' },
  { value: 'America/Recife', label: 'Recife (UTC-3)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (UTC-4)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (UTC-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (UTC-5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC-2)' },
  { value: 'UTC', label: 'UTC' },
];

const locales = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'es-ES', label: 'Español' },
];

// ── Carregar configurações ────────────────────────────────────────────────────
async function loadSettings() {
  loading.value = true;
  loadError.value = null;
  try {
    const data = await clinicSettings.get();
    form.values.clinic_name = data.clinic_name || '';
    form.values.clinic_address = data.clinic_address || '';
    form.values.clinic_phone = data.clinic_phone || '';
    form.values.clinic_email = data.clinic_email || '';
    form.values.timezone = data.timezone || 'America/Sao_Paulo';
    form.values.locale = data.locale || 'pt-BR';
    const nd = data.notification_defaults || {};
    notifDefaults.email = nd.email !== false;
    notifDefaults.push = nd.push !== false;
    notifDefaults.whatsapp = !!nd.whatsapp;
  } catch (e) {
    loadError.value = e.message || 'Não foi possível carregar as configurações da clínica.';
  } finally {
    loading.value = false;
  }
}

// ── Salvar ────────────────────────────────────────────────────────────────────
async function onSave() {
  saveError.value = null;
  if (!form.validate()) {
    toast.warning('Corrija os campos destacados antes de salvar.');
    return;
  }
  await form.handleSubmit(async (values) => {
    saving.value = true;
    try {
      await clinicSettings.put({
        ...values,
        notification_defaults: { ...notifDefaults },
      });
      toast.success('Configurações salvas com sucesso.');
    } catch (e) {
      saveError.value = e.message || 'Não foi possível salvar as configurações.';
      toast.error('Falha ao salvar configurações.', { detail: e.message, code: e.status });
    } finally {
      saving.value = false;
    }
  });
}

// ── Restaurar padrões ─────────────────────────────────────────────────────────
async function onRestore() {
  const ok = await confirm({
    title: 'Restaurar padrões?',
    message:
      'Todas as configurações da clínica serão restauradas para os valores padrão. ' +
      'Esta ação não pode ser desfeita.',
    confirmLabel: 'Restaurar',
    cancelLabel: 'Cancelar',
    danger: true,
  });
  if (!ok) return;
  resetting.value = true;
  saveError.value = null;
  try {
    await clinicSettings.deleteOverrides();
    toast.success('Configurações restauradas para os valores padrão.');
    await loadSettings();
  } catch (e) {
    saveError.value = e.message || 'Não foi possível restaurar as configurações.';
    toast.error('Falha ao restaurar configurações.', { detail: e.message, code: e.status });
  } finally {
    resetting.value = false;
  }
}

// ── Tema ──────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('neuroevolui-theme') : null;
  const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  isDarkMode.value = saved ? saved === 'dark' : prefersDark;
  applyTheme();
}

function applyTheme() {
  if (typeof document === 'undefined') return;
  if (isDarkMode.value) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  isDarkMode.value = !isDarkMode.value;
  applyTheme();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('neuroevolui-theme', isDarkMode.value ? 'dark' : 'light');
  }
  toast.success('Tema ' + (isDarkMode.value ? 'escuro' : 'claro') + ' ativado.');
}

onMounted(async () => {
  initTheme();
  await loadSettings();
});
</script>

<style scoped>
/* ── Layout ───────────────────────────────────────────────────────────────────── */
.st-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--ui-space-5);
  align-items: start;
}

/* ── Sidebar ──────────────────────────────────────────────────────────────────── */
.st-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  position: sticky;
  top: var(--ui-space-5);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-2);
  box-shadow: var(--ui-shadow-sm);
}

.st-nav-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  border: none;
  background: transparent;
  font: inherit;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
  width: 100%;
}

.st-nav-item:hover {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
}

.st-nav-item[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.1);
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}

.st-nav-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.25);
}

.st-nav-icon {
  font-size: 1.1rem;
  width: 1.4rem;
  text-align: center;
  flex-shrink: 0;
  line-height: 1;
}

.st-nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Painel ───────────────────────────────────────────────────────────────────── */
.st-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.st-section-title {
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

/* ── Banner de erro ───────────────────────────────────────────────────────────── */
.st-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
  margin-bottom: var(--ui-space-4);
}

.st-banner-error {
  border-color: rgb(var(--ui-danger) / 0.5);
  background: rgb(var(--ui-danger) / 0.07);
}

.st-banner-icon {
  font-size: 1.2rem;
  line-height: 1;
  flex-shrink: 0;
}

.st-banner-error .st-banner-icon {
  color: rgb(var(--ui-danger));
}

.st-banner-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  flex: 1;
}

.st-banner-close {
  flex-shrink: 0;
  padding: var(--ui-space-1) var(--ui-space-2);
  border: none;
  background: transparent;
  color: rgb(var(--ui-muted));
  cursor: pointer;
  font-size: var(--ui-text-sm);
  border-radius: var(--ui-radius-sm);
}

.st-banner-close:hover {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
}

/* ── Rodapé de card ───────────────────────────────────────────────────────────── */
.st-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.st-foot-hint {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── Toggle (switch acessível) ────────────────────────────────────────────────── */
.st-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) 0;
}

.st-toggle-copy {
  min-width: 0;
  flex: 1;
}

.st-toggle-title {
  margin: 0;
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

.st-toggle-hint {
  margin: var(--ui-space-1) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.st-switch {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 28px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.st-switch[data-on="true"] {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}

.st-switch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.25);
}

.st-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.st-switch-knob {
  position: absolute;
  top: var(--ui-space-1);
  left: var(--ui-space-1);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgb(var(--ui-bg));
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.15s ease;
}

.st-switch[data-on="true"] .st-switch-knob {
  transform: translateX(20px);
}

@media (prefers-reduced-motion: reduce) {
  .st-switch,
  .st-switch-knob {
    transition: none;
  }
}

/* Tema switch */
.st-theme-row {
  padding: var(--ui-space-3) 0;
}

.st-theme-switch {
  width: 56px;
  height: 30px;
}

.st-theme-switch .st-switch-knob {
  width: 22px;
  height: 22px;
}

.st-theme-switch[data-on="true"] .st-switch-knob {
  transform: translateX(26px);
}

/* ── Select nativo (timezone, locale) ─────────────────────────────────────────── */
.st-select {
  display: block;
  width: 100%;
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--ui-space-3) center;
  padding-right: var(--ui-space-7, 2rem);
  cursor: pointer;
  transition: border-color 0.12s ease;
}

.st-select:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
}

.st-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.2);
}

.st-select-error {
  border-color: rgb(var(--ui-danger));
}

/* ── Skeleton ─────────────────────────────────────────────────────────────────── */
.st-sk-block {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) 0;
}

.st-sk-line {
  height: 14px;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  animation: st-pulse 1.4s ease-in-out infinite;
}

.st-sk-w40 { width: 40%; }
.st-sk-w50 { width: 50%; }
.st-sk-w60 { width: 60%; }
.st-sk-w70 { width: 70%; }
.st-sk-w80 { width: 80%; }

@keyframes st-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* ── Responsivo ───────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .st-layout {
    grid-template-columns: 1fr;
  }

  .st-sidebar {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    padding: var(--ui-space-1);
  }

  .st-nav-item {
    flex-direction: column;
    gap: var(--ui-space-1);
    padding: var(--ui-space-2);
    min-width: 72px;
    text-align: center;
    align-items: center;
  }

  .st-nav-label {
    font-size: var(--ui-text-xs);
  }
}
</style>
