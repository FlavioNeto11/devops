<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useMtrProvisorioStore } from '../../stores/mtrProvisorioStore.js';
import {
  hasPrintedDocument,
  isCancellableStatus,
  isPrintableStatus,
  MTR_PROVISORIO_PROBLEM_CODES,
  statusLabel
} from './mtrProvisorioUiHelpers.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import { useNotification } from '../../composables/useNotification.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const store = useMtrProvisorioStore();
const notify = useNotification();
const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel, dialogCancelLabel,
  dialogDanger, dialogShowCancel, confirm, accept, cancel
} = useConfirmDialog();

const {
  selected,
  loadingDetail,
  detailError,
  detailErrorCode,
  commandLoading,
  commandError,
  commandErrorCode,
  loadById,
  cancelSelected,
  printSelected,
  clearCommandState
} = store;

const id = computed(() => String(route.params.id || '').trim());

const cancellable = computed(() => isCancellableStatus(selected.value?.status));
const printable = computed(() => isPrintableStatus(selected.value?.status));
const documentReady = computed(() => hasPrintedDocument(selected.value));

const sessionContextId = computed(() =>
  String(authStore.sessionContext.value?.sessionContextId || authStore.sessionContext.value?.id || '').trim()
);

const persistencePending = computed(() => {
  if (detailErrorCode.value === MTR_PROVISORIO_PROBLEM_CODES.PERSISTENCE_NOT_IMPLEMENTED) return true;
  if (commandErrorCode.value === MTR_PROVISORIO_PROBLEM_CODES.PERSISTENCE_NOT_IMPLEMENTED) return true;
  if (commandError.value && /MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED/i.test(commandError.value)) return true;
  if (detailError.value && /MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED/i.test(detailError.value)) return true;
  return false;
});

const summaryItems = computed(() => {
  const mtr = selected.value;
  if (!mtr) return [];
  return [
    { label: 'Tipo', value: mtr.kind || 'provisorio' },
    { label: 'Manifesto definitivo', value: mtr.definitiveManifestId || '-' },
    { label: 'Versão', value: mtr.version ?? '-' },
    { label: 'Correlation', value: mtr.correlationId || '-' },
    { label: 'Criado em', value: mtr.createdAt ? new Date(mtr.createdAt).toLocaleString('pt-BR') : '-' },
    { label: 'Atualizado em', value: mtr.updatedAt ? new Date(mtr.updatedAt).toLocaleString('pt-BR') : '-' },
    { label: 'Último erro', value: mtr.lastErrorCode || '-' },
    { label: 'Status físico', value: statusLabel(mtr.status) }
  ];
});

watch(id, async (next) => {
  if (next) await loadById(next);
}, { immediate: false });

onMounted(async () => {
  if (id.value) await loadById(id.value);
});

async function handlePrint() {
  const ok = await confirm({
    title: 'Imprimir MTR provisório',
    message: 'Enfileira a impressão (kind=provisorio). O worker baixa o documento via gateway e disponibiliza para download.',
    confirmLabel: 'Confirmar impressão'
  });
  if (!ok) return;

  clearCommandState();
  try {
    await printSelected({ sessionContextId: sessionContextId.value });
    notify.success('Impressão enfileirada com sucesso.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleCancel() {
  const ok = await confirm({
    title: 'Cancelar rascunho',
    message: 'Cancela um MTR provisório local (draft) antes da submissão à CETESB. Ação síncrona.',
    confirmLabel: 'Confirmar cancelamento',
    cancelLabel: 'Voltar',
    danger: true
  });
  if (!ok) return;

  clearCommandState();
  try {
    await cancelSelected();
    notify.success('Rascunho cancelado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

function goBack() {
  router.push('/mtr-provisorio');
}
</script>

<template>
  <SicatPageLayout :loading="loadingDetail && !selected" :error="!persistencePending ? detailError : null">
    <template #header>
      <SicatPageHeader
        kicker="MTR Provisório · Detalhe"
        :title="selected?.id || 'Carregando…'"
        :description="selected?.provisionalNumber ? `Nº provisório: ${selected.provisionalNumber}` : ''"
      >
        <template #actions>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-printer" :disabled="!printable" :loading="commandLoading" @click="handlePrint">Imprimir</v-btn>
          <v-btn color="error" variant="tonal" prepend-icon="mdi-cancel" :disabled="!cancellable" @click="handleCancel">Cancelar rascunho</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="persistencePending"
        tone="warning"
        title="Persistência MTR provisório pendente"
        message="O backend respondeu MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED (501) — a fase 05 (postgres-queue-mtr) precisa estar publicada e migrada em runtime."
      />
    </template>

    <div v-if="selected" class="mtrp-detail__badges">
      <SicatStatusBadge :status="selected.status" :label="statusLabel(selected.status)" domain="manifest" with-dot />
      <v-chip v-if="documentReady" size="small" color="success" variant="tonal" prepend-icon="mdi-file-pdf-box">Documento disponível</v-chip>
      <v-chip v-if="selected.attempts != null" size="small" variant="tonal">Tentativas: {{ selected.attempts }}</v-chip>
    </div>

    <SicatCard v-if="selected" title="Resumo">
      <div class="mtrp-detail__summary">
        <div v-for="item in summaryItems" :key="item.label" class="mtrp-detail__summary-item">
          <span class="mtrp-detail__summary-label">{{ item.label }}</span>
          <strong class="mtrp-detail__summary-value">{{ item.value }}</strong>
        </div>
      </div>
    </SicatCard>

    <SicatCard v-if="selected?.payload" title="Payload" flush-body>
      <pre class="mtrp-detail__payload">{{ JSON.stringify(selected.payload, null, 2) }}</pre>
    </SicatCard>

    <SicatConfirmDialog
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
  </SicatPageLayout>
</template>

<style scoped>
.mtrp-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mtrp-detail__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
}

.mtrp-detail__summary-item {
  display: grid;
  gap: 2px;
}

.mtrp-detail__summary-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 700;
}

.mtrp-detail__summary-value {
  font-size: 0.95rem;
  color: rgba(var(--v-theme-on-surface), 0.9);
  word-break: break-word;
}

.mtrp-detail__payload {
  background: rgba(var(--v-theme-on-surface), 0.04);
  padding: 14px;
  font-family: var(--font-family-mono);
  font-size: 12px;
  max-height: 360px;
  overflow: auto;
  margin: 0;
}
</style>
