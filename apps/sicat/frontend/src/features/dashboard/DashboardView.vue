<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getDashboardOverview } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.js';
import { usePersona } from '../../composables/usePersona.js';
import { formatDateBr, getTodayBr, toApiDate } from '../../utils/date-format.js';
import { resolveManifestRawSituation, resolveManifestSituationLabel, resolveManifestStatusTone } from '../../lib/status-map.js';
import { pluralize } from '../../lib/plural-pt.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatActionCard from '../../components/sicat/SicatActionCard.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

const router = useRouter();
const authStore = useAuthStore();
const { isReceiver, isCarrier } = usePersona();

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

// Métricas com rótulos por perfil (mesmos valores; o destinador lê "Aguardando baixa"/"Recebidos").
const metricCards = computed(() => {
  const recv = isReceiver.value;
  return [
    { key: 'pending', label: recv ? 'Aguardando baixa' : 'Sendo enviados', value: summary.value.pending, tone: 'running', icon: 'mdi-progress-clock', focus: 'pending' },
    { key: 'completed', label: recv ? 'Recebidos' : 'Prontos hoje', value: summary.value.completed, tone: 'success', icon: 'mdi-check-circle-outline', focus: 'completed' },
    { key: 'draft', label: recv ? 'Em aberto' : 'Não enviados ainda', value: summary.value.draft, tone: 'warning', icon: 'mdi-file-outline', focus: 'draft' },
    { key: 'failed', label: 'Com problema', value: summary.value.failed, tone: 'error', icon: 'mdi-alert-circle-outline', focus: 'failed' }
  ];
});

// Hub de ação POR PERFIL: cada perfil vê em destaque a ação que é a SUA.
const primaryActions = computed(() => {
  const ver = { key: 'ver', icon: 'mdi-file-document-multiple-outline', tone: 'info', title: 'Ver os manifestos', description: 'Acompanhar os manifestos.', to: '/manifestos', badge: summary.value.pending > 0 ? summary.value.pending : '' };
  const ajuda = { key: 'ajuda', icon: 'mdi-chat-processing-outline', tone: 'warning', title: 'Tirar uma dúvida', description: 'Perguntar ao assistente.', to: '/conversacional/chat' };
  if (isReceiver.value) {
    // Destinador: a função dele é DAR BAIXA (receber) e gerar o certificado — não criar.
    return [
      { key: 'receber', icon: 'mdi-check-decagram-outline', tone: 'primary', title: 'Receber manifestos', description: 'Dar baixa nos manifestos que chegaram.', to: '/manifestos', badge: summary.value.pending > 0 ? summary.value.pending : '' },
      { key: 'cdf', icon: 'mdi-certificate-outline', tone: 'success', title: 'Gerar certificado', description: 'Emitir o certificado de destino final (CDF).', to: '/cdf/novo' },
      ajuda
    ];
  }
  if (isCarrier.value) {
    // Transportador: só acompanha.
    return [{ ...ver, tone: 'primary', title: 'Ver os manifestos', description: 'Acompanhar os manifestos da viagem.' }, ajuda];
  }
  // Gerador (padrão): cria o manifesto.
  return [
    { key: 'criar', icon: 'mdi-file-plus-outline', tone: 'primary', title: 'Criar um manifesto', description: 'Autorizar o transporte de um resíduo.', to: '/manifestos/novo' },
    { ...ver, title: 'Ver meus manifestos', description: 'Acompanhar o que já foi criado.' },
    ajuda
  ];
});

// Texto de boas-vindas por perfil (onboarding).
// O “?” de ajuda (SicatHelpHint) existe nos FORMULÁRIOS (criar manifesto, conta
// CETESB) — não neste painel. Prometê-lo aqui mandava o operador procurar um
// ícone que não existe nesta tela; o texto agora aponta para onde ele aparece.
const welcomeText = computed(() => {
  if (isReceiver.value) return 'Aqui você dá baixa nos manifestos que chegam e gera o certificado (CDF). Escolha abaixo o que quer fazer — nos formulários, o “?” ao lado de cada campo explica os termos.';
  if (isCarrier.value) return 'Aqui você acompanha os manifestos das suas viagens. Escolha abaixo o que quer fazer — nos formulários, o “?” ao lado de cada campo explica os termos.';
  return 'Aqui você cria e acompanha os documentos da CETESB sem complicação. Comece criando um manifesto — nos formulários, o “?” ao lado de cada campo explica os termos.';
});

const pendingActions = computed(() => {
  const actions = [];
  if (summary.value.failed > 0) {
    actions.push({
      key: 'failed',
      icon: 'mdi-alert-circle-outline',
      tone: 'error',
      title: `${summary.value.failed} ${pluralize(summary.value.failed, 'MTR', 'MTRs')} com falha`,
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
      title: `${summary.value.draft} ${pluralize(summary.value.draft, 'rascunho')} em aberto`,
      description: 'Finalize a emissão dos manifestos pendentes.',
      actionLabel: 'Continuar',
      to: { path: '/manifestos', query: { focus: 'draft' } }
    });
  }
  return actions;
});

// "Destinador" é o termo usado nas demais listas (e no cadastro CETESB) —
// "Destinatário" era um sinônimo solto só deste painel.
const recentHeaders = [
  { title: 'Manifesto', key: 'label', sortable: false },
  { title: 'Destinador', key: 'receiver', sortable: false },
  { title: 'Data', key: 'date', sortable: false },
  { title: 'Situação', key: 'status', sortable: false, align: 'end' }
];

const recentRows = computed(() =>
  items.value.map((manifest) => ({
    id: manifest.id,
    label: manifest.manifestNumber || (manifest.externalCode ? `Código CETESB ${manifest.externalCode}` : 'Rascunho (nº pendente)'),
    receiver: manifest.receiver?.description || '-',
    date: formatDateBr(manifest.expeditionDate),
    // Situação CETESB tem precedência (mesma regra da lista de manifestos).
    status: manifest.externalStatus || manifest.status || '',
    // Mesmo rótulo canônico da lista de manifestos (evita o mesmo MTR aparecer
    // como "Enviado" aqui e "Salvo" lá).
    statusLabel: resolveManifestSituationLabel(manifest),
    rawStatus: resolveManifestRawSituation(manifest)
  }))
);

// Vazio do painel: aponta para uma ação que EXISTE no hub deste perfil.
// O destinador não emite manifesto — o texto antigo mandava clicar em
// "Criar um manifesto", botão que não aparece para ele.
const recentEmptyState = computed(() => {
  if (isReceiver.value) {
    return {
      title: 'Nenhum manifesto chegou hoje',
      description: 'Quando o transportador enviar, ele aparece aqui. Use "Receber manifestos" acima para ver todos.',
      icon: 'mdi-file-document-outline'
    };
  }
  if (isCarrier.value) {
    return {
      title: 'Nenhum manifesto hoje',
      description: 'Use "Ver os manifestos" acima para acompanhar as viagens.',
      icon: 'mdi-file-document-outline'
    };
  }
  return {
    title: 'Você ainda não criou manifestos hoje',
    description: 'Use "Criar um manifesto" acima para começar.',
    icon: 'mdi-file-document-outline'
  };
});

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

// Boas-vindas (apenas no 1º acesso do operador) — onboarding leve.
const WELCOME_KEY = 'sicat.ui.operator-welcomed';
const showWelcome = ref(false);
try { showWelcome.value = !localStorage.getItem(WELCOME_KEY); } catch { /* sem localStorage: não mostra */ }
function dismissWelcome() {
  showWelcome.value = false;
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ }
}

onMounted(loadDashboard);
</script>

<template>
  <SicatPageLayout :loading="loading && !hasLoadedOnce" loading-message="Carregando painel…">
    <template #header>
      <SicatPageHeader
        kicker="Início"
        :title="`Olá, ${userName}`"
        :description="`Conta da CETESB: ${activeAccountLabel}. Escolha abaixo o que você quer fazer.`"
      >
        <template #actions>
          <v-btn variant="text" :loading="loading" prepend-icon="mdi-refresh" @click="loadDashboard">Atualizar</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <!-- Acesso negado a área administrativa é avisado pelo próprio guard de rota
         (useNotification), sem query string e sem expor o caminho interno. -->
    <template #banner>
      <SicatInlineAlert v-if="error" tone="error" :message="error">
        <template #actions>
          <v-btn size="small" variant="text" :loading="loading" @click="loadDashboard">Tentar novamente</v-btn>
        </template>
      </SicatInlineAlert>
    </template>

    <div v-if="showWelcome" class="dashboard-welcome">
      <v-icon icon="mdi-hand-wave-outline" size="30" class="dashboard-welcome__icon" aria-hidden="true" />
      <div class="dashboard-welcome__body">
        <strong>Bem-vindo ao SICAT!</strong>
        <p>{{ welcomeText }}</p>
      </div>
      <v-btn variant="tonal" color="primary" @click="dismissWelcome">Entendi</v-btn>
    </div>

    <section class="dashboard-hub" aria-label="O que você quer fazer">
      <h2 class="dashboard-hub__title">O que você quer fazer?</h2>
      <div class="dashboard-hub__grid">
        <SicatActionCard
          v-for="action in primaryActions"
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
      v-if="pendingActions.length"
      title="O que precisa da sua atenção"
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

    <SicatCard title="Resumo de hoje" icon="mdi-chart-box-outline">
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
    </SicatCard>

    <SicatCard title="Últimos manifestos" icon="mdi-history" flush-body>
      <SicatDataTable
        :headers="recentHeaders"
        :items="recentRows"
        density="compact"
        count-noun="manifesto"
        :empty="recentEmptyState"
        @row-click="(row) => row?.id && router.push(`/manifestos/${row.id}`)"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge
            :status="item.status"
            :label="item.statusLabel"
            :title="item.rawStatus ? `Situação na CETESB: ${item.rawStatus}` : undefined"
            domain="manifest"
            with-dot
          />
        </template>
      </SicatDataTable>
    </SicatCard>

    <template #footer>
      <span v-if="lastUpdatedLabel">Atualizado em {{ lastUpdatedLabel }}.</span>
    </template>
  </SicatPageLayout>
</template>

<style scoped>
.dashboard-welcome {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  border: 1px solid rgba(var(--v-theme-primary), 0.28);
  background: rgba(var(--v-theme-primary), 0.07);
}
.dashboard-welcome__icon { color: rgb(var(--v-theme-primary)); flex-shrink: 0; }
.dashboard-welcome__body { margin-right: auto; min-width: 0; }
.dashboard-welcome__body strong { display: block; font-size: 1.05rem; color: rgba(var(--v-theme-on-surface), 0.92); }
.dashboard-welcome__body p { margin: 2px 0 0; font-size: 0.92rem; color: rgba(var(--v-theme-on-surface), 0.74); }
@media (max-width: 640px) { .dashboard-welcome { flex-wrap: wrap; } }

.dashboard-hub__title {
  margin: 0 0 var(--space-3);
  font-size: 1.15rem;
  font-weight: 800;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
.dashboard-hub__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
}

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

</style>
