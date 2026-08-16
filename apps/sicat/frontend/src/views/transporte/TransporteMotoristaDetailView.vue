<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMotoristasStore } from '../../stores/motoristasStore.js';
import { useNotification } from '../../composables/useNotification.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import { listTransportCarriers } from '../../services/transporteService.js';
import {
  CNH_CATEGORY_OPTIONS,
  DRIVER_LINK_TYPE_OPTIONS,
  driverLinkStatusLabel,
  driverLinkTypeLabel,
  driverStatusLabel,
  formatDateBR,
  formatDateTimeBR,
  resolveDriverCnhStatus
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';
import SicatHelpHint from '../../components/sicat/SicatHelpHint.vue';

/**
 * Detalhe do motorista (Módulo Transportadora, onda F6 —
 * REQ-SICAT-0033/REQ-SICAT-0037). Molde: TransporteTransportadorDetailView.vue
 * (detalhe com seções + dialogs). Duas seções: dados/CNH (edição via dialog,
 * locking otimista) e vínculos com transportadores (criar/encerrar — encerrar
 * é PATCH de vigência com confirmação, nunca delete: o histórico é insumo da
 * GR nas fases seguintes).
 */

const route = useRoute();
const router = useRouter();
const store = useMotoristasStore();
const notify = useNotification();
const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel,
  dialogCancelLabel, dialogDanger, dialogShowCancel,
  confirm, accept, cancel
} = useConfirmDialog();

const {
  filters, selected, loadingDetail, detailError,
  carrierLinks, loadingCarrierLinks,
  commandLoading, commandError,
  loadById, updateDriver, loadCarrierLinks, createCarrierLink, endCarrierLink,
  clearCommandState, syncContext
} = store;

const driverId = computed(() => String(route.params.driverId || '').trim());

// Vigência derivada da CNH — decisão do frontend (helper puro); o badge usa o
// domínio `driver-cnh` com o label dinâmico daqui.
const cnhState = computed(() => resolveDriverCnhStatus(selected.value?.cnhValidUntil));

// LGPD: só `notes`/`documentRef` sobrevivem no evidence (contrato) — é o que a tela mostra.
const evidenceNotes = computed(() => String(selected.value?.evidence?.notes || '').trim());

const EVIDENCE_SOURCE_LABELS = Object.freeze({ manual: 'Declaração manual', mock: 'Simulada (sandbox)' });
const evidenceSourceLabel = computed(
  () => EVIDENCE_SOURCE_LABELS[String(selected.value?.evidenceSource || '').trim()] || '-'
);

async function loadAll(id) {
  if (!id) return;
  await loadById(id);
  await loadCarrierLinks(id);
}

watch(driverId, async (next) => {
  if (next) await loadAll(next);
});

onMounted(async () => {
  if (driverId.value) await loadAll(driverId.value);
});

function goBack() {
  router.push('/transporte/motoristas');
}

// --- Editar CNH / situação ------------------------------------------------

const editDialog = ref(false);
const editForm = reactive({ cnhNumber: '', cnhCategory: 'E', cnhValidUntil: '', cnhUf: '', status: 'active', notes: '' });

function openEditDialog() {
  if (!selected.value) return;
  Object.assign(editForm, {
    cnhNumber: selected.value.cnhNumber || '',
    cnhCategory: selected.value.cnhCategory || 'E',
    cnhValidUntil: selected.value.cnhValidUntil || '',
    cnhUf: selected.value.cnhUf || '',
    status: selected.value.status || 'active',
    notes: ''
  });
  clearCommandState();
  editDialog.value = true;
}

async function submitEdit() {
  if (!editForm.cnhNumber.trim() || !editForm.cnhValidUntil) {
    notify.warning('Informe o número e a validade da CNH.');
    return;
  }
  try {
    const payload = {
      cnhNumber: editForm.cnhNumber.trim(),
      cnhCategory: editForm.cnhCategory,
      cnhValidUntil: editForm.cnhValidUntil,
      status: editForm.status
    };
    if (editForm.cnhUf.trim()) payload.cnhUf = editForm.cnhUf.trim().toUpperCase();
    if (editForm.notes.trim()) payload.evidence = { notes: editForm.notes.trim() };
    await updateDriver(driverId.value, payload);
    notify.success('Motorista atualizado.');
    editDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// --- Vínculos com transportadores ----------------------------------------

const linkHeaders = [
  { title: 'Transportador', key: 'carrierName', sortable: false },
  { title: 'Tipo', key: 'linkType', sortable: false },
  { title: 'Vigência', key: 'validity', sortable: false },
  { title: 'Situação', key: 'status', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const linkRows = computed(() =>
  carrierLinks.value.map((link) => ({
    id: link.id,
    carrierName: link.carrierName,
    linkType: link.linkType,
    linkTypeLabel: driverLinkTypeLabel(link.linkType),
    validity: `${formatDateBR(link.validFrom)} – ${link.validUntil ? formatDateBR(link.validUntil) : 'indeterminada'}`,
    status: link.status,
    statusLabel: driverLinkStatusLabel(link.status)
  }))
);

/** Data LOCAL de hoje em `YYYY-MM-DD` — default didático do início da vigência. */
function todayIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const linkDialog = ref(false);
const linkForm = reactive({ carrierPartyId: '', linkType: 'fleet', validFrom: '', validUntil: '' });
const availableCarriers = ref([]);
const loadingAvailableCarriers = ref(false);

async function openLinkDialog() {
  Object.assign(linkForm, { carrierPartyId: '', linkType: 'fleet', validFrom: todayIsoDate(), validUntil: '' });
  clearCommandState();
  linkDialog.value = true;
  loadingAvailableCarriers.value = true;
  try {
    // O contrato pede um TransporteTransportadorResource da MESMA conta —
    // recorte por papel `carrier` (é o lado transportador do vínculo).
    const ctx = syncContext();
    const response = await listTransportCarriers({
      integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
      role: 'carrier',
      pageSize: 200
    });
    availableCarriers.value = (Array.isArray(response.items) ? response.items : []).map((carrier) => ({
      value: carrier.id,
      label: `${carrier.legalName} · ${carrier.documentType} ${carrier.documentNumber}`
    }));
  } catch {
    availableCarriers.value = [];
  } finally {
    loadingAvailableCarriers.value = false;
  }
}

async function submitLink() {
  if (!linkForm.carrierPartyId) {
    notify.warning('Selecione o transportador.');
    return;
  }
  if (!linkForm.validFrom) {
    notify.warning('Informe o início da vigência.');
    return;
  }
  try {
    await createCarrierLink({
      carrierPartyId: linkForm.carrierPartyId,
      linkType: linkForm.linkType,
      validFrom: linkForm.validFrom,
      validUntil: linkForm.validUntil || undefined
    });
    notify.success('Vínculo criado.');
    linkDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleEndLink(row) {
  const ok = await confirm({
    title: 'Encerrar vínculo',
    message: `Encerrar o vínculo ${row.linkTypeLabel.toLowerCase()} com ${row.carrierName}? O fim da vigência será registrado hoje e o histórico permanece consultável — encerrar nunca apaga.`,
    confirmLabel: 'Encerrar vínculo',
    danger: true
  });
  if (!ok) return;
  try {
    await endCarrierLink(row.id);
    notify.success('Vínculo encerrado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}
</script>

<template>
  <SicatPageLayout :loading="loadingDetail && !selected" :error="detailError">
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Motorista"
        :title="selected?.partyName || 'Carregando…'"
        :description="selected ? `CPF ${selected.partyDocumentNumber}` : ''"
      >
        <template #actions>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
          <v-btn v-if="selected" variant="tonal" prepend-icon="mdi-pencil-outline" @click="openEditDialog">Editar CNH</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <SicatCard v-if="selected" title="CNH e situação">
      <template #header-actions>
        <SicatStatusBadge :status="cnhState.status" :label="cnhState.label" domain="driver-cnh" with-dot />
        <SicatHelpHint term="cnh" />
      </template>
      <div class="transp-mot-det__summary">
        <div><span>Número da CNH</span><strong>{{ selected.cnhNumber }}</strong></div>
        <div><span>Categoria</span><strong>{{ selected.cnhCategory }}</strong></div>
        <div><span>Válida até</span><strong>{{ formatDateBR(selected.cnhValidUntil) }}</strong></div>
        <div><span>UF emissora</span><strong>{{ selected.cnhUf || '-' }}</strong></div>
        <div><span>Situação</span><strong>{{ driverStatusLabel(selected.status) }}</strong></div>
        <div><span>Fonte da declaração</span><strong>{{ evidenceSourceLabel }}</strong></div>
        <div v-if="evidenceNotes"><span>Notas</span><strong>{{ evidenceNotes }}</strong></div>
        <div><span>Atualizado em</span><strong>{{ formatDateTimeBR(selected.updatedAt) }}</strong></div>
      </div>
    </SicatCard>

    <SicatCard v-if="selected" title="Vínculos com transportadores">
      <template #header-actions>
        <span class="transp-mot-det__hints">
          Frota<SicatHelpHint term="frota" />
          · Agregado<SicatHelpHint term="agregado" />
        </span>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-link-variant" @click="openLinkDialog">Novo vínculo</v-btn>
      </template>
      <SicatDataTable
        :headers="linkHeaders"
        :items="linkRows"
        :loading="loadingCarrierLinks"
        :show-footer="false"
        density="compact"
        :empty="{ title: 'Nenhum vínculo registrado', description: 'Vincule o motorista a um transportador como frota ou agregado.', icon: 'mdi-link-variant-off' }"
      >
        <template #[`item.linkType`]="{ item }">
          <v-chip size="small" variant="tonal" :color="item.linkType === 'fleet' ? 'primary' : undefined">
            {{ item.linkTypeLabel }}
          </v-chip>
        </template>
        <template #[`item.status`]="{ item }">
          <v-chip size="small" variant="tonal" :color="item.status === 'active' ? 'success' : undefined">
            {{ item.statusLabel }}
          </v-chip>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn
            v-if="item.status === 'active'"
            size="small"
            variant="text"
            color="error"
            :disabled="commandLoading"
            @click.stop="handleEndLink(item)"
          >
            Encerrar
          </v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>

    <!-- Editar CNH / situação -->
    <v-dialog v-model="editDialog" max-width="520" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Editar CNH">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <v-text-field v-model="editForm.cnhNumber" label="Número da CNH" density="comfortable" variant="outlined" hide-details="auto" />
          <v-select
            v-model="editForm.cnhCategory"
            :items="CNH_CATEGORY_OPTIONS"
            item-title="label"
            item-value="value"
            label="Categoria"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model="editForm.cnhValidUntil" label="Válida até" type="date" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="editForm.cnhUf" label="UF emissora (opcional)" maxlength="2" density="comfortable" variant="outlined" hide-details="auto" />
          <v-select
            v-model="editForm.status"
            :items="[{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }]"
            item-title="label"
            item-value="value"
            label="Situação"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-textarea v-model="editForm.notes" label="Notas (opcional)" rows="2" auto-grow density="comfortable" variant="outlined" hide-details="auto" />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="editDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitEdit">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Novo vínculo -->
    <v-dialog v-model="linkDialog" max-width="480" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Novo vínculo com transportador">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <SicatInlineAlert
            tone="info"
            message="No máximo UM vínculo vigente por transportador e tipo — encerre o vigente antes de criar outro do mesmo tipo."
          />
          <v-select
            v-model="linkForm.carrierPartyId"
            :items="availableCarriers"
            item-title="label"
            item-value="value"
            label="Transportador"
            :loading="loadingAvailableCarriers"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-select
            v-model="linkForm.linkType"
            :items="DRIVER_LINK_TYPE_OPTIONS"
            item-title="label"
            item-value="value"
            label="Tipo de vínculo"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model="linkForm.validFrom" label="Válido a partir de" type="date" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="linkForm.validUntil" label="Válido até (opcional)" type="date" density="comfortable" variant="outlined" hide-details="auto" />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="linkDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitLink">Vincular</v-btn>
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
.transp-mot-det__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
}

.transp-mot-det__summary > div {
  display: grid;
  gap: 2px;
}

.transp-mot-det__summary span {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 700;
}

.transp-mot-det__summary strong {
  font-size: 0.88rem;
}

.transp-mot-det__hints {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
</style>
