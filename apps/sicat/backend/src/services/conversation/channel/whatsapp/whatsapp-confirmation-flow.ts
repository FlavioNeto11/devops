/**
 * ORQUESTRAÇÃO DO FLUXO DE CONFIRMAÇÃO NO WHATSAPP (fase 5).
 *
 * Duas metades, e a invariante que as separa:
 *
 *  · **Emissão** (`tryIssueWhatsAppActionTicket`) — roda quando o turno voltou `blocked` com
 *    `CONFIRMATION_REQUIRED`. Congela `toolCall.name` + `toolCall.arguments` NA LINHA do ticket, junto
 *    dos snapshots de conta/sessão, e devolve a prévia com o código de 6 dígitos.
 *  · **Resgate** (`runWhatsAppConfirmationRescue`) — roda ANTES do planner, sem LLM. O servidor monta
 *    o `toolRequest` A PARTIR DO TICKET, com `confirmed: true`.
 *
 * ┌─ INVARIANTE CENTRAL DA FASE ──────────────────────────────────────────────────────────────────┐
 * │ O CLIENTE NOMEIA O TICKET (6 dígitos), NUNCA A FERRAMENTA. Nenhum caminho deste canal deriva   │
 * │ `toolRequest` do texto da pessoa — só da linha do ticket, que o servidor escreveu. É a mesma   │
 * │ invariante de `whatsapp-turn-service` ("o texto do usuário é DADO"), agora reescrita nestes    │
 * │ termos e coberta por teste. Se um dia `toolRequest` for derivado do texto aqui, é regressão de │
 * │ segurança, não refinamento.                                                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Todo este módulo só é alcançado com `WHATSAPP_ACTIONS_ENABLED=true` (disjuntor de ambiente, default
 * `false`). Com ele desligado, `whatsapp-turn-service` continua mandando `allowActions: false`, o
 * turno para em `ACTIONS_DISABLED` antes de `CONFIRMATION_REQUIRED`, e o canal é byte-a-byte o de hoje.
 */

import { config } from '../../../../lib/config.js';
import { findManifestById } from '../../../../repositories/manifest-repo.js';
import { evaluateConversationPolicy } from '../../conversation-policy-service.js';
import type { ConversationContext } from '../../conversation-context-service.js';
import type { ConversationPrincipal } from '../../conversation-principal.js';
import {
  getWhatsAppEligibleAction,
  resolveWhatsAppActionKey,
  resolveWhatsAppOutboundNoticeEnabled,
  type WhatsAppEligibleAction
} from './whatsapp-action-eligibility.js';
import type { WhatsAppConfirmationUtterance } from './whatsapp-confirmation-grammar.js';
import {
  buildManifestIdentityLabel,
  buildWhatsAppAlreadyUsedText,
  buildWhatsAppAttemptsExhaustedText,
  buildWhatsAppCancelledTicketText,
  buildWhatsAppConfirmationPreview,
  buildWhatsAppConfirmedText,
  buildWhatsAppConflictText,
  buildWhatsAppDeclinedText,
  buildWhatsAppDispatchBlockedText,
  buildWhatsAppDispatchRetryLead,
  buildWhatsAppExpiredTicketText,
  buildWhatsAppOtherPhoneTicketText,
  buildWhatsAppStepUpRequiredText,
  buildWhatsAppVagueYesText,
  buildWhatsAppWrongCodeText,
  collectActionManifestIds,
  extractConferibleItemLabels,
  WHATSAPP_N2_NOTICE_MISSING_TEXT
} from './whatsapp-confirmation-texts.js';
import {
  closeWhatsAppActionTicket,
  debitWhatsAppActionTicketSend,
  debitWhatsAppActionWindow,
  findLiveWhatsAppActionTicket,
  findLiveWhatsAppActionWindow,
  fingerprintActionArgs,
  inspectRecentWhatsAppActionTicket,
  issueWhatsAppActionTicket,
  patchWhatsAppActionTicketMetadata,
  redeemWhatsAppActionTicket,
  type IssuedWhatsAppActionTicket,
  type WhatsAppActionTicket,
  type WhatsAppBindingConflict
} from './whatsapp-action-ticket-service.js';

type LooseRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// Seam de leitura — SÓ para testes (mesmo molde de `setWhatsAppActionTicketRepositoriesForTests`)
// ---------------------------------------------------------------------------------------------

/**
 * A resolução da identidade conferível é a correção CENTRAL desta fase: sem ela nenhum intent de lote
 * emite ticket. Ela depende de uma leitura de banco (`findManifestById`), e um `import` estático torna
 * o caminho inteiro inalcançável por teste de unidade — a alternativa seria abrir conexão com o
 * Postgres dentro da suíte, ou não cobrir a entrega da fase. As duas são inaceitáveis.
 *
 * O override é TOTAL (`ConfirmationRepositories | null`), nunca `Partial`: um spread sobre o default
 * faria uma chave ausente cair no repositório REAL, e o desfecho do teste passaria a depender de haver
 * banco na máquina — a mesma armadilha que o seam do ticket-service documenta.
 */
export type ConfirmationRepositories = {
  findManifestById: typeof findManifestById;
};

const DEFAULT_CONFIRMATION_REPOSITORIES: ConfirmationRepositories = { findManifestById };

let confirmationRepositories: ConfirmationRepositories = DEFAULT_CONFIRMATION_REPOSITORIES;

export function setWhatsAppConfirmationRepositoriesForTests(overrides: ConfirmationRepositories | null): void {
  confirmationRepositories = overrides ?? DEFAULT_CONFIRMATION_REPOSITORIES;
}

export type ConfirmationTurnOutput = {
  status: string;
  responseText?: string;
  policy?: { reasonCode?: string | null } | null;
  toolCall?: { name: string; arguments: LooseRecord } | null;
  context?: { integrationAccountId?: string | null; sessionContextId?: string | null } | null;
  conversationSessionId?: string | null;
  conversationTurnId?: string | null;
  /** `ConversationStructuredResult` do turno. Só é lido para extrair `jobId` para a trilha. */
  result?: unknown;
};

export type ConfirmationFlowResult = {
  /** Texto ÚNICO. Quem chama passa pelo funil de higiene (`composeWhatsAppNotice`). */
  text: string;
  outcome: string;
  conversationTurnId?: string | null;
};

export type ConfirmationLink = { userId: string; externalUserKey: string };

export type ConfirmationFlowDependencies = {
  processTurn: (input: LooseRecord) => Promise<ConfirmationTurnOutput & LooseRecord>;
};

// ---------------------------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------------------------

/**
 * Manchete em português de operação. É o que a pessoa lê em negrito antes do código, e o que volta
 * em toda mensagem de erro do ticket — por isso vive numa tabela, não numa interpolação de intent.
 */
const ACTION_HEADLINES: Readonly<Record<string, (count: number) => string>> = Object.freeze({
  print_manifest: () => '2a via de 1 MTR',
  'manifest.batch_print_selected': (count) => `2a via de ${count} MTR${count === 1 ? '' : 's'}`,
  'manifest.replicate_segmented': (count) => `Replicar em ${count} rascunho${count === 1 ? '' : 's'}`,
  submit_manifest: () => 'Emitir 1 MTR na CETESB',
  'manifest.batch_submit_selected': (count) => `Emitir ${count} MTR${count === 1 ? '' : 's'} na CETESB`
});

export function buildActionHeadline(key: string, count: number): string | null {
  if (!Object.prototype.hasOwnProperty.call(ACTION_HEADLINES, key)) return null;
  return ACTION_HEADLINES[key]?.(Math.max(1, count)) ?? null;
}

const IRREVERSIBLE_WARNING =
  'Emitir cria o MTR de verdade. O unico jeito de desfazer e cancelar - e cancelar nao tem volta e nao da para fazer por aqui.';

/**
 * ┌─ A FASE ENTREGA N1. N2 NÃO SAI DAQUI, E O PORTÃO É DE CÓDIGO ─────────────────────────────────┐
 * │ O desenho condicionou `submit` ao aviso de conclusão: "se o aviso não entrar, N2 não é liberado│
 * │ e a fase entrega só N1". O aviso NÃO ENTROU — `whatsapp.outbound_notice` não existe como job,  │
 * │ handler ou chamada de saída; costurá-lo exige atravessar o dispatcher, fora do alcance desta   │
 * │ fase.                                                                                          │
 * │                                                                                                │
 * │ Por que uma CONSTANTE e não só `config.whatsappActionNoticeEnabled`: o flag é entrada de       │
 * │ ambiente. Ligá-lo liberaria emissão IRREVERSÍVEL na CETESB num canal onde o desfecho é         │
 * │ invisível — um `WHATSAPP_ACTION_NOTICE_ENABLED=true` num values.yaml, sem nada mais mudar,     │
 * │ abriria N2 inteiro. A env não pode conceder uma capacidade que o código não tem. Enquanto o job│
 * │ de aviso não existir, este literal é `false` e nenhuma configuração o contradiz.               │
 * │                                                                                                │
 * │ Quando o aviso entrar (fase 6): vire este literal, mantenha o flag como segundo portão e troque│
 * │ a promessa em `buildWhatsAppConfirmedText`. Os três andam JUNTOS.                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED = false;

/** Teto de itens resolvidos por prévia. Acima disso a lista já é "e mais N" e o custo é de banco. */
const MAX_RESOLVED_IDENTITY_ITEMS = 10;

/**
 * Emite o ticket a partir de um turno `blocked / CONFIRMATION_REQUIRED`.
 *
 * O TICKET SÓ É CRIADO DEPOIS DE TODAS AS GUARDAS PASSAREM — e "todas" inclui as que a policy NÃO
 * aplica na emissão. Chegar aqui garante permissão, conta CETESB e elegibilidade de canal; NÃO
 * garante o teto de lote, porque `BATCH_LIMIT_EXCEEDED` só é avaliado com `confirmed: true`, isto é,
 * depois de a pessoa digitar o código. Por isso a ordem desta função é, rigorosamente:
 *
 *   1. resolver a IDENTIDADE conferível (leitura, nenhuma escrita);
 *   2. conferir o teto de lote do canal;
 *   3. conferir a completude da identidade;
 *   4. [N2] conferir a janela;
 *   5. SÓ ENTÃO emitir, e renderizar a prévia.
 *
 * Nada é escrito enquanto o desfecho ainda puder ser "não emite". Nunca se faz alguém digitar um
 * código para receber um "não", e nunca se destrói um pedido pendente por uma tentativa que se
 * autocancela em seguida.
 *
 * `null` = não é caso de ticket (deixe o composer responder como hoje).
 */
export async function tryIssueWhatsAppActionTicket(input: {
  output: ConfirmationTurnOutput;
  principal: ConversationPrincipal;
  link: ConfirmationLink;
  correlationId: string | null;
}): Promise<ConfirmationFlowResult | null> {
  const toolCall = input.output.toolCall;
  if (!toolCall?.name) return null;

  const intent = typeof toolCall.arguments?.intent === 'string' ? toolCall.arguments.intent : '';
  const key = resolveWhatsAppActionKey(toolCall.name, intent);
  const eligible = getWhatsAppEligibleAction(key);
  if (!eligible) return null;

  const rawArgs = (toolCall.arguments || {}) as LooseRecord;

  // ── IDENTIDADE CONFERÍVEL, ANTES DE QUALQUER ESCRITA ──────────────────────────────────────────
  // Toda decisão que pode terminar em "não emite" acontece AQUI, antes de o banco ser tocado. A
  // versão anterior inseria a linha, montava a prévia, descobria que não havia rótulo e fechava o
  // ticket recém-criado como `cancelled`: duas linhas de lixo por tentativa e — muito pior — o
  // `superseded` do início já tinha DESTRUÍDO em silêncio o ticket legítimo que estava pendente.
  const identity = await resolveActionIdentity(rawArgs);
  const headline = buildActionHeadline(key, identity.effectCount || 1);
  if (!headline) return null;

  if (identity.effectCount > eligible.maxItems) {
    // TETO DE LOTE CONFERIDO NA EMISSÃO. A policy só avalia `BATCH_LIMIT_EXCEEDED` com
    // `confirmed: true`, ou seja, DEPOIS de a pessoa digitar o código — e o texto devolvido lá diz
    // "alguma coisa mudou no seu SICAT", que é falso: nada mudou, o pedido nunca foi admissível. É
    // aqui que `WHATSAPP_ELIGIBLE_ACTIONS.maxItems`, até então declarado e nunca lido, passa a valer.
    return {
      text: buildWhatsAppBatchTooLargeText({
        headline,
        requested: identity.effectCount,
        maxItems: eligible.maxItems
      }),
      outcome: 'whatsapp_inbound_action_batch_too_large'
    };
  }

  if (identity.labels.length === 0 || identity.labels.length !== identity.requestedCount) {
    // Duas recusas com a mesma causa: a prévia não consegue mostrar, item a item, o que será
    // executado. Zero rótulos é o caso óbvio. Rótulos DE MENOS é o traiçoeiro — listar 3 MTRs e
    // executar 5 é pior que não listar nenhum, porque parece conferência. Nenhum ticket é criado, e
    // a pessoa recebe a resposta de sempre (vai ao navegador), com o pedido pendente anterior
    // INTACTO.
    console.warn(
      `[whatsapp-confirm] identidade conferivel INCOMPLETA para "${key}" `
      + `(${identity.labels.length}/${identity.requestedCount}) — nenhum ticket criado.`
    );
    return null;
  }

  const labels = identity.labels;

  // ── N2: JANELA DE AÇÃO ────────────────────────────────────────────────────────────────────────
  let stepUpWindowId: string | null = null;
  let windowLine: string | null = null;
  if (eligible.tier === 'N2') {
    // PORTÃO DO N2, DE CÓDIGO: sem o aviso de conclusão, `submit` não sai — e nenhuma env o abre.
    // Ver `WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED` acima.
    if (!WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED || !resolveWhatsAppOutboundNoticeEnabled()) {
      return { text: WHATSAPP_N2_NOTICE_MISSING_TEXT, outcome: 'whatsapp_inbound_action_notice_missing' };
    }

    const window = await findLiveWhatsAppActionWindow(input.link);
    if (!window || window.actionsUsed >= window.actionsBudget) {
      // NENHUM TICKET É CRIADO: se não existe nada pendente, não existe nada que a vítima possa ser
      // induzida a confirmar.
      return {
        text: buildWhatsAppStepUpRequiredText(input.correlationId),
        outcome: 'whatsapp_inbound_stepup_required'
      };
    }
    if ((window.integrationAccountId ?? null) !== (input.principal.integrationAccountId ?? null)) {
      return {
        text: buildWhatsAppStepUpRequiredText(input.correlationId),
        outcome: 'whatsapp_inbound_stepup_account_mismatch'
      };
    }
    stepUpWindowId = window.id;
    windowLine = `Liberacao ativa - esta seria a ${window.actionsUsed + 1}a de ${window.actionsBudget} acoes.`;
  }

  // A PARTIR DAQUI a emissão está decidida. O `superseded` do ticket anterior (dentro de
  // `issueWhatsAppActionTicket`) só acontece porque um pedido novo, válido e conferível vai ocupar o
  // lugar dele — nunca mais por uma tentativa que se autocancela em seguida.
  const previous = await findLiveWhatsAppActionTicket(input.link);
  const frozenArgs = { ...rawArgs };

  const issued = await issueWhatsAppActionTicket({
    userId: input.link.userId,
    externalUserKey: input.link.externalUserKey,
    binding: {
      toolName: toolCall.name,
      intent,
      // `frozenArgs` continua sendo EXATAMENTE o que o LLM pediu: é o `toolRequest.arguments` do
      // despacho e a entrada do `argsFingerprint`. A identidade humana viaja ao lado, em `itemLabels`.
      frozenArgs,
      argsFingerprint: fingerprintActionArgs(frozenArgs),
      humanSummary: headline,
      itemLabels: labels,
      snapshotAccountId: input.principal.integrationAccountId,
      snapshotSessionContextId: input.principal.sessionContextId,
      conversationSessionId: input.output.conversationSessionId ?? null,
      riskTier: eligible.tier,
      itemCount: labels.length,
      previewCorrelationId: input.correlationId,
      stepUpWindowId
    }
  });
  if (!issued) return null;

  const preview = renderTicketPreview({
    issued,
    headline,
    labels,
    principal: input.principal,
    supersededSummary: previous?.humanSummary ?? null,
    windowLine,
    tier: eligible.tier
  });

  if (!preview) {
    // Rede de segurança, não caminho esperado: a decisão de não emitir já foi tomada lá em cima. Se
    // a prévia ainda assim não puder ser montada (código fora do formato), o ticket é descartado e o
    // fato é gritado no log — a alternativa seria deixar a pessoa com um pedido pendente que ela não
    // consegue confirmar e que, pelo índice único vivo, bloqueia qualquer pedido novo por 300 s.
    console.error(
      `[whatsapp-confirm] previa INESPERADAMENTE vazia para o ticket ${issued.ticket.id} — descartado. `
      + 'A guarda de identidade a montante deveria ter impedido a emissao.'
    );
    await closeWhatsAppActionTicket({ id: issued.ticket.id, userId: issued.ticket.userId, outcome: 'cancelled' });
    return null;
  }

  return {
    text: preview,
    outcome: 'whatsapp_inbound_confirmation_pending',
    conversationTurnId: input.output.conversationTurnId ?? null
  };
}

/** Ponto único de renderização da prévia — usado na emissão e na REEMISSÃO por falha de despacho. */
function renderTicketPreview(input: {
  issued: IssuedWhatsAppActionTicket;
  headline: string;
  labels: string[];
  principal: ConversationPrincipal;
  supersededSummary: string | null;
  windowLine: string | null;
  tier: WhatsAppEligibleAction['tier'];
}): string | null {
  return buildWhatsAppConfirmationPreview({
    headline: input.headline,
    items: input.labels.map((label) => ({ label })),
    accountLabel: resolveAccountLabel(input.principal),
    code: input.issued.code,
    ttlSeconds: resolveTtlSeconds(input.issued.ticket.expiresAt),
    ticketId: input.issued.ticket.id,
    supersededSummary: input.supersededSummary,
    windowLine: input.windowLine,
    irreversibleWarning: input.tier === 'N2' ? IRREVERSIBLE_WARNING : null
  });
}

type ActionIdentity = {
  /** Rótulos humanos, um por manifesto DISTINTO tocado. Só entra o que foi resolvido contra o banco. */
  labels: string[];
  /** Quantos manifestos distintos a ação toca. É o que a prévia precisa listar item a item. */
  requestedCount: number;
  /**
   * Quantos EFEITOS a ação produz. Igual a `requestedCount` na regra geral e diferente em
   * `manifest.replicate_segmented`, onde um mesmo manifesto de origem vira N rascunhos: lá o teto do
   * canal (e a manchete "Replicar em N rascunhos") falam de RÉPLICAS, não de origens.
   */
  effectCount: number;
};

/**
 * IDENTIDADE CONFERÍVEL A PARTIR DOS ARGUMENTOS REAIS DO ORQUESTRADOR.
 *
 * O que chega em `toolCall.arguments` é id interno (`man_<hex>`) em `manifestIds` /
 * `selectionSnapshot.selectedManifestIds` / `segments[].sourceManifestId` — nunca número de MTR. O
 * extrator de rótulos descarta id interno, e com razão; o defeito era descartar sem RESOLVER, o que
 * deixava todo intent de lote sem rótulo nenhum e, por consequência, sem prévia e sem ticket.
 *
 * Quem chama exige `labels.length === requestedCount`: resolver de menos é pior que não resolver,
 * porque listar 3 e executar 5 PARECE conferência.
 */
async function resolveActionIdentity(args: LooseRecord): Promise<ActionIdentity> {
  const manifestIds = collectActionManifestIds(args);
  const effectCount = Array.isArray(args.segments) && args.segments.length > 0
    ? args.segments.length
    : manifestIds.length;

  if (manifestIds.length === 0) {
    // Nenhum id: a ação foi nomeada por número (`manifestNumber`) ou por rótulo já pronto. O extrator
    // continua sendo a fonte, e continua descartando id interno.
    const labels = extractConferibleItemLabels(args);
    return { labels, requestedCount: labels.length, effectCount: effectCount || labels.length };
  }

  if (manifestIds.length > MAX_RESOLVED_IDENTITY_ITEMS) {
    // Acima do teto de resolução nem se consulta o banco: nenhum intent elegível tem `maxItems` perto
    // disso, então o desfecho já está decidido (lote excedido) e sem rótulo nenhum.
    return { labels: [], requestedCount: manifestIds.length, effectCount };
  }

  const labels: string[] = [];
  for (const manifestId of manifestIds) {
    const label = await resolveManifestLabel(manifestId);
    if (label) labels.push(label);
  }

  return { labels: [...new Set(labels)], requestedCount: manifestIds.length, effectCount };
}

/**
 * Um id interno vira "MTR 202600123456 - NOVA IT AMBIENTAL (12/03/2026)".
 *
 * Leitura LOCAL (`findManifestById`), nunca `getManifest`: aquele reconcilia estado e pode acionar o
 * gateway CETESB — uma chamada externa no meio da montagem de uma prévia, com o turno já bloqueado.
 * Falha de banco devolve `null`, e `null` faz a emissão ser recusada (fail-closed).
 */
async function resolveManifestLabel(manifestId: string): Promise<string | null> {
  try {
    const manifest = await confirmationRepositories.findManifestById(manifestId);
    if (!manifest) return null;

    const externalReference = asRecord(manifest.externalReference);
    const payload = asRecord(manifest.payload);
    const generator = asRecord(payload.generator);

    return buildManifestIdentityLabel({
      manifestNumber: toScalarString(externalReference.manNumero),
      generatorDescription: toScalarString(generator.description),
      expeditionDate: toScalarString(payload.expeditionDate)
    });
  } catch (error) {
    console.error(
      `[whatsapp-confirm] falha ao resolver a identidade do manifesto: ${(error as Error)?.message || 'desconhecida'}`
    );
    return null;
  }
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseRecord) : {};
}

function toScalarString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Lote acima do teto do CANAL. Diz o número real pedido e o teto — sem isso a pessoa não sabe em
 * quantos pedaços dividir.
 */
function buildWhatsAppBatchTooLargeText(input: {
  headline: string;
  requested: number;
  maxItems: number;
}): string {
  return [
    `Por aqui eu faço no maximo ${input.maxItems} por vez, e voce pediu ${input.requested} (*${input.headline}*). *Nada foi executado.*`,
    '',
    `Me peca em partes de ate ${input.maxItems}, ou faca de uma vez no SICAT pelo navegador.`
  ].join('\n');
}

/**
 * Rótulo da conta CETESB. O principal só carrega o id — sem NOME não se afirma a conta na prévia:
 * dizer "Conta CETESB: acct_9f2c" é pior que omitir, porque parece conferência e não é.
 */
function resolveAccountLabel(principal: ConversationPrincipal): string | null {
  const label = (principal as unknown as { integrationAccountLabel?: unknown }).integrationAccountLabel;
  return typeof label === 'string' && label.trim() ? label.trim() : null;
}

function resolveTtlSeconds(expiresAt: string | null): number {
  const parsed = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(parsed)) return 300;
  return Math.max(60, Math.round((parsed - Date.now()) / 1000));
}

// ---------------------------------------------------------------------------------------------
// Resgate
// ---------------------------------------------------------------------------------------------

/**
 * O TURNO DE RESGATE NÃO PASSA PELO LLM. `null` = a mensagem não é resgate (siga o fluxo normal).
 */
export async function runWhatsAppConfirmationRescue(input: {
  utterance: WhatsAppConfirmationUtterance;
  principal: ConversationPrincipal;
  link: ConfirmationLink;
  correlationId: string | null;
  dependencies: ConfirmationFlowDependencies;
}): Promise<ConfirmationFlowResult | null> {
  if (input.utterance.kind === 'none') return null;

  const live = await findLiveWhatsAppActionTicket(input.link);
  if (!live) {
    // ┌─ SEM TICKET VIVO ≠ SEM TICKET ────────────────────────────────────────────────────────────┐
    // │ `findLiveChannelVerificationByUser` filtra `consumed_at is null and expires_at > now()`.   │
    // │ Depois da queima ou dos 300 s a linha simplesmente SOME do find — e "sumiu" era tratado    │
    // │ como "isso é texto comum", jogando os 6 dígitos no planner. Consequências verificadas: as  │
    // │ frases obrigatórias ("ja foi usada as 14:32", "expirou e *nada foi executado*") eram       │
    // │ inalcançáveis, e o código em claro ia para o provedor de LLM e para os vetores do turno —  │
    // │ armazenamento durável, não trânsito.                                                       │
    // └────────────────────────────────────────────────────────────────────────────────────────────┘
    if (input.utterance.kind !== 'code') {
      // "sim"/"NAO" sem nada pendente são texto comum, e continuam sendo. `cancelar` isolado só
      // significa "desistir" QUANDO há algo pendente.
      return null;
    }
    return resolveDeadTicketOutcome(input.link);
  }

  if (input.utterance.kind === 'decline') {
    await closeWhatsAppActionTicket({ id: live.id, userId: live.userId, outcome: 'cancelled' });
    return { text: buildWhatsAppDeclinedText(), outcome: 'whatsapp_inbound_confirmation_declined' };
  }

  if (input.utterance.kind === 'vague_yes') {
    // NÃO conta tentativa de código — não pode consumir palpite. Gasta uma SAÍDA do ticket.
    if (await isTicketSendBudgetExhausted(live)) {
      return { text: '', outcome: 'whatsapp_inbound_confirmation_muted' };
    }
    return {
      text: buildWhatsAppVagueYesText({ headline: live.humanSummary }),
      outcome: 'whatsapp_inbound_confirmation_vague_yes'
    };
  }

  const verdict = await redeemWhatsAppActionTicket({
    code: input.utterance.code,
    context: {
      userId: input.principal.userId,
      externalUserKey: input.link.externalUserKey,
      integrationAccountId: input.principal.integrationAccountId,
      sessionContextId: input.principal.sessionContextId
    },
    confirmCorrelationId: input.correlationId,
    revalidate: (ticket) => revalidateTicket(ticket, input.principal, input.link)
  });

  switch (verdict.status) {
    case 'no_ticket':
      return null;
    case 'expired':
      return {
        text: buildWhatsAppExpiredTicketText({ headline: verdict.ticket.humanSummary, ttlSeconds: 300 }),
        outcome: 'whatsapp_inbound_confirmation_expired'
      };
    case 'already_used':
      return {
        text: buildWhatsAppAlreadyUsedText({ ticketId: verdict.ticket.id, usedAt: verdict.usedAt }),
        outcome: 'whatsapp_inbound_confirmation_replayed'
      };
    case 'attempts_exhausted':
      return {
        text: buildWhatsAppAttemptsExhaustedText(),
        outcome: 'whatsapp_inbound_confirmation_exhausted'
      };
    case 'wrong_code':
      // Código errado também é mensagem PAGA de saída: debita. Sem isto, quem erra (ou um número
      // comprometido em loop) recebe resposta de graça até o TTL.
      if (await isTicketSendBudgetExhausted(verdict.ticket)) {
        return { text: '', outcome: 'whatsapp_inbound_confirmation_muted' };
      }
      return {
        text: buildWhatsAppWrongCodeText({
          headline: verdict.ticket.humanSummary,
          attemptsRemaining: verdict.attemptsRemaining
        }),
        outcome: 'whatsapp_inbound_confirmation_wrong_code'
      };
    case 'conflict':
      return {
        text: buildWhatsAppConflictText({ conflict: verdict.conflict, ticketId: verdict.ticket.id }),
        outcome: 'whatsapp_inbound_confirmation_conflict'
      };
    case 'authorized':
      return dispatchConfirmedAction(verdict.ticket, input);
  }
}

/**
 * O DESFECHO DE UM CÓDIGO SEM TICKET VIVO.
 *
 * `null` só quando NÃO EXISTE linha recente deste usuário. Nesse caso os 6 dígitos são, de fato, texto
 * comum (uma quantidade, um número que ela leu em algum lugar) e recusá-los deterministicamente
 * tornaria o canal incapaz de responder sobre um número qualquer. O resíduo é estreito de propósito:
 * TODO código que este servidor emitiu deixa linha, então todo código REAL cai na classificação
 * acima — nenhum deles vira prompt de LLM.
 */
async function resolveDeadTicketOutcome(link: ConfirmationLink): Promise<ConfirmationFlowResult | null> {
  const recent = await inspectRecentWhatsAppActionTicket(link);

  switch (recent.status) {
    case 'none':
      return null;
    case 'other_phone':
      return {
        text: buildWhatsAppOtherPhoneTicketText(),
        outcome: 'whatsapp_inbound_confirmation_other_phone'
      };
    case 'already_used':
      return {
        text: buildWhatsAppAlreadyUsedText({ ticketId: recent.ticket.id, usedAt: recent.usedAt }),
        outcome: 'whatsapp_inbound_confirmation_replayed'
      };
    case 'attempts_exhausted':
      return {
        text: buildWhatsAppAttemptsExhaustedText(),
        outcome: 'whatsapp_inbound_confirmation_exhausted'
      };
    case 'cancelled':
      return {
        text: buildWhatsAppCancelledTicketText({ headline: recent.ticket.humanSummary }),
        outcome: 'whatsapp_inbound_confirmation_cancelled'
      };
    case 'conflict':
      return {
        text: buildWhatsAppConflictText({ conflict: 'unknown', ticketId: recent.ticket.id }),
        outcome: 'whatsapp_inbound_confirmation_conflict'
      };
    case 'expired':
      return {
        text: buildWhatsAppExpiredTicketText({
          headline: recent.ticket.humanSummary,
          // O prazo CONTRATADO, não o que sobrou (que é negativo — a linha já venceu). A frase é
          // "ela vale N minutos", explicando por que venceu.
          ttlSeconds: resolveConfiguredTtlSeconds()
        }),
        outcome: 'whatsapp_inbound_confirmation_expired'
      };
  }
}

/**
 * DÉBITO REAL DA SAÍDA PAGA. `true` = orçamento estourado, responda com SILÊNCIO.
 *
 * Antes isto era `live.sendCount >= live.maxSends` sobre um contador que NINGUÉM incrementava:
 * `insertChannelVerification` grava `send_count = 1` fixo e o único statement que somava era o do
 * reenvio de OTP de vínculo. `1 >= 4` é sempre falso, então o teto — nomeado no desenho como um dos
 * três freios contra a espiral de custo — nunca disparava: respondia-se a todo "sim" até o TTL.
 *
 * O `send_count < max_sends` agora mora no `where` do `update`, junto com o incremento: é o Postgres
 * que decide, não um `if` que duas mensagens concorrentes atravessam juntas.
 */
async function isTicketSendBudgetExhausted(ticket: WhatsAppActionTicket): Promise<boolean> {
  const verdict = await debitWhatsAppActionTicketSend({ id: ticket.id, userId: ticket.userId });
  if (verdict === 'exhausted') {
    console.warn(`[whatsapp-confirm] orcamento de saidas esgotado no ticket ${ticket.id} — silencio`);
    return true;
  }
  if (verdict === 'unmetered') {
    console.warn(`[whatsapp-confirm] saida do ticket ${ticket.id} NAO foi medida — respondendo assim mesmo`);
  }
  return false;
}

function resolveConfiguredTtlSeconds(): number {
  const seconds = Number(config.whatsappActionTicketTtlSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 300;
}

/**
 * REVALIDAÇÃO NA QUEIMA — nunca congelada na emissão.
 *
 * `evaluateConversationPolicy` roda DE NOVO, com `confirmed: true`: é isso que faz uma revogação no
 * AI Control Center alcançar tickets ainda não resgatados, apesar do cache de 30 s do registro de
 * runtime. E o débito da janela (N2) é atômico, com `attempt_count < max_attempts` no próprio `where`.
 */
async function revalidateTicket(
  ticket: WhatsAppActionTicket,
  principal: ConversationPrincipal,
  link: ConfirmationLink
): Promise<WhatsAppBindingConflict | null> {
  const decision = evaluateConversationPolicy({
    toolName: ticket.toolName,
    toolArgs: ticket.frozenArgs,
    channel: 'whatsapp',
    confirmed: true,
    allowActions: true,
    context: {
      channel: 'whatsapp',
      userId: principal.userId,
      integrationAccountId: principal.integrationAccountId,
      sessionContextId: principal.sessionContextId,
      channelSessionKey: principal.channelSessionKey,
      permissionKeys: principal.permissionKeys,
      requestedBy: principal.requestedBy,
      correlationId: ticket.previewCorrelationId || '',
      conversationSessionId: ticket.conversationSessionId || '',
      conversationTurnId: '',
      manifestId: null,
      jobId: null,
      auditCorrelationId: null,
      idempotencyKey: null,
      metadata: {}
    } satisfies ConversationContext
  });

  if (!decision.allowed) return 'policy_denied';

  if (ticket.riskTier === 'N2') {
    if (!ticket.stepUpWindowId) return 'window_missing';
    const window = await findLiveWhatsAppActionWindow(link);
    if (!window || window.id !== ticket.stepUpWindowId) return 'window_missing';
    if ((window.integrationAccountId ?? null) !== (principal.integrationAccountId ?? null)) return 'window_missing';
    const debited = await debitWhatsAppActionWindow({ id: window.id, userId: window.userId });
    if (!debited) return 'window_exhausted';
  }

  return null;
}

/**
 * DESPACHO. O `toolRequest` é montado AQUI, no servidor, a partir de `frozenArgs` — o texto da pessoa
 * (6 dígitos) nomeia o TICKET, nunca a ferramenta.
 *
 * ┌─ A QUEIMA VEM ANTES DO DESPACHO, E CONTINUA VINDO ────────────────────────────────────────────┐
 * │ A alternativa — despachar e só então queimar — admite EXECUÇÃO DUPLA: duas mensagens com o     │
 * │ mesmo código atravessariam o despacho antes de qualquer uma fechar a linha, e execução dupla é │
 * │ exatamente o defeito que este mecanismo existe para impedir. A ordem fica.                     │
 * │                                                                                                │
 * │ O que muda é o que acontece QUANDO O DESPACHO NÃO ACONTECE. Antes, o código só trocava a       │
 * │ mensagem: a linha ficava `verified` (que nesta sobrecarga semântica é lida como "executado") e │
 * │ a pessoa perdia a confirmação por uma falha que não era dela. Agora:                           │
 * │                                                                                                │
 * │  · o desfecho REAL do despacho é gravado em `metadata.dispatchStatus` (+ `dispatchedJobs`), de │
 * │    modo que `verified` deixa de ser prova de execução para quem lê a trilha;                   │
 * │  · falha NÃO-TERMINAL (`failed`: indisponibilidade, timeout) REEMITE o pedido automaticamente. │
 * │    Reemitir NÃO reabre janela de replay — o código antigo morreu com a linha, e o novo é outro │
 * │    segredo, com TTL, tentativas e orçamento próprios;                                          │
 * │  · falha TERMINAL (`blocked`: a política recusou) NÃO reemite. Remontar produziria o mesmo     │
 * │    "não" e faria a pessoa digitar um código para receber a recusa de novo.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
async function dispatchConfirmedAction(
  ticket: WhatsAppActionTicket,
  input: {
    principal: ConversationPrincipal;
    link: ConfirmationLink;
    correlationId: string | null;
    dependencies: ConfirmationFlowDependencies;
  }
): Promise<ConfirmationFlowResult> {
  const output = await input.dependencies.processTurn({
    body: {
      message: '',
      context: {},
      metadata: { source: 'whatsapp', confirmationTicketId: ticket.id },
      options: { allowActions: true },
      toolRequest: {
        name: ticket.toolName,
        arguments: ticket.frozenArgs,
        confirmed: true
      }
    },
    principal: input.principal,
    // O job HERDA o correlationId da PRÉVIA (onde a intenção foi formada, com a frase humana). Sem
    // esta costura a trilha PARTE EM DOIS.
    correlationId: ticket.previewCorrelationId || input.correlationId,
    headers: {},
    idempotencyKey: ticket.id,
    userContent: null,
    ingestManifest: null
  });

  if (output.status === 'blocked') {
    await recordDispatchOutcome(ticket, { dispatchStatus: 'blocked' });
    return {
      text: buildWhatsAppDispatchBlockedText({ ticketId: ticket.id }),
      outcome: 'whatsapp_inbound_confirmation_blocked',
      conversationTurnId: output.conversationTurnId ?? null
    };
  }

  if (output.status === 'failed') {
    await recordDispatchOutcome(ticket, { dispatchStatus: 'failed' });
    const retry = await reissueAfterFailedDispatch(ticket, input);
    return {
      text: retry,
      outcome: 'whatsapp_inbound_confirmation_failed',
      conversationTurnId: output.conversationTurnId ?? null
    };
  }

  await recordDispatchOutcome(ticket, {
    dispatchStatus: 'dispatched',
    dispatchedJobs: extractDispatchedJobIds(output.result)
  });

  return {
    text: buildWhatsAppConfirmedText({
      headline: ticket.humanSummary,
      itemCount: Math.max(1, ticket.itemCount),
      ticketId: ticket.id
    }),
    outcome: 'whatsapp_inbound_confirmation_executed',
    conversationTurnId: output.conversationTurnId ?? null
  };
}

/**
 * A LINHA DO TICKET É O LIVRO DE REGISTRO desta ação — `conversation_action_logs` passa por
 * `persistSafely`, que ENGOLE a exceção, e falha silenciosa não pode ser a prova de que alguém
 * autorizou uma ação externa. Sem este patch, `verified` seria a única coisa escrita, e `verified`
 * significa apenas QUEIMADO.
 */
async function recordDispatchOutcome(
  ticket: WhatsAppActionTicket,
  patch: { dispatchStatus: string; dispatchedJobs?: string[] }
): Promise<void> {
  await patchWhatsAppActionTicketMetadata({
    id: ticket.id,
    userId: ticket.userId,
    metadataPatch: {
      dispatchStatus: patch.dispatchStatus,
      dispatchedAt: new Date().toISOString(),
      ...(patch.dispatchedJobs && patch.dispatchedJobs.length > 0 ? { dispatchedJobs: patch.dispatchedJobs } : {})
    }
  });
}

/**
 * REEMISSÃO APÓS FALHA NÃO-TERMINAL. A identidade conferida é a MESMA (vem de `itemLabels`, congelada
 * na emissão) — não se resolve nada de novo contra o banco, então o que a pessoa confere é
 * exatamente o que ela já tinha conferido. O código é novo.
 *
 * Se a reemissão também falhar, a mensagem ainda diz o essencial: nada foi executado.
 */
async function reissueAfterFailedDispatch(
  ticket: WhatsAppActionTicket,
  input: { principal: ConversationPrincipal; link: ConfirmationLink; correlationId: string | null }
): Promise<string> {
  const lead = buildWhatsAppDispatchRetryLead({ headline: ticket.humanSummary });
  const askAgain = `\nMe peca de novo daqui a pouco que eu monto outra.\nProtocolo: ${ticket.id}`;

  // N2 NÃO é reemitido: o crédito da janela já foi debitado na queima e uma segunda confirmação o
  // debitaria de novo — duas ações de orçamento para uma ação executada. (Hoje N2 nem chega aqui:
  // ver `WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED`.)
  if (ticket.riskTier !== 'N1' || ticket.itemLabels.length === 0) {
    return `${lead}${askAgain}`;
  }

  const issued = await issueWhatsAppActionTicket({
    userId: input.link.userId,
    externalUserKey: input.link.externalUserKey,
    binding: {
      toolName: ticket.toolName,
      intent: ticket.intent,
      frozenArgs: ticket.frozenArgs,
      argsFingerprint: fingerprintActionArgs(ticket.frozenArgs),
      humanSummary: ticket.humanSummary,
      itemLabels: ticket.itemLabels,
      // Snapshot do contexto de AGORA: a amarração do ticket novo tem de valer contra o mundo em que
      // ele será resgatado, não contra o do ticket que falhou.
      snapshotAccountId: input.principal.integrationAccountId,
      snapshotSessionContextId: input.principal.sessionContextId,
      conversationSessionId: ticket.conversationSessionId,
      riskTier: ticket.riskTier,
      itemCount: ticket.itemCount,
      previewCorrelationId: input.correlationId,
      stepUpWindowId: null
    }
  });
  if (!issued) return `${lead}${askAgain}`;

  const preview = renderTicketPreview({
    issued,
    headline: ticket.humanSummary,
    labels: ticket.itemLabels,
    principal: input.principal,
    supersededSummary: null,
    windowLine: null,
    tier: 'N1'
  });
  if (!preview) {
    await closeWhatsAppActionTicket({ id: issued.ticket.id, userId: issued.ticket.userId, outcome: 'cancelled' });
    return `${lead}${askAgain}`;
  }

  return `${lead}${preview}`;
}

/**
 * Ids de job criados pelo despacho, para a trilha. Varredura RASA e limitada do resultado
 * estruturado: a pergunta que o suporte faz é "quais jobs esta confirmação despachou?", e a resposta
 * não pode depender de conhecer a forma exata de cada `ConversationStructuredResult`.
 */
function extractDispatchedJobIds(result: unknown): string[] {
  const found = new Set<string>();

  const walk = (value: unknown, depth: number): void => {
    if (found.size >= 20 || depth > 4 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 50)) walk(entry, depth + 1);
      return;
    }
    for (const [key, entry] of Object.entries(value as LooseRecord)) {
      if (key === 'jobId' && typeof entry === 'string' && entry.trim()) {
        found.add(entry.trim());
        continue;
      }
      walk(entry, depth + 1);
    }
  };

  walk(result, 0);
  return [...found];
}
