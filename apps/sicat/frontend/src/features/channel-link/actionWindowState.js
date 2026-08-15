/**
 * Estado PURO da "janela de ação" do WhatsApp (step-up do N2) — cadeia
 * whatsapp-channel-sicat, fase 05.
 *
 * A janela é o atrito pago UMA vez por turno: aberta na sessão web autenticada
 * (duração + orçamento de ações), permite que no pátio a pessoa confirme ações
 * digitando só 6 dígitos. Aqui mora tudo que a tela DECIDE e nada que ela
 * renderiza: normalização do DTO, contagem regressiva em relógio h:mm:ss,
 * contador de orçamento, rótulo da conta fixada e a tradução dos códigos de
 * erro estáveis do backend.
 *
 * Por que um módulo separado: `.vue` não é importável em `node:test` (regra da
 * casa, apps/sicat/CLAUDE.md §11 — grep no bundle não prova nada; prova é
 * código-fonte mais teste). Cobertura em
 * `tests/unit/channel-link-action-window-state.test.js`.
 */

import {
  extractErrorCode,
  formatCountdown,
  resolveChannelLinkError,
  secondsUntil
} from './channelLinkState.js';
import { formatDateTimeBr } from '../../utils/date-format.js';

/**
 * Espelho dos defaults do backend (`lib/config.ts`, chaves
 * `whatsappActionWindow{Default,Max}{Hours,Budget}`). O clamp AUTORITATIVO é o
 * do servidor (`clampWindowHours`/`clampWindowBudget` em
 * whatsapp-action-ticket-service.ts) — esta cópia existe só para desenhar os
 * controles e validar antes do POST. O DTO devolvido é quem manda na tela.
 */
export const ACTION_WINDOW_LIMITS = Object.freeze({
  defaultHours: 4,
  maxHours: 8,
  defaultBudget: 10,
  maxBudget: 20
});

/** Espelha `clampWindowHours` do backend: inválido/<=0 → default; teto no máximo. */
export function clampWindowHoursInput(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested <= 0) return ACTION_WINDOW_LIMITS.defaultHours;
  return Math.min(Math.floor(requested), ACTION_WINDOW_LIMITS.maxHours);
}

/** Espelha `clampWindowBudget` do backend: inválido/<=0 → default; teto no máximo. */
export function clampWindowBudgetInput(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested <= 0) return ACTION_WINDOW_LIMITS.defaultBudget;
  return Math.min(Math.floor(requested), ACTION_WINDOW_LIMITS.maxBudget);
}

/** Opções do seletor de duração: 1..maxHours, rotuladas em pt-BR. */
export function buildHoursOptions(maxHours = ACTION_WINDOW_LIMITS.maxHours) {
  const ceiling = Math.max(1, Math.floor(Number(maxHours) || ACTION_WINDOW_LIMITS.maxHours));
  return Array.from({ length: ceiling }, (_, index) => {
    const value = index + 1;
    return { value, label: value === 1 ? '1 hora' : `${value} horas` };
  });
}

/** Opções do seletor de orçamento: 1..maxBudget, rotuladas em pt-BR. */
export function buildBudgetOptions(maxBudget = ACTION_WINDOW_LIMITS.maxBudget) {
  const ceiling = Math.max(1, Math.floor(Number(maxBudget) || ACTION_WINDOW_LIMITS.maxBudget));
  return Array.from({ length: ceiling }, (_, index) => {
    const value = index + 1;
    return { value, label: value === 1 ? '1 ação' : `${value} ações` };
  });
}

/**
 * Normaliza o `ActionWindowDto` do backend. O DTO NUNCA traz o E.164 cru —
 * `maskedUserKey` já chega mascarado e é exibido como veio.
 */
export function normalizeActionWindow(raw) {
  if (!raw || !raw.id) return null;
  return {
    id: String(raw.id),
    maskedUserKey: String(raw.maskedUserKey || ''),
    integrationAccountId: raw.integrationAccountId ? String(raw.integrationAccountId) : null,
    expiresAt: raw.expiresAt || null,
    actionsUsed: Math.max(Number(raw.actionsUsed ?? 0) || 0, 0),
    actionsBudget: Math.max(Number(raw.actionsBudget ?? 0) || 0, 0),
    openedAt: raw.openedAt || null
  };
}

/** Tem pelo menos um vínculo `verified`? É o pré-requisito da janela. */
export function hasVerifiedChannelLink(links) {
  return (Array.isArray(links) ? links : []).some(
    (link) => String(link?.verificationStatus || '').trim().toLowerCase() === 'verified'
  );
}

/**
 * Relógio da janela: `h:mm:ss` a partir de 1 h (a janela dura horas — `m:ss`
 * mostraria "480:00"), delegando a `formatCountdown` abaixo disso.
 */
export function formatWindowClock(totalSeconds) {
  const safeSeconds = Math.max(Math.ceil(Number(totalSeconds) || 0), 0);
  if (safeSeconds < 3600) return formatCountdown(safeSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Estado de expiração da janela viva. O instante AUTORITATIVO é `expiresAt` do
 * DTO; a tela só o traduz em contagem regressiva.
 */
export function resolveWindowExpiry(expiresAt, now = Date.now()) {
  if (!expiresAt) {
    return { known: false, expired: false, secondsRemaining: 0, clock: '', label: '' };
  }

  const secondsRemaining = secondsUntil(expiresAt, now);
  const expired = secondsRemaining <= 0;

  return {
    known: true,
    expired,
    secondsRemaining,
    clock: formatWindowClock(secondsRemaining),
    label: expired
      ? 'A liberação expirou.'
      : `Expira em ${formatWindowClock(secondsRemaining)}.`
  };
}

/**
 * Contador de orçamento. `actionsUsed`/`actionsBudget` vêm do banco — a tela
 * nunca decrementa localmente; recarregar é a única forma honesta de atualizar.
 */
export function describeWindowBudget(window) {
  const budget = Math.max(Number(window?.actionsBudget ?? 0) || 0, 0);
  const usedRaw = Math.max(Number(window?.actionsUsed ?? 0) || 0, 0);
  const used = budget > 0 ? Math.min(usedRaw, budget) : usedRaw;
  const remaining = Math.max(budget - used, 0);
  const exhausted = budget > 0 && remaining <= 0;

  let label;
  if (budget <= 0) {
    label = '';
  } else if (exhausted) {
    label = `Orçamento esgotado — as ${budget} ações foram usadas.`;
  } else if (remaining === 1) {
    label = `Resta 1 de ${budget} ações.`;
  } else {
    label = `Restam ${remaining} de ${budget} ações.`;
  }

  return {
    used,
    budget,
    remaining,
    exhausted,
    label,
    percentUsed: budget > 0 ? Math.min(Math.round((used / budget) * 100), 100) : 0
  };
}

/**
 * Rótulo da conta CETESB FIXADA na abertura. O DTO só carrega o id; o nome vem
 * do contexto da sessão — e só é usado quando os ids batem, senão a tela
 * afirmaria um nome que pode não ser o da conta presa à janela.
 */
export function describeWindowAccount(window, { integrationAccountId = '', accountName = '' } = {}) {
  const windowAccountId = String(window?.integrationAccountId || '').trim();
  const activeId = String(integrationAccountId || '').trim();
  const name = String(accountName || '').trim();

  if (!windowAccountId) return 'Conta CETESB fixada na abertura da liberação.';
  if (activeId && windowAccountId === activeId) {
    return name || 'Conta CETESB ativa desta sessão.';
  }
  if (activeId && windowAccountId !== activeId) {
    return 'Outra conta CETESB — a que estava ativa quando a liberação foi aberta.';
  }
  return 'Conta CETESB que estava ativa quando a liberação foi aberta.';
}

/** Toast de sucesso da abertura, com validade e orçamento vindos do DTO. */
export function buildWindowOpenedMessage(window) {
  const budget = describeWindowBudget(window);
  const until = window?.expiresAt ? formatDateTimeBr(window.expiresAt) : '';
  const budgetPart = budget.budget > 0
    ? ` com orçamento de ${budget.budget === 1 ? '1 ação' : `${budget.budget} ações`}`
    : '';
  const untilPart = until ? ` até ${until}` : '';
  return `Ações liberadas pelo WhatsApp${budgetPart}${untilPart}.`;
}

// ---------------------------------------------------------------------------
// Erros do backend (códigos estáveis da fase 05)
// ---------------------------------------------------------------------------

export const ACTION_WINDOW_ERROR_MESSAGES = Object.freeze({
  CHANNEL_ACTION_WINDOW_NO_VERIFIED_LINK: 'Vincule e confirme um número de WhatsApp antes de liberar ações.',
  CHANNEL_ACTION_WINDOW_ACCOUNT_REQUIRED: 'Selecione uma conta CETESB ativa antes de liberar ações pelo WhatsApp.',
  CHANNEL_ACTION_WINDOW_UNAVAILABLE: 'Não foi possível abrir a liberação agora. Tente de novo em instantes.',
  CHANNEL_ACTION_WINDOW_NOT_FOUND: 'A liberação já estava encerrada.'
});

/** A janela pedida já não existe: revogar de novo é sucesso silencioso, não erro. */
export function isWindowMissingError(error) {
  return extractErrorCode(error) === 'CHANNEL_ACTION_WINDOW_NOT_FOUND';
}

/** 409 do GET/POST sem vínculo verificado — a tela trata como "recurso indisponível", não como falha. */
export function isWindowNoVerifiedLinkError(error) {
  return extractErrorCode(error) === 'CHANNEL_ACTION_WINDOW_NO_VERIFIED_LINK';
}

/**
 * Traduz o erro da API para o que o operador lê, com prioridade para os códigos
 * da fase 05 e delegando o resto (429, sessão, rede) ao resolvedor da fase 02 —
 * mesmo `correlationId` como "código de suporte".
 */
export function resolveActionWindowError(error, fallback = 'Não foi possível concluir a ação.') {
  const resolved = resolveChannelLinkError(error, fallback);
  const message = ACTION_WINDOW_ERROR_MESSAGES[resolved.code];
  return message ? { ...resolved, message } : resolved;
}
