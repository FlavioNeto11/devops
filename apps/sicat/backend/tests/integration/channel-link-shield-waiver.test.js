import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../../src/db/pool.js';
import { createPrefixedId } from '../../src/lib/ids.js';
import { setConfigOverride } from '../../src/lib/config.js';
import { hashPassword } from '../../src/lib/sicat-security.js';
import {
  countDistinctChallengersForPhone,
  insertChannelVerification
} from '../../src/repositories/conversation-channel-verification-repo.js';
import { insert as insertSicatUser } from '../../src/repositories/sicat-user-repo.js';
import { setWhatsAppProviderOverrideForTests } from '../../src/services/conversation/channel/whatsapp/index.js';
import {
  resetChannelLinkDispatchLimiterForTests,
  startChannelLinkService,
  waiveChannelLinkVictimShieldService
} from '../../src/services/conversation-channel-link-service.js';

/**
 * Waiver administrativo do escudo da vítima (D-A2) — contra POSTGRES DE VERDADE.
 *
 * A suíte unitária (`channel-link-security.test.js`) prova o fluxo com doubles e congela o TEXTO dos
 * statements; ela não consegue provar que a cláusula de waiver funciona NO BANCO. Estes casos são os
 * assassinos de mutação comportamentais:
 *  - apagar `coalesce(metadata->>'shieldWaived', …)` do `where` da contagem → a contagem não cai
 *    depois do waiver e o primeiro caso morre;
 *  - apagar a chamada de `ensureAdminAuthorization` no service → o não-admin passa a liberar número
 *    e o caso do gate morre (aqui o gate REAL roda, inclusive a consulta `hasAdminGlobalAccessByUserId`).
 *
 * Identificadores e telefones são ÚNICOS por execução: o banco é o compose compartilhado da máquina
 * e a suíte não pode colidir com dados de outra execução.
 */

const RUN_TAG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function uniquePhone() {
  // 5511 9 + 8 dígitos: forma canônica de 13 dígitos — a canonicalização a devolve intacta.
  const subscriber = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  return `55119${subscriber}`;
}

const PHONE_WAIVE = uniquePhone();
const PHONE_E2E = uniquePhone();
const PHONE_GATE = uniquePhone();

const ADMIN_ID = createPrefixedId('usr');
const NON_ADMIN_ID = createPrefixedId('usr');
const VICTIM_ID = createPrefixedId('usr');
const ATTACKER_IDS = [
  createPrefixedId('usr'),
  createPrefixedId('usr'),
  createPrefixedId('usr'),
  createPrefixedId('usr')
];
const ALL_USER_IDS = [ADMIN_ID, NON_ADMIN_ID, VICTIM_ID, ...ATTACKER_IDS];

/** Papel de admin NO TOKEN: o gate aceita sem depender do seed de RBAC deste banco. */
const ADMIN_USER = { userId: ADMIN_ID, roles: ['admin'] };
/** Sem papel no token E sem grant no banco: o gate consulta `access_user_roles` de verdade e nega. */
const NON_ADMIN_USER = { userId: NON_ADMIN_ID, roles: [] };

/** scrypt é caro; um hash de mentira serve — nenhum caso daqui confirma código. */
const CODE_HASH = hashPassword('000000');

async function insertChallenger(userId, phone) {
  return insertChannelVerification(null, {
    id: createPrefixedId('cvfy'),
    channelType: 'whatsapp',
    externalUserKey: phone,
    userId,
    codeHash: CODE_HASH,
    maxAttempts: 5,
    maxSends: 3,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    metadata: { testRun: RUN_TAG }
  });
}

async function shieldCount(phone, exceptUserId) {
  return countDistinctChallengersForPhone(null, {
    channelType: 'whatsapp',
    externalUserKey: phone,
    windowHours: 24,
    exceptUserId
  });
}

async function captureRejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('esperava rejeição, mas a promessa resolveu');
  return null;
}

function fakeProvider(calls) {
  return {
    name: 'twilio',
    verifyWebhookSignature: () => true,
    parseInboundMessages: () => [],
    handleVerificationChallenge: () => null,
    async sendText() {
      return { providerMessageId: 'SM_text' };
    },
    async sendMedia() {
      return { providerMessageId: 'SM_media' };
    },
    async sendTemplate(input) {
      calls.push(input);
      return { providerMessageId: 'SM_template' };
    }
  };
}

describe('waiver do escudo da vítima — integração com Postgres', () => {
  before(async () => {
    // Pelo repositório, não por SQL cru: o insert de usuário tem colunas que um `insert into` local
    // esquece (`password_expires_at`, `is_active`) e que mudam com a próxima migration de auth.
    for (const userId of ALL_USER_IDS) {
      await insertSicatUser({
        id: userId,
        email: `${userId}.${RUN_TAG}@shield-waiver.test`,
        passwordHash: CODE_HASH,
        name: `shield-waiver ${RUN_TAG}`
      });
    }
  });

  after(async () => {
    setWhatsAppProviderOverrideForTests(null);
    resetChannelLinkDispatchLimiterForTests();
    setConfigOverride('channelLinkVictimShieldDistinctUsers', undefined);
    // Auditoria primeiro (o FK do ator é `set null` — apagar o usuário antes deixaria linha órfã);
    // usuários por último (o cascade deles apaga os desafios).
    await query('delete from access_session_admin_audit where actor_user_id = any($1)', [ALL_USER_IDS]);
    await query('delete from sicat_users where id = any($1)', [ALL_USER_IDS]);
    await pool.end();
  });

  it('o waiver derruba a contagem no BANCO sem tocar desfecho nem consumo — e é idempotente', async () => {
    const inserted = [];
    for (const attackerId of ATTACKER_IDS) {
      inserted.push(await insertChallenger(attackerId, PHONE_WAIVE));
    }
    // Duas linhas FECHADAS no meio: o escudo conta linha morta também, então o waiver precisa
    // alcançá-la — é exatamente o que `patchChannelVerificationMetadata` já fazia por linha.
    await query(
      `update conversation_channel_verifications
          set consumed_at = now(), outcome = 'exhausted', updated_at = now()
        where id = any($1)`,
      [[inserted[0].id, inserted[1].id]]
    );

    assert.equal(await shieldCount(PHONE_WAIVE, VICTIM_ID), 4, 'as 4 contas de terceiros contam antes do waiver');

    const result = await waiveChannelLinkVictimShieldService(
      ADMIN_USER,
      { phone: PHONE_WAIVE, reason: `integração ${RUN_TAG}` },
      `corr_waive_${RUN_TAG}`
    );

    assert.equal(result.status, 'applied');
    assert.equal(result.waivedChallenges, 4);
    assert.ok(!JSON.stringify(result).includes(PHONE_WAIVE), 'a resposta não pode ecoar o número em claro');

    // A MUTAÇÃO-ALVO: sem a cláusula de waiver no `where` da contagem, isto continua 4.
    assert.equal(await shieldCount(PHONE_WAIVE, VICTIM_ID), 0, 'depois do waiver o escudo ignora as linhas marcadas');

    // Nenhum fato operacional reescrito: fechada continua fechada COM o motivo original; viva
    // continua viva. Só o metadata ganhou a marca.
    const rows = await query(
      `select outcome, consumed_at, metadata
         from conversation_channel_verifications
        where channel_type = 'whatsapp' and external_user_key = $1
        order by created_at`,
      [PHONE_WAIVE]
    );
    assert.equal(rows.rows.length, 4);
    for (const row of rows.rows) {
      assert.equal(row.metadata.shieldWaived, true);
      assert.equal(row.metadata.shieldWaivedBy, ADMIN_ID);
      // Relógio ÚNICO: o carimbo vem do `now()` da transação, o mesmo de `updated_at`.
      assert.ok(Number.isFinite(Date.parse(row.metadata.shieldWaivedAt)), 'shieldWaivedAt não é data');
    }
    assert.equal(rows.rows.filter((row) => row.outcome === 'exhausted' && row.consumed_at !== null).length, 2);
    assert.equal(rows.rows.filter((row) => row.outcome === null && row.consumed_at === null).length, 2);

    // Idempotência honesta: a segunda chamada não encontra linha NOVA para liberar — e o status
    // DERIVA disso (`noop`), em vez de afirmar um `applied` que não aconteceu.
    const again = await waiveChannelLinkVictimShieldService(ADMIN_USER, { phone: PHONE_WAIVE }, null);
    assert.equal(again.waivedChallenges, 0);
    assert.equal(again.status, 'noop');

    // Trilha administrativa: ação própria, ator certo, e o número SÓ mascarado.
    const audit = await query(
      `select actor_user_id, action_status, reason, metadata
         from access_session_admin_audit
        where action_type = 'channel_link.shield_waived' and correlation_id = $1`,
      [`corr_waive_${RUN_TAG}`]
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].actor_user_id, ADMIN_ID);
    assert.equal(audit.rows[0].action_status, 'succeeded');
    const auditJson = JSON.stringify(audit.rows[0]);
    assert.ok(!auditJson.includes(PHONE_WAIVE), `telefone em claro na auditoria: ${auditJson}`);
    assert.equal(audit.rows[0].metadata.waivedChallenges, 4);
  });

  it('ponta a ponta: a vítima de primeira viagem estava trancada e o waiver a libera para o start real', async () => {
    const providerCalls = [];
    setWhatsAppProviderOverrideForTests(fakeProvider(providerCalls));
    resetChannelLinkDispatchLimiterForTests();
    setConfigOverride('channelLinkVictimShieldDistinctUsers', 3);

    for (const attackerId of ATTACKER_IDS) {
      await insertChallenger(attackerId, PHONE_E2E);
    }

    // Antes: 4 terceiros > limiar 3 → o start REAL recusa com o 429 genérico do escudo.
    const blocked = await captureRejection(
      startChannelLinkService(VICTIM_ID, { phone: PHONE_E2E }, `corr_blocked_${RUN_TAG}`)
    );
    assert.equal(blocked.status, 429);
    assert.equal(blocked.code, 'CHANNEL_LINK_RATE_LIMITED');
    assert.equal(providerCalls.length, 0, 'nenhuma mensagem sai enquanto o escudo tranca');

    await waiveChannelLinkVictimShieldService(ADMIN_USER, { phone: PHONE_E2E }, `corr_release_${RUN_TAG}`);

    // Depois: o MESMO start passa — desafio criado e código despachado para o número da vítima.
    const dto = await startChannelLinkService(VICTIM_ID, { phone: PHONE_E2E }, `corr_freed_${RUN_TAG}`);
    assert.ok(dto.challengeId, 'o desafio da vítima nasceu');
    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0].to, PHONE_E2E);
  });

  it('o gate REAL nega o não-admin com 403 — e nenhuma linha é liberada', async () => {
    const challenge = await insertChallenger(ATTACKER_IDS[0], PHONE_GATE);

    // Sem papel no token, o gate consulta `access_user_roles` de verdade — este usuário não tem grant.
    const error = await captureRejection(
      waiveChannelLinkVictimShieldService(NON_ADMIN_USER, { phone: PHONE_GATE }, `corr_deny_${RUN_TAG}`)
    );
    assert.equal(error.status, 403);

    // A MUTAÇÃO-ALVO: sem a chamada do gate no service, a linha abaixo apareceria marcada.
    const row = await query(
      'select metadata from conversation_channel_verifications where id = $1',
      [challenge.id]
    );
    assert.equal(row.rows[0].metadata.shieldWaived, undefined, 'não-admin não pode liberar número nenhum');
    assert.equal(await shieldCount(PHONE_GATE, VICTIM_ID), 1, 'a contagem segue de pé');
  });
});
