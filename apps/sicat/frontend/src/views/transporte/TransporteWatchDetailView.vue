<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useWatchStore } from '../../stores/watchStore.js';
import { useNotification } from '../../composables/useNotification.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import {
  formatDateTimeBR,
  IMPLEMENTATION_STATE_OPTIONS,
  watchEventLabel,
  watchItemIsApplicable,
  watchItemIsReviewable,
  watchItemStatusLabel
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatStatusTimeline from '../../components/sicat/SicatStatusTimeline.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';

/**
 * Detalhe de UM item do Regulatory Watch (DL-103, PR-H1/PR-H2). Revisar
 * (aprovar/rejeitar) só aparece em `human_review`; Aplicar só aparece em
 * `approved` — a versão criada nasce SEMPRE `blocking=false` (a promoção a
 * bloqueante é ato separado, em TransporteRegrasView).
 */

const route = useRoute();
const router = useRouter();
const store = useWatchStore();
const notify = useNotification();
const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel, dialogCancelLabel,
  dialogDanger, dialogShowCancel, confirm, accept, cancel
} = useConfirmDialog();

const { selected, loadingDetail, detailError, commandLoading, commandError, loadById, revisar, aplicar, clearCommandState } = store;

const itemId = computed(() => String(route.params.itemId || '').trim());

const timelineSteps = computed(() => {
  const events = selected.value?.events || [];
  return events.map((event) => ({
    title: watchEventLabel(event.eventType),
    description: event.detail && Object.keys(event.detail).length ? JSON.stringify(event.detail) : '',
    timestamp: formatDateTimeBR(event.createdAt),
    state: 'done'
  }));
});

const reviewable = computed(() => watchItemIsReviewable(selected.value?.status));
const applicable = computed(() => watchItemIsApplicable(selected.value?.status));

// --- Revisar --------------------------------------------------------------

const reviewNotes = ref('');

async function handleReview(decision) {
  const ok = await confirm({
    title: decision === 'approved' ? 'Aprovar item' : 'Rejeitar item',
    message: decision === 'approved'
      ? 'A mudança é confirmada contra a fonte oficial e segue disponível para "Aplicar" (cria uma versão de regra não-bloqueante).'
      : 'A mudança é descartada — não vira versão de regra.',
    confirmLabel: decision === 'approved' ? 'Aprovar' : 'Rejeitar',
    danger: decision === 'rejected'
  });
  if (!ok) return;

  clearCommandState();
  try {
    await revisar({ decision, notes: reviewNotes.value.trim() || undefined });
    notify.success(decision === 'approved' ? 'Item aprovado.' : 'Item rejeitado.');
    reviewNotes.value = '';
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// --- Aplicar ----------------------------------------------------------------

const applyForm = reactive({
  ruleCode: '',
  versionLabel: '',
  effectiveFrom: '',
  implementationState: 'ACTIVE',
  summary: '',
  legalBasisReference: ''
});

function resetApplyForm() {
  Object.assign(applyForm, {
    ruleCode: '',
    versionLabel: '',
    effectiveFrom: '',
    implementationState: 'ACTIVE',
    summary: '',
    legalBasisReference: ''
  });
}

async function handleApply() {
  if (!applyForm.ruleCode.trim() || !applyForm.versionLabel.trim() || !applyForm.effectiveFrom || !applyForm.summary.trim()) {
    notify.warning('Preencha código da regra, rótulo da versão, vigência e resumo.');
    return;
  }

  const ok = await confirm({
    title: 'Aplicar ao catálogo',
    message: `Cria a versão "${applyForm.versionLabel.trim()}" de ${applyForm.ruleCode.trim()} — SEMPRE não-bloqueante (blocking=false). Promover a bloqueante é uma ação separada, em Regras regulatórias.`,
    confirmLabel: 'Aplicar'
  });
  if (!ok) return;

  clearCommandState();
  try {
    const payload = {
      ruleCode: applyForm.ruleCode.trim(),
      versionLabel: applyForm.versionLabel.trim(),
      effectiveFrom: applyForm.effectiveFrom,
      implementationState: applyForm.implementationState,
      summary: applyForm.summary.trim()
    };
    if (applyForm.legalBasisReference.trim()) {
      payload.legalBasisAdditions = [{ reference: applyForm.legalBasisReference.trim() }];
    }
    await aplicar(payload);
    notify.success('Item aplicado — nova versão de regra criada (não-bloqueante).');
    resetApplyForm();
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

function goBack() {
  router.push('/transporte/watch');
}

watch(itemId, async (next) => {
  if (next) await loadById(next);
});

onMounted(async () => {
  if (itemId.value) await loadById(itemId.value);
});
</script>

<template>
  <SicatPageLayout :loading="loadingDetail && !selected" :error="detailError">
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Regulatory Watch"
        :title="selected?.sourceId || 'Carregando…'"
        :description="selected ? `Item ${selected.id}` : ''"
      >
        <template #actions>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <div v-if="selected" class="transp-watch__badges">
      <SicatStatusBadge :status="selected.status" :label="watchItemStatusLabel(selected.status)" domain="watch-item" with-dot />
    </div>

    <SicatCard v-if="selected" title="Mudança detectada" subtitle="Fato bruto — nunca uma interpretação.">
      <div class="transp-watch__summary">
        <div><span>Hash anterior</span><strong>{{ selected.detectedChange?.previousHash || '-' }}</strong></div>
        <div><span>Hash novo</span><strong>{{ selected.detectedChange?.newHash || '-' }}</strong></div>
        <div><span>HTTP status</span><strong>{{ selected.detectedChange?.httpStatus ?? '-' }}</strong></div>
        <div><span>ETag</span><strong>{{ selected.detectedChange?.etag || '-' }}</strong></div>
        <div><span>Last-Modified</span><strong>{{ selected.detectedChange?.lastModified || '-' }}</strong></div>
      </div>
    </SicatCard>

    <SicatCard v-if="selected" title="Análise de IA" subtitle="Resumo mínimo — nunca uma decisão.">
      <div v-if="selected.aiAnalysis?.summary" class="transp-watch__ai">
        <p>{{ selected.aiAnalysis.summary }}</p>
        <span class="text-caption text-medium-emphasis">
          Modelo: {{ selected.aiAnalysis.model || '-' }} · Analisado em: {{ formatDateTimeBR(selected.aiAnalysis.analyzedAt) }}
        </span>
      </div>
      <SicatEmptyState v-else title="Análise pulada" description="Nenhuma análise de IA registrada para este item." icon="mdi-robot-off-outline" compact />
    </SicatCard>

    <SicatCard v-if="selected && reviewable" title="Revisar" variant="system">
      <div class="transp-watch__review">
        <v-textarea
          v-model="reviewNotes"
          label="Notas da revisão (opcional)"
          rows="2"
          auto-grow
          density="comfortable"
          variant="outlined"
          hide-details="auto"
        />
        <div class="transp-watch__review-actions">
          <v-btn color="error" variant="tonal" :loading="commandLoading" prepend-icon="mdi-close" @click="handleReview('rejected')">
            Rejeitar
          </v-btn>
          <v-btn color="success" variant="flat" :loading="commandLoading" prepend-icon="mdi-check" @click="handleReview('approved')">
            Aprovar
          </v-btn>
        </div>
      </div>
    </SicatCard>

    <SicatCard v-if="selected && applicable" title="Aplicar ao catálogo" subtitle="Cria uma nova versão de regra — SEMPRE não-bloqueante.">
      <div class="transp-watch__apply">
        <v-text-field v-model="applyForm.ruleCode" label="Código da regra (ex.: TR-PMF-002)" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="applyForm.versionLabel" label="Rótulo da versão" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="applyForm.effectiveFrom" label="Vigente a partir de" type="date" density="comfortable" variant="outlined" hide-details="auto" />
        <v-select
          v-model="applyForm.implementationState"
          :items="IMPLEMENTATION_STATE_OPTIONS.filter((o) => o.value)"
          item-title="label"
          item-value="value"
          label="Estado de implementação"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
        />
        <v-text-field v-model="applyForm.legalBasisReference" label="Base legal adicional (opcional)" density="comfortable" variant="outlined" hide-details="auto" />
        <v-textarea
          v-model="applyForm.summary"
          label="Resumo da mudança"
          rows="2"
          auto-grow
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          class="transp-watch__apply-full"
        />
      </div>
      <template #actions>
        <v-btn color="primary" variant="flat" :loading="commandLoading" @click="handleApply">Aplicar</v-btn>
      </template>
    </SicatCard>

    <SicatCard v-if="selected" title="Trilha de eventos">
      <SicatStatusTimeline v-if="timelineSteps.length" :steps="timelineSteps" />
      <SicatEmptyState v-else title="Sem eventos" icon="mdi-timeline-outline" compact />
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
.transp-watch__badges {
  display: flex;
  gap: 8px;
}

.transp-watch__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
}

.transp-watch__summary > div {
  display: grid;
  gap: 2px;
}

.transp-watch__summary span {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 700;
}

.transp-watch__summary strong {
  font-size: 0.88rem;
  word-break: break-all;
}

.transp-watch__ai p {
  margin: 0 0 6px;
}

.transp-watch__review {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.transp-watch__review-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.transp-watch__apply {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
}

.transp-watch__apply-full {
  grid-column: 1 / -1;
}
</style>
