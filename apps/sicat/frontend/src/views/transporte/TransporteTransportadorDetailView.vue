<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTransportadoresStore } from '../../stores/transportadoresStore.js';
import { useVeiculosStore } from '../../stores/veiculosStore.js';
import { useNotification } from '../../composables/useNotification.js';
import {
  formatCurrencyBRL,
  formatDateBR,
  formatDateTimeBR,
  partyRoleLabel,
  pgrStatusLabel,
  policyStatusLabel,
  policyTypeLabel,
  POLICY_TYPE_OPTIONS,
  resolveInsuranceExpiryState,
  rntrcCategoryLabel,
  rntrcResultStatusLabel,
  rntrcStatusLabel,
  rntrcStrategyLabel,
  rntrcVerificationRequestedStatusLabel,
  VEHICLE_LINK_TYPE_OPTIONS,
  vehicleLinkTypeLabel,
  vehicleTypeLabel
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';

/**
 * Detalhe do transportador (DL-103, PR-H2). Reúne cadastro, RNTRC (badge +
 * verificação + histórico), veículos vinculados, apólices de seguro e PGR —
 * tudo que a Fase C/F precisava de UI e ainda não tinha.
 */

const route = useRoute();
const router = useRouter();
const store = useTransportadoresStore();
const veiculosStore = useVeiculosStore();
const notify = useNotification();

const {
  selected, loadingDetail, detailError,
  rntrcVerifications, loadingRntrcVerifications,
  vehicleLinks, loadingVehicleLinks,
  policies, loadingPolicies,
  pgrs, loadingPgrs,
  commandLoading, commandError,
  loadById, updateCarrier, verificarRntrc, loadRntrcVerifications,
  linkVehicle, loadVehicleLinks,
  createPolicy, updatePolicy, verificarApolices, loadPolicies,
  createPgr, loadPgrs, clearCommandState
} = store;

const partyId = computed(() => String(route.params.partyId || '').trim());

async function loadAll(id) {
  if (!id) return;
  await loadById(id);
  await Promise.all([
    loadRntrcVerifications(id),
    loadVehicleLinks(id),
    loadPolicies(id),
    loadPgrs(id)
  ]);
}

watch(partyId, async (next) => {
  if (next) await loadAll(next);
});

onMounted(async () => {
  if (partyId.value) await loadAll(partyId.value);
});

function goBack() {
  router.push('/transporte/transportadores');
}

// --- Editar cadastro --------------------------------------------------

const editDialog = ref(false);
const editForm = reactive({ legalName: '', tradeName: '', municipality: '', uf: '', isActive: true, roles: [] });

function openEditDialog() {
  if (!selected.value) return;
  Object.assign(editForm, {
    legalName: selected.value.legalName || '',
    tradeName: selected.value.tradeName || '',
    municipality: selected.value.municipality || '',
    uf: selected.value.uf || '',
    isActive: selected.value.isActive,
    roles: [...(selected.value.roles || [])]
  });
  clearCommandState();
  editDialog.value = true;
}

async function submitEdit() {
  try {
    await updateCarrier(partyId.value, {
      legalName: editForm.legalName.trim() || undefined,
      tradeName: editForm.tradeName.trim() || undefined,
      municipality: editForm.municipality.trim() || undefined,
      uf: editForm.uf.trim() ? editForm.uf.trim().toUpperCase() : undefined,
      isActive: editForm.isActive,
      roles: editForm.roles.length ? editForm.roles : undefined
    });
    notify.success('Transportador atualizado.');
    editDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// --- RNTRC ---------------------------------------------------------------

const rntrcDialog = ref(false);
const rntrcForm = reactive({ strategy: 'manual', resultStatus: 'active', resultCategory: '', notes: '' });

function openRntrcDialog() {
  Object.assign(rntrcForm, { strategy: 'manual', resultStatus: 'active', resultCategory: '', notes: '' });
  clearCommandState();
  rntrcDialog.value = true;
}

async function submitRntrc() {
  try {
    const payload = { strategy: rntrcForm.strategy };
    if (rntrcForm.strategy === 'manual') {
      payload.manualEvidence = {
        resultStatus: rntrcForm.resultStatus,
        ...(rntrcForm.resultCategory ? { resultCategory: rntrcForm.resultCategory } : {}),
        ...(rntrcForm.notes.trim() ? { notes: rntrcForm.notes.trim() } : {})
      };
    }
    await verificarRntrc(payload);
    notify.success(rntrcForm.strategy === 'manual' ? 'Verificação registrada.' : 'Verificação solicitada e concluída.');
    rntrcDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

const rntrcVerificationHeaders = [
  { title: 'Estratégia', key: 'strategyLabel', sortable: false },
  { title: 'Resultado', key: 'requestedStatus', sortable: false },
  { title: 'Status apurado', key: 'resultStatusLabel', sortable: false },
  { title: 'Data de referência', key: 'dataReferenceDate', sortable: false },
  { title: 'Em', key: 'createdAt', sortable: false }
];

const rntrcVerificationRows = computed(() =>
  rntrcVerifications.value.map((entry) => ({
    id: entry.id,
    strategyLabel: rntrcStrategyLabel(entry.strategy),
    requestedStatus: entry.requestedStatus,
    resultStatusLabel: rntrcResultStatusLabel(entry.resultStatus),
    dataReferenceDate: entry.dataReferenceDate ? formatDateBR(entry.dataReferenceDate) : '-',
    createdAt: formatDateTimeBR(entry.createdAt)
  }))
);

// --- Veículos vinculados ----------------------------------------------

const vehicleLinkHeaders = [
  { title: 'Placa', key: 'vehiclePlate', sortable: false },
  { title: 'Tipo', key: 'vehicleType', sortable: false },
  { title: 'Vínculo', key: 'linkType', sortable: false },
  { title: 'Vigência', key: 'validity', sortable: false }
];

const vehicleLinkRows = computed(() =>
  vehicleLinks.value.map((link) => ({
    id: link.id,
    vehiclePlate: link.vehiclePlate,
    vehicleTypeLabel: vehicleTypeLabel(link.vehicleType),
    linkTypeLabel: vehicleLinkTypeLabel(link.linkType),
    validity: link.validFrom || link.validUntil
      ? `${link.validFrom ? formatDateBR(link.validFrom) : '-'} – ${link.validUntil ? formatDateBR(link.validUntil) : 'indeterminada'}`
      : 'Indeterminada'
  }))
);

const linkVehicleDialog = ref(false);
const linkForm = reactive({ vehicleId: '', linkType: 'owned', validFrom: '', validUntil: '' });
const availableVehicles = ref([]);
const loadingAvailableVehicles = ref(false);

async function openLinkVehicleDialog() {
  Object.assign(linkForm, { vehicleId: '', linkType: 'owned', validFrom: '', validUntil: '' });
  clearCommandState();
  linkVehicleDialog.value = true;
  loadingAvailableVehicles.value = true;
  try {
    veiculosStore.filters.pageSize = 200;
    await veiculosStore.fetchList();
    availableVehicles.value = veiculosStore.items.value.map((vehicle) => ({
      value: vehicle.id,
      label: `${vehicle.plate} · ${vehicleTypeLabel(vehicle.vehicleType)}`
    }));
  } finally {
    loadingAvailableVehicles.value = false;
  }
}

async function submitLinkVehicle() {
  if (!linkForm.vehicleId) {
    notify.warning('Selecione um veículo.');
    return;
  }
  try {
    await linkVehicle({
      vehicleId: linkForm.vehicleId,
      linkType: linkForm.linkType,
      validFrom: linkForm.validFrom || undefined,
      validUntil: linkForm.validUntil || undefined
    });
    notify.success('Veículo vinculado.');
    linkVehicleDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// --- Apólices --------------------------------------------------------

const policyHeaders = [
  { title: 'Tipo', key: 'policyType', sortable: false },
  { title: 'Seguradora', key: 'insurerName', sortable: false },
  { title: 'Nº apólice', key: 'policyNumber', sortable: false },
  { title: 'Cobertura', key: 'coverageAmount', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Vigência', key: 'expiry', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const policyRows = computed(() =>
  policies.value.map((policy) => {
    const expiry = resolveInsuranceExpiryState(policy);
    return {
      id: policy.id,
      version: policy.version,
      policyType: policy.policyType,
      policyTypeLabel: policyTypeLabel(policy.policyType),
      insurerName: policy.insurerName,
      policyNumber: policy.policyNumber,
      coverageAmount: formatCurrencyBRL(policy.coverageAmount),
      status: policy.status,
      statusLabel: policyStatusLabel(policy.status),
      expiryLabel: expiry.label,
      expiryTone: expiry.tone,
      validUntil: policy.validUntil
    };
  })
);

const policyDialog = ref(false);
const policyEditingId = ref('');
const policyForm = reactive({
  policyType: 'RCTR_C', insurerName: '', insurerDocument: '', policyNumber: '',
  coverageAmount: null, validFrom: '', validUntil: '', notes: ''
});

function openCreatePolicyDialog() {
  policyEditingId.value = '';
  Object.assign(policyForm, {
    policyType: 'RCTR_C', insurerName: '', insurerDocument: '', policyNumber: '',
    coverageAmount: null, validFrom: '', validUntil: '', notes: ''
  });
  clearCommandState();
  policyDialog.value = true;
}

function openEditPolicyDialog(row) {
  policyEditingId.value = row.id;
  const original = policies.value.find((entry) => entry.id === row.id);
  Object.assign(policyForm, {
    policyType: original?.policyType || 'RCTR_C',
    insurerName: original?.insurerName || '',
    insurerDocument: original?.insurerDocument || '',
    policyNumber: original?.policyNumber || '',
    coverageAmount: original?.coverageAmount ?? null,
    validFrom: original?.validFrom || '',
    validUntil: original?.validUntil || '',
    notes: ''
  });
  clearCommandState();
  policyDialog.value = true;
}

async function submitPolicy() {
  if (!policyForm.insurerName.trim() || !policyForm.policyNumber.trim() || !policyForm.validFrom || !policyForm.validUntil) {
    notify.warning('Preencha seguradora, número da apólice e a vigência (início e fim).');
    return;
  }
  try {
    if (policyEditingId.value) {
      await updatePolicy(policyEditingId.value, {
        insurerName: policyForm.insurerName.trim(),
        insurerDocument: policyForm.insurerDocument.trim() || undefined,
        coverageAmount: policyForm.coverageAmount ? Number(policyForm.coverageAmount) : undefined,
        validFrom: policyForm.validFrom,
        validUntil: policyForm.validUntil,
        evidence: policyForm.notes.trim() ? { notes: policyForm.notes.trim() } : undefined
      });
      notify.success('Apólice atualizada.');
    } else {
      await createPolicy({
        policyType: policyForm.policyType,
        insurerName: policyForm.insurerName.trim(),
        insurerDocument: policyForm.insurerDocument.trim() || undefined,
        policyNumber: policyForm.policyNumber.trim(),
        coverageAmount: policyForm.coverageAmount ? Number(policyForm.coverageAmount) : undefined,
        validFrom: policyForm.validFrom,
        validUntil: policyForm.validUntil,
        evidence: policyForm.notes.trim() ? { notes: policyForm.notes.trim() } : undefined
      });
      notify.success('Apólice registrada.');
    }
    policyDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleVerificarApolices() {
  clearCommandState();
  try {
    await verificarApolices();
    notify.success('Seguros verificados.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// --- PGR ---------------------------------------------------------------

const pgrHeaders = [
  { title: 'Referência', key: 'planReference', sortable: false },
  { title: 'Versão', key: 'versionLabel', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Vigência', key: 'validity', sortable: false }
];

const pgrRows = computed(() =>
  pgrs.value.map((pgr) => ({
    id: pgr.id,
    planReference: pgr.planReference,
    versionLabel: pgr.versionLabel || '-',
    status: pgr.status,
    statusLabel: pgrStatusLabel(pgr.status),
    validity: `${formatDateBR(pgr.validFrom)} – ${pgr.validUntil ? formatDateBR(pgr.validUntil) : 'indeterminada'}`
  }))
);

const pgrDialog = ref(false);
const pgrForm = reactive({ planReference: '', versionLabel: '', validFrom: '', validUntil: '' });

function openPgrDialog() {
  Object.assign(pgrForm, { planReference: '', versionLabel: '', validFrom: '', validUntil: '' });
  clearCommandState();
  pgrDialog.value = true;
}

async function submitPgr() {
  if (!pgrForm.planReference.trim() || !pgrForm.validFrom) {
    notify.warning('Preencha a referência do plano e o início da vigência.');
    return;
  }
  try {
    await createPgr({
      planReference: pgrForm.planReference.trim(),
      versionLabel: pgrForm.versionLabel.trim() || undefined,
      validFrom: pgrForm.validFrom,
      validUntil: pgrForm.validUntil || undefined
    });
    notify.success('PGR registrado.');
    pgrDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}
</script>

<template>
  <SicatPageLayout :loading="loadingDetail && !selected" :error="detailError">
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Transportador"
        :title="selected?.legalName || 'Carregando…'"
        :description="selected ? `${selected.documentType} ${selected.documentNumber}` : ''"
      >
        <template #actions>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
          <v-btn v-if="selected" variant="tonal" prepend-icon="mdi-pencil-outline" @click="openEditDialog">Editar</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <SicatCard v-if="selected" title="Cadastro">
      <div class="transp-carr__summary">
        <div><span>Nome fantasia</span><strong>{{ selected.tradeName || '-' }}</strong></div>
        <div><span>Papéis</span><strong>{{ (selected.roles || []).map(partyRoleLabel).join(', ') || '-' }}</strong></div>
        <div><span>Município/UF</span><strong>{{ selected.municipality ? `${selected.municipality}/${selected.uf}` : '-' }}</strong></div>
        <div><span>Ativo</span><strong>{{ selected.isActive ? 'Sim' : 'Não' }}</strong></div>
        <div><span>Atualizado em</span><strong>{{ formatDateTimeBR(selected.updatedAt) }}</strong></div>
      </div>
    </SicatCard>

    <SicatCard v-if="selected" title="RNTRC">
      <template #header-actions>
        <SicatStatusBadge :status="selected.rntrcStatus" :label="rntrcStatusLabel(selected.rntrcStatus)" domain="rntrc-status" with-dot />
        <v-btn size="small" variant="tonal" prepend-icon="mdi-shield-search-outline" @click="openRntrcDialog">Verificar RNTRC</v-btn>
      </template>

      <div class="transp-carr__summary">
        <div><span>Número</span><strong>{{ selected.rntrcNumber || '-' }}</strong></div>
        <div><span>Categoria</span><strong>{{ rntrcCategoryLabel(selected.rntrcCategory) }}</strong></div>
        <div><span>Verificado em</span><strong>{{ formatDateTimeBR(selected.rntrcVerifiedAt) }}</strong></div>
        <div><span>Fonte</span><strong>{{ rntrcStrategyLabel(selected.rntrcVerificationSource) }}</strong></div>
      </div>

      <h4 class="transp-carr__subsection-title">Histórico de verificações</h4>
      <SicatDataTable
        :headers="rntrcVerificationHeaders"
        :items="rntrcVerificationRows"
        :loading="loadingRntrcVerifications"
        :show-footer="false"
        density="compact"
        :empty="{ title: 'Nenhuma verificação registrada', icon: 'mdi-shield-search-outline' }"
      >
        <template #[`item.requestedStatus`]="{ item }">
          <SicatStatusBadge :status="item.requestedStatus" domain="rntrc-verification" with-dot size="sm" />
        </template>
      </SicatDataTable>
    </SicatCard>

    <SicatCard v-if="selected" title="Veículos vinculados">
      <template #header-actions>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-link-variant" @click="openLinkVehicleDialog">Vincular veículo</v-btn>
      </template>
      <SicatDataTable
        :headers="vehicleLinkHeaders"
        :items="vehicleLinkRows"
        :loading="loadingVehicleLinks"
        :show-footer="false"
        density="compact"
        :empty="{ title: 'Nenhum veículo vinculado', icon: 'mdi-truck-outline' }"
      >
        <template #[`item.linkType`]="{ item }">
          {{ item.linkTypeLabel }}
        </template>
        <template #[`item.vehicleType`]="{ item }">
          {{ item.vehicleTypeLabel }}
        </template>
      </SicatDataTable>
    </SicatCard>

    <SicatCard v-if="selected" title="Apólices de seguro">
      <template #header-actions>
        <v-btn size="small" variant="text" prepend-icon="mdi-refresh" :loading="commandLoading" @click="handleVerificarApolices">
          Verificar seguros
        </v-btn>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-shield-plus-outline" @click="openCreatePolicyDialog">Nova apólice</v-btn>
      </template>
      <SicatDataTable
        :headers="policyHeaders"
        :items="policyRows"
        :loading="loadingPolicies"
        :show-footer="false"
        density="compact"
        :empty="{ title: 'Nenhuma apólice registrada', icon: 'mdi-shield-off-outline' }"
      >
        <template #[`item.policyType`]="{ item }">
          {{ item.policyTypeLabel }}
        </template>
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="insurance-policy" with-dot size="sm" />
        </template>
        <template #[`item.expiry`]="{ item }">
          <v-chip size="small" :color="item.expiryTone === 'error' ? 'error' : (item.expiryTone === 'warning' ? 'warning' : undefined)" variant="tonal">
            {{ item.expiryLabel }}
          </v-chip>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" @click.stop="openEditPolicyDialog(item)">Editar</v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>

    <SicatCard v-if="selected" title="PGR — Programa de Gerenciamento de Risco">
      <template #header-actions>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-file-plus-outline" @click="openPgrDialog">Novo PGR</v-btn>
      </template>
      <SicatDataTable
        :headers="pgrHeaders"
        :items="pgrRows"
        :loading="loadingPgrs"
        :show-footer="false"
        density="compact"
        :empty="{ title: 'Nenhum PGR registrado', icon: 'mdi-file-document-alert-outline' }"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="pgr-status" with-dot size="sm" />
        </template>
      </SicatDataTable>
    </SicatCard>

    <!-- Editar cadastro -->
    <v-dialog v-model="editDialog" max-width="520" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Editar transportador">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <v-text-field v-model="editForm.legalName" label="Razão social" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="editForm.tradeName" label="Nome fantasia" density="comfortable" variant="outlined" hide-details="auto" />
          <v-select
            v-model="editForm.roles"
            :items="[{value:'contractor',label:'Contratante'},{value:'shipper',label:'Embarcador'},{value:'carrier',label:'Transportador'},{value:'subcontractor',label:'Subcontratado'},{value:'consignee',label:'Destinatário'},{value:'driver',label:'Motorista'}]"
            item-title="label"
            item-value="value"
            label="Papéis"
            multiple
            chips
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model="editForm.municipality" label="Município" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="editForm.uf" label="UF" maxlength="2" density="comfortable" variant="outlined" hide-details="auto" />
          <v-switch v-model="editForm.isActive" label="Ativo" density="comfortable" hide-details="auto" color="primary" />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="editDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitEdit">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Verificar RNTRC -->
    <v-dialog v-model="rntrcDialog" max-width="520" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Verificar RNTRC">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <SicatInlineAlert
            tone="info"
            message="'Dados abertos (ANTT)' consulta o Portal de Dados Abertos — é cache informativo, nunca prova de regularidade emitida pela ANTT. 'Declaração manual' registra o que você conferiu por fora."
          />
          <v-radio-group v-model="rntrcForm.strategy" hide-details="auto">
            <v-radio label="Dados abertos (ANTT)" value="open_data" />
            <v-radio label="Declaração manual" value="manual" />
          </v-radio-group>

          <template v-if="rntrcForm.strategy === 'manual'">
            <v-select
              v-model="rntrcForm.resultStatus"
              :items="[{value:'active',label:'Ativo'},{value:'suspended',label:'Suspenso'},{value:'cancelled',label:'Cancelado'},{value:'expired',label:'Vencido'},{value:'not_found',label:'Não encontrado'},{value:'unknown',label:'Desconhecido'}]"
              item-title="label"
              item-value="value"
              label="Status apurado"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
            />
            <v-select
              v-model="rntrcForm.resultCategory"
              :items="[{value:'TAC',label:'TAC'},{value:'ETC',label:'ETC'},{value:'CTC',label:'CTC'}]"
              item-title="label"
              item-value="value"
              label="Categoria (opcional)"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
              clearable
            />
            <v-textarea v-model="rntrcForm.notes" label="Notas (opcional)" rows="2" auto-grow density="comfortable" variant="outlined" hide-details="auto" />
          </template>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="rntrcDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitRntrc">Verificar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Vincular veículo -->
    <v-dialog v-model="linkVehicleDialog" max-width="480" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Vincular veículo">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <v-select
            v-model="linkForm.vehicleId"
            :items="availableVehicles"
            item-title="label"
            item-value="value"
            label="Veículo"
            :loading="loadingAvailableVehicles"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-select
            v-model="linkForm.linkType"
            :items="VEHICLE_LINK_TYPE_OPTIONS"
            item-title="label"
            item-value="value"
            label="Tipo de vínculo"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model="linkForm.validFrom" label="Válido a partir de (opcional)" type="date" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="linkForm.validUntil" label="Válido até (opcional)" type="date" density="comfortable" variant="outlined" hide-details="auto" />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="linkVehicleDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitLinkVehicle">Vincular</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Criar/editar apólice -->
    <v-dialog v-model="policyDialog" max-width="560" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" :title="policyEditingId ? 'Editar apólice' : 'Nova apólice'">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <v-select
            v-if="!policyEditingId"
            v-model="policyForm.policyType"
            :items="POLICY_TYPE_OPTIONS.filter((o) => o.value)"
            item-title="label"
            item-value="value"
            label="Tipo de apólice"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model="policyForm.insurerName" label="Seguradora" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="policyForm.insurerDocument" label="CNPJ da seguradora (opcional)" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field
            v-model="policyForm.policyNumber"
            label="Número da apólice"
            :disabled="Boolean(policyEditingId)"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model.number="policyForm.coverageAmount" label="Cobertura (R$, opcional)" type="number" min="0" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="policyForm.validFrom" label="Vigência início" type="date" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="policyForm.validUntil" label="Vigência fim" type="date" density="comfortable" variant="outlined" hide-details="auto" />
          <v-textarea v-model="policyForm.notes" label="Notas (opcional)" rows="2" auto-grow density="comfortable" variant="outlined" hide-details="auto" />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="policyDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitPolicy">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Novo PGR -->
    <v-dialog v-model="pgrDialog" max-width="480" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Novo PGR">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <v-text-field v-model="pgrForm.planReference" label="Referência do plano" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="pgrForm.versionLabel" label="Rótulo da versão (opcional)" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="pgrForm.validFrom" label="Vigência início" type="date" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="pgrForm.validUntil" label="Vigência fim (opcional)" type="date" density="comfortable" variant="outlined" hide-details="auto" />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="pgrDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitPgr">Registrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </SicatPageLayout>
</template>

<style scoped>
.transp-carr__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
}

.transp-carr__summary > div {
  display: grid;
  gap: 2px;
}

.transp-carr__summary span {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 700;
}

.transp-carr__summary strong {
  font-size: 0.88rem;
}

.transp-carr__subsection-title {
  margin: var(--space-4) 0 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.75);
}
</style>
