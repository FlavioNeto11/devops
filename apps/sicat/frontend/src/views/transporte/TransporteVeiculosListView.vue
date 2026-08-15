<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { useVeiculosStore } from '../../stores/veiculosStore.js';
import { useNotification } from '../../composables/useNotification.js';
import {
  formatDateTimeBR,
  VEHICLE_TYPE_OPTIONS,
  vehicleLinkTypeLabel,
  vehicleTypeLabel
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

/**
 * Cadastro de veículos (DL-103, PR-H2 — frontend completo). Molde:
 * TransporteOperacaoListView.vue (paginação servidora, filtros, tabela).
 * Detalhe do veículo abre em drawer lateral (sem rota própria — cadastro
 * simples, sem sub-recursos que justifiquem uma tela dedicada).
 */

const authStore = useAuthStore();
const store = useVeiculosStore();
const notify = useNotification();

const {
  filters, items, totalItems, totalPages, loadingList, listError,
  selected, loadingDetail, commandLoading, commandError, commandFeedback,
  fetchList, loadById, createVehicle, updateVehicle, resetFilters, clearCommandState
} = store;

const headers = [
  { title: 'Placa', key: 'plate', sortable: false },
  { title: 'RENAVAM', key: 'renavam', sortable: false },
  { title: 'Tipo', key: 'vehicleType', sortable: false },
  { title: 'Eixos', key: 'axlesCount', sortable: false },
  { title: 'Ativo', key: 'isActive', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  items.value.map((vehicle) => ({
    id: vehicle.id,
    plate: vehicle.plate,
    renavam: vehicle.renavam || '-',
    vehicleTypeLabel: vehicleTypeLabel(vehicle.vehicleType),
    axlesCount: vehicle.axlesCount ?? '-',
    isActive: vehicle.isActive ? 'Sim' : 'Não'
  }))
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.search) chips.push({ key: 'search', label: `Busca: ${filters.search}` });
  if (filters.vehicleType) chips.push({ key: 'vehicleType', label: `Tipo: ${vehicleTypeLabel(filters.vehicleType)}` });
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
  return `${value} ${value === 1 ? 'veículo encontrado' : 'veículos encontrados'}`;
});

// --- Criar veículo -----------------------------------------------------

const createDialog = ref(false);
const createForm = reactive({ plate: '', renavam: '', vehicleType: 'truck', axlesCount: null, cargoBodyType: '' });

function openCreateDialog() {
  Object.assign(createForm, { plate: '', renavam: '', vehicleType: 'truck', axlesCount: null, cargoBodyType: '' });
  clearCommandState();
  createDialog.value = true;
}

async function submitCreate() {
  if (!createForm.plate.trim()) {
    notify.warning('Informe a placa do veículo.');
    return;
  }
  try {
    const payload = { plate: createForm.plate.trim(), vehicleType: createForm.vehicleType };
    if (createForm.renavam.trim()) payload.renavam = createForm.renavam.trim();
    if (createForm.axlesCount) payload.axlesCount = Number(createForm.axlesCount);
    if (createForm.cargoBodyType.trim()) payload.cargoBodyType = createForm.cargoBodyType.trim();
    await createVehicle(payload);
    notify.success('Veículo cadastrado.');
    createDialog.value = false;
    await fetchList();
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// --- Drawer de detalhe/edição -------------------------------------------

const detailDrawer = ref(false);
const editMode = ref(false);
const editForm = reactive({ renavam: '', vehicleType: '', axlesCount: null, cargoBodyType: '', isActive: true });

async function openDetail(vehicleId) {
  editMode.value = false;
  detailDrawer.value = true;
  await loadById(vehicleId);
}

function startEdit() {
  if (!selected.value) return;
  Object.assign(editForm, {
    renavam: selected.value.renavam || '',
    vehicleType: selected.value.vehicleType,
    axlesCount: selected.value.axlesCount,
    cargoBodyType: selected.value.cargoBodyType || '',
    isActive: selected.value.isActive
  });
  clearCommandState();
  editMode.value = true;
}

async function submitEdit() {
  if (!selected.value) return;
  try {
    const payload = {
      renavam: editForm.renavam.trim() || undefined,
      vehicleType: editForm.vehicleType,
      axlesCount: editForm.axlesCount ? Number(editForm.axlesCount) : undefined,
      cargoBodyType: editForm.cargoBodyType.trim() || undefined,
      isActive: editForm.isActive
    };
    await updateVehicle(selected.value.id, payload);
    notify.success('Veículo atualizado.');
    editMode.value = false;
    await fetchList();
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
        kicker="Transporte · Cadastros"
        title="Veículos"
        description="Cadastro-base de veículos usados nas operações de transporte."
      >
        <template #actions>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-truck-plus-outline" @click="openCreateDialog">
            Novo veículo
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta para listar veículos."
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
          label="Buscar (placa ou RENAVAM)"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-select
          v-model="filters.vehicleType"
          :items="VEHICLE_TYPE_OPTIONS"
          item-title="label"
          item-value="value"
          label="Tipo de veículo"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
      </SicatFiltersPanel>
    </template>

    <SicatCard :title="totalLabel" flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loadingList"
        :error="listError"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{ title: 'Nenhum veículo cadastrado', description: 'Cadastre um veículo para vincular a operações.', icon: 'mdi-truck-outline' }"
        @row-click="(row) => row?.id && openDetail(row.id)"
      >
        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" @click.stop="openDetail(item.id)">Detalhar</v-btn>
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

    <!-- Criar veículo -->
    <v-dialog v-model="createDialog" max-width="520" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Novo veículo">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <v-text-field v-model="createForm.plate" label="Placa" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="createForm.renavam" label="RENAVAM (opcional)" density="comfortable" variant="outlined" hide-details="auto" />
          <v-select
            v-model="createForm.vehicleType"
            :items="VEHICLE_TYPE_OPTIONS.filter((o) => o.value)"
            item-title="label"
            item-value="value"
            label="Tipo de veículo"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field
            v-model.number="createForm.axlesCount"
            label="Nº de eixos (opcional)"
            type="number"
            min="1"
            max="12"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model="createForm.cargoBodyType" label="Tipo de carroceria (opcional)" density="comfortable" variant="outlined" hide-details="auto" />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="createDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitCreate">Cadastrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Detalhe/edição em drawer -->
    <v-navigation-drawer v-model="detailDrawer" location="right" temporary width="420">
      <div class="transp-veic__drawer">
        <header class="transp-veic__drawer-head">
          <h2 class="transp-veic__drawer-title">{{ selected?.plate || 'Veículo' }}</h2>
          <v-btn icon="mdi-close" variant="text" size="small" @click="detailDrawer = false" />
        </header>

        <v-progress-linear v-if="loadingDetail" indeterminate color="primary" />

        <template v-else-if="selected">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <SicatInlineAlert v-if="commandFeedback && !editMode" tone="success" :message="commandFeedback" />

          <template v-if="!editMode">
            <dl class="transp-veic__fields">
              <div><dt>Placa</dt><dd>{{ selected.plate }}</dd></div>
              <div><dt>RENAVAM</dt><dd>{{ selected.renavam || '-' }}</dd></div>
              <div><dt>Tipo</dt><dd>{{ vehicleTypeLabel(selected.vehicleType) }}</dd></div>
              <div><dt>Nº de eixos</dt><dd>{{ selected.axlesCount ?? '-' }}</dd></div>
              <div><dt>Carroceria</dt><dd>{{ selected.cargoBodyType || '-' }}</dd></div>
              <div><dt>Ativo</dt><dd>{{ selected.isActive ? 'Sim' : 'Não' }}</dd></div>
              <div><dt>Atualizado em</dt><dd>{{ formatDateTimeBR(selected.updatedAt) }}</dd></div>
            </dl>
            <v-btn variant="tonal" prepend-icon="mdi-pencil-outline" @click="startEdit">Editar</v-btn>
          </template>

          <template v-else>
            <v-text-field v-model="editForm.renavam" label="RENAVAM" density="comfortable" variant="outlined" hide-details="auto" />
            <v-select
              v-model="editForm.vehicleType"
              :items="VEHICLE_TYPE_OPTIONS.filter((o) => o.value)"
              item-title="label"
              item-value="value"
              label="Tipo de veículo"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
            />
            <v-text-field v-model.number="editForm.axlesCount" label="Nº de eixos" type="number" min="1" max="12" density="comfortable" variant="outlined" hide-details="auto" />
            <v-text-field v-model="editForm.cargoBodyType" label="Tipo de carroceria" density="comfortable" variant="outlined" hide-details="auto" />
            <v-switch v-model="editForm.isActive" label="Ativo" density="comfortable" hide-details="auto" color="primary" />
            <div class="transp-veic__drawer-actions">
              <v-btn variant="text" @click="editMode = false">Cancelar</v-btn>
              <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitEdit">Salvar</v-btn>
            </div>
          </template>
        </template>
      </div>
    </v-navigation-drawer>
  </SicatPageLayout>
</template>

<style scoped>
.transp-veic__drawer {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
}

.transp-veic__drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.transp-veic__drawer-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.transp-veic__fields {
  display: grid;
  gap: 10px;
}

.transp-veic__fields > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
  padding-bottom: 6px;
}

.transp-veic__fields dt {
  font-size: 0.78rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.transp-veic__fields dd {
  margin: 0;
  font-size: 0.88rem;
  text-align: right;
}

.transp-veic__drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
