/**
 * Store Vínculos de canal (WhatsApp) — cadeia whatsapp-channel-sicat, fase 02.
 *
 * Estado mínimo: números já vinculados, desafio de verificação vivo, limites
 * vigentes e o comando em andamento. Actions delegam ao channelLinkService.js —
 * a store não fala HTTP direto e não conhece `request()`.
 *
 * Padrão da casa (mtrProvisorioStore.js): factory `use<Dominio>Store()`, NUNCA
 * `defineStore`. O estado é de MÓDULO (criado uma vez, compartilhado entre
 * chamadas) porque o desafio pendente precisa sobreviver a uma remontagem da
 * tela; o `fetchList` do backend é a fonte da verdade em qualquer caso.
 *
 * O código OTP NUNCA entra aqui: ele vive apenas no input da view e no corpo da
 * requisição de confirmação. Nada de localStorage.
 *
 * Backend:
 *  - GET    /v1/sicat/channel-links
 *  - POST   /v1/sicat/channel-links
 *  - POST   /v1/sicat/channel-links/challenges/{id}/resend
 *  - POST   /v1/sicat/channel-links/challenges/{id}/confirm
 *  - DELETE /v1/sicat/channel-links/challenges/{id}
 *  - DELETE /v1/sicat/channel-links/{linkId}
 *  - POST   /v1/sicat/channel-links/whatsapp/action-window   (fase 05 — janela de ação N2)
 *  - GET    /v1/sicat/channel-links/whatsapp/action-window
 *  - DELETE /v1/sicat/channel-links/whatsapp/action-window/{id}
 */

import { computed, ref } from 'vue';
import {
  cancelChannelLinkChallenge,
  confirmChannelLinkChallenge,
  deleteChannelLink,
  getWhatsAppActionWindow,
  listChannelLinks,
  openWhatsAppActionWindow,
  resendChannelLinkChallenge,
  revokeWhatsAppActionWindow,
  startChannelLink
} from '../services/channelLinkService.js';
import {
  DEFAULT_CHANNEL_LINK_LIMITS,
  isChallengeGoneError,
  isChallengeMissingError,
  normalizeLimits,
  resolveChannelLinkError
} from '../features/channel-link/channelLinkState.js';
import {
  isWindowMissingError,
  isWindowNoVerifiedLinkError,
  normalizeActionWindow,
  resolveActionWindowError
} from '../features/channel-link/actionWindowState.js';

const CHANNEL_TYPE = 'whatsapp';

// --- Estado de módulo -------------------------------------------------------

const links = ref([]);
const pendingChallenge = ref(null);
const limits = ref({ ...DEFAULT_CHANNEL_LINK_LIMITS });

const loadingList = ref(false);
const listError = ref('');

const commandLoading = ref(false);
const commandError = ref('');
const commandErrorCode = ref('');

// Janela de ação (fase 05). O DTO normalizado — nunca o telefone cru — e o
// erro de CONSULTA; erros de comando (abrir/revogar) passam por executeCommand.
const actionWindow = ref(null);
const actionWindowLoading = ref(false);
const actionWindowError = ref('');

function extractErrorMessage(error, fallback) {
  if (!error) return fallback;
  // application/problem+json — o `code` estável tem prioridade sobre `detail`.
  return resolveChannelLinkError(error, fallback).message;
}

function normalizeChallenge(raw) {
  if (!raw || !raw.challengeId) return null;
  return {
    challengeId: String(raw.challengeId),
    channelType: String(raw.channelType || CHANNEL_TYPE),
    phoneMasked: String(raw.phoneMasked || ''),
    expiresAt: raw.expiresAt || null,
    attemptsRemaining: Number(raw.attemptsRemaining ?? 0),
    sendsRemaining: Number(raw.sendsRemaining ?? 0),
    canResendAt: raw.canResendAt || null,
    deliveryStatus: String(raw.deliveryStatus || ''),
    correlationId: String(raw.correlationId || '')
  };
}

export function useChannelLinkStore() {
  const hasPendingChallenge = computed(() => Boolean(pendingChallenge.value?.challengeId));
  const totalLinks = computed(() => links.value.length);

  async function fetchList() {
    listError.value = '';
    loadingList.value = true;
    try {
      const response = await listChannelLinks({ channelType: CHANNEL_TYPE });
      links.value = Array.isArray(response?.links) ? response.links : [];
      pendingChallenge.value = normalizeChallenge(response?.pendingChallenge);
      limits.value = normalizeLimits(response?.limits);
      return response;
    } catch (error) {
      links.value = [];
      pendingChallenge.value = null;
      listError.value = extractErrorMessage(error, 'Falha ao carregar os números vinculados.');
      return null;
    } finally {
      loadingList.value = false;
    }
  }

  /**
   * Tronco comum dos comandos: limpa o estado anterior, marca carregando e
   * propaga o erro para a view decidir o toast. Erro que mata o desafio no
   * servidor (expirado, esgotado, inexistente) limpa o desafio local aqui —
   * senão a tela continuaria pedindo um código que não vale mais.
   */
  async function executeCommand(fallbackLabel, fn) {
    commandError.value = '';
    commandErrorCode.value = '';
    commandLoading.value = true;
    try {
      return await fn();
    } catch (error) {
      const resolved = resolveChannelLinkError(error, fallbackLabel);
      commandError.value = resolved.message;
      commandErrorCode.value = resolved.code;
      if (isChallengeGoneError(error)) {
        pendingChallenge.value = null;
      }
      throw error;
    } finally {
      commandLoading.value = false;
    }
  }

  /** Cria o desafio e despacha o código. `phone` já vem canonicalizado da view. */
  async function startLink(phone) {
    return executeCommand('Falha ao enviar o código.', async () => {
      const response = await startChannelLink({
        channelType: CHANNEL_TYPE,
        phone: String(phone || '').trim()
      });
      pendingChallenge.value = normalizeChallenge(response);
      return response;
    });
  }

  /** Reenvia (rotacionando o código no servidor) o desafio vivo. */
  async function resendCode() {
    const challengeId = pendingChallenge.value?.challengeId;
    if (!challengeId) return null;

    return executeCommand('Falha ao reenviar o código.', async () => {
      // Sem `Idempotency-Key`: quem impede o reenvio duplicado é o cooldown do
      // servidor (`canResendAt`) mais o teto de envios, não um header. Ver api.js.
      const response = await resendChannelLinkChallenge(challengeId);
      pendingChallenge.value = normalizeChallenge(response) || pendingChallenge.value;
      return response;
    });
  }

  /** Confirma a posse. Em caso de sucesso o desafio some e a lista é recarregada. */
  async function confirmCode(code) {
    const challengeId = pendingChallenge.value?.challengeId;
    if (!challengeId) return null;

    return executeCommand('Falha ao confirmar o código.', async () => {
      const response = await confirmChannelLinkChallenge(challengeId, { code: String(code || '') });
      pendingChallenge.value = null;
      await fetchList();
      return response;
    });
  }

  /**
   * Cancela o desafio ("alterar número"). Um desafio já fechado devolve 404 —
   * do ponto de vista do usuário o objetivo foi atingido, então tratamos como
   * sucesso silencioso em vez de mostrar erro.
   */
  async function cancelChallenge(reason = '') {
    const challengeId = pendingChallenge.value?.challengeId;
    if (!challengeId) return null;

    return executeCommand('Falha ao cancelar o pedido de código.', async () => {
      try {
        const response = await cancelChannelLinkChallenge(
          challengeId,
          reason ? { reason } : {}
        );
        pendingChallenge.value = null;
        return response;
      } catch (error) {
        if (isChallengeMissingError(error)) {
          pendingChallenge.value = null;
          return null;
        }
        throw error;
      }
    });
  }

  /** Desvincula um número. Revogação é ação de segurança — sem OTP, por decisão. */
  async function removeLink(linkId) {
    if (!linkId) return null;

    return executeCommand('Falha ao desvincular o número.', async () => {
      const response = await deleteChannelLink(linkId);
      await fetchList();
      // Sem o (último) número verificado a janela deixa de valer — reconsultar
      // mantém o painel honesto (o 409 "sem vínculo" vira `window: null` ali).
      if (actionWindow.value) await fetchActionWindow();
      return response;
    });
  }

  // ── Janela de ação (fase 05) ──────────────────────────────────────────────

  /**
   * Consulta a janela viva. O 409 CHANNEL_ACTION_WINDOW_NO_VERIFIED_LINK não é
   * falha: significa "recurso indisponível até vincular um número" e vira
   * `window: null` sem mensagem de erro.
   */
  async function fetchActionWindow() {
    actionWindowError.value = '';
    actionWindowLoading.value = true;
    try {
      const response = await getWhatsAppActionWindow();
      actionWindow.value = normalizeActionWindow(response?.window);
      return response;
    } catch (error) {
      actionWindow.value = null;
      if (!isWindowNoVerifiedLinkError(error)) {
        actionWindowError.value = resolveActionWindowError(
          error,
          'Falha ao consultar a liberação de ações.'
        ).message;
      }
      return null;
    } finally {
      actionWindowLoading.value = false;
    }
  }

  /**
   * Abre a janela. Só duração e orçamento saem do cliente — telefone e conta
   * CETESB são resolvidos no servidor. O DTO devolvido (já clampado) é a
   * verdade da tela, não o que o formulário pediu.
   */
  async function openActionWindow({ hours, actionsBudget } = {}) {
    return executeCommand('Falha ao liberar ações pelo WhatsApp.', async () => {
      const response = await openWhatsAppActionWindow({ hours, actionsBudget });
      actionWindow.value = normalizeActionWindow(response);
      return response;
    });
  }

  /**
   * Revoga com efeito imediato (botão de pânico do runbook). Janela já
   * encerrada devolve 404 — o objetivo foi atingido, então é sucesso
   * silencioso, como no cancelamento de desafio.
   */
  async function revokeActionWindow() {
    const windowId = actionWindow.value?.id;
    if (!windowId) return null;

    return executeCommand('Falha ao revogar a liberação.', async () => {
      try {
        const response = await revokeWhatsAppActionWindow(windowId);
        actionWindow.value = null;
        return response;
      } catch (error) {
        if (isWindowMissingError(error)) {
          actionWindow.value = null;
          return null;
        }
        throw error;
      }
    });
  }

  function clearCommandState() {
    commandError.value = '';
    commandErrorCode.value = '';
  }

  return {
    links,
    pendingChallenge,
    limits,
    loadingList,
    listError,
    commandLoading,
    commandError,
    commandErrorCode,
    hasPendingChallenge,
    totalLinks,
    actionWindow,
    actionWindowLoading,
    actionWindowError,
    fetchList,
    startLink,
    resendCode,
    confirmCode,
    cancelChallenge,
    removeLink,
    fetchActionWindow,
    openActionWindow,
    revokeActionWindow,
    clearCommandState
  };
}
