<script setup>
import { onMounted, reactive, ref, watch, computed } from 'vue';
import { downloadCdfDocument, listCdfCertificates } from '../services/api.js';
import { formatDateBr, formatDateTimeBr, isoDaysAgo, isoToday } from '../utils/date-format.js';
import { evaluateDateRange } from '../utils/date-range-validation.js';
import { useCdfOperationalContext } from '../composables/useCdfOperationalContext.js';
import { useNotification } from '../composables/useNotification.js';
import SicatPageLayout from '../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../components/shell/SicatPageHeader.vue';
import SicatCard from '../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../components/sicat/SicatDataTable.vue';
import SicatInlineAlert from '../components/sicat/SicatInlineAlert.vue';

const CDF_MAX_WINDOW_DAYS = 31;

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

const filters = reactive({
  dateFrom: isoDaysAgo(29),
  dateTo: isoToday()
});

const certificates = ref([]);
const certificatesLoading = ref(false);
const certificatesLoaded = ref(false);
const certificatesError = ref('');
const certificateDownloadLoadingId = ref('');

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
    return {
      id: documentId || certificate?.certificateCode || Math.random().toString(36),
      documentId,
      code: certificate?.certificateCode || documentId || '-',
      issuedAt: formatIssuedAt(certificate?.issuedAt),
      period: formatPeriod(certificate),
      responsible: certificate?.responsibleName || '-',
      raw: certificate
    };
  })
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.dateFrom) chips.push({ key: 'dateFrom', label: `De: ${formatDateBr(filters.dateFrom)}` });
  if (filters.dateTo) chips.push({ key: 'dateTo', label: `Até: ${formatDateBr(filters.dateTo)}` });
  return chips;
});

// Destaca o atalho de período correspondente ao range atual (0 = nenhum).
const activeDatePresetDays = computed(() => {
  if (filters.dateTo !== isoToday()) return 0;
  for (const days of [1, 7, 30]) {
    if (filters.dateFrom === isoDaysAgo(days - 1)) return days;
  }
  return 0;
});

function validateCertificateDateRange() {
  const validation = evaluateDateRange({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    fromLabel: 'Data inicial',
    toLabel: 'Data final',
    maxDays: CDF_MAX_WINDOW_DAYS
  });

  if (!validation.isValid) {
    certificatesError.value = validation.errorMessage;
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

  if (!validateCertificateDateRange()) {
    certificatesLoading.value = false;
    return;
  }

  try {
    const response = await listCdfCertificates({
      integrationAccountId: integrationAccountId.value,
      sessionContextId: sessionContextId.value,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo
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
    certificatesLoading.value = false;
  }
}

// Atalhos de período (janela máx. de 31 dias do CDF). N dias inclui o dia de hoje.
function applyDatePreset(days) {
  filters.dateTo = isoToday();
  filters.dateFrom = isoDaysAgo(Math.max(0, Number(days) - 1));
  void loadCertificates();
}

function clearFilters() {
  filters.dateFrom = isoDaysAgo(29);
  filters.dateTo = isoToday();
  void loadCertificates();
}

function removeChip(key) {
  if (key === 'dateFrom') filters.dateFrom = '';
  if (key === 'dateTo') filters.dateTo = '';
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
        apply-label="Consultar"
        @apply="loadCertificates()"
        @clear="clearFilters"
        @remove="removeChip"
      >
        <div class="cdf-date-presets">
          <span class="cdf-date-presets__label">Período rápido:</span>
          <v-chip
            size="small"
            :variant="activeDatePresetDays === 1 ? 'flat' : 'tonal'"
            :color="activeDatePresetDays === 1 ? 'primary' : undefined"
            :disabled="certificatesLoading"
            @click="applyDatePreset(1)"
          >Hoje</v-chip>
          <v-chip
            size="small"
            :variant="activeDatePresetDays === 7 ? 'flat' : 'tonal'"
            :color="activeDatePresetDays === 7 ? 'primary' : undefined"
            :disabled="certificatesLoading"
            @click="applyDatePreset(7)"
          >7 dias</v-chip>
          <v-chip
            size="small"
            :variant="activeDatePresetDays === 30 ? 'flat' : 'tonal'"
            :color="activeDatePresetDays === 30 ? 'primary' : undefined"
            :disabled="certificatesLoading"
            @click="applyDatePreset(30)"
          >30 dias</v-chip>
        </div>
        <v-text-field
          v-model="filters.dateFrom"
          label="Data inicial"
          type="date"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          :disabled="certificatesLoading"
        />
        <v-text-field
          v-model="filters.dateTo"
          label="Data final"
          type="date"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          :disabled="certificatesLoading"
        />
      </SicatFiltersPanel>
    </template>

    <SicatCard title="Consulta de certificados" flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="certificatesLoading"
        :empty="{ title: 'Nenhum certificado neste período', description: 'Tente outro período acima, ou crie um novo em “Gerar certificado”.', icon: 'mdi-certificate-outline' }"
      >
        <template #[`item.actions`]="{ item }">
          <v-btn
            variant="tonal"
            size="small"
            color="primary"
            prepend-icon="mdi-download"
            :loading="certificateDownloadLoadingId === item.documentId"
            @click="downloadCertificate(item)"
          >
            Baixar PDF
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
</style>
