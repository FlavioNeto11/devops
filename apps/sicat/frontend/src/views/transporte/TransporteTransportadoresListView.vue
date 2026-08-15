<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useTransportadoresStore } from '../../stores/transportadoresStore.js';
import { useNotification } from '../../composables/useNotification.js';
import {
  DOCUMENT_TYPE_OPTIONS,
  PARTY_ROLE_OPTIONS,
  partyRoleLabel,
  rntrcStatusLabel
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

/**
 * Cadastro de transportadores (DL-103, PR-H2 — frontend completo). Molde:
 * TransporteOperacaoListView.vue.
 */

const router = useRouter();
const authStore = useAuthStore();
const store = useTransportadoresStore();
const notify = useNotification();

const {
  filters, items, totalItems, totalPages, loadingList, listError,
  commandLoading, commandError,
  fetchList, createCarrier, resetFilters, clearCommandState
} = store;

const RNTRC_STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'unknown', label: rntrcStatusLabel('unknown') },
  { value: 'active', label: rntrcStatusLabel('active') },
  { value: 'suspended', label: rntrcStatusLabel('suspended') },
  { value: 'cancelled', label: rntrcStatusLabel('cancelled') },
  { value: 'expired', label: rntrcStatusLabel('expired') }
];

const headers = [
  { title: 'Razão social', key: 'legalName', sortable: false },
  { title: 'Documento', key: 'documentNumber', sortable: false },
  { title: 'Papéis', key: 'roles', sortable: false },
  { title: 'RNTRC', key: 'rntrcStatus', sortable: false },
  { title: 'Ativo', key: 'isActive', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  items.value.map((carrier) => ({
    id: carrier.id,
    legalName: carrier.legalName,
    documentLabel: `${carrier.documentType} ${carrier.documentNumber}`,
    rolesLabel: (carrier.roles || []).map(partyRoleLabel).join(', ') || '-',
    rntrcStatus: carrier.rntrcStatus,
    rntrcStatusLabel: rntrcStatusLabel(carrier.rntrcStatus),
    isActive: carrier.isActive ? 'Sim' : 'Não'
  }))
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.search) chips.push({ key: 'search', label: `Busca: ${filters.search}` });
  if (filters.rntrcStatus) chips.push({ key: 'rntrcStatus', label: `RNTRC: ${rntrcStatusLabel(filters.rntrcStatus)}` });
  if (filters.role) chips.push({ key: 'role', label: `Papel: ${partyRoleLabel(filters.role)}` });
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
  router.push(`/transporte/transportadores/${encodeURIComponent(id)}`);
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
  return `${value} ${value === 1 ? 'transportador encontrado' : 'transportadores encontrados'}`;
});

// --- Criar transportador -----------------------------------------------

const createDialog = ref(false);
const createForm = reactive({
  documentType: 'CNPJ',
  documentNumber: '',
  legalName: '',
  tradeName: '',
  roles: ['carrier'],
  municipality: '',
  uf: ''
});

function openCreateDialog() {
  Object.assign(createForm, {
    documentType: 'CNPJ',
    documentNumber: '',
    legalName: '',
    tradeName: '',
    roles: ['carrier'],
    municipality: '',
    uf: ''
  });
  clearCommandState();
  createDialog.value = true;
}

async function submitCreate() {
  if (!createForm.documentNumber.trim() || !createForm.legalName.trim()) {
    notify.warning('Informe o documento e a razão social.');
    return;
  }
  try {
    const payload = {
      documentType: createForm.documentType,
      documentNumber: createForm.documentNumber.trim(),
      legalName: createForm.legalName.trim(),
      roles: createForm.roles
    };
    if (createForm.tradeName.trim()) payload.tradeName = createForm.tradeName.trim();
    if (createForm.municipality.trim()) payload.municipality = createForm.municipality.trim();
    if (createForm.uf.trim()) payload.uf = createForm.uf.trim().toUpperCase();
    const created = await createCarrier(payload);
    notify.success('Transportador cadastrado.');
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
        kicker="Transporte · Cadastros"
        title="Transportadores"
        description="Cadastro-base de transportadores, com RNTRC declarado, seguros e PGR."
      >
        <template #actions>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-account-plus-outline" @click="openCreateDialog">
            Novo transportador
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta para listar transportadores."
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
          label="Buscar (razão social, nome fantasia ou documento)"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-select
          v-model="filters.rntrcStatus"
          :items="RNTRC_STATUS_OPTIONS"
          item-title="label"
          item-value="value"
          label="Status RNTRC"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-select
          v-model="filters.role"
          :items="PARTY_ROLE_OPTIONS"
          item-title="label"
          item-value="value"
          label="Papel"
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
        :empty="{ title: 'Nenhum transportador cadastrado', description: 'Cadastre um transportador para vincular a operações.', icon: 'mdi-account-outline' }"
        @row-click="(row) => row?.id && goToDetail(row.id)"
      >
        <template #[`item.roles`]="{ item }">
          {{ item.rolesLabel }}
        </template>
        <template #[`item.rntrcStatus`]="{ item }">
          <SicatStatusBadge :status="item.rntrcStatus" :label="item.rntrcStatusLabel" domain="rntrc-status" with-dot />
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

    <!-- Criar transportador -->
    <v-dialog v-model="createDialog" max-width="560" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Novo transportador">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <v-select
            v-model="createForm.documentType"
            :items="DOCUMENT_TYPE_OPTIONS"
            item-title="label"
            item-value="value"
            label="Tipo de documento"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model="createForm.documentNumber" label="Número do documento" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="createForm.legalName" label="Razão social" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="createForm.tradeName" label="Nome fantasia (opcional)" density="comfortable" variant="outlined" hide-details="auto" />
          <v-select
            v-model="createForm.roles"
            :items="PARTY_ROLE_OPTIONS.filter((o) => o.value)"
            item-title="label"
            item-value="value"
            label="Papéis"
            multiple
            chips
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field v-model="createForm.municipality" label="Município (opcional)" density="comfortable" variant="outlined" hide-details="auto" />
          <v-text-field v-model="createForm.uf" label="UF (opcional)" maxlength="2" density="comfortable" variant="outlined" hide-details="auto" />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="createDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitCreate">Cadastrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </SicatPageLayout>
</template>
