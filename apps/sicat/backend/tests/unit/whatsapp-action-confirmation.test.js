import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { setConfigOverride } from '../../src/lib/config.js';
import { AppError } from '../../src/lib/problem.js';
import { hashPassword } from '../../src/lib/sicat-security.js';
import { evaluateConversationPolicy } from '../../src/services/conversation/conversation-policy-service.js';
import {
  applyRuntimePolicyOverlay,
  normalizeOverrideChannels,
  setRuntimeRegistryOverridesForTests
} from '../../src/services/ai-control/ai-runtime-registry-service.js';
import { listAddedExternalChannels } from '../../src/services/ai-control/ai-tool-admin-service.js';
import {
  CHANNEL_HARD_DENY,
  getWhatsAppEligibleAction,
  WHATSAPP_ELIGIBLE_ACTIONS,
  resolveEffectiveAllowChannels
} from '../../src/services/conversation/channel/whatsapp/whatsapp-action-eligibility.js';
import { parseWhatsAppConfirmationUtterance } from '../../src/services/conversation/channel/whatsapp/whatsapp-confirmation-grammar.js';
import {
  buildManifestIdentityLabel,
  buildWhatsAppConfirmationPreview,
  buildWhatsAppConfirmedText,
  buildWhatsAppN2NoticeMissingText,
  buildWhatsAppWrongCodeText,
  collectActionManifestIds,
  extractConferibleItemLabels,
  WHATSAPP_N2_NOTICE_MISSING_TEXT
} from '../../src/services/conversation/channel/whatsapp/whatsapp-confirmation-texts.js';
import {
  buildWhatsAppReceiveConference,
  setWhatsAppReceivePreviewRepositoriesForTests,
  WHATSAPP_RECEIVE_ACTION_KEY
} from '../../src/services/conversation/channel/whatsapp/whatsapp-receive-preview.js';
import { setWhatsAppCreatePreviewResolversForTests } from '../../src/services/conversation/channel/whatsapp/whatsapp-create-preview.js';
import {
  canonicalJson,
  checkWhatsAppTicketBinding,
  debitWhatsAppActionTicketSend,
  fingerprintActionArgs,
  findLiveWhatsAppActionWindow,
  inspectRecentWhatsAppActionTicket,
  issueWhatsAppActionTicket,
  openWhatsAppActionWindow,
  redeemWhatsAppActionTicket,
  revokeWhatsAppActionWindow,
  setWhatsAppActionTicketRepositoriesForTests,
  WHATSAPP_ACTION_CHANNEL_TYPE,
  WHATSAPP_STEPUP_CHANNEL_TYPE,
  WHATSAPP_TICKET_TTL_MAX_SECONDS,
  WHATSAPP_TICKET_TTL_MIN_SECONDS
} from '../../src/services/conversation/channel/whatsapp/whatsapp-action-ticket-service.js';
import { requireSupportedChannel } from '../../src/services/conversation-channel-link-service.js';
import {
  buildActionHeadline,
  runWhatsAppConfirmationRescue,
  setWhatsAppConfirmationRepositoriesForTests,
  tryIssueWhatsAppActionTicket,
  WHATSAPP_CREATE_ACTION_KEY
} from '../../src/services/conversation/channel/whatsapp/whatsapp-confirmation-flow.js';
import {
  runWhatsAppInboundTurn,
  resetWhatsAppExpiredNoticeThrottleForTests,
  resetWhatsAppInactiveNoticeThrottleForTests,
  setWhatsAppTurnDependenciesForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-turn-service.js';

/**
 * FASE 5 — confirmação server-side, step-up e liberação em runtime.
 *
 * REGRA DE ESCRITA DESTA SUÍTE (as lições que esta cadeia pagou caro — a última DENTRO da própria
 * fase 5, quando 24 de 54 mutações sobreviveram):
 *
 *  1. **Double que reimplementa a lógica testada concorda consigo mesmo.** Os doubles daqui são o
 *     BANCO (semântica de `where` do Postgres), o TURNO e o REPOSITÓRIO DE MANIFESTOS — nunca a
 *     decisão sob teste.
 *  2. **O double de busca de ticket MORTO devolve a linha CRUA.** `findRecentChannelVerificationByUser`
 *     NÃO filtra telefone — nem no Postgres (o `where` real não tem `external_user_key`), nem aqui.
 *     Quem compara telefone é o SERVICE, e é essa comparação que precisa morrer por mutação. Um double
 *     que já filtrasse tornaria a guarda invisível: foi exatamente isso que deixou `m03a`/`m03c` vivas.
 *  3. **Valores DISTINTOS POR IDENTIDADE.** A conta do ticket é `acc_TICKET`, a do principal vivo é
 *     `acc_LIVE`; o manifesto A tem outro número, outro gerador e outra data que o manifesto B; o
 *     principal devolve conjuntos de permissão DIFERENTES a cada chamada. Com o mesmo valor para
 *     todos, a troca de sujeito continua invisível.
 *  4. **CONTROLE NEGATIVO obrigatório.** Para cada guarda há um caso provando que o double CONSEGUE
 *     enxergar a diferença — senão o teste pode estar passando por construção.
 *  5. **Comentário e relato não são evidência.** Cada caso traz, no texto, qual mutação ele mata.
 */

/* ============================================================================================== */
/* Harness — DOUBLE DE BANCO (semântica do `where`), nunca da decisão                              */
/* ============================================================================================== */

const NOW = Date.parse('2026-08-07T12:00:00.000Z');

function makeVerificationStore() {
  const rows = new Map();
  let sequence = 0;

  const isLive = (row) => row.consumed_at === null && Date.parse(row.expires_at) > NOW;

  const toRecord = (row) => ({
    id: row.id,
    channelType: row.channel_type,
    externalUserKey: row.external_user_key,
    userId: row.user_id,
    codeHash: row.code_hash,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    sendCount: row.send_count,
    maxSends: row.max_sends,
    lastSentAt: null,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    outcome: row.outcome,
    deliveryStatus: 'pending',
    providerName: null,
    providerMessageId: null,
    deliveryError: null,
    correlationId: row.correlation_id,
    metadata: row.metadata,
    createdAt: new Date(row.created_at_ms).toISOString(),
    updatedAt: null
  });

  const api = {
    rows,
    closes: [],
    inserts: [],
    /** Espião das CHAMADAS ao statement de linha morta — usado para provar que ele não recebe telefone. */
    recentQueries: [],
    sendDebits: [],
    metadataPatches: [],
    /** Falhas injetadas por teste: `{ [statement]: Error }`. */
    failures: {},
    /** Transformação aplicada ao registro devolvido pelo INSERT (modela um banco que grava diferente). */
    mutateInsertedRecord: null,
    seed(row) {
      sequence += 1;
      const full = {
        consumed_at: null,
        outcome: null,
        attempt_count: 0,
        max_attempts: 3,
        send_count: 1,
        max_sends: 4,
        correlation_id: null,
        metadata: {},
        created_at_ms: NOW - 60_000 + sequence,
        ...row
      };
      rows.set(full.id, full);
      return full;
    },
    record: (id) => {
      const row = rows.get(id);
      return row ? toRecord(row) : null;
    },
    repositories: {
      now: () => NOW,
      insertChannelVerification: async (_client, input) => {
        if (api.failures.insert) throw api.failures.insert;
        api.inserts.push(input);
        const row = api.seed({
          id: input.id,
          channel_type: input.channelType,
          external_user_key: input.externalUserKey,
          user_id: input.userId,
          code_hash: input.codeHash,
          max_attempts: input.maxAttempts,
          max_sends: input.maxSends,
          expires_at: input.expiresAt,
          correlation_id: input.correlationId ?? null,
          metadata: input.metadata || {}
        });
        const record = toRecord(row);
        return api.mutateInsertedRecord ? api.mutateInsertedRecord(record, row) : record;
      },
      // `… where user_id = $1 and channel_type = $2 and consumed_at is null and expires_at > now()
      //  and ($3::text is null or external_user_key = $3)` — o telefone ESTÁ no `where` real, e por
      //  isso está aqui: o double é fiel ao Postgres, não conveniente para o teste.
      findLiveChannelVerificationByUser: async (_client, userId, channelType, externalUserKey = null) => {
        if (api.failures.findLive) throw api.failures.findLive;
        let best = null;
        for (const row of rows.values()) {
          if (row.user_id !== userId || row.channel_type !== channelType) continue;
          if (externalUserKey && row.external_user_key !== externalUserKey) continue;
          if (!isLive(row)) continue;
          if (!best || row.created_at_ms > best.created_at_ms) best = row;
        }
        return best ? toRecord(best) : null;
      },
      /**
       * A LINHA CRUA, viva ou morta. O `where` REAL é `user_id`, `channel_type` e a janela de idade —
       * e NADA MAIS. Reproduzir aqui um filtro de telefone que o Postgres não tem faria a guarda de
       * telefone do service concordar consigo mesma (lição `m03c`).
       */
      findRecentChannelVerificationByUser: async (_client, input) => {
        api.recentQueries.push(input);
        if (api.failures.findRecent) throw api.failures.findRecent;
        const floor = NOW - input.maxAgeSeconds * 1000;
        let best = null;
        for (const row of rows.values()) {
          if (row.user_id !== input.userId || row.channel_type !== input.channelType) continue;
          if (row.created_at_ms <= floor) continue;
          if (!best || row.created_at_ms > best.created_at_ms) best = row;
        }
        return best ? toRecord(best) : null;
      },
      findChannelVerificationById: async (_client, id, userId) => {
        const row = rows.get(id);
        return row && row.user_id === userId ? toRecord(row) : null;
      },
      // `attempt_count = attempt_count + 1 … where consumed_at is null and expires_at > now()
      //  and attempt_count < max_attempts returning *` — o TOCTOU fechado no SQL.
      consumeChannelVerificationAttempt: async (_client, { id, userId }) => {
        const row = rows.get(id);
        if (!row || row.user_id !== userId) return null;
        if (!isLive(row)) return null;
        if (row.attempt_count >= row.max_attempts) return null;
        row.attempt_count += 1;
        return toRecord(row);
      },
      // `send_count = send_count + 1 … where consumed_at is null and send_count < max_sends
      //  returning *` — o teto de CUSTO decidido pelo Postgres, não por um `if` em JS.
      consumeChannelVerificationSend: async (_client, { id, userId }) => {
        api.sendDebits.push({ id, userId });
        if (api.failures.debitSend) throw api.failures.debitSend;
        const row = rows.get(id);
        if (!row || row.user_id !== userId) return null;
        if (row.consumed_at !== null) return null;
        if (row.send_count >= row.max_sends) return null;
        row.send_count += 1;
        return toRecord(row);
      },
      // `… where id = $1 and (user_id) and consumed_at is null returning *` — o portão de corrida.
      closeChannelVerification: async (_client, { id, userId, outcome, metadataPatch }) => {
        api.closes.push({ id, outcome });
        const row = rows.get(id);
        if (!row) return null;
        if (userId && row.user_id !== userId) return null;
        if (row.consumed_at !== null) return null;
        row.consumed_at = new Date(NOW).toISOString();
        row.outcome = outcome;
        row.metadata = { ...row.metadata, ...(metadataPatch || {}) };
        return toRecord(row);
      },
      closeLiveChannelVerificationsByUser: async (_client, input) => {
        if (api.failures.closeLive) throw api.failures.closeLive;
        let count = 0;
        for (const row of rows.values()) {
          if (row.user_id !== input.userId || row.channel_type !== input.channelType) continue;
          if (input.externalUserKey && row.external_user_key !== input.externalUserKey) continue;
          if (row.consumed_at !== null) continue;
          row.consumed_at = new Date(NOW).toISOString();
          row.outcome = input.outcome;
          count += 1;
        }
        return count;
      },
      // `metadata = metadata || $3::jsonb where id = $1 and user_id = $2` — SEM `consumed_at is null`:
      // é o único statement capaz de registrar o que acontece DEPOIS da queima.
      patchChannelVerificationMetadata: async (_client, input) => {
        api.metadataPatches.push(input);
        const row = rows.get(input.id);
        if (!row || row.user_id !== input.userId) return null;
        row.metadata = { ...row.metadata, ...(input.metadataPatch || {}) };
        return toRecord(row);
      }
    }
  };

  return api;
}

/* ---------------------------------------------------------------------------------------------- */
/* DOUBLE DO REPOSITÓRIO DE MANIFESTOS — valores DISTINTOS POR IDENTIDADE                          */
/* ---------------------------------------------------------------------------------------------- */

/** Formato REAL de `createPrefixedId('man')`: prefixo + 26 hex. É o que o LLM põe em `manifestIds`. */
const MANIFEST_A = `man_${'a'.repeat(26)}`;
const MANIFEST_B = `man_${'b'.repeat(26)}`;
const MANIFEST_C = `man_${'c'.repeat(26)}`;
const MANIFEST_DESCONHECIDO = `man_${'f'.repeat(26)}`;

const LABEL_A = 'MTR 202600123456 - NOVA IT AMBIENTAL - 12/03/2026';
const LABEL_B = 'MTR 202600123457 - RECICLA SP LTDA - 13/03/2026';
const LABEL_C = 'MTR 202600123458 - TRANSPORTES ZETA - 14/03/2026';

function makeManifestStore() {
  const byId = new Map([
    [MANIFEST_A, {
      id: MANIFEST_A,
      externalReference: { manNumero: '202600123456' },
      payload: { generator: { description: 'NOVA IT AMBIENTAL' }, expeditionDate: '2026-03-12' }
    }],
    [MANIFEST_B, {
      id: MANIFEST_B,
      externalReference: { manNumero: '202600123457' },
      payload: { generator: { description: 'RECICLA SP LTDA' }, expeditionDate: '2026-03-13' }
    }],
    [MANIFEST_C, {
      id: MANIFEST_C,
      externalReference: { manNumero: '202600123458' },
      payload: { generator: { description: 'TRANSPORTES ZETA' }, expeditionDate: '2026-03-14' }
    }]
  ]);

  const api = {
    byId,
    lookups: [],
    failure: null,
    repositories: {
      findManifestById: async (id) => {
        api.lookups.push(id);
        if (api.failure) throw api.failure;
        return byId.get(id);
      }
    }
  };
  return api;
}

/* ---------------------------------------------------------------------------------------------- */

/** Captura `console.*` de um trecho. O código em claro não pode existir em log durável. */
async function captureConsole(fn) {
  const lines = [];
  const originals = { error: console.error, warn: console.warn, log: console.log };
  const sink = (...args) => { lines.push(args.map((value) => String(value)).join(' ')); };
  console.error = sink;
  console.warn = sink;
  console.log = sink;
  try {
    const value = await fn();
    return { value, lines, text: lines.join('\n') };
  } finally {
    Object.assign(console, originals);
  }
}

const TICKET_ARGS = { intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_A, MANIFEST_B] };

/** Metadados do ticket. Conta `acc_TICKET` — DISTINTA da conta do principal vivo (`acc_LIVE`). */
function ticketMetadata(overrides = {}) {
  const frozenArgs = overrides.frozenArgs ?? TICKET_ARGS;
  return {
    toolName: 'orchestrate_manifest_operation',
    intent: 'manifest.batch_print_selected',
    frozenArgs,
    argsFingerprint: fingerprintActionArgs(frozenArgs),
    humanSummary: '2a via de 2 MTRs',
    itemLabels: [LABEL_A, LABEL_B],
    snapshotAccountId: 'acc_TICKET',
    snapshotSessionContextId: 'sess_TICKET',
    conversationSessionId: 'csess_1',
    riskTier: 'N1',
    itemCount: 2,
    previewCorrelationId: 'corr_preview',
    stepUpWindowId: null,
    ...overrides
  };
}

const CODE = '481902';
const PHONE = '5511987654321';
const OUTRO_PHONE = '5511911112222';

function seedLiveTicket(store, overrides = {}) {
  return store.seed({
    id: 'cvfy_live',
    channel_type: 'whatsapp_action',
    external_user_key: PHONE,
    user_id: 'usr_1',
    code_hash: hashPassword(CODE),
    expires_at: new Date(NOW + 300_000).toISOString(),
    metadata: ticketMetadata(overrides.metadata),
    ...overrides.row
  });
}

/** Linha MORTA (consumida) — a que só `findRecentChannelVerificationByUser` enxerga. */
function seedDeadTicket(store, { outcome, externalUserKey = PHONE, consumedAt = new Date(NOW - 120_000).toISOString(), metadata } = {}) {
  return store.seed({
    id: `cvfy_dead_${outcome}_${externalUserKey}`,
    channel_type: 'whatsapp_action',
    external_user_key: externalUserKey,
    user_id: 'usr_1',
    code_hash: hashPassword(CODE),
    expires_at: new Date(NOW + 180_000).toISOString(),
    consumed_at: consumedAt,
    outcome,
    metadata: ticketMetadata(metadata)
  });
}

function seedWindow(store, overrides = {}) {
  return store.seed({
    id: 'cvwn_live',
    channel_type: 'whatsapp_stepup',
    external_user_key: PHONE,
    user_id: 'usr_1',
    code_hash: hashPassword('nonce'),
    expires_at: new Date(NOW + 4 * 3600_000).toISOString(),
    attempt_count: 0,
    max_attempts: 10,
    max_sends: 1,
    metadata: { integrationAccountId: 'acc_TICKET', openedFromSessionContextId: 'sess_TICKET' },
    ...overrides
  });
}

/** Contexto VIVO. `acc_LIVE` ≠ `acc_TICKET` de propósito — ver a lição 3 no cabeçalho. */
function liveContext(overrides = {}) {
  return {
    userId: 'usr_1',
    externalUserKey: PHONE,
    integrationAccountId: 'acc_TICKET',
    sessionContextId: 'sess_TICKET',
    ...overrides
  };
}

const TODAS_AS_PERMISSOES = [
  'manifest.read',
  'manifest.print',
  'manifest.submit',
  'manifest.cancel',
  'manifest.replicate',
  'manifest.create',
  'manifest.receive',
  'audit.read'
];

function buildPrincipal(overrides = {}) {
  return {
    channel: 'whatsapp',
    userId: 'usr_1',
    integrationAccountId: 'acc_TICKET',
    sessionContextId: 'sess_TICKET',
    channelSessionKey: `whatsapp:${PHONE}`,
    permissionKeys: ['manifest.read', 'manifest.print', 'manifest.submit'],
    requestedBy: 'whatsapp:+55 11 9••••-4321',
    ...overrides
  };
}

const LINK = { userId: 'usr_1', externalUserKey: PHONE };

/** Overlay de runtime que LIGA um intent do orquestrador no WhatsApp (o botão do AI Control Center). */
function enableIntentOnWhatsApp(intent, extra = {}) {
  setRuntimeRegistryOverridesForTests([
    {
      id: `ait_${intent}`,
      toolName: 'orchestrate_manifest_operation',
      category: 'orchestrator',
      objective: '',
      dependencies: [],
      schemaJson: null,
      defaultPolicyJson: {
        intents: { [intent]: { allowChannels: ['whatsapp', 'native_chat', 'inapp'] } },
        ...extra
      },
      enabled: true,
      source: 'db',
      activeVersionId: null
    }
  ]);
}

function enableToolOnWhatsApp(toolName) {
  setRuntimeRegistryOverridesForTests([
    {
      id: `ait_${toolName}`,
      toolName,
      category: 'action',
      objective: '',
      dependencies: [],
      schemaJson: null,
      defaultPolicyJson: { allowChannels: ['whatsapp', 'native_chat', 'inapp'] },
      enabled: true,
      source: 'db',
      activeVersionId: null
    }
  ]);
}

/* ============================================================================================== */

describe('fase 5 — elegibilidade (código) × habilitação (runtime)', () => {
  it('MUTAÇÃO (d): um PATCH de admin não reabre cancelamento pelo WhatsApp', () => {
    // Um admin (ou um clique errado, ou uma sessão comprometida) manda `allowChannels:['whatsapp']`
    // em `cancel_manifest`. Quem barra AQUI é a ausência da chave em `WHATSAPP_ELIGIBLE_ACTIONS`:
    // remover a condição `getWhatsAppEligibleAction(input.key)` da adição faz `whatsapp` entrar e
    // este caso quebra.
    const efetivo = resolveEffectiveAllowChannels({
      key: 'cancel_manifest',
      codeChannels: ['native_chat', 'inapp'],
      overlayChannels: ['whatsapp', 'native_chat', 'inapp']
    });
    assert.deepEqual(efetivo, ['native_chat', 'inapp']);
  });

  it('MUTAÇÃO (d2): a recusa permanente cobre a SEGUNDA porta — default de código que traga `whatsapp`', () => {
    // A ordem "recusa por último" não é observável com as listas disjuntas (ver o comentário do
    // módulo). O que a recusa cobre de fato é este caso: alguém acrescenta `whatsapp` ao default de
    // CÓDIGO de uma ação recusada. Apagar o bloco `isWhatsAppHardDenied` faz `whatsapp` sobreviver e
    // este caso quebra.
    const efetivo = resolveEffectiveAllowChannels({
      key: 'manifest.create_draft',
      codeChannels: ['whatsapp', 'native_chat', 'inapp'],
      overlayChannels: null
    });
    assert.deepEqual(efetivo, ['native_chat', 'inapp']);
  });

  it('o overlay ADICIONA canal externo apenas onde o CÓDIGO declara elegibilidade', () => {
    const elegivel = resolveEffectiveAllowChannels({
      key: 'manifest.batch_print_selected',
      codeChannels: ['native_chat', 'inapp'],
      overlayChannels: ['whatsapp', 'native_chat', 'inapp']
    });
    assert.deepEqual(elegivel, ['whatsapp', 'native_chat', 'inapp']);

    // `manifest.create_draft` não está em `WHATSAPP_ELIGIBLE_ACTIONS` (e está na recusa): o MESMO
    // overlay não adiciona nada. Elegibilidade não se inventa em runtime.
    //
    // ⚠️ Esta testemunha ERA `manifest.receive_with_receipt` até a unidade D4 promovê-la. Trocar a
    // testemunha faz parte da promoção: manter a antiga aqui transformaria o caso num teste que
    // afirma o contrário do desenho novo.
    const inelegivel = resolveEffectiveAllowChannels({
      key: 'manifest.create_draft',
      codeChannels: ['native_chat', 'inapp'],
      overlayChannels: ['whatsapp', 'native_chat', 'inapp']
    });
    assert.deepEqual(inelegivel, ['native_chat', 'inapp']);
  });

  it('MUTAÇÃO (d3): a ELEGIBILIDADE é o teto — chave nem elegível nem recusada NÃO ganha canal externo', () => {
    // A testemunha que faltava. Com `cancel_manifest` (recusa permanente) a guarda de elegibilidade
    // pode ser apagada sem nenhum teste vermelho: `CHANNEL_HARD_DENY` remove `whatsapp` logo em
    // seguida e o desfecho é o mesmo. Quem SÓ a elegibilidade protege é a maioria silenciosa — as
    // ações que não estão em nenhuma das duas listas. `manifest.replicate_with_patch` é ação R3,
    // ausente das duas: um PATCH que peça `whatsapp` nela é elevação de privilégio em canal externo,
    // e a única coisa entre ela e o WhatsApp é `getWhatsAppEligibleAction`.
    for (const key of ['manifest.replicate_with_patch', 'manifest.preview_create_from_payload', 'list_manifests']) {
      assert.equal(getWhatsAppEligibleAction(key), null, `${key} entrou na tabela de elegíveis`);
      assert.equal(CHANNEL_HARD_DENY.has(key), false, `${key} está na recusa — não serve de testemunha`);
      assert.deepEqual(
        resolveEffectiveAllowChannels({
          key,
          codeChannels: ['native_chat', 'inapp'],
          overlayChannels: ['whatsapp', 'native_chat', 'inapp']
        }),
        ['native_chat', 'inapp'],
        `${key}: o overlay adicionou whatsapp a uma chave INELEGÍVEL`
      );
    }

    // CONTROLE NEGATIVO: a chave elegível, com o MESMO overlay, ganha o canal.
    assert.ok(
      resolveEffectiveAllowChannels({
        key: 'manifest.batch_print_selected',
        codeChannels: ['native_chat', 'inapp'],
        overlayChannels: ['whatsapp', 'native_chat', 'inapp']
      }).includes('whatsapp')
    );
  });

  it('o overlay pode RESTRINGIR (revogação nunca é bloqueada)', () => {
    const efetivo = resolveEffectiveAllowChannels({
      key: 'list_manifests',
      codeChannels: ['whatsapp', 'native_chat', 'inapp'],
      overlayChannels: ['inapp']
    });
    assert.deepEqual(efetivo, ['inapp']);
  });

  it('as duas listas são DISJUNTAS e a recusa tem os OITO nomes por extenso', () => {
    for (const key of Object.keys(WHATSAPP_ELIGIBLE_ACTIONS)) {
      assert.equal(CHANNEL_HARD_DENY.has(key), false, `${key} está elegível E recusado`);
    }
    // `manifest.create_draft` é a armadilha silenciosa: `requiresConfirmation:false` + `isAction:true`.
    // Precisa estar EXPLÍCITO na recusa, nunca por omissão — e continuou lá depois da unidade D4,
    // porque prévia de conferência não ajuda numa ação que nunca PEDE conferência.
    assert.equal(CHANNEL_HARD_DENY.has('manifest.create_draft'), true);

    // Eram dez até a D4 promover recebimento e criação. O número é conferido para que uma promoção
    // futura seja uma DECISÃO escrita neste arquivo, nunca um efeito colateral de outra mudança.
    assert.equal(CHANNEL_HARD_DENY.size, 8);
    assert.deepEqual(
      [...CHANNEL_HARD_DENY].sort(),
      [
        'cancel_manifest',
        'cdf.download_batch_selected',
        'cdf.generate_from_manifest_selection',
        'enqueue_cdf_download',
        'manifest.batch_cancel_selected',
        'manifest.cancel_recent_excluding_first',
        'manifest.create_draft',
        'replicate_manifest'
      ]
    );
  });
});

/* ============================================================================================== */
/* N3 — RECUSA EM CÓDIGO, uma sonda POR AÇÃO                                                       */
/* ============================================================================================== */

describe('fase 5 — N3: cada ação recusada tem sonda própria, e nenhum PATCH a libera', () => {
  const context = {
    channel: 'whatsapp',
    userId: 'usr_1',
    integrationAccountId: 'acc_TICKET',
    sessionContextId: 'sess_TICKET',
    channelSessionKey: `whatsapp:${PHONE}`,
    permissionKeys: TODAS_AS_PERMISSOES,
    requestedBy: 'whatsapp:masked',
    correlationId: 'corr_n3',
    conversationSessionId: 'csess_1',
    conversationTurnId: 'cturn_1',
    manifestId: null,
    jobId: null,
    auditCorrelationId: null,
    idempotencyKey: null,
    metadata: {}
  };

  /** Quais das dez chaves são TOOL DIRETA e quais são INTENT do orquestrador. */
  const DIRECT_TOOLS = new Set(['cancel_manifest', 'enqueue_cdf_download', 'replicate_manifest']);

  afterEach(() => {
    setConfigOverride('whatsappActionsEnabled', undefined);
    setRuntimeRegistryOverridesForTests(null);
  });

  it('a lista de sondas cobre a recusa INTEIRA — nem uma chave a menos', () => {
    // Se alguém acrescentar uma 11a chave à recusa sem sonda, este caso quebra e obriga a escrevê-la.
    const cobertas = new Set([...DIRECT_TOOLS, ...[...CHANNEL_HARD_DENY].filter((key) => !DIRECT_TOOLS.has(key))]);
    assert.equal(cobertas.size, CHANNEL_HARD_DENY.size);
    for (const key of CHANNEL_HARD_DENY) assert.equal(cobertas.has(key), true, key);
  });

  for (const key of CHANNEL_HARD_DENY) {
    it(`N3 "${key}": inelegível por código, e o AI Control Center NÃO a libera`, () => {
      // (1) ELEGIBILIDADE: a chave não está na tabela que o operador pode ligar.
      assert.equal(getWhatsAppEligibleAction(key), null, `${key} virou elegível — N3 é recusa de código`);

      // (2) RESOLUÇÃO DE CANAIS: nem overlay que pede `whatsapp`, nem default de código que já o
      // traga, sobrevivem. As duas portas, no mesmo caso.
      assert.equal(
        resolveEffectiveAllowChannels({
          key,
          codeChannels: ['native_chat', 'inapp'],
          overlayChannels: ['whatsapp', 'native_chat', 'inapp']
        }).includes('whatsapp'),
        false,
        `${key}: o overlay do AI Control Center adicionou whatsapp`
      );
      assert.equal(
        resolveEffectiveAllowChannels({
          key,
          codeChannels: ['whatsapp', 'native_chat', 'inapp'],
          overlayChannels: null
        }).includes('whatsapp'),
        false,
        `${key}: um default de CÓDIGO com whatsapp sobreviveu`
      );
    });

    it(`N3 "${key}": a POLICY recusa mesmo com o disjuntor ligado e a tool liberada em runtime`, () => {
      setConfigOverride('whatsappActionsEnabled', true);

      const isDirect = DIRECT_TOOLS.has(key);
      if (isDirect) {
        enableToolOnWhatsApp(key);
      } else {
        enableIntentOnWhatsApp(key, { allowChannels: ['whatsapp', 'native_chat', 'inapp'] });
      }

      const decision = evaluateConversationPolicy({
        toolName: isDirect ? key : 'orchestrate_manifest_operation',
        toolArgs: isDirect ? { manifestId: MANIFEST_A } : { intent: key, manifestIds: [MANIFEST_A] },
        channel: 'whatsapp',
        confirmed: true,
        allowActions: true,
        context
      });

      assert.equal(decision.allowed, false, `${key} foi PERMITIDA no WhatsApp`);
      // `CHANNEL_BLOCKED`, não `CHANNEL_NOT_ENABLED`: o segundo significaria "elegível, falta ligar",
      // que é exatamente a afirmação que o N3 nega. Trocar um pelo outro aqui é regressão de desenho.
      assert.equal(decision.reasonCode, 'CHANNEL_BLOCKED', key);
    });
  }

  it('CONTROLE NEGATIVO: o mesmo overlay LIBERA o que é elegível — a sonda não passa por construção', () => {
    // Sem este caso, "tudo bloqueado" poderia ser efeito de o overlay não estar sendo aplicado.
    setConfigOverride('whatsappActionsEnabled', true);
    enableIntentOnWhatsApp('manifest.batch_print_selected');

    const liberado = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: { intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_A] },
      channel: 'whatsapp',
      confirmed: false,
      allowActions: true,
      context
    });
    assert.equal(liberado.reasonCode, 'CONFIRMATION_REQUIRED', 'o intent elegível passou do gate de canal');
  });
});

describe('fase 5 — isolamento estrutural das rotas PÚBLICAS de vínculo', () => {
  it('`whatsapp_action` e `whatsapp_stepup` NÃO são canais de vínculo — as rotas nem conseguem tocá-los', () => {
    // `requireSupportedChannel` roda em TODA rota de `/v1/sicat/channel-links`. Acrescentar os dois
    // discriminadores a `SUPPORTED_CHANNEL_TYPES` daria ao fluxo público de OTP a capacidade de LER e
    // FECHAR ticket de ação e janela de step-up — que é exatamente o que este isolamento impede.
    for (const channelType of [WHATSAPP_ACTION_CHANNEL_TYPE, WHATSAPP_STEPUP_CHANNEL_TYPE]) {
      assert.throws(
        () => requireSupportedChannel(channelType),
        (error) => {
          assert.equal(error.status, 400);
          assert.equal(error.code, 'CHANNEL_LINK_CHANNEL_UNSUPPORTED');
          return true;
        },
        channelType
      );
    }
    assert.equal(requireSupportedChannel('whatsapp'), 'whatsapp');
  });

  it('os dois discriminadores são DISTINTOS entre si e do canal de vínculo', () => {
    const tipos = new Set(['whatsapp', WHATSAPP_ACTION_CHANNEL_TYPE, WHATSAPP_STEPUP_CHANNEL_TYPE]);
    assert.equal(tipos.size, 3, 'colidir faria o índice único vivo misturar ticket, janela e vínculo');
  });
});

describe('fase 5 — endurecimento do overlay de runtime', () => {
  const CODE_DEFAULT = {
    riskLevel: 'R3',
    allowChannels: ['native_chat', 'inapp'],
    requiresConfirmation: true,
    isAction: true
  };

  it('MUTAÇÃO (h): `requiresConfirmation:false` vindo do overlay é IGNORADO', () => {
    const efetiva = applyRuntimePolicyOverlay(
      { requiresConfirmation: false, riskLevel: 'R1', isAction: false },
      CODE_DEFAULT,
      'submit_manifest'
    );
    assert.equal(efetiva.requiresConfirmation, true, 'sem confirmação não há ticket, e sem ticket a mensagem executa direto');
    assert.equal(efetiva.riskLevel, 'R3', 'riskLevel vem SEMPRE do default de código');
    assert.equal(efetiva.isAction, true, 'isAction vem SEMPRE do default de código');
  });

  it('`requiresConfirmation:true` do overlay é aceito — o overlay só endurece', () => {
    const efetiva = applyRuntimePolicyOverlay(
      { requiresConfirmation: true },
      { ...CODE_DEFAULT, requiresConfirmation: false },
      'list_manifests'
    );
    assert.equal(efetiva.requiresConfirmation, true);
  });

  it('canal desconhecido no jsonb é descartado — e nunca substitui a lista', () => {
    assert.equal(normalizeOverrideChannels(['whatsap', 'telegram']), null);
    assert.deepEqual(normalizeOverrideChannels(['WhatsApp', 'inapp']), ['whatsapp', 'inapp']);

    const efetiva = applyRuntimePolicyOverlay({ allowChannels: ['telegram'] }, CODE_DEFAULT, 'print_manifest');
    assert.deepEqual(efetiva.allowChannels, ['native_chat', 'inapp']);
  });

  it('ADICIONAR canal externo é detectado pela rota (que passa a exigir confirmed:true); REMOVER não', () => {
    assert.deepEqual(listAddedExternalChannels(['native_chat', 'inapp'], ['whatsapp', 'inapp']), ['whatsapp']);
    // Revogar é botão de pânico: não pede confirmação.
    assert.deepEqual(listAddedExternalChannels(['whatsapp', 'inapp'], ['inapp']), []);
  });
});

describe('fase 5 — policy: CHANNEL_NOT_ENABLED, recusa permanente e tool direta', () => {
  const context = {
    channel: 'whatsapp',
    userId: 'usr_1',
    integrationAccountId: 'acc_TICKET',
    sessionContextId: 'sess_TICKET',
    channelSessionKey: `whatsapp:${PHONE}`,
    permissionKeys: ['manifest.read', 'manifest.print', 'manifest.submit', 'manifest.cancel', 'manifest.replicate'],
    requestedBy: 'whatsapp:masked',
    correlationId: 'corr_1',
    conversationSessionId: 'csess_1',
    conversationTurnId: 'cturn_1',
    manifestId: null,
    jobId: null,
    auditCorrelationId: null,
    idempotencyKey: null,
    metadata: {}
  };

  afterEach(() => {
    setConfigOverride('whatsappActionsEnabled', undefined);
    setRuntimeRegistryOverridesForTests(null);
  });

  it('com o disjuntor DESLIGADO, o desfecho é byte-a-byte o de hoje (CHANNEL_BLOCKED)', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'print_manifest',
      channel: 'whatsapp',
      confirmed: true,
      allowActions: true,
      context
    });
    assert.equal(decision.reasonCode, 'CHANNEL_BLOCKED');
  });

  it('com o disjuntor LIGADO, ação ELEGÍVEL e não habilitada vira CHANNEL_NOT_ENABLED', () => {
    setConfigOverride('whatsappActionsEnabled', true);
    const decision = evaluateConversationPolicy({
      toolName: 'print_manifest',
      channel: 'whatsapp',
      confirmed: true,
      allowActions: true,
      context
    });
    assert.equal(decision.reasonCode, 'CHANNEL_NOT_ENABLED');
  });

  it('ação INELEGÍVEL continua CHANNEL_BLOCKED mesmo com o disjuntor ligado', () => {
    setConfigOverride('whatsappActionsEnabled', true);
    const decision = evaluateConversationPolicy({
      toolName: 'cancel_manifest',
      channel: 'whatsapp',
      confirmed: true,
      allowActions: true,
      context
    });
    assert.equal(decision.reasonCode, 'CHANNEL_BLOCKED');
  });

  it('nem com `ai_tools` liberando: `cancel_manifest` no WhatsApp permanece bloqueado', () => {
    setConfigOverride('whatsappActionsEnabled', true);
    enableToolOnWhatsApp('cancel_manifest');

    const decision = evaluateConversationPolicy({
      toolName: 'cancel_manifest',
      channel: 'whatsapp',
      confirmed: true,
      allowActions: true,
      context
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'CHANNEL_BLOCKED');
  });

  it('o overlay POR INTENT alcança os intents orquestrados (antes era descartado em `effectivePolicy = intentPolicy`)', () => {
    setConfigOverride('whatsappActionsEnabled', true);
    enableIntentOnWhatsApp('manifest.batch_print_selected', { allowChannels: ['whatsapp', 'native_chat', 'inapp'] });

    const liberado = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: { intent: 'manifest.batch_print_selected', manifestIds: ['m1', 'm2'] },
      channel: 'whatsapp',
      confirmed: false,
      allowActions: true,
      context
    });
    assert.equal(liberado.reasonCode, 'CONFIRMATION_REQUIRED', 'o intent passou do gate de canal');

    // O MESMO overlay de tool não alcança um intent que ele não nomeou — e o de cancelamento
    // continua recusado mesmo se alguém o nomear.
    const naoNomeado = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: { intent: 'manifest.batch_submit_selected', manifestIds: ['m1'] },
      channel: 'whatsapp',
      confirmed: false,
      allowActions: true,
      context
    });
    assert.equal(naoNomeado.reasonCode, 'CHANNEL_NOT_ENABLED');
  });

  it('o teto de lote do canal continua sendo o da policy (5 para impressão)', () => {
    setConfigOverride('whatsappActionsEnabled', true);
    enableIntentOnWhatsApp('manifest.batch_print_selected');

    const decision = evaluateConversationPolicy({
      toolName: 'orchestrate_manifest_operation',
      toolArgs: { intent: 'manifest.batch_print_selected', manifestIds: ['1', '2', '3', '4', '5', '6'] },
      channel: 'whatsapp',
      confirmed: true,
      allowActions: true,
      context
    });
    assert.equal(decision.reasonCode, 'BATCH_LIMIT_EXCEEDED');
    assert.equal(decision.maxBatchSize, 5);
  });

  it('TOOL DIRETA EM CANAL EXTERNO AGE SOBRE 1 ITEM — `count: 100` não vira 100 rascunhos', () => {
    setConfigOverride('whatsappActionsEnabled', true);
    enableToolOnWhatsApp('print_manifest');

    // `BATCH_LIMITS_BY_INTENT` NÃO alcança tool sem intent (`if (isAction && intent)`): sem a regra
    // nova, `count` passaria inteiro.
    const decision = evaluateConversationPolicy({
      toolName: 'print_manifest',
      toolArgs: { count: 100 },
      channel: 'whatsapp',
      confirmed: true,
      allowActions: true,
      context
    });
    assert.equal(decision.reasonCode, 'BATCH_LIMIT_EXCEEDED');
    assert.equal(decision.maxBatchSize, 1);

    // No canal interno a regra NÃO se aplica — ela é de canal externo, não um teto novo global.
    const interno = evaluateConversationPolicy({
      toolName: 'print_manifest',
      toolArgs: { count: 100 },
      channel: 'inapp',
      confirmed: true,
      allowActions: true,
      context: { ...context, channel: 'inapp' }
    });
    assert.equal(interno.allowed, true);
  });
});

describe('fase 5 — gramática de resgate (determinística, antes do LLM)', () => {
  it('MUTAÇÃO (e): "sim", "ok", "pode" e 👍 NUNCA confirmam', () => {
    for (const texto of ['sim', 'Sim', 'ok', 'OK', 'pode', 'pode mandar', 'isso', 'blz', '👍', 'confirmo']) {
      const parsed = parseWhatsAppConfirmationUtterance(texto);
      assert.equal(parsed.kind, 'vague_yes', `"${texto}" não pode ser confirmação`);
    }
  });

  it('só 6 dígitos exatos confirmam — número de MTR (12) e de rascunho (4) não', () => {
    assert.deepEqual(parseWhatsAppConfirmationUtterance('481902'), { kind: 'code', code: '481902' });
    assert.deepEqual(parseWhatsAppConfirmationUtterance('  CONFIRMAR 481902 '), { kind: 'code', code: '481902' });
    assert.equal(parseWhatsAppConfirmationUtterance('202600123456').kind, 'none');
    assert.equal(parseWhatsAppConfirmationUtterance('4821').kind, 'none');
    assert.equal(parseWhatsAppConfirmationUtterance('emite o 481902 agora').kind, 'none');
  });

  it('`cancelar` isolado é DESISTIR — a colisão de vocabulário mais perigosa do canal', () => {
    for (const texto of ['NAO', 'não', 'nao', 'cancela', 'cancelar', 'deixa']) {
      assert.equal(parseWhatsAppConfirmationUtterance(texto).kind, 'decline', `"${texto}"`);
    }
    // Com objeto, volta a ser pedido normal (e o desenho recusa cancelamento por este canal).
    assert.equal(parseWhatsAppConfirmationUtterance('cancela o mtr 202600123456').kind, 'none');
  });
});

describe('fase 5 — prévia de confirmação', () => {
  const base = {
    headline: '2a via de 2 MTRs',
    accountLabel: 'NOVA IT AMBIENTAL (12.345.678/0001-90)',
    code: '481902',
    ttlSeconds: 300,
    ticketId: 'cvfy_8f2c1d'
  };

  it('MUTAÇÃO NEUTRA: id interno NÃO é identidade conferível — e sem identidade não se pede código', () => {
    // `mtr_a1b2c3d4` tem o mesmo comprimento de um número de MTR: qualquer checagem de "tem
    // conteúdo" o aceitaria, e a prévia degradaria SEM nenhum teste vermelho. O desfecho correto é
    // RECUSAR a confirmação, não pedir um código para um alvo que a pessoa não consegue verificar.
    const degradada = buildWhatsAppConfirmationPreview({
      ...base,
      items: [{ label: 'mtr_a1b2c3d4' }, { label: 'cdf_9f8e7d6c' }]
    });
    assert.equal(degradada, null);

    assert.deepEqual(
      extractConferibleItemLabels({ manifestIds: ['mtr_a1b2c3d4'], manifestNumbers: ['202600123456'] }),
      ['202600123456']
    );
  });

  it('é UM segmento, com a lista truncada em 3 + "e mais N" e o bloco do código atômico', () => {
    const preview = buildWhatsAppConfirmationPreview({
      ...base,
      items: ['202600123456', '202600123457', '202600123458', '202600123459', '202600123460']
        .map((label) => ({ label }))
    });

    assert.ok(preview.includes('- 202600123456'));
    assert.ok(preview.includes('- e mais 2'), 'a lista é truncada em 3 e a contagem é honesta');
    assert.equal(preview.includes('202600123459'), false);

    // O bloco do código é contíguo: prazo e saída de desistência na MESMA vizinhança do número.
    const linhas = preview.split('\n');
    const iCodigo = linhas.findIndex((linha) => linha.includes('*481902*'));
    assert.ok(iCodigo > 0);
    assert.ok(linhas[iCodigo + 1].includes('uma unica vez'));
    assert.ok(linhas[iCodigo + 1].includes('NAO'));

    // NOME da conta, nunca só id interno.
    assert.ok(preview.includes('NOVA IT AMBIENTAL'));
    assert.ok(preview.includes('Protocolo: cvfy_8f2c1d'));
  });

  it('MUTAÇÃO (k): o código NÃO aparece em nenhuma outra mensagem do fluxo', () => {
    const confirmado = buildWhatsAppConfirmedText({ headline: base.headline, itemCount: 2, ticketId: base.ticketId });
    const erro = buildWhatsAppWrongCodeText({ headline: base.headline, attemptsRemaining: 2 });
    assert.equal(confirmado.includes('481902'), false);
    assert.equal(erro.includes('481902'), false, 'repetir o código tornaria as tentativas decorativas');
  });

  it('MUTAÇÃO: prévia com código FORA DO FORMATO devolve `null` — nunca uma prévia sem código válido', () => {
    // O bloco do código é a razão de a prévia existir. Uma prévia montada com código vazio, curto,
    // longo ou não-numérico pede confirmação de um alvo que a pessoa não tem como confirmar, e deixa
    // um ticket vivo bloqueando (índice único) qualquer pedido novo pelo TTL inteiro. Apagar a
    // checagem `/^\d{6}$/` faz este caso quebrar.
    const items = [{ label: '202600123456' }];
    for (const code of ['', '48190', '4819021', 'abcdef', '48190a', ' 481902 ', null, undefined]) {
      assert.equal(buildWhatsAppConfirmationPreview({ ...base, items, code }), null, `código ${JSON.stringify(code)} passou`);
    }
    // CONTROLE NEGATIVO: os MESMOS itens com código de 6 dígitos produzem prévia.
    assert.ok(buildWhatsAppConfirmationPreview({ ...base, items, code: '481902' }));
  });

  it('o BLOCO DO CÓDIGO sobrevive a rótulos longos — ele é a cauda, e a truncagem corta a cauda', () => {
    // Razão social de gerador é texto livre. Sem teto por rótulo, três rótulos longos empurram o
    // código para fora do orçamento do segmento e a pessoa fica com um ticket que não consegue
    // resgatar. Remover `clampLabel` de `buildManifestIdentityLabel` faz este caso quebrar.
    const gigante = 'COOPERATIVA '.repeat(60);
    const label = buildManifestIdentityLabel({
      manifestNumber: '202600123456',
      generatorDescription: gigante,
      expeditionDate: '2026-03-12'
    });
    assert.ok(label.length <= 80, `rótulo com ${label.length} chars — o teto é 80`);

    const preview = buildWhatsAppConfirmationPreview({ ...base, items: [{ label }, { label }, { label }] });
    assert.ok(preview.includes('*481902*'), 'o código sumiu da prévia');
  });

  it('sem número de MTR e sem gerador+data, a identidade é `null` — degradar é RECUSAR', () => {
    assert.equal(buildManifestIdentityLabel({ manifestNumber: null, generatorDescription: null, expeditionDate: null }), null);
    assert.equal(buildManifestIdentityLabel({ manifestNumber: null, generatorDescription: 'X SA', expeditionDate: null }), null);
    // Rascunho ainda não emitido: gerador + data ainda permitem conferência.
    assert.equal(
      buildManifestIdentityLabel({ manifestNumber: null, generatorDescription: 'X SA', expeditionDate: '2026-03-12' }),
      'Rascunho de 12/03/2026 - X SA'
    );
  });

  it('`collectActionManifestIds` lê as QUATRO formas que o orquestrador realmente emite', () => {
    // O extrator de rótulos descarta id interno (e está certo). Quem COLETA para resolver é esta
    // função — apagar qualquer um dos quatro ramos deixa a família de intents correspondente sem
    // identidade e, por consequência, sem ticket.
    assert.deepEqual(collectActionManifestIds({ manifestIds: [MANIFEST_A, MANIFEST_B] }), [MANIFEST_A, MANIFEST_B]);
    assert.deepEqual(collectActionManifestIds({ manifestId: MANIFEST_A }), [MANIFEST_A]);
    assert.deepEqual(
      collectActionManifestIds({ selectionSnapshot: { selectedManifestIds: [MANIFEST_C] } }),
      [MANIFEST_C]
    );
    assert.deepEqual(
      collectActionManifestIds({ segments: [{ sourceManifestId: MANIFEST_B }, { sourceManifestId: MANIFEST_B }] }),
      [MANIFEST_B]
    );
    assert.deepEqual(collectActionManifestIds({ manifestNumbers: ['202600123456'] }), []);
  });
});

/* ============================================================================================== */
/* EMISSÃO — as guardas que moram na ORIGEM (TTL, snapshot, código em claro)                       */
/* ============================================================================================== */

describe('fase 5 — emissão: TTL, snapshot e código em claro são guardas de ORIGEM', () => {
  let store;

  const BINDING = {
    toolName: 'orchestrate_manifest_operation',
    intent: 'manifest.batch_print_selected',
    frozenArgs: TICKET_ARGS,
    argsFingerprint: fingerprintActionArgs(TICKET_ARGS),
    humanSummary: '2a via de 2 MTRs',
    itemLabels: [LABEL_A, LABEL_B],
    snapshotAccountId: 'acc_TICKET',
    snapshotSessionContextId: 'sess_TICKET',
    conversationSessionId: 'csess_1',
    riskTier: 'N1',
    itemCount: 2,
    previewCorrelationId: 'corr_preview',
    stepUpWindowId: null
  };

  function issue(overrides = {}) {
    return issueWhatsAppActionTicket({
      userId: 'usr_1',
      externalUserKey: PHONE,
      binding: { ...BINDING, ...overrides }
    });
  }

  beforeEach(() => {
    store = makeVerificationStore();
    setWhatsAppActionTicketRepositoriesForTests(store.repositories);
    setConfigOverride('whatsappActionTicketTtlSeconds', 300);
  });

  afterEach(() => {
    setWhatsAppActionTicketRepositoriesForTests(null);
    setConfigOverride('whatsappActionTicketTtlSeconds', undefined);
  });

  it('CONTROLE NEGATIVO: com TTL e snapshot válidos a emissão ACONTECE', async () => {
    // Sem este caso, todas as recusas abaixo poderiam ser efeito de o harness nunca emitir nada.
    const issued = await issue();
    assert.ok(issued, 'a emissão do caminho feliz falhou — as recusas abaixo não provariam nada');
    assert.match(issued.code, /^\d{6}$/);
    assert.equal(store.inserts.length, 1);
    assert.equal(store.inserts[0].expiresAt, new Date(NOW + 300_000).toISOString());
  });

  it('MUTAÇÃO (m02a): TTL ABSURDO (100 anos) RECUSA a emissão — nada é gravado', async () => {
    // `WHATSAPP_ACTION_TICKET_TTL_SECONDS` é entrada de AMBIENTE. Sem o teto de código, um valor
    // errado num values.yaml esvazia a única grandeza que limita a janela de resgate de uma ação
    // irreversível. Trocar a recusa por um clamp silencioso também quebra este caso: o teste afirma
    // que NADA foi inserido, não que o prazo foi corrigido.
    setConfigOverride('whatsappActionTicketTtlSeconds', 3_153_600_000);
    const { value: issued } = await captureConsole(() => issue());

    assert.equal(issued, null);
    assert.equal(store.inserts.length, 0, 'um ticket sem prazo real foi gravado');
    assert.equal(store.closes.length, 0, 'a emissão recusada destruiu algo no banco');
  });

  it('MUTAÇÃO (m02b): TTL abaixo do PISO também recusa — código que expira antes de chegar', async () => {
    setConfigOverride('whatsappActionTicketTtlSeconds', WHATSAPP_TICKET_TTL_MIN_SECONDS - 1);
    const { value: issued } = await captureConsole(() => issue());
    assert.equal(issued, null);
    assert.equal(store.inserts.length, 0);
  });

  it('a faixa é FECHADA nos dois extremos: piso e teto emitem, um segundo além não', async () => {
    for (const seconds of [WHATSAPP_TICKET_TTL_MIN_SECONDS, WHATSAPP_TICKET_TTL_MAX_SECONDS]) {
      setConfigOverride('whatsappActionTicketTtlSeconds', seconds);
      assert.ok(await issue(), `${seconds}s deveria emitir`);
    }
    setConfigOverride('whatsappActionTicketTtlSeconds', WHATSAPP_TICKET_TTL_MAX_SECONDS + 1);
    const { value } = await captureConsole(() => issue());
    assert.equal(value, null, `${WHATSAPP_TICKET_TTL_MAX_SECONDS + 1}s deveria recusar`);
  });

  it('MUTAÇÃO (m02c): o prazo PERSISTIDO é conferido — `expires_at` nulo derruba o ticket recém-criado', async () => {
    // O que vale é o que o banco GRAVOU, não o que se pretendeu gravar. O double modela um
    // armazenamento que devolve a linha sem prazo; a emissão tem de descartá-la NA HORA.
    store.mutateInsertedRecord = (record) => ({ ...record, expiresAt: null });
    const { value: issued } = await captureConsole(() => issue());

    assert.equal(issued, null);
    assert.equal(store.inserts.length, 1, 'a linha chegou a ser inserida — é justo o caso que a conferência cobre');
    assert.deepEqual(store.closes.map((entry) => entry.outcome), ['cancelled'], 'a linha órfã não foi descartada');
  });

  it('prazo persistido ILEGÍVEL ou de 100 anos também derruba o ticket', async () => {
    for (const expiresAt of ['nao-e-data', new Date(NOW + 100 * 365 * 24 * 3600_000).toISOString()]) {
      store = makeVerificationStore();
      setWhatsAppActionTicketRepositoriesForTests(store.repositories);
      store.mutateInsertedRecord = (record) => ({ ...record, expiresAt });
      const { value } = await captureConsole(() => issue());
      assert.equal(value, null, `expiresAt=${expiresAt} passou`);
      assert.deepEqual(store.closes.map((entry) => entry.outcome), ['cancelled']);
    }
  });

  it('MUTAÇÃO (m08b): snapshot de conta NULO RECUSA — e o ticket pendente anterior fica INTACTO', async () => {
    // `checkWhatsAppTicketBinding` compara snapshot com contexto vivo, e `null === null` PASSA: um
    // ticket sem snapshot vale em QUALQUER conta CETESB que a pessoa venha a selecionar. Nenhuma
    // checagem posterior distingue "não mudou" de "nunca foi amarrado" — a guarda tem de ser aqui.
    const anterior = seedLiveTicket(store);

    const { value: issued } = await captureConsole(() => issue({ snapshotAccountId: null }));

    assert.equal(issued, null);
    assert.equal(store.inserts.length, 0);
    assert.equal(anterior.consumed_at, null, 'a emissão recusada destruiu o ticket pendente legítimo');
    assert.equal(anterior.outcome, null);
  });

  it('snapshot de SESSÃO nulo (ou string vazia) recusa pelo mesmo motivo', async () => {
    for (const snapshotSessionContextId of [null, '', '   ']) {
      const { value } = await captureConsole(() => issue({ snapshotSessionContextId }));
      assert.equal(value, null, `snapshotSessionContextId=${JSON.stringify(snapshotSessionContextId)} passou`);
    }
    assert.equal(store.inserts.length, 0);
  });

  it('snapshot PERSISTIDO incompleto derruba o ticket recém-criado', async () => {
    store.mutateInsertedRecord = (record) => ({
      ...record,
      metadata: { ...record.metadata, snapshotAccountId: null }
    });
    const { value } = await captureConsole(() => issue());
    assert.equal(value, null);
    assert.deepEqual(store.closes.map((entry) => entry.outcome), ['cancelled']);
  });

  it('MUTAÇÃO (m07a): o `metadata` persistido é ALLOWLIST — chave estranha ao binding NÃO desce', async () => {
    // O kill determinístico da allowlist: um `metadata: { ...binding }` copiaria estas duas chaves
    // para a coluna jsonb, que é durável, entra em dump e é lida por quem investiga a fila. Uma delas
    // é literalmente o código em claro.
    const issued = await issueWhatsAppActionTicket({
      userId: 'usr_1',
      externalUserKey: PHONE,
      binding: { ...BINDING, code: '999999', debugNote: 'nao deveria existir' }
    });

    assert.ok(issued);
    const persistido = store.rows.get(issued.ticket.id).metadata;
    assert.equal(Object.prototype.hasOwnProperty.call(persistido, 'code'), false, 'o código desceu para o jsonb');
    assert.equal(Object.prototype.hasOwnProperty.call(persistido, 'debugNote'), false);
    assert.equal(canonicalJson(persistido).includes('999999'), false);
    // E o que PERTENCE ao binding continua lá — allowlist que apaga tudo também "passa".
    assert.deepEqual(persistido.itemLabels, [LABEL_A, LABEL_B]);
    assert.equal(persistido.argsFingerprint, BINDING.argsFingerprint);
  });

  it('MUTAÇÃO (m07a2): o código SORTEADO nunca aparece na linha gravada — nem por substring', async () => {
    // Espia a LINHA, não o builder de mensagem. Cem emissões: cada uma sorteia um código novo e
    // grava um metadata novo; se a allowlist cair, a primeira já denuncia.
    for (let i = 0; i < 100; i += 1) {
      const issued = await issue();
      assert.ok(issued);
      const gravado = canonicalJson(store.rows.get(issued.ticket.id).metadata);
      assert.equal(gravado.includes(issued.code), false, `código ${issued.code} apareceu no metadata`);
      assert.equal(canonicalJson(store.inserts.at(-1).metadata).includes(issued.code), false);
      // E o hash gravado NÃO é o código: `code_hash` é scrypt COM salt.
      assert.equal(store.inserts.at(-1).codeHash.includes(issued.code), false);
      assert.notEqual(store.inserts.at(-1).codeHash, issued.code);
    }
  });

  it('MUTAÇÃO (m07b): `console.*` deste módulo REDIGE corridas de dígitos', async () => {
    // A mensagem de erro do driver pode carregar o parâmetro que falhou. Um `console.error` cru
    // publicaria o código no log do worker — durável, exportado para o Loki, legível por quem opera.
    store.failures.insert = new Error('duplicate key value violates unique constraint: codigo 481902 do mtr 202600123456');
    const { value, text } = await captureConsole(() => issue());

    assert.equal(value, null);
    assert.ok(text.includes('[whatsapp-action-ticket]'), 'o diagnóstico não saiu');
    assert.equal(text.includes('481902'), false, 'o código de 6 dígitos vazou para o log');
    assert.equal(text.includes('202600123456'), false, 'o número do MTR vazou para o log');
    assert.ok(text.includes('[redigido]'));
  });

  it('a emissão FELIZ não escreve o código em log nenhum', async () => {
    const { value: issued, text } = await captureConsole(() => issue());
    assert.ok(issued);
    assert.equal(text.includes(issued.code), false);
  });

  it('tabela 020 ausente (42P01) é recusa FAIL-CLOSED com diagnóstico inconfundível', async () => {
    const missing = new Error('relation "conversation_channel_verifications" does not exist');
    missing.code = '42P01';
    store.failures.insert = missing;

    const { value, text } = await captureConsole(() => issue());
    assert.equal(value, null);
    assert.ok(text.includes('migration 020'), 'o operador não consegue distinguir esta falha de outra');
  });

  it('a emissão fecha como `superseded` o ticket vivo anterior — e só quando ela de fato acontece', async () => {
    const anterior = seedLiveTicket(store);
    const issued = await issue();

    assert.ok(issued);
    assert.equal(anterior.outcome, 'superseded');
    assert.notEqual(store.rows.get(issued.ticket.id).id, anterior.id);
  });
});

/* ============================================================================================== */
/* EMISSÃO — identidade conferível a partir dos IDS REAIS do orquestrador (o achado CRÍTICO)       */
/* ============================================================================================== */

describe('fase 5 — emissão: identidade conferível resolvida dos ids REAIS (`man_<hex>`)', () => {
  let store;
  let manifests;

  function issueFrom(args, overrides = {}) {
    return tryIssueWhatsAppActionTicket({
      output: {
        status: 'blocked',
        policy: { reasonCode: 'CONFIRMATION_REQUIRED' },
        toolCall: { name: overrides.toolName || 'orchestrate_manifest_operation', arguments: args },
        conversationSessionId: 'csess_1',
        conversationTurnId: 'cturn_1'
      },
      principal: buildPrincipal(overrides.principal),
      link: LINK,
      correlationId: 'corr_preview'
    });
  }

  beforeEach(() => {
    store = makeVerificationStore();
    manifests = makeManifestStore();
    setWhatsAppActionTicketRepositoriesForTests(store.repositories);
    setWhatsAppConfirmationRepositoriesForTests(manifests.repositories);
    setConfigOverride('whatsappActionTicketTtlSeconds', 300);
  });

  afterEach(() => {
    setWhatsAppActionTicketRepositoriesForTests(null);
    setWhatsAppConfirmationRepositoriesForTests(null);
    setConfigOverride('whatsappActionTicketTtlSeconds', undefined);
    setConfigOverride('whatsappActionNoticeEnabled', undefined);
  });

  it('ACHADO CRÍTICO: o canário `manifest.batch_print_selected` EMITE com `manifestIds` internos', async () => {
    // A fixture usa o formato que a produção realmente gera (`man_<26 hex>`), não `manifestNumbers`
    // fabricado — que era o double concordando consigo mesmo. Com o extrator descartando id interno e
    // ninguém RESOLVENDO, `labels` era `[]`, a prévia era `null` e a funcionalidade inteira ficava
    // inalcançável, gravando duas linhas de lixo por tentativa.
    const resultado = await issueFrom({ intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_A, MANIFEST_B] });

    assert.ok(resultado, 'o intent de lote continua sem emitir ticket');
    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_pending');
    assert.equal(store.inserts.length, 1);

    // O double de manifestos responde valores DISTINTOS POR IDENTIDADE: as duas linhas da prévia são
    // diferentes entre si. Um double que devolvesse o mesmo rótulo para os dois ids faria a mutação
    // "resolva sempre o primeiro id" sobreviver.
    assert.notEqual(LABEL_A, LABEL_B);
    assert.ok(resultado.text.includes(LABEL_A), 'o rótulo do manifesto A não está na prévia');
    assert.ok(resultado.text.includes(LABEL_B), 'o rótulo do manifesto B não está na prévia');
    assert.deepEqual(manifests.lookups, [MANIFEST_A, MANIFEST_B], 'a resolução não consultou os ids dos argumentos');

    // O id interno NUNCA aparece: ele é exatamente o que a pessoa não consegue conferir.
    assert.equal(resultado.text.includes(MANIFEST_A), false);
    assert.ok(/\*\d{6}\*/.test(resultado.text), 'a prévia saiu sem o bloco do código');

    // Os rótulos viajam no metadata (para a REEMISSÃO), NUNCA dentro de `frozenArgs`: `frozenArgs` é
    // o `toolRequest.arguments` do despacho e a entrada do `argsFingerprint`.
    const metadata = store.inserts[0].metadata;
    assert.deepEqual(metadata.itemLabels, [LABEL_A, LABEL_B]);
    assert.deepEqual(metadata.frozenArgs, { intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_A, MANIFEST_B] });
    assert.equal(metadata.argsFingerprint, fingerprintActionArgs(metadata.frozenArgs));
  });

  it('`selectionSnapshot` é lido — é a forma que o planner emite quando o conjunto já está em foco', async () => {
    const resultado = await issueFrom({
      intent: 'manifest.batch_print_selected',
      selectionSnapshot: { selectedManifestIds: [MANIFEST_C] }
    });
    assert.ok(resultado);
    assert.ok(resultado.text.includes(LABEL_C));
    assert.deepEqual(manifests.lookups, [MANIFEST_C]);
  });

  it('MUTAÇÃO: resolver DE MENOS não emite — listar 3 e executar 5 PARECE conferência', async () => {
    // O caso traiçoeiro. Zero rótulo é óbvio; rótulo faltando é pior, porque a prévia teria cara de
    // conferência completa. Trocar `labels.length !== requestedCount` por `labels.length > 0` faz
    // este caso quebrar.
    const anterior = seedLiveTicket(store);
    const { value: resultado } = await captureConsole(() =>
      issueFrom({ intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_A, MANIFEST_DESCONHECIDO] })
    );

    assert.equal(resultado, null);
    assert.equal(store.inserts.length, 0, 'ticket emitido com identidade incompleta');
    assert.equal(anterior.consumed_at, null, 'o ticket pendente legítimo foi destruído por uma tentativa que se autocancela');
  });

  it('falha do repositório de manifestos é FAIL-CLOSED: nenhum ticket, nada destruído', async () => {
    const anterior = seedLiveTicket(store);
    manifests.failure = new Error('banco fora');

    const { value: resultado } = await captureConsole(() =>
      issueFrom({ intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_A] })
    );

    assert.equal(resultado, null);
    assert.equal(store.inserts.length, 0);
    assert.equal(anterior.consumed_at, null);
  });

  it('TETO DE LOTE conferido NA EMISSÃO — ninguém digita código para receber um "não"', async () => {
    // A policy só avalia `BATCH_LIMIT_EXCEEDED` com `confirmed:true`, ou seja DEPOIS do código, e o
    // texto de lá diz "alguma coisa mudou no seu SICAT" — falso: nada mudou, o pedido nunca foi
    // admissível. Elevar `maxItems` de `manifest.batch_print_selected` para 99 faz este caso quebrar.
    const anterior = seedLiveTicket(store);
    const seis = ['1', '2', '3', '4', '5', '6'].map((n) => `man_${n.repeat(26)}`);

    const resultado = await issueFrom({ intent: 'manifest.batch_print_selected', manifestIds: seis });

    assert.ok(resultado);
    assert.equal(resultado.outcome, 'whatsapp_inbound_action_batch_too_large');
    assert.ok(resultado.text.includes('Nada foi executado') || resultado.text.includes('*Nada foi executado.*'));
    assert.ok(resultado.text.includes('6'), 'o texto não diz quantos foram pedidos');
    assert.ok(resultado.text.includes('5'), 'o texto não diz qual é o teto — sem isso não dá para dividir o pedido');
    assert.equal(store.inserts.length, 0, 'ticket emitido acima do teto do canal');
    assert.equal(anterior.consumed_at, null);
  });

  it('acima do TETO DE RESOLUÇÃO o banco nem é consultado — o desfecho já está decidido', async () => {
    // `MAX_RESOLVED_IDENTITY_ITEMS` existe para que um pedido absurdo (o LLM enumerando um mês
    // inteiro) não vire uma rajada de `select` no meio da montagem de uma prévia que vai ser
    // recusada de todo jeito: nenhum intent elegível tem `maxItems` perto de 10.
    const onze = Array.from({ length: 11 }, (_, index) => `man_${String(index).padStart(2, '0').repeat(13)}`);
    const resultado = await issueFrom({ intent: 'manifest.batch_print_selected', manifestIds: onze });

    assert.equal(resultado.outcome, 'whatsapp_inbound_action_batch_too_large');
    assert.equal(manifests.lookups.length, 0, 'consultou o banco para um pedido já recusado');
    assert.equal(store.inserts.length, 0);
  });

  it('`replicate_segmented` conta RÉPLICAS, não origens — 3 segmentos de 1 origem estouram o teto 2', async () => {
    // A distinção entre `effectCount` e `requestedCount`. Contar origens faria 3 réplicas de um
    // mesmo MTR passarem por um teto de 2.
    const resultado = await issueFrom({
      intent: 'manifest.replicate_segmented',
      segments: [
        { sourceManifestId: MANIFEST_A, quantity: 1 },
        { sourceManifestId: MANIFEST_A, quantity: 2 },
        { sourceManifestId: MANIFEST_A, quantity: 3 }
      ]
    });

    assert.equal(resultado.outcome, 'whatsapp_inbound_action_batch_too_large');
    assert.equal(store.inserts.length, 0);

    // CONTROLE NEGATIVO: com DOIS segmentos o mesmo caminho emite.
    const dentro = await issueFrom({
      intent: 'manifest.replicate_segmented',
      segments: [{ sourceManifestId: MANIFEST_A }, { sourceManifestId: MANIFEST_A }]
    });
    assert.equal(dentro.outcome, 'whatsapp_inbound_confirmation_pending');
    assert.ok(dentro.text.includes('Replicar em 2 rascunhos'));
  });

  it('ação NÃO elegível nem chega à emissão — devolve `null` e o composer responde como hoje', async () => {
    const resultado = await issueFrom({ intent: 'manifest.batch_cancel_selected', manifestIds: [MANIFEST_A] });
    assert.equal(resultado, null);
    assert.equal(store.inserts.length, 0);
  });

  it('a troca de ticket é DITA na primeira linha — trocar em silêncio é como se perde MTR', async () => {
    seedLiveTicket(store);
    const resultado = await issueFrom({ intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_A] });
    assert.ok(resultado.text.startsWith('Descartei o pedido anterior (2a via de 2 MTRs)'), resultado.text);
  });

  /* ---- N2: a fase entrega N1, e o portão é de CÓDIGO ------------------------------------------ */

  it('MUTAÇÃO (m14a): N2 (`batch_submit_selected`) NÃO emite — e a env NÃO abre o portão', async () => {
    // O desenho condicionou `submit` ao aviso de conclusão, que não existe. O portão é a constante
    // `WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED`, não o flag de ambiente: um
    // `WHATSAPP_ACTION_NOTICE_ENABLED=true` num values.yaml abriria emissão IRREVERSÍVEL na CETESB
    // num canal cego. Ligar a env e ver o mesmo "não" é o ponto deste caso.
    setConfigOverride('whatsappActionNoticeEnabled', true);
    seedWindow(store);

    const resultado = await issueFrom({ intent: 'manifest.batch_submit_selected', manifestIds: [MANIFEST_A] });

    assert.equal(resultado.outcome, 'whatsapp_inbound_action_notice_missing');
    assert.equal(resultado.text, WHATSAPP_N2_NOTICE_MISSING_TEXT);
    assert.equal(store.inserts.length, 0, 'ticket N2 emitido — nada pendente pode existir para ser confirmado');
  });

  it('N2 na tool DIRETA (`submit_manifest`) recebe o mesmo portão', async () => {
    setConfigOverride('whatsappActionNoticeEnabled', true);
    const resultado = await issueFrom({ manifestId: MANIFEST_A }, { toolName: 'submit_manifest' });
    assert.equal(resultado.outcome, 'whatsapp_inbound_action_notice_missing');
    assert.equal(store.inserts.length, 0);
  });

  it('CONTROLE NEGATIVO do portão N2: a MESMA emissão em N1 passa', async () => {
    // Prova que o "não" do N2 vem do tier e não de o harness recusar tudo.
    setConfigOverride('whatsappActionNoticeEnabled', true);
    const resultado = await issueFrom({ intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_A] });
    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_pending');
    assert.equal(store.inserts.length, 1);
  });

  it('N2 é ELEGÍVEL na tabela de código — o portão é o aviso, e é isso que a fase 6 vai virar', async () => {
    // Registra a fronteira exata: `submit` está em `WHATSAPP_ELIGIBLE_ACTIONS` (o AI Control Center
    // consegue ligá-lo) e mesmo assim não emite. Quem remover o portão sem entregar o aviso quebra o
    // caso acima, não este.
    assert.equal(WHATSAPP_ELIGIBLE_ACTIONS['manifest.batch_submit_selected'].tier, 'N2');
    assert.equal(WHATSAPP_ELIGIBLE_ACTIONS.submit_manifest.tier, 'N2');
    assert.ok(
      resolveEffectiveAllowChannels({
        key: 'manifest.batch_submit_selected',
        codeChannels: ['native_chat', 'inapp'],
        overlayChannels: ['whatsapp', 'native_chat', 'inapp']
      }).includes('whatsapp')
    );
  });
});

/* ============================================================================================== */
/* QUEIMA — uso único, amarração, revalidação                                                      */
/* ============================================================================================== */

describe('fase 5 — queima do ticket (uso único, amarração, revalidação)', () => {
  let store;

  beforeEach(() => {
    store = makeVerificationStore();
    setWhatsAppActionTicketRepositoriesForTests(store.repositories);
  });

  afterEach(() => {
    setWhatsAppActionTicketRepositoriesForTests(null);
  });

  it('caminho feliz: consome tentativa, confere código e QUEIMA como `verified`', async () => {
    seedLiveTicket(store);
    const verdict = await redeemWhatsAppActionTicket({
      code: CODE,
      context: liveContext(),
      revalidate: async () => null
    });

    assert.equal(verdict.status, 'authorized');
    assert.deepEqual(store.closes, [{ id: 'cvfy_live', outcome: 'verified' }]);
    assert.equal(store.rows.get('cvfy_live').attempt_count, 1);
  });

  it('a queima grava `dispatchStatus: pending` — `verified` significa QUEIMADO, nunca "executado"', async () => {
    // O CHECK de `outcome` da 020 não tem `executed`, então `verified` é sobrecarregado. Quem lê a
    // trilha precisa de um campo que responda "a ação saiu?" — apagar `dispatchStatus` do patch da
    // queima devolve o ledger mentiroso que o achado ALTO descreve.
    seedLiveTicket(store);
    await redeemWhatsAppActionTicket({
      code: CODE,
      context: liveContext(),
      confirmCorrelationId: 'corr_confirm',
      revalidate: async () => null
    });

    const metadata = store.rows.get('cvfy_live').metadata;
    assert.equal(metadata.dispatchStatus, 'pending');
    assert.equal(metadata.confirmCorrelationId, 'corr_confirm', 'o protocolo da mensagem "Confirmado" não leva a lugar nenhum');
    assert.ok(metadata.confirmedAt);
  });

  it('MUTAÇÃO (a): REPLAY — o mesmo código de novo não executa nada', async () => {
    seedLiveTicket(store);
    await redeemWhatsAppActionTicket({ code: CODE, context: liveContext(), revalidate: async () => null });

    const replay = await redeemWhatsAppActionTicket({
      code: CODE,
      context: liveContext(),
      revalidate: async () => {
        throw new Error('revalidação não pode ser alcançada num replay');
      }
    });
    // A linha já está consumida: o `where` do `findLive` nem a devolve.
    assert.equal(replay.status, 'no_ticket');
  });

  it('MUTAÇÃO (a2): perder a corrida do `close` NÃO autoriza (rowCount = 0 recusa)', async () => {
    seedLiveTicket(store);
    // Modela o "CONFIRMAR 481902" paralelo: o UPDATE exclusivo não devolve linha. Reinstalado no
    // seam porque `{ ...DEFAULT, ...overrides }` copia as referências no momento da injeção.
    setWhatsAppActionTicketRepositoriesForTests({
      ...store.repositories,
      closeChannelVerification: async () => null
    });

    const verdict = await redeemWhatsAppActionTicket({
      code: CODE,
      context: liveContext(),
      revalidate: async () => null
    });
    assert.equal(verdict.status, 'already_used');
  });

  it('MUTAÇÃO (b): conta CETESB trocada entre a prévia e o "sim" → `conflict`, nada despacha', async () => {
    seedLiveTicket(store);
    // O double responde valores DISTINTOS POR IDENTIDADE: ticket em `acc_TICKET`, contexto vivo em
    // `acc_LIVE`. Comparar o valor do turno consigo mesmo faria a mutação sobreviver.
    const verdict = await redeemWhatsAppActionTicket({
      code: CODE,
      context: liveContext({ integrationAccountId: 'acc_LIVE' }),
      revalidate: async () => {
        throw new Error('a amarração é conferida ANTES da revalidação de política');
      }
    });

    assert.equal(verdict.status, 'conflict');
    assert.equal(verdict.conflict, 'account_changed');
    assert.deepEqual(store.closes, [{ id: 'cvfy_live', outcome: 'conflict' }]);
  });

  it('sessão CETESB trocada também é `conflict` (guarda separada da conta)', async () => {
    seedLiveTicket(store);
    const verdict = await redeemWhatsAppActionTicket({
      code: CODE,
      context: liveContext({ sessionContextId: 'sess_OUTRA' }),
      revalidate: async () => null
    });
    assert.equal(verdict.conflict, 'session_changed');
  });

  it('argumentos adulterados no jsonb → `args_tampered` (a impressão digital é recomputada)', async () => {
    // O jsonb foi editado por fora; a IMPRESSÃO DIGITAL continua sendo a do pedido original. É por
    // isso que ela é recomputada na queima e não apenas relida — reler o par (args, fingerprint)
    // gravado junto não detecta adulteração nenhuma.
    seedLiveTicket(store, {
      metadata: {
        frozenArgs: { intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_C] },
        argsFingerprint: fingerprintActionArgs(TICKET_ARGS)
      }
    });
    const verdict = await redeemWhatsAppActionTicket({
      code: CODE,
      context: liveContext(),
      revalidate: async () => { throw new Error('a amarração é conferida ANTES da revalidação'); }
    });
    assert.equal(verdict.conflict, 'args_tampered');
    assert.equal(store.rows.get('cvfy_live').metadata.conflictReason, 'args_tampered');

    // CONTROLE NEGATIVO: os MESMOS argumentos com a impressão digital coerente autorizam. Sem isto,
    // `args_tampered` poderia vir de a fixture ser inválida por outro motivo.
    store = makeVerificationStore();
    setWhatsAppActionTicketRepositoriesForTests(store.repositories);
    const coerentes = { intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_C] };
    seedLiveTicket(store, {
      metadata: { frozenArgs: coerentes, argsFingerprint: fingerprintActionArgs(coerentes) }
    });
    const ok = await redeemWhatsAppActionTicket({ code: CODE, context: liveContext(), revalidate: async () => null });
    assert.equal(ok.status, 'authorized');
  });

  it('MUTAÇÃO (c): política revogada entre a prévia e a confirmação → `conflict`, não `authorized`', async () => {
    seedLiveTicket(store);
    const verdict = await redeemWhatsAppActionTicket({
      code: CODE,
      context: liveContext(),
      revalidate: async () => 'policy_denied'
    });

    assert.equal(verdict.status, 'conflict');
    assert.equal(verdict.conflict, 'policy_denied');
    assert.deepEqual(store.closes, [{ id: 'cvfy_live', outcome: 'conflict' }]);
    assert.equal(store.rows.get('cvfy_live').outcome, 'conflict');
  });

  it('código errado cobra tentativa e, no terceiro, fecha como `exhausted`', async () => {
    seedLiveTicket(store);

    const primeiro = await redeemWhatsAppActionTicket({ code: '000000', context: liveContext(), revalidate: async () => null });
    assert.equal(primeiro.status, 'wrong_code');
    assert.equal(primeiro.attemptsRemaining, 2);

    await redeemWhatsAppActionTicket({ code: '000001', context: liveContext(), revalidate: async () => null });
    const terceiro = await redeemWhatsAppActionTicket({ code: '000002', context: liveContext(), revalidate: async () => null });

    assert.equal(terceiro.status, 'attempts_exhausted');
    assert.equal(store.rows.get('cvfy_live').outcome, 'exhausted');

    // E depois de esgotado, o código CERTO também não vale mais.
    const tardio = await redeemWhatsAppActionTicket({ code: CODE, context: liveContext(), revalidate: async () => null });
    assert.equal(tardio.status, 'no_ticket');
  });

  it('ticket expirado não é localizado — o `where` filtra `expires_at > now()`', async () => {
    seedLiveTicket(store, { row: { expires_at: new Date(NOW - 1000).toISOString() } });
    const verdict = await redeemWhatsAppActionTicket({ code: CODE, context: liveContext(), revalidate: async () => null });
    assert.equal(verdict.status, 'no_ticket');
  });

  /* ---- AMARRAÇÃO AO TELEFONE, nas duas camadas ------------------------------------------------ */

  it('MUTAÇÃO (m03a): o `where` do `findLive` escopa por TELEFONE — ticket de outro número não é achado', async () => {
    seedLiveTicket(store);
    const verdict = await redeemWhatsAppActionTicket({
      code: CODE,
      context: liveContext({ externalUserKey: OUTRO_PHONE }),
      revalidate: async () => { throw new Error('não pode chegar à revalidação'); }
    });
    assert.equal(verdict.status, 'no_ticket');
    assert.equal(store.rows.get('cvfy_live').consumed_at, null, 'o ticket do outro número foi tocado');

    // CONTROLE NEGATIVO: o MESMO store, com o telefone certo, autoriza. Sem isto, `no_ticket` acima
    // poderia ser um harness que nunca acha nada.
    const certo = await redeemWhatsAppActionTicket({ code: CODE, context: liveContext(), revalidate: async () => null });
    assert.equal(certo.status, 'authorized');
  });

  it('MUTAÇÃO (m03c): `checkWhatsAppTicketBinding` compara o TELEFONE — a guarda é de código, não do `where`', async () => {
    // A guarda que a fase 5 deixou invisível: no fluxo real o `findLive` já escopa por telefone, então
    // um teste que só passe pelo `redeem` NUNCA exercita esta linha e a mutação "apague a comparação"
    // sobrevive. Aqui a função é chamada DIRETO, com o ticket e o contexto como sujeitos distintos.
    const ticket = {
      externalUserKey: PHONE,
      snapshotAccountId: 'acc_TICKET',
      snapshotSessionContextId: 'sess_TICKET',
      frozenArgs: TICKET_ARGS,
      argsFingerprint: fingerprintActionArgs(TICKET_ARGS)
    };

    assert.equal(checkWhatsAppTicketBinding(ticket, liveContext({ externalUserKey: OUTRO_PHONE })), 'phone_changed');
    // CONTROLE NEGATIVO: com o telefone igual, a mesma chamada devolve `null` — a função ENXERGA a
    // diferença, e o `phone_changed` acima não é efeito de outra guarda.
    assert.equal(checkWhatsAppTicketBinding(ticket, liveContext()), null);

    // E a ORDEM importa: telefone é conferido ANTES de conta. Com os dois trocados, o veredito é
    // `phone_changed` — inverter a ordem faz este caso quebrar.
    assert.equal(
      checkWhatsAppTicketBinding(ticket, liveContext({ externalUserKey: OUTRO_PHONE, integrationAccountId: 'acc_LIVE' })),
      'phone_changed'
    );
  });
});

/* ============================================================================================== */
/* LINHA MORTA — replay, expiração, esgotamento e OUTRO TELEFONE                                   */
/* ============================================================================================== */

describe('fase 5 — código sem ticket vivo: a linha MORTA é lida, e os 6 dígitos nunca vão ao LLM', () => {
  let store;

  beforeEach(() => {
    store = makeVerificationStore();
    setWhatsAppActionTicketRepositoriesForTests(store.repositories);
    setConfigOverride('whatsappActionsEnabled', true);
    setConfigOverride('whatsappActionTicketTtlSeconds', 300);
  });

  afterEach(() => {
    setWhatsAppActionTicketRepositoriesForTests(null);
    setConfigOverride('whatsappActionsEnabled', undefined);
    setConfigOverride('whatsappActionTicketTtlSeconds', undefined);
  });

  function rescueCode(link = LINK) {
    return runWhatsAppConfirmationRescue({
      utterance: { kind: 'code', code: CODE },
      principal: buildPrincipal(),
      link,
      correlationId: 'corr_confirm',
      dependencies: {
        processTurn: async () => { throw new Error('nada pode ser despachado a partir de uma linha morta'); }
      }
    });
  }

  it('o statement de linha morta é consultado SEM telefone — quem compara é o service', async () => {
    // A afirmação estrutural que mata `m03c` na raiz: se alguém acrescentar `externalUserKey` ao
    // `where` (ou ao input), a guarda `record.externalUserKey !== input.externalUserKey` do service
    // vira redundante e nenhuma mutação nela é observável. Este caso quebra ANTES disso acontecer.
    seedDeadTicket(store, { outcome: 'verified' });
    await inspectRecentWhatsAppActionTicket({ userId: 'usr_1', externalUserKey: PHONE });

    assert.equal(store.recentQueries.length, 1);
    assert.deepEqual(Object.keys(store.recentQueries[0]).sort(), ['channelType', 'maxAgeSeconds', 'userId']);
    assert.equal(store.recentQueries[0].channelType, WHATSAPP_ACTION_CHANNEL_TYPE);
  });

  it('MUTAÇÃO (m03a2): ticket de OUTRO TELEFONE do mesmo usuário → `other_phone`, nada executado', async () => {
    // O double devolve a linha CRUA (é o que o Postgres faz). A decisão é do service.
    seedDeadTicket(store, { outcome: 'verified', externalUserKey: OUTRO_PHONE });

    const verdict = await inspectRecentWhatsAppActionTicket({ userId: 'usr_1', externalUserKey: PHONE });
    assert.equal(verdict.status, 'other_phone');

    // CONTROLE NEGATIVO: a MESMA linha, consultada pelo telefone dela, é classificada como replay.
    // Sem isto, `other_phone` poderia ser um double que devolve linha errada para todo mundo.
    const mesmoTelefone = await inspectRecentWhatsAppActionTicket({ userId: 'usr_1', externalUserKey: OUTRO_PHONE });
    assert.equal(mesmoTelefone.status, 'already_used');

    // E ponta a ponta: o texto não revela o outro número, e nada é despachado.
    const resultado = await rescueCode();
    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_other_phone');
    assert.equal(resultado.text.includes(OUTRO_PHONE), false, 'quem manda a mensagem pode não ser o dono do outro número');
    assert.ok(resultado.text.includes('*nada foi executado*'));
  });

  it('MUTAÇÃO (m01c): REPLAY responde a HORA do uso — e nunca cai no planner', async () => {
    seedDeadTicket(store, { outcome: 'verified', consumedAt: '2026-08-07T14:32:00.000Z' });

    const resultado = await rescueCode();
    assert.notEqual(resultado, null, 'o código foi devolvido ao fluxo normal e iria ao LLM');
    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_replayed');
    assert.ok(resultado.text.includes('14:32'), 'a frase obrigatória de replay não traz a hora');
    assert.ok(resultado.text.includes('nao executei de novo'));
    assert.equal(resultado.text.includes(CODE), false, 'o código foi repetido de volta para o canal');
  });

  it('EXPIRADO diz a frase obrigatória: "expirou … *nada foi executado*"', async () => {
    // A pergunta real de quem está no pátio é "saiu ou não saiu?". Antes esta mensagem era
    // inalcançável: o `findLive` não devolvia a linha e os 6 dígitos viravam prompt de LLM.
    seedDeadTicket(store, { outcome: 'expired' });

    const resultado = await rescueCode();
    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_expired');
    assert.ok(resultado.text.includes('expirou'));
    assert.ok(resultado.text.includes('*nada foi executado*'));
    assert.ok(resultado.text.includes('2a via de 2 MTRs'), 'a manchete some e a pessoa não sabe do que se trata');
  });

  it('linha ainda VIVA no `select` mas fora do `findLive` (TTL virou entre as leituras) → expirado', async () => {
    store.seed({
      id: 'cvfy_borda',
      channel_type: 'whatsapp_action',
      external_user_key: PHONE,
      user_id: 'usr_1',
      code_hash: hashPassword(CODE),
      expires_at: new Date(NOW - 1_000).toISOString(),
      metadata: ticketMetadata()
    });
    const resultado = await rescueCode();
    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_expired');
  });

  it('ESGOTADO, CANCELADO/SUPERSEDED e CONFLITO têm cada um o seu desfecho', async () => {
    const casos = [
      ['exhausted', 'whatsapp_inbound_confirmation_exhausted', 'excesso de tentativas'],
      ['cancelled', 'whatsapp_inbound_confirmation_cancelled', 'descartada antes de ser usada'],
      ['superseded', 'whatsapp_inbound_confirmation_cancelled', 'descartada antes de ser usada'],
      ['send_failed', 'whatsapp_inbound_confirmation_cancelled', 'descartada antes de ser usada'],
      ['conflict', 'whatsapp_inbound_confirmation_conflict', 'Alguma coisa mudou']
    ];

    for (const [outcome, esperado, trecho] of casos) {
      store = makeVerificationStore();
      setWhatsAppActionTicketRepositoriesForTests(store.repositories);
      seedDeadTicket(store, { outcome });

      const resultado = await rescueCode();
      assert.notEqual(resultado, null, `${outcome} caiu no LLM`);
      assert.equal(resultado.outcome, esperado, outcome);
      assert.ok(resultado.text.includes(trecho), `${outcome}: "${resultado.text}"`);
    }
  });

  it('a JANELA de leitura é finita — ticket de semanas atrás não sequestra 6 dígitos para sempre', async () => {
    seedDeadTicket(store, { outcome: 'verified' });
    // Envelhece a linha para além das 24 h de `RECENT_TICKET_WINDOW_SECONDS`.
    store.rows.get('cvfy_dead_verified_5511987654321').created_at_ms = NOW - 25 * 3600_000;

    const resultado = await rescueCode();
    assert.equal(resultado, null, 'um ticket de ontem-retrasado ainda captura qualquer número de 6 dígitos');
  });

  it('ANCORA: SEM ticket nenhum, 6 dígitos seguem o fluxo normal (o LLM decide)', async () => {
    const resultado = await rescueCode();
    assert.equal(resultado, null);
  });

  it('"sim"/"NAO" SEM ticket vivo continuam sendo texto comum — o resíduo é estreito de propósito', async () => {
    seedDeadTicket(store, { outcome: 'verified' });
    for (const utterance of [{ kind: 'vague_yes' }, { kind: 'decline' }]) {
      const resultado = await runWhatsAppConfirmationRescue({
        utterance,
        principal: buildPrincipal(),
        link: LINK,
        correlationId: null,
        dependencies: { processTurn: async () => { throw new Error('não deveria despachar'); } }
      });
      assert.equal(resultado, null, utterance.kind);
    }
  });

  it('falha do `select` de linha morta NÃO inventa desfecho: devolve ao fluxo normal', async () => {
    seedDeadTicket(store, { outcome: 'verified' });
    store.failures.findRecent = new Error('banco fora');
    const { value } = await captureConsole(() => rescueCode());
    assert.equal(value, null);
  });
});

/* ============================================================================================== */
/* ORÇAMENTO DE SAÍDAS PAGAS                                                                       */
/* ============================================================================================== */

describe('fase 5 — orçamento de saídas pagas do ticket (`max_sends`)', () => {
  let store;

  beforeEach(() => {
    store = makeVerificationStore();
    setWhatsAppActionTicketRepositoriesForTests(store.repositories);
    setConfigOverride('whatsappActionsEnabled', true);
  });

  afterEach(() => {
    setWhatsAppActionTicketRepositoriesForTests(null);
    setConfigOverride('whatsappActionsEnabled', undefined);
  });

  function vagueYes() {
    return runWhatsAppConfirmationRescue({
      utterance: { kind: 'vague_yes' },
      principal: buildPrincipal(),
      link: LINK,
      correlationId: null,
      dependencies: { processTurn: async () => { throw new Error('vague_yes não despacha'); } }
    });
  }

  it('MUTAÇÃO: cada "sim" DEBITA — e no estouro o desfecho é SILÊNCIO, não outra mensagem paga', async () => {
    // `send_count` nasce 1 e `max_sends` é 4: sobram 3 saídas. O contador que ninguém incrementava
    // fazia `1 >= 4` ser sempre falso, e respondia-se a todo "sim" até o TTL — a espiral de custo que
    // `max_sends` foi escrito para conter. Remover `send_count < max_sends` do `where` faz o 4º "sim"
    // voltar a responder e este caso quebra.
    seedLiveTicket(store);

    for (let i = 1; i <= 3; i += 1) {
      const resultado = await vagueYes();
      assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_vague_yes', `resposta ${i}`);
      assert.equal(store.rows.get('cvfy_live').send_count, 1 + i, `débito ${i}`);
    }

    const { value: quarto } = await captureConsole(() => vagueYes());
    assert.equal(quarto.text, '', 'a 4a resposta saiu paga, acima do orçamento');
    assert.equal(quarto.outcome, 'whatsapp_inbound_confirmation_muted');
    assert.equal(store.rows.get('cvfy_live').send_count, 4, 'o contador passou do teto');
    assert.equal(store.rows.get('cvfy_live').attempt_count, 0, '"sim" não pode consumir palpite');
    assert.equal(store.rows.get('cvfy_live').consumed_at, null, 'o ticket continua vivo');
  });

  it('CONTROLE NEGATIVO: com orçamento largo NÃO há silêncio — o teto é o que decide', async () => {
    seedLiveTicket(store, { row: { max_sends: 99 } });
    for (let i = 0; i < 6; i += 1) {
      const resultado = await vagueYes();
      assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_vague_yes');
    }
    assert.equal(store.rows.get('cvfy_live').send_count, 7);
  });

  it('CÓDIGO ERRADO também é saída paga — respondia de graça até o TTL', async () => {
    seedLiveTicket(store, { row: { max_sends: 2, max_attempts: 9 } });

    const primeiro = await runWhatsAppConfirmationRescue({
      utterance: { kind: 'code', code: '000000' },
      principal: buildPrincipal(),
      link: LINK,
      correlationId: null,
      dependencies: { processTurn: async () => { throw new Error('não despacha'); } }
    });
    assert.equal(primeiro.outcome, 'whatsapp_inbound_confirmation_wrong_code');
    assert.equal(store.rows.get('cvfy_live').send_count, 2);

    const { value: segundo } = await captureConsole(() => runWhatsAppConfirmationRescue({
      utterance: { kind: 'code', code: '000001' },
      principal: buildPrincipal(),
      link: LINK,
      correlationId: null,
      dependencies: { processTurn: async () => { throw new Error('não despacha'); } }
    }));
    assert.equal(segundo.outcome, 'whatsapp_inbound_confirmation_muted');
    assert.equal(segundo.text, '');
  });

  it('o débito é ATÔMICO: o `where` do `update` é a guarda, não um `if` sobre valor lido', async () => {
    // Duas saídas concorrentes sobre o último crédito: só uma é debitada.
    seedLiveTicket(store, { row: { send_count: 3, max_sends: 4 } });
    const [a, b] = await Promise.all([
      debitWhatsAppActionTicketSend({ id: 'cvfy_live', userId: 'usr_1' }),
      debitWhatsAppActionTicketSend({ id: 'cvfy_live', userId: 'usr_1' })
    ]);
    assert.deepEqual([a, b].sort(), ['debited', 'exhausted']);
    assert.equal(store.rows.get('cvfy_live').send_count, 4);
  });

  it('sem statement de débito instalado o veredito é `unmetered` — teto de CUSTO é fail-OPEN, e só ele', async () => {
    // Decisão consciente e nomeada: fechar na dúvida transformaria uma indisponibilidade de banco em
    // "o SICAT emudeceu no meio de uma confirmação". O que NUNCA é fail-open é a QUEIMA — coberta
    // acima por `MUTAÇÃO (a2)`, que exige `rowCount = 1`.
    const semDebito = { ...store.repositories };
    delete semDebito.consumeChannelVerificationSend;
    setWhatsAppActionTicketRepositoriesForTests(semDebito);
    seedLiveTicket(store);

    assert.equal(await debitWhatsAppActionTicketSend({ id: 'cvfy_live', userId: 'usr_1' }), 'unmetered');
    const { value } = await captureConsole(() => vagueYes());
    assert.equal(value.outcome, 'whatsapp_inbound_confirmation_vague_yes', 'o canal emudeceu por falta de medição');
  });

  it('erro do banco no débito também é `unmetered` — e não silêncio', async () => {
    seedLiveTicket(store);
    store.failures.debitSend = new Error('banco fora');
    const { value } = await captureConsole(() => debitWhatsAppActionTicketSend({ id: 'cvfy_live', userId: 'usr_1' }));
    assert.equal(value, 'unmetered');
  });
});

/* ============================================================================================== */
/* OS `where` QUE NENHUM DOUBLE CONSEGUE ENXERGAR                                                  */
/* ============================================================================================== */

describe('fase 5 — as guardas atômicas moram no `where`, e isso é verificado no FONTE', () => {
  /**
   * ┌─ O LIMITE HONESTO DO DOUBLE DE BANCO ─────────────────────────────────────────────────────┐
   * │ O double acima REIMPLEMENTA a semântica do `where` do Postgres — é o que permite testar a  │
   * │ decisão sem banco. O preço é exato e nomeado: apagar `send_count < max_sends` do SQL REAL  │
   * │ não altera comportamento nenhum do double, e a mutação SOBREVIVE a toda a suíte de         │
   * │ comportamento. Medido: foi a única mutação que atravessou a campanha desta rodada.         │
   * │                                                                                            │
   * │ A resposta possível sem Postgres é ler o FONTE e afirmar que a cláusula está lá. É feio, é │
   * │ frágil a reformatação, e obriga a mudar este arquivo no mesmo PR que mudar o statement —   │
   * │ que é o ponto. Mesmo molde de `channel-link-security.test.js`. A prova definitiva continua │
   * │ sendo o teste de integração da fase 7.                                                     │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const VERIFICATION_REPO = new URL('../../src/repositories/conversation-channel-verification-repo.ts', import.meta.url);

  /** Corpo de uma função exportada, do `export async function <nome>` até o próximo `export`. */
  function bodyOf(source, fn) {
    const start = source.indexOf(`export async function ${fn}(`);
    assert.notEqual(start, -1, `função ${fn} não existe mais no repositório`);
    const next = source.indexOf('\nexport ', start + 1);
    return source.slice(start, next === -1 ? source.length : next);
  }

  function assertGuards(source, fn, clauses) {
    const body = bodyOf(source, fn);
    const normalized = body.replace(/\s+/g, ' ');
    for (const clause of clauses) {
      assert.ok(
        normalized.includes(clause),
        `${fn}: a cláusula \`${clause}\` sumiu do statement. Ela é a guarda ATÔMICA — em JS, um \`if\` `
          + 'sobre um valor lido antes deixa duas requisições concorrentes passarem juntas.'
      );
    }
  }

  const REQUIRED = [
    // O teto de CUSTO. Sem ele, cada "sim" vira mensagem paga até o TTL.
    ['consumeChannelVerificationSend', ['send_count = send_count + 1', 'consumed_at is null', 'send_count < max_sends', 'user_id = $2']],
    // O teto de PALPITES, com o `code_hash` no mesmo `returning`: o TOCTOU do OTP.
    ['consumeChannelVerificationAttempt', ['attempt_count = attempt_count + 1', 'consumed_at is null', 'expires_at > now()', 'attempt_count < max_attempts']],
    // O portão de corrida da QUEIMA: `rowCount = 1` ganhou, `rowCount = 0` perdeu e nada despacha.
    ['closeChannelVerification', ['consumed_at is null']],
    // A vivacidade que torna replay/expiração invisíveis ao `findLive` — e por isso a linha morta
    // precisa do statement próprio.
    ['findLiveChannelVerificationByUser', ['consumed_at is null', 'expires_at > now()', 'external_user_key = $3']]
  ];

  it('cada statement crítico carrega a sua guarda no `where`', () => {
    const source = readFileSync(VERIFICATION_REPO, 'utf8');
    for (const [fn, clauses] of REQUIRED) assertGuards(source, fn, clauses);
  });

  it('CONTROLE NEGATIVO: o verificador ACUSA a remoção da guarda de orçamento', () => {
    // Sem este caso, o verificador acima poderia estar procurando a cláusula no arquivo inteiro (e
    // achando em outra função), ou casando com o comentário em vez do SQL.
    const source = readFileSync(VERIFICATION_REPO, 'utf8');
    const body = bodyOf(source, 'consumeChannelVerificationSend');
    const doctored = source.replace(body, body.replace('and send_count < max_sends', ''));
    assert.notEqual(doctored, source, 'a forma do statement mudou — ajuste o controle');

    assert.throws(
      () => assertGuards(doctored, 'consumeChannelVerificationSend', ['send_count < max_sends']),
      /a cláusula `send_count < max_sends` sumiu/
    );
  });

  it('CONTROLE NEGATIVO: o verificador é ESCOPADO por função — a cláusula do vizinho não conta', () => {
    // `consumed_at is null` aparece em vários statements. Se o extrator não recortasse o corpo, a
    // remoção da guarda de UM deles passaria porque o vizinho ainda a tem.
    const source = readFileSync(VERIFICATION_REPO, 'utf8');
    const body = bodyOf(source, 'closeChannelVerification');
    const doctored = source.replace(body, body.replace('and consumed_at is null', ''));

    assert.throws(
      () => assertGuards(doctored, 'closeChannelVerification', ['consumed_at is null']),
      /a cláusula `consumed_at is null` sumiu/
    );
    // …e o statement do vizinho, intocado, continua verde no MESMO fonte adulterado.
    assertGuards(doctored, 'consumeChannelVerificationAttempt', ['consumed_at is null']);
  });

  it('a linha MORTA é lida por um statement que NÃO filtra telefone — a guarda é do service', () => {
    // A lição `m03c` gravada no fonte: um `where` que já filtrasse `external_user_key` tornaria a
    // comparação de telefone de `inspectRecentWhatsAppActionTicket` redundante, e nenhuma mutação
    // nela seria observável. Acrescentar o filtro aqui quebra este caso.
    const source = readFileSync(VERIFICATION_REPO, 'utf8');
    const body = bodyOf(source, 'findRecentChannelVerificationByUser').replace(/\s+/g, ' ');
    const sql = body.slice(body.indexOf('`select'), body.indexOf('`,', body.indexOf('`select') + 1));

    assert.ok(sql.includes('user_id = $1'));
    assert.ok(sql.includes('channel_type = $2'));
    assert.ok(sql.includes('make_interval'), 'a janela de idade sumiu — um ticket antigo sequestraria 6 dígitos para sempre');
    assert.equal(sql.includes('external_user_key'), false, 'o telefone entrou no `where` e apagou a guarda do service');
    // E ele NÃO filtra vivacidade: é justamente a linha morta que ele existe para ler.
    assert.equal(sql.includes('consumed_at is null'), false);
  });

  it('o patch de metadata pós-queima NÃO exige `consumed_at is null` — senão nada seria gravável', () => {
    const source = readFileSync(VERIFICATION_REPO, 'utf8');
    const body = bodyOf(source, 'patchChannelVerificationMetadata').replace(/\s+/g, ' ');
    assert.ok(body.includes('metadata = metadata || $3::jsonb'), 'o patch deixou de ser um merge');
    assert.ok(body.includes('user_id = $2'), 'o patch deixou de ser escopado por usuário');
    assert.equal(
      body.includes('consumed_at is null'),
      false,
      'com essa cláusula o desfecho do despacho — que acontece DEPOIS da queima — não teria onde ser gravado'
    );
  });
});

/* ============================================================================================== */
/* RESGATE — o cliente nomeia o TICKET, nunca a ferramenta                                         */
/* ============================================================================================== */

describe('fase 5 — resgate: o cliente nomeia o TICKET, nunca a ferramenta', () => {
  let store;

  beforeEach(() => {
    store = makeVerificationStore();
    setWhatsAppActionTicketRepositoriesForTests(store.repositories);
    setConfigOverride('whatsappActionsEnabled', true);
    setConfigOverride('whatsappActionTicketTtlSeconds', 300);
  });

  afterEach(() => {
    setWhatsAppActionTicketRepositoriesForTests(null);
    setRuntimeRegistryOverridesForTests(null);
    setConfigOverride('whatsappActionsEnabled', undefined);
    setConfigOverride('whatsappActionTicketTtlSeconds', undefined);
  });

  function rescue(overrides = {}) {
    const despachos = overrides.despachos || [];
    return runWhatsAppConfirmationRescue({
      utterance: { kind: 'code', code: CODE },
      principal: buildPrincipal(overrides.principal),
      link: LINK,
      correlationId: 'corr_confirm',
      dependencies: {
        processTurn: overrides.processTurn || (async (input) => {
          despachos.push(input);
          return { status: 'executed', responseText: '', conversationTurnId: 'cturn_9' };
        })
      }
    });
  }

  it('MUTAÇÃO (i): o `toolRequest` é montado a partir do TICKET — o texto da pessoa não aparece nele', async () => {
    enableIntentOnWhatsApp('manifest.batch_print_selected');
    seedLiveTicket(store);

    const despachos = [];
    const resultado = await rescue({ despachos });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_executed');
    assert.equal(despachos.length, 1);

    const body = despachos[0].body;
    assert.equal(body.toolRequest.name, 'orchestrate_manifest_operation');
    assert.equal(body.toolRequest.confirmed, true);
    assert.deepEqual(body.toolRequest.arguments, TICKET_ARGS);

    // O texto da pessoa (os 6 dígitos) NÃO transita para o motor sob nenhuma chave.
    assert.equal(JSON.stringify(body).includes(CODE), false, 'o código nunca entra no corpo do turno');
    assert.equal(body.message, '');

    // A trilha não parte em dois: o job herda o correlationId da PRÉVIA.
    assert.equal(despachos[0].correlationId, 'corr_preview');
    assert.equal(despachos[0].idempotencyKey, 'cvfy_live');
  });

  it('MUTAÇÃO (m04c): DUAS ferramentas, o MESMO texto de 6 dígitos — o despacho segue o `ticket.toolName`', async () => {
    // Com fixture de uma tool só, qualquer heurística sobre o texto coincidiria com a resposta certa
    // e o teste passaria à toa. Aqui a fala é IDÊNTICA nos dois casos e só o ticket muda: derivar a
    // ferramenta de qualquer outra fonte produz o mesmo nome nas duas rodadas e este caso quebra.
    const casos = [
      {
        toolName: 'orchestrate_manifest_operation',
        intent: 'manifest.batch_print_selected',
        frozenArgs: { intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_A, MANIFEST_B] },
        habilita: () => enableIntentOnWhatsApp('manifest.batch_print_selected')
      },
      {
        toolName: 'print_manifest',
        intent: '',
        frozenArgs: { manifestId: MANIFEST_C },
        habilita: () => enableToolOnWhatsApp('print_manifest')
      }
    ];

    const observados = [];
    for (const caso of casos) {
      store = makeVerificationStore();
      setWhatsAppActionTicketRepositoriesForTests(store.repositories);
      caso.habilita();
      seedLiveTicket(store, {
        metadata: {
          toolName: caso.toolName,
          intent: caso.intent,
          frozenArgs: caso.frozenArgs,
          argsFingerprint: fingerprintActionArgs(caso.frozenArgs),
          itemCount: 1
        }
      });

      const despachos = [];
      const resultado = await rescue({ despachos });

      assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_executed', caso.toolName);
      assert.equal(despachos.length, 1);
      assert.equal(despachos[0].body.toolRequest.name, caso.toolName);
      assert.deepEqual(despachos[0].body.toolRequest.arguments, caso.frozenArgs);
      observados.push(despachos[0].body.toolRequest.name);
    }

    // CONTROLE NEGATIVO da fixture: as duas rodadas produziram ferramentas DIFERENTES a partir da
    // mesma fala. Se um dia produzirem a mesma, a fixture parou de discriminar.
    assert.equal(new Set(observados).size, 2, 'a fixture não discrimina entre ferramentas');
  });

  it('os ARGUMENTOS vêm do ticket, mesmo apontando para manifesto que ninguém mais conhece', async () => {
    // Remontar os argumentos "do contexto atual" em vez de lê-los do jsonb congelado é a mesma classe
    // de defeito: a pessoa conferiu UMA coisa e outra seria executada.
    enableIntentOnWhatsApp('manifest.batch_print_selected');
    const frozenArgs = { intent: 'manifest.batch_print_selected', manifestIds: [MANIFEST_C], nota: 'valor arbitrario' };
    seedLiveTicket(store, {
      metadata: { frozenArgs, argsFingerprint: fingerprintActionArgs(frozenArgs) }
    });

    const despachos = [];
    await rescue({ despachos });
    assert.deepEqual(despachos[0].body.toolRequest.arguments, frozenArgs);
  });

  it('a política roda DE NOVO na queima: sem habilitação em runtime, a confirmação vira `conflict`', async () => {
    // Sem `enableIntentOnWhatsApp()`: é o cenário "operador revogou entre a prévia e o sim".
    seedLiveTicket(store);

    const despachos = [];
    const resultado = await rescue({ despachos });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_conflict');
    assert.equal(despachos.length, 0, 'nada foi despachado');
    assert.equal(store.rows.get('cvfy_live').outcome, 'conflict');
  });

  it('"sim" não confirma, não consome palpite e não despacha', async () => {
    enableIntentOnWhatsApp('manifest.batch_print_selected');
    seedLiveTicket(store);

    const despachos = [];
    const resultado = await runWhatsAppConfirmationRescue({
      utterance: { kind: 'vague_yes' },
      principal: buildPrincipal(),
      link: LINK,
      correlationId: 'corr_confirm',
      dependencies: { processTurn: async (input) => { despachos.push(input); return { status: 'executed' }; } }
    });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_vague_yes');
    assert.equal(despachos.length, 0);
    assert.equal(store.rows.get('cvfy_live').attempt_count, 0, '"sim" não pode consumir palpite');
    assert.equal(store.rows.get('cvfy_live').consumed_at, null, 'o ticket continua vivo');
  });

  it('"NAO" descarta o ticket como `cancelled` e nada é executado', async () => {
    seedLiveTicket(store);
    const resultado = await runWhatsAppConfirmationRescue({
      utterance: { kind: 'decline' },
      principal: buildPrincipal(),
      link: LINK,
      correlationId: null,
      dependencies: { processTurn: async () => { throw new Error('nada pode ser despachado'); } }
    });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_declined');
    assert.equal(store.rows.get('cvfy_live').outcome, 'cancelled');
  });

  /* ---- Desfecho do despacho gravado na trilha ------------------------------------------------- */

  it('DESPACHO BLOQUEADO: a linha registra `blocked` — `verified` sozinho seria ledger mentiroso', async () => {
    enableIntentOnWhatsApp('manifest.batch_print_selected');
    seedLiveTicket(store);

    const resultado = await rescue({
      processTurn: async () => ({ status: 'blocked', conversationTurnId: 'cturn_b' })
    });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_blocked');
    assert.equal(store.rows.get('cvfy_live').metadata.dispatchStatus, 'blocked');
    assert.equal(store.rows.get('cvfy_live').outcome, 'verified', 'a queima aconteceu — `verified` é QUEIMADO');
    assert.equal(store.inserts.length, 0, 'falha TERMINAL não pode remontar o mesmo "não"');
    assert.ok(resultado.text.includes('*nada foi executado*'));
  });

  it('DESPACHO FALHO (não-terminal): registra `failed` e REEMITE — código novo, identidade a MESMA', async () => {
    enableIntentOnWhatsApp('manifest.batch_print_selected');
    seedLiveTicket(store);

    const resultado = await rescue({
      processTurn: async () => ({ status: 'failed', conversationTurnId: 'cturn_f' })
    });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_failed');
    assert.equal(store.rows.get('cvfy_live').metadata.dispatchStatus, 'failed');
    assert.ok(resultado.text.includes('*nada foi executado*'), 'a única frase que a pessoa precisa ouvir');

    assert.equal(store.inserts.length, 1, 'o pedido não foi remontado');
    const novo = store.inserts[0];
    assert.deepEqual(novo.metadata.itemLabels, [LABEL_A, LABEL_B], 'a identidade conferida mudou na reemissão');
    assert.deepEqual(novo.metadata.frozenArgs, TICKET_ARGS);
    // O código antigo morreu com a linha: a prévia nova traz OUTRO segredo.
    assert.ok(/\*\d{6}\*/.test(resultado.text));
    assert.equal(resultado.text.includes(`*${CODE}*`), false, 'a reemissão repetiu o código já queimado');

    // O ticket novo é amarrado ao turno de AGORA: o correlationId dele é o da CONFIRMAÇÃO, não o da
    // prévia que falhou — herdar o antigo faria a trilha do pedido remontado apontar para o turno
    // errado.
    assert.equal(novo.metadata.previewCorrelationId, 'corr_confirm');

    // ┌─ EQUIVALÊNCIA MEDIDA, NÃO COBERTURA ──────────────────────────────────────────────────────┐
    // │ Trocar `input.principal.integrationAccountId` por `ticket.snapshotAccountId` na reemissão   │
    // │ NÃO é observável, e nenhum teste honesto o torna: para o fluxo chegar aqui, o `redeem`      │
    // │ passou por `checkWhatsAppTicketBinding`, que só devolve `null` quando conta e sessão do     │
    // │ ticket são IGUAIS às do contexto — e o contexto é montado a partir DESTE mesmo principal.   │
    // │ As duas expressões são provadamente o mesmo valor neste ponto. Escrever a forma "do agora"  │
    // │ continua certo (ela sobrevive se a guarda a montante mudar), mas o que se afirma abaixo é a │
    // │ INVARIANTE, não uma diferença que o teste saiba enxergar.                                   │
    // └────────────────────────────────────────────────────────────────────────────────────────────┘
    assert.equal(novo.metadata.snapshotAccountId, 'acc_TICKET');
    assert.equal(novo.metadata.snapshotSessionContextId, 'sess_TICKET');
    assert.equal(novo.metadata.stepUpWindowId, null, 'a reemissão N1 não pode carregar janela de step-up');
    assert.equal(novo.metadata.riskTier, 'N1');
  });

  it('N2 NÃO é reemitido — o crédito da janela já foi debitado na queima', async () => {
    // Reemitir cobraria DOIS créditos de orçamento para UMA ação executada. O ticket velho é N2 aqui
    // (mesmo que hoje o portão impeça N2 de ser emitido pela porta da frente): a regra da reemissão
    // é de tier, e precisa valer sozinha.
    enableIntentOnWhatsApp('manifest.batch_print_selected');
    seedLiveTicket(store, { metadata: { riskTier: 'N2', stepUpWindowId: 'cvwn_live' } });
    seedWindow(store);

    const resultado = await rescue({
      processTurn: async () => ({ status: 'failed', conversationTurnId: 'cturn_f' })
    });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_failed');
    assert.equal(store.inserts.length, 0, 'um ticket N2 foi remontado — o crédito seria debitado duas vezes');
    assert.ok(resultado.text.includes('*nada foi executado*'));
    assert.ok(resultado.text.includes('Me peca de novo'), 'sem reemissão, o texto precisa dizer o que fazer');
  });

  it('DESPACHO EXECUTADO: `dispatched` + os ids dos jobs criados vão para a trilha', async () => {
    enableIntentOnWhatsApp('manifest.batch_print_selected');
    seedLiveTicket(store);

    const resultado = await rescue({
      processTurn: async () => ({
        status: 'executed',
        conversationTurnId: 'cturn_ok',
        result: { items: [{ jobId: 'job_1' }, { jobId: 'job_2' }], nested: { deep: { jobId: 'job_3' } } }
      })
    });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_executed');
    const metadata = store.rows.get('cvfy_live').metadata;
    assert.equal(metadata.dispatchStatus, 'dispatched');
    assert.deepEqual(metadata.dispatchedJobs.sort(), ['job_1', 'job_2', 'job_3']);
    // "quais jobs esta confirmação despachou?" tem resposta na linha do ticket.
    assert.equal(metadata.confirmCorrelationId, 'corr_confirm');
  });

  it('o texto de confirmado NÃO promete um aviso que o canal não sabe dar', async () => {
    // A promessa "te aviso aqui quando terminar" era pior que o silêncio: quem confia nela não vai
    // conferir, e se o job falhar na CETESB ou for para a DLQ ninguém no telefone fica sabendo.
    enableIntentOnWhatsApp('manifest.batch_print_selected');
    seedLiveTicket(store);

    const resultado = await rescue();
    assert.equal(resultado.text.includes('Te aviso aqui quando terminar'), false);
    assert.ok(resultado.text.includes('MTRs'), 'o texto precisa mandar para onde a informação REALMENTE está');
  });
});

/* ============================================================================================== */
/* N2 — janela de ação: cobertura que estava em ZERO casos                                         */
/* ============================================================================================== */

describe('fase 5 — N2: janela de ação (step-up) na queima', () => {
  let store;

  const N2_ARGS = { intent: 'manifest.batch_submit_selected', manifestIds: [MANIFEST_A, MANIFEST_B] };

  function seedN2Ticket(metadata = {}) {
    return seedLiveTicket(store, {
      metadata: {
        intent: 'manifest.batch_submit_selected',
        frozenArgs: N2_ARGS,
        argsFingerprint: fingerprintActionArgs(N2_ARGS),
        humanSummary: 'Emitir 2 MTRs na CETESB',
        riskTier: 'N2',
        stepUpWindowId: 'cvwn_live',
        ...metadata
      }
    });
  }

  function rescue(despachos = []) {
    return runWhatsAppConfirmationRescue({
      utterance: { kind: 'code', code: CODE },
      principal: buildPrincipal(),
      link: LINK,
      correlationId: 'corr_confirm',
      dependencies: {
        processTurn: async (input) => {
          despachos.push(input);
          return { status: 'executed', conversationTurnId: 'cturn_n2' };
        }
      }
    });
  }

  beforeEach(() => {
    store = makeVerificationStore();
    setWhatsAppActionTicketRepositoriesForTests(store.repositories);
    setConfigOverride('whatsappActionsEnabled', true);
    enableIntentOnWhatsApp('manifest.batch_submit_selected');
  });

  afterEach(() => {
    setWhatsAppActionTicketRepositoriesForTests(null);
    setRuntimeRegistryOverridesForTests(null);
    setConfigOverride('whatsappActionsEnabled', undefined);
  });

  it('CAMINHO FELIZ: janela viva e com crédito → despacha, e o crédito é DEBITADO', async () => {
    seedN2Ticket();
    seedWindow(store, { attempt_count: 2, max_attempts: 10 });

    const despachos = [];
    const resultado = await rescue(despachos);

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_executed');
    assert.equal(despachos.length, 1);
    assert.equal(store.rows.get('cvwn_live').attempt_count, 3, 'o crédito da janela não foi debitado');
    assert.equal(store.rows.get('cvfy_live').outcome, 'verified');
  });

  it('SEM JANELA viva → `window_missing`, nada despacha', async () => {
    seedN2Ticket();
    const despachos = [];
    const resultado = await rescue(despachos);

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_conflict');
    assert.equal(despachos.length, 0);
    assert.equal(store.rows.get('cvfy_live').metadata.conflictReason, 'window_missing');
    assert.ok(resultado.text.includes('liberacao de acoes pelo WhatsApp foi encerrada'));
  });

  it('janela de OUTRA CONTA CETESB → `window_missing` (a conta é o que limita o estrago)', async () => {
    seedN2Ticket();
    seedWindow(store, { metadata: { integrationAccountId: 'acc_OUTRA', openedFromSessionContextId: 'sess_TICKET' } });

    const despachos = [];
    const resultado = await rescue(despachos);

    assert.equal(despachos.length, 0);
    assert.equal(store.rows.get('cvfy_live').metadata.conflictReason, 'window_missing');
    assert.equal(store.rows.get('cvwn_live').attempt_count, 0, 'a janela alheia foi debitada');
  });

  it('janela EXPIRADA → `window_missing` (o `where` do `findLive` filtra `expires_at > now()`)', async () => {
    seedN2Ticket();
    seedWindow(store, { expires_at: new Date(NOW - 1000).toISOString() });

    const despachos = [];
    await rescue(despachos);
    assert.equal(despachos.length, 0);
    assert.equal(store.rows.get('cvfy_live').metadata.conflictReason, 'window_missing');
  });

  it('ORÇAMENTO da janela esgotado → `window_exhausted`, e o débito é atômico', async () => {
    // `attempt_count < max_attempts` mora no `where`: não é um `if` que duas confirmações concorrentes
    // atravessam juntas.
    seedN2Ticket();
    seedWindow(store, { attempt_count: 10, max_attempts: 10 });

    const despachos = [];
    const resultado = await rescue(despachos);

    assert.equal(despachos.length, 0);
    assert.equal(store.rows.get('cvfy_live').metadata.conflictReason, 'window_exhausted');
    assert.equal(store.rows.get('cvwn_live').attempt_count, 10, 'o orçamento estourou e mesmo assim foi debitado');
    assert.ok(resultado.text.includes('liberacao'));
  });

  it('ticket N2 SEM `stepUpWindowId` → `window_missing`, mesmo com janela viva na conta certa', async () => {
    // A janela é amarrada por ID, não "existe alguma janela": senão um ticket emitido fora de janela
    // seria resgatável assim que qualquer janela fosse aberta.
    seedN2Ticket({ stepUpWindowId: null });
    seedWindow(store);

    const despachos = [];
    await rescue(despachos);
    assert.equal(despachos.length, 0);
    assert.equal(store.rows.get('cvfy_live').metadata.conflictReason, 'window_missing');
    assert.equal(store.rows.get('cvwn_live').attempt_count, 0);
  });

  it('janela DIFERENTE da que o ticket nomeou → `window_missing`', async () => {
    seedN2Ticket({ stepUpWindowId: 'cvwn_outra' });
    seedWindow(store);

    const despachos = [];
    await rescue(despachos);
    assert.equal(despachos.length, 0);
    assert.equal(store.rows.get('cvfy_live').metadata.conflictReason, 'window_missing');
  });

  it('CONTROLE NEGATIVO: o MESMO ticket em N1 despacha sem janela nenhuma', async () => {
    // Prova que as recusas acima vêm do tier N2 + janela, e não de o harness bloquear tudo.
    enableIntentOnWhatsApp('manifest.batch_print_selected');
    seedLiveTicket(store);

    const despachos = [];
    const resultado = await rescue(despachos);
    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_executed');
    assert.equal(despachos.length, 1);
  });

  it('POLICY antes da janela: permissão revogada recusa sem sequer tocar o crédito', async () => {
    seedN2Ticket();
    seedWindow(store);

    const despachos = [];
    const resultado = await runWhatsAppConfirmationRescue({
      utterance: { kind: 'code', code: CODE },
      // Sem `manifest.submit`: a policy recusa ANTES de a janela ser lida.
      principal: buildPrincipal({ permissionKeys: ['manifest.read', 'manifest.print'] }),
      link: LINK,
      correlationId: 'corr_confirm',
      dependencies: { processTurn: async (input) => { despachos.push(input); return { status: 'executed' }; } }
    });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_conflict');
    assert.equal(despachos.length, 0);
    assert.equal(store.rows.get('cvfy_live').metadata.conflictReason, 'policy_denied');
    assert.equal(store.rows.get('cvwn_live').attempt_count, 0, 'crédito gasto num pedido que a política recusou');
  });

  it('a janela é abrível, consultável e REVOGÁVEL — o primeiro botão de pânico do runbook', async () => {
    const janela = await openWhatsAppActionWindow({
      userId: 'usr_1',
      externalUserKey: PHONE,
      integrationAccountId: 'acc_TICKET',
      sessionContextId: 'sess_TICKET',
      hours: 4,
      budget: 10,
      correlationId: 'corr_open'
    });
    assert.ok(janela);
    assert.equal(janela.integrationAccountId, 'acc_TICKET');
    assert.equal(janela.actionsBudget, 10);

    const viva = await findLiveWhatsAppActionWindow(LINK);
    assert.equal(viva.id, janela.id);

    assert.equal(await revokeWhatsAppActionWindow({ id: janela.id, userId: 'usr_1' }), true);
    assert.equal(await findLiveWhatsAppActionWindow(LINK), null);
    assert.equal(store.rows.get(janela.id).outcome, 'cancelled');

    // Revogar duas vezes NÃO devolve `true`: o `where` tem `consumed_at is null`.
    assert.equal(await revokeWhatsAppActionWindow({ id: janela.id, userId: 'usr_1' }), false);
  });

  it('a janela é escopada por USUÁRIO — ninguém revoga nem lê a do vizinho', async () => {
    const janela = await openWhatsAppActionWindow({
      userId: 'usr_1',
      externalUserKey: PHONE,
      integrationAccountId: 'acc_TICKET',
      sessionContextId: 'sess_TICKET',
      hours: 4,
      budget: 10
    });
    assert.equal(await revokeWhatsAppActionWindow({ id: janela.id, userId: 'usr_2' }), false);
    assert.equal(store.rows.get(janela.id).consumed_at, null);
    assert.equal(await findLiveWhatsAppActionWindow({ userId: 'usr_2', externalUserKey: PHONE }), null);
  });

  it('abrir uma janela nova SUPERSEDE a anterior — o índice único vivo não admite duas', async () => {
    const primeira = await openWhatsAppActionWindow({
      userId: 'usr_1', externalUserKey: PHONE, integrationAccountId: 'acc_TICKET',
      sessionContextId: 'sess_TICKET', hours: 4, budget: 10
    });
    const segunda = await openWhatsAppActionWindow({
      userId: 'usr_1', externalUserKey: PHONE, integrationAccountId: 'acc_OUTRA',
      sessionContextId: 'sess_TICKET', hours: 8, budget: 20
    });

    assert.notEqual(primeira.id, segunda.id);
    assert.equal(store.rows.get(primeira.id).outcome, 'superseded');
    assert.equal((await findLiveWhatsAppActionWindow(LINK)).id, segunda.id);
  });
});

/* ============================================================================================== */
/* TURNO — a autorização é REAVALIADA na queima, com principal RELIDO                              */
/* ============================================================================================== */

describe('fase 5 — permissão reavaliada NA QUEIMA (principal relido do banco)', () => {
  let store;

  function buildJob(text) {
    return {
      jobId: 'job_confirm',
      entityId: 'cmsg_1',
      correlationId: 'corr_confirm',
      payload: {
        channelLinkId: 'cclk_1',
        text,
        disposition: 'process_turn',
        maskedUserKey: '+55 11 9••••-4321',
        receivedAt: new Date(NOW).toISOString()
      }
    };
  }

  /**
   * O double de principal responde conjuntos DIFERENTES por CHAMADA. Com o mesmo conjunto sempre, a
   * releitura na queima não teria como ser observada e a mutação "reuse o principal da abertura"
   * sobreviveria — que é exatamente o que aconteceu na fase 5.
   */
  function installTurn(permissionKeysPorChamada, processTurn) {
    const state = { sends: [], principalCalls: 0, despachos: [] };
    setWhatsAppTurnDependenciesForTests({
      findLink: async (id) => ({ id, userId: 'usr_1', externalUserKey: PHONE, verificationStatus: 'verified' }),
      resolveChannelPrincipal: async () => {
        const index = Math.min(state.principalCalls, permissionKeysPorChamada.length - 1);
        state.principalCalls += 1;
        return buildPrincipal({ permissionKeys: permissionKeysPorChamada[index] });
      },
      processTurn: processTurn || (async (input) => {
        state.despachos.push(input);
        return { status: 'executed', conversationTurnId: 'cturn_x' };
      }),
      resolveProvider: () => ({
        name: 'meta',
        async sendText(input) { state.sends.push(input); return { providerMessageId: 'wamid.1' }; }
      }),
      insertAuditEntry: async () => {},
      now: () => NOW
    });
    return state;
  }

  beforeEach(() => {
    store = makeVerificationStore();
    setWhatsAppActionTicketRepositoriesForTests(store.repositories);
    setConfigOverride('whatsappActionsEnabled', true);
    enableIntentOnWhatsApp('manifest.batch_print_selected');
    resetWhatsAppExpiredNoticeThrottleForTests();
    resetWhatsAppInactiveNoticeThrottleForTests();
  });

  afterEach(() => {
    setWhatsAppTurnDependenciesForTests(null);
    setWhatsAppActionTicketRepositoriesForTests(null);
    setRuntimeRegistryOverridesForTests(null);
    setConfigOverride('whatsappActionsEnabled', undefined);
    resetWhatsAppExpiredNoticeThrottleForTests();
    resetWhatsAppInactiveNoticeThrottleForTests();
  });

  const patchNoop = async (job, patch) => { Object.assign(job.payload, patch); };

  it('CONTROLE NEGATIVO: com a permissão INTACTA nas duas leituras, a confirmação despacha', async () => {
    seedLiveTicket(store);
    const state = installTurn([['manifest.read', 'manifest.print'], ['manifest.read', 'manifest.print']]);

    const resultado = await runWhatsAppInboundTurn({ job: buildJob(CODE), patchJobPayload: patchNoop });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_executed');
    assert.equal(state.despachos.length, 1);
    assert.equal(state.principalCalls, 2, 'o principal não foi relido antes da queima');
  });

  it('MUTAÇÃO (m11): permissão REVOGADA entre a emissão e a confirmação BLOQUEIA', async () => {
    // A releitura é o que dá SUJEITO à reavaliação: a policy corre sobre `principal.permissionKeys`,
    // e "reavaliar" só quer dizer alguma coisa se o principal vier de uma SEGUNDA ida ao banco.
    // Trocar `redeemPrincipal` de volta para o principal da abertura faz este caso quebrar.
    seedLiveTicket(store);
    const state = installTurn([
      ['manifest.read', 'manifest.print'],   // abertura do turno: ainda tem a chave
      ['manifest.read']                       // queima: o administrador revogou
    ]);

    const resultado = await runWhatsAppInboundTurn({ job: buildJob(CODE), patchJobPayload: patchNoop });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_conflict');
    assert.equal(state.despachos.length, 0, 'a ação foi despachada com permissão revogada');
    assert.equal(state.principalCalls, 2);
    assert.equal(store.rows.get('cvfy_live').outcome, 'conflict');
    assert.equal(store.rows.get('cvfy_live').metadata.conflictReason, 'policy_denied');
    assert.equal(state.sends.length, 1, 'a pessoa precisa saber que nada foi executado');
  });

  it('a releitura é SÓ para `code` — "sim" não paga a consulta', async () => {
    // `vague_yes` não autoriza efeito irreversível; pagar uma consulta por "sim" seria custo puro no
    // exato cenário de amplificação que o orçamento de saídas existe para conter.
    seedLiveTicket(store);
    const state = installTurn([['manifest.read', 'manifest.print']]);

    const resultado = await runWhatsAppInboundTurn({ job: buildJob('sim'), patchJobPayload: patchNoop });

    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_vague_yes');
    assert.equal(state.principalCalls, 1);
  });

  it('usuário DESATIVADO entre a abertura e a queima cancela o ticket e não despacha', async () => {
    seedLiveTicket(store);
    let chamadas = 0;
    const state = { sends: [], despachos: [] };
    setWhatsAppTurnDependenciesForTests({
      findLink: async (id) => ({ id, userId: 'usr_1', externalUserKey: PHONE, verificationStatus: 'verified' }),
      resolveChannelPrincipal: async () => {
        chamadas += 1;
        if (chamadas >= 2) {
          throw new AppError(401, 'Unauthorized', 'inativo', { code: 'CONVERSATION_PRINCIPAL_USER_INACTIVE' });
        }
        return buildPrincipal();
      },
      processTurn: async (input) => { state.despachos.push(input); return { status: 'executed' }; },
      resolveProvider: () => ({
        name: 'meta',
        async sendText(input) { state.sends.push(input); return { providerMessageId: 'wamid.2' }; }
      }),
      insertAuditEntry: async () => {},
      now: () => NOW
    });

    const resultado = await runWhatsAppInboundTurn({ job: buildJob(CODE), patchJobPayload: patchNoop });

    assert.equal(resultado.outcome, 'whatsapp_inbound_user_inactive');
    assert.equal(state.despachos.length, 0);
    assert.equal(store.rows.get('cvfy_live').outcome, 'cancelled', 'o ticket vivo de um usuário desativado sobreviveu');
    assert.ok(state.sends[0].text.includes('inativo'));
  });

  it('com o disjuntor DESLIGADO nada disso roda: 6 dígitos são texto comum e o ticket nem é lido', async () => {
    setConfigOverride('whatsappActionsEnabled', false);
    seedLiveTicket(store);
    const state = installTurn([['manifest.read', 'manifest.print']], async (input) => {
      state.despachos.push(input);
      return { status: 'answered', responseText: 'resposta do modelo', conversationTurnId: 'cturn_llm' };
    });

    const resultado = await runWhatsAppInboundTurn({ job: buildJob(CODE), patchJobPayload: patchNoop });

    assert.equal(resultado.outcome, 'whatsapp_inbound_answered');
    assert.equal(state.principalCalls, 1);
    assert.equal(store.rows.get('cvfy_live').consumed_at, null);
    // O turno normal roda com `allowActions: false` — byte-a-byte o canal de hoje.
    assert.equal(state.despachos[0].body.options.allowActions, false);
  });
});

/* ============================================================================================== */

describe('fase 5 — usuário INATIVO é desfecho de canal, não exceção técnica', () => {
  function buildJob() {
    return {
      jobId: 'job_inactive',
      entityId: 'cmsg_1',
      correlationId: 'corr_inactive',
      payload: {
        channelLinkId: 'cclk_1',
        text: 'meus MTRs de hoje',
        disposition: 'process_turn',
        maskedUserKey: '+55 11 9••••-4321',
        receivedAt: new Date().toISOString()
      }
    };
  }

  function installTurnDoubles(resolveChannelPrincipal) {
    const state = { sends: [], audits: [] };
    setWhatsAppTurnDependenciesForTests({
      findLink: async (id) => ({ id, userId: 'usr_1', externalUserKey: PHONE, verificationStatus: 'verified' }),
      resolveChannelPrincipal,
      processTurn: async () => { throw new Error('o turno não pode rodar com usuário inativo'); },
      resolveProvider: () => ({
        name: 'meta',
        async sendText(input) { state.sends.push(input); return { providerMessageId: 'wamid.1' }; }
      }),
      insertAuditEntry: async (entry) => { state.audits.push(entry); },
      now: () => Date.now()
    });
    return state;
  }

  beforeEach(() => {
    resetWhatsAppInactiveNoticeThrottleForTests();
  });

  afterEach(() => {
    setWhatsAppTurnDependenciesForTests(null);
    resetWhatsAppInactiveNoticeThrottleForTests();
  });

  it('MUTAÇÃO (f): 401 de usuário inativo vira `whatsapp_inbound_user_inactive`, não `failed`', async () => {
    const state = installTurnDoubles(async () => {
      throw new AppError(401, 'Unauthorized', 'Usuário SICAT vinculado ao canal está inativo.', {
        code: 'CONVERSATION_PRINCIPAL_USER_INACTIVE'
      });
    });

    const job = buildJob();
    const result = await runWhatsAppInboundTurn({
      job,
      patchJobPayload: async (target, patch) => { Object.assign(target.payload, patch); }
    });

    assert.equal(result.outcome, 'whatsapp_inbound_user_inactive');
    assert.equal(state.sends.length, 1, 'UMA mensagem por vínculo por 24 h — o mudo indefinido era o defeito');
    assert.ok(state.sends[0].text.includes('inativo'));
    assert.equal(result.patch.replyText, null, 'o texto não fica residente em `jobs`');
  });

  it('a segunda mensagem do MESMO vínculo é silêncio — avisar sem limite é o defeito oposto', async () => {
    const state = installTurnDoubles(async () => {
      throw new AppError(401, 'Unauthorized', 'inativo', { code: 'CONVERSATION_PRINCIPAL_USER_INACTIVE' });
    });

    const patch = async (target, p) => { Object.assign(target.payload, p); };
    await runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: patch });
    const segundo = await runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: patch });

    assert.equal(state.sends.length, 1);
    assert.equal(segundo.outcome, 'whatsapp_inbound_user_inactive', 'o desfecho sobrevive — não vira `ignored`');
    assert.equal(segundo.patch.userNotified, false);
  });

  it('MUTAÇÃO (g): o catch é ESTREITO — outro `AppError` continua PROPAGANDO', async () => {
    installTurnDoubles(async () => {
      throw new AppError(503, 'Service Unavailable', 'banco fora', { code: 'DB_UNAVAILABLE' });
    });

    await assert.rejects(
      () => runWhatsAppInboundTurn({ job: buildJob(), patchJobPayload: async () => {} }),
      (error) => {
        assert.equal(error.code, 'DB_UNAVAILABLE', 'um catch-all transformaria incidente de banco em "usuário inativo"');
        return true;
      }
    );
  });
});

/* ============================================================================================== */
/* UNIDADE D4 — as prévias de conferência LIGADAS, e o portão do N2 ainda FECHADO                  */
/* ============================================================================================== */

describe('D4 — recebimento e criação: prévia dedicada manda, e o portão do N2 continua fechado', () => {
  /**
   * Doubles DE LEITURA (repositório de manifestos, cadastro de parceiros, catálogo de resíduos) —
   * nunca da decisão sob teste. Valores DISTINTOS POR IDENTIDADE: cada id devolve outro número, outro
   * gerador e outro resíduo; cada código de parceiro devolve outra razão social. Um double que
   * devolvesse o mesmo rótulo para todos faria "resolva sempre o primeiro" sobreviver.
   */
  const RECEBER_A = `man_${'1'.repeat(26)}`;
  const RECEBER_B = `man_${'2'.repeat(26)}`;

  const LINHAS_CRUAS = new Map([
    [RECEBER_A, {
      id: RECEBER_A,
      externalReference: { manNumero: '202600777001', manCodigo: 555001 },
      externalHashCode: 'hash_A',
      payload: {
        expeditionDate: '2026-03-12',
        generator: { partnerCode: 40110, description: 'NOVA IT AMBIENTAL LTDA' },
        residues: [{ quantity: 2.5, receivedQuantity: null, unit: { symbol: 't' }, residue: { description: 'Oleo lubrificante usado' } }]
      }
    }],
    [RECEBER_B, {
      id: RECEBER_B,
      externalReference: { manNumero: '202600777002', manCodigo: 555002 },
      externalHashCode: 'hash_B',
      payload: {
        expeditionDate: '2026-04-20',
        generator: { partnerCode: 40222, description: 'RECICLA SP LTDA' },
        residues: [{ quantity: 400, receivedQuantity: 380, unit: { symbol: 'kg' }, residue: { description: 'Borra de tinta' } }]
      }
    }]
  ]);

  /** Cadastro: código → razão social. Distinto por papel, para a troca de papel não ficar invisível. */
  const PARCEIROS = new Map([
    ['70001', 'GERADORA CENTRAL LTDA'],
    ['70002', 'TRANSPORTES BETA LTDA'],
    ['70003', 'ATERRO GAMA S/A']
  ]);
  const RESIDUOS = new Map([['A099', 'Residuo solido industrial']]);

  let store;
  let leituras;

  function payloadDeCriacaoCompleto(overrides = {}) {
    return {
      generator: { partnerCode: '70001' },
      carrier: { partnerCode: '70002' },
      receiver: { partnerCode: '70003' },
      residues: [{ residue: { code: 'A099' }, quantity: 3, unit: { symbol: 't' } }],
      expeditionDate: '2026-08-10',
      ...overrides
    };
  }

  function issueFrom(args, overrides = {}) {
    return tryIssueWhatsAppActionTicket({
      output: {
        status: 'blocked',
        policy: { reasonCode: 'CONFIRMATION_REQUIRED' },
        toolCall: { name: overrides.toolName || 'orchestrate_manifest_operation', arguments: args },
        conversationSessionId: 'csess_d4',
        conversationTurnId: 'cturn_d4'
      },
      principal: buildPrincipal(overrides.principal),
      link: LINK,
      correlationId: 'corr_d4'
    });
  }

  const argsRecebimento = (overrides = {}) => ({
    intent: 'manifest.receive_with_receipt',
    manifestId: RECEBER_A,
    receiptPayload: { remDataRecebimento: '2026-08-07', remObservacao: 'chegou lacrado' },
    ...overrides
  });

  const argsCriacao = (overrides = {}) => ({
    intent: 'manifest.create_from_payload',
    payload: payloadDeCriacaoCompleto(),
    ...overrides
  });

  beforeEach(() => {
    store = makeVerificationStore();
    leituras = { manifestos: [], parceiros: [], residuos: [] };
    setWhatsAppActionTicketRepositoriesForTests(store.repositories);
    setConfigOverride('whatsappActionTicketTtlSeconds', 300);

    // Os TRÊS seams devolvem LINHA CRUA — nenhum deles reimplementa a decisão sob teste.
    //
    // ⚠️ O seam do fluxo (`setWhatsAppConfirmationRepositoriesForTests`) é OBRIGATÓRIO aqui mesmo
    // que a via genérica não devesse ser alcançada: sem ele, uma regressão que ignore a prévia
    // dedicada cai no repositório REAL, o `select` não acha `man_111…` e o teste passa por ACIDENTE
    // (e passa a depender de haver Postgres na máquina). Medido: com o seam ausente, a mutação que
    // ignora `canIssueTicket:false` matava 1 caso; com ele, mata 3.
    setWhatsAppConfirmationRepositoriesForTests({
      findManifestById: async (id) => {
        leituras.manifestos.push(id);
        return LINHAS_CRUAS.get(id);
      }
    });
    setWhatsAppReceivePreviewRepositoriesForTests({
      findManifestById: async (id) => {
        leituras.manifestos.push(id);
        return LINHAS_CRUAS.get(id);
      }
    });
    setWhatsAppCreatePreviewResolversForTests({
      findManifestById: async (id) => {
        leituras.manifestos.push(id);
        return LINHAS_CRUAS.get(id);
      },
      resolvePartnerLabel: async ({ code, role }) => {
        leituras.parceiros.push(`${role}:${code}`);
        return PARCEIROS.get(String(code)) ?? null;
      },
      resolveResidueLabel: async ({ code }) => {
        leituras.residuos.push(String(code));
        return RESIDUOS.get(String(code)) ?? null;
      }
    });
  });

  afterEach(() => {
    setWhatsAppActionTicketRepositoriesForTests(null);
    setWhatsAppConfirmationRepositoriesForTests(null);
    setWhatsAppReceivePreviewRepositoriesForTests(null);
    setWhatsAppCreatePreviewResolversForTests(null);
    setConfigOverride('whatsappActionTicketTtlSeconds', undefined);
    setConfigOverride('whatsappActionNoticeEnabled', undefined);
  });

  /* ---- a promoção, na tabela --------------------------------------------------------------- */

  it('as duas chaves saíram da recusa e entraram como N2 com `maxItems: 1`', () => {
    for (const key of [WHATSAPP_RECEIVE_ACTION_KEY, WHATSAPP_CREATE_ACTION_KEY]) {
      assert.equal(CHANNEL_HARD_DENY.has(key), false, `${key} continua na recusa permanente`);
      assert.deepEqual(getWhatsAppEligibleAction(key), { tier: 'N2', maxItems: 1 }, key);
    }

    // O overlay do AI Control Center agora CONSEGUE ligá-las — é o que "promover" significa.
    assert.ok(
      resolveEffectiveAllowChannels({
        key: WHATSAPP_RECEIVE_ACTION_KEY,
        codeChannels: ['native_chat', 'inapp'],
        overlayChannels: ['whatsapp', 'native_chat', 'inapp']
      }).includes('whatsapp')
    );

    // CONTROLE NEGATIVO: as que NÃO foram promovidas continuam recusadas com o mesmo overlay.
    for (const key of ['manifest.create_draft', 'cancel_manifest', 'replicate_manifest', 'cdf.generate_from_manifest_selection']) {
      assert.equal(
        resolveEffectiveAllowChannels({
          key,
          codeChannels: ['native_chat', 'inapp'],
          overlayChannels: ['whatsapp', 'native_chat', 'inapp']
        }).includes('whatsapp'),
        false,
        `${key} foi promovida junto — a D4 promove DUAS chaves, não a recusa inteira`
      );
    }
  });

  it('MUTAÇÃO (headline ausente): TODA chave elegível tem manchete — sem ela o ticket some sem erro', () => {
    // A falha é SILENCIOSA: `buildActionHeadline` devolve `null`, `tryIssueWhatsAppActionTicket`
    // trata `null` como "não é caso de ticket" e a ação desaparece do canal sem log nem exceção.
    // Apagar qualquer linha de `ACTION_HEADLINES` faz este caso quebrar.
    for (const key of Object.keys(WHATSAPP_ELIGIBLE_ACTIONS)) {
      const headline = buildActionHeadline(key, 1);
      assert.equal(typeof headline, 'string', `${key} não tem manchete em ACTION_HEADLINES`);
      assert.ok(headline.trim().length >= 3, `${key}: manchete vazia`);
    }

    // CONTROLE NEGATIVO: chave inexistente continua devolvendo `null` (o medidor enxerga a diferença).
    assert.equal(buildActionHeadline('manifest.chave_que_nao_existe', 1), null);

    // A manchete do recebimento é a MESMA que a prévia dedicada declara — dois literais que divergem
    // dariam dois nomes à mesma ação (um na prévia, outro em toda mensagem de erro do ticket).
    assert.equal(buildActionHeadline(WHATSAPP_RECEIVE_ACTION_KEY, 1), 'Dar baixa (receber) em 1 MTR');

    // E a chave da criação é literal só no fluxo — este caso prende que ela existe na matriz.
    assert.ok(Object.prototype.hasOwnProperty.call(WHATSAPP_ELIGIBLE_ACTIONS, WHATSAPP_CREATE_ACTION_KEY));
  });

  /* ---- o portão do N2, que esta entrega NÃO abre -------------------------------------------- */

  it('recebimento CONFERÍVEL não emite ticket: responde "aviso indisponível" — e a env não abre', async () => {
    // O desfecho ESPERADO E CORRETO desta entrega. A conferência existe e fecha; o que falta é a
    // lista E1–E5 do aviso de conclusão, e a E1 (execução real contra provedor) não tem como ser
    // produzida sem credenciais. Ligar `WHATSAPP_ACTION_NOTICE_ENABLED` e ver o MESMO "não" é o ponto.
    setConfigOverride('whatsappActionNoticeEnabled', true);
    seedWindow(store);

    const resultado = await issueFrom(argsRecebimento());

    assert.equal(resultado.outcome, 'whatsapp_inbound_action_notice_missing');
    assert.equal(store.inserts.length, 0, 'ticket N2 emitido — nada pendente pode existir para ser confirmado');
    // Texto COM O VERBO DA AÇÃO: reusar o de emissão diria à pessoa que ela pediu para emitir.
    assert.ok(resultado.text.startsWith('Dar baixa por aqui ainda nao esta no ar'), resultado.text);
    assert.equal(resultado.text.includes('Emitir MTR por aqui'), false);
  });

  it('criação CONFERÍVEL não emite ticket, e o texto NÃO inventa resposta da CETESB', async () => {
    setConfigOverride('whatsappActionNoticeEnabled', true);
    seedWindow(store);

    const resultado = await issueFrom(argsCriacao());

    assert.equal(resultado.outcome, 'whatsapp_inbound_action_notice_missing');
    assert.equal(store.inserts.length, 0);
    assert.ok(resultado.text.startsWith('Criar MTR por aqui ainda nao esta liberado'), resultado.text);
    // `manifest.create_from_payload` grava rascunho LOCAL (`createManifestDraftRecord`): não há
    // resposta da CETESB para esperar, e afirmar que há seria mais uma afirmação falsa desta cadeia.
    assert.equal(resultado.text.includes('CETESB responde'), false);
  });

  it('CONTROLE NEGATIVO do portão: a MESMA emissão em N1 passa e emite ticket', async () => {
    // Prova que o "não" das duas acima vem do tier, e não de o harness recusar tudo — e, de quebra,
    // que a via GENÉRICA está viva no mesmo harness (é ela que resolve `manifestIds` aqui).
    setConfigOverride('whatsappActionNoticeEnabled', true);
    const resultado = await issueFrom({ intent: 'manifest.batch_print_selected', manifestIds: [RECEBER_A] });
    assert.equal(resultado.outcome, 'whatsapp_inbound_confirmation_pending');
    assert.equal(store.inserts.length, 1);
    assert.ok(resultado.text.includes('MTR 202600777001'), resultado.text);
  });

  /* ---- a guarda da unidade: `canIssueTicket:false` / `ok:false` ⇒ NENHUM ticket ------------- */

  it('MUTAÇÃO (guarda do recebimento): payload de baixa VAZIO não emite e nem chega ao portão', async () => {
    // A prova de que a prévia dedicada está no caminho. Sem ela, a via genérica resolveria o rótulo
    // de `manifestId` (o double devolve a linha) e o desfecho seria `notice_missing`. Ignorar
    // `canIssueTicket:false` faz este caso virar `notice_missing` e quebrar.
    const anterior = seedLiveTicket(store);
    const { value: resultado, text: log } = await captureConsole(() =>
      issueFrom(argsRecebimento({ receiptPayload: undefined }))
    );

    assert.equal(resultado, null, 'a recusa da prévia dedicada não foi honrada');
    assert.equal(store.inserts.length, 0);
    assert.equal(anterior.consumed_at, null, 'o ticket pendente legítimo foi destruído por uma tentativa recusada');
    assert.ok(log.includes('receipt_payload_missing'), log);
  });

  it('MUTAÇÃO (guarda do recebimento): override que a prévia não mostra recusa o ticket', async () => {
    // `rrmCodigo` muda o que será registrado e a conferência não o exibe — mostrar menos do que se
    // executa é o defeito de "listar 3 e executar 5". Sem a guarda, a via genérica resolveria o
    // rótulo do `manifestId` e o desfecho seria `notice_missing`.
    const { value: resultado, text: log } = await captureConsole(() =>
      issueFrom(argsRecebimento({ receiptPayload: { remDataRecebimento: '2026-08-07', rrmCodigo: 91 } }))
    );
    assert.equal(resultado, null);
    assert.equal(store.inserts.length, 0);
    assert.ok(log.includes('receipt_overrides_not_supported'), log);
  });

  it('MUTAÇÃO (guarda do recebimento): número nomeado que CONTRADIZ o manifesto recusa', async () => {
    // Valores distintos por identidade: o `manifestId` aponta para A e o payload nomeia o número de B.
    const { value: resultado, text: log } = await captureConsole(() =>
      issueFrom(argsRecebimento({
        receiptPayload: { remDataRecebimento: '2026-08-07', manNumero: '202600777002' }
      }))
    );
    assert.equal(resultado, null);
    assert.equal(store.inserts.length, 0);
    assert.ok(log.includes('target_mismatch'), log);

    // CONTROLE NEGATIVO: o MESMO número, agora coerente com o manifesto apontado, chega ao portão.
    const coerente = await issueFrom(argsRecebimento({
      manifestId: RECEBER_B,
      receiptPayload: { remDataRecebimento: '2026-08-07', manNumero: '202600777002' }
    }));
    assert.equal(coerente.outcome, 'whatsapp_inbound_action_notice_missing');
  });

  it('MUTAÇÃO (guarda da criação): entidade que não vira NOME humano recusa o ticket', async () => {
    // `70009` não está no cadastro: o destinador fica em código cru. Trocar o fail-closed da prévia
    // por "emite com o que resolveu" faz este caso virar `notice_missing` e quebrar.
    const { value: resultado, text: log } = await captureConsole(() =>
      issueFrom(argsCriacao({ payload: payloadDeCriacaoCompleto({ receiver: { partnerCode: '70009' } }) }))
    );

    assert.equal(resultado, null);
    assert.equal(store.inserts.length, 0);
    // O double FOI consultado — a recusa não é "ninguém perguntou".
    assert.ok(leituras.parceiros.includes('receiver:70009'), JSON.stringify(leituras.parceiros));
    // A criação não tem manifesto para a via genérica resolver, então o `null` sozinho não distingue
    // "a guarda agiu" de "ninguém achou rótulo". Quem distingue é o MOTIVO no log — sem a guarda ele
    // não existe, e este caso quebra.
    assert.ok(log.includes('unresolved_entities'), log);
  });

  it('MUTAÇÃO (guarda da criação): payload VAZIO recusa — e a via genérica não o salva', async () => {
    const { value: resultado, text: log } = await captureConsole(() => issueFrom(argsCriacao({ payload: {} })));
    assert.equal(resultado, null);
    assert.equal(store.inserts.length, 0);
    assert.ok(log.includes('empty_payload'), log);
  });

  it('MUTAÇÃO (snapshot de criação): `creationSnapshot` codificado recusa — a execução veria MAIS', async () => {
    // `handleManifestCreateFromPayload` executa `{...snapshotPayload, ...args.payload}` e só ELE
    // decodifica o blob. Com snapshot, a prévia mostraria menos do que seria criado. Apagar
    // `hasEncodedCreationSnapshot` faz este caso virar `notice_missing` e quebrar.
    const { value: resultado, text: log } = await captureConsole(() =>
      issueFrom(argsCriacao({ creationSnapshot: 'eyJzbmFwc2hvdFZlcnNpb24iOiJ2MSJ9' }))
    );
    assert.equal(resultado, null);
    assert.equal(store.inserts.length, 0);
    assert.ok(log.includes('creation_snapshot_not_conferible'), log);

    // CONTROLE NEGATIVO 1: os MESMOS argumentos sem o snapshot chegam ao portão.
    const semSnapshot = await issueFrom(argsCriacao());
    assert.equal(semSnapshot.outcome, 'whatsapp_inbound_action_notice_missing');

    // CONTROLE NEGATIVO 2: `selectionSnapshot` como OBJETO não decodifica no dispatcher (o parser usa
    // `toNullableString`), logo não muda o payload executado — e também não recusa aqui.
    const objeto = await issueFrom(argsCriacao({ selectionSnapshot: { selectedManifestIds: [] } }));
    assert.equal(objeto.outcome, 'whatsapp_inbound_action_notice_missing');
  });

  /* ---- o bloco de conferência na prévia do ticket (camada de texto) -------------------------- */

  it('o bloco de conferência SUBSTITUI a lista genérica e a cauda do ticket continua inteira', async () => {
    // O caminho de emissão fica inalcançável enquanto o portão N2 está fechado, então a montagem é
    // verificada onde ela mora: `buildWhatsAppConfirmationPreview`.
    const conferencia = await buildWhatsAppReceiveConference(argsRecebimento());
    assert.equal(conferencia.canIssueTicket, true);

    const previa = buildWhatsAppConfirmationPreview({
      headline: 'Dar baixa (receber) em 1 MTR',
      items: [{ label: conferencia.manifestLabel }],
      accountLabel: 'NOVA IT AMBIENTAL (12.345.678/0001-90)',
      code: '481902',
      ttlSeconds: 300,
      ticketId: 'cvfy_d4',
      supersededSummary: null,
      windowLine: 'Liberacao ativa - esta seria a 1a de 3 acoes.',
      irreversibleWarning: null,
      conferenceBlock: conferencia.text
    });

    assert.ok(previa.includes('*Dar baixa (receber) no MTR 202600777001*'), previa);
    assert.ok(previa.includes('- Oleo lubrificante usado: 2,5 t'), previa);
    // A manchete genérica NÃO é repetida acima do bloco — dois títulos para a mesma coisa.
    assert.equal(previa.includes('Confere antes de eu executar:'), false);
    // A cauda do ticket é do ticket, e continua toda lá.
    assert.ok(previa.includes('Conta CETESB: NOVA IT AMBIENTAL (12.345.678/0001-90)'));
    assert.ok(previa.includes('Liberacao ativa - esta seria a 1a de 3 acoes.'));
    assert.ok(previa.includes('responda so com o codigo *481902*'));
    assert.ok(previa.includes('Protocolo: cvfy_d4'));

    // CONTROLE NEGATIVO: sem bloco, a MESMA chamada volta à lista genérica.
    const generica = buildWhatsAppConfirmationPreview({
      headline: 'Dar baixa (receber) em 1 MTR',
      items: [{ label: conferencia.manifestLabel }],
      accountLabel: null,
      code: '481902',
      ttlSeconds: 300,
      ticketId: 'cvfy_d4'
    });
    assert.ok(generica.includes('Confere antes de eu executar:'));
    assert.equal(generica.includes('- Oleo lubrificante usado: 2,5 t'), false);
  });

  it('bloco presente mas SEM rótulo conferível continua devolvendo `null` — a guarda não foi afrouxada', () => {
    // O bloco é texto já formatado; deixá-lo satisfazer a guarda faria um id interno virar
    // "conferência" só por estar dentro de um parágrafo bonito.
    const semRotulo = buildWhatsAppConfirmationPreview({
      headline: 'Dar baixa (receber) em 1 MTR',
      items: [{ label: `man_${'a'.repeat(26)}` }],
      accountLabel: null,
      code: '481902',
      ttlSeconds: 300,
      ticketId: 'cvfy_d4',
      conferenceBlock: '*Dar baixa (receber) no MTR 202600777001*\nGerador: NOVA IT AMBIENTAL LTDA'
    });
    assert.equal(semRotulo, null);
  });

  it('o texto do portão por ação: `submit` intacto, e sem entrada o padrão é o de emissão', () => {
    // O texto de `submit` é asserido palavra por palavra em outro caso desta suíte; aqui se prende
    // que a tabela nova NÃO o reescreveu, e que uma chave desconhecida cai no desfecho seguro.
    assert.equal(buildWhatsAppN2NoticeMissingText('submit_manifest'), WHATSAPP_N2_NOTICE_MISSING_TEXT);
    assert.equal(buildWhatsAppN2NoticeMissingText('manifest.batch_submit_selected'), WHATSAPP_N2_NOTICE_MISSING_TEXT);
    assert.equal(buildWhatsAppN2NoticeMissingText('chave.desconhecida'), WHATSAPP_N2_NOTICE_MISSING_TEXT);
    assert.equal(buildWhatsAppN2NoticeMissingText('constructor'), WHATSAPP_N2_NOTICE_MISSING_TEXT);

    // E que as duas promovidas têm texto PRÓPRIO — não o de emissão.
    assert.notEqual(buildWhatsAppN2NoticeMissingText(WHATSAPP_RECEIVE_ACTION_KEY), WHATSAPP_N2_NOTICE_MISSING_TEXT);
    assert.notEqual(buildWhatsAppN2NoticeMissingText(WHATSAPP_CREATE_ACTION_KEY), WHATSAPP_N2_NOTICE_MISSING_TEXT);
  });
});
