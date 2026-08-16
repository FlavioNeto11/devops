<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useTransportePendenciasStore } from '../../stores/transportePendenciasStore.js';
import { useTransporteStore } from '../../stores/transporteStore.js';
import {
  cargoRegimeLabel,
  ciotAvailableAction,
  ciotEventLabel,
  ciotResponsiblePartyLabel,
  ciotStatusLabel,
  commandIcon,
  commandLabel,
  complianceAlertTone,
  complianceStatusLabel,
  dfeIssuanceEventLabel,
  dfeIssuanceStatusLabel,
  DFE_ISSUANCE_FEATURE_DISABLED_CODE,
  DFE_ISSUANCE_FEATURE_DISABLED_MESSAGE,
  fiscalAuthorizationStatusLabel,
  fiscalDocumentTypeLabel,
  fiscalIssueTone,
  fiscalValidationStatusLabel,
  formatCurrencyBRL,
  formatDateBR,
  formatDateTimeBR,
  FREIGHT_COMPONENTS,
  gateLabel,
  isDfeIssuanceTerminal,
  operationStatusLabel,
  pisoComplianceBadge,
  pisoOutcomeLabel,
  pisoTableCodeLabel,
  routedAvailableCommands,
  vpoApplicableLabel,
  vpoAllocationStatusLabel,
  vpoAvailableAction,
  vpoEventLabel,
  vpoEvidenceSourceLabel
} from './transporteUiHelpers.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import { useNotification } from '../../composables/useNotification.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatStatusTimeline from '../../components/sicat/SicatStatusTimeline.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';
// Card FILHO (onda F7): o ciclo de averbação tem estado próprio e esta tela já
// passa de 1100 linhas — ver o cabeçalho de OperacaoSeguroCard.vue.
import OperacaoSeguroCard from './OperacaoSeguroCard.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const store = useTransporteStore();
const notify = useNotification();
const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel, dialogCancelLabel,
  dialogDanger, dialogShowCancel, confirm, accept, cancel
} = useConfirmDialog();

const {
  selected,
  loadingDetail,
  detailError,
  complianceOverview,
  loadingCompliance,
  complianceError,
  commandLoading,
  commandError,
  commandErrorCode,
  loadById,
  loadCompliance,
  submitValidation,
  contract,
  reopen,
  cancel: cancelOperation,
  revalidateGate,
  clearCommandState,
  // Piso mínimo.
  pisoCalculations,
  loadingPiso,
  pisoError,
  loadPisoCalculations,
  calcularPiso,
  // CIOT.
  ciotState,
  loadingCiot,
  ciotError,
  loadCiot,
  preValidarCiot,
  solicitarCiot,
  retificarCiot,
  cancelarCiot,
  encerrarCiot,
  // VPO.
  vpoState,
  loadingVpo,
  vpoError,
  loadVpo,
  avaliarVpo,
  registrarAquisicaoVpo,
  adquirirVpo,
  // Documentos fiscais.
  fiscalDocuments,
  loadingFiscalDocuments,
  fiscalDocumentsError,
  loadFiscalDocuments,
  importarDocumentoFiscal,
  desvincularDocumentoFiscal,
  revalidarDocumentoFiscal,
  // Emissões.
  emissoes,
  loadingEmissoes,
  emissoesError,
  loadEmissoes,
  solicitarEmissao,
  cancelarEmissao
} = store;

const pendenciasStore = useTransportePendenciasStore();
const { vpoProviders, loadVpoProviders } = pendenciasStore;

const operationId = computed(() => String(route.params.operationId || '').trim());

const routedCommands = computed(() => routedAvailableCommands(selected.value?.availableCommands));
const hasCommand = (command) => routedCommands.value.includes(command);

const cancelReasonDraft = ref('');

const summaryItems = computed(() => {
  const operation = selected.value;
  if (!operation) return [];
  const originLabel = operation.route
    ? `${operation.route.originMunicipality}/${operation.route.originUf}`
    : '-';
  const destinationLabel = operation.route
    ? `${operation.route.destinationMunicipality}/${operation.route.destinationUf}`
    : '-';
  return [
    { label: 'Referência', value: operation.referenceCode || operation.id },
    { label: 'Regime de carga', value: cargoRegimeLabel(operation.cargoRegime) },
    { label: 'Rota', value: operation.route ? `${originLabel} → ${destinationLabel}` : 'Não informada' },
    { label: 'Moeda', value: operation.currency || '-' },
    { label: 'Forma de pagamento', value: operation.paymentMethod || '-' },
    { label: 'Prazo de pagamento', value: operation.paymentTermDays != null ? `${operation.paymentTermDays} dias` : '-' },
    { label: 'Criado em', value: formatDateTimeBR(operation.createdAt) },
    { label: 'Atualizado em', value: formatDateTimeBR(operation.updatedAt) }
  ];
});

const freightItems = computed(() => {
  const freight = selected.value?.freight || {};
  return FREIGHT_COMPONENTS.map(({ key, label }) => ({ key, label, value: formatCurrencyBRL(freight[key]) }));
});

async function loadAll(id) {
  if (!id) return;
  await loadById(id);
  await Promise.all([
    loadCompliance(id),
    loadPisoCalculations(id),
    loadCiot(id),
    loadVpo(id),
    loadFiscalDocuments(id),
    loadEmissoes(id),
    loadVpoProviders()
  ]);
}

watch(operationId, async (next) => {
  if (next) await loadAll(next);
}, { immediate: false });

onMounted(async () => {
  if (operationId.value) await loadAll(operationId.value);
});

function goBack() {
  router.push('/transporte/operacoes');
}

async function runCommand({ title, message, confirmLabel, danger = false, action, successMessage }) {
  const ok = await confirm({ title, message, confirmLabel, danger });
  if (!ok) return;

  clearCommandState();
  try {
    await action();
    notify.success(successMessage);
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

function handleSubmitValidation() {
  return runCommand({
    title: 'Submeter validação',
    message: 'Avalia o GATE_PROPOSAL e move a operação para "pronta para contratar" (sem bloqueio) ou "bloqueada" (com bloqueio), no mesmo request.',
    confirmLabel: 'Submeter validação',
    action: submitValidation,
    successMessage: 'Validação submetida.'
  });
}

function handleContract() {
  return runCommand({
    title: 'Contratar operação',
    message: 'Ativa o GATE_CONTRACT. Se o gate bloquear, a operação permanece em "pronta para contratar".',
    confirmLabel: 'Contratar',
    action: contract,
    successMessage: 'Operação contratada.'
  });
}

function handleReopen() {
  return runCommand({
    title: 'Reabrir operação',
    message: 'Volta a operação para rascunho para correção dos dados. Limpa o motivo de bloqueio atual.',
    confirmLabel: 'Reabrir',
    action: reopen,
    successMessage: 'Operação reaberta para correção.'
  });
}

async function handleCancel() {
  const reason = cancelReasonDraft.value.trim();
  if (!reason) {
    notify.warning('Informe o motivo do cancelamento antes de continuar.');
    return;
  }

  await runCommand({
    title: 'Cancelar operação',
    message: `Motivo informado: "${reason}". Esta ação não pode ser desfeita.`,
    confirmLabel: 'Confirmar cancelamento',
    danger: true,
    action: async () => {
      await cancelOperation({ reason });
      await loadCompliance(operationId.value);
    },
    successMessage: 'Operação cancelada.'
  });

  if (!commandError.value) {
    cancelReasonDraft.value = '';
  }
}

async function handleRevalidateGate(gate) {
  clearCommandState();
  try {
    await revalidateGate(gate);
    notify.success(`Conformidade de ${gateLabel(gate)} revalidada.`);
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// ---------------------------------------------------------------------
// Piso mínimo de frete.
// ---------------------------------------------------------------------

const latestPisoCalculation = computed(() => pisoCalculations.value[0] || null);

const pisoHistoryHeaders = [
  { title: 'Calculado em', key: 'createdAt', sortable: false },
  { title: 'Desfecho', key: 'outcome', sortable: false },
  { title: 'Piso mínimo', key: 'minimumAmount', sortable: false },
  { title: 'Conforme', key: 'compliant', sortable: false }
];

const pisoHistoryRows = computed(() =>
  pisoCalculations.value.map((calc) => ({
    id: calc.id,
    createdAt: formatDateTimeBR(calc.createdAt),
    outcomeLabel: pisoOutcomeLabel(calc.outcome),
    minimumAmount: formatCurrencyBRL(calc.minimumAmount),
    compliant: calc.compliant
  }))
);

async function handleCalcularPiso() {
  clearCommandState();
  try {
    await calcularPiso();
    notify.success('Piso mínimo calculado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// ---------------------------------------------------------------------
// CIOT.
// ---------------------------------------------------------------------

const ciotAction = computed(() => ciotAvailableAction(ciotState.value?.ciot?.status));

const ciotTimelineSteps = computed(() =>
  (ciotState.value?.events?.items || []).map((event) => ({
    title: ciotEventLabel(event.eventType),
    timestamp: formatDateTimeBR(event.createdAt),
    state: 'done'
  }))
);

async function handlePreValidarCiot() {
  clearCommandState();
  try {
    await preValidarCiot();
    notify.success('Pré-validação de CIOT concluída — veja o resultado no painel de conformidade (GATE_CIOT).');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleSolicitarCiot() {
  const ok = await confirm({
    title: 'Solicitar CIOT',
    message: 'Registra o frete e a forma de pagamento do transportador autônomo antes da viagem.'
  });
  if (!ok) return;
  clearCommandState();
  try {
    await solicitarCiot({ responsibleParty: 'contractor' });
    notify.success('CIOT solicitado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleRetificarCiot() {
  const ok = await confirm({ title: 'Retificar CIOT', message: 'Envia uma retificação do CIOT já registrado ao provedor.' });
  if (!ok) return;
  clearCommandState();
  try {
    await retificarCiot();
    notify.success('Retificação de CIOT solicitada.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

const ciotCancelReason = ref('');

async function handleCancelarCiot() {
  const ok = await confirm({
    title: 'Cancelar CIOT',
    message: 'Cancela o CIOT registrado. Isto NÃO cancela a operação de transporte — são ciclos distintos.',
    danger: true
  });
  if (!ok) return;
  clearCommandState();
  try {
    await cancelarCiot({ reason: ciotCancelReason.value.trim() || undefined });
    notify.success('Cancelamento de CIOT solicitado.');
    ciotCancelReason.value = '';
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleEncerrarCiot() {
  const ok = await confirm({ title: 'Encerrar CIOT', message: 'Encerra o ciclo do CIOT ao final da viagem.' });
  if (!ok) return;
  clearCommandState();
  try {
    await encerrarCiot();
    notify.success('Encerramento de CIOT solicitado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// ---------------------------------------------------------------------
// VPO.
// ---------------------------------------------------------------------

const vpoAction = computed(() => vpoAvailableAction(vpoState.value?.allocation?.status));

const vpoTimelineSteps = computed(() =>
  (vpoState.value?.events?.items || []).map((event) => ({
    title: vpoEventLabel(event.eventType),
    timestamp: formatDateTimeBR(event.createdAt),
    state: 'done'
  }))
);

async function handleAvaliarVpo() {
  clearCommandState();
  try {
    await avaliarVpo();
    notify.success('Aplicabilidade de VPO avaliada.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

const vpoManualDialog = ref(false);
const vpoManualForm = reactive({ providerId: '', providerReference: '', amount: null, notes: '' });

function openVpoManualDialog() {
  Object.assign(vpoManualForm, { providerId: vpoProviders.value[0]?.id || '', providerReference: '', amount: null, notes: '' });
  clearCommandState();
  vpoManualDialog.value = true;
}

async function submitVpoManual() {
  if (!vpoManualForm.providerId || !vpoManualForm.amount) {
    notify.warning('Selecione a fornecedora e informe o valor.');
    return;
  }
  try {
    await registrarAquisicaoVpo({
      providerId: vpoManualForm.providerId,
      providerReference: vpoManualForm.providerReference.trim() || undefined,
      amount: vpoManualForm.amount,
      evidence: vpoManualForm.notes.trim() ? { notes: vpoManualForm.notes.trim() } : undefined
    });
    notify.success('Aquisição de VPO registrada.');
    vpoManualDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

const vpoProviderDialog = ref(false);
const vpoProviderId = ref('');

function openVpoProviderDialog() {
  vpoProviderId.value = vpoProviders.value.find((p) => p.isActive)?.id || '';
  clearCommandState();
  vpoProviderDialog.value = true;
}

async function submitVpoProvider() {
  if (!vpoProviderId.value) {
    notify.warning('Selecione a fornecedora.');
    return;
  }
  try {
    await adquirirVpo({ providerId: vpoProviderId.value });
    notify.success('Aquisição de VPO solicitada ao provedor.');
    vpoProviderDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// ---------------------------------------------------------------------
// Documentos fiscais.
// ---------------------------------------------------------------------

const fiscalHeaders = [
  { title: 'Tipo', key: 'documentTypeLabel', sortable: false },
  { title: 'Chave de acesso', key: 'accessKeyShort', sortable: false },
  { title: 'Validação', key: 'validationStatus', sortable: false },
  { title: 'Autorização', key: 'authorizationStatus', sortable: false },
  { title: 'Valor', key: 'totalAmount', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const fiscalRows = computed(() =>
  fiscalDocuments.value.map((doc) => ({
    id: doc.id,
    documentTypeLabel: fiscalDocumentTypeLabel(doc.documentType),
    accessKeyShort: doc.accessKey ? `${doc.accessKey.slice(0, 8)}…${doc.accessKey.slice(-6)}` : '-',
    validationStatus: doc.validationStatus,
    authorizationStatus: doc.authorizationStatus,
    totalAmount: formatCurrencyBRL(doc.totalAmount),
    issues: doc.validationIssues || []
  }))
);

const importFiscalDialog = ref(false);
const importFiscalXml = ref('');

function openImportFiscalDialog() {
  importFiscalXml.value = '';
  clearCommandState();
  importFiscalDialog.value = true;
}

async function submitImportFiscal() {
  if (!importFiscalXml.value.trim()) {
    notify.warning('Cole o XML do documento fiscal.');
    return;
  }
  try {
    await importarDocumentoFiscal({ xmlContent: importFiscalXml.value.trim(), linkToSelected: true });
    notify.success('Documento fiscal importado e vinculado.');
    importFiscalDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleDesvincularFiscal(documentId) {
  const ok = await confirm({ title: 'Desvincular documento fiscal', message: 'O documento permanece importado, só deixa de estar ligado a esta operação.' });
  if (!ok) return;
  clearCommandState();
  try {
    await desvincularDocumentoFiscal(documentId);
    notify.success('Documento fiscal desvinculado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleRevalidarFiscal(documentId) {
  clearCommandState();
  try {
    await revalidarDocumentoFiscal(documentId);
    notify.success('Documento fiscal revalidado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// ---------------------------------------------------------------------
// Emissão de DF-e (sandbox-ready).
// ---------------------------------------------------------------------

const emissoesRows = computed(() =>
  emissoes.value.map((issuance) => ({
    id: issuance.id,
    documentTypeLabel: fiscalDocumentTypeLabel(issuance.documentType),
    status: issuance.status,
    statusLabel: dfeIssuanceStatusLabel(issuance.status),
    accessKeyShort: issuance.accessKey ? `${issuance.accessKey.slice(0, 8)}…${issuance.accessKey.slice(-6)}` : '-',
    rejectionReason: issuance.rejectionReason || '-',
    terminal: isDfeIssuanceTerminal(issuance.status),
    events: issuance.events || []
  }))
);

async function handleSolicitarEmissao() {
  const ok = await confirm({
    title: 'Emitir NF-e (sandbox)',
    message: 'Solicita a emissão de uma NF-e no ambiente sandbox do fiscal-kit — nunca produção nesta fase do programa.'
  });
  if (!ok) return;
  clearCommandState();
  try {
    await solicitarEmissao({ documentType: 'NFE' });
    notify.success('Emissão de DF-e solicitada.');
  } catch {
    if (commandErrorCode.value === DFE_ISSUANCE_FEATURE_DISABLED_CODE) {
      notify.warning(DFE_ISSUANCE_FEATURE_DISABLED_MESSAGE);
    } else if (commandError.value) {
      notify.error(commandError.value);
    }
  }
}

async function handleCancelarEmissao(issuanceId) {
  const ok = await confirm({ title: 'Cancelar emissão', message: 'Cancela a emissão de DF-e (sandbox only — sem chamada remota).', danger: true });
  if (!ok) return;
  clearCommandState();
  try {
    await cancelarEmissao(issuanceId);
    notify.success('Cancelamento de emissão solicitado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}
</script>

<template>
  <SicatPageLayout :loading="loadingDetail && !selected" :error="detailError">
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Operação"
        :title="selected?.referenceCode || selected?.id || 'Carregando…'"
        :description="selected ? `ID: ${selected.id}` : ''"
      >
        <template #actions>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
          <v-btn
            v-if="hasCommand('submit_validation')"
            color="primary"
            variant="flat"
            :prepend-icon="commandIcon('submit_validation')"
            :loading="commandLoading"
            @click="handleSubmitValidation"
          >
            {{ commandLabel('submit_validation') }}
          </v-btn>
          <v-btn
            v-if="hasCommand('contract')"
            color="primary"
            variant="flat"
            :prepend-icon="commandIcon('contract')"
            :loading="commandLoading"
            @click="handleContract"
          >
            {{ commandLabel('contract') }}
          </v-btn>
          <v-btn
            v-if="hasCommand('reopen')"
            variant="tonal"
            :prepend-icon="commandIcon('reopen')"
            :loading="commandLoading"
            @click="handleReopen"
          >
            {{ commandLabel('reopen') }}
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <div v-if="selected" class="transp-detail__badges">
      <SicatStatusBadge :status="selected.status" :label="operationStatusLabel(selected.status)" domain="transport-operation" with-dot />
      <v-chip v-if="selected.blockedReasonCode" size="small" color="error" variant="tonal" prepend-icon="mdi-block-helper">
        Bloqueada: {{ selected.blockedReasonCode }}
      </v-chip>
      <v-chip v-if="selected.cancelledReason" size="small" color="error" variant="tonal" prepend-icon="mdi-cancel">
        Cancelada: {{ selected.cancelledReason }}
      </v-chip>
    </div>

    <SicatCard v-if="selected" title="Resumo">
      <div class="transp-detail__summary">
        <div v-for="item in summaryItems" :key="item.label" class="transp-detail__summary-item">
          <span class="transp-detail__summary-label">{{ item.label }}</span>
          <strong class="transp-detail__summary-value">{{ item.value }}</strong>
        </div>
      </div>
    </SicatCard>

    <SicatCard v-if="selected" title="Frete (decomposto)" subtitle="VPO nunca é somado ao frete.">
      <div class="transp-detail__summary">
        <div v-for="item in freightItems" :key="item.key" class="transp-detail__summary-item">
          <span class="transp-detail__summary-label">{{ item.label }}</span>
          <strong class="transp-detail__summary-value">{{ item.value }}</strong>
        </div>
      </div>
    </SicatCard>

    <SicatCard v-if="selected && hasCommand('cancel')" title="Cancelar operação" variant="system">
      <div class="transp-detail__cancel">
        <v-textarea
          v-model="cancelReasonDraft"
          label="Motivo do cancelamento"
          placeholder="Obrigatório — descreva o motivo do cancelamento."
          rows="2"
          auto-grow
          density="comfortable"
          variant="outlined"
          hide-details="auto"
        />
        <v-btn
          color="error"
          variant="tonal"
          :prepend-icon="commandIcon('cancel')"
          :disabled="!cancelReasonDraft.trim()"
          :loading="commandLoading"
          @click="handleCancel"
        >
          {{ commandLabel('cancel') }}
        </v-btn>
      </div>
    </SicatCard>

    <section v-if="selected" class="transp-detail__gates-section">
      <h2 class="transp-detail__gates-title">Painel de conformidade</h2>

      <SicatInlineAlert
        v-if="complianceError"
        tone="error"
        title="Falha ao carregar o painel de conformidade"
        :message="complianceError"
      />
      <SicatLoadingState v-else-if="loadingCompliance && !complianceOverview" title="Carregando conformidade…" compact />

      <div v-else-if="complianceOverview" class="transp-detail__gates">
        <SicatCard v-for="gateEntry in complianceOverview.gates" :key="gateEntry.gate" :title="gateLabel(gateEntry.gate)">
          <template #header-actions>
            <SicatStatusBadge
              v-if="gateEntry.latestEvaluation"
              :status="gateEntry.latestEvaluation.overallStatus"
              :label="complianceStatusLabel(gateEntry.latestEvaluation.overallStatus)"
              domain="compliance"
              with-dot
            />
            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-refresh"
              :loading="commandLoading"
              @click="handleRevalidateGate(gateEntry.gate)"
            >
              Revalidar conformidade
            </v-btn>
          </template>

          <div v-if="gateEntry.latestEvaluation" class="transp-detail__checks">
            <SicatInlineAlert
              v-for="check in gateEntry.latestEvaluation.checks"
              :key="check.ruleCode"
              :tone="complianceAlertTone(check.status)"
              :title="`${check.ruleCode} · ${complianceStatusLabel(check.status)}`"
              :message="check.humanMessage"
            >
              <div class="transp-detail__check-meta">
                <span v-if="check.reasonCode" class="transp-detail__check-meta-item">Motivo: {{ check.reasonCode }}</span>
                <span v-if="check.rawStatus && check.rawStatus !== check.status" class="transp-detail__check-meta-item">
                  Bloquearia se a regra fosse vigente/bloqueante (status original: {{ complianceStatusLabel(check.rawStatus) }})
                </span>
                <span v-if="check.legalBasis?.length" class="transp-detail__check-meta-item">
                  Base legal: {{ check.legalBasis.map((entry) => entry.reference).join('; ') }}
                </span>
              </div>
            </SicatInlineAlert>
          </div>
          <SicatEmptyState
            v-else
            title="Ainda não avaliado"
            description="Use &quot;Revalidar conformidade&quot; para rodar o motor pela primeira vez neste gate."
            icon="mdi-clipboard-text-clock-outline"
            compact
          />
        </SicatCard>
      </div>
    </section>

    <!-- Piso mínimo de frete (MODO SHADOW). -->
    <SicatCard v-if="selected" title="Piso mínimo de frete" subtitle="Modo shadow — o cálculo não bloqueia nada por si só; TR-PMF-002/003 refletem o resultado no painel de conformidade.">
      <template #header-actions>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-calculator-variant-outline" :loading="commandLoading" @click="handleCalcularPiso">
          Calcular piso
        </v-btn>
      </template>

      <SicatInlineAlert v-if="pisoError" tone="error" :message="pisoError" />
      <SicatLoadingState v-else-if="loadingPiso && !pisoCalculations.length" title="Carregando cálculos…" compact />

      <template v-else-if="latestPisoCalculation">
        <div class="transp-detail__piso-summary">
          <v-chip
            :color="pisoComplianceBadge(latestPisoCalculation.compliant).tone === 'success' ? 'success' : (pisoComplianceBadge(latestPisoCalculation.compliant).tone === 'error' ? 'error' : undefined)"
            variant="tonal"
          >
            {{ pisoComplianceBadge(latestPisoCalculation.compliant).label }}
          </v-chip>
          <span class="text-caption text-medium-emphasis">{{ pisoOutcomeLabel(latestPisoCalculation.outcome) }}</span>
        </div>

        <div class="transp-detail__summary">
          <div class="transp-detail__summary-item">
            <span class="transp-detail__summary-label">Piso mínimo calculado</span>
            <strong class="transp-detail__summary-value">{{ formatCurrencyBRL(latestPisoCalculation.minimumAmount) }}</strong>
          </div>
          <div class="transp-detail__summary-item">
            <span class="transp-detail__summary-label">Distância</span>
            <strong class="transp-detail__summary-value">{{ latestPisoCalculation.distanceKm ?? '-' }} km</strong>
          </div>
          <div class="transp-detail__summary-item">
            <span class="transp-detail__summary-label">Nº de eixos</span>
            <strong class="transp-detail__summary-value">{{ latestPisoCalculation.axlesCount ?? '-' }}</strong>
          </div>
          <div class="transp-detail__summary-item">
            <span class="transp-detail__summary-label">Tabela usada</span>
            <strong class="transp-detail__summary-value">
              {{ latestPisoCalculation.floorVersionRef ? `${pisoTableCodeLabel(latestPisoCalculation.floorVersionRef.tableCode)} · ${formatDateBR(latestPisoCalculation.floorVersionRef.effectiveFrom)}` : '-' }}
            </strong>
          </div>
        </div>
        <p v-if="latestPisoCalculation.reason" class="text-caption text-medium-emphasis">{{ latestPisoCalculation.reason }}</p>
      </template>
      <SicatEmptyState v-else title="Piso ainda não calculado" description="Use 'Calcular piso' para rodar o motor pela primeira vez." icon="mdi-calculator-variant-outline" compact />

      <details v-if="pisoHistoryRows.length > 1" class="transp-detail__history">
        <summary>Histórico de cálculos ({{ pisoHistoryRows.length }})</summary>
        <SicatDataTable :headers="pisoHistoryHeaders" :items="pisoHistoryRows" :show-footer="false" density="compact">
          <template #[`item.outcome`]="{ item }">{{ item.outcomeLabel }}</template>
          <template #[`item.compliant`]="{ item }">
            <v-chip size="small" :color="pisoComplianceBadge(item.compliant).tone === 'success' ? 'success' : (pisoComplianceBadge(item.compliant).tone === 'error' ? 'error' : undefined)" variant="tonal">
              {{ pisoComplianceBadge(item.compliant).label }}
            </v-chip>
          </template>
        </SicatDataTable>
      </details>
    </SicatCard>

    <!-- CIOT. -->
    <SicatCard v-if="selected" title="CIOT">
      <template #header-actions>
        <SicatStatusBadge v-if="ciotState?.ciot" :status="ciotState.ciot.status" :label="ciotStatusLabel(ciotState.ciot.status)" domain="ciot" with-dot />
      </template>

      <SicatInlineAlert v-if="ciotError" tone="error" :message="ciotError" />
      <SicatLoadingState v-else-if="loadingCiot && !ciotState" title="Carregando CIOT…" compact />

      <template v-else>
        <SicatInlineAlert
          v-if="ciotState?.ciot?.status === 'registered'"
          tone="warning"
          message="CIOT REGISTRADO não é o mesmo que CONFORME: confira o painel de conformidade (GATE_CIOT) — o registro só prova que o número existe, não que atende todas as regras TR-CIOT-*."
        />

        <div v-if="ciotState?.ciot" class="transp-detail__summary">
          <div class="transp-detail__summary-item">
            <span class="transp-detail__summary-label">Número do CIOT</span>
            <strong class="transp-detail__summary-value">{{ ciotState.ciot.ciotNumber || 'Ainda não emitido' }}</strong>
          </div>
          <div class="transp-detail__summary-item">
            <span class="transp-detail__summary-label">Provedor</span>
            <strong class="transp-detail__summary-value">{{ ciotState.ciot.provider }}</strong>
          </div>
          <div class="transp-detail__summary-item">
            <span class="transp-detail__summary-label">Status externo</span>
            <strong class="transp-detail__summary-value">{{ ciotState.ciot.externalStatus || '-' }}</strong>
          </div>
        </div>
        <SicatEmptyState v-else title="Nenhuma solicitação de CIOT ainda" icon="mdi-file-document-outline" compact />

        <div class="transp-detail__actions-row">
          <v-btn size="small" variant="text" prepend-icon="mdi-clipboard-search-outline" :loading="commandLoading" @click="handlePreValidarCiot">
            Pré-validar
          </v-btn>
          <v-btn v-if="ciotAction === 'solicitar'" size="small" color="primary" variant="flat" :loading="commandLoading" @click="handleSolicitarCiot">
            Solicitar CIOT
          </v-btn>
          <template v-if="ciotAction === 'gerenciar'">
            <v-btn size="small" variant="tonal" :loading="commandLoading" @click="handleRetificarCiot">Retificar</v-btn>
            <v-btn size="small" variant="tonal" :loading="commandLoading" @click="handleEncerrarCiot">Encerrar</v-btn>
            <v-btn size="small" color="error" variant="text" :loading="commandLoading" @click="handleCancelarCiot">Cancelar CIOT</v-btn>
          </template>
        </div>

        <details v-if="ciotTimelineSteps.length" class="transp-detail__history">
          <summary>Eventos ({{ ciotTimelineSteps.length }})</summary>
          <SicatStatusTimeline :steps="ciotTimelineSteps" />
        </details>
      </template>
    </SicatCard>

    <!-- Seguro da viagem (averbação eletrônica) — componente FILHO. Fica entre
         CIOT e VPO porque a ordem dos cartões conta a sequência real do
         embarque: registra o transporte (CIOT) → cobre a carga (seguro) →
         resolve o pedágio (VPO) → emite o fiscal. Averbar muda a conformidade
         (TR-SEG-004/005), então o `changed` recarrega o painel. -->
    <OperacaoSeguroCard
      v-if="selected"
      :operation="selected"
      :integration-account-id="selected.integrationAccountId"
      @changed="loadCompliance(operationId)"
    />

    <!-- VPO. -->
    <SicatCard v-if="selected" title="VPO — Vale-Pedágio Obrigatório">
      <template #header-actions>
        <SicatStatusBadge v-if="vpoState?.allocation" :status="vpoState.allocation.status" :label="vpoAllocationStatusLabel(vpoState.allocation.status)" domain="vpo-allocation" with-dot />
      </template>

      <SicatInlineAlert v-if="vpoError" tone="error" :message="vpoError" />
      <SicatLoadingState v-else-if="loadingVpo && !vpoState" title="Carregando VPO…" compact />

      <template v-else>
        <div v-if="vpoState?.allocation" class="transp-detail__summary">
          <div class="transp-detail__summary-item">
            <span class="transp-detail__summary-label">Aplicável</span>
            <strong class="transp-detail__summary-value">{{ vpoApplicableLabel(vpoState.allocation.applicable) }}</strong>
          </div>
          <div class="transp-detail__summary-item">
            <span class="transp-detail__summary-label">Valor</span>
            <strong class="transp-detail__summary-value">{{ formatCurrencyBRL(vpoState.allocation.amount) }}</strong>
          </div>
          <div class="transp-detail__summary-item">
            <span class="transp-detail__summary-label">Origem da evidência</span>
            <strong class="transp-detail__summary-value">{{ vpoEvidenceSourceLabel(vpoState.allocation.evidenceSource) }}</strong>
          </div>
        </div>
        <SicatEmptyState v-else title="Aplicabilidade ainda não avaliada" icon="mdi-cash-multiple" compact />

        <div class="transp-detail__actions-row">
          <v-btn v-if="vpoAction === 'avaliar'" size="small" color="primary" variant="flat" :loading="commandLoading" @click="handleAvaliarVpo">
            Avaliar aplicabilidade
          </v-btn>
          <template v-if="vpoAction === 'adquirir'">
            <v-btn size="small" variant="tonal" prepend-icon="mdi-file-edit-outline" @click="openVpoManualDialog">Registrar aquisição manual</v-btn>
            <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-cloud-upload-outline" @click="openVpoProviderDialog">Adquirir via provedor</v-btn>
          </template>
        </div>

        <details v-if="vpoTimelineSteps.length" class="transp-detail__history">
          <summary>Eventos ({{ vpoTimelineSteps.length }})</summary>
          <SicatStatusTimeline :steps="vpoTimelineSteps" />
        </details>
      </template>
    </SicatCard>

    <!-- Documentos fiscais. -->
    <SicatCard v-if="selected" title="Documentos fiscais" flush-body>
      <template #header-actions>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-file-upload-outline" @click="openImportFiscalDialog">Importar XML</v-btn>
      </template>
      <SicatInlineAlert v-if="fiscalDocumentsError" tone="error" :message="fiscalDocumentsError" class="ma-4" />
      <SicatDataTable
        :headers="fiscalHeaders"
        :items="fiscalRows"
        :loading="loadingFiscalDocuments"
        :show-footer="false"
        :items-per-page="-1"
        density="compact"
        :empty="{ title: 'Nenhum documento fiscal vinculado', icon: 'mdi-file-document-outline' }"
      >
        <template #[`item.validationStatus`]="{ item }">
          <SicatStatusBadge :status="item.validationStatus" :label="fiscalValidationStatusLabel(item.validationStatus)" domain="fiscal-validation" with-dot size="sm" />
        </template>
        <template #[`item.authorizationStatus`]="{ item }">
          <SicatStatusBadge :status="item.authorizationStatus" :label="fiscalAuthorizationStatusLabel(item.authorizationStatus)" domain="fiscal-authorization" with-dot size="sm" />
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" @click.stop="handleRevalidarFiscal(item.id)">Revalidar</v-btn>
          <v-btn size="small" variant="text" color="error" @click.stop="handleDesvincularFiscal(item.id)">Desvincular</v-btn>
        </template>
      </SicatDataTable>
      <div v-for="item in fiscalRows.filter((row) => row.issues?.length)" :key="`issues-${item.id}`" class="transp-detail__fiscal-issues">
        <span class="transp-detail__fiscal-issues-title">Achados de {{ item.accessKeyShort }}:</span>
        <SicatInlineAlert
          v-for="(issue, index) in item.issues"
          :key="index"
          :tone="fiscalIssueTone(issue.severity)"
          :title="issue.code"
          :message="issue.message"
        />
      </div>
    </SicatCard>

    <!-- Emissão de DF-e (sandbox-ready). -->
    <SicatCard v-if="selected" title="Emissão de DF-e" subtitle="Sandbox-ready — nunca produção nesta fase do programa." flush-body>
      <template #header-actions>
        <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-file-certificate-outline" :loading="commandLoading" @click="handleSolicitarEmissao">
          Emitir NF-e (sandbox)
        </v-btn>
      </template>
      <SicatInlineAlert v-if="emissoesError" tone="error" :message="emissoesError" class="ma-4" />
      <SicatDataTable
        :headers="[
          { title: 'Tipo', key: 'documentTypeLabel', sortable: false },
          { title: 'Status', key: 'status', sortable: false },
          { title: 'Chave de acesso', key: 'accessKeyShort', sortable: false },
          { title: 'Motivo de rejeição', key: 'rejectionReason', sortable: false },
          { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
        ]"
        :items="emissoesRows"
        :loading="loadingEmissoes"
        :show-footer="false"
        :items-per-page="-1"
        density="compact"
        :empty="{ title: 'Nenhuma emissão solicitada', icon: 'mdi-file-certificate-outline' }"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="dfe-issuance" with-dot size="sm" />
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn v-if="!item.terminal" size="small" variant="text" color="error" @click.stop="handleCancelarEmissao(item.id)">Cancelar</v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>

    <!-- Importar XML de documento fiscal -->
    <v-dialog v-model="importFiscalDialog" max-width="640" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Importar documento fiscal (XML)">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <SicatInlineAlert tone="info" message="Cole o XML completo (nfeProc/cteProc/mdfeProc, ou o XML assinado isolado). O documento já é vinculado a esta operação." />
          <v-textarea
            v-model="importFiscalXml"
            label="XML do documento fiscal"
            rows="10"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="importFiscalDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitImportFiscal">Importar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Registrar aquisição manual de VPO -->
    <v-dialog v-model="vpoManualDialog" max-width="480" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Registrar aquisição manual de VPO">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <v-select
            v-model="vpoManualForm.providerId"
            :items="vpoProviders.filter((p) => p.isActive).map((p) => ({ value: p.id, title: p.name }))"
            item-title="title"
            item-value="value"
            label="Fornecedora"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model="vpoManualForm.providerReference" label="Referência na fornecedora (opcional)" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model.number="vpoManualForm.amount" label="Valor (R$)" type="number" min="0" density="comfortable" variant="outlined" hide-details="auto" />
          <v-textarea v-model="vpoManualForm.notes" label="Evidência (obrigatória)" rows="2" auto-grow density="comfortable" variant="outlined" hide-details="auto" />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="vpoManualDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitVpoManual">Registrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Adquirir VPO via provedor -->
    <v-dialog v-model="vpoProviderDialog" max-width="440" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Adquirir VPO via provedor">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <SicatInlineAlert tone="info" message="Aquisição assíncrona (sandbox/mock nesta fase) — a referência do provedor nasce na resposta." />
          <v-select
            v-model="vpoProviderId"
            :items="vpoProviders.filter((p) => p.isActive).map((p) => ({ value: p.id, title: p.name }))"
            item-title="title"
            item-value="value"
            label="Fornecedora"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="vpoProviderDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitVpoProvider">Adquirir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
.transp-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.transp-detail__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
}

.transp-detail__summary-item {
  display: grid;
  gap: 2px;
}

.transp-detail__summary-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 700;
}

.transp-detail__summary-value {
  font-size: 0.95rem;
  color: rgba(var(--v-theme-on-surface), 0.9);
  word-break: break-word;
}

.transp-detail__cancel {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-3);
}

.transp-detail__cancel :deep(.v-textarea) {
  flex: 1;
  min-width: 260px;
}

.transp-detail__gates-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.transp-detail__gates-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.transp-detail__gates {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: var(--space-4);
}

.transp-detail__checks {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.transp-detail__check-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
}

/* PR-H2 — piso mínimo, CIOT, VPO, documentos fiscais e emissão de DF-e. */

.transp-detail__piso-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--space-3);
}

.transp-detail__actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: var(--space-3);
}

.transp-detail__history {
  margin-top: var(--space-4);
}

.transp-detail__history summary {
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  color: rgba(var(--v-theme-primary), 0.95);
  margin-bottom: var(--space-2);
}

.transp-detail__fiscal-issues {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 var(--space-6) var(--space-5);
}

.transp-detail__fiscal-issues-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
