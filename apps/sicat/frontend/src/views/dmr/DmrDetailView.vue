<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useDmrStore } from '../../stores/dmrStore.js';
import {
  DMR_ITEM_PARTNER_ROLES,
  DMR_QUANTITY_UNITS,
  formatDmrPeriodLabel,
  isDmrGatewayPending,
  roleLabel,
  statusLabel
} from './dmrUiHelpers.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import { useNotification } from '../../composables/useNotification.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const store = useDmrStore();
const notify = useNotification();
const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel, dialogCancelLabel,
  dialogDanger, dialogShowCancel, confirm, accept, cancel
} = useConfirmDialog();

const {
  selectedDmr,
  selectedItems,
  selectedStatus,
  loadingDetail,
  detailError,
  commandLoading,
  commandError,
  commandFeedback,
  loadDmr,
  consolidateSelected,
  submitSelected,
  cancelSelected,
  addItem,
  removeItem,
  clearCommandState
} = store;

const dmrId = computed(() => String(route.params.dmrId || '').trim());

const submitDialog = ref(false);
const addItemDialog = ref(false);
const submitForm = reactive({ validateOnly: false });

const itemForm = reactive({
  manifestId: '', mtrNumber: '', cdfNumber: '', residueClass: '', residueCode: '',
  quantityValue: '', quantityUnit: 'kg', partnerRole: 'transportador', partnerCnpj: ''
});

const isCancellable = computed(() =>
  ['draft', 'consolidating', 'pending_review', 'enqueued', 'failed_validation', 'failed_remote'].includes(String(selectedDmr.value?.status || ''))
);
const isConsolidatable = computed(() =>
  ['draft', 'pending_review', 'failed_validation'].includes(String(selectedDmr.value?.status || ''))
);
const isSubmittable = computed(() =>
  ['pending_review', 'enqueued', 'failed_validation', 'failed_remote'].includes(String(selectedDmr.value?.status || ''))
);
const isItemMutable = computed(() =>
  ['draft', 'pending_review', 'failed_validation'].includes(String(selectedDmr.value?.status || ''))
);

const showGatewayPendingBanner = computed(() => {
  const status = selectedDmr.value?.status;
  const code = String(selectedDmr.value?.lastErrorCode || '').toUpperCase();
  if (status === 'failed_remote' && code.includes('DMR_GATEWAY_PENDING_HAR')) return true;
  if (commandError.value && /DMR_GATEWAY_PENDING_HAR/i.test(commandError.value)) return true;
  return false;
});

const sessionContextId = computed(() =>
  String(authStore.sessionContext.value?.sessionContextId || authStore.sessionContext.value?.id || '').trim()
);

const summaryItems = computed(() => {
  const dmr = selectedDmr.value;
  if (!dmr) return [];
  return [
    { label: 'Manifestos', value: dmr.summaryTotals?.totalManifestos ?? 0 },
    { label: 'Submetida em', value: dmr.submittedAt ? new Date(dmr.submittedAt).toLocaleString('pt-BR') : '-' },
    { label: 'Versão', value: dmr.version ?? '-' },
    { label: 'Correlation', value: dmr.correlationId || '-' }
  ];
});

const itemHeaders = [
  { title: 'MTR', key: 'mtr', sortable: false },
  { title: 'CDF', key: 'cdf', sortable: false },
  { title: 'Classe', key: 'residueClass', sortable: false },
  { title: 'Quantidade', key: 'quantity', sortable: false },
  { title: 'Parceiro', key: 'partner', sortable: false },
  { title: 'Papel', key: 'partnerRole', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const itemRows = computed(() =>
  selectedItems.value.map((item) => ({
    id: item.id,
    mtr: item.mtrNumber || '-',
    cdf: item.cdfNumber || '-',
    residueClass: item.residueClass || '-',
    quantity: `${item.quantityValue} ${item.quantityUnit}`,
    partner: item.partnerCnpj || '-',
    partnerRole: item.partnerRole || '-'
  }))
);

watch(dmrId, async (id) => {
  if (id) await loadDmr(id);
}, { immediate: false });

onMounted(async () => {
  if (dmrId.value) await loadDmr(dmrId.value);
});

watch(commandFeedback, (value) => {
  if (value) notify.success(value);
});

async function handleConsolidate({ force = false } = {}) {
  clearCommandState();
  try {
    await consolidateSelected({ force });
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleSubmitConfirm() {
  clearCommandState();
  try {
    await submitSelected({ sessionContextId: sessionContextId.value, validateOnly: submitForm.validateOnly });
    submitDialog.value = false;
  } catch (error) {
    if (isDmrGatewayPending(error)) submitDialog.value = false;
    else if (commandError.value) notify.error(commandError.value);
  }
}

async function handleCancel() {
  const ok = await confirm({
    title: 'Cancelar declaração?',
    message: 'Esta ação marca a DMR como cancelada e libera o período para nova declaração. Não é possível cancelar uma DMR já submetida.',
    confirmLabel: 'Cancelar DMR',
    cancelLabel: 'Manter',
    danger: true
  });
  if (!ok) return;
  clearCommandState();
  try {
    await cancelSelected();
    notify.success('Declaração cancelada.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

function resetItemForm() {
  Object.assign(itemForm, {
    manifestId: '', mtrNumber: '', cdfNumber: '', residueClass: '', residueCode: '',
    quantityValue: '', quantityUnit: 'kg', partnerRole: 'transportador', partnerCnpj: ''
  });
}

async function handleAddItemConfirm() {
  clearCommandState();
  const payload = {
    mtrNumber: String(itemForm.mtrNumber || '').trim(),
    residueClass: String(itemForm.residueClass || '').trim(),
    quantityValue: Number(itemForm.quantityValue),
    quantityUnit: itemForm.quantityUnit,
    partnerRole: itemForm.partnerRole,
    partnerCnpj: String(itemForm.partnerCnpj || '').trim()
  };
  if (itemForm.manifestId) payload.manifestId = itemForm.manifestId;
  if (itemForm.cdfNumber) payload.cdfNumber = itemForm.cdfNumber;
  if (itemForm.residueCode) payload.residueCode = itemForm.residueCode;

  try {
    await addItem(payload);
    addItemDialog.value = false;
    resetItemForm();
    notify.success('Item adicionado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleRemoveItem(itemId, itemLabel = '') {
  const label = String(itemLabel || '').trim();
  const ok = await confirm({
    title: 'Remover item da DMR?',
    message: label && label !== '-'
      ? `Remover o item ${label} desta declaração? Esta ação não pode ser desfeita.`
      : 'Remover este item da declaração? Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover item',
    cancelLabel: 'Manter',
    danger: true
  });
  if (!ok) return;

  clearCommandState();
  try {
    await removeItem(itemId);
    notify.success('Item removido.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

function goBack() {
  router.push('/dmr');
}
</script>

<template>
  <SicatPageLayout :loading="loadingDetail && !selectedDmr" :error="detailError">
    <template #header>
      <SicatPageHeader
        kicker="Resíduos · DMR · Detalhe"
        :title="selectedDmr ? formatDmrPeriodLabel(selectedDmr) : 'Carregando…'"
        :description="selectedDmr ? `${roleLabel(selectedDmr.role)} · CNPJ ${selectedDmr.cnpj || '-'}` : ''"
      >
        <template #actions>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="showGatewayPendingBanner"
        tone="warning"
        title="Aguardando captura HAR DMR"
        message="Declaração consolidada e pronta — envio remoto à CETESB pendente até a captura do HAR DMR."
      />
    </template>

    <div v-if="selectedDmr" class="dmr-detail__badges">
      <SicatStatusBadge :status="selectedDmr.status" :label="statusLabel(selectedDmr.status)" domain="dmr" with-dot />
      <v-chip v-if="selectedDmr.protocolNumber" size="small" color="success" variant="tonal">Protocolo: {{ selectedDmr.protocolNumber }}</v-chip>
      <v-chip v-if="selectedDmr.attempts != null" size="small" variant="tonal">Tentativas: {{ selectedDmr.attempts }}</v-chip>
    </div>

    <SicatCard v-if="selectedDmr" title="Ações da declaração">
      <div class="dmr-detail__actions">
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-table-refresh" :disabled="!isConsolidatable" :loading="commandLoading" @click="handleConsolidate({ force: false })">Consolidar</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-table-refresh" :disabled="commandLoading" @click="handleConsolidate({ force: true })">Consolidar (force)</v-btn>
        <v-btn color="success" variant="flat" prepend-icon="mdi-cloud-upload-outline" :disabled="!isSubmittable" @click="submitDialog = true">Submeter à CETESB</v-btn>
        <v-btn color="error" variant="tonal" prepend-icon="mdi-cancel" :disabled="!isCancellable" @click="handleCancel">Cancelar</v-btn>
      </div>
      <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" class="mt-3" />
    </SicatCard>

    <SicatCard v-if="selectedDmr" title="Resumo">
      <div class="dmr-detail__summary">
        <div v-for="item in summaryItems" :key="item.label" class="dmr-detail__summary-item">
          <span class="dmr-detail__summary-label">{{ item.label }}</span>
          <strong class="dmr-detail__summary-value">{{ item.value }}</strong>
        </div>
      </div>
    </SicatCard>

    <SicatCard v-if="selectedDmr" :title="`Itens consolidados (${selectedItems.length})`" flush-body>
      <template #header-actions>
        <v-btn variant="outlined" size="small" prepend-icon="mdi-plus" :disabled="!isItemMutable" @click="addItemDialog = true">Adicionar item</v-btn>
      </template>
      <SicatDataTable
        :headers="itemHeaders"
        :items="itemRows"
        density="compact"
        :empty="{ title: 'Nenhum item consolidado', description: 'Use Consolidar para puxar dos manifestos do período ou adicione manualmente.', icon: 'mdi-table-plus' }"
      >
        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" color="error" :disabled="!isItemMutable || commandLoading" @click="handleRemoveItem(item.id, item.mtr)">Remover</v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>

    <!-- Submit dialog (formulário) -->
    <v-dialog v-model="submitDialog" max-width="520">
      <v-card rounded="lg">
        <v-card-title>Submeter DMR à CETESB</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">A submissão é assíncrona (job dmr.submit). O gateway DMR pode retornar pendência funcional até a captura HAR.</p>
          <v-text-field :model-value="sessionContextId" label="sessionContextId" readonly density="comfortable" variant="outlined" hide-details="auto" class="mb-2" />
          <v-checkbox v-model="submitForm.validateOnly" label="Apenas validar (validateOnly)" density="comfortable" hide-details />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" :disabled="commandLoading" @click="submitDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" :disabled="!sessionContextId" @click="handleSubmitConfirm">Confirmar envio</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Add item dialog (formulário) -->
    <v-dialog v-model="addItemDialog" max-width="640">
      <v-card rounded="lg">
        <v-card-title>Adicionar item manual</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12" md="6"><v-text-field v-model="itemForm.mtrNumber" label="Nº MTR *" density="comfortable" variant="outlined" hide-details="auto" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="itemForm.cdfNumber" label="Nº CDF (opcional)" density="comfortable" variant="outlined" hide-details="auto" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="itemForm.residueClass" label="Classe do resíduo *" density="comfortable" variant="outlined" hide-details="auto" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="itemForm.residueCode" label="Código do resíduo (opcional)" density="comfortable" variant="outlined" hide-details="auto" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model.number="itemForm.quantityValue" label="Quantidade *" type="number" step="0.001" density="comfortable" variant="outlined" hide-details="auto" /></v-col>
            <v-col cols="12" md="6"><v-select v-model="itemForm.quantityUnit" :items="DMR_QUANTITY_UNITS" label="Unidade *" density="comfortable" variant="outlined" hide-details="auto" /></v-col>
            <v-col cols="12" md="6"><v-select v-model="itemForm.partnerRole" :items="DMR_ITEM_PARTNER_ROLES" item-title="label" item-value="value" label="Papel do parceiro *" density="comfortable" variant="outlined" hide-details="auto" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="itemForm.partnerCnpj" label="CNPJ do parceiro *" density="comfortable" variant="outlined" hide-details="auto" /></v-col>
            <v-col cols="12"><v-text-field v-model="itemForm.manifestId" label="ID do manifesto SICAT (opcional)" density="comfortable" variant="outlined" hide-details="auto" /></v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" :disabled="commandLoading" @click="addItemDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="handleAddItemConfirm">Adicionar</v-btn>
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
.dmr-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dmr-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dmr-detail__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
}

.dmr-detail__summary-item {
  display: grid;
  gap: 2px;
}

.dmr-detail__summary-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 700;
}

.dmr-detail__summary-value {
  font-size: 0.95rem;
  color: rgba(var(--v-theme-on-surface), 0.9);
  word-break: break-word;
}
</style>
