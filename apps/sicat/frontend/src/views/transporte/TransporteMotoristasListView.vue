<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useMotoristasStore } from '../../stores/motoristasStore.js';
import { useNotification } from '../../composables/useNotification.js';
import { listTransportCarriers } from '../../services/transporteService.js';
import {
  CNH_CATEGORY_OPTIONS,
  DRIVER_STATUS_OPTIONS,
  driverStatusLabel,
  resolveDriverCnhStatus,
  formatDateBR
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatHelpHint from '../../components/sicat/SicatHelpHint.vue';

/**
 * Cadastro de motoristas (Módulo Transportadora, onda F6 —
 * REQ-SICAT-0033/REQ-SICAT-0037). Molde: TransporteVeiculosListView.vue
 * (lista com criação) + TransporteTransportadoresListView.vue (navegação para
 * detalhe por rota própria — motorista TEM sub-recursos: vínculos com
 * transportadores). O vínculo vigente NÃO aparece como coluna: o
 * TransporteMotoristaResource do contrato não traz os vínculos na listagem
 * (eles vivem em `/motoristas/{driverId}/vinculos`) — buscar N+1 por linha
 * seria round-trip que o contrato evitou de propósito; o chip frota/agregado
 * fica no detalhe.
 */

const router = useRouter();
const authStore = useAuthStore();
const store = useMotoristasStore();
const notify = useNotification();

const {
  filters, items, totalItems, totalPages, loadingList, listError,
  commandLoading, commandError,
  fetchList, createDriver, resetFilters, clearCommandState, syncContext
} = store;

const headers = [
  { title: 'Motorista', key: 'partyName', sortable: false },
  { title: 'CPF', key: 'partyDocumentNumber', sortable: false },
  { title: 'CNH', key: 'cnh', sortable: false },
  { title: 'Validade da CNH', key: 'cnhExpiry', sortable: false },
  { title: 'Situação', key: 'status', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  items.value.map((driver) => {
    // A decisão válida/vencendo/vencida é do frontend (helper puro) — o badge
    // usa o domínio `driver-cnh` do status-map com o label dinâmico daqui.
    const cnhState = resolveDriverCnhStatus(driver.cnhValidUntil);
    return {
      id: driver.id,
      partyName: driver.partyName,
      partyDocumentNumber: driver.partyDocumentNumber,
      cnhLabel: `${driver.cnhNumber} · ${driver.cnhCategory}`,
      cnhValidUntilLabel: formatDateBR(driver.cnhValidUntil),
      cnhStatus: cnhState.status,
      cnhStatusLabel: cnhState.label,
      status: driver.status,
      statusLabel: driverStatusLabel(driver.status)
    };
  })
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.search) chips.push({ key: 'search', label: `Busca: ${filters.search}` });
  if (filters.status) chips.push({ key: 'status', label: `Situação: ${driverStatusLabel(filters.status)}` });
  return chips;
});

async function applyFilters() {
  filters.page = 1;
  await fetchList();
}

function removeChip(key) {
  filters[key] = '';
  void applyFilters();
}

function goToDetail(id) {
  router.push(`/transporte/motoristas/${encodeURIComponent(id)}`);
}

async function changePage(delta) {
  filters.page = Math.max(Number(filters.page || 1) + delta, 1);
  await fetchList();
}

const canPrevious = computed(() => Number(filters.page || 1) > 1 && !loadingList.value);
const canNext = computed(() => {
  if (loadingList.value) return false;
  return Number(filters.page || 1) < Number(totalPages.value || 0);
});

const totalLabel = computed(() => {
  const value = Number(totalItems.value || 0);
  return `${value} ${value === 1 ? 'motorista encontrado' : 'motoristas encontrados'}`;
});

// --- Criar motorista -----------------------------------------------------
// O contrato manda `partyId` de uma parte PF (CPF) JÁ cadastrada na conta —
// não existe endpoint dedicado de "partes PF": a fonte é a mesma lista de
// `/v1/transporte/transportadores` (que guarda TODAS as partes), filtrada
// AQUI por documentType CPF. Sem filtrar por papel `driver` de propósito: o
// papel é ADICIONADO pelo próprio POST quando faltar (contrato) — filtrar
// esconderia exatamente as partes que ainda vão virar motorista.

const createDialog = ref(false);
const createForm = reactive({
  partyId: '',
  cnhNumber: '',
  cnhCategory: 'E',
  cnhValidUntil: '',
  cnhUf: '',
  notes: ''
});
const availableParties = ref([]);
const loadingAvailableParties = ref(false);

async function openCreateDialog() {
  Object.assign(createForm, {
    partyId: '', cnhNumber: '', cnhCategory: 'E', cnhValidUntil: '', cnhUf: '', notes: ''
  });
  clearCommandState();
  createDialog.value = true;
  loadingAvailableParties.value = true;
  try {
    const ctx = syncContext();
    const response = await listTransportCarriers({
      integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
      pageSize: 200
    });
    const parties = Array.isArray(response.items) ? response.items : [];
    availableParties.value = parties
      .filter((party) => party.documentType === 'CPF')
      .map((party) => ({
        value: party.id,
        label: `${party.legalName} · CPF ${party.documentNumber}`
      }));
  } catch {
    availableParties.value = [];
  } finally {
    loadingAvailableParties.value = false;
  }
}

async function submitCreate() {
  if (!createForm.partyId) {
    notify.warning('Selecione a pessoa (parte PF) que será o motorista.');
    return;
  }
  if (!createForm.cnhNumber.trim() || !createForm.cnhValidUntil) {
    notify.warning('Informe o número e a validade da CNH.');
    return;
  }
  try {
    const payload = {
      partyId: createForm.partyId,
      cnhNumber: createForm.cnhNumber.trim(),
      cnhCategory: createForm.cnhCategory,
      cnhValidUntil: createForm.cnhValidUntil
    };
    if (createForm.cnhUf.trim()) payload.cnhUf = createForm.cnhUf.trim().toUpperCase();
    if (createForm.notes.trim()) payload.evidence = { notes: createForm.notes.trim() };
    const created = await createDriver(payload);
    notify.success('Motorista cadastrado.');
    createDialog.value = false;
    await fetchList();
    if (created?.id) goToDetail(created.id);
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

onMounted(async () => {
  await fetchList();
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Frota"
        title="Motoristas"
        description="CNH declarada, vínculo com transportadores (frota ou agregado) e situação de cada motorista."
      >
        <template #actions>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-card-account-details-outline" @click="openCreateDialog">
            Novo motorista
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta para listar motoristas."
      />
    </template>

    <template #filters>
      <SicatFiltersPanel
        :active-chips="activeChips"
        :loading="loadingList"
        @apply="applyFilters"
        @clear="resetFilters"
        @remove="removeChip"
      >
        <v-text-field
          v-model="filters.search"
          label="Buscar (nome ou número de CNH)"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-select
          v-model="filters.status"
          :items="DRIVER_STATUS_OPTIONS"
          item-title="label"
          item-value="value"
          label="Situação"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
      </SicatFiltersPanel>
    </template>

    <!-- Didática do módulo: mesmos verbetes que o glossário do menu usa
         (padrão do strip "Termos frequentes" de TransporteRegrasView). -->
    <div class="transp-mot__glossary">
      <span class="transp-mot__glossary-label">Termos frequentes:</span>
      <span class="transp-mot__glossary-item">CNH<SicatHelpHint term="cnh" /></span>
      <span class="transp-mot__glossary-item">Frota<SicatHelpHint term="frota" /></span>
      <span class="transp-mot__glossary-item">Agregado<SicatHelpHint term="agregado" /></span>
    </div>

    <SicatCard :title="totalLabel" flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loadingList"
        :error="listError"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{ title: 'Nenhum motorista cadastrado', description: 'Cadastre um motorista para vincular à frota ou como agregado.', icon: 'mdi-card-account-details-outline' }"
        @row-click="(row) => row?.id && goToDetail(row.id)"
      >
        <template #[`item.cnh`]="{ item }">
          {{ item.cnhLabel }}
        </template>
        <template #[`item.cnhExpiry`]="{ item }">
          <div class="transp-mot__expiry">
            <span>{{ item.cnhValidUntilLabel }}</span>
            <SicatStatusBadge :status="item.cnhStatus" :label="item.cnhStatusLabel" domain="driver-cnh" with-dot size="sm" />
          </div>
        </template>
        <template #[`item.status`]="{ item }">
          {{ item.statusLabel }}
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" @click.stop="goToDetail(item.id)">Detalhar</v-btn>
        </template>
        <template #footer>
          <v-btn variant="text" :disabled="!canPrevious" prepend-icon="mdi-chevron-left" @click="changePage(-1)">Anterior</v-btn>
          <span class="text-caption text-medium-emphasis">
            Página {{ filters.page || 1 }} de {{ totalPages || 1 }} · {{ Number(totalItems || 0) }} no total
          </span>
          <v-btn variant="text" :disabled="!canNext" append-icon="mdi-chevron-right" @click="changePage(1)">Próxima</v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>

    <!-- Criar motorista -->
    <v-dialog v-model="createDialog" max-width="560" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Novo motorista">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <SicatInlineAlert
            v-if="!loadingAvailableParties && availableParties.length === 0"
            tone="info"
            message="Motorista é uma pessoa física (CPF) já cadastrada como parte. Nenhuma parte PF encontrada nesta conta — cadastre a pessoa primeiro em Frota → Transportadores (tipo de documento CPF) e volte aqui."
          />
          <v-select
            v-model="createForm.partyId"
            :items="availableParties"
            item-title="label"
            item-value="value"
            label="Pessoa (parte PF da conta)"
            :loading="loadingAvailableParties"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <div class="transp-mot__field-hint">
            <span>CNH declarada (sem verificação externa nesta fase)</span>
            <SicatHelpHint term="cnh" />
          </div>
          <v-text-field v-model="createForm.cnhNumber" label="Número da CNH" density="comfortable" variant="outlined" hide-details="auto" />
          <v-select
            v-model="createForm.cnhCategory"
            :items="CNH_CATEGORY_OPTIONS"
            item-title="label"
            item-value="value"
            label="Categoria"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model="createForm.cnhValidUntil" label="Válida até" type="date" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="createForm.cnhUf" label="UF emissora (opcional)" maxlength="2" density="comfortable" variant="outlined" hide-details="auto" />
          <v-textarea v-model="createForm.notes" label="Notas (opcional)" rows="2" auto-grow density="comfortable" variant="outlined" hide-details="auto" />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="createDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitCreate">Cadastrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </SicatPageLayout>
</template>

<style scoped>
.transp-mot__glossary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--space-3);
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.transp-mot__glossary-label {
  font-weight: 700;
}

.transp-mot__glossary-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.transp-mot__expiry {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.transp-mot__field-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
