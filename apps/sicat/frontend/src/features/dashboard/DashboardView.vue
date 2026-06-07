<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getDashboardOverview } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.js';
import { formatDateBr, getTodayBr, toApiDate } from '../../utils/date-format.js';
import { resolveManifestStatusTone } from '../../lib/status-map.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const items = ref([]);
const loading = ref(false);
const error = ref('');
const hasLoadedOnce = ref(false);
const lastUpdatedAt = ref(null);

const userName = computed(() => {
  const name = String(authStore.user.value?.name || '').trim();
  return name ? name.split(/\s+/)[0] : 'operador';
});

const activeAccountLabel = computed(() => {
  const account = authStore.activeAccount.value || null;
  if (!account) return 'Conta CETESB não selecionada';
  const name = String(account.partnerName || '').trim();
  const code = String(account.partnerCode || '').trim();
  if (name && code) return `${name} (cód. ${code})`;
  return name || code || account.accountId || 'Conta ativa';
});

const adminAccessNotice = computed(() => {
  if (String(route.query?.notice || '').trim() !== 'admin-access-denied') return '';
  const deniedRoute = String(route.query?.deniedRoute || '/admin/acessos').trim();
  return `Você não possui permissão para acessar ${deniedRoute}.`;
});

function clearAdminAccessNotice() {
  const nextQuery = { ...route.query };
  delete nextQuery.notice;
  delete nextQuery.deniedRoute;
  router.replace({ path: route.path, query: nextQuery }).catch(() => {});
}

function statusBucket(status) {
  const tone = resolveManifestStatusTone(status);
  if (tone === 'success') return 'completed';
  if (tone === 'running') return 'pending';
  if (tone === 'error') return 'failed';
  const value = String(status || '').toLowerCase();
  if (value.includes('cancel')) return 'cancelled';
  return 'draft';
}

const summary = computed(() => {
  const result = { draft: 0, pending: 0, completed: 0, cancelled: 0, failed: 0 };
  for (const item of items.value) {
    result[statusBucket(item.status || item.externalStatus)] += 1;
  }
  return result;
});

const metricCards = computed(() => [
  { key: 'pending', label: 'Em processamento', value: summary.value.pending, tone: 'running', icon: 'mdi-progress-clock', focus: 'pending' },
  { key: 'completed', label: 'Concluídos hoje', value: summary.value.completed, tone: 'success', icon: 'mdi-check-circle-outline', focus: 'completed' },
  { key: 'draft', label: 'Rascunhos', value: summary.value.draft, tone: 'warning', icon: 'mdi-file-outline', focus: 'draft' },
  { key: 'failed', label: 'Falhas', value: summary.value.failed, tone: 'error', icon: 'mdi-alert-circle-outline', focus: 'failed' }
]);

const pendingActions = computed(() => {
  const actions = [];
  if (summary.value.failed > 0) {
    actions.push({
      key: 'failed',
      icon: 'mdi-alert-circle-outline',
      tone: 'error',
      title: `${summary.value.failed} MTR(s) com falha`,
      description: 'Revise o erro e reemita para regularizar.',
      actionLabel: 'Resolver',
      to: { path: '/manifestos', query: { focus: 'failed' } }
    });
  }
  if (summary.value.draft > 0) {
    actions.push({
      key: 'draft',
      icon: 'mdi-file-edit-outline',
      tone: 'warning',
      title: `${summary.value.draft} rascunho(s) em aberto`,
      description: 'Finalize a emissão dos manifestos pendentes.',
      actionLabel: 'Continuar',
      to: { path: '/manifestos', query: { focus: 'draft' } }
    });
  }
  return actions;
});

const quickActions = [
  { key: 'emitir', label: 'Emitir MTR', icon: 'mdi-file-plus-outline', to: '/manifestos/novo', color: 'primary' },
  { key: 'dmr', label: 'Nova DMR', icon: 'mdi-file-tree-outline', to: '/dmr/novo' },
  { key: 'cdf', label: 'Gerar CDF', icon: 'mdi-certificate-outline', to: '/cdf/novo' },
  { key: 'provisorio', label: 'MTR Provisório', icon: 'mdi-file-clock-outline', to: '/mtr-provisorio' }
];

const recentHeaders = [
  { title: 'Manifesto', key: 'label', sortable: false },
  { title: 'Destinatário', key: 'receiver', sortable: false },
  { title: 'Data', key: 'date', sortable: false },
  { title: 'Status', key: 'status', sortable: false, align: 'end' }
];

const recentRows = computed(() =>
  items.value.map((manifest) => ({
    id: manifest.id,
    label: manifest.manifestNumber || (manifest.externalCode ? `Código CETESB ${manifest.externalCode}` : 'Rascunho (nº pendente)'),
    receiver: manifest.receiver?.description || '-',
    date: formatDateBr(manifest.expeditionDate),
    status: manifest.status || manifest.externalStatus || ''
  }))
);

const lastUpdatedLabel = computed(() => {
  if (!lastUpdatedAt.value) return '';
  return new Date(lastUpdatedAt.value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
});

function openManifests(focus) {
  router.push(focus ? { path: '/manifestos', query: { focus } } : '/manifestos');
}

async function loadDashboard() {
  loading.value = true;
  error.value = '';

  try {
    await authStore.ensureSessionContextReady();
    const integrationAccountId = authStore.integrationAccountId.value;
    const sessionContextId = authStore.sessionContext.value?.sessionContextId || authStore.sessionContext.value?.id || null;

    if (!integrationAccountId) {
      throw new Error('Conta de integração não disponível para carregar o painel.');
    }

    const todayApi = toApiDate(getTodayBr());
    const response = await getDashboardOverview({
      integrationAccountId,
      sessionContextId,
      hoursBack: 24,
      manifestsPageSize: 10,
      dateFrom: todayApi,
      dateTo: todayApi
    });

    const manifests = response?.manifests || {};
    items.value = Array.isArray(manifests?.items) ? manifests.items : [];
    lastUpdatedAt.value = new Date().toISOString();
  } catch (err) {
    error.value = err?.message || 'Falha ao carregar o painel.';
  } finally {
    hasLoadedOnce.value = true;
    loading.value = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <SicatPageLayout :loading="loading && !hasLoadedOnce" loading-message="Carregando painel…">
    <template #header>
      <SicatPageHeader
        kicker="Início"
        :title="`Olá, ${userName}`"
        :description="`Conta ativa: ${activeAccountLabel}. Aqui está o resumo da sua operação hoje.`"
      >
        <template #actions>
          <v-btn variant="text" :loading="loading" prepend-icon="mdi-refresh" @click="loadDashboard">Atualizar</v-btn>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-file-plus-outline" :to="{ name: 'ManifestoNovo' }">Emitir MTR</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="adminAccessNotice"
        tone="warning"
        :message="adminAccessNotice"
        dismissible
        @dismiss="clearAdminAccessNotice"
      />
      <SicatInlineAlert v-if="error" tone="error" :message="error">
        <template #actions>
          <v-btn size="small" variant="text" :loading="loading" @click="loadDashboard">Tentar novamente</v-btn>
        </template>
      </SicatInlineAlert>
    </template>

    <div class="dashboard-metrics">
      <SicatMetricCard
        v-for="card in metricCards"
        :key="card.key"
        :label="card.label"
        :value="card.value"
        :icon="card.icon"
        :tone="card.tone"
        clickable
        @click="openManifests(card.focus)"
      />
    </div>

    <SicatCard
      v-if="pendingActions.length"
      title="Pendências que precisam de atenção"
      icon="mdi-bell-alert-outline"
    >
      <div class="dashboard-pending">
        <div v-for="action in pendingActions" :key="action.key" class="dashboard-pending__item" :data-tone="action.tone">
          <v-icon :icon="action.icon" size="24" class="dashboard-pending__icon" />
          <div class="dashboard-pending__text">
            <strong>{{ action.title }}</strong>
            <span>{{ action.description }}</span>
          </div>
          <v-btn :color="action.tone === 'error' ? 'error' : 'primary'" variant="tonal" size="small" :to="action.to">
            {{ action.actionLabel }}
          </v-btn>
        </div>
      </div>
    </SicatCard>

    <div class="dashboard-columns">
      <SicatCard title="Últimos manifestos" icon="mdi-history" class="dashboard-columns__main" flush-body>
        <SicatDataTable
          :headers="recentHeaders"
          :items="recentRows"
          density="compact"
          :empty="{ title: 'Nenhum manifesto hoje', description: 'Emita um MTR para começar.', icon: 'mdi-file-document-outline' }"
          @row-click="(row) => row?.id && router.push(`/manifestos/${row.id}`)"
        >
          <template #[`item.status`]="{ item }">
            <SicatStatusBadge :status="item.status" domain="manifest" with-dot />
          </template>
        </SicatDataTable>
      </SicatCard>

      <SicatCard title="Ações rápidas" icon="mdi-lightning-bolt-outline" class="dashboard-columns__aside">
        <div class="dashboard-quick">
          <v-btn
            v-for="action in quickActions"
            :key="action.key"
            :color="action.color || undefined"
            :variant="action.color ? 'flat' : 'outlined'"
            :prepend-icon="action.icon"
            :to="action.to"
            block
            class="dashboard-quick__btn"
          >
            {{ action.label }}
          </v-btn>
        </div>
      </SicatCard>
    </div>

    <template #footer>
      <span v-if="lastUpdatedLabel">Atualizado em {{ lastUpdatedLabel }}.</span>
    </template>
  </SicatPageLayout>
</template>

<style scoped>
.dashboard-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
}

.dashboard-pending {
  display: grid;
  gap: var(--space-3);
}

.dashboard-pending__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(var(--v-border-color), 0.14);
  background: rgba(var(--v-theme-surface-light, var(--v-theme-surface)), 0.4);
}

.dashboard-pending__item[data-tone='error'] {
  border-color: rgba(var(--v-theme-error), 0.28);
  background: rgba(var(--v-theme-error), 0.05);
}

.dashboard-pending__item[data-tone='warning'] {
  border-color: rgba(var(--v-theme-warning), 0.28);
  background: rgba(var(--v-theme-warning), 0.05);
}

.dashboard-pending__icon {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.dashboard-pending__item[data-tone='error'] .dashboard-pending__icon { color: rgb(var(--v-theme-error)); }
.dashboard-pending__item[data-tone='warning'] .dashboard-pending__icon { color: rgb(var(--v-theme-warning)); }

.dashboard-pending__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-right: auto;
  min-width: 0;
}

.dashboard-pending__text strong {
  font-size: 0.92rem;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.dashboard-pending__text span {
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.dashboard-columns {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.dashboard-quick {
  display: grid;
  gap: 10px;
}

.dashboard-quick__btn {
  justify-content: flex-start;
}

@media (max-width: 959px) {
  .dashboard-columns {
    grid-template-columns: 1fr;
  }
}
</style>
