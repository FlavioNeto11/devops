<script setup>
import { computed, onMounted, ref } from 'vue';
import { getCetesbAccountsHealth, getCetesbSessionsHealth } from '../../services/cetesbHealthService.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';

const accounts = ref(null);
const sessions = ref(null);
const loading = ref(false);
const error = ref('');

function healthTone(status) {
  switch (String(status || '').toLowerCase()) {
    case 'healthy':
    case 'active':
      return 'success';
    case 'degraded':
    case 'pending':
    case 'pending_auth':
      return 'warning';
    case 'invalid':
    case 'expired':
    case 'revoked':
      return 'error';
    case 'inactive':
    case 'idle':
      return 'neutral';
    default:
      return 'running';
  }
}

function recommendedAction(account) {
  const status = String(account?.status || '').toLowerCase();
  if (status === 'inactive') return 'Conta inativa — ativar em Sessão se for necessária.';
  if (status === 'degraded' || status === 'pending') return 'Sessões expiradas/inválidas — reautenticar no SICAT.';
  if (status === 'idle') return 'Conta ativa sem sessões em andamento.';
  if (status === 'healthy') return 'Conta operacional — nenhuma ação necessária.';
  return 'Status indeterminado — abrir auditoria.';
}

const totals = computed(() => {
  const t = accounts.value?.totals;
  if (!t) return [];
  return [
    { label: 'Total', value: t.total, tone: 'neutral' },
    { label: 'Ativas', value: t.active, tone: 'primary' },
    { label: 'Saudáveis', value: t.healthy, tone: 'success' },
    { label: 'Degradadas', value: t.degraded, tone: 'warning' },
    { label: 'Pendentes', value: t.pending, tone: 'warning' },
    { label: 'Idle', value: t.idle, tone: 'neutral' },
    { label: 'Inativas', value: t.inactive, tone: 'neutral' }
  ];
});

const accountHeaders = [
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Parceiro', key: 'partner', sortable: false },
  { title: 'Tipo', key: 'accountType', sortable: false },
  { title: 'Sessões (a/p/e/i)', key: 'sessions', sortable: false },
  { title: 'Falhas 24h / DLQ', key: 'failures', sortable: false },
  { title: 'Ação orientada', key: 'action', sortable: false }
];

const accountRows = computed(() =>
  (accounts.value?.accounts || []).map((account) => ({
    id: account.accountId,
    status: account.status,
    partnerName: account.partnerName,
    partnerDocument: account.partnerDocument,
    accountType: account.accountType,
    sessions: `${account.sessions?.active || 0} / ${account.sessions?.pending || 0} / ${account.sessions?.expired || 0} / ${account.sessions?.invalid || 0}`,
    failures: `${account.jobs?.failed24h || 0} / ${account.jobs?.dlqTotal || 0}`,
    action: recommendedAction(account)
  }))
);

const sessionHeaders = [
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Sessão', key: 'sessionContextId', sortable: false },
  { title: 'Conta', key: 'integrationAccountId', sortable: false },
  { title: 'Expira em', key: 'expiresAt', sortable: false },
  { title: 'Última validação', key: 'lastValidatedAt', sortable: false }
];

const sessionRows = computed(() =>
  (sessions.value?.sessions || []).map((session) => ({
    id: session.sessionContextId,
    status: session.status,
    sessionContextId: session.sessionContextId,
    integrationAccountId: session.integrationAccountId,
    expiresAt: session.expiresAt || '—',
    lastValidatedAt: session.lastValidatedAt || '—'
  }))
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [accountsRes, sessionsRes] = await Promise.all([
      getCetesbAccountsHealth(),
      getCetesbSessionsHealth()
    ]);
    accounts.value = accountsRes;
    sessions.value = sessionsRes;
  } catch (err) {
    error.value = err?.message || 'Falha ao carregar saúde CETESB.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <SicatPageLayout :loading="loading && !accounts" :error="error" retryable @retry="load">
    <template #header>
      <SicatPageHeader
        title="Saúde CETESB"
        description="Visão derivada localmente — não chama a CETESB."
      >
        <template #actions>
          <v-btn prepend-icon="mdi-refresh" variant="tonal" color="primary" :loading="loading" @click="load">Atualizar</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <div v-if="totals.length" class="health-totals">
      <SicatMetricCard v-for="t in totals" :key="t.label" :label="t.label" :value="t.value ?? 0" :tone="t.tone" />
    </div>

    <SicatCard title="Contas vinculadas" flush-body>
      <SicatDataTable
        :headers="accountHeaders"
        :items="accountRows"
        :loading="loading"
        :empty="{ title: 'Nenhuma conta cadastrada', icon: 'mdi-account-off-outline' }"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :tone="healthTone(item.status)" :label="item.status" with-dot />
        </template>
        <template #[`item.partner`]="{ item }">
          <div>{{ item.partnerName }}</div>
          <small class="text-medium-emphasis">{{ item.partnerDocument }}</small>
        </template>
      </SicatDataTable>
    </SicatCard>

    <SicatCard title="Sessões CETESB" flush-body>
      <SicatDataTable
        :headers="sessionHeaders"
        :items="sessionRows"
        :loading="loading"
        density="compact"
        :empty="{ title: 'Nenhuma sessão', icon: 'mdi-key-outline' }"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :tone="healthTone(item.status)" :label="item.status" with-dot />
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>

<style scoped>
.health-totals {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}
</style>
