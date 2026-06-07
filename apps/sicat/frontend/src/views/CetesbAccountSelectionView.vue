<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import ConfirmDialog from '../components/sicat/SicatConfirmDialog.vue';
import { useConfirmDialog } from '../composables/useConfirmDialog.js';
import { toggleAppTheme } from '../composables/useAppTheme.js';
import { useAuthStore } from '../stores/auth.js';
import { getPartnerInfo } from '../services/api.js';
import { formatDateTimeBr } from '../utils/date-format.js';

const router = useRouter();
const theme = useTheme();
const authStore = useAuthStore();
const {
  dialogVisible,
  dialogTitle,
  dialogMessage,
  dialogConfirmLabel,
  dialogCancelLabel,
  dialogDanger,
  dialogShowCancel,
  confirm,
  accept,
  cancel
} = useConfirmDialog();

const pageLoading = ref(false);
const pageError = ref('');
const pageSuccess = ref('');
const activatingAccountId = ref('');
const removingAccountId = ref('');

const addForm = reactive({
  login: '',
  password: '',
  email: '',
  partnerCode: '',
  recaptchaToken: ''
});

const addingAccount = ref(false);
const addFormError = ref('');
const addFormSuccess = ref('');
const showAddAccountForm = ref(false);
const partnerLookupLoading = ref(false);
const partnerLookupError = ref('');

const isDarkTheme = computed(() => Boolean(theme.global.current.value.dark));
const accounts = computed(() => authStore.accounts.value || []);
const activeAccountId = computed(() => authStore.activeAccount.value?.accountId || '');
const hasSavedAccounts = computed(() => accounts.value.length > 0);
const activeAccountLabel = computed(() => {
  const activeAccount = authStore.activeAccount.value || null;
  if (!activeAccount) {
    return 'Nenhuma';
  }

  const partnerName = String(activeAccount.partnerName || '').trim();
  const partnerCode = String(activeAccount.partnerCode || '').trim();

  if (partnerName && partnerCode) {
    return `${partnerName} (cód. ${partnerCode})`;
  }

  return partnerName || partnerCode || String(activeAccount.accountId || 'Conta ativa').trim();
});

function toggleTheme() {
  toggleAppTheme(theme, isDarkTheme.value);
}

function goToPublicHome() {
  router.push({
    path: '/',
    query: { public: '1' }
  });
}

function toggleAddAccountForm() {
  showAddAccountForm.value = !showAddAccountForm.value;
}

function normalizeDocumentDigits(value) {
  return String(value || '').replaceAll(/\D/g, '');
}

function isValidDocumentDigits(value) {
  return value.length === 11 || value.length === 14;
}

async function resolvePartnerInfoFromLogin() {
  const normalizedDocument = normalizeDocumentDigits(addForm.login);
  if (!isValidDocumentDigits(normalizedDocument)) {
    partnerLookupError.value = '';
    return;
  }

  partnerLookupLoading.value = true;
  partnerLookupError.value = '';

  try {
    const info = await getPartnerInfo(normalizedDocument);

    if (info?.partnerCode && !String(addForm.partnerCode || '').trim()) {
      addForm.partnerCode = String(info.partnerCode);
    }

    if (!String(addForm.email || '').trim() && Array.isArray(info?.registeredUsers) && info.registeredUsers.length > 0) {
      const primaryEmail = info.registeredUsers.find((item) => item?.email)?.email || '';
      if (primaryEmail) {
        addForm.email = primaryEmail;
      }
    }
  } catch (err) {
    partnerLookupError.value = err?.message || 'Não foi possível carregar o código do parceiro para este CNPJ/CPF.';
  } finally {
    partnerLookupLoading.value = false;
  }
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return formatDateTimeBr(value);
}

function accountTypeLabel(accountType) {
  const labels = {
    generator: 'Gerador',
    carrier: 'Transportador',
    receiver: 'Destinador',
    unknown: 'Não definido'
  };

  return labels[accountType] || 'Não definido';
}

async function loadAccounts() {
  pageLoading.value = true;
  pageError.value = '';
  pageSuccess.value = '';

  try {
    await authStore.syncSicatSession();
    await authStore.loadCetesbAccounts();
    pageSuccess.value = `Contas salvas atualizadas em ${formatDateTimeBr(new Date().toISOString())}.`;
  } catch (err) {
    pageError.value = err?.message || 'Falha ao carregar contas CETESB.';
  } finally {
    pageLoading.value = false;
  }
}

async function handleActivateAccount(accountId) {
  activatingAccountId.value = accountId;
  pageError.value = '';
  pageSuccess.value = '';

  try {
    await authStore.activateCetesbAccount(accountId);
    router.push('/dashboard');
  } catch (err) {
    pageError.value = err?.message || 'Não foi possível ativar a conta CETESB.';
  } finally {
    activatingAccountId.value = '';
  }
}

async function handleRemoveAccount(account) {
  const accountId = String(account?.accountId || '').trim();
  if (!accountId) {
    return;
  }

  const displayName = String(account?.partnerName || accountId).trim();
  const confirmed = await confirm({
    title: 'Remover conta CETESB',
    message: `Remover a conta CETESB "${displayName}" da lista salva?`,
    confirmLabel: 'Remover conta',
    danger: true
  });

  if (!confirmed) {
    return;
  }

  removingAccountId.value = accountId;
  pageError.value = '';
  pageSuccess.value = '';

  try {
    await authStore.removeCetesbAccount(accountId);
    await loadAccounts();
    pageSuccess.value = `Conta CETESB "${displayName}" removida com sucesso.`;
  } catch (err) {
    pageError.value = err?.message || 'Não foi possível remover a conta CETESB.';
  } finally {
    removingAccountId.value = '';
  }
}

async function handleAddAccount() {
  addFormError.value = '';
  addFormSuccess.value = '';

  if (!String(addForm.login || '').trim()) {
    addFormError.value = 'Informe o login da conta CETESB.';
    return;
  }

  if (!String(addForm.password || '').trim()) {
    addFormError.value = 'Informe a senha da conta CETESB.';
    return;
  }

  addingAccount.value = true;

  try {
    const createdAccount = await authStore.addCetesbAccount({
      login: String(addForm.login || '').trim(),
      password: String(addForm.password || ''),
      email: String(addForm.email || '').trim() || null,
      partnerCode: String(addForm.partnerCode || '').trim() ? Number(addForm.partnerCode) : null,
      recaptchaToken: String(addForm.recaptchaToken || '')
    });

    if (createdAccount?.accountId) {
      await authStore.activateCetesbAccount(createdAccount.accountId);
      router.push('/dashboard');
      return;
    }

    addFormSuccess.value = 'Conta CETESB adicionada com sucesso.';
    await loadAccounts();
  } catch (err) {
    addFormError.value = err?.message || 'Falha ao adicionar conta CETESB.';
  } finally {
    addingAccount.value = false;
  }
}

onMounted(async () => {
  await loadAccounts();
});
</script>

<template>
  <div class="account-selection-view">
    <div class="account-selection-layout">
      <section class="account-selection-showcase">
        <div class="account-selection-brand-row">
          <div class="account-selection-mark">
            <v-icon color="primary" size="24">mdi-shield-account</v-icon>
          </div>
          <div class="account-selection-brand">SICAT</div>
        </div>

        <div class="account-selection-stage" aria-hidden="true">
          <div class="account-stage-orb account-stage-orb-primary" />
          <div class="account-stage-orb account-stage-orb-info" />

          <div class="account-stage-floating account-stage-floating-top">
            <v-icon size="16">mdi-link-variant</v-icon>
            <span>CETESB Session</span>
          </div>

          <div class="account-stage-illustration">
            <div class="account-stage-monitor">
              <div class="account-stage-monitor-head">
                <span />
                <span />
                <span />
              </div>
              <div class="account-stage-monitor-body">
                <div class="account-stage-chart">
                  <span style="--bar-h: 38%" />
                  <span style="--bar-h: 62%" />
                  <span style="--bar-h: 54%" />
                  <span style="--bar-h: 78%" />
                </div>
                <div class="account-stage-person" />
              </div>
            </div>
          </div>

          <div class="account-stage-floating account-stage-floating-bottom">
            <v-icon size="16">mdi-arrow-right-thin-circle-outline</v-icon>
            <span>Activate and continue</span>
          </div>
        </div>
      </section>

      <v-sheet class="account-selection-panel">
        <div class="account-selection-panel-toolbar">
          <div class="text-caption text-medium-emphasis">SICAT Internal</div>
          <div class="account-selection-toolbar-actions">
            <v-tooltip location="bottom" text="Ir para a home publica">
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  class="account-home-action"
                  icon
                  variant="tonal"
                  color="primary"
                  size="small"
                  aria-label="Voltar para a home publica"
                  @click="goToPublicHome"
                >
                  <v-icon size="18">mdi-home-import-outline</v-icon>
                </v-btn>
              </template>
            </v-tooltip>

            <v-btn
              :icon="isDarkTheme ? 'mdi-weather-sunny' : 'mdi-weather-night'"
              variant="text"
              size="small"
              :aria-label="isDarkTheme ? 'Ativar tema claro' : 'Ativar tema escuro'"
              @click="toggleTheme"
            />
          </div>
        </div>

        <div class="account-selection-panel-head">
          <div>
            <h1 class="account-panel-title">Welcome back</h1>
            <p class="account-panel-subtitle">Choose or add a CETESB account</p>
          </div>
          <div class="d-flex ga-1 align-center">
            <v-btn variant="text" prepend-icon="mdi-logout" size="small" @click="authStore.logout(); router.push('/login')">
              Sair
            </v-btn>
          </div>
        </div>

        <v-alert v-if="pageError" type="error" variant="tonal" class="mb-4">{{ pageError }}</v-alert>
        <v-alert v-if="pageSuccess" type="success" variant="tonal" class="mb-4">{{ pageSuccess }}</v-alert>

        <div class="account-metrics mb-4">
          <div class="account-metric-item">
            <span>Saved accounts</span>
            <strong>{{ accounts.length }}</strong>
          </div>
          <div class="account-metric-item">
            <span>Active</span>
            <strong class="account-metric-active-value">{{ activeAccountId || 'None' }}</strong>
          </div>
        </div>

        <div class="account-selection-stack">
          <v-card variant="outlined" class="account-saved-card" rounded="lg">
            <v-card-item>
              <v-card-title>Use saved account</v-card-title>
              <v-card-subtitle>Fast access with existing credentials</v-card-subtitle>
            </v-card-item>

            <v-card-text>
              <v-list v-if="hasSavedAccounts" lines="three" class="pa-0 account-saved-list">
                <v-list-item
                  v-for="account in accounts"
                  :key="account.accountId"
                  :title="account.partnerName"
                  :subtitle="`${account.partnerDocument || '-'} • Código ${account.partnerCode || '-'} • ${accountTypeLabel(account.accountType)}`"
                  :active="account.accountId === activeAccountId"
                  rounded="lg"
                >
                  <template #append>
                    <div class="d-flex ga-2 flex-wrap justify-end">
                      <v-btn
                        color="primary"
                        size="small"
                        :loading="activatingAccountId === account.accountId"
                        :disabled="removingAccountId === account.accountId"
                        @click="handleActivateAccount(account.accountId)"
                      >
                        Entrar
                      </v-btn>
                      <v-btn
                        color="error"
                        variant="text"
                        size="small"
                        :loading="removingAccountId === account.accountId"
                        :disabled="activatingAccountId === account.accountId"
                        @click="handleRemoveAccount(account)"
                      >
                        Remover
                      </v-btn>
                    </div>
                  </template>
                </v-list-item>
              </v-list>
              <div v-else class="text-body-2 text-medium-emphasis">Nenhuma conta CETESB salva.</div>
            </v-card-text>
          </v-card>

          <v-card variant="outlined" class="account-new-card" rounded="lg">
            <v-card-item>
              <v-card-title>Add a new account</v-card-title>
              <v-card-subtitle>Authenticate another CETESB credential</v-card-subtitle>
            </v-card-item>

            <v-card-text>
              <v-btn block variant="outlined" class="mb-3" @click="toggleAddAccountForm">
                {{ showAddAccountForm ? 'Cancel adding account' : 'Add a new account' }}
              </v-btn>

              <v-expand-transition>
                <div v-if="showAddAccountForm">
                  <v-alert v-if="addFormError" type="error" variant="tonal" class="mb-3">{{ addFormError }}</v-alert>
                  <v-alert v-if="addFormSuccess" type="success" variant="tonal" class="mb-3">{{ addFormSuccess }}</v-alert>

                  <v-form @submit.prevent="handleAddAccount">
                    <v-text-field
                      v-model="addForm.login"
                      label="CETESB login"
                      autocomplete="username"
                      class="mb-3"
                      :disabled="addingAccount || partnerLookupLoading"
                      @blur="resolvePartnerInfoFromLogin"
                    />
                    <v-text-field
                      v-model="addForm.password"
                      label="CETESB password"
                      type="password"
                      autocomplete="current-password"
                      class="mb-3"
                      :disabled="addingAccount"
                    />
                    <v-text-field v-model="addForm.email" label="Email (optional)" class="mb-3" :disabled="addingAccount" />
                    <v-text-field v-model="addForm.partnerCode" label="Partner code (optional)" class="mb-3" :disabled="addingAccount" />
                    <v-text-field v-model="addForm.recaptchaToken" label="reCAPTCHA token (optional)" class="mb-3" :disabled="addingAccount" />

                    <v-alert v-if="partnerLookupLoading" type="info" variant="tonal" class="mb-3" density="compact">
                      Carregando código do parceiro...
                    </v-alert>
                    <v-alert v-else-if="partnerLookupError" type="warning" variant="tonal" class="mb-3" density="compact">
                      {{ partnerLookupError }}
                    </v-alert>

                    <div class="d-flex ga-2 flex-wrap">
                      <v-btn color="primary" type="submit" :loading="addingAccount">
                        Sign in with new account
                      </v-btn>
                      <v-btn variant="outlined" :loading="pageLoading" prepend-icon="mdi-refresh" @click="loadAccounts">
                        Atualizar
                      </v-btn>
                    </div>
                  </v-form>
                </div>
              </v-expand-transition>
            </v-card-text>
          </v-card>
        </div>

        <div class="text-caption text-medium-emphasis mt-3">Conta ativa: {{ activeAccountLabel }}</div>
        <div class="text-caption text-medium-emphasis">Ultima referencia de horario: {{ formatDate(new Date().toISOString()) }}</div>
      </v-sheet>
    </div>

    <ConfirmDialog
      :visible="dialogVisible"
      :title="dialogTitle"
      :message="dialogMessage"
      :confirm-label="dialogConfirmLabel"
      :cancel-label="dialogCancelLabel"
      :danger="dialogDanger"
      :show-cancel="dialogShowCancel"
      @confirm="accept"
      @cancel="cancel"
      @close="cancel"
    />
  </div>
</template>

<style scoped>
.account-selection-view {
  width: 100%;
  min-height: 100vh;
  display: block;
  padding: 0;
  background:
    radial-gradient(circle at 10% 10%, rgba(var(--v-theme-primary), 0.08), transparent 26%),
    linear-gradient(180deg, rgba(var(--v-theme-background), 0.98) 0%, rgba(var(--v-theme-background), 1) 100%);
}

.account-selection-layout {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(380px, 0.8fr);
  gap: 0;
  align-items: stretch;
  min-height: 100vh;
}

.account-selection-showcase {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 34px 38px;
  background:
    radial-gradient(circle at 12% 10%, rgba(var(--v-theme-primary), 0.14), transparent 24%),
    radial-gradient(circle at 84% 18%, rgba(var(--v-theme-info), 0.1), transparent 20%),
    linear-gradient(180deg, rgba(var(--v-theme-surface), 1) 0%, rgba(var(--v-theme-surface), 0.93) 100%);
}

.account-selection-brand-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.account-selection-mark {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.12);
}

.account-selection-brand {
  font-size: 1rem;
  font-weight: 800;
  color: rgba(var(--v-theme-on-surface), 0.92);
}

.account-selection-stage {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.account-stage-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(10px);
  opacity: 0.9;
}

.account-stage-orb-primary {
  inset: 20% auto auto 14%;
  width: 120px;
  height: 120px;
  background: rgba(var(--v-theme-primary), 0.1);
}

.account-stage-orb-info {
  inset: auto 14% 16% auto;
  width: 138px;
  height: 138px;
  background: rgba(var(--v-theme-info), 0.08);
}

.account-stage-floating {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-border-color), 0.12);
  background: rgba(var(--v-theme-surface), 0.96);
  box-shadow: 0 12px 28px rgba(75, 70, 92, 0.08);
  z-index: 2;
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.account-stage-floating-top {
  top: 18%;
  left: 8%;
}

.account-stage-floating-bottom {
  right: 10%;
  bottom: 18%;
}

.account-stage-illustration {
  width: min(100%, 620px);
  min-height: 420px;
  display: grid;
  place-items: center;
}

.account-stage-monitor {
  width: min(100%, 520px);
  border-radius: 24px;
  border: 1px solid rgba(var(--v-border-color), 0.12);
  background: linear-gradient(180deg, rgba(var(--v-theme-surface), 1) 0%, rgba(var(--v-theme-surface), 0.93) 100%);
  box-shadow: 0 24px 54px rgba(75, 70, 92, 0.14);
  overflow: hidden;
}

.account-stage-monitor-head {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 14px 16px 10px;
}

.account-stage-monitor-head span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.24);
}

.account-stage-monitor-head span:nth-child(2) {
  background: rgba(var(--v-theme-warning), 0.3);
}

.account-stage-monitor-head span:nth-child(3) {
  background: rgba(var(--v-theme-success), 0.32);
}

.account-stage-monitor-body {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  min-height: 290px;
  padding: 6px 18px 18px;
}

.account-stage-chart {
  flex: 1;
  height: 170px;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(14px, 1fr);
  align-items: end;
  gap: 9px;
  padding: 0 8px 8px 0;
}

.account-stage-chart span {
  display: block;
  height: var(--bar-h);
  border-radius: 999px 999px 12px 12px;
  background: linear-gradient(180deg, rgba(var(--v-theme-primary), 0.86) 0%, rgba(var(--v-theme-info), 0.72) 100%);
}

.account-stage-person {
  width: 158px;
  height: 212px;
  border-radius: 88px 88px 32px 32px;
  background:
    radial-gradient(circle at 60% 18%, rgba(var(--v-theme-surface), 0.9), transparent 28%),
    linear-gradient(180deg, rgba(var(--v-theme-primary), 0.24) 0%, rgba(var(--v-theme-primary), 0.08) 100%);
  border: 1px solid rgba(var(--v-border-color), 0.12);
}

.account-selection-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  padding: 34px 42px;
  background: rgba(var(--v-theme-surface), 1);
  border-left: 1px solid rgba(var(--v-border-color), 0.1);
  min-height: 100vh;
  max-width: none;
  width: 100%;
  margin: 0;
}

.account-selection-panel > * {
  width: 100%;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}

.account-selection-panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.account-selection-toolbar-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.account-home-action {
  flex: 0 0 auto;
}

.account-selection-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.account-panel-title {
  margin: 0;
  font-size: 1.45rem;
  line-height: 1.15;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.92);
}

.account-panel-subtitle {
  margin: 0;
  font-size: 0.92rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
}

.account-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.account-metric-item {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(var(--v-border-color), 0.12);
  background: rgba(var(--v-theme-background), 0.65);
}

.account-metric-item span {
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.56);
}

.account-metric-item strong {
  font-size: 0.92rem;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.account-metric-active-value {
  overflow-wrap: anywhere;
  word-break: break-all;
  line-height: 1.2;
}

.account-selection-stack {
  display: grid;
  gap: 12px;
}

.account-saved-list :deep(.v-list-item--active) {
  background: rgba(var(--v-theme-primary), 0.08);
}

@media (max-width: 1120px) {
  .account-selection-layout {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .account-selection-showcase {
    min-height: 520px;
    padding: 28px 24px;
  }

  .account-selection-panel {
    border-left: 0;
    min-height: auto;
    max-width: 720px;
    padding: 28px 24px 34px;
  }
}

@media (max-width: 767px) {
  .account-selection-view {
    padding: 0;
  }

  .account-selection-panel-toolbar {
    gap: 10px;
  }

  .account-selection-panel-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .account-selection-showcase,
  .account-selection-panel {
    padding: 20px;
  }

  .account-stage-floating {
    position: static;
    margin-bottom: 8px;
  }

  .account-selection-stage {
    flex-direction: column;
    gap: 8px;
  }

  .account-stage-illustration {
    min-height: 320px;
  }

  .account-stage-monitor {
    width: 100%;
  }

  .account-stage-monitor-body {
    min-height: 220px;
  }

  .account-stage-person {
    width: 120px;
    height: 162px;
  }

  .account-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
