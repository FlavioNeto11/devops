/**
 * Estado PURO da tela "WhatsApp do assistente" — cadeia whatsapp-channel-sicat, fase 02.
 *
 * Aqui mora tudo que a tela decide e nada que a tela renderiza: canonicalização e
 * validação do telefone, validação do código de 6 dígitos, contagem regressiva,
 * rótulos de estado e a tradução dos códigos de erro estáveis do backend para a
 * frase que o operador lê.
 *
 * Por que um módulo separado: `.vue` não é importável em `node:test` (o runner do
 * repo é `node --test` puro, sem Jest/Vitest). Regra da casa registrada em
 * `apps/sicat/CLAUDE.md` §11 — grep no bundle não prova nada; prova é código-fonte
 * mais teste. A cobertura fica em `tests/unit/channel-link-view-state.test.js`.
 *
 * IMPORTANTE: nada aqui guarda o código OTP. O código existe apenas no input da
 * tela e no corpo da requisição de confirmação.
 */

import { formatDateTimeBr } from '../../utils/date-format.js';

/** Comprimento do código enviado pelo WhatsApp (fixado no backend). */
export const OTP_CODE_LENGTH = 6;

/** DDI aplicado quando o operador digita só DDD + número (o caso comum no Brasil). */
export const DEFAULT_COUNTRY_CODE = '55';

/** Faixa aceita pelo backend depois da canonicalização (E.164 só dígitos). */
export const MIN_PHONE_DIGITS = 12;
export const MAX_PHONE_DIGITS = 15;

/**
 * Etapas da tela. O fluxo é sempre iniciado no app: informar o número → digitar o
 * código. Não existe caminho iniciado pelo WhatsApp.
 */
export const CHANNEL_LINK_STAGE = Object.freeze({
  PHONE: 'phone',
  CODE: 'code'
});

/** Limites exibidos na tela quando o backend ainda não respondeu. */
export const DEFAULT_CHANNEL_LINK_LIMITS = Object.freeze({
  maxLinksPerUser: 3,
  otpTtlSeconds: 600,
  maxAttempts: 5,
  resendCooldownSeconds: 60
});

// ---------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------

export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Espelha `canonicalizeChannelUserKey` do backend. A canonicalização AUTORITATIVA
 * é a do servidor — esta cópia existe só para validar antes de gastar uma
 * mensagem paga e para mostrar ao operador o número que será usado.
 *
 * Regras (idempotentes — aplicar duas vezes dá o mesmo resultado):
 *  1. mantém só dígitos;
 *  2. 10 ou 11 dígitos → prefixa o DDI padrão (brasileiro digita `11999999999`);
 *  3. começa com 55, tem 12 dígitos e o assinante começa em 6–9 → insere o NONO
 *     dígito depois do DDD (celular antigo, anterior à mudança da Anatel);
 *  4. qualquer outro caso passa intacto (fixo BR com assinante 2–5 continua com 12).
 */
export function canonicalizePhoneDigits(value, { defaultCountryCode = DEFAULT_COUNTRY_CODE } = {}) {
  const digits = onlyDigits(value);
  if (!digits) return '';

  const countryCode = onlyDigits(defaultCountryCode) || DEFAULT_COUNTRY_CODE;
  let normalized = digits;

  if (normalized.length === 10 || normalized.length === 11) {
    normalized = `${countryCode}${normalized}`;
  }

  if (normalized.length === 12 && normalized.startsWith('55')) {
    const subscriberFirstDigit = normalized.charAt(4);
    if (subscriberFirstDigit >= '6' && subscriberFirstDigit <= '9') {
      normalized = `${normalized.slice(0, 4)}9${normalized.slice(4)}`;
    }
  }

  return normalized;
}

/**
 * Valida o que o operador digitou. Mensagens em linguagem de operador: o objetivo
 * é que ele conserte o número sozinho, sem abrir chamado.
 *
 * @returns {{ valid: boolean, digits: string, message: string }}
 */
export function validatePhoneInput(value, options = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return { valid: false, digits: '', message: 'Informe o número do WhatsApp com DDD.' };
  }

  const digits = canonicalizePhoneDigits(raw, options);
  if (!digits) {
    return { valid: false, digits: '', message: 'Informe o número usando apenas números, com DDD.' };
  }

  if (digits.length < MIN_PHONE_DIGITS) {
    return {
      valid: false,
      digits,
      message: 'Número incompleto. Informe DDD e número — por exemplo, (11) 91234-5678.'
    };
  }

  if (digits.length > MAX_PHONE_DIGITS) {
    return {
      valid: false,
      digits,
      message: 'Número longo demais. Confira os dígitos e tente de novo.'
    };
  }

  return { valid: true, digits, message: '' };
}

/**
 * Forma legível do número COMPLETO. Só é usada na lista dos números do próprio
 * usuário — ele precisa distinguir os seus até três números.
 */
export function formatPhoneBr(value) {
  const digits = onlyDigits(value);
  if (!digits) return '';

  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  return `+${digits}`;
}

/**
 * Espelha `maskChannelUserKey` do backend. Usada em TODO lugar que não seja a
 * lista dos números do próprio dono (desafio pendente, avisos, confirmações).
 */
export function maskPhone(value) {
  const digits = onlyDigits(value);
  if (!digits) return '';

  if (digits.length >= 12 && digits.length <= 13) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ****-${digits.slice(-4)}`;
  }

  if (digits.length <= 4) {
    return '*'.repeat(digits.length);
  }

  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Código
// ---------------------------------------------------------------------------

/** Deixa o campo digitar só dígitos e no máximo 6 — colar "1 2 3 4 5 6" funciona. */
export function sanitizeOtpInput(value) {
  return onlyDigits(value).slice(0, OTP_CODE_LENGTH);
}

/**
 * O backend valida `/^\d{6}$/` ANTES de ir ao banco justamente para que um erro de
 * digitação não queime tentativa. A tela repete a checagem pelo mesmo motivo.
 */
export function validateOtpInput(value) {
  const code = sanitizeOtpInput(value);
  if (!code) {
    return { valid: false, code: '', message: 'Digite o código de 6 dígitos que chegou no WhatsApp.' };
  }
  if (code.length < OTP_CODE_LENGTH) {
    return { valid: false, code, message: `O código tem ${OTP_CODE_LENGTH} dígitos. Confira a mensagem recebida.` };
  }
  return { valid: true, code, message: '' };
}

// ---------------------------------------------------------------------------
// Contagem regressiva e estado do desafio
// ---------------------------------------------------------------------------

/** `m:ss`, nunca negativo. Usada no "expira em" e no "reenviar em". */
export function formatCountdown(totalSeconds) {
  const safeSeconds = Math.max(Math.ceil(Number(totalSeconds) || 0), 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Segundos até um instante ISO/Date. Zero quando já passou ou quando não há valor. */
export function secondsUntil(value, now = Date.now()) {
  if (!value) return 0;
  const target = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(target)) return 0;
  return Math.max(Math.ceil((target - Number(now)) / 1000), 0);
}

/** Qual etapa a tela mostra: quem tem desafio vivo cai direto no campo do código. */
export function resolveStage(pendingChallenge) {
  return pendingChallenge && pendingChallenge.challengeId
    ? CHANNEL_LINK_STAGE.CODE
    : CHANNEL_LINK_STAGE.PHONE;
}

export function resolveExpiryState(expiresAt, now = Date.now()) {
  if (!expiresAt) {
    return { known: false, expired: false, secondsRemaining: 0, label: '' };
  }

  const secondsRemaining = secondsUntil(expiresAt, now);
  const expired = secondsRemaining <= 0;

  return {
    known: true,
    expired,
    secondsRemaining,
    label: expired
      ? 'O código expirou. Peça um novo.'
      : `O código expira em ${formatCountdown(secondsRemaining)}.`
  };
}

/**
 * Estado do botão "Reenviar código". O cooldown AUTORITATIVO é o do banco
 * (`canResendAt` vem do backend) — a tela só o traduz em segundos e rótulo.
 *
 * A ORDEM dos bloqueios espelha `resendBlockedReason` do backend
 * (`conversation-channel-link-service.ts`): palpites esgotados vêm ANTES de envios
 * esgotados, que vêm antes do cooldown. Palpite é o motivo TERMINAL — com
 * `attemptsRemaining === 0` o backend recusa o reenvio com 429
 * `CHANNEL_LINK_ATTEMPTS_EXCEEDED`, e esse código está em `CHALLENGE_GONE_CODES`:
 * clicar não só falha como DESTRÓI o desafio e joga o operador de volta ao campo do
 * telefone. Um botão habilitado aqui é um convite para perder o desafio.
 */
export function resolveResendState(challenge, now = Date.now()) {
  const sendsRemaining = Math.max(Number(challenge?.sendsRemaining ?? 0), 0);

  // `attemptsRemaining` ausente = DTO sem o campo (contrato quebrado), não "zero":
  // tratar ausência como esgotado mataria o botão para sempre. Só um número finito
  // <= 0 bloqueia.
  const rawAttempts = challenge?.attemptsRemaining;
  const parsedAttempts = Number(rawAttempts);
  const attemptsKnown = rawAttempts !== null && rawAttempts !== undefined && Number.isFinite(parsedAttempts);

  if (attemptsKnown && parsedAttempts <= 0) {
    return {
      enabled: false,
      reason: 'attempts_exhausted',
      secondsRemaining: 0,
      label: 'Tentativas esgotadas',
      hint: 'Você errou o código vezes demais. Um código novo também não poderia ser confirmado — volte, informe o número de novo e recomece.'
    };
  }

  if (sendsRemaining <= 0) {
    return {
      enabled: false,
      reason: 'exhausted',
      secondsRemaining: 0,
      label: 'Limite de envios atingido',
      hint: 'Você já pediu o código o máximo de vezes. Volte e informe o número de novo.'
    };
  }

  const secondsRemaining = secondsUntil(challenge?.canResendAt, now);
  if (secondsRemaining > 0) {
    return {
      enabled: false,
      reason: 'cooldown',
      secondsRemaining,
      label: `Reenviar em ${formatCountdown(secondsRemaining)}`,
      hint: 'A mensagem pode demorar alguns segundos para chegar.'
    };
  }

  return {
    enabled: true,
    reason: '',
    secondsRemaining: 0,
    label: 'Reenviar código',
    hint: sendsRemaining === 1
      ? 'Ainda dá para pedir o código 1 vez.'
      : `Ainda dá para pedir o código ${sendsRemaining} vezes.`
  };
}

/**
 * Tentativas restantes. Mostrado desde o PRIMEIRO erro: reenviar rotaciona o
 * código mas NÃO devolve tentativa, e quem não vê o contador chega ao reenvio
 * sem entender por que só resta um palpite.
 */
export function describeAttempts(attemptsRemaining) {
  const remaining = Math.max(Number(attemptsRemaining ?? 0), 0);
  // Sem palpite, pedir código novo NÃO resolve: o backend recusa o reenvio e o
  // consume exige `attempt_count < max_attempts`. A saída é recomeçar pelo número.
  if (remaining <= 0) return 'Sem tentativas restantes — informe o número de novo para recomeçar.';
  if (remaining === 1) return 'Resta 1 tentativa.';
  return `Restam ${remaining} tentativas.`;
}

/** Banner de estado do desafio (não é feedback de ação — feedback vai por toast). */
export function buildChallengeBanner(challenge, now = Date.now()) {
  if (!challenge || !challenge.challengeId) {
    return null;
  }

  const masked = challenge.phoneMasked || maskPhone(challenge.phone) || 'seu número';
  const expiry = resolveExpiryState(challenge.expiresAt, now);

  if (expiry.known && expiry.expired) {
    return {
      tone: 'warning',
      title: 'O código expirou',
      message: `O código enviado para ${masked} não vale mais. Peça um novo código ou informe o número de novo.`
    };
  }

  const parts = [`Enviamos um código de ${OTP_CODE_LENGTH} dígitos para ${masked}.`];
  if (expiry.known) parts.push(expiry.label);
  parts.push(describeAttempts(challenge.attemptsRemaining));

  return {
    tone: 'info',
    title: 'Confirme o código',
    message: parts.join(' ')
  };
}

// ---------------------------------------------------------------------------
// Vínculos já confirmados
// ---------------------------------------------------------------------------

const LINK_STATUS_LABELS = Object.freeze({
  verified: { label: 'Verificado', tone: 'success' },
  pending: { label: 'Aguardando confirmação', tone: 'warning' }
});

export function describeLinkStatus(status) {
  const key = String(status || '').trim().toLowerCase();
  return LINK_STATUS_LABELS[key] || { label: key || 'Desconhecido', tone: 'neutral' };
}

/** Linha da tabela "números vinculados". O dono vê o PRÓPRIO número inteiro. */
export function describeLinkRow(link) {
  const phone = String(link?.phone || '').trim();
  const status = describeLinkStatus(link?.verificationStatus);

  return {
    id: String(link?.id || ''),
    channelType: String(link?.channelType || 'whatsapp'),
    phone,
    phoneDisplay: formatPhoneBr(phone) || link?.phoneMasked || '—',
    phoneMasked: link?.phoneMasked || maskPhone(phone),
    verificationStatus: String(link?.verificationStatus || ''),
    statusLabel: status.label,
    statusTone: status.tone,
    verifiedAtLabel: link?.verifiedAt ? formatDateTimeBr(link.verifiedAt) : '—'
  };
}

export function normalizeLimits(limits) {
  const source = limits && typeof limits === 'object' ? limits : {};
  const pick = (key) => {
    const parsed = Number(source[key]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHANNEL_LINK_LIMITS[key];
  };

  return {
    maxLinksPerUser: pick('maxLinksPerUser'),
    otpTtlSeconds: pick('otpTtlSeconds'),
    maxAttempts: pick('maxAttempts'),
    resendCooldownSeconds: pick('resendCooldownSeconds')
  };
}

/**
 * Teto de números por usuário. Falhar cedo na tela evita gastar uma mensagem paga
 * para receber 409 — o backend checa de novo, aqui é só cortesia.
 */
export function canAddMoreLinks(links, limits) {
  const total = Array.isArray(links) ? links.length : 0;
  const max = normalizeLimits(limits).maxLinksPerUser;
  return total < max;
}

// ---------------------------------------------------------------------------
// Erros do backend (códigos estáveis do contrato da fase 02)
// ---------------------------------------------------------------------------

export const CHANNEL_LINK_ERROR_MESSAGES = Object.freeze({
  CHANNEL_LINK_PRINCIPAL_UNRESOLVED: 'Sua sessão expirou. Entre de novo para continuar.',
  CHANNEL_LINK_CHANNEL_UNSUPPORTED: 'Este canal de mensagens ainda não está disponível.',
  CHANNEL_LINK_PHONE_INVALID: 'Número inválido. Confira o DDD e a quantidade de dígitos.',
  CHANNEL_LINK_MAX_LINKS_REACHED: 'Você já atingiu o limite de números vinculados. Remova um número antes de adicionar outro.',
  CHANNEL_LINK_RATE_LIMITED: 'Muitos pedidos de código em pouco tempo.',
  CHANNEL_LINK_DELIVERY_FAILED: 'Não conseguimos enviar o código pelo WhatsApp. Confira o número e tente de novo.',
  WHATSAPP_CHANNEL_DISABLED: 'O envio pelo WhatsApp está indisponível no momento. Tente mais tarde.',
  CHANNEL_LINK_CHALLENGE_NOT_FOUND: 'Este pedido de código não vale mais. Informe o número de novo.',
  // 409 do `start` quando duas requisições correm juntas para o mesmo número e a linha
  // conflitante morreu entre o insert e a releitura. O desafio NÃO morreu por isso —
  // repetir a ação resolve, e por isso este código fica FORA de `CHALLENGE_GONE_CODES`.
  CHANNEL_LINK_CHALLENGE_IN_FLIGHT: 'Já existe um pedido de código em andamento para este número. Aguarde alguns instantes e tente de novo.',
  CHANNEL_LINK_CODE_MALFORMED: `O código tem ${OTP_CODE_LENGTH} dígitos. Confira e digite de novo.`,
  CHANNEL_LINK_CODE_INVALID: 'Código incorreto. Confira a última mensagem que chegou no WhatsApp.',
  CHANNEL_LINK_CODE_EXPIRED: 'O código expirou. Peça um novo código.',
  CHANNEL_LINK_ATTEMPTS_EXCEEDED: 'Você errou o código vezes demais. Peça um novo código.',
  CHANNEL_LINK_RESEND_TOO_SOON: 'Aguarde um pouco antes de pedir outro código.',
  CHANNEL_LINK_RESEND_EXHAUSTED: 'Você já pediu o código o máximo de vezes. Informe o número de novo.',
  CHANNEL_LINK_TRANSFER_BLOCKED: 'Este número está vinculado a outra conta e a transferência está bloqueada. Fale com o suporte.',
  CHANNEL_LINK_NOT_FOUND: 'Este número já não está vinculado à sua conta.'
});

/** Códigos que aceitam contagem regressiva na mensagem (429 com `retryAfterSeconds`). */
const RETRY_AWARE_CODES = new Set(['CHANNEL_LINK_RATE_LIMITED', 'CHANNEL_LINK_RESEND_TOO_SOON']);

/**
 * Códigos que significam "o desafio morreu no servidor" — a tela precisa voltar
 * ao campo do telefone, senão o operador fica digitando código num desafio que
 * não existe mais.
 */
const CHALLENGE_GONE_CODES = new Set([
  'CHANNEL_LINK_CHALLENGE_NOT_FOUND',
  'CHANNEL_LINK_CODE_EXPIRED',
  'CHANNEL_LINK_ATTEMPTS_EXCEEDED',
  'CHANNEL_LINK_TRANSFER_BLOCKED'
]);

export function extractErrorCode(error) {
  return String(error?.payload?.code || error?.code || '').trim().toUpperCase();
}

/** `errors.retryAfterSeconds` do corpo problem+json (o header não é lido pelo cliente). */
export function extractRetryAfterSeconds(error) {
  const raw = error?.payload?.errors?.retryAfterSeconds;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0;
}

export function isChallengeGoneError(error) {
  return CHALLENGE_GONE_CODES.has(extractErrorCode(error));
}

/** O desafio já não existe: cancelar de novo é sucesso silencioso, não erro. */
export function isChallengeMissingError(error) {
  return extractErrorCode(error) === 'CHANNEL_LINK_CHALLENGE_NOT_FOUND';
}

/**
 * Para onde a tela vai depois de um erro. `null` = permanece onde está.
 * `CHANNEL_LINK_RESEND_EXHAUSTED` NÃO derruba a etapa: o desafio continua vivo e
 * o último código recebido ainda vale.
 */
export function resolveStageAfterError(error) {
  return isChallengeGoneError(error) ? CHANNEL_LINK_STAGE.PHONE : null;
}

/**
 * Traduz o erro da API para o que o operador lê. Preserva `correlationId` como
 * "código de suporte" — é por ele que o suporte acha o desafio no banco.
 */
export function resolveChannelLinkError(error, fallback = 'Não foi possível concluir a ação.') {
  const code = extractErrorCode(error);
  const retryAfterSeconds = extractRetryAfterSeconds(error);
  const correlationId = String(error?.correlationId || '').trim();

  let message = CHANNEL_LINK_ERROR_MESSAGES[code]
    || error?.detail
    || error?.title
    || error?.message
    || fallback;

  if (retryAfterSeconds > 0 && RETRY_AWARE_CODES.has(code)) {
    message = `${message} Tente de novo em ${formatCountdown(retryAfterSeconds)}.`;
  }

  return {
    code,
    message,
    retryAfterSeconds,
    correlationId,
    detail: correlationId ? `Código de suporte: ${correlationId}` : ''
  };
}
