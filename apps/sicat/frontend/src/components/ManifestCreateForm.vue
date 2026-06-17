<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { batchCreateManifests, batchSubmitManifests, createManifest, getCatalog, searchPartners, submitManifest } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { getTodayBr, normalizeBrDateInput, toApiDate } from '../utils/date-format.js';
import FilterableDropdown from './FilterableDropdown.vue';
import SicatInlineAlert from './sicat/SicatInlineAlert.vue';
import SicatHelpHint from './sicat/SicatHelpHint.vue';
import SicatNextStep from './sicat/SicatNextStep.vue';

const props = defineProps({
  integrationAccountId: {
    type: String,
    default: ''
  },
  user: {
    type: Object,
    default: null
  },
  partner: {
    type: Object,
    default: null
  },
  sessionContext: {
    type: Object,
    default: null
  },
  /**
   * Quando informado, substitui a chamada interna a `createManifest`/
   * `submitManifest`. Recebe o payload `ManifestCreateRequest` montado pelo
   * wizard e deve retornar `{ createdId, ...extras }`. Ativa o modo
   * single-only automaticamente (lote desabilitado).
   * Usado pela cadeia mtr-provisorio-wizard-frontend (R3-C: schema na borda
   * HTTP é o mesmo `ManifestCreateRequest`).
   */
  submitHandler: {
    type: Function,
    default: null
  },
  /** Esconde o campo de lote e o botão "Criar e submeter agora". */
  singleOnly: {
    type: Boolean,
    default: false
  },
  /** Rótulo do botão primário no passo de revisão. */
  primaryActionLabel: {
    type: String,
    default: ''
  },
  /** Texto do kicker (badge superior) do header do wizard. */
  pageKicker: {
    type: String,
    default: 'Wizard operacional'
  },
  /** Título principal exibido no header do wizard. */
  pageTitle: {
    type: String,
    default: 'Criar manifesto'
  },
  /** Descrição secundária exibida no header do wizard. */
  pageDescription: {
    type: String,
    default: 'Fluxo inspirado no checkout wizard do Vuexy: etapas claras, revisão final e navegação guiada sem alterar o payload existente.'
  }
});

const emit = defineEmits(['success']);

const isSingleOnly = computed(() => Boolean(props.singleOnly || props.submitHandler));

const authStore = useAuthStore();

const catalogsLoading = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const partnerSearch = reactive({
  carrier: {
    query: '',
    loading: false,
    error: '',
    results: [],
    selectedCode: ''
  },
  receiver: {
    query: '',
    loading: false,
    error: '',
    results: [],
    selectedCode: ''
  }
});

const PARTNER_SEARCH_MIN_LENGTH = 2;
const PARTNER_SEARCH_DEBOUNCE_MS = 350;
const partnerSearchTimers = {
  carrier: null,
  receiver: null
};

const catalogOptions = reactive({
  units: [],
  residueTreatments: [],
  classes: [],
  residueStates: [],
  packagingGroups: [],
  residueClasses: []
});

const form = reactive({
  integrationAccountId: '',
  batchCount: 1,
  expeditionDate: getTodayBr(),
  responsibleName: '',
  driverName: '',
  vehiclePlate: '',
  notes: '',
  quantity: 1,
  weightTon: 1,
  unitCode: '',
  residueCode: '',
  treatmentCode: '',
  classCode: '',
  stateTypeCode: '',
  packagingTypeCode: '',
  hasTemporaryStorage: false,
  hasCadriInResidueList: false
});

const resolvedUser = computed(() => props.user || authStore.user.value || null);
const resolvedPartner = computed(() => props.partner || authStore.partner.value || null);
const resolvedSessionContext = computed(() => props.sessionContext || authStore.sessionContext.value || null);

const currentSessionContextId = computed(() => {
  return resolvedSessionContext.value?.sessionContextId
    || resolvedSessionContext.value?.id
    || '';
});

const requestedBy = computed(() => buildRequestedBy(resolvedUser.value));
const generatorPartner = computed(() => buildGeneratorPartner(resolvedPartner.value, resolvedUser.value));
const selectedCarrier = computed(() => getSelectedPartner('carrier'));
const selectedReceiver = computed(() => getSelectedPartner('receiver'));
const selectedResidueCatalogItem = computed(() => findCatalogItem(catalogOptions.residueClasses, form.residueCode));
const selectedUnitCatalogItem = computed(() => findCatalogItem(catalogOptions.units, form.unitCode));
const selectedTreatmentCatalogItem = computed(() => findCatalogItem(catalogOptions.residueTreatments, form.treatmentCode));
const selectedClassCatalogItem = computed(() => findCatalogItem(catalogOptions.classes, form.classCode));
const selectedStateCatalogItem = computed(() => findCatalogItem(catalogOptions.residueStates, form.stateTypeCode));
const selectedPackagingCatalogItem = computed(() => findCatalogItem(catalogOptions.packagingGroups, form.packagingTypeCode));
const activeAccount = computed(() => authStore.activeAccount.value || null);
const resolvedIntegrationAccountId = computed(() => String(form.integrationAccountId || '').trim());
const activeAccountLabel = computed(() => {
  const account = activeAccount.value;
  if (!account) {
    return 'Selecione uma conta CETESB antes de continuar';
  }

  const partnerName = String(account.partnerName || '').trim();
  const partnerCode = String(account.partnerCode || '').trim();

  if (partnerName && partnerCode) {
    return `${partnerName} (cód. ${partnerCode})`;
  }

  return partnerName || partnerCode || 'Conta CETESB ativa';
});
const activeAccountMeta = computed(() => {
  const account = activeAccount.value;
  if (!account) {
    return '';
  }

  const parts = [
    String(account.partnerDocument || '').trim(),
    resolvedIntegrationAccountId.value ? `ID interno ${resolvedIntegrationAccountId.value}` : ''
  ].filter(Boolean);

  return parts.join(' • ');
});
const canImmediateSubmit = computed(() => !loading.value);
const resolvedPrimaryLabel = computed(() => {
  if (props.primaryActionLabel) return props.primaryActionLabel;
  return Number(form.batchCount || 1) > 1 ? 'Criar e submeter lote' : 'Criar e submeter';
});
const resolvedDraftLabel = computed(() => Number(form.batchCount || 1) > 1 ? 'Criar lote de rascunhos' : 'Criar rascunho');
const hasCatalogContext = computed(() => Boolean(form.integrationAccountId && currentSessionContextId.value));
const catalogContextWarning = computed(() => {
  if (hasCatalogContext.value) {
    return '';
  }

  if (!resolvedIntegrationAccountId.value && !currentSessionContextId.value) {
    return 'Selecione uma conta CETESB ativa e autentique a sessão para carregar os catálogos.';
  }

  if (!resolvedIntegrationAccountId.value) {
    return 'Conta CETESB ativa não identificada. Volte e selecione a conta antes de criar o manifesto.';
  }

  return 'Sessão CETESB indisponível. Faça login novamente para carregar os catálogos.';
});
const currentStep = ref(1);
const stepDefinitions = [
  { value: 1, title: 'Dados da viagem', subtitle: 'Conta, cópias e data de saída' },
  { value: 2, title: 'Quem participa', subtitle: 'Quem gera, quem leva e quem recebe' },
  { value: 3, title: 'O que está sendo levado', subtitle: 'O resíduo, a quantidade e a embalagem' },
  { value: 4, title: 'Conferir e enviar', subtitle: 'Revise tudo antes de enviar' }
];
const currentStepMeta = computed(() => stepDefinitions.find((step) => step.value === currentStep.value) || stepDefinitions[0]);
const completionRatio = computed(() => Math.round((currentStep.value / stepDefinitions.length) * 100));
const reviewChecklist = computed(() => [
  {
    label: 'Conta CETESB ativa',
    value: activeAccountLabel.value,
    ok: Boolean(resolvedIntegrationAccountId.value)
  },
  {
    label: 'Sessão CETESB pronta',
    value: currentSessionContextId.value || 'Sessão indisponível',
    ok: Boolean(currentSessionContextId.value)
  },
  {
    label: 'Transportador',
    value: selectedCarrier.value?.description || 'Não selecionado',
    ok: Boolean(selectedCarrier.value)
  },
  {
    label: 'Destinador',
    value: selectedReceiver.value?.description || 'Não selecionado',
    ok: Boolean(selectedReceiver.value)
  },
  {
    label: 'Resíduo',
    value: selectedResidueCatalogItem.value?.name || selectedResidueCatalogItem.value?.description || 'Não selecionado',
    ok: Boolean(selectedResidueCatalogItem.value)
  }
]);

watch(
  () => props.integrationAccountId,
  (nextValue) => {
    form.integrationAccountId = String(nextValue || '').trim();
  },
  { immediate: true }
);

watch(
  () => resolvedUser.value?.name || '',
  (nextName) => {
    if (!String(form.responsibleName || '').trim() && nextName) {
      form.responsibleName = nextName;
    }
  },
  { immediate: true }
);

onMounted(async () => {
  const shouldSyncSession = await Promise.resolve(authStore.checkAuth())
    && (!resolvedUser.value?.name || !currentSessionContextId.value);

  if (shouldSyncSession) {
    try {
      await authStore.syncSicatSession();
    } catch {
    }
  }

  await loadCatalogs();
});

onUnmounted(() => {
  clearPartnerSearchTimer('carrier');
  clearPartnerSearchTimer('receiver');
});

watch(
  [() => form.integrationAccountId, () => currentSessionContextId.value],
  async ([integrationAccountId, sessionContextId], [prevIntegrationAccountId, prevSessionContextId]) => {
    const becameAvailable =
      (!prevIntegrationAccountId && integrationAccountId)
      || (!prevSessionContextId && sessionContextId);

    if (becameAvailable) {
      await loadCatalogs();
    }
  }
);

function buildRequestedBy(user) {
  const emailPrefix = String(user?.email || '').trim().split('@')[0];
  if (emailPrefix) {
    return emailPrefix;
  }

  const normalizedName = String(user?.name || '')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '.')
    .replaceAll(/^\.+|\.+$/g, '');

  if (normalizedName) {
    return normalizedName;
  }

  if (user?.accessCode) {
    return String(user.accessCode);
  }

  return 'frontend.user';
}

function normalizeDigits(value) {
  return String(value || '').replaceAll(/\D/g, '');
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPartnerCode(partner) {
  const partnerCode = partner?._partnerCode ?? partner?.partnerCode ?? partner?.code ?? partner?.parCodigo ?? partner?.raw?.parCodigo;
  const parsed = Number(partnerCode);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildAddress(address = {}, fallbackState = '') {
  return {
    street: address.street || '',
    number: address.number || '',
    complement: address.complement || '',
    district: address.district || '',
    postalCode: normalizeDigits(address.postalCode || ''),
    city: address.city || '',
    state: address.state || fallbackState || ''
  };
}

function buildGeneratorPartner(partner, user) {
  const fallbackState = partner?.state?.abbreviation || 'SP';

  return {
    partnerCode: getPartnerCode(partner),
    description: partner?.description || partner?.tradeName || user?.name || '',
    tradeName: partner?.tradeName || partner?.description || '',
    document: normalizeDigits(partner?.document || user?.document || ''),
    registration: partner?.registration ?? null,
    address: buildAddress(partner?.address, fallbackState)
  };
}

function buildPartnerPayload(partner) {
  if (!partner) {
    return null;
  }

  return {
    partnerCode: getPartnerCode(partner),
    description: partner.description || partner.tradeName || '',
    tradeName: partner.tradeName || '',
    document: normalizeDigits(partner.document || ''),
    registration: partner.registration ?? null,
    licenseIssuer: partner.licenseIssuer ?? null,
    licenseNumber: partner.licenseNumber ?? null,
    address: buildAddress(partner.address, partner.address?.state || 'SP')
  };
}

function buildUnitPayload(item) {
  if (!item) {
    return null;
  }

  return {
    code: toNumber(item.code),
    description: item.name || item.description || '',
    symbol: item.shortName || item.symbol || item.raw?.uniSigla || null
  };
}

function buildSimpleCatalogPayload(item) {
  if (!item) {
    return null;
  }

  return {
    code: toNumber(item.code),
    description: item.name || item.description || ''
  };
}

function buildResiduePayload(item) {
  if (!item) {
    return null;
  }

  return {
    code: toNumber(item.code),
    ibamaCode: item.shortName || item.raw?.ibamaCodigo || item.raw?.resCodigoIbama || null,
    description: item.name || item.description || '',
    groupDescription: item.group || item.groupDescription || item.raw?.grrDescricao || null,
    groupRepresentation: item.raw?.gruRepresentacao || item.groupRepresentation || null
  };
}

function truncateText(value, maxLength = 80) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function formatResidueOption(item) {
  const code = item?.code ?? '';
  const description = item?.name || item?.description || '';
  const summarizedDescription = truncateText(description, 70);
  return `${code} · ${summarizedDescription}`;
}

function setCatalogDefaults() {
  if (!form.unitCode && catalogOptions.units.length > 0) {
    form.unitCode = String(catalogOptions.units[0].code);
  }

  if (!form.residueCode && catalogOptions.residueClasses.length > 0) {
    form.residueCode = String(catalogOptions.residueClasses[0].code);
  }

  if (!form.treatmentCode && catalogOptions.residueTreatments.length > 0) {
    form.treatmentCode = String(catalogOptions.residueTreatments[0].code);
  }

  if (!form.classCode && catalogOptions.classes.length > 0) {
    form.classCode = String(catalogOptions.classes[0].code);
  }

  if (!form.stateTypeCode && catalogOptions.residueStates.length > 0) {
    form.stateTypeCode = String(catalogOptions.residueStates[0].code);
  }

  if (!form.packagingTypeCode && catalogOptions.packagingGroups.length > 0) {
    form.packagingTypeCode = String(catalogOptions.packagingGroups[0].code);
  }
}

function findCatalogItem(collection, code) {
  return collection.find((item) => String(item.code) === String(code));
}

function formatPartnerOption(item) {
  const partnerCode = item?._partnerCode || getPartnerCode(item) || '—';
  const description = String(item?.description || item?.tradeName || '').trim();
  const normalizedDescription = description || 'Parceiro sem descrição';
  return `${normalizedDescription} · ${partnerCode}`;
}

function formatUnitOption(item) {
  const label = item?.name || item?.description || '';
  const shortName = item?.shortName || item?.symbol || '';
  return shortName ? `${label} (${shortName})` : label;
}

function formatCatalogOption(item) {
  const label = item?.name || item?.description || '';
  const code = item?.code;
  if (!label) {
    return String(code || 'Item sem descrição');
  }

  return `${label} · ${code}`;
}

function getSelectedPartner(type) {
  const state = partnerSearch[type];
  return state.results.find((item) => String(getPartnerCode(item)) === String(state.selectedCode)) || null;
}

async function loadCatalogs() {
  catalogsLoading.value = true;
  errorMessage.value = '';

  try {
    const names = ['units', 'residueTreatments', 'classes', 'residueStates', 'packagingGroups', 'residueClasses'];
    const catalogQuery = {
      page: 1,
      pageSize: 200,
      integrationAccountId: form.integrationAccountId || undefined,
      sessionContextId: currentSessionContextId.value || undefined
    };

    const responses = await Promise.all(
      names.map((name) => getCatalog(name, catalogQuery))
    );

    names.forEach((name, index) => {
      catalogOptions[name] = Array.isArray(responses[index]?.items) ? responses[index].items : [];
    });

    setCatalogDefaults();
  } catch (error) {
    errorMessage.value = error.message || 'Falha ao carregar catálogos auxiliares.';
  } finally {
    catalogsLoading.value = false;
  }
}

function clearPartnerSearchTimer(type) {
  if (!partnerSearchTimers[type]) {
    return;
  }

  clearTimeout(partnerSearchTimers[type]);
  partnerSearchTimers[type] = null;
}

function buildPartnerSearchPayload(rawQuery) {
  const normalizedQuery = String(rawQuery || '').trim();
  const numericOnly = /^\d+$/.test(normalizedQuery);

  return {
    integrationAccountId: resolvedIntegrationAccountId.value,
    page: 1,
    pageSize: 20,
    sessionContextId: currentSessionContextId.value || undefined,
    ...(numericOnly && normalizedQuery.length <= 8
      ? { code: Number(normalizedQuery) }
      : { q: normalizedQuery, search: normalizedQuery })
  };
}

function getPartnerRoles(type) {
  if (type === 'carrier') {
    return ['transportador', 'carrier'];
  }

  return ['destinador', 'receiver'];
}

function queuePartnerSearch(type, rawQuery) {
  const state = partnerSearch[type];
  state.query = String(rawQuery || '');
  state.error = '';

  clearPartnerSearchTimer(type);

  const normalizedQuery = state.query.trim();
  if (!normalizedQuery) {
    state.results = [];
    state.selectedCode = '';
    state.loading = false;
    return;
  }

  if (normalizedQuery.length < PARTNER_SEARCH_MIN_LENGTH) {
    state.loading = false;
    return;
  }

  partnerSearchTimers[type] = setTimeout(async () => {
    await handlePartnerSearch(type, normalizedQuery);
  }, PARTNER_SEARCH_DEBOUNCE_MS);
}

async function handlePartnerSearch(type, rawQuery = partnerSearch[type].query) {
  const state = partnerSearch[type];
  const normalizedQuery = String(rawQuery || '').trim();
  state.error = '';

  if (!resolvedIntegrationAccountId.value) {
    state.error = 'Selecione uma conta CETESB ativa antes de pesquisar parceiros.';
    state.loading = false;
    return;
  }

  if (normalizedQuery.length < PARTNER_SEARCH_MIN_LENGTH) {
    state.loading = false;
    return;
  }

  state.loading = true;

  try {
    await authStore.ensureSessionContextReady();

    const mergedResults = [];
    const seenPartnerCodes = new Set();
    let lastError = null;

    for (const role of getPartnerRoles(type)) {
      try {
        const response = await searchPartners({
          ...buildPartnerSearchPayload(normalizedQuery),
          role
        });

        const items = Array.isArray(response?.items) ? response.items : [];
        items.forEach((item) => {
          const partnerCode = String(getPartnerCode(item) || '');
          if (!partnerCode || seenPartnerCodes.has(partnerCode)) {
            return;
          }

          seenPartnerCodes.add(partnerCode);
          mergedResults.push({ ...item, _partnerCode: partnerCode });
        });
      } catch (error) {
        lastError = error;
      }
    }

    if (mergedResults.length === 0 && lastError) {
      throw lastError;
    }

    state.results = mergedResults;
    const hasSelectedCode = mergedResults.some((item) => String(item._partnerCode) === String(state.selectedCode));

    if (!hasSelectedCode) {
      state.selectedCode = mergedResults.length > 0
        ? String(mergedResults[0]._partnerCode || '')
        : '';
    }

    if (mergedResults.length === 0) {
      state.selectedCode = '';
      state.error = 'Nenhum parceiro encontrado para os critérios informados.';
    } else {
      state.error = '';
    }
  } catch (error) {
    state.error = error.message || 'Falha ao pesquisar parceiros.';
    state.results = [];
    state.selectedCode = '';
  } finally {
    state.loading = false;
  }
}

function validateForm(shouldSubmitNow) {
  if (!resolvedIntegrationAccountId.value) {
    throw new Error('Selecione uma conta CETESB ativa antes de criar o manifesto.');
  }

  if (!form.responsibleName.trim()) {
    throw new Error('Informe o responsável pela expedição.');
  }

  if (!form.expeditionDate) {
    throw new Error('Informe a data de expedição.');
  }

  if (!toApiDate(form.expeditionDate)) {
    throw new Error('Informe a data de expedição no formato dd/mm/yyyy.');
  }

  if (!selectedCarrier.value) {
    throw new Error('Selecione o transportador.');
  }

  if (!selectedReceiver.value) {
    throw new Error('Selecione o destinador.');
  }

  if (!form.residueCode || !form.treatmentCode || !form.classCode || !form.stateTypeCode || !form.packagingTypeCode || !form.unitCode) {
    throw new Error('Selecione os catálogos obrigatórios do resíduo.');
  }

  if (toNumber(form.quantity) === null || toNumber(form.quantity) <= 0) {
    throw new Error('Informe uma quantidade válida.');
  }

  if (toNumber(form.weightTon) === null || toNumber(form.weightTon) <= 0) {
    throw new Error('Informe um peso válido em toneladas.');
  }

  if (shouldSubmitNow && !currentSessionContextId.value) {
    throw new Error('Sessão CETESB indisponível. Faça login novamente para submeter agora.');
  }

  const batchCount = Number(form.batchCount || 1);
  if (!isSingleOnly.value) {
    if (!Number.isInteger(batchCount) || batchCount < 1) {
      throw new Error('Informe uma quantidade de manifestos válida para o lote.');
    }

    if (batchCount > 100) {
      throw new Error('O lote está limitado a 100 manifestos por vez.');
    }
  }

}

function validateStep1() {
  if (!resolvedIntegrationAccountId.value) {
    throw new Error('Selecione uma conta CETESB ativa antes de iniciar o manifesto.');
  }

  if (!String(form.responsibleName || '').trim()) {
    throw new Error('Informe o responsável pela expedição para continuar.');
  }

  if (!form.expeditionDate || !toApiDate(form.expeditionDate)) {
    throw new Error('Informe a data de expedição no formato dd/mm/yyyy.');
  }

  if (!isSingleOnly.value) {
    const batchCount = Number(form.batchCount || 1);
    if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 100) {
      throw new Error('Informe uma quantidade de manifestos válida entre 1 e 100.');
    }
  }
}

function validateStep2() {
  if (!selectedCarrier.value) {
    throw new Error('Selecione o transportador para seguir ao próximo passo.');
  }

  if (!selectedReceiver.value) {
    throw new Error('Selecione o destinador para seguir ao próximo passo.');
  }
}

function validateStep3() {
  if (!form.residueCode || !form.treatmentCode || !form.classCode || !form.stateTypeCode || !form.packagingTypeCode || !form.unitCode) {
    throw new Error('Selecione todos os catálogos obrigatórios do resíduo antes de revisar.');
  }

  if (toNumber(form.quantity) === null || toNumber(form.quantity) <= 0) {
    throw new Error('Informe uma quantidade válida do resíduo.');
  }

  if (toNumber(form.weightTon) === null || toNumber(form.weightTon) <= 0) {
    throw new Error('Informe um peso válido em toneladas.');
  }
}

function validateStep4() {
  validateForm(false);
}

function getStepError(step) {
  try {
    const validators = {
      1: validateStep1,
      2: validateStep2,
      3: validateStep3,
      4: validateStep4
    };

    const validator = validators[step];
    if (validator) {
      validator();
    }

    return '';
  } catch (error) {
    return error.message || 'Revise os dados deste passo.';
  }
}

function stepState(step) {
  const error = getStepError(step);
  if (currentStep.value === step) {
    return error ? 'current-error' : 'current';
  }

  if (currentStep.value > step) {
    return error ? 'error' : 'complete';
  }

  return error ? 'pending-error' : 'pending';
}

function goToStep(step) {
  if (step <= currentStep.value) {
    currentStep.value = step;
    return;
  }

  for (let index = 1; index < step; index += 1) {
    const error = getStepError(index);
    if (error) {
      errorMessage.value = error;
      currentStep.value = index;
      return;
    }
  }

  errorMessage.value = '';
  currentStep.value = step;
}

function goToPreviousStep() {
  currentStep.value = Math.max(1, currentStep.value - 1);
}

function goToNextStep() {
  const error = getStepError(currentStep.value);
  if (error) {
    errorMessage.value = error;
    return;
  }

  errorMessage.value = '';
  currentStep.value = Math.min(stepDefinitions.length, currentStep.value + 1);
}

function buildManifestPayload() {
  const selectedUnit = findCatalogItem(catalogOptions.units, form.unitCode);
  const selectedResidue = findCatalogItem(catalogOptions.residueClasses, form.residueCode);
  const selectedTreatmentItem = findCatalogItem(catalogOptions.residueTreatments, form.treatmentCode);
  const selectedClassItem = findCatalogItem(catalogOptions.classes, form.classCode);
  const selectedStateTypeItem = findCatalogItem(catalogOptions.residueStates, form.stateTypeCode);
  const selectedPackagingTypeItem = findCatalogItem(catalogOptions.packagingGroups, form.packagingTypeCode);

  return {
    integrationAccountId: resolvedIntegrationAccountId.value,
    sessionContextId: currentSessionContextId.value || undefined,
    requestedBy: requestedBy.value,
    manifestType: 1,
    state: {
      code: 26,
      abbreviation: 'SP'
    },
    responsibleName: form.responsibleName.trim(),
    expeditionDate: toApiDate(form.expeditionDate),
    driverName: form.driverName.trim(),
    vehiclePlate: form.vehiclePlate.trim().toUpperCase(),
    notes: form.notes.trim(),
    hasTemporaryStorage: Boolean(form.hasTemporaryStorage),
    hasCadriInResidueList: Boolean(form.hasCadriInResidueList),
    generator: buildPartnerPayload(generatorPartner.value),
    carrier: buildPartnerPayload(selectedCarrier.value),
    receiver: buildPartnerPayload(selectedReceiver.value),
    temporaryStorage: null,
    temporaryStorageCarrier: null,
    residues: [
      {
        lineNumber: 1,
        quantity: toNumber(form.quantity),
        receivedQuantity: null,
        weightTon: toNumber(form.weightTon),
        unit: buildUnitPayload(selectedUnit),
        residue: buildResiduePayload(selectedResidue),
        treatment: buildSimpleCatalogPayload(selectedTreatmentItem),
        class: buildSimpleCatalogPayload(selectedClassItem),
        abnt: null,
        cadriItem: null,
        stateType: buildSimpleCatalogPayload(selectedStateTypeItem),
        packagingType: buildSimpleCatalogPayload(selectedPackagingTypeItem),
        packagingGroup: null,
        internalCode: null,
        onuCode: null,
        riskClass: null,
        shipmentName: null,
        notes: null
      }
    ]
  };
}

function getBatchCreatedIds(batchResult) {
  return Array.isArray(batchResult.items)
    ? batchResult.items.map((item) => item.id).filter(Boolean)
    : [];
}

async function createBatchFlow(manifestPayload, batchCount, shouldSubmitNow) {
  const batchResult = await batchCreateManifests({
    integrationAccountId: manifestPayload.integrationAccountId,
    sessionContextId: manifestPayload.sessionContextId,
    requestedBy: manifestPayload.requestedBy,
    count: batchCount,
    template: manifestPayload
  });

  let batchSubmitResult = null;
  const createdIds = getBatchCreatedIds(batchResult);

  if (shouldSubmitNow) {
    if (!createdIds.length) {
      throw new Error('Não foi possível identificar os manifestos criados para solicitar o envio em lote.');
    }

    batchSubmitResult = await batchSubmitManifests({
      manifestIds: createdIds,
      sessionContextId: currentSessionContextId.value,
      requestedBy: requestedBy.value,
      validateOnly: false,
      printAfterSubmit: false,
      groupId: batchResult.groupId || undefined
    });
  }

  successMessage.value = shouldSubmitNow
    ? `${batchResult.total} manifestos criados e envios enfileirados no grupo ${batchResult.groupId}.`
    : `${batchResult.total} manifestos criados no grupo ${batchResult.groupId}.`;

  emit('success', {
    integrationAccountId: resolvedIntegrationAccountId.value,
    groupId: batchResult.groupId,
    batchCount: batchResult.total,
    createdIds,
    created: Array.isArray(batchResult.items) ? batchResult.items : [],
    batchResult,
    submitResult: batchSubmitResult
  });
}

async function createSingleFlow(manifestPayload, shouldSubmitNow) {
  const created = await createManifest(manifestPayload);
  let submitResult = null;

  if (shouldSubmitNow) {
    submitResult = await submitManifest(created.id, {
      sessionContextId: currentSessionContextId.value,
      requestedBy: requestedBy.value,
      validateOnly: false,
      printAfterSubmit: false
    });
  }

  const createdLabel = created.manifestNumber
    ? `MTR ${created.manifestNumber}`
    : 'manifesto (número CETESB pendente)';

  successMessage.value = shouldSubmitNow
    ? `${createdLabel} criado e envio enfileirado.`
    : `${createdLabel} criado como rascunho.`;

  emit('success', {
    createdId: created.id,
    integrationAccountId: resolvedIntegrationAccountId.value,
    created,
    submitResult
  });
}

async function handleCreate(shouldSubmitNow) {
  // Guarda de reentrância: evita criar/submeter um MTR duplicado caso o botão
  // seja acionado duas vezes em sequência (duplo clique ou Enter) antes do
  // estado `loading` desabilitar a ação no template.
  if (loading.value) {
    return;
  }

  errorMessage.value = '';
  successMessage.value = '';
  loading.value = true;

  try {
    await authStore.ensureSessionContextReady({ force: false });
    validateForm(shouldSubmitNow);

    const manifestPayload = buildManifestPayload();

    if (typeof props.submitHandler === 'function') {
      const result = await props.submitHandler(manifestPayload);
      const createdId = result?.createdId || result?.id || result?.commandId || result?.entityId || null;
      successMessage.value = result?.successMessage || 'Comando enviado com sucesso.';
      emit('success', {
        createdId,
        integrationAccountId: resolvedIntegrationAccountId.value,
        result
      });
      return;
    }

    const batchCount = Number(form.batchCount || 1);

    if (batchCount > 1) {
      await createBatchFlow(manifestPayload, batchCount, shouldSubmitNow);
      return;
    }

    await createSingleFlow(manifestPayload, shouldSubmitNow);
  } catch (error) {
    errorMessage.value = error.message || 'Falha ao criar manifesto.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="wizard-shell" data-testid="manifest-wizard-shell">
    <div class="wizard-header">
      <div class="wizard-header-copy">
        <span class="wizard-kicker">{{ pageKicker }}</span>
        <h2>{{ pageTitle }}</h2>
        <p class="text-muted">{{ pageDescription }}</p>
      </div>
      <v-btn variant="outlined" prepend-icon="mdi-refresh" :disabled="catalogsLoading || loading" @click="loadCatalogs">
        {{ catalogsLoading ? 'Atualizando catálogos...' : 'Recarregar catálogos' }}
      </v-btn>
    </div>

    <SicatInlineAlert v-if="errorMessage" tone="error" :message="errorMessage" />
    <SicatInlineAlert v-if="successMessage" tone="success" :message="successMessage" />
    <SicatNextStep
      v-if="successMessage"
      class="mt-3"
      title="Pronto! E agora?"
      message="Você pode acompanhar, imprimir ou enviar o manifesto na sua lista."
      action-label="Ver meus manifestos"
      to="/manifestos"
    />
    <SicatInlineAlert v-if="catalogContextWarning" tone="warning" :message="catalogContextWarning" />

    <div class="wizard-layout">
      <div class="wizard-main">
        <v-card class="wizard-stepper-card">
          <v-card-text class="pb-0">
            <div class="wizard-progress-row">
              <div>
                <div class="text-overline text-primary mb-1">Etapa {{ currentStep }} de {{ stepDefinitions.length }}</div>
                <div class="text-h6 font-weight-bold">{{ currentStepMeta.title }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ currentStepMeta.subtitle }}</div>
              </div>
              <div class="wizard-progress-pill">{{ completionRatio }}%</div>
            </div>

            <div class="wizard-step-tabs mt-6">
              <button
                v-for="step in stepDefinitions"
                :key="step.value"
                type="button"
                class="wizard-step-tab"
                :class="`is-${stepState(step.value)}`"
                @click="goToStep(step.value)"
              >
                <span class="wizard-step-index">{{ step.value }}</span>
                <span class="wizard-step-copy">
                  <strong>{{ step.title }}</strong>
                  <small>{{ step.subtitle }}</small>
                </span>
              </button>
            </div>
          </v-card-text>

          <v-divider class="my-5" />

          <v-card-text>
            <div v-show="currentStep === 1" class="wizard-step-body">
              <v-row>
                <v-col cols="12" md="7">
                  <div class="wizard-static-field mb-4">
                    <span>Conta CETESB ativa</span>
                    <strong>{{ activeAccountLabel }}</strong>
                    <small>{{ activeAccountMeta || 'A conta ativa é preenchida automaticamente a partir da sessão.' }}</small>
                  </div>
                </v-col>
                <v-col v-if="!isSingleOnly" cols="12" md="5">
                  <v-text-field v-model.number="form.batchCount" type="number" min="1" max="100" step="1" label="Quantidade no lote" :disabled="loading" hint="Use 1 para criação unitária. Valores maiores criam rascunhos idênticos." persistent-hint />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field
                    v-model="form.expeditionDate"
                    label="Data de expedição"
                    placeholder="dd/mm/yyyy"
                    :disabled="loading"
                    @blur="form.expeditionDate = normalizeBrDateInput(form.expeditionDate)"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="form.responsibleName" label="Responsável" autocomplete="name" :disabled="loading" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="form.driverName" label="Motorista" autocomplete="off" :disabled="loading" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="form.vehiclePlate" label="Placa do veículo" maxlength="8" autocomplete="off" :disabled="loading" />
                </v-col>
                <v-col cols="12" md="8">
                  <v-textarea v-model="form.notes" label="Observações" rows="4" auto-grow :disabled="loading" />
                </v-col>
              </v-row>
            </div>

            <div v-show="currentStep === 2" class="wizard-step-body">
              <v-row>
                <v-col cols="12">
                  <v-card variant="tonal" color="primary" class="mb-4">
                    <v-card-text>
                      <div class="text-caption font-weight-bold mb-1">Gerador fixo da sessão</div>
                      <div class="text-subtitle-1 font-weight-bold">{{ generatorPartner.description || 'Parceiro autenticado' }}</div>
                      <div class="text-body-2 text-medium-emphasis mt-1">Código: {{ generatorPartner.partnerCode || '—' }} · Documento: {{ generatorPartner.document || '—' }}</div>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="12" md="6">
                  <div class="wizard-dropdown-field">
                    <span>Transportador *<SicatHelpHint term="transportador" /></span>
                    <FilterableDropdown
                      v-model="partnerSearch.carrier.selectedCode"
                      v-model:search-value="partnerSearch.carrier.query"
                      :options="partnerSearch.carrier.results"
                      option-value-key="_partnerCode"
                      :option-label="formatPartnerOption"
                      :disabled="loading"
                      :loading="partnerSearch.carrier.loading"
                      placeholder="Digite nome ou código do transportador"
                      no-data-text="Digite pelo menos 2 caracteres para buscar."
                      empty-text="Nenhum transportador encontrado para o filtro."
                      aria-label="Selecionar transportador"
                      @search-change="queuePartnerSearch('carrier', $event)"
                    />
                    <small v-if="partnerSearch.carrier.error" class="wizard-inline-error">{{ partnerSearch.carrier.error }}</small>
                    <small v-else-if="selectedCarrier" class="text-medium-emphasis">{{ selectedCarrier.document || 'Sem documento' }} · {{ selectedCarrier.address?.city || 'Cidade não informada' }}/{{ selectedCarrier.address?.state || 'SP' }}</small>
                  </div>
                </v-col>
                <v-col cols="12" md="6">
                  <div class="wizard-dropdown-field">
                    <span>Destinador *<SicatHelpHint term="destinador" /></span>
                    <FilterableDropdown
                      v-model="partnerSearch.receiver.selectedCode"
                      v-model:search-value="partnerSearch.receiver.query"
                      :options="partnerSearch.receiver.results"
                      option-value-key="_partnerCode"
                      :option-label="formatPartnerOption"
                      :disabled="loading"
                      :loading="partnerSearch.receiver.loading"
                      placeholder="Digite nome ou código do destinador"
                      no-data-text="Digite pelo menos 2 caracteres para buscar."
                      empty-text="Nenhum destinador encontrado para o filtro."
                      aria-label="Selecionar destinador"
                      @search-change="queuePartnerSearch('receiver', $event)"
                    />
                    <small v-if="partnerSearch.receiver.error" class="wizard-inline-error">{{ partnerSearch.receiver.error }}</small>
                    <small v-else-if="selectedReceiver" class="text-medium-emphasis">{{ selectedReceiver.document || 'Sem documento' }} · {{ selectedReceiver.address?.city || 'Cidade não informada' }}/{{ selectedReceiver.address?.state || 'SP' }}</small>
                  </div>
                </v-col>
              </v-row>
            </div>

            <div v-show="currentStep === 3" class="wizard-step-body">
              <v-row>
                <v-col cols="12">
                  <h4 class="wizard-subsection">Quanto está sendo levado</h4>
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model.number="form.quantity" type="number" min="0.001" step="0.001" label="Quantidade" hint="Quanto está sendo levado, na unidade ao lado." persistent-hint :disabled="loading || catalogsLoading" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model.number="form.weightTon" type="number" min="0.001" step="0.001" label="Peso (toneladas)" hint="O peso total da carga, em toneladas." persistent-hint :disabled="loading || catalogsLoading" />
                </v-col>
                <v-col cols="12" md="4">
                  <div class="wizard-dropdown-field">
                    <span>Unidade *<SicatHelpHint title="Unidade" text="A medida da quantidade: litros, quilos, peças, metros cúbicos…" /></span>
                    <FilterableDropdown
                      v-model="form.unitCode"
                      :options="catalogOptions.units"
                      option-value-key="code"
                      :option-label="formatUnitOption"
                      clearable
                      :disabled="loading || catalogsLoading"
                      :loading="catalogsLoading"
                      placeholder="Digite para filtrar unidade"
                      aria-label="Selecionar unidade"
                    />
                  </div>
                </v-col>

                <v-col cols="12">
                  <h4 class="wizard-subsection">Qual é o resíduo</h4>
                </v-col>
                <v-col cols="12">
                  <div class="wizard-dropdown-field">
                    <span>Resíduo *<SicatHelpHint title="Tipo de resíduo" text="Escolha na lista o que mais parece com o seu lixo. Digite uma palavra para filtrar (ex.: óleo, tinta, entulho)." /></span>
                    <FilterableDropdown
                      v-model="form.residueCode"
                      :options="catalogOptions.residueClasses"
                      option-value-key="code"
                      :option-label="formatResidueOption"
                      clearable
                      :disabled="loading || catalogsLoading"
                      :loading="catalogsLoading"
                      placeholder="Digite para filtrar resíduo"
                      aria-label="Selecionar resíduo"
                    />
                    <div v-if="selectedResidueCatalogItem" class="wizard-residue-summary">
                      <strong>{{ selectedResidueCatalogItem.name || selectedResidueCatalogItem.description }}</strong>
                      <span>Código: {{ selectedResidueCatalogItem.code }}</span>
                      <span v-if="selectedResidueCatalogItem.shortName || selectedResidueCatalogItem.raw?.ibamaCodigo">
                        IBAMA: {{ selectedResidueCatalogItem.shortName || selectedResidueCatalogItem.raw?.ibamaCodigo }}
                      </span>
                    </div>
                  </div>
                </v-col>

                <v-col cols="12">
                  <h4 class="wizard-subsection">Detalhes do resíduo</h4>
                </v-col>
                <v-col cols="12" md="4">
                  <div class="wizard-dropdown-field">
                    <span>Tratamento *<SicatHelpHint term="tratamento" /></span>
                    <FilterableDropdown
                      v-model="form.treatmentCode"
                      :options="catalogOptions.residueTreatments"
                      option-value-key="code"
                      :option-label="formatCatalogOption"
                      clearable
                      :disabled="loading || catalogsLoading"
                      :loading="catalogsLoading"
                      placeholder="Digite para filtrar tratamento"
                      aria-label="Selecionar tratamento"
                    />
                  </div>
                </v-col>
                <v-col cols="12" md="4">
                  <div class="wizard-dropdown-field">
                    <span>Classe *<SicatHelpHint term="classe" /></span>
                    <FilterableDropdown
                      v-model="form.classCode"
                      :options="catalogOptions.classes"
                      option-value-key="code"
                      :option-label="formatCatalogOption"
                      clearable
                      :disabled="loading || catalogsLoading"
                      :loading="catalogsLoading"
                      placeholder="Digite para filtrar classe"
                      aria-label="Selecionar classe"
                    />
                  </div>
                </v-col>
                <v-col cols="12" md="4">
                  <div class="wizard-dropdown-field">
                    <span>Estado físico *<SicatHelpHint term="estado_fisico" /></span>
                    <FilterableDropdown
                      v-model="form.stateTypeCode"
                      :options="catalogOptions.residueStates"
                      option-value-key="code"
                      :option-label="formatCatalogOption"
                      clearable
                      :disabled="loading || catalogsLoading"
                      :loading="catalogsLoading"
                      placeholder="Digite para filtrar estado físico"
                      aria-label="Selecionar estado físico"
                    />
                  </div>
                </v-col>

                <v-col cols="12">
                  <h4 class="wizard-subsection">Como está embalado</h4>
                </v-col>
                <v-col cols="12" md="6">
                  <div class="wizard-dropdown-field">
                    <span>Acondicionamento *<SicatHelpHint term="acondicionamento" /></span>
                    <FilterableDropdown
                      v-model="form.packagingTypeCode"
                      :options="catalogOptions.packagingGroups"
                      option-value-key="code"
                      :option-label="formatCatalogOption"
                      clearable
                      :disabled="loading || catalogsLoading"
                      :loading="catalogsLoading"
                      placeholder="Digite para filtrar acondicionamento"
                      aria-label="Selecionar acondicionamento"
                    />
                  </div>
                </v-col>
                <v-col cols="12" md="6">
                  <div class="wizard-flags-card">
                    <v-switch v-model="form.hasTemporaryStorage" inset color="primary" :disabled="loading" hide-details>
                      <template #label>
                        Ficou guardado em local temporário?
                        <SicatHelpHint title="Armazenamento temporário" text="Marque se o resíduo ficou guardado num local temporário antes de ir para o destino." />
                      </template>
                    </v-switch>
                    <v-switch v-model="form.hasCadriInResidueList" inset color="primary" :disabled="loading" hide-details>
                      <template #label>
                        Tem CADRI?
                        <SicatHelpHint term="cadri" />
                      </template>
                    </v-switch>
                  </div>
                </v-col>
              </v-row>
            </div>

            <div v-show="currentStep === 4" class="wizard-step-body">
              <div class="wizard-review-grid">
                <div class="wizard-review-card">
                  <span>Contexto</span>
                  <strong>{{ activeAccountLabel }}</strong>
                  <small>{{ form.batchCount }} item(ns) · Expedição {{ form.expeditionDate || 'não informada' }}</small>
                </div>
                <div class="wizard-review-card">
                  <span>Participantes</span>
                  <strong>{{ selectedCarrier?.description || 'Transportador pendente' }}</strong>
                  <small>{{ selectedReceiver?.description || 'Destinador pendente' }}</small>
                </div>
                <div class="wizard-review-card">
                  <span>Resíduo</span>
                  <strong>{{ selectedResidueCatalogItem?.name || selectedResidueCatalogItem?.description || 'Resíduo pendente' }}</strong>
                  <small>{{ form.quantity || 0 }} {{ selectedUnitCatalogItem?.shortName || selectedUnitCatalogItem?.symbol || 'un.' }} · {{ form.weightTon || 0 }} ton</small>
                </div>
              </div>

              <v-list density="comfortable" lines="two" class="wizard-checklist mt-5">
                <v-list-item v-for="item in reviewChecklist" :key="item.label">
                  <template #prepend>
                    <v-icon :color="item.ok ? 'success' : 'warning'">{{ item.ok ? 'mdi-check-circle' : 'mdi-alert-circle-outline' }}</v-icon>
                  </template>
                  <v-list-item-title>{{ item.label }}</v-list-item-title>
                  <v-list-item-subtitle>{{ item.value }}</v-list-item-subtitle>
                </v-list-item>
              </v-list>

              <v-alert variant="tonal" color="info" class="mt-5">
                A criação unitária gera um rascunho ou um envio imediato. Quando o lote é maior que 1, o wizard cria um grupo de manifestos com o mesmo template antes de submeter.
              </v-alert>
            </div>
          </v-card-text>
        </v-card>

        <v-card class="wizard-footer-card">
          <v-card-text class="wizard-footer-actions">
            <div class="d-flex ga-2 flex-wrap">
              <v-btn variant="outlined" :disabled="currentStep === 1 || loading" prepend-icon="mdi-arrow-left" data-testid="wizard-prev-step" @click="goToPreviousStep">Voltar</v-btn>
              <v-btn v-if="currentStep < stepDefinitions.length" color="primary" :disabled="loading" append-icon="mdi-arrow-right" data-testid="wizard-next-step" @click="goToNextStep">Próximo passo</v-btn>
            </div>

            <div v-if="currentStep === stepDefinitions.length" class="d-flex ga-2 flex-wrap justify-end">
              <v-btn v-if="!isSingleOnly" variant="outlined" color="secondary" :loading="loading" :disabled="loading || catalogsLoading" data-testid="wizard-submit-draft" @click="handleCreate(false)">
                {{ loading ? 'Processando...' : resolvedDraftLabel }}
              </v-btn>
              <v-btn color="primary" :loading="loading" :disabled="!canImmediateSubmit" data-testid="wizard-submit-primary" @click="handleCreate(isSingleOnly ? false : true)">
                {{ loading ? 'Processando...' : resolvedPrimaryLabel }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </div>

      <aside class="wizard-sidebar">
        <v-card class="wizard-summary-card">
          <v-card-text>
            <div class="text-overline text-primary mb-2">Resumo do wizard</div>
            <div class="text-h6 font-weight-bold mb-1">Pronto para revisão</div>
            <p class="text-body-2 text-medium-emphasis mb-4">A lateral funciona como o resumo do checkout: contexto, participantes e item principal sempre visíveis.</p>

            <div class="wizard-summary-progress mb-5">
              <div class="wizard-summary-progress-bar">
                <span :style="{ width: `${completionRatio}%` }" />
              </div>
              <small>{{ completionRatio }}% concluído</small>
            </div>

            <div class="wizard-summary-stack">
              <div class="wizard-summary-item">
                <span>Conta ativa</span>
                <strong>{{ activeAccountLabel }}</strong>
                <small>{{ activeAccountMeta || 'Sem metadados adicionais' }}</small>
              </div>
              <div class="wizard-summary-item">
                <span>Transportador</span>
                <strong>{{ selectedCarrier?.description || 'Selecionar no passo 2' }}</strong>
                <small>{{ selectedCarrier?.document || 'Documento pendente' }}</small>
              </div>
              <div class="wizard-summary-item">
                <span>Destinador</span>
                <strong>{{ selectedReceiver?.description || 'Selecionar no passo 2' }}</strong>
                <small>{{ selectedReceiver?.document || 'Documento pendente' }}</small>
              </div>
              <div class="wizard-summary-item">
                <span>Item principal</span>
                <strong>{{ selectedResidueCatalogItem?.name || selectedResidueCatalogItem?.description || 'Selecionar no passo 3' }}</strong>
                <small>{{ selectedTreatmentCatalogItem?.name || selectedTreatmentCatalogItem?.description || 'Tratamento pendente' }}</small>
              </div>
            </div>

            <v-divider class="my-5" />

            <div class="wizard-summary-stack">
              <div class="wizard-summary-item compact">
                <span>Unidade</span>
                <strong>{{ selectedUnitCatalogItem?.name || selectedUnitCatalogItem?.description || '—' }}</strong>
              </div>
              <div class="wizard-summary-item compact">
                <span>Classe</span>
                <strong>{{ selectedClassCatalogItem?.name || selectedClassCatalogItem?.description || '—' }}</strong>
              </div>
              <div class="wizard-summary-item compact">
                <span>Estado físico</span>
                <strong>{{ selectedStateCatalogItem?.name || selectedStateCatalogItem?.description || '—' }}</strong>
              </div>
              <div class="wizard-summary-item compact">
                <span>Acondicionamento</span>
                <strong>{{ selectedPackagingCatalogItem?.name || selectedPackagingCatalogItem?.description || '—' }}</strong>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.wizard-shell {
  display: grid;
  gap: 20px;
}

.wizard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px;
  border-radius: 28px;
  border: 1px solid rgba(var(--v-border-color), 0.14);
  background: linear-gradient(135deg, rgba(var(--v-theme-surface), 0.96) 0%, rgba(var(--v-theme-primary), 0.06) 100%);
}

.wizard-header-copy {
  display: grid;
  gap: 8px;
}

.wizard-kicker {
  display: inline-flex;
  width: fit-content;
  min-height: 30px;
  align-items: center;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.wizard-header-copy h2 {
  font-size: 1.6rem;
  color: rgba(var(--v-theme-on-surface), 0.92);
}

.wizard-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(300px, 360px);
  gap: 20px;
  align-items: start;
}

.wizard-main,
.wizard-sidebar {
  display: grid;
  gap: 20px;
}

.wizard-progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wizard-progress-pill {
  min-width: 72px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 800;
}

.wizard-step-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.wizard-step-tab {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: 22px;
  border: 1px solid rgba(var(--v-border-color), 0.14);
  background: rgba(var(--v-theme-surface), 0.74);
  text-align: left;
  cursor: pointer;
}

.wizard-step-index {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  font-weight: 800;
}

.wizard-step-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.wizard-step-copy strong {
  font-size: 0.88rem;
  color: rgba(var(--v-theme-on-surface), 0.88);
}

.wizard-step-copy small {
  color: rgba(var(--v-theme-on-surface), 0.58);
}

.wizard-step-tab.is-current,
.wizard-step-tab.is-complete {
  border-color: rgba(var(--v-theme-primary), 0.22);
}

.wizard-step-tab.is-current {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.14) 0%, rgba(var(--v-theme-info), 0.08) 100%);
}

.wizard-step-tab.is-complete .wizard-step-index,
.wizard-step-tab.is-current .wizard-step-index {
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
}

.wizard-step-tab.is-error,
.wizard-step-tab.is-current-error,
.wizard-step-tab.is-pending-error {
  border-color: rgba(var(--v-theme-warning), 0.3);
}

.wizard-step-tab.is-error .wizard-step-index,
.wizard-step-tab.is-current-error .wizard-step-index,
.wizard-step-tab.is-pending-error .wizard-step-index {
  background: rgba(var(--v-theme-warning), 0.14);
  color: rgb(var(--v-theme-warning));
}

.wizard-step-body {
  display: grid;
  gap: 18px;
}

.wizard-static-field,
.wizard-flags-card,
.wizard-review-card,
.wizard-summary-item {
  display: grid;
  gap: 4px;
  padding: 16px 18px;
  border-radius: 20px;
  border: 1px solid rgba(var(--v-border-color), 0.14);
  background: rgba(var(--v-theme-surface), 0.72);
}

.wizard-subsection {
  margin: 6px 0 -2px;
  font-size: 0.98rem;
  font-weight: 800;
  color: rgba(var(--v-theme-on-surface), 0.84);
  border-left: 3px solid rgb(var(--v-theme-primary));
  padding-left: 10px;
}

.wizard-static-field span,
.wizard-dropdown-field span,
.wizard-summary-item span,
.wizard-review-card span {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(var(--v-theme-on-surface), 0.56);
}
/* a ajuda "?" alinha com o rótulo do campo */
.wizard-dropdown-field span :deep(.sicat-help-hint) { vertical-align: -6px; }

.wizard-static-field strong,
.wizard-summary-item strong,
.wizard-review-card strong {
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.wizard-static-field small,
.wizard-summary-item small,
.wizard-review-card small,
.wizard-dropdown-field small {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.wizard-dropdown-field {
  display: grid;
  gap: 8px;
}

.wizard-inline-error {
  color: rgb(var(--v-theme-error));
}

.wizard-residue-summary {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(var(--v-theme-primary), 0.08);
}

.wizard-review-grid,
.wizard-summary-stack {
  display: grid;
  gap: 12px;
}

.wizard-review-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.wizard-summary-progress {
  display: grid;
  gap: 8px;
}

.wizard-summary-progress-bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
}

.wizard-summary-progress-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgb(var(--v-theme-primary)) 0%, rgba(var(--v-theme-info), 1) 100%);
}

.wizard-footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.wizard-summary-item.compact {
  padding: 14px 16px;
}

@media (max-width: 1200px) {
  .wizard-layout {
    grid-template-columns: 1fr;
  }

  .wizard-step-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .wizard-header,
  .wizard-footer-actions {
    align-items: stretch;
  }

  .wizard-header {
    flex-direction: column;
  }

  .wizard-progress-row,
  .wizard-footer-actions {
    flex-direction: column;
  }

  .wizard-progress-pill {
    align-self: flex-start;
  }

  .wizard-step-tabs,
  .wizard-review-grid {
    grid-template-columns: 1fr;
  }
}
</style>