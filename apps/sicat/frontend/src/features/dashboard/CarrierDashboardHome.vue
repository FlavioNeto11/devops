<script setup>
// Home do MÓDULO do Transportador (REQ-SICAT-0032). O DashboardView delega para
// cá quando a persona é `carrier` e a flag da vertical está ligada — mesma home
// (/dashboard), ramo próprio. A lógica de jornada (checklist/atenção/hub) vive
// no modelo PURO carrier-home-model.js, coberto por node:test; este componente
// só renderiza, seguindo os mesmos padrões de template do DashboardView.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useTransportePendenciasStore } from '../../stores/transportePendenciasStore.js';
import { listTransportCarriers, listTransportOperations, listTransportVehicles } from '../../services/api.js';
import {
  buildCarrierAttention,
  buildCarrierChecklist,
  buildCarrierHubActions,
  countOpenOperations,
  countOperations,
  isChecklistComplete
} from './carrier-home-model.js';
import { cargoRegimeLabel, formatCurrencyBRL, operationStatusLabel } from '../../views/transporte/transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatActionCard from '../../components/sicat/SicatActionCard.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

const router = useRouter();
const authStore = useAuthStore();
const pendenciasStore = useTransportePendenciasStore();
const { overview, loadingOverview, overviewError, loadOverview } = pendenciasStore;

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

const recentOperations = ref([]);
const carriersCount = ref(0);
const vehiclesCount = ref(0);
const loadingLists = ref(false);
const listsError = ref('');
const hasLoadedOnce = ref(false);

const checklist = computed(() =>
  buildCarrierChecklist({
    carriersCount: carriersCount.value,
    vehiclesCount: vehiclesCount.value,
    operationsCount: countOperations(overview.value)
  })
);
const checklistDone = computed(() => isChecklistComplete(checklist.value));

// O checklist é derivado de DADOS e some quando completo; o localStorage só
// guarda o "Ocultar" explícito para não reaparecer em recargas.
const CHECKLIST_COLLAPSED_KEY = 'sicat.ui.carrier-onboarding-collapsed';
const checklistCollapsed = ref(false);
try { checklistCollapsed.value = Boolean(localStorage.getItem(CHECKLIST_COLLAPSED_KEY)); } catch { /* sem localStorage */ }
function collapseChecklist() {
  checklistCollapsed.value = true;
  try { localStorage.setItem(CHECKLIST_COLLAPSED_KEY, '1'); } catch { /* ignore */ }
}
const showChecklist = computed(() => !checklistDone.value || !checklistCollapsed.value);

const attention = computed(() => buildCarrierAttention(overview.value));
const hubActions = computed(() =>
  buildCarrierHubActions({ openOperationsCount: countOpenOperations(overview.value) })
);

const metricCards = computed(() => {
  const map = overview.value?.operationsByStatus || {};
  const blocked = Number(map.blocked || 0);
  const completed = Number(map.completed || 0);
  return [
    { key: 'open', label: 'Em andamento', value: countOpenOperations(overview.value), tone: 'running', icon: 'mdi-truck-fast-outline', to: '/transporte/operacoes' },
    { key: 'blocked', label: 'Bloqueadas', value: blocked, tone: blocked > 0 ? 'error' : 'neutral', icon: 'mdi-truck-alert-outline', to: '/transporte/pendencias' },
    { key: 'completed', label: 'Concluídas', value: completed, tone: 'success', icon: 'mdi-check-circle-outline', to: '/transporte/operacoes' }
  ];
});

// Mesmos campos/formatadores da lista de operações (fonte única de rótulos).
const recentHeaders = [
  { title: 'Operação', key: 'referenceCode', sortable: false },
  { title: 'Regime', key: 'cargoRegime', sortable: false },
  { title: 'Frete', key: 'freight', sortable: false },
  { title: 'Situação', key: 'status', sortable: false, align: 'end' }
];

const recentRows = computed(() =>
  recentOperations.value.map((operation) => ({
    id: operation.id,
    referenceCode: operation.referenceCode || operation.id,
    cargoRegime: cargoRegimeLabel(operation.cargoRegime),
    freight: formatCurrencyBRL(operation.freight?.contractedAmount ?? operation.freight?.offeredAmount),
    status: operation.status,
    statusLabel: operationStatusLabel(operation.status)
  }))
);

// Vazio aponta para ação que EXISTE no hub deste perfil (regra do produto).
const recentEmptyState = {
  title: 'Nenhuma operação ainda',
  description: 'Quando você registrar viagens, as mais recentes aparecem aqui. Use "Acompanhar minhas operações" acima para abrir a lista.',
  icon: 'mdi-truck-fast-outline'
};

const WELCOME_KEY = 'sicat.ui.carrier-welcomed';
const showWelcome = ref(false);
try { showWelcome.value = !localStorage.getItem(WELCOME_KEY); } catch { /* sem localStorage: não mostra */ }
function dismissWelcome() {
  showWelcome.value = false;
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ }
}

async function loadLists() {
  loadingLists.value = true;
  listsError.value = '';
  try {
    await authStore.ensureSessionContextReady();
    const integrationAccountId = authStore.integrationAccountId.value;
    const [operationsResponse, carriersResponse, vehiclesResponse] = await Promise.all([
      listTransportOperations({ integrationAccountId, page: 1, pageSize: 8 }),
      listTransportCarriers({ integrationAccountId, page: 1, pageSize: 1 }),
      listTransportVehicles({ integrationAccountId, page: 1, pageSize: 1 })
    ]);
    recentOperations.value = Array.isArray(operationsResponse?.items) ? operationsResponse.items : [];
    carriersCount.value = Number(carriersResponse?.totalItems ?? (carriersResponse?.items?.length || 0));
    vehiclesCount.value = Number(vehiclesResponse?.totalItems ?? (vehiclesResponse?.items?.length || 0));
  } catch (error) {
    listsError.value = error?.detail || error?.message || 'Falha ao carregar os dados da transportadora.';
  } finally {
    hasLoadedOnce.value = true;
    loadingLists.value = false;
  }
}

async function reload() {
  await Promise.all([loadOverview(), loadLists()]);
}

onMounted(reload);
</script>

<template>
  <SicatPageLayout :loading="(loadingOverview || loadingLists) && !hasLoadedOnce" loading-message="Carregando sua transportadora…">
    <template #header>
      <SicatPageHeader
        kicker="Início · Transportadora"
        :title="`Olá, ${userName}`"
        :description="`Conta da CETESB: ${activeAccountLabel}. Aqui você opera as viagens e mantém frota, seguros e conformidade em dia.`"
      >
        <template #actions>
          <v-btn variant="text" :loading="loadingOverview || loadingLists" prepend-icon="mdi-refresh" @click="reload">Atualizar</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert v-if="overviewError" tone="error" :message="overviewError">
        <template #actions>
          <v-btn size="small" variant="text" :loading="loadingOverview" @click="loadOverview">Tentar novamente</v-btn>
        </template>
      </SicatInlineAlert>
      <SicatInlineAlert v-else-if="listsError" tone="error" :message="listsError">
        <template #actions>
          <v-btn size="small" variant="text" :loading="loadingLists" @click="loadLists">Tentar novamente</v-btn>
        </template>
      </SicatInlineAlert>
    </template>

    <div v-if="showWelcome" class="carrier-welcome">
      <v-icon icon="mdi-hand-wave-outline" size="30" class="carrier-welcome__icon" aria-hidden="true" />
      <div class="carrier-welcome__body">
        <strong>Bem-vindo ao módulo da Transportadora!</strong>
        <p>Registre as viagens, acompanhe a conformidade de cada uma e resolva pendências antes que virem problema. Nos formulários, o “?” ao lado de cada campo explica os termos.</p>
      </div>
      <v-btn variant="tonal" color="primary" @click="dismissWelcome">Entendi</v-btn>
    </div>

    <SicatCard v-if="showChecklist" title="Deixe sua transportadora pronta" icon="mdi-clipboard-check-outline">
      <div class="carrier-checklist">
        <div v-for="step in checklist" :key="step.key" class="carrier-checklist__item">
          <v-icon
            :icon="step.done ? 'mdi-check-circle' : 'mdi-circle-outline'"
            :color="step.done ? 'success' : undefined"
            size="22"
            aria-hidden="true"
          />
          <div class="carrier-checklist__text">
            <strong>{{ step.label }}</strong>
            <span>{{ step.description }}</span>
          </div>
          <v-btn v-if="!step.done" color="primary" variant="tonal" size="small" :to="step.to">Começar</v-btn>
          <span v-else class="carrier-checklist__done">Feito</span>
        </div>
        <div v-if="checklistDone" class="carrier-checklist__footer">
          <span>Tudo pronto — boa viagem!</span>
          <v-btn size="small" variant="text" @click="collapseChecklist">Ocultar</v-btn>
        </div>
      </div>
    </SicatCard>

    <section class="carrier-hub" aria-label="O que você quer fazer">
      <h2 class="carrier-hub__title">O que você quer fazer?</h2>
      <div class="carrier-hub__grid">
        <SicatActionCard
          v-for="action in hubActions"
          :key="action.key"
          :icon="action.icon"
          :tone="action.tone"
          :title="action.title"
          :description="action.description"
          :to="action.to"
          :badge="action.badge"
        />
      </div>
    </section>

    <SicatCard
      v-if="attention.items.length"
      title="O que precisa da sua atenção"
      icon="mdi-bell-alert-outline"
    >
      <div class="carrier-pending">
        <div v-for="item in attention.items" :key="item.key" class="carrier-pending__item" :data-tone="item.tone">
          <v-icon :icon="item.icon" size="24" class="carrier-pending__icon" />
          <div class="carrier-pending__text">
            <strong>{{ item.title }}</strong>
            <span>{{ item.description }}</span>
          </div>
          <v-btn :color="item.tone === 'error' ? 'error' : 'primary'" variant="tonal" size="small" :to="item.to">
            {{ item.actionLabel }}
          </v-btn>
        </div>
        <div v-if="attention.totalCount > attention.items.length" class="carrier-pending__more">
          <v-btn variant="text" size="small" to="/transporte/pendencias" append-icon="mdi-arrow-right">
            Ver todas as pendências
          </v-btn>
        </div>
      </div>
    </SicatCard>

    <SicatCard title="Resumo das operações" icon="mdi-chart-box-outline">
      <div class="carrier-metrics">
        <SicatMetricCard
          v-for="card in metricCards"
          :key="card.key"
          :label="card.label"
          :value="card.value"
          :icon="card.icon"
          :tone="card.tone"
          clickable
          @click="router.push(card.to)"
        />
      </div>
    </SicatCard>

    <SicatCard title="Últimas operações" icon="mdi-history" flush-body>
      <SicatDataTable
        :headers="recentHeaders"
        :items="recentRows"
        density="compact"
        count-noun="operação"
        :empty="recentEmptyState"
        @row-click="(row) => row?.id && router.push(`/transporte/operacoes/${row.id}`)"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="transport-operation" with-dot />
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>

<style scoped>
.carrier-welcome {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  border: 1px solid rgba(var(--v-theme-primary), 0.28);
  background: rgba(var(--v-theme-primary), 0.07);
}
.carrier-welcome__icon { color: rgb(var(--v-theme-primary)); flex-shrink: 0; }
.carrier-welcome__body { margin-right: auto; min-width: 0; }
.carrier-welcome__body strong { display: block; font-size: 1.05rem; color: rgba(var(--v-theme-on-surface), 0.92); }
.carrier-welcome__body p { margin: 2px 0 0; font-size: 0.92rem; color: rgba(var(--v-theme-on-surface), 0.74); }
@media (max-width: 640px) { .carrier-welcome { flex-wrap: wrap; } }

.carrier-checklist { display: flex; flex-direction: column; gap: var(--space-3); }
.carrier-checklist__item { display: flex; align-items: center; gap: var(--space-3); }
.carrier-checklist__text { display: flex; flex-direction: column; margin-right: auto; min-width: 0; }
.carrier-checklist__text span { font-size: 0.88rem; color: rgba(var(--v-theme-on-surface), 0.7); }
.carrier-checklist__done { font-size: 0.85rem; font-weight: 600; color: rgb(var(--v-theme-success)); }
.carrier-checklist__footer { display: flex; align-items: center; justify-content: space-between; font-size: 0.9rem; color: rgba(var(--v-theme-on-surface), 0.75); }

.carrier-hub__title {
  margin: 0 0 var(--space-3);
  font-size: 1.15rem;
  font-weight: 800;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
.carrier-hub__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); }

.carrier-pending { display: flex; flex-direction: column; gap: var(--space-3); }
.carrier-pending__item { display: flex; align-items: center; gap: var(--space-3); }
.carrier-pending__item[data-tone='error'] .carrier-pending__icon { color: rgb(var(--v-theme-error)); }
.carrier-pending__item[data-tone='warning'] .carrier-pending__icon { color: rgb(var(--v-theme-warning)); }
.carrier-pending__text { display: flex; flex-direction: column; margin-right: auto; min-width: 0; }
.carrier-pending__text span { font-size: 0.88rem; color: rgba(var(--v-theme-on-surface), 0.7); }
.carrier-pending__more { display: flex; justify-content: flex-end; }

.carrier-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); }
</style>
