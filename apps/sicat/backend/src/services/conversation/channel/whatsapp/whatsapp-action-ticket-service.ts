/**
 * TICKET DE CONFIRMAÇÃO e JANELA DE AÇÃO — fase 5 da cadeia `whatsapp-channel-sicat`.
 *
 * ┌─ NÃO É TOKEN AUTOCONTIDO ─────────────────────────────────────────────────────────────────────┐
 * │ A restrição pedia server-side, uso único, TTL curto, amarrado a sessão + telefone + snapshot.  │
 * │ Uma LINHA no banco é o server-side mais forte que existe: o cliente não carrega o payload,     │
 * │ logo não há o que forjar. Uso único exigiria uma linha de qualquer jeito (para queimar); tendo │
 * │ a linha, a assinatura só provaria integridade de um payload que NÃO deveria estar na mão do    │
 * │ cliente. O telefone recebe 6 dígitos; o `toolRequest` é montado no SERVIDOR a partir da linha. │
 * │                                                                                                │
 * │ PROIBIDO `createAccessToken`/`verifyAccessToken` (`lib/sicat-security.ts`): o prefixo é a      │
 * │ constante FIXA `sicat_access` e `middlewares/sicat-auth.ts` valida apenas prefixo + assinatura │
 * │ + `exp` — um ticket mintado com o segredo de sessão seria, byte a byte, um Bearer válido para  │
 * │ aquele `sub`. Vazou o ticket, vazou a sessão.                                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ZERO DDL. Tudo vive em `conversation_channel_verifications` (migration 020, já existente),
 * discriminado por `channel_type`:
 *   · `whatsapp_action` — o ticket de confirmação;
 *   · `whatsapp_stepup` — a janela de ação (N2), aberta na sessão web autenticada.
 *
 * A 021 seria a SEGUNDA migration inédita rodando junto com a 020 num `migrate.ts` SEM advisory
 * lock, com `AUTO_MIGRATE` na api E no worker, ambos `Recreate` — CrashLoop simultâneo dos dois, não
 * "chat degradado". Emendar a 020 também está rejeitado: se algum ambiente já a aplicou,
 * `schema_migrations` registrou e a emenda nunca roda.
 *
 * O que a 020 já entrega e que este desenho usa inteiro:
 *   · índice único vivo `(channel_type, external_user_key, user_id) where consumed_at is null`
 *     → UM SÓ pedido pendente por telefone. É ELE, e não o código, que resolve a ambiguidade do "sim";
 *   · `closeChannelVerification` com `consumed_at is null` no `where` → uso único ATÔMICO
 *     (`rowCount = 1` ganhou a corrida, `rowCount = 0` perdeu e nada despacha);
 *   · `consumeChannelVerificationAttempt` com `consumed_at is null and expires_at > now() and
 *     attempt_count < max_attempts` DENTRO do `where` → TOCTOU fechado no SQL, não em `if`;
 *   · `metadata jsonb` livre e `correlation_id` já indexado.
 *
 * ⚠️ SOBRECARGA SEMÂNTICA CONSCIENTE: o CHECK de `outcome` é fechado (`verified|expired|exhausted|
 * cancelled|superseded|send_failed|conflict`) e não tem `executed`. Reusar `verified` para "ação
 * executada" é o preço de não criar a 021 — está documentado aqui e precisa estar no runbook, senão
 * confunde quem for ler a trilha.
 *
 * ⚠️ `sweepExpiredChannelVerifications` (repo) NÃO filtra `channel_type`: a higiene oportunista do
 * fluxo de VÍNCULO fecha tickets de ação e janelas expiradas como `expired`. É inócuo e até desejável
 * (é o desfecho correto), mas fica ESCRITO e coberto por teste — para não virar "bug" numa
 * investigação futura.
 *
 * ⚠️ `whatsapp_action`/`whatsapp_stepup` NÃO entram em `SUPPORTED_CHANNEL_TYPES` do
 * `conversation-channel-link-service`: `requireSupportedChannel` torna as rotas PÚBLICAS de vínculo
 * estruturalmente incapazes de ler ou fechar um ticket de ação.
 */

import { config } from '../../../../lib/config.js';
import { createPrefixedId } from '../../../../lib/ids.js';
import { hashPassword, hashTokenSha256, verifyPassword } from '../../../../lib/sicat-security.js';
import {
  closeChannelVerification,
  closeLiveChannelVerificationsByUser,
  consumeChannelVerificationAttempt,
  consumeChannelVerificationSend,
  findChannelVerificationById,
  findLiveChannelVerificationByUser,
  findRecentChannelVerificationByUser,
  insertChannelVerification,
  patchChannelVerificationMetadata,
  type ChannelVerificationOutcome,
  type ChannelVerificationRecord
} from '../../../../repositories/conversation-channel-verification-repo.js';
import { generateOtpCode } from '../../../conversation-channel-link-service.js';
import type { WhatsAppActionTier } from './whatsapp-action-eligibility.js';

type JsonObject = Record<string, unknown>;

export const WHATSAPP_ACTION_CHANNEL_TYPE = 'whatsapp_action';
export const WHATSAPP_STEPUP_CHANNEL_TYPE = 'whatsapp_stepup';

// ---------------------------------------------------------------------------------------------
// Seam de persistência — SÓ para testes (mesmo molde de `setChannelLinkRepositoriesForTests`)
// ---------------------------------------------------------------------------------------------

type TicketRepositories = {
  insertChannelVerification: typeof insertChannelVerification;
  findLiveChannelVerificationByUser: typeof findLiveChannelVerificationByUser;
  findRecentChannelVerificationByUser: typeof findRecentChannelVerificationByUser;
  findChannelVerificationById: typeof findChannelVerificationById;
  consumeChannelVerificationAttempt: typeof consumeChannelVerificationAttempt;
  consumeChannelVerificationSend: typeof consumeChannelVerificationSend;
  closeChannelVerification: typeof closeChannelVerification;
  closeLiveChannelVerificationsByUser: typeof closeLiveChannelVerificationsByUser;
  patchChannelVerificationMetadata: typeof patchChannelVerificationMetadata;
  now: () => number;
};

const DEFAULT_REPOSITORIES: TicketRepositories = {
  insertChannelVerification,
  findLiveChannelVerificationByUser,
  findRecentChannelVerificationByUser,
  findChannelVerificationById,
  consumeChannelVerificationAttempt,
  consumeChannelVerificationSend,
  closeChannelVerification,
  closeLiveChannelVerificationsByUser,
  patchChannelVerificationMetadata,
  now: () => Date.now()
};

/**
 * BASE DO SEAM QUANDO HÁ OVERRIDE — statements que um double de banco PARCIAL não implementa.
 *
 * `{ ...DEFAULT_REPOSITORIES, ...overrides }` faz uma chave AUSENTE no double cair no repositório
 * REAL: um teste de unidade abriria conexão com o Postgres sem dizer nada, e o desfecho passaria a
 * depender de haver ou não banco na máquina. Para estes três statements a base é INERTE, e cada
 * inércia é a resposta honesta de um armazenamento que não sabe responder:
 *
 *  · `findRecentChannelVerificationByUser` → `null` = "não há linha recente" (resposta correta de um
 *    armazenamento vazio);
 *  · `patchChannelVerificationMetadata` → `null`. O patch é TRILHA: não decide nada;
 *  · `consumeChannelVerificationSend` → `null`, que é INDISTINGUÍVEL de "orçamento estourado". Por
 *    isso quem lê o resultado NÃO é este spread: é `debitWhatsAppActionTicketSend`, que compara a
 *    função instalada com a inerte e devolve `unmetered` — ver lá o porquê de o teto de CUSTO ser
 *    fail-open.
 */
const INERT_SEND_DEBIT: TicketRepositories['consumeChannelVerificationSend'] = async () => null;

const INERT_REPOSITORIES: Pick<
  TicketRepositories,
  'findRecentChannelVerificationByUser' | 'consumeChannelVerificationSend' | 'patchChannelVerificationMetadata'
> = {
  findRecentChannelVerificationByUser: async () => null,
  consumeChannelVerificationSend: INERT_SEND_DEBIT,
  patchChannelVerificationMetadata: async () => null
};

let repositories: TicketRepositories = DEFAULT_REPOSITORIES;

export function setWhatsAppActionTicketRepositoriesForTests(
  overrides: Partial<TicketRepositories> | null
): void {
  repositories = overrides
    ? { ...DEFAULT_REPOSITORIES, ...INERT_REPOSITORIES, ...overrides }
    : DEFAULT_REPOSITORIES;
}

/**
 * FAIL-CLOSED COM LOG DISTINGUÍVEL.
 *
 * A 020 continua NÃO APLICADA. Se a tabela não existir, o canal não pode explodir com exceção
 * genérica (viraria retry + DLQ com o rastro da mensagem do usuário) nem, muito menos, executar a
 * ação sem confirmação. Recusa em silêncio para a pessoa, com log inconfundível para quem opera.
 */
function isMissingTableError(error: unknown): boolean {
  return String((error as { code?: unknown } | null)?.code || '') === '42P01';
}

/**
 * PONTO ÚNICO DE SAÍDA PARA `console.*` DESTE MÓDULO — e ele REDIGE dígitos.
 *
 * O código em claro só pode existir em DOIS lugares (o retorno da emissão e `code_hash`). A mensagem
 * de um erro do driver pode carregar o parâmetro que falhou, e um `console.error` cru publicaria o
 * código no log do worker — que é durável, exportado para o Loki e legível por quem opera. Toda
 * sequência de 4 a 12 dígitos vira `[redigido]` antes de sair: perde-se legibilidade de números de
 * MTR no log (que estão na trilha de auditoria, com o `correlationId`), ganha-se a garantia.
 */
function redactDigitRuns(message: string): string {
  return message.replace(/\d{4,12}/g, '[redigido]');
}

function logTicketDiagnostic(message: string): void {
  console.error(`[whatsapp-action-ticket] ${redactDigitRuns(message)}`);
}

function reportTicketFailure(stage: string, error: unknown): void {
  if (isMissingTableError(error)) {
    logTicketDiagnostic(
      `TABELA conversation_channel_verifications AUSENTE em "${stage}" — `
      + 'a migration 020 não foi aplicada. Ações pelo WhatsApp permanecem RECUSADAS (fail-closed).'
    );
    return;
  }
  logTicketDiagnostic(`falha em "${stage}": ${(error as Error)?.message || 'desconhecida'}`);
}

// ---------------------------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------------------------

/**
 * JSON canônico (chaves ordenadas, recursivo). É a entrada do `argsFingerprint`: sem ordenação, uma
 * releitura do jsonb com as chaves em outra ordem produziria impressão digital diferente e toda
 * confirmação legítima viraria `conflict`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const record = value as JsonObject;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function fingerprintActionArgs(args: JsonObject): string {
  return hashTokenSha256(canonicalJson(args));
}

function toJsonObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

// ---------------------------------------------------------------------------------------------
// Ticket de confirmação
// ---------------------------------------------------------------------------------------------

export type WhatsAppActionTicketBinding = {
  toolName: string;
  intent: string;
  /** Argumentos CONGELADOS. Nunca saem do servidor — o telefone só devolve 6 dígitos. */
  frozenArgs: JsonObject;
  argsFingerprint: string;
  humanSummary: string;
  /**
   * A IDENTIDADE QUE A PESSOA CONFERIU, resolvida na emissão e congelada com o resto.
   *
   * Os argumentos do LLM trazem id interno (`man_<hex>`), que não é conferível por ninguém. Os rótulos
   * humanos (número do MTR + gerador + data) são resolvidos ANTES da prévia e guardados aqui — não
   * dentro de `frozenArgs`, porque `frozenArgs` é literalmente o `toolRequest.arguments` do despacho e
   * a entrada do `argsFingerprint`: enfiar rótulo ali mudaria a chamada executada e a impressão
   * digital que detecta adulteração.
   *
   * Guardá-los é o que permite REMONTAR a mesma prévia (mesma identidade, código novo) sem uma segunda
   * ida ao banco — usado quando o despacho falha e o pedido precisa ser retomado.
   */
  itemLabels: string[];
  snapshotAccountId: string | null;
  snapshotSessionContextId: string | null;
  conversationSessionId: string | null;
  riskTier: WhatsAppActionTier;
  itemCount: number;
  previewCorrelationId: string | null;
  stepUpWindowId: string | null;
};

export type WhatsAppActionTicket = WhatsAppActionTicketBinding & {
  id: string;
  userId: string;
  externalUserKey: string;
  expiresAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  sendCount: number;
  maxSends: number;
};

function toTicket(record: ChannelVerificationRecord): WhatsAppActionTicket {
  const metadata = record.metadata || {};
  return {
    id: record.id,
    userId: record.userId,
    externalUserKey: record.externalUserKey,
    expiresAt: record.expiresAt,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    sendCount: record.sendCount,
    maxSends: record.maxSends,
    toolName: String(metadata.toolName || ''),
    intent: String(metadata.intent || ''),
    frozenArgs: toJsonObject(metadata.frozenArgs),
    argsFingerprint: String(metadata.argsFingerprint || ''),
    humanSummary: String(metadata.humanSummary || ''),
    itemLabels: toStringList(metadata.itemLabels),
    snapshotAccountId: toNullableString(metadata.snapshotAccountId),
    snapshotSessionContextId: toNullableString(metadata.snapshotSessionContextId),
    conversationSessionId: toNullableString(metadata.conversationSessionId),
    riskTier: metadata.riskTier === 'N2' ? 'N2' : 'N1',
    itemCount: Number(metadata.itemCount) || 0,
    previewCorrelationId: toNullableString(metadata.previewCorrelationId),
    stepUpWindowId: toNullableString(metadata.stepUpWindowId)
  };
}

export type IssuedWhatsAppActionTicket = {
  ticket: WhatsAppActionTicket;
  /**
   * O código em claro. Existe em EXATAMENTE DOIS lugares: este retorno (que vira a mensagem de saída)
   * e `code_hash` (scrypt COM salt). PROIBIDO em `audit_logs`, `conversation_action_logs`,
   * `metadata`, métricas, `jobs.payload` e `console.*`.
   */
  code: string;
};

// ---------------------------------------------------------------------------------------------
// GUARDAS DE EMISSÃO — três afirmações CENTRAIS do desenho, aplicadas na ORIGEM
// ---------------------------------------------------------------------------------------------

/**
 * TETO DURO DO TTL, em código.
 *
 * `config.whatsappActionTicketTtlSeconds` é entrada de AMBIENTE — um `WHATSAPP_ACTION_TICKET_TTL_
 * SECONDS=3153600000` (100 anos), ou um `expiresAt: null` chegando ao INSERT, esvaziaria a única
 * grandeza que limita a janela de resgate de uma ação irreversível. A validação NÃO confia no
 * chamador nem na env: o valor é clampado e, se ainda assim ficar fora da faixa, a emissão é
 * RECUSADA (fail-closed) em vez de emitir um ticket sem prazo.
 *
 * O piso existe pelo motivo oposto: um TTL de 1 s produziria um ticket que expira antes de a
 * mensagem chegar ao telefone — pedir código para um pedido já morto.
 */
export const WHATSAPP_TICKET_TTL_MIN_SECONDS = 30;
export const WHATSAPP_TICKET_TTL_MAX_SECONDS = 900;

/**
 * `null` = TTL inválido/ausente (recusa).
 *
 * Exportada para teste: o fallback de 300 s não tinha guarda, e trocá-lo por `0` fazia toda emissão
 * ser recusada (o valor cai fora da faixa) — perda silenciosa de capacidade, sem nada acusando.
 */
export function resolveTicketTtlMs(): number | null {
  const requested = Number(config.whatsappActionTicketTtlSeconds);
  const seconds = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 300;
  if (seconds < WHATSAPP_TICKET_TTL_MIN_SECONDS || seconds > WHATSAPP_TICKET_TTL_MAX_SECONDS) return null;
  return seconds * 1000;
}

/** O prazo REALMENTE PERSISTIDO cabe na faixa? `expiresAt` nulo/ilegível NUNCA cabe. */
function isTicketDeadlineWithinCeiling(expiresAt: string | null, nowMs: number): boolean {
  const parsed = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(parsed)) return false;
  const remainingMs = parsed - nowMs;
  return remainingMs > 0 && remainingMs <= WHATSAPP_TICKET_TTL_MAX_SECONDS * 1000;
}

/**
 * SNAPSHOT COMPLETO É PRÉ-CONDIÇÃO DE EMISSÃO.
 *
 * `checkWhatsAppTicketBinding` compara `snapshotAccountId`/`snapshotSessionContextId` com o contexto
 * VIVO — e `null === null` PASSA. Um ticket emitido sem snapshot é um ticket cuja amarração é
 * decorativa: ele valeria em qualquer conta CETESB que a pessoa viesse a selecionar dentro do TTL,
 * que é exatamente o erro de `pending-actions.ts` do ZapBridge que este módulo existe para não
 * repetir. A guarda tem de estar na ORIGEM: nenhuma checagem posterior distingue "não mudou" de
 * "nunca foi amarrado".
 */
function hasCompleteSnapshot(binding: Pick<WhatsAppActionTicketBinding, 'snapshotAccountId' | 'snapshotSessionContextId'>): boolean {
  return Boolean(toNullableString(binding.snapshotAccountId)) && Boolean(toNullableString(binding.snapshotSessionContextId));
}

/**
 * PONTO ÚNICO POR ONDE O `metadata` DO TICKET PASSA — e ele é uma ALLOWLIST, não um spread.
 *
 * `metadata: { ...binding }` copia o que estiver no objeto: qualquer campo acrescentado ao caminho de
 * emissão (inclusive o código em claro) desce para a coluna jsonb, que é durável, entra em dump e é
 * lida por quem investiga a fila. Enumerar os campos faz o vazamento ser IMPOSSÍVEL por construção.
 *
 * O tipo de RETORNO é `WhatsAppActionTicketBinding`, e é ele que fecha o buraco natural de toda
 * allowlist: campo novo no binding quebra o BUILD aqui (chave faltando) em vez de sumir em silêncio
 * da linha persistida, e o excess property check recusa qualquer chave que NÃO pertença ao binding —
 * inclusive uma chamada `code`.
 */
function buildTicketMetadata(binding: WhatsAppActionTicketBinding): WhatsAppActionTicketBinding {
  return {
    toolName: binding.toolName,
    intent: binding.intent,
    frozenArgs: binding.frozenArgs,
    argsFingerprint: binding.argsFingerprint,
    humanSummary: binding.humanSummary,
    itemLabels: binding.itemLabels,
    snapshotAccountId: binding.snapshotAccountId,
    snapshotSessionContextId: binding.snapshotSessionContextId,
    conversationSessionId: binding.conversationSessionId,
    riskTier: binding.riskTier,
    itemCount: binding.itemCount,
    previewCorrelationId: binding.previewCorrelationId,
    stepUpWindowId: binding.stepUpWindowId
  };
}

/**
 * Segunda barreira, independente da allowlist: o código EM CLARO não pode aparecer no jsonb.
 *
 * Colisão honesta existe — um código de 6 dígitos pode ser substring de um número de MTR de 12
 * (`202600481902` contém `481902`). Por isso o desfecho não é recusar: é SORTEAR OUTRO CÓDIGO. O
 * `metadata` é montado a partir do binding, que é anterior ao sorteio, então a coincidência some na
 * tentativa seguinte. Só depois de esgotadas as tentativas a emissão é recusada.
 */
export function metadataContainsCode(metadata: JsonObject, code: string): boolean {
  return canonicalJson(metadata).includes(code);
}

const CODE_COLLISION_MAX_ATTEMPTS = 5;

/**
 * Emite o ticket. Só é chamado DEPOIS de todas as guardas passarem (permissão, conta CETESB,
 * elegibilidade de canal, teto de lote e — no N2 — janela viva): nunca se faz alguém digitar um
 * código para receber um "não".
 *
 * Fecha como `superseded` qualquer ticket vivo anterior do mesmo par (telefone, usuário): o índice
 * único vivo não admite dois, e a troca é dita na PRIMEIRA linha da resposta — trocar em silêncio é
 * como se perde MTR.
 *
 * TRÊS RECUSAS PRÓPRIAS DA EMISSÃO, todas ANTES de tocar o banco (ver as guardas acima): snapshot
 * incompleto, TTL fora da faixa e código em claro no `metadata`. As três esvaziariam, na ORIGEM,
 * afirmações centrais do desenho — e nenhuma guarda posterior as percebe, porque comparar `null` com
 * `null` passa e um prazo de 100 anos é um prazo válido.
 */
export async function issueWhatsAppActionTicket(input: {
  userId: string;
  externalUserKey: string;
  binding: WhatsAppActionTicketBinding;
}): Promise<IssuedWhatsAppActionTicket | null> {
  if (!hasCompleteSnapshot(input.binding)) {
    logTicketDiagnostic(
      'emissão RECUSADA: snapshot de conta/sessão INCOMPLETO. Sem os dois valores a amarração do '
      + 'ticket é decorativa (comparar nulo com nulo passa) — nenhum ticket é criado.'
    );
    return null;
  }

  const ttlMs = resolveTicketTtlMs();
  if (ttlMs === null) {
    logTicketDiagnostic(
      `emissão RECUSADA: TTL do ticket fora da faixa [${WHATSAPP_TICKET_TTL_MIN_SECONDS}s, `
      + `${WHATSAPP_TICKET_TTL_MAX_SECONDS}s]. Confira WHATSAPP_ACTION_TICKET_TTL_SECONDS.`
    );
    return null;
  }

  const metadata = buildTicketMetadata(input.binding);

  let code = generateOtpCode();
  for (let attempt = 1; metadataContainsCode(metadata, code); attempt += 1) {
    if (attempt >= CODE_COLLISION_MAX_ATTEMPTS) {
      logTicketDiagnostic(
        'emissão RECUSADA: o código sorteado continua aparecendo no metadata do ticket depois de '
        + `${CODE_COLLISION_MAX_ATTEMPTS} tentativas — o código NUNCA é persistido em claro.`
      );
      return null;
    }
    code = generateOtpCode();
  }

  try {
    await repositories.closeLiveChannelVerificationsByUser(null, {
      userId: input.userId,
      channelType: WHATSAPP_ACTION_CHANNEL_TYPE,
      externalUserKey: input.externalUserKey,
      outcome: 'superseded'
    });

    const record = await repositories.insertChannelVerification(null, {
      id: createPrefixedId('cvfy'),
      channelType: WHATSAPP_ACTION_CHANNEL_TYPE,
      externalUserKey: input.externalUserKey,
      userId: input.userId,
      // scrypt COM salt, nunca sha256: a própria 020 documenta que 10^6 imagens são pré-computáveis
      // em menos de um segundo a partir de um dump.
      codeHash: hashPassword(code),
      maxAttempts: Math.max(1, Number(config.whatsappActionTicketMaxAttempts) || 3),
      maxSends: Math.max(1, Number(config.whatsappActionTicketMaxSends) || 4),
      expiresAt: new Date(repositories.now() + ttlMs).toISOString(),
      // O job da ação HERDA o correlationId da PRÉVIA — é onde a intenção foi formada, com a frase
      // humana. Sem esta costura a trilha PARTE EM DOIS: prévia e confirmação são mensagens
      // diferentes, com correlationIds diferentes.
      correlationId: input.binding.previewCorrelationId,
      metadata
    });

    if (!record) return null;

    // CONFERÊNCIA DO QUE FOI PERSISTIDO, não do que se pretendeu persistir. É a linha gravada que a
    // queima vai reler: se ela voltar sem prazo, com prazo fora do teto ou sem snapshot, o ticket é
    // descartado NA HORA — a pessoa recebe a recusa genérica e nada fica pendente.
    const ticket = toTicket(record);
    const persistedDeadlineOk = isTicketDeadlineWithinCeiling(ticket.expiresAt, repositories.now());
    if (!persistedDeadlineOk || !hasCompleteSnapshot(ticket)) {
      logTicketDiagnostic(
        'ticket DESCARTADO logo após a inserção: a linha persistida não tem prazo dentro do teto ou '
        + 'não tem snapshot completo. O que vale é o que foi gravado, não o que foi enviado.'
      );
      await closeWhatsAppActionTicket({ id: ticket.id, userId: ticket.userId, outcome: 'cancelled' });
      return null;
    }

    return { ticket, code };
  } catch (error) {
    reportTicketFailure('issue', error);
    return null;
  }
}

/** O ticket vivo do par (telefone, usuário). O índice único vivo garante no máximo um. */
export async function findLiveWhatsAppActionTicket(input: {
  userId: string;
  externalUserKey: string;
}): Promise<WhatsAppActionTicket | null> {
  try {
    const record = await repositories.findLiveChannelVerificationByUser(
      null,
      input.userId,
      WHATSAPP_ACTION_CHANNEL_TYPE,
      input.externalUserKey
    );
    return record ? toTicket(record) : null;
  } catch (error) {
    reportTicketFailure('find_live', error);
    return null;
  }
}

export async function closeWhatsAppActionTicket(input: {
  id: string;
  userId: string;
  outcome: ChannelVerificationOutcome;
  metadataPatch?: JsonObject;
}): Promise<boolean> {
  try {
    const closed = await repositories.closeChannelVerification(null, {
      id: input.id,
      userId: input.userId,
      outcome: input.outcome,
      metadataPatch: input.metadataPatch
    });
    return Boolean(closed);
  } catch (error) {
    reportTicketFailure('close', error);
    return false;
  }
}

/**
 * Acrescenta fatos ao `metadata` de um ticket JÁ FECHADO. Nunca decide nada — é trilha.
 *
 * `closeWhatsAppActionTicket` não serve: o `where` dele exige `consumed_at is null` (é o portão de
 * corrida da queima), então tudo que acontece DEPOIS da queima — a começar pelo desfecho do despacho —
 * não teria onde ser gravado.
 */
export async function patchWhatsAppActionTicketMetadata(input: {
  id: string;
  userId: string;
  metadataPatch: JsonObject;
}): Promise<boolean> {
  try {
    const patched = await repositories.patchChannelVerificationMetadata(null, input);
    return Boolean(patched);
  } catch (error) {
    reportTicketFailure('patch_metadata', error);
    return false;
  }
}

/**
 * Teto de SAÍDAS PAGAS do ticket. Três desfechos, e o terceiro é o honesto:
 *
 *  · `debited`   — o `update` devolveu linha: a saída cabe no orçamento e já foi cobrada;
 *  · `exhausted` — ZERO linhas com o statement REAL rodando: `send_count >= max_sends`. É o silêncio;
 *  · `unmetered` — não houve como medir. Ou o seam está com a base inerte (double de banco que não
 *    implementa o statement), ou o banco recusou a chamada.
 *
 * `unmetered` AUTORIZA a saída, e isto é decisão consciente: este teto é guarda de CUSTO, não de
 * autorização. Fechá-lo na dúvida transformaria uma indisponibilidade momentânea de banco em "o SICAT
 * emudeceu no meio de uma confirmação" — pior, para a pessoa no pátio, do que uma mensagem a mais.
 * O que NUNCA é fail-open é a queima do ticket, que continua exigindo `rowCount = 1`.
 */
export type WhatsAppSendBudgetVerdict = 'debited' | 'exhausted' | 'unmetered';

export async function debitWhatsAppActionTicketSend(input: {
  id: string;
  userId: string;
}): Promise<WhatsAppSendBudgetVerdict> {
  if (repositories.consumeChannelVerificationSend === INERT_SEND_DEBIT) return 'unmetered';
  try {
    const debited = await repositories.consumeChannelVerificationSend(null, input);
    return debited ? 'debited' : 'exhausted';
  } catch (error) {
    reportTicketFailure('debit_send', error);
    return 'unmetered';
  }
}

/**
 * JANELA DE LEITURA DA LINHA MORTA.
 *
 * Um ticket vive 300 s; a pergunta "esse código ainda vale?" chega minutos ou horas depois. 24 h é
 * generoso o bastante para cobrir quem só volta ao celular no dia seguinte, e curto o bastante para
 * que um ticket de semanas atrás não sequestre para sempre qualquer mensagem de 6 dígitos.
 */
const RECENT_TICKET_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * Desfecho de um código digitado quando NÃO HÁ ticket vivo. `none` é o único que devolve a fala ao
 * fluxo normal.
 */
export type WhatsAppRecentTicketVerdict =
  | { status: 'none' }
  | { status: 'other_phone'; ticket: WhatsAppActionTicket }
  | { status: 'expired'; ticket: WhatsAppActionTicket }
  | { status: 'already_used'; ticket: WhatsAppActionTicket; usedAt: string | null }
  | { status: 'attempts_exhausted'; ticket: WhatsAppActionTicket }
  | { status: 'cancelled'; ticket: WhatsAppActionTicket }
  | { status: 'conflict'; ticket: WhatsAppActionTicket };

/**
 * CLASSIFICA UM CÓDIGO SEM TICKET VIVO — o que `findLiveWhatsAppActionTicket` é incapaz de fazer.
 *
 * O `where` do `findLive` filtra `consumed_at is null and expires_at > now()`, então replay, expiração
 * e esgotamento produziam todos "não há ticket" — e "não há ticket" mandava os 6 dígitos para o
 * planner. Aqui a linha MORTA é lida e o desfecho é nomeado.
 *
 * ⚠️ A COMPARAÇÃO DE TELEFONE É DAQUI, não do `where`. `findRecentChannelVerificationByUser` busca por
 * usuário e tipo de canal SEM filtrar `external_user_key` exatamente para que esta linha exista e seja
 * matável por mutação. Um repositório que já filtrasse o telefone faria a guarda concordar consigo
 * mesma — a lição que esta cadeia pagou na fase 4.5 e repetiu na 5.
 */
export async function inspectRecentWhatsAppActionTicket(input: {
  userId: string;
  externalUserKey: string;
}): Promise<WhatsAppRecentTicketVerdict> {
  let record: ChannelVerificationRecord | null = null;
  try {
    record = await repositories.findRecentChannelVerificationByUser(null, {
      userId: input.userId,
      channelType: WHATSAPP_ACTION_CHANNEL_TYPE,
      maxAgeSeconds: RECENT_TICKET_WINDOW_SECONDS
    });
  } catch (error) {
    reportTicketFailure('find_recent', error);
    return { status: 'none' };
  }
  if (!record) return { status: 'none' };

  const ticket = toTicket(record);
  if (record.externalUserKey !== input.externalUserKey) return { status: 'other_phone', ticket };

  if (record.consumedAt) {
    switch (record.outcome) {
      case 'verified':
        return { status: 'already_used', ticket, usedAt: record.consumedAt };
      case 'exhausted':
        return { status: 'attempts_exhausted', ticket };
      case 'cancelled':
      case 'superseded':
      case 'send_failed':
        return { status: 'cancelled', ticket };
      case 'conflict':
        return { status: 'conflict', ticket };
      default:
        // `expired` (varredura oportunista) e qualquer outcome futuro: expirar é o desfecho seguro de
        // se dizer — afirma "nada foi executado", que é a única frase que a pessoa precisa ouvir.
        return { status: 'expired', ticket };
    }
  }

  // Viva no `select`, morta no `findLive`: o TTL virou entre as duas leituras.
  return { status: 'expired', ticket };
}

/** Contexto VIVO do turno de confirmação, contra o qual a amarração é conferida. */
export type WhatsAppRedeemContext = {
  userId: string;
  externalUserKey: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
};

export type WhatsAppRedeemVerdict =
  | { status: 'no_ticket' }
  | { status: 'expired'; ticket: WhatsAppActionTicket }
  | { status: 'already_used'; ticket: WhatsAppActionTicket; usedAt: string | null }
  | { status: 'attempts_exhausted'; ticket: WhatsAppActionTicket }
  | { status: 'wrong_code'; ticket: WhatsAppActionTicket; attemptsRemaining: number }
  | { status: 'conflict'; ticket: WhatsAppActionTicket; conflict: WhatsAppBindingConflict }
  | { status: 'authorized'; ticket: WhatsAppActionTicket };

export type WhatsAppBindingConflict =
  | 'account_changed'
  | 'session_changed'
  | 'phone_changed'
  | 'args_tampered'
  | 'window_missing'
  | 'window_exhausted'
  | 'policy_denied';

/**
 * AMARRAÇÃO CONFERIDA NO CONSUMO, contra o contexto VIVO.
 *
 * O erro do molde de `pending-actions.ts` do ZapBridge foi ASSINAR `chatJid` e nunca comparar
 * (`verifyPendingAction` só confere `userId`) — amarração decorativa. Aqui usuário e telefone vêm de
 * COLUNA (`user_id`, `external_user_key`, com FK), e conta/sessão/argumentos são conferidos campo a
 * campo contra o que vale AGORA.
 */
export function checkWhatsAppTicketBinding(
  ticket: WhatsAppActionTicket,
  context: WhatsAppRedeemContext
): WhatsAppBindingConflict | null {
  if (ticket.externalUserKey !== context.externalUserKey) return 'phone_changed';
  if ((ticket.snapshotAccountId ?? null) !== (context.integrationAccountId ?? null)) return 'account_changed';
  if ((ticket.snapshotSessionContextId ?? null) !== (context.sessionContextId ?? null)) return 'session_changed';
  if (ticket.argsFingerprint !== fingerprintActionArgs(ticket.frozenArgs)) return 'args_tampered';
  return null;
}

/**
 * ORDEM EXATA DA QUEIMA (o `where` é o guarda, não a intenção):
 *
 *  1. `findLiveChannelVerificationByUser` — o índice único devolve <= 1. O CÓDIGO SÓ É VERIFICADO,
 *     NUNCA USADO PARA LOCALIZAR;
 *  2. `consumeChannelVerificationAttempt` — atômico: cobra a tentativa e devolve `code_hash` no mesmo
 *     `update … returning`. Zero linhas = expirado / esgotado / já consumido;
 *  3. `verifyPassword` FORA de transação — scrypt é SÍNCRONO e, dentro, seguraria uma das 10 conexões
 *     do pool durante dezenas de ms (lição paga na fase 2);
 *  4. revalidação completa da amarração + `evaluateConversationPolicy` de novo, com `confirmed: true`
 *     (é o que faz uma revogação no AI Control Center alcançar tickets ainda não resgatados, apesar
 *     do cache de 30 s);
 *  5. [N2] débito atômico do crédito da janela;
 *  6. `closeChannelVerification('verified')` — `rowCount === 1` autoriza, `rowCount === 0` perdeu a
 *     corrida e NADA despacha.
 *
 * ⚠️ DESVIO ASSUMIDO DO DESENHO: a queima e o enfileiramento NÃO estão na mesma transação. O despacho
 * atravessa `processTurn` → dispatcher, que abre as próprias transações; envolvê-lo exigiria reescrever
 * o dispatcher, fora do escopo desta fase. A ordem escolhida é a FAIL-CLOSED: queima primeiro, despacha
 * depois. Uma falha no despacho deixa o ticket queimado e NADA executado (a pessoa pede de novo);
 * a ordem inversa — despachar e depois queimar — admitiria execução dupla, que é o defeito que este
 * mecanismo existe para impedir. Redes secundárias contra duplicata: `unique(jobs.command_id)` e
 * `ux_jobs_active_entity_operation`.
 */
export async function redeemWhatsAppActionTicket(input: {
  code: string;
  context: WhatsAppRedeemContext;
  /**
   * `correlationId` do turno da CONFIRMAÇÃO — mensagem de entrada própria, com id próprio. A coluna
   * `correlation_id` guarda o da PRÉVIA (por desenho, é ele que o job herda); sem gravar este aqui, o
   * protocolo que a pessoa tem em mãos ao responder "Confirmado" não leva a lugar nenhum.
   */
  confirmCorrelationId?: string | null;
  /** Revalidação de política/janela feita por quem tem o principal fresco. */
  revalidate: (ticket: WhatsAppActionTicket) => Promise<WhatsAppBindingConflict | null>;
}): Promise<WhatsAppRedeemVerdict> {
  const live = await findLiveWhatsAppActionTicket({
    userId: input.context.userId,
    externalUserKey: input.context.externalUserKey
  });
  if (!live) return { status: 'no_ticket' };

  let consumed: ChannelVerificationRecord | null = null;
  try {
    consumed = await repositories.consumeChannelVerificationAttempt(null, { id: live.id, userId: live.userId });
  } catch (error) {
    reportTicketFailure('consume_attempt', error);
    return { status: 'no_ticket' };
  }

  if (!consumed) {
    // `rowCount = 0` significa cinco coisas. Desambiguar é papel de um `select` POSTERIOR, que só
    // escolhe a MENSAGEM e nunca decide.
    const current = await safeFindById(live.id, live.userId);
    if (current?.consumedAt) {
      return { status: 'already_used', ticket: live, usedAt: current.consumedAt };
    }
    if (current && current.attemptCount >= current.maxAttempts) {
      return { status: 'attempts_exhausted', ticket: live };
    }
    return { status: 'expired', ticket: live };
  }

  const attemptsRemaining = Math.max(0, consumed.maxAttempts - consumed.attemptCount);

  // scrypt SÍNCRONO, fora de qualquer transação.
  if (!verifyPassword(input.code, consumed.codeHash)) {
    if (attemptsRemaining <= 0) {
      await closeWhatsAppActionTicket({ id: live.id, userId: live.userId, outcome: 'exhausted' });
      return { status: 'attempts_exhausted', ticket: live };
    }
    return { status: 'wrong_code', ticket: live, attemptsRemaining };
  }

  const bindingConflict = checkWhatsAppTicketBinding(live, input.context);
  if (bindingConflict) {
    await closeWhatsAppActionTicket({
      id: live.id,
      userId: live.userId,
      outcome: 'conflict',
      metadataPatch: { conflictReason: bindingConflict }
    });
    return { status: 'conflict', ticket: live, conflict: bindingConflict };
  }

  const revalidationConflict = await input.revalidate(live);
  if (revalidationConflict) {
    await closeWhatsAppActionTicket({
      id: live.id,
      userId: live.userId,
      outcome: 'conflict',
      metadataPatch: { conflictReason: revalidationConflict }
    });
    return { status: 'conflict', ticket: live, conflict: revalidationConflict };
  }

  const burned = await closeWhatsAppActionTicket({
    id: live.id,
    userId: live.userId,
    outcome: 'verified',
    // ⚠️ `verified` aqui significa QUEIMADO, não "executado" (o CHECK da 020 não tem `executed`).
    // Quem diz se a ação saiu é `dispatchStatus`, gravado DEPOIS do despacho por
    // `patchWhatsAppActionTicketMetadata`. Ler `verified` como execução é o erro que esta linha e o
    // runbook existem para não deixar acontecer.
    metadataPatch: {
      confirmedAt: new Date(repositories.now()).toISOString(),
      confirmCorrelationId: input.confirmCorrelationId ?? null,
      dispatchStatus: 'pending'
    }
  });
  if (!burned) {
    // Perdeu a corrida contra um "CONFIRMAR 482193" paralelo: o vencedor já despachou.
    return { status: 'already_used', ticket: live, usedAt: null };
  }

  return { status: 'authorized', ticket: live };
}

async function safeFindById(id: string, userId: string): Promise<ChannelVerificationRecord | null> {
  try {
    return await repositories.findChannelVerificationById(null, id, userId);
  } catch (error) {
    reportTicketFailure('find_by_id', error);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Janela de ação (N2) — `channel_type = 'whatsapp_stepup'`
// ---------------------------------------------------------------------------------------------

export type WhatsAppActionWindow = {
  id: string;
  userId: string;
  externalUserKey: string;
  integrationAccountId: string | null;
  expiresAt: string | null;
  /** Orçamento de ações: `attempt_count` consumido / `max_attempts` contratado. */
  actionsUsed: number;
  actionsBudget: number;
  openedFromSessionContextId: string | null;
  openedAt: string | null;
};

function toWindow(record: ChannelVerificationRecord): WhatsAppActionWindow {
  const metadata = record.metadata || {};
  return {
    id: record.id,
    userId: record.userId,
    externalUserKey: record.externalUserKey,
    integrationAccountId: toNullableString(metadata.integrationAccountId),
    expiresAt: record.expiresAt,
    actionsUsed: record.attemptCount,
    actionsBudget: record.maxAttempts,
    openedFromSessionContextId: toNullableString(metadata.openedFromSessionContextId),
    openedAt: record.createdAt
  };
}

export function clampWindowHours(value: unknown): number {
  const requested = Number(value);
  const fallback = Math.max(1, Number(config.whatsappActionWindowDefaultHours) || 4);
  const ceiling = Math.max(fallback, Number(config.whatsappActionWindowMaxHours) || 8);
  if (!Number.isFinite(requested) || requested <= 0) return fallback;
  return Math.min(Math.floor(requested), ceiling);
}

export function clampWindowBudget(value: unknown): number {
  const requested = Number(value);
  const fallback = Math.max(1, Number(config.whatsappActionWindowDefaultBudget) || 10);
  const ceiling = Math.max(fallback, Number(config.whatsappActionWindowMaxBudget) || 20);
  if (!Number.isFinite(requested) || requested <= 0) return fallback;
  return Math.min(Math.floor(requested), ceiling);
}

/**
 * Abre a janela. SÓ é chamada pela rota autenticada por Bearer (`sicatAuthMiddleware`) — é isso, e não
 * o código de 6 dígitos, que prova posse da credencial SICAT que o telefone roubado não tem.
 *
 * `code_hash` recebe `hashPassword(randomUUID())`: valor que NINGUÉM conhece e que nunca é enviado. A
 * coluna é NOT NULL e a janela não usa código — usar um valor conhecido seria criar um segredo à toa.
 */
export async function openWhatsAppActionWindow(input: {
  userId: string;
  externalUserKey: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  hours: number;
  budget: number;
  correlationId?: string | null;
}): Promise<WhatsAppActionWindow | null> {
  try {
    await repositories.closeLiveChannelVerificationsByUser(null, {
      userId: input.userId,
      channelType: WHATSAPP_STEPUP_CHANNEL_TYPE,
      externalUserKey: input.externalUserKey,
      outcome: 'superseded'
    });

    const record = await repositories.insertChannelVerification(null, {
      id: createPrefixedId('cvwn'),
      channelType: WHATSAPP_STEPUP_CHANNEL_TYPE,
      externalUserKey: input.externalUserKey,
      userId: input.userId,
      codeHash: hashPassword(`${createPrefixedId('nonce')}:${repositories.now()}`),
      maxAttempts: input.budget,
      maxSends: 1,
      expiresAt: new Date(repositories.now() + input.hours * 3600_000).toISOString(),
      correlationId: input.correlationId || null,
      metadata: {
        integrationAccountId: input.integrationAccountId,
        openedFromSessionContextId: input.sessionContextId,
        openedAt: new Date(repositories.now()).toISOString()
      }
    });

    return record ? toWindow(record) : null;
  } catch (error) {
    reportTicketFailure('open_window', error);
    return null;
  }
}

export async function findLiveWhatsAppActionWindow(input: {
  userId: string;
  externalUserKey: string;
}): Promise<WhatsAppActionWindow | null> {
  try {
    const record = await repositories.findLiveChannelVerificationByUser(
      null,
      input.userId,
      WHATSAPP_STEPUP_CHANNEL_TYPE,
      input.externalUserKey
    );
    return record ? toWindow(record) : null;
  } catch (error) {
    reportTicketFailure('find_window', error);
    return null;
  }
}

/**
 * Revogação. Lida do BANCO no momento da queima — instantânea, sem passar pelo cache de 30 s do
 * registro de runtime. É o primeiro botão de pânico do runbook.
 */
export async function revokeWhatsAppActionWindow(input: { id: string; userId: string }): Promise<boolean> {
  try {
    const closed = await repositories.closeChannelVerification(null, {
      id: input.id,
      userId: input.userId,
      outcome: 'cancelled'
    });
    return Boolean(closed);
  } catch (error) {
    reportTicketFailure('revoke_window', error);
    return false;
  }
}

/**
 * DÉBITO ATÔMICO do crédito. `consumeChannelVerificationAttempt` carrega `attempt_count <
 * max_attempts` DENTRO do `where` — orçamento estourado devolve ZERO linhas, e não um `if` que duas
 * confirmações concorrentes atravessam juntas.
 */
export async function debitWhatsAppActionWindow(input: {
  id: string;
  userId: string;
}): Promise<WhatsAppActionWindow | null> {
  try {
    const debited = await repositories.consumeChannelVerificationAttempt(null, { id: input.id, userId: input.userId });
    return debited ? toWindow(debited) : null;
  } catch (error) {
    reportTicketFailure('debit_window', error);
    return null;
  }
}
