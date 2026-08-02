<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getManifestById, streamJobEvents } from '../services/api.js';
import { useOperationalContextStore } from '../stores/operationalContext.js';
import { formatDateBr, formatDateTimeBr } from '../utils/date-format.js';
import SicatStatusBadge from '../components/sicat/SicatStatusBadge.vue';
import SicatStatusTimeline from '../components/sicat/SicatStatusTimeline.vue';
// Mesmo resolvedor de rótulo da listagem: o detalhe precisa dizer "Recebido"
// exatamente como a lista diz, e não o código cru do backend ("submitted").
import { resolveManifestStatusLabel } from '../features/mtr/list/manifestHelpers.js';
import { useNotification } from '../composables/useNotification.js';

const route = useRoute();
const router = useRouter();
const operationalContextStore = useOperationalContextStore();
const notify = useNotification();
const loading = ref(false);
const error = ref('');
const manifest = ref(null);
const autoRefreshing = ref(false);
const autoRefreshTerminalReached = ref(false);

let stopJobStream = null;

const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'dlq']);

const isErrorStatus = computed(() => {
  const status = String(manifest.value?.status || manifest.value?.externalStatus || '').toLowerCase();
  return status.includes('error') || status.includes('fail');
});

const cancelFailureMessage = computed(() => {
  const cancelResult = manifest.value?.jobResults?.['manifest.cancel'] || null;
  if (!cancelResult || cancelResult.outcome !== 'manifest_cancel_failed') return '';

  const code = String(cancelResult.lastErrorCode || '').trim().toUpperCase();
  if (code === 'MANIFEST_CANCEL_NOT_CONFIRMED') {
    return 'Cancelamento solicitado, mas ainda não confirmado pela CETESB. O manifesto continua com o status anterior no SIGOR.';
  }

  if (code === 'MANIFEST_NOT_READY_FOR_CANCEL') {
    return 'O manifesto ainda não está pronto para cancelamento na CETESB. Tente novamente em alguns instantes.';
  }

  return String(cancelResult.userMessage || cancelResult.lastErrorMessage || '').trim();
});

// Situação exibida: a CETESB devolve a situação em pt-BR (externalStatus);
// o status interno só entra quando não há situação externa.
const statusValue = computed(() => manifest.value?.externalStatus || manifest.value?.status || null);
const statusLabel = computed(() => (manifest.value ? resolveManifestStatusLabel(manifest.value) : ''));
const statusKey = computed(() => String(statusValue.value || '').toLowerCase());

const isReceivedStatus = computed(() => statusKey.value.includes('receb') || statusKey.value === 'received');
const isInProgressStatus = computed(
  () => statusKey.value.includes('process') || statusKey.value.includes('queue') || statusKey.value.includes('pend')
);
const wasSentToCetesb = computed(() => {
  if (!manifest.value) return false;
  if (manifest.value.lastSubmittedAt || manifest.value.manifestNumber || manifest.value.externalCode) return true;
  return ['submitted', 'succeeded', 'completed', 'received'].includes(statusKey.value) || isReceivedStatus.value;
});

function formatDateTime(value) {
  return value ? formatDateTimeBr(value) : '';
}

// Linha do tempo do MTR — usa o design system (SicatStatusTimeline) e só campos
// que o backend realmente devolve (createdAt, lastSubmittedAt, updatedAt).
const timelineSteps = computed(() => {
  if (!manifest.value) return [];

  const sentState = isErrorStatus.value ? 'error' : wasSentToCetesb.value ? 'done' : isInProgressStatus.value ? 'current' : 'pending';
  const receivedState = isReceivedStatus.value ? 'done' : (!isErrorStatus.value && wasSentToCetesb.value ? 'current' : 'pending');

  return [
    {
      title: 'Manifesto criado no SICAT',
      timestamp: formatDateTime(manifest.value.createdAt),
      state: 'done'
    },
    {
      title: 'Enviado à CETESB',
      description: wasSentToCetesb.value ? '' : 'Ainda não enviado ao SIGOR.',
      timestamp: formatDateTime(manifest.value.lastSubmittedAt),
      state: sentState
    },
    {
      title: 'Recebido pelo destinador',
      description: isReceivedStatus.value ? 'Pronto para emissão do CDF.' : 'Aguardando confirmação de recebimento.',
      timestamp: isReceivedStatus.value ? formatDateTime(manifest.value.updatedAt) : '',
      state: receivedState
    }
  ];
});

// Participantes: a CETESB só devolve nome e código do parceiro na consulta de
// manifestos — o CNPJ não vem no payload. Em vez de um "-" mudo, mostramos o
// código do parceiro (que serve para conferência) e dizemos o que falta.
const participants = computed(() => [
  { key: 'generator', label: 'Gerador', partner: manifest.value?.generator || null },
  { key: 'carrier', label: 'Transportador', partner: manifest.value?.carrier || null },
  { key: 'receiver', label: 'Destinador', partner: manifest.value?.receiver || null }
]);

function partnerIdentification(partner) {
  if (!partner) return '';
  const document = String(partner.document || '').trim();
  if (document) return `CNPJ/CPF ${document}`;
  const partnerCode = String(partner.partnerCode ?? '').trim();
  if (partnerCode) return `Código do parceiro na CETESB: ${partnerCode}`;
  return 'CNPJ não informado pela CETESB';
}

async function copyInternalId() {
  const value = String(manifest.value?.id || route.params.id || '').trim();
  if (!value) return;

  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(value);
      notify.success('Identificador copiado para a área de transferência.');
      return;
    }
    notify.info(`Identificador do manifesto: ${value}`);
  } catch {
    notify.error('Não foi possível copiar o identificador.');
  }
}

const displayManifestLabel = computed(() => {
  if (!manifest.value) return '-';
  if (manifest.value.manifestNumber) return manifest.value.manifestNumber;
  if (manifest.value.externalCode) return `Código CETESB ${manifest.value.externalCode}`;
  return 'Rascunho (número CETESB pendente)';
});

// Contexto operacional enriquecido para o copiloto interno
const inAppCopilotContext = computed(() => {
  if (!manifest.value) return null;

  return {
    manifestStatus: manifest.value.status,
    externalStatus: manifest.value.externalStatus,
    lastAction: extractLastAction(manifest.value),
    relatedJobs: extractRelatedJobs(manifest.value),
    availableDocuments: extractAvailableDocuments(manifest.value),
    sourceRouteName: route.name,
    sourceViewId: manifest.value.id
  };
});

// Sincroniza contexto operacional com o store para o copiloto interno
watch(
  () => inAppCopilotContext.value,
  (newContext) => {
    if (newContext) {
      operationalContextStore.setManifestContext(newContext);
    } else {
      operationalContextStore.clearContext();
    }
  },
  { deep: true }
);

function extractLastAction(currentManifest) {
  if (!currentManifest || typeof currentManifest !== 'object') return null;

  // Procura pela última ação nos jobResults ou toma o timestamp de atualização
  const jobResults = currentManifest.jobResults || {};
  const allActions = Object.entries(jobResults)
    .filter(([, result]) => result && typeof result === 'object')
    .map(([actionName, result]) => ({
      actionName,
      timestamp: result.completedAt || result.timestamp || null
    }))
    .filter(a => a.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (allActions.length > 0) {
    return `${allActions[0].actionName} em ${formatDateBr(allActions[0].timestamp)}`;
  }

  return currentManifest.updatedAt ? `Atualizado em ${formatDateBr(currentManifest.updatedAt)}` : null;
}

function extractRelatedJobs(currentManifest) {
  if (!currentManifest || typeof currentManifest !== 'object') return [];

  // Extrai jobs dos jobResults
  const jobResults = currentManifest.jobResults || {};
  return Object.entries(jobResults)
    .filter(([, result]) => result && typeof result === 'object' && result.jobId)
    .map(([actionName, result]) => ({
      id: result.jobId,
      jobId: result.jobId,
      type: actionName,
      jobType: actionName,
      status: result.status || 'processing'
    }));
}

function extractAvailableDocuments(currentManifest) {
  if (!currentManifest || typeof currentManifest !== 'object') return [];

  const docs = [];

  // Manifesto em PDF
  if (currentManifest.id) {
    docs.push({
      name: currentManifest.manifestNumber || currentManifest.externalCode || 'MTR',
      type: 'manifesto'
    });
  }

  // Documentos relacionados
  if (Array.isArray(currentManifest.documents)) {
    currentManifest.documents.forEach(doc => {
      if (doc && typeof doc === 'object') {
        docs.push({
          name: doc.name || doc.filename || 'Documento',
          type: doc.type || 'attachment'
        });
      }
    });
  }

  return docs;
}

async function loadManifest() {
  const id = route.params.id;
  if (!id) return;

  loading.value = true;
  error.value = '';

  try {
    manifest.value = await getManifestById(id);
  } catch (err) {
    error.value = err?.message || 'Falha ao carregar detalhe do manifesto.';
  } finally {
    loading.value = false;
  }
}

function goBack() {
  const shouldForceSync = autoRefreshTerminalReached.value || String(route.query.autoRefresh || '') === '1';
  router.push({
    path: '/manifestos',
    query: {
      refresh: '1',
      ...(shouldForceSync ? { forceSync: '1' } : {})
    }
  });
}

function clearJobStream() {
  if (stopJobStream) {
    stopJobStream();
    stopJobStream = null;
  }
}

function extractSubmitJobId(currentManifest) {
  return currentManifest?.jobResults?.['manifest.submit']?.jobId || null;
}

async function loadManifestWithBinding() {
  clearJobStream();
  autoRefreshTerminalReached.value = false;
  await loadManifest();

  const shouldAutoRefresh = String(route.query.autoRefresh || '') === '1';
  if (!shouldAutoRefresh || !manifest.value) {
    autoRefreshing.value = false;
    return;
  }

  const routeJobId = String(route.query.jobId || '').trim();
  const submitJobId = routeJobId || extractSubmitJobId(manifest.value);
  if (!submitJobId) {
    autoRefreshing.value = false;
    return;
  }

  autoRefreshing.value = true;
  stopJobStream = await streamJobEvents(submitJobId, {
    onEvent: async (payload) => {
      if (!payload || payload.type === 'heartbeat') return;

      await loadManifest();

      const jobStatus = String(payload?.job?.status || '').toLowerCase();
      if (TERMINAL_JOB_STATUSES.has(jobStatus)) {
        autoRefreshTerminalReached.value = true;
        autoRefreshing.value = false;
        clearJobStream();
      }
    },
    onError: () => {
      autoRefreshing.value = false;
      clearJobStream();
    }
  });
}

watch(
  () => route.params.id,
  async () => {
    await loadManifestWithBinding();
  }
);

onMounted(loadManifestWithBinding);
onUnmounted(() => {
  clearJobStream();
});
</script>

<template>
  <section class="manifest-detail-page">
    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
          <v-col>
            <!-- Sem título aqui: o cabeçalho da página (shell) já anuncia
                 "MTR · Detalhe do manifesto". Repetir gerava dois títulos, com
                 capitalização diferente entre eles. -->
            <p class="text-body-2 text-medium-emphasis mb-0">Acompanhe participantes, dados operacionais e resíduos deste manifesto.</p>
          </v-col>
          <v-col cols="auto">
            <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{ error }}</v-alert>
    <v-card v-else-if="loading" class="mb-3">
      <v-card-text class="text-medium-emphasis">Carregando detalhes…</v-card-text>
    </v-card>

    <template v-else-if="manifest">
      <v-alert v-if="autoRefreshing" type="info" variant="tonal" class="mb-3" density="compact">
        Atualizando a situação deste manifesto automaticamente…
      </v-alert>

      <v-alert v-if="cancelFailureMessage" type="warning" variant="tonal" class="mb-3">{{ cancelFailureMessage }}</v-alert>

      <v-card class="mb-4">
        <v-card-text class="d-flex align-center justify-space-between flex-wrap ga-2">
          <h3 class="text-h6">{{ displayManifestLabel }}</h3>
          <SicatStatusBadge :status="statusValue" :label="statusLabel" domain="manifest" size="lg" with-dot />
        </v-card-text>
      </v-card>

      <v-alert v-if="isErrorStatus" type="error" variant="tonal" class="mb-3">
        {{ manifest.externalStatus || 'O envio deste manifesto à CETESB não foi concluído. Tente novamente pela listagem de manifestos; se o erro persistir, acione o suporte.' }}
      </v-alert>

      <v-card class="mb-4">
        <v-card-title class="text-subtitle-1 font-weight-semibold">Andamento</v-card-title>
        <v-card-text>
          <SicatStatusTimeline :steps="timelineSteps" />
        </v-card-text>
      </v-card>

      <v-row class="mb-4">
        <v-col v-for="participant in participants" :key="participant.key" cols="12" sm="4">
          <v-card>
            <v-card-text>
              <div class="text-caption text-medium-emphasis">{{ participant.label }}</div>
              <div class="font-weight-semibold">{{ participant.partner?.description || 'Não informado' }}</div>
              <div class="text-caption text-medium-emphasis">{{ partnerIdentification(participant.partner) }}</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="mb-4">
        <v-card-title class="text-subtitle-1 font-weight-semibold">Dados operacionais</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12" sm="4"><div class="text-caption text-medium-emphasis">Data de expedição</div><div>{{ formatDateBr(manifest.expeditionDate) }}</div></v-col>
            <v-col cols="12" sm="4"><div class="text-caption text-medium-emphasis">Responsável</div><div>{{ manifest.responsibleName || '-' }}</div></v-col>
            <v-col cols="12" sm="4"><div class="text-caption text-medium-emphasis">Motorista</div><div>{{ manifest.driverName || '-' }}</div></v-col>
            <v-col cols="12" sm="4"><div class="text-caption text-medium-emphasis">Placa</div><div>{{ manifest.vehiclePlate || '-' }}</div></v-col>
            <v-col cols="12" sm="4"><div class="text-caption text-medium-emphasis">Código CETESB</div><div>{{ manifest.externalCode || '-' }}</div></v-col>
            <v-col cols="12" sm="4"><div class="text-caption text-medium-emphasis">Hash CETESB</div><div class="manifest-detail-hash">{{ manifest.externalHashCode || '-' }}</div></v-col>
            <v-col cols="12"><div class="text-caption text-medium-emphasis">Observações</div><div>{{ manifest.notes || '-' }}</div></v-col>
          </v-row>

          <!-- Identificador interno fica atrás de "detalhes técnicos": serve para
               suporte, não para a leitura do dia a dia do operador. -->
          <details class="manifest-detail-tech">
            <summary class="manifest-detail-tech__summary">Detalhes técnicos (para suporte)</summary>
            <div class="manifest-detail-tech__body">
              <div>
                <div class="text-caption text-medium-emphasis">Identificador do manifesto no SICAT</div>
                <div class="manifest-detail-hash">{{ manifest.id || route.params.id }}</div>
              </div>
              <v-btn size="small" variant="outlined" prepend-icon="mdi-content-copy" @click="copyInternalId">
                Copiar identificador
              </v-btn>
            </div>
          </details>
        </v-card-text>
      </v-card>

      <v-card class="mb-4" color="primary" variant="tonal">
        <v-card-text class="d-flex flex-wrap align-center justify-space-between ga-3">
          <div>
            <div class="text-caption font-weight-semibold mb-1">Fluxos do destinador</div>
            <div class="font-weight-medium">Recebimento e CDF agora acontecem na listagem de manifestos.</div>
            <div class="text-caption">Use a seleção e o menu de ações da listagem para receber MTRs ou abra o módulo CDF para emitir o certificado a partir deste manifesto.</div>
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn variant="outlined" prepend-icon="mdi-format-list-bulleted" @click="goBack">Abrir listagem operacional</v-btn>
            <v-btn
              v-if="manifest?.id"
              color="primary"
              variant="elevated"
              prepend-icon="mdi-certificate-outline"
              :to="{ path: '/cdf/novo', query: { manifestId: manifest.id } }"
            >
              Gerar CDF a partir deste manifesto
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-semibold">Resíduos</v-card-title>
        <v-table density="compact">
          <thead>
            <tr>
              <th scope="col">Código IBAMA</th>
              <th scope="col">Descrição</th>
              <th scope="col">Classe</th>
              <th scope="col">Qtd</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!manifest.residues?.length">
              <td colspan="4" class="text-center text-medium-emphasis pa-4">
                <div>Nenhuma linha de resíduo disponível para este manifesto.</div>
                <div class="text-caption">A consulta da CETESB nem sempre devolve os resíduos do MTR; confira os itens no PDF do manifesto.</div>
              </td>
            </tr>
            <tr v-for="(residue, index) in manifest.residues || []" :key="`res-${index}`">
              <td>{{ residue.residue?.ibamaCode || '-' }}</td>
              <td>{{ residue.residue?.description || '-' }}</td>
              <td>{{ residue.class?.description || '-' }}</td>
              <td>{{ residue.quantity || 0 }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </template>

    <v-alert v-else type="info" variant="tonal" density="compact">Manifesto não encontrado.</v-alert>
  </section>
</template>

<style scoped>
.manifest-detail-page {
  display: grid;
  gap: 20px;
}

.manifest-detail-hash {
  font-family: var(--font-family-mono);
  font-size: 0.82rem;
  word-break: break-all;
}

.manifest-detail-tech {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(var(--v-border-color), 0.14);
}

.manifest-detail-tech__summary {
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.manifest-detail-tech__summary:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: 4px;
}

.manifest-detail-tech__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

@media (max-width: 767px) {
  .manifest-detail-page {
    gap: 16px;
  }
}
</style>

