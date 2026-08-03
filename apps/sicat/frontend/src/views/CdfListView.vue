<script setup>
import { onMounted, reactive, ref, watch, computed } from 'vue';
import { downloadCdfDocument, listCdfCertificates } from '../services/api.js';
import { formatDateBr, formatDateTimeBr, getTodayBr, isoDateToBrDate, isoDaysAgo, isoToday, normalizeBrDateInput, toApiDate } from '../utils/date-format.js';
import { evaluateDateRange } from '../utils/date-range-validation.js';
import { formatPageCounter } from '../lib/pagination-label.js';
import { hasPendingFilterChanges, pendingFilterKeys, resolveSelectionState, snapshotFilters } from '../lib/filter-application-state.js';
import {
  CDF_PAGE_SIZE_OPTIONS,
  buildDatePresetTarget,
  clampPage,
  decorateFilterChipLabel,
  formatCertificateDownloadLabel,
  paginateRows,
  resolveTotalPages
} from '../features/cdf/cdfTableState.js';
import { useCdfOperationalContext } from '../composables/useCdfOperationalContext.js';
import { useNotification } from '../composables/useNotification.js';
import SicatPageLayout from '../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../components/shell/SicatPageHeader.vue';
import SicatCard from '../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../components/sicat/SicatFiltersPanel.vue';
import SicatFormField from '../components/sicat/SicatFormField.vue';
import SicatDataTable from '../components/sicat/SicatDataTable.vue';
import SicatDateInput from '../components/shared/inputs/SicatDateInput.vue';
import SicatInlineAlert from '../components/sicat/SicatInlineAlert.vue';

// Teto amigável de 2 anos. A regra de 31 dias da CETESB é tratada no backend,
// que fatia a busca em janelas <= 31 dias por trás dos panos — a tela nunca
// mostra o erro de 31 dias.
const CDF_MAX_RANGE_DAYS = 731;

/*
 * DOIS VOCABULÁRIOS DE FILTRO NO MESMO APP.
 *
 * /manifestos aplica o contrato do "chip honesto" (lib/filter-application-state.js):
 * o que está NOS CAMPOS não é necessariamente o que a LISTA está mostrando, e a
 * tela diz isso — chip aplicado (✓) ≠ chip selecionado e ainda pendente (⏱) ≠
 * chip inativo, com aviso aria-live e os botões "Aplicar filtros"/"Limpar filtros".
 * /cdf tinha outro dialeto: "Consultar"/"Limpar"/"Limpar tudo", inputs de data
 * nativos e NENHUM conceito de pendência — os chips de período pintavam no clique
 * e os campos de data mudavam sem valer, exatamente o feedback mentiroso que o
 * módulo existe para eliminar. Aqui o CDF passa a falar a mesma língua.
 */
const OBSERVED_FILTER_KEYS = Object.freeze(['dateFrom', 'dateTo']);

function sanitizeFileName(fileName, fallbackName) {
  const normalized = String(fileName || '').trim() || fallbackName;
  return normalized.replaceAll(/[\\/:*?"<>|]+/g, '-');
}

function triggerBrowserDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName || 'cdf.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

function formatPeriod(certificate) {
  const from = certificate?.dateFrom ? formatDateBr(certificate.dateFrom) : '-';
  const to = certificate?.dateTo ? formatDateBr(certificate.dateTo) : '-';
  return `${from} até ${to}`;
}

function formatIssuedAt(value) {
  return value ? formatDateTimeBr(value) : '-';
}

const notify = useNotification();

const {
  integrationAccountId,
  sessionContextId,
  contextReady,
  ensureOperationalContext
} = useCdfOperationalContext();

// Datas em formato BR (dd/mm/aaaa), como em /manifestos — o mesmo componente de
// data (SicatDateInput) atende as duas telas. A API continua recebendo ISO
// (toApiDate na hora da busca).
const filters = reactive({
  dateFrom: isoDateToBrDate(isoDaysAgo(29)) || getTodayBr(),
  dateTo: getTodayBr(),
  pageSize: 10
});

const certificates = ref([]);
const certificatesLoading = ref(false);
const certificatesLoaded = ref(false);
const certificatesError = ref('');
const certificateDownloadLoadingId = ref('');
const page = ref(1);
const dateFromFieldRef = ref(null);
const dateToFieldRef = ref(null);
const dateRangeHoverIso = ref('');

// O que a ÚLTIMA busca concluída levou (null = nenhuma busca ainda).
const appliedFilters = ref(null);

const headers = [
  { title: 'Código', key: 'code', sortable: false },
  { title: 'Emitido em', key: 'issuedAt', sortable: false },
  { title: 'Período', key: 'period', sortable: false },
  { title: 'Responsável', key: 'responsible', sortable: false },
  { title: 'Ação', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  certificates.value.map((certificate) => {
    const documentId = String(certificate?.documentId || certificate?.id || '').trim();
    const code = certificate?.certificateCode || documentId || '-';
    return {
      id: documentId || certificate?.certificateCode || Math.random().toString(36),
      documentId,
      code,
      downloadLabel: formatCertificateDownloadLabel(code),
      issuedAt: formatIssuedAt(certificate?.issuedAt),
      period: formatPeriod(certificate),
      responsible: certificate?.responsibleName || '-',
      raw: certificate
    };
  })
);

// ---- Paginação da TELA -------------------------------------------------
// A API devolve a janela inteira de uma vez; quem pagina é a tela. O rodapé
// genérico do Vuetify fica desligado porque ele escrevia "Mostrando 0–0 de 0"
// (0 de quê?) — o contador canônico com substantivo sai de pagination-label.js.
const totalCertificates = computed(() => rows.value.length);
const totalPages = computed(() => resolveTotalPages(totalCertificates.value, filters.pageSize));
const pagedRows = computed(() => paginateRows(rows.value, { page: page.value, pageSize: filters.pageSize }));

const resultsCounterLabel = computed(() => formatPageCounter({
  page: page.value,
  pageSize: filters.pageSize,
  itemsOnPage: pagedRows.value.length,
  total: totalCertificates.value,
  singular: 'certificado'
}));

const canGoPreviousPage = computed(() => page.value > 1 && !certificatesLoading.value);
const canGoNextPage = computed(() => page.value < totalPages.value && !certificatesLoading.value);

function changePage(nextPage) {
  page.value = clampPage(nextPage, totalCertificates.value, filters.pageSize);
}

watch(() => filters.pageSize, () => {
  page.value = 1;
});

// ---- Filtro selecionado × filtro valendo -------------------------------
const pendingKeys = computed(() => pendingFilterKeys(filters, appliedFilters.value, OBSERVED_FILTER_KEYS));
const hasPendingFilterEdits = computed(() => hasPendingFilterChanges(filters, appliedFilters.value, OBSERVED_FILTER_KEYS));

const activeChips = computed(() => {
  const chips = [];
  if (filters.dateFrom) {
    chips.push({
      key: 'dateFrom',
      label: decorateFilterChipLabel(`De: ${formatDateBr(filters.dateFrom)}`, pendingKeys.value.includes('dateFrom'))
    });
  }
  if (filters.dateTo) {
    chips.push({
      key: 'dateTo',
      label: decorateFilterChipLabel(`Até: ${formatDateBr(filters.dateTo)}`, pendingKeys.value.includes('dateTo'))
    });
  }
  return chips;
});

function datePresetTarget(days) {
  return buildDatePresetTarget({ days, todayIso: isoToday() });
}

/** 'idle' | 'pending' | 'applied' — mesmo contrato de /manifestos. */
function datePresetState(days) {
  return resolveSelectionState(datePresetTarget(days), filters, appliedFilters.value, OBSERVED_FILTER_KEYS);
}

/** Aparência honesta do chip: aplicado ≠ pendente ≠ inativo. */
function filterChipAttrs(state, label) {
  if (state === 'applied') {
    return {
      variant: 'flat',
      color: 'primary',
      prependIcon: 'mdi-check',
      title: `${label}: filtro aplicado nesta lista`
    };
  }

  if (state === 'pending') {
    return {
      variant: 'outlined',
      color: 'primary',
      prependIcon: 'mdi-clock-outline',
      title: `${label}: selecionado, ainda não aplicado — use “Aplicar filtros”`
    };
  }

  return { variant: 'tonal', color: undefined, prependIcon: undefined, title: undefined };
}

function validateCertificateDateRange() {
  const validation = evaluateDateRange({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    fromLabel: 'Data inicial',
    toLabel: 'Data final',
    maxDays: CDF_MAX_RANGE_DAYS
  });

  if (!validation.isValid) {
    certificatesError.value = Number(validation.spanDays) > CDF_MAX_RANGE_DAYS
      ? 'Para buscas muito longas, escolha um período de até 2 anos.'
      : validation.errorMessage;
    certificatesLoaded.value = true;
    return false;
  }

  return true;
}

async function loadCertificates(options = {}) {
  const { silent = false } = options;

  try {
    await ensureOperationalContext();
  } catch (error) {
    certificatesError.value = error?.message || 'Falha ao preparar contexto operacional para certificados.';
    certificatesLoaded.value = true;
    certificates.value = [];
    return;
  }

  if (!silent) {
    certificatesLoading.value = true;
  }

  certificatesError.value = '';

  // Busca abortada NÃO aplica filtro nenhum: os campos seguem "pendentes" e a
  // lista continua sendo a de antes — é isto que o aviso e os chips dizem.
  if (!validateCertificateDateRange()) {
    certificatesLoading.value = false;
    return;
  }

  const requestedFilters = snapshotFilters(filters, OBSERVED_FILTER_KEYS);

  try {
    const response = await listCdfCertificates({
      integrationAccountId: integrationAccountId.value,
      sessionContextId: sessionContextId.value,
      dateFrom: toApiDate(filters.dateFrom),
      dateTo: toApiDate(filters.dateTo)
    });

    certificates.value = Array.isArray(response?.items) ? response.items : [];
    certificatesLoaded.value = true;

    if (!certificates.value.length) {
      notify.info('Nenhum CDF encontrado para a janela informada.');
    }
  } catch (error) {
    certificatesError.value = error?.message || 'Falha ao consultar certificados CDF.';
    certificates.value = [];
    certificatesLoaded.value = true;
  } finally {
    // A busca rodou: o que está na lista (inclusive lista vazia por erro) é o
    // resultado DESTES filtros.
    appliedFilters.value = requestedFilters;
    page.value = 1;
    certificatesLoading.value = false;
  }
}

// Atalhos de período. "N dias" INCLUI hoje (30 dias = hoje + 29 anteriores).
function applyDatePreset(days) {
  const target = datePresetTarget(days);
  filters.dateFrom = target.dateFrom;
  filters.dateTo = target.dateTo;
  void loadCertificates();
}

function clearFilters() {
  const target = datePresetTarget(30);
  filters.dateFrom = target.dateFrom;
  filters.dateTo = target.dateTo;
  void loadCertificates();
}

function removeChip(key) {
  if (key === 'dateFrom') filters.dateFrom = '';
  if (key === 'dateTo') filters.dateTo = '';
}

function onDateFieldCommit(field, nextValue) {
  filters[field] = normalizeBrDateInput(nextValue);
}

function handleDateRangeHover(isoValue) {
  dateRangeHoverIso.value = String(isoValue || '').trim();
}

function handleDatePicked(field, payload) {
  const pickedValue = typeof payload === 'string' ? payload : String(payload?.value || '');
  onDateFieldCommit(field, pickedValue);

  if (field === 'dateFrom' && filters.dateFrom && !filters.dateTo) {
    dateToFieldRef.value?.openPicker?.();
    return;
  }

  if (field === 'dateTo' && filters.dateTo && !filters.dateFrom) {
    dateFromFieldRef.value?.openPicker?.();
  }
}

async function downloadCertificate(row) {
  const documentId = String(row?.documentId || '').trim();
  if (!documentId) {
    notify.error('Certificado sem identificador de download disponível.');
    return;
  }

  certificateDownloadLoadingId.value = documentId;
  certificatesError.value = '';

  try {
    await ensureOperationalContext();

    const preferredName = sanitizeFileName(
      `cdf-${row?.code || documentId}.pdf`,
      `cdf-${documentId}.pdf`
    );

    const { blob, fileName } = await downloadCdfDocument(documentId, {
      integrationAccountId: integrationAccountId.value,
      sessionContextId: sessionContextId.value,
      preferredFileName: preferredName
    });

    triggerBrowserDownload(blob, sanitizeFileName(fileName, preferredName));
    notify.success(`Download iniciado para o CDF ${row?.code || documentId}.`);
  } catch (error) {
    notify.error(error?.message || 'Falha ao baixar PDF do CDF.');
  } finally {
    certificateDownloadLoadingId.value = '';
  }
}

watch(
  contextReady,
  (ready) => {
    if (!ready) return;
    void loadCertificates({ silent: true });
  },
  { immediate: true }
);

onMounted(() => {
  if (contextReady.value) {
    void loadCertificates({ silent: true });
  }
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Certificados (CDF)"
        title="Meus certificados"
        description="O certificado (CDF) é a prova de que o resíduo teve o destino correto. Aqui você consulta e baixa os que já saíram."
      />
    </template>

    <template #banner>
      <SicatInlineAlert
        tone="info"
        title="O que é o certificado (CDF)?"
        message="É o comprovante de que o resíduo foi tratado ou descartado do jeito certo. Para criar um novo, use “Gerar certificado”."
      />
      <SicatInlineAlert
        v-if="!contextReady"
        tone="warning"
        message="Ainda estamos preparando a conexão com a CETESB para consultar os certificados. Aguarde alguns segundos."
      />
      <SicatInlineAlert v-if="certificatesError" tone="error" :message="certificatesError" />
    </template>

    <template #filters>
      <SicatFiltersPanel
        :active-chips="activeChips"
        :loading="certificatesLoading"
        apply-label="Aplicar filtros"
        clear-label="Limpar filtros"
        clear-all-label="Limpar filtros"
        @apply="loadCertificates()"
        @clear="clearFilters"
        @remove="removeChip"
      >
        <div class="cdf-date-presets">
          <span class="cdf-date-presets__label">Período rápido:</span>
          <v-chip
            size="small"
            :disabled="certificatesLoading"
            v-bind="filterChipAttrs(datePresetState(1), 'Hoje')"
            @click="applyDatePreset(1)"
          >Hoje</v-chip>
          <v-chip
            size="small"
            :disabled="certificatesLoading"
            v-bind="filterChipAttrs(datePresetState(7), '7 dias')"
            @click="applyDatePreset(7)"
          >7 dias</v-chip>
          <v-chip
            size="small"
            :disabled="certificatesLoading"
            v-bind="filterChipAttrs(datePresetState(30), '30 dias')"
            @click="applyDatePreset(30)"
          >30 dias</v-chip>
          <v-chip
            size="small"
            :disabled="certificatesLoading"
            v-bind="filterChipAttrs(datePresetState(90), '90 dias')"
            @click="applyDatePreset(90)"
          >90 dias</v-chip>
          <v-chip
            size="small"
            :disabled="certificatesLoading"
            v-bind="filterChipAttrs(datePresetState(365), '12 meses')"
            @click="applyDatePreset(365)"
          >12 meses</v-chip>
        </div>
        <p class="cdf-date-presets__hint">
          Você pode buscar períodos longos (até 2 anos). Buscas grandes são consultadas em partes e podem levar alguns segundos.
        </p>
        <SicatFormField label="Data inicial">
          <template #default="{ id }">
            <SicatDateInput
              :id="id"
              ref="dateFromFieldRef"
              v-model="filters.dateFrom"
              aria-label="Data inicial"
              open-calendar-aria-label="Abrir calendário da Data inicial"
              previous-day-aria-label="Dia anterior em Data inicial"
              next-day-aria-label="Dia posterior em Data inicial"
              :disabled="certificatesLoading"
              range-mode
              range-role="start"
              :range-start-value="filters.dateFrom"
              :range-end-value="filters.dateTo"
              :range-hover-iso="dateRangeHoverIso"
              @range-hover="handleDateRangeHover"
              @date-picked="handleDatePicked('dateFrom', $event)"
              @commit="onDateFieldCommit('dateFrom', $event)"
            />
          </template>
        </SicatFormField>
        <SicatFormField label="Data final">
          <template #default="{ id }">
            <SicatDateInput
              :id="id"
              ref="dateToFieldRef"
              v-model="filters.dateTo"
              aria-label="Data final"
              open-calendar-aria-label="Abrir calendário da Data final"
              previous-day-aria-label="Dia anterior em Data final"
              next-day-aria-label="Dia posterior em Data final"
              :disabled="certificatesLoading"
              range-mode
              range-role="end"
              :range-start-value="filters.dateFrom"
              :range-end-value="filters.dateTo"
              :range-hover-iso="dateRangeHoverIso"
              @range-hover="handleDateRangeHover"
              @date-picked="handleDatePicked('dateTo', $event)"
              @commit="onDateFieldCommit('dateTo', $event)"
            />
          </template>
        </SicatFormField>
        <p
          v-if="hasPendingFilterEdits && !certificatesLoading"
          class="cdf-date-presets__pending"
          aria-live="polite"
        >Há filtros alterados que ainda não estão valendo — clique em “Aplicar filtros”.</p>
      </SicatFiltersPanel>
    </template>

    <SicatCard title="Consulta de certificados" flush-body>
      <template #header-actions>
        <v-select
          v-model.number="filters.pageSize"
          :items="CDF_PAGE_SIZE_OPTIONS"
          label="Itens por página"
          density="compact"
          variant="outlined"
          hide-details
          style="width: 160px"
        />
      </template>

      <!-- Paginação é da TELA (o rodapé padrão do v-data-table escrevia
           "Mostrando 0–0 de 0", sem dizer de quê) — desligado aqui. -->
      <SicatDataTable
        :headers="headers"
        :items="pagedRows"
        :loading="certificatesLoading"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{ title: 'Nenhum certificado neste período', description: 'Tente outro período acima, ou crie um novo em “Gerar certificado”.', icon: 'mdi-certificate-outline' }"
      >
        <template #[`item.actions`]="{ item }">
          <v-btn
            variant="tonal"
            size="small"
            color="primary"
            prepend-icon="mdi-download"
            :aria-label="item.downloadLabel"
            :title="item.downloadLabel"
            :loading="certificateDownloadLoadingId === item.documentId"
            @click="downloadCertificate(item)"
          >
            Baixar PDF
          </v-btn>
        </template>
        <template #footer>
          <v-btn variant="text" size="small" :disabled="!canGoPreviousPage" prepend-icon="mdi-chevron-left" @click="changePage(page - 1)">
            Anterior
          </v-btn>
          <span class="text-caption text-medium-emphasis">
            {{ resultsCounterLabel }}
          </span>
          <v-btn variant="text" size="small" :disabled="!canGoNextPage" append-icon="mdi-chevron-right" @click="changePage(page + 1)">
            Próxima
          </v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>

<style scoped>
.cdf-date-presets {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.cdf-date-presets__label {
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.66);
}

.cdf-date-presets__hint {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), 0.58);
}

.cdf-date-presets__pending {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgb(var(--v-theme-warning));
}
</style>
