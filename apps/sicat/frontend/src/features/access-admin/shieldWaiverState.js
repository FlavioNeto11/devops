/**
 * Estado PURO do diálogo "Liberar número do escudo anti-spam" — tela de Acessos.
 * Este módulo é a fonte única da explicação de domínio do waiver; api.js e o
 * teste apontam para cá.
 *
 * O escudo da vítima (backend, `conversation-channel-link-service.ts`) tranca um
 * telefone que recebeu pedidos de código de contas distintas demais — proteção
 * contra bombing multi-conta. O waiver é a saída operada pelo suporte: um admin
 * comprova a posse do número FORA do sistema e o libera por aqui.
 *
 * Por que um módulo separado: `.vue` não é importável em `node:test` (regra da
 * casa, apps/sicat/CLAUDE.md §11 — grep no bundle não prova nada; prova é
 * código-fonte mais teste). Cobertura em `tests/unit/shield-waiver-state.test.js`.
 *
 * PII: o telefone em CLARO existe só no input do admin e no corpo do POST. Tudo
 * que a tela ecoa (confirmação, toast, erros) passa por `maskPhone` — mesma
 * máscara de `maskChannelUserKey` do backend.
 */

import {
  extractErrorCode,
  maskPhone,
  validatePhoneInput
} from '../channel-link/channelLinkState.js';

/** Canal coberto pelo escudo nesta fase. */
export const WAIVER_CHANNEL_TYPE = 'whatsapp';

/** O motivo vai para a trilha de auditoria — vazio ou telegráfico não reconstrói a decisão. */
export const WAIVER_REASON_MIN_LENGTH = 5;
export const WAIVER_REASON_MAX_LENGTH = 500;

/**
 * Valida o formulário inteiro de uma vez. A view deriva TUDO daqui (eco mascarado,
 * habilitação do botão, mensagens) — regra com um dono só.
 *
 * @returns {{ valid: boolean, digits: string, phoneMasked: string, reason: string,
 *             errors: { phone: string, reason: string } }}
 */
export function validateShieldWaiverForm({ phone, reason } = {}) {
  const phoneResult = validatePhoneInput(phone);
  const trimmedReason = String(reason ?? '').trim();

  let reasonMessage = '';
  if (!trimmedReason) {
    reasonMessage = 'Informe o motivo da liberação — ele fica na trilha de auditoria.';
  } else if (trimmedReason.length < WAIVER_REASON_MIN_LENGTH) {
    reasonMessage = `Descreva o motivo com pelo menos ${WAIVER_REASON_MIN_LENGTH} caracteres.`;
  } else if (trimmedReason.length > WAIVER_REASON_MAX_LENGTH) {
    reasonMessage = `O motivo pode ter no máximo ${WAIVER_REASON_MAX_LENGTH} caracteres.`;
  }

  return {
    valid: phoneResult.valid && !reasonMessage,
    digits: phoneResult.digits,
    // Nunca ecoa número pela metade: sem validar, sem máscara.
    phoneMasked: phoneResult.valid ? maskPhone(phoneResult.digits) : '',
    reason: trimmedReason,
    errors: {
      phone: phoneResult.valid ? '' : phoneResult.message,
      reason: reasonMessage
    }
  };
}

/**
 * Corpo do POST administrativo. Telefone no CORPO, nunca em path/query — PII em
 * URL vira log de acesso do Traefik e cabeçalho Referer (mesma regra das rotas
 * de channel-links em `services/api.js`).
 *
 * contrato pareado com a unidade B1 (rota administrativa do waiver no backend).
 */
export function buildShieldWaiverPayload({ digits, reason }) {
  return {
    channelType: WAIVER_CHANNEL_TYPE,
    phone: digits,
    reason
  };
}

/**
 * Mensagem do diálogo de confirmação. Recebe a forma MASCARADA — o chamador
 * nunca passa o número em claro, e o teste trava isso.
 */
export function buildWaiverConfirmMessage(phoneMasked) {
  const target = String(phoneMasked || '').trim() || 'o número informado';
  return `Liberar ${target} do escudo anti-spam? O bloqueio por excesso de pedidos de código cai e o número volta a receber OTP imediatamente. Confirme apenas com a posse do número comprovada fora do sistema.`;
}

/**
 * Frases para o ADMIN. O mapa de `channelLinkState.js` fala com o DONO do número
 * ("Sua sessão expirou", "Remova um número antes de vincular outro") — reusá-lo
 * aqui mandaria o admin agir sobre a conta errada. Só o mecanismo de extração é
 * compartilhado; as frases são desta superfície.
 */
const WAIVER_ERROR_MESSAGES = Object.freeze({
  CHANNEL_LINK_PHONE_INVALID: 'Número inválido. Confira o DDD e a quantidade de dígitos.',
  CHANNEL_LINK_CHANNEL_UNSUPPORTED: 'Este canal de mensagens ainda não está disponível.'
});

/**
 * Traduz o erro da API para o que o admin lê. Código estável conhecido ganha a
 * frase local; código novo da B1 cai no `detail`/`title` do problem+json antes
 * do fallback. Preserva `correlationId` como "código de suporte".
 */
export function resolveShieldWaiverError(error) {
  const code = extractErrorCode(error);
  const correlationId = String(error?.correlationId || '').trim();
  const message = WAIVER_ERROR_MESSAGES[code]
    || error?.detail
    || error?.title
    || error?.message
    || 'Não foi possível liberar o número do escudo anti-spam.';

  return {
    code,
    message,
    correlationId,
    detail: correlationId ? `Código de suporte: ${correlationId}` : ''
  };
}
