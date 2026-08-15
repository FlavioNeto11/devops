import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import {
  listUnconfirmedSubmitManifestsForReconciliation,
  listPotentialGhostManifestsForMirrorWindow,
  TRANSIENT_SUBMIT_MANIFEST_STATUSES
} from '../../src/repositories/manifest-repo.js';

// Varredura de reconciliacao para respostas de submit perdidas:
// prova que a funcao NOVA encontra manifestos presos em status transiente
// com external_hash_code NULO, e que a funcao irma (ghost scan do espelho)
// NAO os enxerga — essa diferenca e exatamente o ponto da funcao nova.

const ACCOUNT_ID = 'acc_unconf_001';

const today = new Date().toISOString().slice(0, 10);
const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const dateTo = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function buildPayload(overrides = {}) {
  return {
    expeditionDate: today,
    generator: { partnerCode: '176163', description: 'Nova IT' },
    carrier: { partnerCode: '160627', description: 'CASAMAX COMERCIAL LTDA.' },
    receiver: { partnerCode: '40110', description: 'MARDAN FIRE ENGENHARIA LTDA.' },
    ...overrides
  };
}

async function insertManifestRow(input) {
  // created_at/updated_at entram no INSERT: o trigger trg_manifests_version
  // sobrescreve updated_at = now() em qualquer UPDATE, entao nao da para
  // backdatar depois — so na insercao.
  await query(
    `INSERT INTO manifests(
       id, integration_account_id, status, external_status, external_reference,
       external_hash_code, payload, requested_by, correlation_id, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9, coalesce($10::timestamptz, now()), coalesce($11::timestamptz, now()))`,
    [
      input.id,
      ACCOUNT_ID,
      input.status,
      input.externalStatus ?? null,
      input.externalReference ? JSON.stringify(input.externalReference) : null,
      input.externalHashCode ?? null,
      JSON.stringify(input.payload ?? buildPayload()),
      input.requestedBy ?? 'operator',
      input.correlationId ?? `corr_${input.id}`,
      input.createdAt ?? null,
      input.updatedAt ?? null
    ]
  );
}

describe('listUnconfirmedSubmitManifestsForReconciliation (integration)', () => {
  before(async () => {
    await query('DELETE FROM manifests WHERE integration_account_id = $1', [ACCOUNT_ID]);
    await query('DELETE FROM integration_accounts WHERE id = $1', [ACCOUNT_ID]);
    await query(
      `INSERT INTO integration_accounts(id, account_name, partner_code, state_code, is_active)
       VALUES ($1,$2,$3,$4,$5)`,
      [ACCOUNT_ID, 'Unconfirmed Submit Test Account', 176163, 26, true]
    );

    // Alvos: presos em status transiente de submit, sem identidade externa.
    await insertManifestRow({ id: 'man_unconf_submitting', status: 'submitting' });
    await insertManifestRow({ id: 'man_unconf_processing', status: 'processing' });
    await insertManifestRow({ id: 'man_unconf_queued', status: 'queued_submit' });

    // Nao-alvo da nova / alvo da irma: submit confirmado (hash presente),
    // mas ainda sem manCodigo/manNumero no espelho.
    await insertManifestRow({
      id: 'man_unconf_submitted_hash',
      status: 'submitted',
      externalHashCode: 'HASHCONFIRMED123',
      externalReference: null
    });

    // Excluidos da nova: espelho da CETESB, transiente ja com hash, e antigo fora da janela.
    await insertManifestRow({ id: 'man_unconf_mirror', status: 'submitting', requestedBy: 'cetesb.search' });
    await insertManifestRow({
      id: 'man_unconf_hashful_transient',
      status: 'submitting',
      externalHashCode: 'HASHTRANSIENT456'
    });
    await insertManifestRow({
      id: 'man_unconf_old',
      status: 'submitting',
      payload: buildPayload({ expeditionDate: '2020-01-01' }),
      createdAt: '2020-01-01T12:00:00Z',
      updatedAt: '2020-01-02T12:00:00Z'
    });
  });

  after(async () => {
    await query('DELETE FROM manifests WHERE integration_account_id = $1', [ACCOUNT_ID]);
    await query('DELETE FROM integration_accounts WHERE id = $1', [ACCOUNT_ID]);
    await pool.end();
  });

  it('encontra os manifestos transientes hash-null que a funcao irma NAO enxerga', async () => {
    const filters = { integrationAccountId: ACCOUNT_ID, dateFrom, dateTo };

    const unconfirmed = await listUnconfirmedSubmitManifestsForReconciliation(filters);
    const unconfirmedIds = unconfirmed.map((manifest) => manifest.id).sort();
    assert.deepStrictEqual(
      unconfirmedIds,
      ['man_unconf_processing', 'man_unconf_queued', 'man_unconf_submitting'],
      'A funcao nova deve listar exatamente os transientes com hash nulo'
    );

    const ghosts = await listPotentialGhostManifestsForMirrorWindow(filters);
    const ghostIds = ghosts.map((manifest) => manifest.id);
    for (const id of unconfirmedIds) {
      assert.ok(!ghostIds.includes(id), `A funcao irma nao deve enxergar ${id} (hash nulo, status transiente)`);
    }
    assert.ok(
      ghostIds.includes('man_unconf_submitted_hash'),
      'A funcao irma continua cobrindo o caso dela (hash presente, status pos-submit)'
    );
    assert.ok(
      !unconfirmedIds.includes('man_unconf_submitted_hash'),
      'A funcao nova nao deve listar manifesto ja confirmado (hash presente)'
    );
  });

  it('exclui espelho da CETESB, transiente com hash e manifesto fora da janela de negocio', async () => {
    const unconfirmed = await listUnconfirmedSubmitManifestsForReconciliation({
      integrationAccountId: ACCOUNT_ID,
      dateFrom,
      dateTo
    });
    const ids = unconfirmed.map((manifest) => manifest.id);

    assert.ok(!ids.includes('man_unconf_mirror'), 'requested_by=cetesb.search deve ficar de fora');
    assert.ok(!ids.includes('man_unconf_hashful_transient'), 'transiente com hash preenchido deve ficar de fora');
    assert.ok(!ids.includes('man_unconf_old'), 'manifesto fora da janela de negocio deve ficar de fora');
  });

  it('aceita updatedSince como janela alternativa de atividade', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const recent = await listUnconfirmedSubmitManifestsForReconciliation({
      integrationAccountId: ACCOUNT_ID,
      updatedSince: oneHourAgo
    });
    const recentIds = recent.map((manifest) => manifest.id).sort();
    assert.deepStrictEqual(recentIds, ['man_unconf_processing', 'man_unconf_queued', 'man_unconf_submitting']);
    assert.ok(!recentIds.includes('man_unconf_old'), 'updated_at antigo deve ficar fora da janela de atividade');
  });

  it('retorna vazio sem conta ou sem janela de tempo (protecao contra full scan)', async () => {
    const withoutAccount = await listUnconfirmedSubmitManifestsForReconciliation({ dateFrom, dateTo });
    assert.deepStrictEqual(withoutAccount, []);

    const withoutWindow = await listUnconfirmedSubmitManifestsForReconciliation({
      integrationAccountId: ACCOUNT_ID
    });
    assert.deepStrictEqual(withoutWindow, []);
  });

  it('retorna os campos de match por marcador/atributos (id, payload, datas, parceiros)', async () => {
    const [manifest] = await listUnconfirmedSubmitManifestsForReconciliation({
      integrationAccountId: ACCOUNT_ID,
      dateFrom,
      dateTo
    });

    assert.ok(manifest.id, 'id presente');
    assert.ok(manifest.correlationId, 'correlationId presente');
    assert.ok(manifest.createdAt, 'createdAt presente');
    assert.strictEqual(manifest.externalHashCode, null, 'hash segue nulo no candidato');
    assert.ok(TRANSIENT_SUBMIT_MANIFEST_STATUSES.includes(manifest.status), 'status transiente');
    assert.strictEqual(manifest.payload.expeditionDate, today, 'payload com a data de expedicao');
    assert.strictEqual(manifest.payload.generator.partnerCode, '176163', 'payload com parceiro gerador');
    assert.strictEqual(manifest.payload.carrier.partnerCode, '160627', 'payload com parceiro transportador');
    assert.strictEqual(manifest.payload.receiver.partnerCode, '40110', 'payload com parceiro destinador');
  });
});
