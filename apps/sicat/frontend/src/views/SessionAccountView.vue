<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { formatDateTimeBr } from '../utils/date-format.js';

const router = useRouter();
const authStore = useAuthStore();

const nowTick = ref(Date.now());
const lastSyncAt = ref('');
const refreshLoading = ref(false);
const switchingAccountId = ref('');
const feedback = ref('');
const feedbackError = ref('');

let timer = null;

const activeAccount = computed(() => authStore.activeAccount.value || null);
const accounts = computed(() => authStore.accounts.value || []);
const sessionContext = computed(() => authStore.sessionContext.value || null);
const integrationAccountId = computed(() => String(authStore.integrationAccountId.value || '').trim());

const remainingSeconds = computed(() => {
  const expiresAt = authStore.expiresAt.value;
  if (!expiresAt) return 0;
  const diff = Math.floor((new Date(expiresAt).getTime() - nowTick.value) / 1000);
  return Math.max(0, diff);
});

const clock = computed(() => {
  const total = remainingSeconds.value;
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
});

const sessionState = computed(() => {
  if (!authStore.isAuthenticated.value) return 'expired';
  if (!authStore.expiresAt.value) return 'missing';
  if (remainingSeconds.value <= 0) return 'expired';
  if (remainingSeconds.value <= 5 * 60) return 'warning';
  return 'healthy';
});

const sessionStateLabel = computed(() => {
  if (sessionState.value === 'healthy') return 'Autenticado';
  if (sessionState.value === 'warning') return 'Expirando em breve';
  if (sessionState.value === 'missing') return 'Sem expiração mapeada';
  return 'Expirado';
});

const sessionStatusClass = computed(() => {
  if (sessionState.value === 'healthy') return 'succeeded';
  if (sessionState.value === 'warning') return 'retry';
  return 'failed';
});

const operationalChecks = computed(() => {
  const sessionContextId = String(sessionContext.value?.id || sessionContext.value?.sessionContextId || '').trim();
  return [
    {
      key: 'sicatAuth',
      label: 'Sessão SICAT autenticada',
      ok: authStore.isAuthenticated.value,
      detail: authStore.isAuthenticated.value ? 'Token válido' : 'Token ausente/expirado'
    },
    {
      key: 'activeAccount',
      label: 'Conta CETESB ativa',
      ok: Boolean(activeAccount.value?.accountId),
      detail: activeAccount.value?.partnerName || 'Nenhuma conta ativa'
    },
    {
      key: 'sessionContextId',
      label: 'sessionContextId presente',
      ok: Boolean(sessionContextId),
      detail: sessionContextId || '-'
    },
    {
      key: 'integrationAccountId',
      label: 'integrationAccountId presente',
      ok: Boolean(integrationAccountId.value),
      detail: integrationAccountId.value || '-'
    }
  ];
});

const hasOperationalContext = computed(() => operationalChecks.value.every((item) => item.ok));

function formatDate(value) {
  if (!value) return '—';
  return formatDateTimeBr(value);
}

function accountTypeLabel(accountType) {
  const labels = {
    generator: 'Gerador',
    carrier: 'Transportador',
    receiver: 'Destinador',
    unknown: 'Não definido'
  };
  return labels[String(accountType || '').toLowerCase()] || 'Não definido';
}

async function copyValue(value, label) {
  const content = String(value || '').trim();
  if (!content) {
    feedbackError.value = `${label} não disponível para cópia.`;
    return;
  }

  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(content);
    } else {
      const temp = document.createElement('textarea');
      temp.value = content;
      temp.setAttribute('readonly', '');
      temp.style.position = 'absolute';
      temp.style.left = '-9999px';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
    }

    feedback.value = `${label} copiado para a área de transferência.`;
    feedbackError.value = '';
  } catch {
    feedbackError.value = `Falha ao copiar ${label}.`;
  }
}

async function refreshOperationalContext(showSuccess = true) {
  refreshLoading.value = true;
  feedbackError.value = '';
  if (!showSuccess) feedback.value = '';

  try {
    await authStore.refreshOperationalContext();
    lastSyncAt.value = new Date().toISOString();
    if (showSuccess) feedback.value = `Contexto operacional sincronizado em ${formatDate(lastSyncAt.value)}.`;
  } catch (err) {
    feedbackError.value = err?.message || authStore.error.value || 'Falha ao sincronizar contexto operacional.';
  } finally {
    refreshLoading.value = false;
  }
}

async function switchAccount(accountId) {
  const nextAccountId = String(accountId || '').trim();
  if (!nextAccountId) return;

  if (nextAccountId === String(activeAccount.value?.accountId || '').trim()) {
    feedback.value = 'Esta conta CETESB já está ativa.';
    feedbackError.value = '';
    return;
  }

  switchingAccountId.value = nextAccountId;
  feedback.value = '';
  feedbackError.value = '';

  try {
    await authStore.activateCetesbAccount(nextAccountId);
    lastSyncAt.value = new Date().toISOString();
    feedback.value = 'Conta CETESB ativada com sucesso.';
  } catch (err) {
    feedbackError.value = err?.message || authStore.error.value || 'Falha ao trocar conta CETESB.';
  } finally {
    switchingAccountId.value = '';
  }
}

function goToAccountSelection() {
  authStore.clearActiveCetesbContext();
  router.push('/login/cetesb');
}

function logoutSicat() {
  authStore.logout();
  router.push('/login');
}

onMounted(async () => {
  await refreshOperationalContext(false);
  timer = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="session-page">
    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
          <v-col>
            <div class="text-overline text-primary mb-1">Contexto operacional</div>
            <h2 class="text-h5 font-weight-semibold mb-1">Sessão e Conta CETESB</h2>
            <p class="text-body-2 text-medium-emphasis mb-1">Clareza operacional de autenticação, conta ativa e contexto de execução.</p>
            <div class="d-flex flex-wrap ga-3 mt-1 text-caption text-medium-emphasis">
              <span>Última sincronização: {{ lastSyncAt ? formatDate(lastSyncAt) : '—' }}</span>
              <span>Usuário: {{ authStore.user.value?.email || '-' }}</span>
            </div>
          </v-col>
          <v-col cols="auto">
            <v-chip :color="sessionStatusClass === 'succeeded' ? 'success' : sessionStatusClass === 'failed' ? 'error' : 'warning'" variant="tonal">
              {{ sessionStateLabel }}
            </v-chip>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-row class="mb-4">
      <v-col cols="12" sm="6" md="3">
        <v-card>
          <v-card-text>
            <div class="text-caption text-medium-emphasis mb-1">Sessão SICAT</div>
            <div class="text-h5 font-weight-bold">{{ clock }}</div>
            <div class="text-caption text-medium-emphasis">Expira em tempo real</div>
            <div class="text-caption mt-1">Expiração: {{ formatDate(authStore.expiresAt.value) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card>
          <v-card-text>
            <div class="text-caption text-medium-emphasis mb-1">Conta CETESB ativa</div>
            <div class="text-h6 font-weight-bold">{{ activeAccount?.partnerName || 'Não selecionada' }}</div>
            <div class="text-caption">Código: {{ activeAccount?.partnerCode || '-' }}</div>
            <div class="text-caption">Tipo: {{ accountTypeLabel(activeAccount?.accountType) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card>
          <v-card-text>
            <div class="text-caption text-medium-emphasis mb-1">Contexto operacional</div>
            <div class="text-h6 font-weight-bold" :class="hasOperationalContext ? 'text-success' : 'text-warning'">{{ hasOperationalContext ? 'Pronto' : 'Incompleto' }}</div>
            <div class="text-caption">sessionContextId: {{ sessionContext?.id || sessionContext?.sessionContextId || '-' }}</div>
            <div class="text-caption">integrationAccountId: {{ integrationAccountId || '-' }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card>
          <v-card-text>
            <div class="text-caption text-medium-emphasis mb-1">Última sincronização</div>
            <div class="text-h6 font-weight-bold">{{ lastSyncAt ? formatDate(lastSyncAt) : 'Não sincronizado' }}</div>
            <div class="text-caption">Usuário: {{ authStore.user.value?.name || '-' }}</div>
            <div class="text-caption">E-mail: {{ authStore.user.value?.email || '-' }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mb-4">
      <v-card-text class="d-flex flex-wrap ga-2">
        <v-btn variant="outlined" :loading="refreshLoading" prepend-icon="mdi-sync" @click="refreshOperationalContext(true)">Sincronizar contexto</v-btn>
        <v-btn variant="outlined" prepend-icon="mdi-swap-horizontal" @click="goToAccountSelection">Trocar conta CETESB</v-btn>
        <v-btn color="error" variant="tonal" prepend-icon="mdi-logout" @click="logoutSicat">Encerrar sessão SICAT</v-btn>
      </v-card-text>
    </v-card>

    <v-alert v-if="feedback" type="success" variant="tonal" class="mb-3" density="compact">{{ feedback }}</v-alert>
    <v-alert v-if="feedbackError" type="error" variant="tonal" class="mb-3" density="compact">{{ feedbackError }}</v-alert>

    <v-card class="mb-4">
      <v-card-title class="text-subtitle-1 font-weight-semibold">Troca rápida de conta CETESB</v-card-title>
      <v-table density="compact">
        <thead>
          <tr>
            <th scope="col">Conta</th>
            <th scope="col">Documento</th>
            <th scope="col">Tipo</th>
            <th scope="col">Último uso</th>
            <th scope="col">Status</th>
            <th scope="col">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!accounts.length">
            <td colspan="6" class="text-center text-medium-emphasis pa-4">Nenhuma conta CETESB salva.</td>
          </tr>
          <tr v-for="account in accounts" :key="account.accountId">
            <td>{{ account.partnerName || account.accountId }}</td>
            <td>{{ account.partnerDocument || '-' }}</td>
            <td>{{ accountTypeLabel(account.accountType) }}</td>
            <td>{{ formatDate(account.lastUsageAt) }}</td>
            <td>
              <v-chip size="small" :color="account.accountId === activeAccount?.accountId ? 'success' : 'secondary'" variant="tonal">
                {{ account.accountId === activeAccount?.accountId ? 'Ativa' : 'Inativa' }}
              </v-chip>
            </td>
            <td>
              <v-btn
                size="small"
                variant="outlined"
                :disabled="switchingAccountId === account.accountId || account.accountId === activeAccount?.accountId"
                :loading="switchingAccountId === account.accountId"
                @click="switchAccount(account.accountId)"
              >
                Ativar
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-card>
      <v-card-title class="text-subtitle-1 font-weight-semibold">Diagnóstico de contexto operacional</v-card-title>
      <v-table density="compact">
        <thead>
          <tr>
            <th scope="col">Verificação</th>
            <th scope="col">Resultado</th>
            <th scope="col">Detalhe</th>
            <th scope="col">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="check in operationalChecks" :key="check.key">
            <td>{{ check.label }}</td>
            <td>
              <v-chip size="small" :color="check.ok ? 'success' : 'error'" variant="tonal">
                {{ check.ok ? 'OK' : 'Pendente' }}
              </v-chip>
            </td>
            <td>{{ check.detail }}</td>
            <td>
              <v-btn
                v-if="check.key === 'sessionContextId'"
                size="small"
                variant="outlined"
                :disabled="!sessionContext?.id && !sessionContext?.sessionContextId"
                @click="copyValue(sessionContext?.id || sessionContext?.sessionContextId, 'sessionContextId')"
              >
                Copiar ID
              </v-btn>
              <v-btn
                v-else-if="check.key === 'integrationAccountId'"
                size="small"
                variant="outlined"
                :disabled="!integrationAccountId"
                @click="copyValue(integrationAccountId, 'integrationAccountId')"
              >
                Copiar ID
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </div>
</template>

<style scoped>
.session-page {
  display: grid;
  gap: 20px;
}

@media (max-width: 900px) {
  .session-page {
    gap: 16px;
  }
}
</style>

