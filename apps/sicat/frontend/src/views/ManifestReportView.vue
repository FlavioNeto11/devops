<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import SicatDateInput from '../components/shared/inputs/SicatDateInput.vue';
import { listManifests } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { brDateToIsoDate, formatDateBr, getTodayBr, isoDateToBrDate, normalizeBrDateInput, toApiDate } from '../utils/date-format.js';
import { evaluateDateRange } from '../utils/date-range-validation.js';
import SicatPageLayout from '../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../components/shell/SicatPageHeader.vue';
import SicatStatusBadge from '../components/sicat/SicatStatusBadge.vue';

const REPORT_FILTERS_KEY = 'sicat_manifest_report_filters';
const DEFAULT_PAGE_SIZE = 20;

const router = useRouter();
const authStore = useAuthStore();

const dateRangeHoverIso = ref('');
const dateFromFieldRef = ref(null);
const dateToFieldRef = ref(null);
const dateFilterError = ref('');
const dateFilterInfo = ref('');
const DATE_WINDOW_NOTICE_DAYS = 31;

function formatDateOffsetBr(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function buildDefaultFilters() {
  return {
    status: '',
    manifestNumber: '',
    carrierQuery: '',
    receiverQuery: '',
    dateFrom: formatDateOffsetBr(-30),
    dateTo: getTodayBr(),
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE
  };
}

function loadPersistedFilters() {
  try {
    const raw = localStorage.getItem(REPORT_FILTERS_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function persistFilters(filters) {
  const payload = {
    status: String(filters.status || '').trim(),
    manifestNumber: String(filters.manifestNumber || '').trim(),
    carrierQuery: String(filters.carrierQuery || '').trim(),
    receiverQuery: String(filters.receiverQuery || '').trim(),
    dateFrom: String(filters.dateFrom || '').trim(),
    dateTo: String(filters.dateTo || '').trim(),
    page: Number(filters.page || 1),
    pageSize: Number(filters.pageSize || DEFAULT_PAGE_SIZE)
  };

  localStorage.setItem(REPORT_FILTERS_KEY, JSON.stringify(payload));
}

function formatPartnerLabel(partner) {
  const description = String(partner?.description || '').trim();
  const partnerCode = String(partner?.partnerCode || '').trim();

  if (!description && !partnerCode) {
    return '-';
  }

  if (description) {
    return partnerCode ? `${description} (cód. ${partnerCode})` : description;
  }

  return `Código ${partnerCode}`;
}

function resolveManifestStatusLabel(manifest) {
  return String(manifest?.externalStatus || manifest?.status || '-').trim() || '-';
}

function resolveOperationalContext() {
  const integrationAccountId = String(
    authStore.integrationAccountId.value
    || authStore.sessionContext.value?.integrationAccountId
    || ''
  ).trim();
  const sessionContextId = String(
    authStore.sessionContext.value?.sessionContextId
    || authStore.sessionContext.value?.id
    || ''
  ).trim();

  return {
    integrationAccountId,
    sessionContextId
  };
}

const persistedFilters = loadPersistedFilters();
const defaults = buildDefaultFilters();

const filters = reactive({
  status: String(persistedFilters?.status || defaults.status).trim(),
  manifestNumber: String(persistedFilters?.manifestNumber || defaults.manifestNumber).trim(),
  carrierQuery: String(persistedFilters?.carrierQuery || defaults.carrierQuery).trim(),
  receiverQuery: String(persistedFilters?.receiverQuery || defaults.receiverQuery).trim(),
  dateFrom: String(persistedFilters?.dateFrom || defaults.dateFrom).trim(),
  dateTo: String(persistedFilters?.dateTo || defaults.dateTo).trim(),
  page: Number(persistedFilters?.page || defaults.page),
  pageSize: Number(persistedFilters?.pageSize || defaults.pageSize)
});

const items = ref([]);
const totalItems = ref(0);
const totalPages = ref(0);
const page = ref(1);
const loading = ref(false);
const error = ref('');
const infoMessage = ref('');
const hasSearched = ref(false);

const pageDescription = computed(() => {
  const start = items.value.length ? (Number(page.value) - 1) * Number(filters.pageSize) + 1 : 0;
  const end = items.value.length ? start + items.value.length - 1 : 0;
  return { start, end };
});

const activeAccountLabel = computed(() => {
  const account = authStore.activeAccount.value || null;
  if (!account) {
    return 'Conta CETESB não selecionada';
  }

  const partnerName = String(account.partnerName || '').trim();
  const partnerCode = String(account.partnerCode || '').trim();

  if (partnerName && partnerCode) {
    return `${partnerName} (cód. ${partnerCode})`;
  }

  return partnerName || partnerCode || 'Conta ativa';
});

const periodSummary = computed(() => {
  const from = filters.dateFrom || '-';
  const to = filters.dateTo || '-';
  return `${from} até ${to}`;
});

const canGoPreviousPage = computed(() => Number(page.value) > 1 && !loading.value);
const canGoNextPage = computed(() => Number(page.value) < Number(totalPages.value || 1) && !loading.value);

function getIsoDateFieldValue(field) {
  return brDateToIsoDate(filters[field]) || '';
}

function setIsoDateFieldValue(field, isoValue) {
  filters[field] = isoDateToBrDate(isoValue) || '';
}

function syncDateFilterRange() {
  updateDateFilterFeedback({ showWideWindowInfo: false });
}

function updateDateFilterFeedback(options = {}) {
  const { showWideWindowInfo = true } = options;
  const validation = evaluateDateRange({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    fromLabel: 'Data inicial',
    toLabel: 'Data final'
  });

  if (!validation.isValid) {
    dateFilterError.value = validation.errorMessage;
    dateFilterInfo.value = '';
    return false;
  }

  dateFilterError.value = '';

  if (showWideWindowInfo && Number.isFinite(Number(validation.spanDays)) && Number(validation.spanDays) > DATE_WINDOW_NOTICE_DAYS) {
    dateFilterInfo.value = 'Janela ampla detectada. Se o retorno vier vazio, tente recortes menores para evitar limites operacionais da integracao CETESB.';
    return true;
  }

  dateFilterInfo.value = '';
  return true;
}

function handleDatePicked(field, isoValue) {
  setIsoDateFieldValue(field, isoValue);
  syncDateFilterRange();

  if (field === 'dateFrom' && filters.dateFrom && !filters.dateTo) {
    requestAnimationFrame(() => {
      dateToFieldRef.value?.focusInput?.();
      dateToFieldRef.value?.openCalendar?.();
    });
  }
}

function onDateFieldCommit(field, value) {
  filters[field] = normalizeBrDateInput(value);
  syncDateFilterRange();
}

function handleDateRangeHover(isoValue) {
  dateRangeHoverIso.value = String(isoValue || '').trim();
}

async function search(options = {}) {
  const force = Boolean(options.force);

  if (!updateDateFilterFeedback()) {
    return null;
  }

  loading.value = true;
  error.value = '';
  infoMessage.value = '';
  hasSearched.value = true;

  try {
    const sessionReady = await authStore.ensureSessionContextReady({ force });
    if (!sessionReady) {
      throw new Error('Ative uma conta CETESB para consultar o relatório de MTRs.');
    }

    const context = resolveOperationalContext();
    if (!context.integrationAccountId || !context.sessionContextId) {
      throw new Error('Contexto operacional CETESB indisponível para montar a consulta.');
    }

    const requestParams = {
      integrationAccountId: context.integrationAccountId,
      sessionContextId: context.sessionContextId,
      status: String(filters.status || '').trim() || undefined,
      manifestNumber: String(filters.manifestNumber || '').trim() || undefined,
      carrierQuery: String(filters.carrierQuery || '').trim() || undefined,
      receiverQuery: String(filters.receiverQuery || '').trim() || undefined,
      dateFrom: toApiDate(filters.dateFrom) || undefined,
      dateTo: toApiDate(filters.dateTo) || undefined,
      page: Number(filters.page || 1),
      pageSize: Number(filters.pageSize || DEFAULT_PAGE_SIZE)
    };

    let response;
    try {
      response = await listManifests(requestParams);
    } catch (requestError) {
      const message = String(requestError?.message || '');
      const needsSessionRefresh = message.includes('bootstrap/refresh de sessão real é obrigatório informar partnerCode, login, email e senha no metadata');

      if (!needsSessionRefresh || force) {
        throw requestError;
      }

      response = await search({ force: true });
      return response;
    }

    items.value = Array.isArray(response?.items) ? response.items : [];
    totalItems.value = Number(response?.totalItems || 0);
    totalPages.value = Number(response?.totalPages || 0);
    page.value = Number(response?.page || filters.page || 1);
    filters.page = page.value;
    persistFilters(filters);

    if (!items.value.length) {
      infoMessage.value = 'Nenhum manifesto encontrado para os filtros aplicados.';
    }

    return response;
  } catch (requestError) {
    items.value = [];
    totalItems.value = 0;
    totalPages.value = 0;
    page.value = 1;
    error.value = requestError.message || 'Falha ao consultar o relatório de MTRs.';
    return null;
  } finally {
    loading.value = false;
  }
}

async function applyFilters() {
  filters.page = 1;
  if (!updateDateFilterFeedback()) {
    return;
  }
  await search();
}

async function searchFromFilters() {
  if (!updateDateFilterFeedback()) {
    return;
  }

  await search();
}

async function resetFilters() {
  const nextDefaults = buildDefaultFilters();
  filters.status = nextDefaults.status;
  filters.manifestNumber = nextDefaults.manifestNumber;
  filters.carrierQuery = nextDefaults.carrierQuery;
  filters.receiverQuery = nextDefaults.receiverQuery;
  filters.dateFrom = nextDefaults.dateFrom;
  filters.dateTo = nextDefaults.dateTo;
  filters.page = nextDefaults.page;
  filters.pageSize = nextDefaults.pageSize;
  persistFilters(filters);
  await search();
}

async function changePage(nextPage) {
  if (nextPage < 1 || nextPage === Number(page.value)) {
    return;
  }

  filters.page = nextPage;
  persistFilters(filters);
  await search();
}

function openManifestDetail(manifestId) {
  if (!manifestId) {
    return;
  }

  router.push(`/manifestos/${manifestId}`);
}

function openOperationalList() {
  router.push('/manifestos');
}

watch(
  () => [
    String(authStore.integrationAccountId.value || '').trim(),
    String(authStore.sessionContext.value?.sessionContextId || authStore.sessionContext.value?.id || '').trim()
  ],
  async ([nextIntegrationAccountId, nextSessionContextId], [previousIntegrationAccountId, previousSessionContextId]) => {
    if (!nextIntegrationAccountId || !nextSessionContextId) {
      return;
    }

    if (
      nextIntegrationAccountId === previousIntegrationAccountId
      && nextSessionContextId === previousSessionContextId
    ) {
      return;
    }

    if (!hasSearched.value) {
      return;
    }

    filters.page = 1;
    await search();
  }
);

onMounted(async () => {
  persistFilters(filters);
  if (updateDateFilterFeedback()) {
    await search();
  }
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="MTR · Relatórios"
        title="Relatório dos MTRs"
        description="Consulte manifestos por período e contrapartes em uma área separada da operação diária."
      >
        <template #actions>
          <v-btn variant="outlined" @click="openOperationalList">Abrir lista operacional</v-btn>
          <v-btn color="primary" variant="flat" :loading="loading" @click="searchFromFilters">Atualizar consulta</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <!-- KPIs -->
    <v-row class="mb-4">
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-text>
            <div class="text-caption text-medium-emphasis">Registros encontrados</div>
            <div class="text-h4 font-weight-bold">{{ totalItems }}</div>
            <div class="text-caption">{{ loading ? 'Consultando…' : 'Total retornado para os filtros atuais' }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-text>
            <div class="text-caption text-medium-emphasis">Período consultado</div>
            <div class="text-h6 font-weight-bold">{{ periodSummary }}</div>
            <div class="text-caption">Faixa aplicada no relatório</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-text>
            <div class="text-caption text-medium-emphasis">Conta ativa</div>
            <div class="text-h6 font-weight-bold">{{ activeAccountLabel }}</div>
            <div class="text-caption">Contexto CETESB usado na busca</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Filtros -->
    <v-card class="mb-4">
      <v-card-text>
        <div class="text-overline text-medium-emphasis mb-1">Consulta analítica</div>
        <div class="text-subtitle-1 font-weight-semibold mb-3">Filtros do relatório</div>
        <v-form @submit.prevent="applyFilters">
          <v-row dense>
            <v-col cols="12" sm="6" md="4">
              <SicatDateInput
                ref="dateFromFieldRef"
                id="report-date-from"
                v-model="filters.dateFrom"
                aria-label="Data inicial do relatório"
                open-calendar-aria-label="Abrir calendário da Data inicial do relatório"
                previous-day-aria-label="Dia anterior em Data inicial do relatório"
                next-day-aria-label="Dia posterior em Data inicial do relatório"
                range-mode
                range-role="start"
                :range-start-value="filters.dateFrom"
                :range-end-value="filters.dateTo"
                :range-hover-iso="dateRangeHoverIso"
                @range-hover="handleDateRangeHover"
                @date-picked="handleDatePicked('dateFrom', $event)"
                @commit="onDateFieldCommit('dateFrom', $event)"
              />
            </v-col>
            <v-col cols="12" sm="6" md="4">
              <SicatDateInput
                ref="dateToFieldRef"
                id="report-date-to"
                v-model="filters.dateTo"
                aria-label="Data final do relatório"
                open-calendar-aria-label="Abrir calendário da Data final do relatório"
                previous-day-aria-label="Dia anterior em Data final do relatório"
                next-day-aria-label="Dia posterior em Data final do relatório"
                range-mode
                range-role="end"
                :range-start-value="filters.dateFrom"
                :range-end-value="filters.dateTo"
                :range-hover-iso="dateRangeHoverIso"
                @range-hover="handleDateRangeHover"
                @date-picked="handleDatePicked('dateTo', $event)"
                @commit="onDateFieldCommit('dateTo', $event)"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select
                v-model="filters.status"
                label="Status"
                :items="[{title:'Todos',value:''},{title:'Rascunho',value:'draft'},{title:'Pendente',value:'queued_submit'},{title:'Enviando',value:'submitting'},{title:'Executando',value:'processing'},{title:'Sucesso',value:'submitted'},{title:'Cancelado',value:'cancelled'},{title:'Falha',value:'failed'}]"
                item-title="title"
                item-value="value"
                density="compact"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-text-field v-model="filters.manifestNumber" label="Número MTR" placeholder="Ex.: 260010679516" density="compact" />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-text-field v-model="filters.carrierQuery" label="Transportador" placeholder="Nome ou código" density="compact" />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-text-field v-model="filters.receiverQuery" label="Destinador" placeholder="Nome ou código" density="compact" />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select
                v-model.number="filters.pageSize"
                label="Itens por página"
                :items="[{title:'10',value:10},{title:'20',value:20},{title:'50',value:50}]"
                item-title="title"
                item-value="value"
                density="compact"
              />
            </v-col>
          </v-row>
          <div class="d-flex ga-2 mt-2">
            <v-btn color="primary" type="submit" :loading="loading">Aplicar filtros</v-btn>
            <v-btn variant="outlined" :disabled="loading" @click="resetFilters">Redefinir faixa</v-btn>
          </div>
        </v-form>
      </v-card-text>
    </v-card>

    <v-alert v-if="dateFilterError" type="error" variant="tonal" class="mb-3">{{ dateFilterError }}</v-alert>
    <v-alert v-if="dateFilterInfo && !dateFilterError" type="info" variant="tonal" class="mb-3">{{ dateFilterInfo }}</v-alert>
    <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{ error }}</v-alert>
    <v-alert v-else-if="infoMessage" type="info" variant="tonal" class="mb-3">{{ infoMessage }}</v-alert>

    <!-- Resultados -->
    <v-card>
      <v-card-text>
        <v-row align="center" class="mb-2">
          <v-col>
            <div class="text-subtitle-1 font-weight-semibold">Resultados do relatório</div>
            <div class="text-caption text-medium-emphasis">Mostrando {{ pageDescription.start }} até {{ pageDescription.end }} de {{ totalItems }} manifesto(s).</div>
          </v-col>
        </v-row>
        <v-table density="compact">
          <thead>
            <tr>
              <th scope="col">Número MTR</th>
              <th scope="col">Emissão</th>
              <th scope="col">Gerador</th>
              <th scope="col">Transportador</th>
              <th scope="col">Destinador</th>
              <th scope="col">Situação CETESB</th>
              <th scope="col">Leitura</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="7" class="text-center text-medium-emphasis pa-4">Consultando manifestos...</td>
            </tr>
            <tr v-else-if="!items.length">
              <td colspan="7" class="text-center text-medium-emphasis pa-4">Nenhum manifesto disponível para os filtros informados.</td>
            </tr>
            <tr v-for="manifest in items" :key="manifest.id">
              <td><strong>{{ manifest.manifestNumber || manifest.id || '-' }}</strong></td>
              <td>{{ formatDateBr(manifest.expeditionDate || manifest.createdAt) }}</td>
              <td>{{ formatPartnerLabel(manifest.generator) }}</td>
              <td>{{ formatPartnerLabel(manifest.carrier) }}</td>
              <td>{{ formatPartnerLabel(manifest.receiver) }}</td>
              <td>
                <SicatStatusBadge
                  :status="manifest.externalStatus || manifest.status"
                  :label="resolveManifestStatusLabel(manifest)"
                  domain="manifest"
                  with-dot
                />
              </td>
              <td>
                <v-btn size="x-small" variant="outlined" @click="openManifestDetail(manifest.id)">Abrir detalhe</v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
        <div class="d-flex align-center justify-space-between mt-3">
          <span class="text-caption text-medium-emphasis">Página {{ page }} de {{ totalPages || 1 }}</span>
          <div class="d-flex ga-1">
            <v-btn size="small" variant="outlined" :disabled="!canGoPreviousPage" @click="changePage(Number(page) - 1)">Anterior</v-btn>
            <v-btn size="small" variant="outlined" :disabled="!canGoNextPage" @click="changePage(Number(page) + 1)">Próxima</v-btn>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </SicatPageLayout>
</template>

<style scoped>
.report-workspace {
  overflow: hidden;
}

.report-workspace-body {
  display: grid;
  gap: 24px;
}

.report-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  padding: 24px;
  border-radius: 24px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 18%, var(--color-surface) 82%), transparent 68%),
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 18%, transparent 82%), transparent 45%),
    var(--color-surface);
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border) 82%);
}

.report-hero-copy {
  display: grid;
  gap: 10px;
}

.report-hero-actions {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: flex-end;
}

.report-kicker {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface) 88%);
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.report-kicker-muted {
  background: color-mix(in srgb, var(--color-border) 18%, var(--color-surface) 82%);
  color: var(--color-text-muted);
}

.report-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.report-summary-card {
  display: grid;
  gap: 8px;
  padding: 20px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--color-border) 74%, transparent 26%);
  background: color-mix(in srgb, var(--color-surface) 90%, var(--color-surface-raised) 10%);
}

.report-summary-card strong {
  font-size: 1.15rem;
}

.report-summary-label {
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.report-filters,
.report-results-card {
  overflow: hidden;
}

.report-filters-body,
.report-results-body {
  display: grid;
  gap: 20px;
}

.report-section-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.report-filters-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.report-page-size-field {
  max-width: 180px;
}

.report-filters-actions,
.report-pagination-bar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.report-feedback-text {
  display: block;
}

.report-results-heading {
  align-items: flex-end;
}

.report-table-shell {
  overflow-x: auto;
}

.report-manifest-number {
  font-family: var(--font-family-mono);
}

@media (max-width: 1024px) {
  .report-hero,
  .report-summary-grid,
  .report-filters-grid {
    grid-template-columns: 1fr;
  }

  .report-hero-actions,
  .report-section-heading,
  .report-filters-actions,
  .report-pagination-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .report-page-size-field {
    max-width: none;
  }
}
</style>