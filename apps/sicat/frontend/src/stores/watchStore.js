/**
 * Store do Regulatory Watch — programa "SICAT Transporte" (DL-103), PR-H1
 * (backend)/PR-H2 (frontend). Molde: stores/transporteStore.js.
 *
 * Backend: `/v1/transporte/watch*` — GLOBAL, SEM tenancy (mesmo racional do
 * catálogo regulatório `/v1/transporte/regras`: operador único). Fluxo:
 * DETECTED → INGESTED → AI_ANALYZED|AI_SKIPPED → HUMAN_REVIEW →
 * APPROVED|REJECTED → (aplicar) → ACTIVE_APPLIED. `revisar` só aceita itens
 * `human_review`; `aplicar` só aceita `approved` e SEMPRE cria uma versão
 * `blocking=false` (o único caminho para `blocking=true` é a promoção manual
 * em `TransporteRegrasView`). `verificar-agora` é 202 (enfileira a varredura
 * sob demanda, idempotente).
 */

import { reactive, ref } from 'vue';
import {
  applyTransportWatchItem,
  getTransportWatchItemById,
  listTransportWatchItems,
  reviewTransportWatchItem,
  triggerTransportWatchCheck,
  buildTransporteIdempotencyKey
} from '../services/transporteService.js';
import { useJobAwait } from '../composables/useJobAwait.js';

const DEFAULT_FILTERS = Object.freeze({ status: '', page: 1, pageSize: 20 });

function extractErrorMessage(error, fallback) {
  if (!error) return fallback;
  return error.detail || error.title || error.message || fallback;
}

function extractErrorCode(error) {
  return String(error?.payload?.code || error?.code || '').trim();
}

export function useWatchStore() {
  const { awaitJob } = useJobAwait();

  const filters = reactive({ ...DEFAULT_FILTERS });

  const items = ref([]);
  const totalItems = ref(0);
  const totalPages = ref(0);
  const loadingList = ref(false);
  const listError = ref('');

  const selected = ref(null);
  const loadingDetail = ref(false);
  const detailError = ref('');

  const commandLoading = ref(false);
  const commandError = ref('');
  const commandErrorCode = ref('');
  const commandFeedback = ref('');

  function clearCommandState() {
    commandError.value = '';
    commandErrorCode.value = '';
    commandFeedback.value = '';
  }

  async function executeCommand(label, fn) {
    clearCommandState();
    commandLoading.value = true;
    try {
      const result = await fn();
      commandFeedback.value = label;
      return result;
    } catch (error) {
      commandError.value = extractErrorMessage(error, label);
      commandErrorCode.value = extractErrorCode(error);
      throw error;
    } finally {
      commandLoading.value = false;
    }
  }

  async function fetchList() {
    listError.value = '';
    loadingList.value = true;
    try {
      const response = await listTransportWatchItems({
        status: filters.status || undefined,
        page: Number(filters.page || 1),
        pageSize: Number(filters.pageSize || 20)
      });
      items.value = Array.isArray(response.items) ? response.items : [];
      totalItems.value = Number(response.totalItems || 0);
      totalPages.value = Number(response.totalPages || 0);
    } catch (error) {
      items.value = [];
      totalItems.value = 0;
      totalPages.value = 0;
      listError.value = extractErrorMessage(error, 'Falha ao listar itens do Regulatory Watch.');
    } finally {
      loadingList.value = false;
    }
  }

  async function loadById(itemId) {
    if (!itemId) {
      selected.value = null;
      return null;
    }
    detailError.value = '';
    loadingDetail.value = true;
    try {
      selected.value = await getTransportWatchItemById(itemId);
      return selected.value;
    } catch (error) {
      selected.value = null;
      detailError.value = extractErrorMessage(error, 'Falha ao carregar o item do Regulatory Watch.');
      return null;
    } finally {
      loadingDetail.value = false;
    }
  }

  /** Só aceita itens `human_review` — `409 REGULATORY_WATCH_ITEM_NOT_REVIEWABLE` fora disso. */
  async function revisar({ decision, notes } = {}) {
    if (!selected.value?.id) return null;
    return executeCommand(decision === 'approved' ? 'Item aprovado.' : 'Item rejeitado.', async () => {
      const payload = { decision, version: selected.value.version };
      if (notes) payload.notes = notes;
      const updated = await reviewTransportWatchItem(selected.value.id, payload);
      selected.value = { ...selected.value, ...updated };
      return updated;
    });
  }

  /** Só aceita itens `approved` — cria versão da regra SEMPRE `blocking=false`. */
  async function aplicar(payload) {
    if (!selected.value?.id) return null;
    return executeCommand('Item aplicado ao catálogo — nova versão criada (não-bloqueante).', async () => {
      const response = await applyTransportWatchItem(selected.value.id, payload);
      await loadById(selected.value.id);
      return response;
    });
  }

  /** 202 — enfileira a varredura sob demanda (idempotente); NO-OP limpo se REGULATORY_WATCH_MODE=off. */
  async function verificarAgora() {
    return executeCommand('Varredura do Regulatory Watch enfileirada.', async () => {
      const accepted = await triggerTransportWatchCheck({
        idempotencyKey: buildTransporteIdempotencyKey('watch-verificar-agora')
      });
      await awaitJob(accepted.jobId);
      await fetchList();
      return accepted;
    });
  }

  function resetFilters() {
    Object.assign(filters, DEFAULT_FILTERS);
    items.value = [];
    totalItems.value = 0;
    totalPages.value = 0;
    listError.value = '';
  }

  return {
    filters,
    items,
    totalItems,
    totalPages,
    loadingList,
    listError,
    selected,
    loadingDetail,
    detailError,
    commandLoading,
    commandError,
    commandErrorCode,
    commandFeedback,
    fetchList,
    loadById,
    revisar,
    aplicar,
    verificarAgora,
    resetFilters,
    clearCommandState
  };
}
