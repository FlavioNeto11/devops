<script setup>
import { onMounted, reactive, ref, watch, computed } from 'vue';
import { downloadCdfDocument, listCdfCertificates } from '../services/api.js';
import { formatDateBr, formatDateTimeBr } from '../utils/date-format.js';
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

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatLocalDateInput(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

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
  dateFrom: '',
  dateTo: formatLocalDateInput(new Date())
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

function clearFilters() {
  filters.dateFrom = '';
  filters.dateTo = formatLocalDateInput(new Date());
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
