/**
 * Vínculo telefone ↔ usuário SICAT por OTP iniciado no app (fase 2, cadeia `whatsapp-channel-sicat`).
 *
 * Fluxo: usuário AUTENTICADO informa o número → geramos um código de 6 dígitos, guardamos só o hash
 * scrypt, despachamos pelo WhatsApp → o usuário confirma na tela → gravamos o vínculo `verified` em
 * `conversation_channel_links` (a tabela da 011, até aqui sem nenhum uso).
 *
 * Não existe OTP iniciado a partir do WhatsApp: toda a superfície roda sob `sicatAuthMiddleware`, de
 * modo que um número desconhecido não provoca NENHUMA escrita aqui. A restrição é estrutural, não
 * uma checagem que alguém possa esquecer de fazer.
 *
 * Três decisões carregam o desenho e não devem ser desfeitas sem reler o handoff:
 *  1. **Posse comprovada TRANSFERE o vínculo.** Operadoras reciclam números; a partir da fase 3 um
 *     `from` verificado vira identidade, então bloquear a transferência faria o novo dono do chip
 *     entrar como o usuário ANTIGO. Transferir é a opção segura, e de quebra elimina o oráculo de
 *     enumeração: como a titularidade nunca bloqueia o `start`, nenhuma resposta desta fase revela
 *     que um telefone pertence a outra conta.
 *  2. **O código é guardado com `hashPassword` (scrypt salgado), nunca `hashTokenSha256`.** Com 10^6
 *     possibilidades, um sha256 sem salt é pré-computável em menos de um segundo: um dump do banco
 *     inverteria todos os desafios vivos de uma vez.
 *  3. **As contagens autoritativas moram no Postgres** (`attempt_count`, `send_count`,
 *     `last_sent_at`, escudo da vítima). Os limitadores em memória são escudo de TRÁFEGO — somem no
 *     restart do pod e não podem ser o que segura a força bruta.
 */

import { randomInt } from 'node:crypto';
import { withTransaction } from '../db/pool.js';
import { config } from '../lib/config.js';
import { createPrefixedId } from '../lib/ids.js';
import { AppError } from '../lib/problem.js';
import { createRateLimiter } from '../lib/rate-limit.js';
import { hashPassword, verifyPassword } from '../lib/sicat-security.js';
import { insertAccessAdminAudit } from '../repositories/access-admin-repo.js';
import {
  claimConversationChannelLink,
  countConversationChannelLinksByUser,
  deleteConversationChannelLinkById,
  findConversationChannelLinkById,
  findConversationChannelLinkForUpdate,
  listConversationChannelLinksByUser,
  lockChannelLinkUserScope
} from '../repositories/conversation-channel-link-repo.js';
import {
  closeChannelVerification,
  closeLiveChannelVerificationsByPhoneExcept,
  closeLiveChannelVerificationsByUser,
  consumeChannelVerificationAttempt,
  countDistinctChallengersForPhone,
  findChannelVerificationById,
  findLiveChannelVerificationById,
  findLiveChannelVerificationByUser,
  insertChannelVerification,
  markChannelVerificationDelivery,
  rotateChannelVerificationCode,
  sweepExpiredChannelVerifications
} from '../repositories/conversation-channel-verification-repo.js';
import type { ChannelVerificationRecord } from '../repositories/conversation-channel-verification-repo.js';
import { requireWhatsAppProvider } from './conversation/channel/whatsapp/index.js';
import {
  canonicalizeChannelUserKey,
  maskChannelUserKey
} from './conversation/channel/whatsapp/types.js';

type LooseRecord = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

export const DEFAULT_CHANNEL_TYPE = 'whatsapp';

/** Canais que esta fase sabe verificar. Whitelist no service, para que um canal novo não exija migration. */
const SUPPORTED_CHANNEL_TYPES = new Set([DEFAULT_CHANNEL_TYPE]);

const CODE_LENGTH = 6;
const OTP_CODE_PATTERN = /^\d{6}$/;
/** Cabe um código de provedor + uma frase curta. Nunca o corpo inteiro da resposta. */
const DELIVERY_ERROR_MAX_LENGTH = 240;

/**
 * Teto de despachos por TELEFONE. Vive aqui (e não na rota) porque a chave depende do número já
 * canonicalizado — derivá-la na rota exigiria canonicalizar duas vezes.
 *
 * 6/h é o teto natural de um usuário legítimo: start + 2 reenvios = 3; um ciclo cancelado e refeito
 * = 6. A chave de USUÁRIO (na rota) limita o atacante; esta protege a VÍTIMA — o bombing de um
 * número que não é do solicitante. Nenhuma cobre a outra.
 */
const DISPATCH_PHONE_RATE_LIMIT = createRateLimiter(6, 60 * 60 * 1000);

/** Descarta o estado do limitador de telefone. Só para testes. */
export function resetChannelLinkDispatchLimiterForTests(): void {
  DISPATCH_PHONE_RATE_LIMIT.reset();
}

// ---------------------------------------------------------------------------------------------
// Seam de persistência — injeção só para testes
// ---------------------------------------------------------------------------------------------

/**
 * Tudo o que este service toca fora do próprio processo. Existe como OBJETO (e não como imports
 * diretos) porque as regras que valem dinheiro e posse — escudo da vítima, teto de vínculos,
 * transferência, rotação de código — só se provam com um double de persistência; sem este seam
 * qualquer caso de teste exigiria Postgres de pé.
 *
 * `withTransaction` e `insertAccessAdminAudit` entram junto dos repositórios de propósito: sem eles
 * o double não fecha, porque a transação abriria conexão real e a auditoria (fail-soft) gastaria o
 * `connectionTimeout` do pool a cada chamada.
 */
type ChannelLinkRepositories = {
  withTransaction: typeof withTransaction;
  insertAccessAdminAudit: typeof insertAccessAdminAudit;
  // Vínculos
  listConversationChannelLinksByUser: typeof listConversationChannelLinksByUser;
  countConversationChannelLinksByUser: typeof countConversationChannelLinksByUser;
  findConversationChannelLinkById: typeof findConversationChannelLinkById;
  findConversationChannelLinkForUpdate: typeof findConversationChannelLinkForUpdate;
  claimConversationChannelLink: typeof claimConversationChannelLink;
  deleteConversationChannelLinkById: typeof deleteConversationChannelLinkById;
  lockChannelLinkUserScope: typeof lockChannelLinkUserScope;
  // Desafios
  insertChannelVerification: typeof insertChannelVerification;
  rotateChannelVerificationCode: typeof rotateChannelVerificationCode;
  consumeChannelVerificationAttempt: typeof consumeChannelVerificationAttempt;
  closeChannelVerification: typeof closeChannelVerification;
  closeLiveChannelVerificationsByUser: typeof closeLiveChannelVerificationsByUser;
  closeLiveChannelVerificationsByPhoneExcept: typeof closeLiveChannelVerificationsByPhoneExcept;
  findChannelVerificationById: typeof findChannelVerificationById;
  findLiveChannelVerificationById: typeof findLiveChannelVerificationById;
  findLiveChannelVerificationByUser: typeof findLiveChannelVerificationByUser;
  countDistinctChallengersForPhone: typeof countDistinctChallengersForPhone;
  markChannelVerificationDelivery: typeof markChannelVerificationDelivery;
  sweepExpiredChannelVerifications: typeof sweepExpiredChannelVerifications;
};

const DEFAULT_REPOSITORIES: ChannelLinkRepositories = {
  withTransaction,
  insertAccessAdminAudit,
  listConversationChannelLinksByUser,
  countConversationChannelLinksByUser,
  findConversationChannelLinkById,
  findConversationChannelLinkForUpdate,
  claimConversationChannelLink,
  deleteConversationChannelLinkById,
  lockChannelLinkUserScope,
  insertChannelVerification,
  rotateChannelVerificationCode,
  consumeChannelVerificationAttempt,
  closeChannelVerification,
  closeLiveChannelVerificationsByUser,
  closeLiveChannelVerificationsByPhoneExcept,
  findChannelVerificationById,
  findLiveChannelVerificationById,
  findLiveChannelVerificationByUser,
  countDistinctChallengersForPhone,
  markChannelVerificationDelivery,
  sweepExpiredChannelVerifications
};

let repositories: ChannelLinkRepositories = DEFAULT_REPOSITORIES;

/**
 * Substitui parte (ou tudo) da camada de persistência por doubles. **SÓ para testes** — nenhum
 * caminho de produção chama isto, exatamente como `setWhatsAppProviderOverrideForTests` na fase 1.
 * Passar `null` restaura os repositórios reais; o teste DEVE restaurar no `afterEach`, senão o
 * vazamento contamina os arquivos seguintes da mesma execução.
 */
export function setChannelLinkRepositoriesForTests(
  overrides: Partial<ChannelLinkRepositories> | null
): void {
  repositories = overrides ? { ...DEFAULT_REPOSITORIES, ...overrides } : DEFAULT_REPOSITORIES;
}

export function buildDispatchPhoneRateKey(channelType: string, externalUserKey: string): string {
  return `link:dispatch:phone:${channelType}:${externalUserKey}`;
}

// ---------------------------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------------------------

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Canal pedido pelo cliente. Só aceita o que esta fase sabe verificar — devolver 400 explícito é
 * melhor do que abrir um desafio num canal que ninguém entrega.
 */
export function requireSupportedChannel(value: unknown): string {
  const channelType = toTrimmedString(value)?.toLowerCase() || DEFAULT_CHANNEL_TYPE;
  if (!SUPPORTED_CHANNEL_TYPES.has(channelType)) {
    throw new AppError(400, 'Bad Request', `Canal não suportado: ${channelType}.`, {
      code: 'CHANNEL_LINK_CHANNEL_UNSUPPORTED'
    });
  }
  return channelType;
}

/**
 * Canonicaliza e valida o telefone ANTES de qualquer trabalho caro. Sem o teto de comprimento,
 * `"1"` viraria uma chave válida e a falha só apareceria no provedor — depois de já ter gasto
 * desafio, cota de limitador e uma chamada paga.
 */
export function requireChannelUserKey(value: unknown): string {
  const canonical = canonicalizeChannelUserKey(value, config.channelLinkDefaultCountryCode);
  if (canonical.length < 12 || canonical.length > 15) {
    throw new AppError(
      400,
      'Bad Request',
      'Telefone inválido: informe DDI+DDD+número (ex.: 5511999999999).',
      { code: 'CHANNEL_LINK_PHONE_INVALID' }
    );
  }
  return canonical;
}

/**
 * Código de 6 dígitos com CSPRNG.
 *
 * `Math.random()` é xorshift128+ no V8 e um endpoint que emite códigos sob demanda deixaria o
 * atacante coletar os próprios códigos e prever o do próximo desafio — quebra o esquema sem força
 * bruta nenhuma. `randomBytes(3) % 1_000_000` também não serve: 2^24 não é múltiplo de 10^6 e os
 * 777.216 primeiros códigos ficariam ~6,7% mais prováveis.
 *
 * O `padStart` não é cosmético: perder o zero à esquerda faria ~10% dos códigos falharem de forma
 * intermitente. O valor é `string` do gerador até o provedor, pelo mesmo motivo.
 */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

export function isValidOtpCodeFormat(value: unknown): boolean {
  return typeof value === 'string' && OTP_CODE_PATTERN.test(value);
}

export type ChallengeStateInput = {
  consumedAt: string | null;
  expiresAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  sendCount: number;
  maxSends: number;
  lastSentAt: string | null;
};

export type ChallengeState = {
  status: 'live' | 'closed' | 'expired' | 'exhausted';
  attemptsRemaining: number;
  sendsRemaining: number;
  canResendAt: string | null;
  /**
   * `exhausted` = acabaram os ENVIOS; `attempts_exhausted` = acabaram os PALPITES. São motivos
   * distintos porque o segundo é terminal: nenhum código novo poderá ser confirmado.
   */
  resendBlockedReason: 'closed' | 'expired' | 'attempts_exhausted' | 'exhausted' | 'cooldown' | null;
};

/**
 * Decide o próximo estado do desafio a partir dos contadores. É PURA de propósito: é a única parte
 * da máquina de estados que dá para provar sem banco, e é onde os erros de fronteira aparecem
 * (`attempt_count == max_attempts` já é esgotado, `expires_at == now` já é expirado).
 *
 * Não substitui o `where` atômico do banco — decide apenas a MENSAGEM, nunca a autorização.
 */
export function evaluateChallengeState(
  input: ChallengeStateInput,
  options: { now?: number; resendCooldownSeconds?: number } = {}
): ChallengeState {
  const now = options.now ?? Date.now();
  const cooldownSeconds = options.resendCooldownSeconds ?? Number(config.channelLinkOtpResendCooldownSeconds);

  const attemptsRemaining = Math.max(0, input.maxAttempts - input.attemptCount);
  const sendsRemaining = Math.max(0, input.maxSends - input.sendCount);

  const lastSentMs = input.lastSentAt ? new Date(input.lastSentAt).getTime() : null;
  const canResendAt = lastSentMs != null && Number.isFinite(lastSentMs)
    ? new Date(lastSentMs + cooldownSeconds * 1000).toISOString()
    : null;

  const expiresMs = input.expiresAt ? new Date(input.expiresAt).getTime() : null;

  let status: ChallengeState['status'] = 'live';
  if (input.consumedAt) status = 'closed';
  else if (expiresMs != null && Number.isFinite(expiresMs) && expiresMs <= now) status = 'expired';
  else if (attemptsRemaining <= 0) status = 'exhausted';

  let resendBlockedReason: ChallengeState['resendBlockedReason'] = null;
  if (status === 'closed') resendBlockedReason = 'closed';
  else if (status === 'expired') resendBlockedReason = 'expired';
  // Palpites esgotados BLOQUEIAM o reenvio. Sem esta linha o resend rotacionava o código, renovava o
  // TTL, incrementava `send_count` e disparava UMA MENSAGEM PAGA que jamais poderia ser confirmada —
  // o consume exige `attempt_count < max_attempts`.
  else if (status === 'exhausted') resendBlockedReason = 'attempts_exhausted';
  else if (sendsRemaining <= 0) resendBlockedReason = 'exhausted';
  else if (canResendAt && new Date(canResendAt).getTime() > now) resendBlockedReason = 'cooldown';

  return { status, attemptsRemaining, sendsRemaining, canResendAt, resendBlockedReason };
}

export function retryAfterSeconds(target: string | null, now = Date.now()): number {
  if (!target) return 1;
  const targetMs = new Date(target).getTime();
  if (!Number.isFinite(targetMs)) return 1;
  return Math.max(1, Math.ceil((targetMs - now) / 1000));
}

/**
 * Sequência longa de dígitos = telefone, em qualquer formatação. Códigos de erro de provedor têm 5–6
 * dígitos e continuam legíveis; um número de assinante tem 8 ou mais.
 */
const LONG_DIGIT_RUN = /\d{7,}/g;

/** Mantém os 4 últimos dígitos (é o que o suporte usa para casar com a linha) e apaga o resto. */
function redactLongDigitRuns(value: string): string {
  return value.replace(LONG_DIGIT_RUN, (run) => `${'*'.repeat(run.length - 4)}${run.slice(-4)}`);
}

/**
 * Menor sufixo do número conhecido que ainda identifica a linha. Abaixo disso a chance de casar com
 * um código de provedor ou um id qualquer deixa de ser desprezível.
 */
const MIN_KNOWN_PHONE_DIGITS = 8;

/**
 * Trecho "telefônico": dígitos e os separadores que um provedor intercala ao ecoar o destinatário
 * (`+55 11 99999-4321`, `(11) 99999-4321`). Começa e termina em dígito para não engolir pontuação da
 * frase. Sem quantificador aninhado — a varredura é linear, nada de ReDoS.
 */
const PHONE_LIKE_SPAN = /\d[\d\s().+-]*\d/g;

function maskPhoneDigits(digits: string): string {
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

/**
 * Formas do número conhecido que podem aparecer no eco do provedor, do mais longo para o mais curto:
 * inteiro (`5511999994321`), sem DDI (`11999994321`), só o assinante (`999994321`). Comparamos por
 * SUFIXO porque o que os provedores cortam é sempre o começo (DDI/DDD), nunca o fim.
 */
function knownPhoneSuffixes(externalUserKey: string): string[] {
  const digits = externalUserKey.replace(/\D/g, '');
  if (digits.length < MIN_KNOWN_PHONE_DIGITS) return [];
  const suffixes: string[] = [];
  for (let start = 0; start <= digits.length - MIN_KNOWN_PHONE_DIGITS; start += 1) {
    suffixes.push(digits.slice(start));
  }
  return suffixes;
}

/**
 * Apaga o telefone CONHECIDO do desafio em qualquer formatação.
 *
 * `redactLongDigitRuns` sozinho não cobre isto: ele só enxerga corridas de 7+ dígitos, e
 * `Invalid recipient (11) 99999-9999` tem corridas de 2, 5 e 4 — nenhuma atinge o limiar, e o número
 * ia em CLARO para `delivery_error` e para o `metadata` da auditoria. Como aqui sabemos qual número
 * foi despachado, não precisamos adivinhar por formato: normalizamos cada trecho telefônico do texto
 * e comparamos com os sufixos conhecidos.
 *
 * O trecho inteiro vira máscara (não só os dígitos que casaram): erra para o lado de esconder
 * DEMAIS, que é o lado certo numa função de redação.
 */
function redactKnownPhone(value: string, externalUserKey: string | null | undefined): string {
  const suffixes = knownPhoneSuffixes(externalUserKey || '');
  if (suffixes.length === 0) return value;
  return value.replace(PHONE_LIKE_SPAN, (span) => {
    const spanDigits = span.replace(/\D/g, '');
    if (spanDigits.length < MIN_KNOWN_PHONE_DIGITS) return span;
    return suffixes.some((suffix) => spanDigits.includes(suffix)) ? maskPhoneDigits(spanDigits) : span;
  });
}

/**
 * Erro de entrega em forma auditável: código do provedor + frase curta, truncado e com o
 * destinatário REDIGIDO. O corpo inteiro da resposta pode trazer eco do destinatário e cabeçalhos —
 * não é coisa para guardar numa coluna que o suporte lê.
 *
 * A redação não é zelo: o Twilio devolve literalmente `The 'To' number +5511999999999 is not a valid
 * phone number`, e este texto vai para `delivery_error` E para o `metadata` da auditoria. Sem ela, o
 * único lugar do fluxo que carrega o telefone em CLARO é justamente o caminho de falha — enquanto
 * todo o resto (DTOs, erros, trilha) passa por `maskChannelUserKey`.
 *
 * `knownUserKey` é o telefone do PRÓPRIO desafio. Passá-lo é o que fecha o buraco do número
 * FORMATADO (`(11) 99999-9999`), cujas corridas de dígitos são curtas demais para o limiar genérico.
 * O parâmetro é opcional só para os usos puros (teste do limiar genérico); no fluxo real ele é
 * sempre informado.
 */
export function sanitizeDeliveryError(error: unknown, knownUserKey: string | null = null): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const merged = [code, raw.replace(/\s+/g, ' ').trim()].filter(Boolean).join(': ');
  // Conhecido primeiro (pega o formatado), genérico depois (pega qualquer outro número no texto).
  const redacted = redactLongDigitRuns(redactKnownPhone(merged, knownUserKey));
  return redacted.slice(0, DELIVERY_ERROR_MAX_LENGTH) || 'unknown_delivery_error';
}

// ---------------------------------------------------------------------------------------------
// DTOs — a fronteira HTTP passa por aqui e só por aqui
// ---------------------------------------------------------------------------------------------

/** Linha de vínculo como o repositório devolve (mapeada). */
type ChannelLinkRow = NonNullable<Awaited<ReturnType<typeof claimConversationChannelLink>>>;

type ChannelLinkRecord = {
  id: string;
  channelType: string;
  externalUserKey: string;
  userId: string | null;
  verificationStatus: string;
  verifiedAt: string | null;
  createdAt: string | null;
};

/**
 * Mapper campo a campo, DELIBERADAMENTE. `mapConversationChannelLink` devolve o jsonb de `metadata`
 * inteiro — ecoar isso vazaria o que qualquer fase futura resolver guardar lá. O dono vê o PRÓPRIO
 * número inteiro (é dele, e ele precisa distinguir até 3 na lista); todo o resto usa a máscara.
 */
export function toChannelLinkDto(link: ChannelLinkRecord) {
  return {
    id: link.id,
    channelType: link.channelType,
    phone: link.externalUserKey,
    phoneMasked: maskChannelUserKey(link.externalUserKey),
    verificationStatus: link.verificationStatus,
    verifiedAt: link.verifiedAt,
    createdAt: link.createdAt
  };
}

/**
 * DTO do desafio. NUNCA carrega `codeHash`, `providerName`, `providerMessageId`, `deliveryError` nem
 * `metadata` — e, obviamente, nunca o código. O telefone sai só mascarado.
 */
export function toChallengeDto(challenge: ChannelVerificationRecord, now = Date.now()) {
  const state = evaluateChallengeState(challenge, { now });
  return {
    challengeId: challenge.id,
    channelType: challenge.channelType,
    phoneMasked: maskChannelUserKey(challenge.externalUserKey),
    expiresAt: challenge.expiresAt,
    attemptsRemaining: state.attemptsRemaining,
    sendsRemaining: state.sendsRemaining,
    canResendAt: state.canResendAt,
    deliveryStatus: challenge.deliveryStatus,
    correlationId: challenge.correlationId
  };
}

// ---------------------------------------------------------------------------------------------
// Despacho
// ---------------------------------------------------------------------------------------------

/**
 * Verifica que o canal está de pé ANTES de qualquer consumo de cota. A rota chama isto primeiro para
 * que um canal desligado não queime o orçamento do usuário — e para que a rota não precise conhecer
 * o provedor.
 */
export function assertChannelDispatchAvailable(channelType: string): void {
  requireSupportedChannel(channelType);
  requireWhatsAppProvider();
}

/**
 * Envio do código. SEMPRE por `sendTemplate`, NUNCA `sendText`: a Meta Cloud API recusa texto livre
 * fora da janela de 24 h desde a última mensagem do usuário, e quem está se vinculando pela primeira
 * vez nunca escreveu para o número de negócio — `sendText` funcionaria no sandbox Twilio e falharia
 * 100% em produção. O adapter Twilio cobre os dois mundos: quando o template não é um Content SID
 * (`HX…`), ele renderiza `{{1}}` no próprio corpo.
 *
 * Exatamente UMA variável, que é como os templates de categoria AUTHENTICATION da Meta são montados.
 */
export async function dispatchChannelLinkOtp(input: { to: string; code: string }): Promise<{
  providerName: string;
  providerMessageId: string | null;
}> {
  const provider = requireWhatsAppProvider();
  const result = await provider.sendTemplate({
    to: input.to,
    templateName: String(config.whatsappLinkOtpTemplate),
    languageCode: String(config.whatsappLinkOtpTemplateLanguage),
    variables: [input.code]
  });
  return { providerName: provider.name, providerMessageId: result.providerMessageId };
}

/**
 * Auditoria é fail-soft de propósito: a mutação já aconteceu (ou já foi negada) quando chegamos
 * aqui, e derrubar a resposta faria o cliente repetir uma operação que deu certo. A falha vai para o
 * log do processo em vez de virar 500.
 */
async function recordChannelLinkAudit(entry: {
  actionType: string;
  actionStatus: 'succeeded' | 'failed' | 'denied';
  actorUserId: string;
  targetUserId?: string | null;
  reason?: string | null;
  correlationId?: string | null;
  metadata?: JsonObject;
}): Promise<void> {
  try {
    await repositories.insertAccessAdminAudit({
      id: createPrefixedId('audt'),
      actorUserId: entry.actorUserId,
      targetUserId: entry.targetUserId || null,
      actionType: entry.actionType,
      actionStatus: entry.actionStatus,
      reason: entry.reason || null,
      correlationId: entry.correlationId || null,
      metadata: entry.metadata || {}
    });
  } catch (error: unknown) {
    console.error('[channel-link] falha ao gravar auditoria', {
      actionType: entry.actionType,
      correlationId: entry.correlationId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function rateLimited(detail: string, retryAfter: number): AppError {
  return new AppError(429, 'Too Many Requests', detail, {
    code: 'CHANNEL_LINK_RATE_LIMITED',
    errors: { retryAfterSeconds: retryAfter }
  });
}

function buildLimitsDto() {
  return {
    maxLinksPerUser: Number(config.channelLinkMaxPerUser),
    otpTtlSeconds: Number(config.channelLinkOtpTtlSeconds),
    maxAttempts: Number(config.channelLinkOtpMaxAttempts),
    maxSends: Number(config.channelLinkOtpMaxSends),
    resendCooldownSeconds: Number(config.channelLinkOtpResendCooldownSeconds)
  };
}

// ---------------------------------------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------------------------------------

/**
 * Estado completo da tela em UMA chamada. Devolver o desafio vivo aqui é o que faz a tela sobreviver
 * a um F5 no meio da digitação: sem isso o usuário perde o `challengeId`, recomeça e queima cota.
 */
export async function listChannelLinksService(userId: string, rawQuery: LooseRecord = {}) {
  const channelType = requireSupportedChannel(rawQuery.channelType);

  const links = await repositories.listConversationChannelLinksByUser(null, userId, channelType);
  const pendingChallenge = await repositories.findLiveChannelVerificationByUser(null, userId, channelType);

  return {
    links: links.map((link) => toChannelLinkDto(link)),
    pendingChallenge: pendingChallenge ? toChallengeDto(pendingChallenge) : null,
    limits: buildLimitsDto()
  };
}

/**
 * Cria o desafio e despacha o OTP. Único ponto de entrada da vinculação.
 *
 * NÃO consulta e NÃO bloqueia por titularidade do número: a posse decide no confirm, então nenhuma
 * resposta daqui revela se um número já é usado no SICAT. Re-verificar um número que já é seu roda
 * igual e re-carimba `verified_at` — não existe erro "já vinculado".
 */
export async function startChannelLinkService(
  userId: string,
  body: LooseRecord,
  correlationId: string | null = null
) {
  const channelType = requireSupportedChannel(body.channelType);
  const rawInput = toTrimmedString(body.phone);
  const externalUserKey = requireChannelUserKey(body.phone);

  // Titularidade PRÓPRIA é resolvida ANTES de qualquer balde — esta é deliberadamente a primeira ida
  // ao banco. Os dois escudos abaixo (tráfego por telefone e vítima) existem para proteger o DONO do
  // número; cobrá-los antes de saber QUEM está pedindo transformava os dois em arma contra ele:
  // bastava UMA conta de atacante gastar os 6 hits do balde de telefone para o dono JÁ VERIFICADO
  // levar 429 por uma hora, em janela renovável indefinidamente. Quem contém o atacante é o teto por
  // USUÁRIO (8/h, na rota) — e ele já foi cobrado antes de chegarmos aqui.
  //
  // Não é oráculo de enumeração: só responde sobre vínculos do PRÓPRIO autenticado, informação que
  // ele já vê na lista da tela.
  const existingLink = await findChannelLinkOfUserByPhone(userId, channelType, externalUserKey);
  const isOwnVerifiedNumber = existingLink?.verificationStatus === 'verified';

  // Limitador de TELEFONE (escudo de TRÁFEGO): só aqui a chave existe, porque depende do número já
  // canonicalizado. O dono já verificado PULA o balde pelo motivo acima — re-verificar o próprio
  // telefone não é bombing, e o custo dele continua limitado pelo balde de usuário da rota.
  //
  // PEEK aqui, DÉBITO só depois das recusas baratas (escudo da vítima e teto de vínculos). Consumir
  // com `check` neste ponto deixava UMA conta de atacante já no teto de 3 vínculos DRENAR os 6 hits/h
  // do número da vítima só disparando `start`: a mensagem nunca sairia (o 409 de teto barra adiante),
  // mas o balde que protege a vítima já teria sido gasto — sem nenhuma escrita no banco. `peek` recusa
  // cedo quem já estourou a janela, sem cobrar a cota de quem vai ser barrado logo abaixo por um
  // motivo mais barato.
  const phoneRateKey = buildDispatchPhoneRateKey(channelType, externalUserKey);
  if (!isOwnVerifiedNumber) {
    const phoneDecision = DISPATCH_PHONE_RATE_LIMIT.peek(phoneRateKey);
    if (!phoneDecision.allowed) {
      throw rateLimited(
        `Limite de envios para este número atingido. Tente novamente em ${phoneDecision.retryAfterSeconds}s.`,
        phoneDecision.retryAfterSeconds
      );
    }
  }

  // Escudo da VÍTIMA: contas distintas de TERCEIROS que pediram código para este número na janela. O
  // erro é o genérico de rate limit de propósito — não revela titularidade, só que o número foi muito
  // procurado.
  //
  // O dono já verificado do número PULA o escudo pelo mesmo motivo do balde de telefone.
  //
  // ⚠️ TRADE-OFF CONHECIDO E ACEITO NESTA FASE (não é descuido): o escudo só tem saída para quem JÁ
  // tem vínculo verificado. Uma vítima de PRIMEIRA viagem — que nunca vinculou o número — pode ser
  // trancada por N+1 contas descartáveis e não tem caminho de escape dentro deste fluxo. É a forma
  // genérica do problema: TODO escudo do tipo "proteja a vítima" pode ser virado em DoS contra ela,
  // e nenhuma heurística de tráfego resolve isso — só uma prova de posse fora de banda. O caminho de
  // escape (step-up de identidade ou ação de suporte que libera o número) é ESCOPO DE FASE FUTURA e
  // está registrado no handoff como decisão pendente. Não invente aqui um bypass baseado em sinal
  // fraco (IP, user-agent, idade da conta): qualquer um deles reabre o bombing multi-conta, que é
  // exatamente o abuso que este escudo existe para conter.
  if (!isOwnVerifiedNumber) {
    const distinctChallengers = await repositories.countDistinctChallengersForPhone(null, {
      channelType,
      externalUserKey,
      windowHours: Number(config.channelLinkVictimShieldWindowHours),
      exceptUserId: userId
    });
    // Estritamente ACIMA do limiar: `N` contas de terceiros ainda passam, a `N+1` é que tranca.
    if (distinctChallengers > Number(config.channelLinkVictimShieldDistinctUsers)) {
      await recordChannelLinkAudit({
        actionType: 'channel_link.failed',
        actionStatus: 'denied',
        actorUserId: userId,
        reason: 'victim_shield',
        correlationId,
        metadata: { channelType, phoneMasked: maskChannelUserKey(externalUserKey), distinctChallengers }
      });
      throw rateLimited('Limite de envios para este número atingido. Tente novamente mais tarde.', 3600);
    }
  }

  // Teto de vínculos: falha barata, antes de gastar mensagem. É reconferido dentro da transação do
  // confirm, que é onde o TOCTOU de dois desafios concorrentes se fecha de verdade.
  const currentLinks = await repositories.countConversationChannelLinksByUser(null, userId, channelType);
  if (!existingLink && currentLinks >= Number(config.channelLinkMaxPerUser)) {
    throw new AppError(
      409,
      'Conflict',
      `Limite de ${config.channelLinkMaxPerUser} números vinculados atingido. Remova um número antes de vincular outro.`,
      { code: 'CHANNEL_LINK_MAX_LINKS_REACHED' }
    );
  }

  // Débito do balde de TELEFONE — só AGORA, passadas as recusas baratas (escudo da vítima e teto de
  // vínculos). `peek` (acima) + `check` (aqui) não é atômico, mas o teto por USUÁRIO da rota já correu
  // antes e o balde de telefone fica aproximado por cima em 1 unidade — preço consciente de não deixar
  // uma recusa barata consumir a cota que existe para proteger a vítima.
  if (!isOwnVerifiedNumber) {
    DISPATCH_PHONE_RATE_LIMIT.check(phoneRateKey);
  }

  // Higiene oportunista — não é requisito de correção, só evita acúmulo de linhas vivas mortas.
  await repositories.sweepExpiredChannelVerifications(null, 100);

  const code = generateOtpCode();
  const ttlSeconds = Number(config.channelLinkOtpTtlSeconds);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  // `hashPassword` é scrypt SÍNCRONO (dezenas de ms de CPU, event loop parado). Calculado AQUI, FORA
  // da transação: lá dentro ele seguraria uma das 10 conexões do pool e os row locks durante todo o
  // scrypt — ~10 `start` simultâneos esgotariam o pool e TODA a API passaria a esperar o
  // `connectionTimeout` de 5 s. O custo de CPU é idêntico; o de lock e conexão vai a zero.
  const codeHash = hashPassword(code);

  let challenge: ChannelVerificationRecord | null;
  try {
    challenge = await repositories.withTransaction(async (client) => {
      // Serializa por usuário: sem isto, dois `start` concorrentes do mesmo usuário fecham os vivos
      // um do outro e inserem os dois — par de desafios vivos, ou violação do índice único.
      await repositories.lockChannelLinkUserScope(client, userId);

      // Abrir um desafio fecha TODOS os vivos do usuário (inclusive para outro número): a UI tem no
      // máximo um `pendingChallenge`, e o índice único vivo não colide.
      await repositories.closeLiveChannelVerificationsByUser(client, {
        userId,
        channelType,
        outcome: 'superseded'
      });

      return repositories.insertChannelVerification(client, {
        id: createPrefixedId('cvfy'),
        channelType,
        externalUserKey,
        userId,
        codeHash,
        maxAttempts: Number(config.channelLinkOtpMaxAttempts),
        maxSends: Number(config.channelLinkOtpMaxSends),
        expiresAt,
        correlationId,
        // `rawInput` permite ao suporte reconstruir o que o usuário viu quando a canonicalização
        // heurística errar. O código NUNCA entra aqui.
        metadata: { rawInput: rawInput || null, verifiedVia: 'otp' }
      });
    });
  } catch (error: unknown) {
    // Índice único vivo `(channel_type, external_user_key, user_id) where consumed_at is null`. Com o
    // advisory lock acima isto virou caminho de exceção, não de rotina — mas `23505` não é `AppError`,
    // não tem `.status` e viraria um 500 sem código estável. Resposta IDEMPOTENTE: devolvemos o
    // desafio vivo que a outra requisição criou (a UI já sabe consumir este DTO) e NÃO despachamos
    // segunda mensagem — o outro `start` já pagou por uma.
    if (!isUniqueViolation(error)) throw error;

    const inFlight = await repositories.findLiveChannelVerificationByUser(
      null,
      userId,
      channelType,
      externalUserKey
    );
    if (inFlight) return toChallengeDto(inFlight);

    // A linha conflitante já morreu entre o insert e a releitura: não há o que devolver, e repetir o
    // `start` resolve. Código estável em vez de 500 genérico.
    throw new AppError(
      409,
      'Conflict',
      'Já existe um pedido de código em andamento para este número. Tente novamente em instantes.',
      { code: 'CHANNEL_LINK_CHALLENGE_IN_FLIGHT' }
    );
  }

  if (!challenge) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao criar o desafio de vínculo.', {
      code: 'CHANNEL_LINK_CHALLENGE_FAILED'
    });
  }

  const delivered = await dispatchAndRecord(challenge, code, userId, correlationId);

  await recordChannelLinkAudit({
    actionType: 'channel_link.started',
    actionStatus: 'succeeded',
    actorUserId: userId,
    correlationId,
    metadata: {
      channelType,
      phoneMasked: maskChannelUserKey(externalUserKey),
      verificationId: challenge.id
    }
  });

  return toChallengeDto(delivered);
}

/**
 * Reenvio: ROTACIONA o código e renova o TTL, mas NÃO zera as tentativas.
 *
 * Rotacionar (em vez de reenviar o mesmo código) invalida no ato a mensagem que pode ter ido para um
 * número digitado errado — e só existe UM segredo vivo por desafio em qualquer instante. Zerar
 * tentativas transformaria o reenvio no bypass do limite de palpites.
 */
export async function resendChannelLinkChallengeService(
  userId: string,
  challengeId: string,
  correlationId: string | null = null
) {
  const id = toTrimmedString(challengeId);
  if (!id) throw challengeNotFound();

  const challenge = await repositories.findLiveChannelVerificationById(null, id, userId);
  if (!challenge) throw challengeNotFound();

  const now = Date.now();
  const state = evaluateChallengeState(challenge, { now });

  if (state.status === 'expired') {
    await repositories.closeChannelVerification(null, { id: challenge.id, userId, outcome: 'expired' });
    throw new AppError(400, 'Bad Request', 'Código expirado. Solicite um novo.', {
      code: 'CHANNEL_LINK_CODE_EXPIRED'
    });
  }

  // Palpites esgotados: fecha o desafio e recusa ANTES de rotacionar o código e ANTES de despachar.
  // Reenviar aqui gastaria uma mensagem paga por um código que o `consume` já não aceitaria.
  if (state.resendBlockedReason === 'attempts_exhausted') {
    await repositories.closeChannelVerification(null, {
      id: challenge.id,
      userId,
      outcome: 'exhausted'
    });
    await recordChannelLinkAudit({
      actionType: 'channel_link.failed',
      actionStatus: 'denied',
      actorUserId: userId,
      reason: 'attempts_exceeded',
      correlationId,
      metadata: {
        channelType: challenge.channelType,
        phoneMasked: maskChannelUserKey(challenge.externalUserKey),
        verificationId: challenge.id
      }
    });
    throw new AppError(429, 'Too Many Requests', 'Tentativas esgotadas. Solicite um novo código.', {
      code: 'CHANNEL_LINK_ATTEMPTS_EXCEEDED',
      errors: { retryAfterSeconds: 0, attemptsRemaining: 0 }
    });
  }

  // Cooldown conferido contra `last_sent_at` NO BANCO: sobrevive ao restart do pod, ao contrário do
  // limitador em memória.
  if (state.resendBlockedReason === 'cooldown') {
    const wait = retryAfterSeconds(state.canResendAt, now);
    throw new AppError(429, 'Too Many Requests', `Aguarde ${wait}s para reenviar o código.`, {
      code: 'CHANNEL_LINK_RESEND_TOO_SOON',
      errors: { retryAfterSeconds: wait }
    });
  }

  if (state.resendBlockedReason === 'exhausted') {
    throw new AppError(
      429,
      'Too Many Requests',
      'Limite de reenvios atingido para este desafio. Cancele e comece de novo.',
      { code: 'CHANNEL_LINK_RESEND_EXHAUSTED', errors: { retryAfterSeconds: 0 } }
    );
  }

  const phoneDecision = DISPATCH_PHONE_RATE_LIMIT.check(
    buildDispatchPhoneRateKey(challenge.channelType, challenge.externalUserKey)
  );
  if (!phoneDecision.allowed) {
    throw rateLimited(
      `Limite de envios para este número atingido. Tente novamente em ${phoneDecision.retryAfterSeconds}s.`,
      phoneDecision.retryAfterSeconds
    );
  }

  const code = generateOtpCode();
  const ttlSeconds = Number(config.channelLinkOtpTtlSeconds);
  const rotated = await repositories.rotateChannelVerificationCode(null, {
    id: challenge.id,
    userId,
    codeHash: hashPassword(code),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
  });
  // `rowCount = 0` = alguém consumiu/fechou entre a leitura e a rotação, ou o teto de envios estourou.
  if (!rotated) throw challengeNotFound();

  const delivered = await dispatchAndRecord(rotated, code, userId, correlationId);

  await recordChannelLinkAudit({
    actionType: 'channel_link.resent',
    actionStatus: 'succeeded',
    actorUserId: userId,
    correlationId,
    metadata: {
      channelType: rotated.channelType,
      phoneMasked: maskChannelUserKey(rotated.externalUserKey),
      verificationId: rotated.id,
      sendCount: rotated.sendCount
    }
  });

  return toChallengeDto(delivered);
}

/**
 * Sinal INTERNO (nunca sai deste módulo, nunca vira resposta HTTP): a posse foi provada, mas a
 * gravação do vínculo foi barrada. Existe para forçar o ROLLBACK da transação do confirm sem que o
 * erro final (que precisa de efeitos colaterais duráveis) seja montado lá dentro.
 */
class TransferBlockedSignal extends Error {
  constructor() {
    super('channel link transfer blocked');
    this.name = 'TransferBlockedSignal';
  }
}

type ConfirmTransactionResult =
  | { blocked: 'transfer' | 'max_links' }
  | {
      link: ChannelLinkRow;
      transferred: boolean;
      previousOwnerId: string | null;
      idempotent: boolean;
    };

/**
 * Queima o desafio e monta o 409 de transferência bloqueada. Roda SEM transação de propósito: é o
 * único jeito de o `outcome = 'conflict'` sobreviver ao erro que vem logo em seguida.
 */
async function closeChallengeAsTransferConflict(
  challenge: ChannelVerificationRecord,
  userId: string,
  correlationId: string | null
): Promise<AppError> {
  await repositories.closeChannelVerification(null, {
    id: challenge.id,
    userId,
    outcome: 'conflict'
  });
  await recordChannelLinkAudit({
    actionType: 'channel_link.failed',
    actionStatus: 'denied',
    actorUserId: userId,
    reason: 'transfer_blocked',
    correlationId,
    metadata: {
      channelType: challenge.channelType,
      phoneMasked: maskChannelUserKey(challenge.externalUserKey),
      verificationId: challenge.id
    }
  });
  return new AppError(409, 'Conflict', 'Não foi possível concluir a vinculação deste número.', {
    code: 'CHANNEL_LINK_TRANSFER_BLOCKED'
  });
}

/**
 * Recusa por teto de vínculos DEPOIS de a posse ter sido provada — e deixa rastro.
 *
 * Roda SEM transação pelo mesmo motivo de `closeChallengeAsTransferConflict`: o erro que devolvemos
 * é lançado logo em seguida e reverteria a auditoria se ela fosse gravada lá dentro. Este caminho
 * era o único do fluxo que negava em silêncio; sem a trilha, uma conta comprometida provava posse de
 * N números seguidos sem produzir nenhum evento.
 *
 * O desafio NÃO é fechado de propósito (diferente da transferência bloqueada): o código continua
 * válido para que o usuário remova um número e confirme o MESMO código em seguida.
 */
async function denyConfirmForMaxLinks(
  challenge: ChannelVerificationRecord,
  userId: string,
  correlationId: string | null
): Promise<AppError> {
  await recordChannelLinkAudit({
    actionType: 'channel_link.failed',
    actionStatus: 'denied',
    actorUserId: userId,
    reason: 'max_links_reached',
    correlationId,
    metadata: {
      channelType: challenge.channelType,
      phoneMasked: maskChannelUserKey(challenge.externalUserKey),
      verificationId: challenge.id,
      maxLinksPerUser: Number(config.channelLinkMaxPerUser)
    }
  });
  return new AppError(
    409,
    'Conflict',
    `Limite de ${config.channelLinkMaxPerUser} números vinculados atingido. Remova um número antes de vincular outro.`,
    { code: 'CHANNEL_LINK_MAX_LINKS_REACHED' }
  );
}

/**
 * Prova a posse do aparelho e grava o vínculo. Única escrita do fluxo em
 * `conversation_channel_links` e único ponto que decide titularidade — o ponto certo, porque aqui a
 * posse já foi provada.
 */
export async function confirmChannelLinkService(
  userId: string,
  challengeId: string,
  body: LooseRecord,
  correlationId: string | null = null
) {
  const id = toTrimmedString(challengeId);
  if (!id) throw challengeNotFound();

  // Formato antes de qualquer ida ao banco: bug de cliente não pode queimar tentativa. `code` é
  // string do começo ao fim — tratar como número faria `000042` virar `42`.
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!isValidOtpCodeFormat(code)) {
    throw new AppError(400, 'Bad Request', 'Código inválido: informe os 6 dígitos recebidos.', {
      code: 'CHANNEL_LINK_CODE_MALFORMED'
    });
  }

  // Cobra a tentativa e traz o hash no MESMO statement. Falha de rede no meio do `verifyPassword`
  // não devolve palpite grátis, e requisições concorrentes não leem `attempt_count = 0` em paralelo.
  const attempted = await repositories.consumeChannelVerificationAttempt(null, { id, userId });
  if (!attempted) {
    throw await buildConfirmDisambiguationError(id, userId, correlationId);
  }

  if (!verifyPassword(code, attempted.codeHash)) {
    if (attempted.attemptCount >= attempted.maxAttempts) {
      await repositories.closeChannelVerification(null, {
        id: attempted.id,
        userId,
        outcome: 'exhausted'
      });
      await recordChannelLinkAudit({
        actionType: 'channel_link.failed',
        actionStatus: 'denied',
        actorUserId: userId,
        reason: 'attempts_exceeded',
        correlationId,
        metadata: {
          channelType: attempted.channelType,
          phoneMasked: maskChannelUserKey(attempted.externalUserKey),
          verificationId: attempted.id
        }
      });
      throw new AppError(429, 'Too Many Requests', 'Tentativas esgotadas. Solicite um novo código.', {
        code: 'CHANNEL_LINK_ATTEMPTS_EXCEEDED',
        errors: { retryAfterSeconds: 0, attemptsRemaining: 0 }
      });
    }

    // Colapso deliberado: código errado, desafio inexistente, de outro usuário ou já consumido
    // devolvem o MESMO código e a MESMA frase.
    throw new AppError(400, 'Bad Request', 'Código inválido.', {
      code: 'CHANNEL_LINK_CODE_INVALID',
      errors: { attemptsRemaining: Math.max(0, attempted.maxAttempts - attempted.attemptCount) }
    });
  }

  let transactionResult: ConfirmTransactionResult;
  try {
    transactionResult = await repositories.withTransaction<ConfirmTransactionResult>(async (client) => {
      // (0) Serialização POR USUÁRIO. O lock de linha do telefone (passo 1) não fecha o TOCTOU do
      // teto: quando o número ainda não existe, o `for update` não trava nada e duas confirmações
      // concorrentes de telefones DIFERENTES leem o mesmo `count` e gravam as duas. Este lock é o
      // primeiro de todos — advisory antes de linha, sempre, para não abrir ciclo de deadlock.
      await repositories.lockChannelLinkUserScope(client, userId);

      // (1) Lock do vínculo pelo par (canal, telefone): serializa duas confirmações concorrentes.
      const lockedLink = await repositories.findConversationChannelLinkForUpdate(
        client,
        attempted.channelType,
        attempted.externalUserKey
      );

      const previousOwnerId = lockedLink?.userId || null;
      const alreadyMine = previousOwnerId === userId;
      const transferred = Boolean(previousOwnerId && !alreadyMine);

      // (2) Transferência de posse. Aqui apenas SINALIZAMOS: `withTransaction` faz rollback em
      // QUALQUER throw, então fechar o desafio aqui dentro e lançar em seguida desfaria o próprio
      // fechamento — o código continuaria vivo até o TTL, o índice único vivo seguiria ocupado e o
      // `outcome = 'conflict'` (única evidência de tentativa de tomada de posse) nunca seria gravado.
      // Nada foi escrito até este ponto, então o commit deste retorno é inócuo.
      if (transferred && !config.channelLinkAllowTransfer) {
        return { blocked: 'transfer' as const };
      }

      // (3) Teto de vínculos, reconferido sob o lock. Re-verificar um número que já é seu não conta.
      if (!alreadyMine) {
        const currentLinks = await repositories.countConversationChannelLinksByUser(
          client,
          userId,
          attempted.channelType
        );
        if (currentLinks >= Number(config.channelLinkMaxPerUser)) {
          // SINALIZAMOS em vez de lançar, pelo mesmo motivo do passo (2): `withTransaction` reverte
          // em QUALQUER throw, e a auditoria desta recusa (fail-soft, fora do seam transacional)
          // precisa sobreviver. Este era o ÚNICO caminho de recusa do fluxo sem trilha — uma conta
          // comprometida podia provar posse de N números e não deixar rastro nenhum.
          //
          // Nada foi escrito até aqui, então commitar este retorno é inócuo; e o desafio segue VIVO
          // (não fechamos nada), que é o que permite ao usuário remover um número e confirmar o
          // MESMO código em seguida.
          return { blocked: 'max_links' as const };
        }
      }

      // (4) Consumo EXCLUSIVO: quem devolve linha ganhou a corrida.
      const consumed = await repositories.closeChannelVerification(client, {
        id: attempted.id,
        userId,
        outcome: 'verified'
      });

      if (!consumed) {
        // Outra requisição com o mesmo código já consumiu. Se o vínculo resultante é do próprio
        // usuário, isto é sucesso IDEMPOTENTE — devolver erro aqui seria confuso e falso.
        if (lockedLink && lockedLink.userId === userId && lockedLink.verificationStatus === 'verified') {
          return { link: lockedLink, transferred: false, previousOwnerId: null, idempotent: true };
        }
        throw new AppError(400, 'Bad Request', 'Código inválido.', {
          code: 'CHANNEL_LINK_CODE_INVALID'
        });
      }

      // (5) Vínculo nasce já `verified`. Gravar `pending` no start deixaria qualquer conta OCUPAR a
      // linha única do telefone de outra pessoa só pedindo um código.
      const link = await repositories.claimConversationChannelLink(client, {
        id: lockedLink?.id || createPrefixedId('cclk'),
        channelType: attempted.channelType,
        externalUserKey: attempted.externalUserKey,
        userId,
        allowTransfer: Boolean(config.channelLinkAllowTransfer),
        metadata: { verifiedVia: 'otp', verificationId: attempted.id }
      });

      if (!link) {
        // O predicado do `on conflict` barrou a troca de dono — cinto de segurança do repositório.
        // Diferente do passo (2), o passo (4) JÁ fechou o desafio como `verified` nesta transação:
        // sinalizar por retorno commitaria um desafio "verificado" sem vínculo nenhum. Lançamos o
        // marcador para forçar o rollback e refazemos o fechamento correto (`conflict`) fora da
        // transação, onde ele sobrevive.
        throw new TransferBlockedSignal();
      }

      // (6) Os códigos que outras contas receberam para este número não valem mais nada.
      await repositories.closeLiveChannelVerificationsByPhoneExcept(client, {
        channelType: attempted.channelType,
        externalUserKey: attempted.externalUserKey,
        exceptUserId: userId,
        outcome: 'superseded'
      });

      return { link, transferred, previousOwnerId, idempotent: false };
    });
  } catch (error: unknown) {
    if (!(error instanceof TransferBlockedSignal)) throw error;
    throw await closeChallengeAsTransferConflict(attempted, userId, correlationId);
  }

  // Fora da transação: só aqui os efeitos colaterais das recusas (fechamento com `conflict`,
  // auditoria) são duráveis — lá dentro o throw que os acompanha reverteria os dois.
  if ('blocked' in transactionResult) {
    if (transactionResult.blocked === 'max_links') {
      throw await denyConfirmForMaxLinks(attempted, userId, correlationId);
    }
    throw await closeChallengeAsTransferConflict(attempted, userId, correlationId);
  }

  const outcome = transactionResult;

  if (!outcome.idempotent) {
    await recordChannelLinkAudit({
      actionType: 'channel_link.verified',
      actionStatus: 'succeeded',
      actorUserId: userId,
      correlationId,
      metadata: {
        channelType: attempted.channelType,
        phoneMasked: maskChannelUserKey(attempted.externalUserKey),
        verificationId: attempted.id
      }
    });

    if (outcome.transferred) {
      // `actor` = novo dono, `target` = dono anterior.
      await recordChannelLinkAudit({
        actionType: 'channel_link.reassigned',
        actionStatus: 'succeeded',
        actorUserId: userId,
        targetUserId: outcome.previousOwnerId,
        correlationId,
        metadata: {
          channelType: attempted.channelType,
          phoneMasked: maskChannelUserKey(attempted.externalUserKey),
          verificationId: attempted.id
        }
      });
    }
  }

  return {
    link: toChannelLinkDto(outcome.link),
    // Diz que o número estava em OUTRA conta — sem identificar o dono anterior. Informação que o
    // dono do telefone precisa, e inacessível a quem não tem o aparelho.
    transferred: outcome.transferred
  };
}

/**
 * Cancela o desafio vivo. Salva o caso mais comum do dia a dia: digitou o número errado e quer
 * voltar ao campo do telefone — sem isto a UI gastaria um `start` (mais uma mensagem paga) só para
 * corrigir um typo.
 */
export async function cancelChannelLinkChallengeService(
  userId: string,
  challengeId: string,
  rawQuery: LooseRecord = {},
  correlationId: string | null = null
) {
  const id = toTrimmedString(challengeId);
  if (!id) throw challengeNotFound();

  const reason = toTrimmedString(rawQuery.reason);
  const closed = await repositories.closeChannelVerification(null, {
    id,
    userId,
    outcome: 'cancelled',
    metadataPatch: reason ? { cancelReason: reason.slice(0, 40) } : {}
  });
  if (!closed) throw challengeNotFound();

  await recordChannelLinkAudit({
    actionType: 'channel_link.cancelled',
    actionStatus: 'succeeded',
    actorUserId: userId,
    reason: reason || null,
    correlationId,
    metadata: {
      channelType: closed.channelType,
      phoneMasked: maskChannelUserKey(closed.externalUserKey),
      verificationId: closed.id
    }
  });

  return { cancelled: true };
}

/**
 * Desvincula um número. Requisito de SEGURANÇA, não conveniência: a partir da fase 3 um `from`
 * verificado vira identidade e portanto acesso pleno à conta — o usuário precisa de revogação
 * imediata (aparelho roubado, chip devolvido à operadora, saída da empresa).
 *
 * Deliberadamente NÃO exige OTP nem step-up: quem trocou de número não recebe mais código no antigo,
 * e exigir prova de posse para REMOVER acesso deixaria vínculos zumbis vivos para sempre. Conceder
 * exige a credencial forte; retirar pode usar a fraca.
 */
export async function removeChannelLinkService(
  userId: string,
  linkId: string,
  correlationId: string | null = null
) {
  const id = toTrimmedString(linkId);
  if (!id) throw linkNotFound();

  const removed = await repositories.withTransaction(async (client) => {
    const link = await repositories.findConversationChannelLinkById(client, id, userId);
    if (!link) throw linkNotFound();

    const deleted = await repositories.deleteConversationChannelLinkById(client, id, userId);
    if (!deleted) throw linkNotFound();

    // Desvincular deixando um código válido circulando permitiria re-vincular logo em seguida.
    await repositories.closeLiveChannelVerificationsByUser(client, {
      userId,
      channelType: deleted.channelType,
      externalUserKey: deleted.externalUserKey,
      outcome: 'cancelled'
    });

    return deleted;
  });

  await recordChannelLinkAudit({
    actionType: 'channel_link.removed',
    actionStatus: 'succeeded',
    actorUserId: userId,
    correlationId,
    metadata: {
      channelType: removed.channelType,
      phoneMasked: maskChannelUserKey(removed.externalUserKey),
      linkId: removed.id
    }
  });

  return { removed: true };
}

// ---------------------------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------------------------

function challengeNotFound(): AppError {
  return new AppError(404, 'Not Found', 'Nenhum desafio pendente para este identificador.', {
    code: 'CHANNEL_LINK_CHALLENGE_NOT_FOUND'
  });
}

function linkNotFound(): AppError {
  return new AppError(404, 'Not Found', 'Vínculo não encontrado.', {
    code: 'CHANNEL_LINK_NOT_FOUND'
  });
}

async function findChannelLinkOfUserByPhone(
  userId: string,
  channelType: string,
  externalUserKey: string
) {
  const links = await repositories.listConversationChannelLinksByUser(null, userId, channelType);
  return links.find((link) => link.externalUserKey === externalUserKey) || null;
}

/**
 * Violação de índice único do Postgres (`23505`). O driver `pg` não expõe uma classe de erro por
 * SQLSTATE, então a checagem é pelo campo `code` — que também existe em erros de outra origem, daí a
 * comparação estrita com a string.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

/**
 * Escolhe APENAS a mensagem depois de o `update … returning` não ter devolvido linha. Consultar
 * ANTES reintroduziria o TOCTOU que o statement atômico acabou de fechar.
 *
 * `CODE_EXPIRED` e `ATTEMPTS_EXCEEDED` são seguros de distinguir porque falam do desafio do PRÓPRIO
 * autenticado; tudo o mais colapsa em `CODE_INVALID`.
 */
async function buildConfirmDisambiguationError(
  id: string,
  userId: string,
  correlationId: string | null
): Promise<AppError> {
  const existing = await repositories.findChannelVerificationById(null, id, userId);
  if (!existing) {
    return new AppError(400, 'Bad Request', 'Código inválido.', { code: 'CHANNEL_LINK_CODE_INVALID' });
  }

  const state = evaluateChallengeState(existing);

  if (state.status === 'expired') {
    await repositories.closeChannelVerification(null, { id: existing.id, userId, outcome: 'expired' });
    return new AppError(400, 'Bad Request', 'Código expirado. Solicite um novo.', {
      code: 'CHANNEL_LINK_CODE_EXPIRED'
    });
  }

  if (state.status === 'exhausted') {
    await repositories.closeChannelVerification(null, { id: existing.id, userId, outcome: 'exhausted' });
    await recordChannelLinkAudit({
      actionType: 'channel_link.failed',
      actionStatus: 'denied',
      actorUserId: userId,
      reason: 'attempts_exceeded',
      correlationId,
      metadata: {
        channelType: existing.channelType,
        phoneMasked: maskChannelUserKey(existing.externalUserKey),
        verificationId: existing.id
      }
    });
    return new AppError(429, 'Too Many Requests', 'Tentativas esgotadas. Solicite um novo código.', {
      code: 'CHANNEL_LINK_ATTEMPTS_EXCEEDED',
      errors: { retryAfterSeconds: 0, attemptsRemaining: 0 }
    });
  }

  // Consumido, ou qualquer outra coisa: mesma resposta de código errado.
  return new AppError(400, 'Bad Request', 'Código inválido.', { code: 'CHANNEL_LINK_CODE_INVALID' });
}

/**
 * Despacha e registra o resultado. Falha de envio FECHA o desafio: sem isso o índice único vivo fica
 * ocupado por um código que ninguém recebeu e o usuário trava até o TTL vencer sem entender por quê.
 */
async function dispatchAndRecord(
  challenge: ChannelVerificationRecord,
  code: string,
  userId: string,
  correlationId: string | null
): Promise<ChannelVerificationRecord> {
  try {
    const dispatch = await dispatchChannelLinkOtp({ to: challenge.externalUserKey, code });
    const updated = await repositories.markChannelVerificationDelivery(null, {
      id: challenge.id,
      // `sent` = "o provedor ACEITOU", nunca "chegou no aparelho". A UI jamais afirma entrega.
      deliveryStatus: 'sent',
      providerName: dispatch.providerName,
      providerMessageId: dispatch.providerMessageId
    });
    return updated || challenge;
  } catch (error: unknown) {
    // O telefone do desafio entra como "conhecido": é ele que o provedor ecoa FORMATADO.
    const deliveryError = sanitizeDeliveryError(error, challenge.externalUserKey);
    await repositories.markChannelVerificationDelivery(null, {
      id: challenge.id,
      deliveryStatus: 'failed',
      deliveryError
    });
    await repositories.closeChannelVerification(null, {
      id: challenge.id,
      userId,
      outcome: 'send_failed'
    });
    await recordChannelLinkAudit({
      actionType: 'channel_link.failed',
      actionStatus: 'failed',
      actorUserId: userId,
      reason: 'delivery_failed',
      correlationId,
      metadata: {
        channelType: challenge.channelType,
        phoneMasked: maskChannelUserKey(challenge.externalUserKey),
        verificationId: challenge.id,
        deliveryError
      }
    });

    // Canal desligado tem código próprio (503) e não deve virar 502.
    if (error instanceof AppError && error.code === 'WHATSAPP_CHANNEL_DISABLED') throw error;

    throw new AppError(
      502,
      'Bad Gateway',
      'Não foi possível enviar o código pelo WhatsApp. Tente novamente em instantes.',
      { code: 'CHANNEL_LINK_DELIVERY_FAILED', errors: { correlationId } }
    );
  }
}
