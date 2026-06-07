<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getManifestById, streamJobEvents } from '../services/api.js';
import { useOperationalContextStore } from '../stores/operationalContext.js';
import { formatDateBr } from '../utils/date-format.js';

const route = useRoute();
const router = useRouter();
const operationalContextStore = useOperationalContextStore();
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
            <div class="text-overline text-primary mb-1">Detalhe operacional</div>
            <h2 class="text-h5 font-weight-semibold mb-1">Detalhe do Manifesto</h2>
            <p class="text-body-2 text-medium-emphasis mb-2">ID: {{ route.params.id }}</p>
            <div class="d-flex flex-wrap ga-2 align-center">
              <v-chip size="small" :color="isErrorStatus ? 'error' : 'success'" variant="tonal">
                {{ manifest?.status || manifest?.externalStatus || 'draft' }}
              </v-chip>
              <span class="text-caption text-medium-emphasis">Acompanhe participantes, dados operacionais e resíduos deste manifesto.</span>
            </div>
          </v-col>
          <v-col cols="auto">
            <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{ error }}</v-alert>
    <v-card v-else-if="loading" class="mb-3">
      <v-card-text class="text-medium-emphasis">Carregando detalhes...</v-card-text>
    </v-card>

    <template v-else-if="manifest">
      <v-alert v-if="autoRefreshing" type="info" variant="tonal" class="mb-3" density="compact">
        Atualizando status automaticamente...
      </v-alert>

      <v-alert v-if="cancelFailureMessage" type="warning" variant="tonal" class="mb-3">{{ cancelFailureMessage }}</v-alert>

      <v-card class="mb-4">
        <v-card-text class="d-flex align-center justify-space-between flex-wrap ga-2">
          <h3 class="text-h6">{{ displayManifestLabel }}</h3>
          <v-chip :color="isErrorStatus ? 'error' : 'success'" variant="tonal">
            {{ manifest.status || manifest.externalStatus || 'draft' }}
          </v-chip>
        </v-card-text>
      </v-card>

      <v-alert v-if="isErrorStatus" type="error" variant="tonal" class="mb-3">
        {{ manifest.externalStatus || 'Processo com erro de integração. Verifique auditoria/job relacionado para detalhes técnicos.' }}
      </v-alert>

      <v-row class="mb-4">
        <v-col cols="12" sm="4">
          <v-card>
            <v-card-text>
              <div class="text-caption text-medium-emphasis">Gerador</div>
              <div class="font-weight-semibold">{{ manifest.generator?.description || '-' }}</div>
              <div class="text-caption">{{ manifest.generator?.document || '-' }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card>
            <v-card-text>
              <div class="text-caption text-medium-emphasis">Transportador</div>
              <div class="font-weight-semibold">{{ manifest.carrier?.description || '-' }}</div>
              <div class="text-caption">{{ manifest.carrier?.document || '-' }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card>
            <v-card-text>
              <div class="text-caption text-medium-emphasis">Destinador</div>
              <div class="font-weight-semibold">{{ manifest.receiver?.description || '-' }}</div>
              <div class="text-caption">{{ manifest.receiver?.document || '-' }}</div>
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
              <td colspan="4" class="text-center text-medium-emphasis pa-4">Sem resíduos cadastrados.</td>
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
}

@media (max-width: 767px) {
  .manifest-detail-page {
    gap: 16px;
  }
}
</style>

