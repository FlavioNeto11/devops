<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { enqueueCdfGenerate, getCdfResponsibles, getManifestById, listManifests } from '../services/api.js';
import { useCdfOperationalContext } from '../composables/useCdfOperationalContext.js';
import SicatPageHeader from '../components/shell/SicatPageHeader.vue';
import SicatStatusBadge from '../components/sicat/SicatStatusBadge.vue';
import SicatCard from '../components/sicat/SicatCard.vue';
import SicatDataTable from '../components/sicat/SicatDataTable.vue';
import SicatFormSection from '../components/sicat/SicatFormSection.vue';
import SicatFormField from '../components/sicat/SicatFormField.vue';
import SicatInlineAlert from '../components/sicat/SicatInlineAlert.vue';

const route = useRoute();
const router = useRouter();

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatLocalDateInput(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toStartOfDayIso(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const candidate = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
}

function toEndOfDayIso(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const candidate = new Date(`${normalized}T23:59:59.999`);
  return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
}

function toNoonIso(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';

  // Meio-dia evita deslocamento de dia por fuso ao converter a data (dia) para ISO.
  const candidate = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
}

function toIntegerOrNull(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeDocument(documentValue) {
  return String(documentValue || '').replaceAll(/\D/g, '');
}

function resolveManifestIdentifier(manifest) {
  return String(
    manifest?.id
    || manifest?.manifestId
    || manifest?.entityId
    || manifest?.manifestNumber
    || manifest?.externalCode
    || ''
  ).trim();
}

function resolveManifestIdentifiers(manifest) {
  const externalReference = manifest?.externalReference || manifest?.externalSnapshot || {};
  const externalSnapshot = manifest?.externalSnapshot || {};

  return {
    manCodigo: externalReference?.manCodigo ?? externalSnapshot?.manCodigo ?? null,
    manNumero: externalReference?.manNumero ?? externalSnapshot?.manNumero ?? null,
    manHashCode: manifest?.externalHashCode || externalSnapshot?.manHashCode || null
  };
}

function resolveManifestSnapshot(manifest) {
  if (!manifest) {
    return null;
  }

  const identifiers = resolveManifestIdentifiers(manifest);
  const generatorDocument = normalizeDocument(manifest?.generator?.document);

  return {
    ...identifiers,
    parceiroGerador: generatorDocument ? { parCnpj: generatorDocument } : undefined
  };
}

function formatManifestLabel(manifest) {
  return String(manifest?.manifestNumber || manifest?.externalCode || resolveManifestIdentifier(manifest) || 'manifesto').trim();
}

function normalizedStatusValue(manifest) {
  return `${String(manifest?.status || '').toLowerCase()} ${String(manifest?.externalStatus || '').toLowerCase()}`.trim();
}

function hasIssuedCdfReference(manifest) {
  const externalSnapshot = manifest?.externalSnapshot || {};
  const externalReference = manifest?.externalReference || {};

  return [
    manifest?.cdfEmitidoNumero,
    externalSnapshot?.cdfEmitidoNumero,
    externalReference?.cdfEmitidoNumero,
    manifest?.certificateCode,
    manifest?.certificateId
  ].some((value) => String(value ?? '').trim());
}

function describeCdfManifestRestriction(manifest, hasRemoteIdentity) {
  const status = normalizedStatusValue(manifest);
  const alreadyCancelled = status.includes('cancel');
  const hasFailure = status.includes('fail') || status.includes('erro') || status.includes('error') || status.includes('dlq');

  if (!hasRemoteIdentity) {
    return 'Ainda não sincronizado com a CETESB. Use “Atualizar da CETESB”.';
  }

  if (hasIssuedCdfReference(manifest)) {
    return 'Este manifesto já tem um certificado (CDF).';
  }

  if (alreadyCancelled) {
    return 'Este manifesto foi cancelado.';
  }

  if (hasFailure) {
    return 'Este manifesto teve um problema. Reenvie antes de gerar o certificado.';
  }

  if (!status.includes('receb')) {
    return 'Ainda não foi recebido. O certificado só sai depois do recebimento.';
  }

  return '';
}

const {
  activeAccount,
  integrationAccountId,
  sessionContextId,
  contextReady,
  requestedBy,
  ensureOperationalContext
} = useCdfOperationalContext();

// Pré-seleção por query: ?manifestIds=id1,id2 (lote, vindo da tela de manifestos) e/ou ?manifestId=id (único).
const requestedManifestIds = computed(() => {
  const raw = `${String(route.query.manifestIds || '')},${String(route.query.manifestId || '')}`;
  return Array.from(new Set(raw.split(',').map((id) => id.trim()).filter(Boolean)));
});

const cdfForm = reactive({
  issueAt: formatLocalDateInput(new Date()),
  dateFrom: '',
  dateTo: formatLocalDateInput(new Date()),
  responsibleCode: null,
  observation: ''
});

const cdfResponsibles = ref([]);
const cdfResponsiblesLoading = ref(false);
const cdfResponsiblesError = ref('');

const cdfResponsibleOptions = computed(() => (Array.isArray(cdfResponsibles.value) ? cdfResponsibles.value : [])
  .map((resp) => ({
    value: resp?.cdrCodigo,
    title: resp?.cargo ? `${resp?.name || '—'} — ${resp.cargo}` : (resp?.name || `Responsável ${resp?.cdrCodigo}`)
  }))
  .filter((option) => option.value != null && option.value !== ''));

const manifests = ref([]);
const manifestsLoading = ref(false);
const manifestsLoaded = ref(false);
const manifestsError = ref('');
const manifestsFeedback = ref('');
const selectedManifestIds = ref([]);
const cdfFeedback = ref('');
const cdfFeedbackError = ref('');
const cdfLoading = ref(false);

const selectedManifestEntries = computed(() => (Array.isArray(manifests.value) ? manifests.value : [])
  .filter((manifest) => selectedManifestIds.value.includes(resolveManifestIdentifier(manifest)))
  .map((manifest) => {
    const snapshot = resolveManifestSnapshot(manifest);
    const hasRemoteIdentity = Boolean(snapshot?.manCodigo || snapshot?.manNumero || snapshot?.manHashCode);
    const reason = describeCdfManifestRestriction(manifest, hasRemoteIdentity);
    const eligible = hasRemoteIdentity && !reason;

    return {
      manifest,
      snapshot,
      eligible,
      reason,
      manifestId: resolveManifestIdentifier(manifest),
      manifestLabel: formatManifestLabel(manifest)
    };
  }));

const selectedManifestSnapshots = computed(() => selectedManifestEntries.value
  .filter((entry) => entry.eligible && entry.snapshot)
  .map((entry) => entry.snapshot));

const selectedManifestCount = computed(() => selectedManifestEntries.value.length);
const eligibleManifestCount = computed(() => selectedManifestSnapshots.value.length);
const blockedManifestCount = computed(() => selectedManifestCount.value - eligibleManifestCount.value);

const candidateManifestEntries = computed(() => (Array.isArray(manifests.value) ? manifests.value : []).map((manifest) => {
  const snapshot = resolveManifestSnapshot(manifest);
  const hasRemoteIdentity = Boolean(snapshot?.manCodigo || snapshot?.manNumero || snapshot?.manHashCode);
  const reason = describeCdfManifestRestriction(manifest, hasRemoteIdentity);
  const eligible = hasRemoteIdentity && !reason;
  const manifestId = resolveManifestIdentifier(manifest);

  return {
    manifest,
    snapshot,
    eligible,
    reason,
    manifestId,
    manifestLabel: formatManifestLabel(manifest),
    selected: selectedManifestIds.value.includes(manifestId)
  };
}));

const eligibleCandidates = computed(() => candidateManifestEntries.value.filter((entry) => entry.eligible));
const blockedCandidates = computed(() => candidateManifestEntries.value.filter((entry) => !entry.eligible));

const candidateTableHeaders = [
  { title: 'Sel.', key: 'select', sortable: false, width: '64' },
  { title: 'MTR', key: 'mtr', sortable: false },
  { title: 'Gerador', key: 'generator', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Condição', key: 'condition', sortable: false },
  { title: 'Ação', key: 'actions', sortable: false, align: 'end' }
];

const candidateTableRows = computed(() => candidateManifestEntries.value.map((entry) => ({
  id: entry.manifestId,
  manifestId: entry.manifestId,
  mtr: entry.manifestLabel,
  generator: entry.manifest?.generator?.description || '-',
  status: entry.manifest?.externalStatus || entry.manifest?.status || '-',
  eligible: entry.eligible,
  reason: entry.reason,
  selected: entry.selected
})));
const allEligibleSelected = computed(() => {
  const ids = eligibleCandidates.value.map((entry) => entry.manifestId).filter(Boolean);
  if (!ids.length) {
    return false;
  }

  return ids.every((id) => selectedManifestIds.value.includes(id));
});

const generatorPartners = computed(() => {
  const seen = new Set();

  return selectedManifestEntries.value
    .map((entry) => normalizeDocument(entry.manifest?.generator?.document))
    .filter(Boolean)
    .filter((document) => {
      if (seen.has(document)) {
        return false;
      }

      seen.add(document);
      return true;
    })
    .map((document) => ({ parCnpj: document }));
});

const receiverPartnerCode = computed(() => {
  const activePartnerCode = toIntegerOrNull(activeAccount.value?.partnerCode);
  if (activePartnerCode) {
    return activePartnerCode;
  }

  return toIntegerOrNull(selectedManifestEntries.value[0]?.manifest?.receiver?.partnerCode);
});

const receiverPartnerLabel = computed(() => {
  const accountName = String(activeAccount.value?.partnerName || '').trim();
  const manifestReceiver = String(selectedManifestEntries.value[0]?.manifest?.receiver?.description || '').trim();
  return accountName || manifestReceiver || 'Destinador ativo';
});

function mergeManifests(items) {
  const next = [];
  const seen = new Set();

  for (const manifest of items) {
    const id = resolveManifestIdentifier(manifest);
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    next.push(manifest);
  }

  return next;
}

async function appendRequestedManifest(items = []) {
  const merged = [...items];
  const requestedIds = requestedManifestIds.value;
  if (!requestedIds.length) {
    return merged;
  }

  for (const requestedId of requestedIds) {
    const alreadyLoaded = merged.some((manifest) => resolveManifestIdentifier(manifest) === requestedId);
    if (alreadyLoaded) {
      continue;
    }

    try {
      const detail = await getManifestById(requestedId);
      if (detail) {
        merged.unshift(detail);
      }
    } catch {
      manifestsFeedback.value = `Nao foi possivel carregar automaticamente o manifesto ${requestedId}.`;
    }
  }

  return merged;
}

function selectRequestedManifestIfPresent(items = []) {
  const requestedIds = requestedManifestIds.value;
  if (!requestedIds.length) {
    return;
  }

  const presentIds = requestedIds.filter((requestedId) => items.some((manifest) => resolveManifestIdentifier(manifest) === requestedId));
  if (presentIds.length) {
    selectedManifestIds.value = Array.from(new Set([...selectedManifestIds.value, ...presentIds]));
  }
}

async function loadManifestCandidates(options = {}) {
  const { includeRequestedManifest = true } = options;

  manifestsLoading.value = true;
  manifestsError.value = '';
  manifestsFeedback.value = '';

  try {
    await ensureOperationalContext();

    const response = await listManifests({
      integrationAccountId: integrationAccountId.value,
      sessionContextId: sessionContextId.value,
      page: 1,
      pageSize: 120
    });

    const baseItems = Array.isArray(response?.items) ? response.items : [];
    const merged = includeRequestedManifest ? await appendRequestedManifest(baseItems) : [...baseItems];

    manifests.value = mergeManifests(merged);
    manifestsLoaded.value = true;

    if (!manifests.value.length) {
      manifestsFeedback.value = 'Nenhum manifesto encontrado para a conta ativa.';
    }

    selectRequestedManifestIfPresent(manifests.value);
  } catch (error) {
    manifestsError.value = error?.message || 'Falha ao carregar manifestos para geracao de CDF.';
    manifests.value = [];
    manifestsLoaded.value = true;
  } finally {
    manifestsLoading.value = false;
  }
}

function toggleManifestSelection(manifestId) {
  if (!manifestId) {
    return;
  }

  if (selectedManifestIds.value.includes(manifestId)) {
    selectedManifestIds.value = selectedManifestIds.value.filter((id) => id !== manifestId);
    return;
  }

  selectedManifestIds.value = [...selectedManifestIds.value, manifestId];
}

function toggleAllEligibleManifests() {
  if (allEligibleSelected.value) {
    const eligibleIds = new Set(eligibleCandidates.value.map((entry) => entry.manifestId));
    selectedManifestIds.value = selectedManifestIds.value.filter((id) => !eligibleIds.has(id));
    return;
  }

  const next = new Set(selectedManifestIds.value);
  eligibleCandidates.value.forEach((entry) => next.add(entry.manifestId));
  selectedManifestIds.value = Array.from(next);
}

function openManifest(manifestId) {
  if (!manifestId) {
    return;
  }

  router.push(`/manifestos/${manifestId}`);
}

async function loadCdfResponsibles() {
  cdfResponsiblesLoading.value = true;
  cdfResponsiblesError.value = '';

  try {
    await ensureOperationalContext();
    const response = await getCdfResponsibles({
      integrationAccountId: integrationAccountId.value,
      sessionContextId: sessionContextId.value
    });
    cdfResponsibles.value = Array.isArray(response?.items) ? response.items : [];
    if (!cdfResponsibles.value.length) {
      cdfResponsiblesError.value = 'Nenhum responsável pela emissão de CDF cadastrado para esta conta na CETESB.';
    }
  } catch (error) {
    cdfResponsiblesError.value = error?.message || 'Falha ao carregar responsáveis pela emissão de CDF.';
    cdfResponsibles.value = [];
  } finally {
    cdfResponsiblesLoading.value = false;
  }
}

async function submitCdfGenerate() {
  cdfLoading.value = true;
  cdfFeedback.value = '';
  cdfFeedbackError.value = '';

  try {
    await ensureOperationalContext();

    if (!receiverPartnerCode.value) {
      throw new Error('Nao foi possivel identificar o destinador ativo para gerar o CDF.');
    }

    if (!eligibleManifestCount.value) {
      throw new Error('Selecione ao menos um manifesto elegivel para gerar o CDF.');
    }

    const responsibleCode = toIntegerOrNull(cdfForm.responsibleCode);
    if (!responsibleCode) {
      throw new Error('Selecione o responsavel pela emissao do CDF.');
    }

    const cerData = toNoonIso(cdfForm.issueAt);
    const cerDataInicial = toStartOfDayIso(cdfForm.dateFrom);
    const cerDataFinal = toEndOfDayIso(cdfForm.dateTo);

    if (!cerData || !cerDataInicial || !cerDataFinal) {
      throw new Error('Informe uma data de emissao e um periodo validos para o CDF.');
    }

    if (new Date(cerDataInicial) > new Date(cerDataFinal)) {
      throw new Error('A data inicial do CDF nao pode ser maior que a data final.');
    }

    const accepted = await enqueueCdfGenerate({
      integrationAccountId: integrationAccountId.value,
      sessionContextId: sessionContextId.value,
      requestedBy: requestedBy.value,
      cdfPayload: {
        cerData,
        cerDataInicial,
        cerDataFinal,
        cerObservacao: String(cdfForm.observation || '').trim() || undefined,
        parceiroDestinador: {
          parCodigo: receiverPartnerCode.value
        },
        parceiroAcesso: {
          paaCodigo: receiverPartnerCode.value,
          paaNome: receiverPartnerLabel.value
        },
        tipoCertificadoDestinacao: 9,
        listaManifesto: selectedManifestSnapshots.value,
        listaParceiroGerador: generatorPartners.value,
        responsavel: {
          cdrCodigo: responsibleCode
        }
      }
    });

    cdfFeedback.value = `Geracao de CDF solicitada para ${eligibleManifestCount.value} manifesto(s). Job ${accepted.jobId} criado com sucesso.`;
    await loadManifestCandidates({ includeRequestedManifest: true });
  } catch (error) {
    cdfFeedbackError.value = error?.message || 'Falha ao solicitar geracao de CDF.';
  } finally {
    cdfLoading.value = false;
  }
}

watch(
  () => manifests.value,
  (items) => {
    const validIds = new Set((Array.isArray(items) ? items : []).map((manifest) => resolveManifestIdentifier(manifest)).filter(Boolean));
    selectedManifestIds.value = selectedManifestIds.value.filter((id) => validIds.has(id));
  },
  { deep: true }
);

watch(requestedManifestIds, () => {
  if (!contextReady.value) {
    return;
  }

  void loadManifestCandidates({ includeRequestedManifest: true });
}, { deep: true });

watch(
  contextReady,
  (ready) => {
    if (!ready) {
      return;
    }

    void loadManifestCandidates({ includeRequestedManifest: true });
    void loadCdfResponsibles();
  },
  { immediate: true }
);

onMounted(() => {
  if (contextReady.value) {
    void loadManifestCandidates({ includeRequestedManifest: true });
    void loadCdfResponsibles();
  }
});
</script>

<template>
  <v-container class="cdf-create-view py-6" fluid>
    <SicatPageHeader
      kicker="Certificados · CDF"
      title="Gerar CDF"
      description="Selecione manifestos elegíveis, valide bloqueios e solicite a emissão de novo Certificado de Destinação Final."
      compact
    />

    <SicatCard
      class="mt-4"
      title="Manifestos para emissão"
      subtitle="Fluxo operacional de criação. Esta rota não exibe listagem de CDF emitido."
    >
      <template #header-actions>
        <div class="cdf-create-view__chips">
          <span class="cdf-create-view__chip">Candidatos: {{ candidateManifestEntries.length }}</span>
          <span class="cdf-create-view__chip">Elegíveis: {{ eligibleCandidates.length }}</span>
          <span class="cdf-create-view__chip warning">Bloqueados: {{ blockedCandidates.length }}</span>
        </div>
      </template>

      <SicatInlineAlert v-if="requestedManifestIds.length" tone="info" :message="`Pré-seleção via link para ${requestedManifestIds.length} manifesto(s): ${requestedManifestIds.join(', ')}.`" class="mb-2" />
      <SicatInlineAlert v-if="!contextReady" tone="warning" message="O contexto operacional CETESB ainda não está pronto para geração de CDF." class="mb-2" />
      <SicatInlineAlert v-if="manifestsFeedback" tone="info" :message="manifestsFeedback" class="mb-2" />
      <SicatInlineAlert v-if="manifestsError" tone="error" :message="manifestsError" class="mb-2" />

      <div class="cdf-create-view__table-actions">
        <v-btn variant="tonal" size="small" :loading="manifestsLoading" :disabled="manifestsLoading || !contextReady" @click="loadManifestCandidates({ includeRequestedManifest: true })">Atualizar manifestos</v-btn>
        <v-btn variant="outlined" size="small" :disabled="!eligibleCandidates.length" @click="toggleAllEligibleManifests">{{ allEligibleSelected ? 'Limpar elegíveis' : 'Selecionar todos elegíveis' }}</v-btn>
      </div>

      <SicatDataTable
        :headers="candidateTableHeaders"
        :items="candidateTableRows"
        :loading="manifestsLoading"
        density="compact"
        :empty="{ title: 'Nenhum manifesto disponível', description: 'Não há manifestos para avaliação.', icon: 'mdi-file-search-outline' }"
      >
        <template #[`item.select`]="{ item }">
          <v-checkbox-btn :model-value="item.selected" density="compact" @update:model-value="toggleManifestSelection(item.manifestId)" />
        </template>
        <template #[`item.condition`]="{ item }">
          <SicatStatusBadge :tone="item.eligible ? 'success' : 'error'" :label="item.eligible ? 'Elegível' : item.reason" />
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn variant="text" size="small" @click="openManifest(item.manifestId)">Ver detalhe</v-btn>
        </template>
      </SicatDataTable>

      <section class="cdf-create-view__summary">
        <h4>Resumo da seleção</h4>
        <p class="text-medium-emphasis">
          Selecionados: {{ selectedManifestCount }} · Elegíveis: {{ eligibleManifestCount }} · Bloqueados: {{ blockedManifestCount }}
        </p>
        <ul v-if="blockedManifestCount" class="cdf-create-view__blocked-list">
          <li v-for="entry in selectedManifestEntries.filter((item) => !item.eligible)" :key="`blocked-${entry.manifestId}`">
            {{ entry.manifestLabel }}: {{ entry.reason }}
          </li>
        </ul>
      </section>

      <SicatFormSection title="Dados da emissão" class="mt-4">
        <SicatFormField label="Data da emissão">
          <template #default="{ id }">
            <v-text-field :id="id" v-model="cdfForm.issueAt" type="date" density="comfortable" variant="outlined" hide-details="auto" :disabled="cdfLoading" />
          </template>
        </SicatFormField>
        <SicatFormField label="Responsável pela emissão">
          <template #default="{ id }">
            <v-select :id="id" v-model="cdfForm.responsibleCode" :items="cdfResponsibleOptions" item-title="title" item-value="value" :loading="cdfResponsiblesLoading" :disabled="cdfLoading || cdfResponsiblesLoading" placeholder="Selecione o responsável" density="comfortable" variant="outlined" hide-details="auto" no-data-text="Nenhum responsável disponível" />
          </template>
        </SicatFormField>
        <SicatFormField label="Data inicial" hint="Início do período dos manifestos cobertos pelo certificado.">
          <template #default="{ id }">
            <v-text-field :id="id" v-model="cdfForm.dateFrom" type="date" density="comfortable" variant="outlined" hide-details="auto" :disabled="cdfLoading" />
          </template>
        </SicatFormField>
        <SicatFormField label="Data final">
          <template #default="{ id }">
            <v-text-field :id="id" v-model="cdfForm.dateTo" type="date" density="comfortable" variant="outlined" hide-details="auto" :disabled="cdfLoading" />
          </template>
        </SicatFormField>
        <SicatFormField label="Observação" full-width>
          <template #default="{ id }">
            <v-textarea :id="id" v-model="cdfForm.observation" rows="3" density="comfortable" variant="outlined" hide-details="auto" :disabled="cdfLoading" />
          </template>
        </SicatFormField>
      </SicatFormSection>

      <SicatInlineAlert v-if="cdfResponsiblesError" tone="warning" :message="cdfResponsiblesError" class="mt-2" />
      <SicatInlineAlert v-if="cdfFeedback" tone="success" :message="cdfFeedback" class="mt-2" />
      <SicatInlineAlert v-if="cdfFeedbackError" tone="error" :message="cdfFeedbackError" class="mt-2" />

      <div class="cdf-create-view__actions-row mt-3">
        <v-btn color="primary" variant="flat" :loading="cdfLoading" :disabled="cdfLoading || !contextReady || !eligibleManifestCount" @click="submitCdfGenerate">Gerar CDF</v-btn>
        <span class="cdf-create-view__hint">O backend revalida a elegibilidade remota antes de emitir o certificado.</span>
      </div>
    </SicatCard>
  </v-container>
</template>

<style scoped>
.cdf-create-view__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.cdf-create-view__panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.cdf-create-view__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.cdf-create-view__chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface) 90%);
  color: var(--color-primary);
  font-size: 0.75rem;
  font-weight: 700;
}

.cdf-create-view__chip.warning {
  background: color-mix(in srgb, var(--color-warning) 14%, var(--color-surface) 86%);
  color: color-mix(in srgb, var(--color-warning) 72%, var(--color-text) 28%);
}

.cdf-create-view__body {
  display: grid;
  gap: 14px;
}

.cdf-create-view__feedback {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 62%, transparent 38%);
}

.cdf-create-view__feedback.info {
  background: color-mix(in srgb, var(--color-surface-raised) 72%, var(--color-surface) 28%);
}

.cdf-create-view__feedback.success {
  border-color: color-mix(in srgb, var(--color-success) 28%, var(--color-border) 72%);
  background: color-mix(in srgb, var(--color-success) 10%, var(--color-surface) 90%);
}

.cdf-create-view__feedback.error {
  border-color: color-mix(in srgb, var(--color-error) 30%, var(--color-border) 70%);
  background: color-mix(in srgb, var(--color-error) 10%, var(--color-surface) 90%);
}

.cdf-create-view__table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.cdf-create-view__table-shell {
  overflow-x: auto;
}

.cdf-create-view__summary {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 62%, transparent 38%);
  background: color-mix(in srgb, var(--color-surface-raised) 72%, var(--color-surface) 28%);
}

.cdf-create-view__summary h4 {
  margin: 0;
}

.cdf-create-view__blocked-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
}

.cdf-create-view__form-grid {
  gap: 12px;
}

.cdf-create-view__form-span-2 {
  grid-column: span 2;
}

.cdf-create-view__actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.cdf-create-view__hint {
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

@media (max-width: 767px) {
  .cdf-create-view__panel-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .cdf-create-view__form-span-2 {
    grid-column: span 1;
  }
}
</style>
