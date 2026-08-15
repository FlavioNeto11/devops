import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { enqueueManifestSubmit, listManifests, setManifestGatewayOverrideForTests } from '../../src/services/manifest-service.js';
import { stitchManifestFromExternalSearchByCorrelation } from '../../src/repositories/manifest-repo.js';

// A COSTURA DO ÓRFÃO.
//
// Defeito original: quando a resposta do submit se perdia, a linha local ficava
// presa em estado transiente SEM external_hash_code / manCodigo / manNumero. Ao
// usar "Atualizar da CETESB", o MTR verdadeiro voltava da pesquisa e o
// `upsertManifestFromExternalSearch` — que só casa por hash/código/número —
// não achava nada para casar e INSERIA uma linha nova e desvinculada
// (`createPrefixedId('man')`). Resultado: duas linhas para um MTR, e a original
// eternamente "em envio".
//
// O caminho de volta é o marcador `[sicat:<id>]` que o gateway grava em
// `manObservacao` ANTES do PUT e que a pesquisa devolve.

const ACCOUNT_ID = 'acc_stitch_001';

function buildRemoteItem({ manCodigo, manNumero, manHashCode, manObservacao }) {
  return {
    manCodigo,
    manNumero,
    manHashCode,
    manObservacao,
    manDataExpedicao: '2026-08-05',
    manData: '2026-08-05',
    situacaoManifesto: { simCodigo: 1, simDescricao: 'Salvo' },
    parceiroGerador: { parCodigo: '176163', parDescricao: 'Nova IT' },
    parceiroTransportador: { parCodigo: '160627', parDescricao: 'CASAMAX' },
    parceiroDestinador: { parCodigo: '40110', parDescricao: 'MARDAN' }
  };
}

async function insertLocalManifest(id, status, { externalHashCode = null } = {}) {
  await query(
    `INSERT INTO manifests(
       id, integration_account_id, status, external_status, external_reference,
       external_hash_code, payload, requested_by, correlation_id
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9)`,
    [
      id,
      ACCOUNT_ID,
      status,
      'aguardando confirmação CETESB',
      null,
      externalHashCode,
      JSON.stringify({
        expeditionDate: '2026-08-05',
        notes: 'Obra 5',
        submitCorrelation: { marker: `[sicat:${id}]`, jobId: `job_${id}` }
      }),
      'operator',
      `corr_${id}`
    ]
  );
}

async function countManifests() {
  const result = await query('select count(*)::int as count from manifests where integration_account_id = $1', [ACCOUNT_ID]);
  return result.rows[0].count;
}

describe('costura do manifesto órfão pelo marcador de correlação', () => {
  before(async () => {
    await pool.connect().then(client => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM manifests WHERE integration_account_id = $1', [ACCOUNT_ID]);
    await query('DELETE FROM integration_accounts WHERE id = $1', [ACCOUNT_ID]);
    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1,$2,$3)',
      [ACCOUNT_ID, 'Test Stitch Account', true]
    );
  });

  afterEach(() => {
    setManifestGatewayOverrideForTests(null);
  });

  after(async () => {
    setManifestGatewayOverrideForTests(null);
    await query('DELETE FROM manifests WHERE integration_account_id = $1', [ACCOUNT_ID]);
    await query('DELETE FROM integration_accounts WHERE id = $1', [ACCOUNT_ID]);
    await pool.end();
  });

  // ---------------------------------------------------------------------------
  // Mecânica da costura (repositório)
  // ---------------------------------------------------------------------------

  it('atualiza a linha ORIGINAL em vez de inserir uma nova', async () => {
    await insertLocalManifest('man_stitch_alvo', 'submit_unconfirmed');

    const stitched = await stitchManifestFromExternalSearchByCorrelation({
      manifestId: 'man_stitch_alvo',
      integrationAccountId: ACCOUNT_ID,
      status: 'submitted',
      externalStatus: 'Salvo',
      externalReference: { manCodigo: 424242, manNumero: '000424242' },
      externalHashCode: 'hash-real',
      payload: { notes: 'Obra 5 [sicat:man_stitch_alvo]' },
      lastSyncAt: new Date().toISOString()
    });

    assert.strictEqual(stitched.id, 'man_stitch_alvo');
    assert.strictEqual(stitched.status, 'submitted');
    assert.strictEqual(stitched.externalHashCode, 'hash-real');
    // jsonb preserva o tipo: número entra número, igual ao caminho do upsert.
    assert.strictEqual(stitched.externalReference.manCodigo, 424242);
    assert.strictEqual(await countManifests(), 1, 'não pode nascer uma segunda linha');
  });

  it('preserva requested_by do operador — a linha costurada não é espelho da pesquisa', async () => {
    await insertLocalManifest('man_stitch_owner', 'submitting');

    await stitchManifestFromExternalSearchByCorrelation({
      manifestId: 'man_stitch_owner',
      integrationAccountId: ACCOUNT_ID,
      status: 'submitted',
      externalHashCode: 'hash-owner'
    });

    const row = await query('select requested_by from manifests where id = $1', ['man_stitch_owner']);
    assert.strictEqual(
      row.rows[0].requested_by,
      'operator',
      "virar 'cetesb.search' faria deleteManifestsForMirrorWindow apagar o manifesto do operador"
    );
  });

  it('não costura sobre linha que JÁ tem identidade externa (segundo MTR do mesmo marcador)', async () => {
    await insertLocalManifest('man_stitch_ocupado', 'submitting', { externalHashCode: 'hash-primeiro' });

    const stitched = await stitchManifestFromExternalSearchByCorrelation({
      manifestId: 'man_stitch_ocupado',
      integrationAccountId: ACCOUNT_ID,
      status: 'submitted',
      externalHashCode: 'hash-segundo'
    });

    assert.strictEqual(stitched, null, 'um reenvio duplicado já consumado tem de virar a PRÓPRIA linha');
    const row = await query('select external_hash_code from manifests where id = $1', ['man_stitch_ocupado']);
    assert.strictEqual(row.rows[0].external_hash_code, 'hash-primeiro');
  });

  it('não costura sobre manifesto que já teve outro desfecho, nem de outra conta', async () => {
    await insertLocalManifest('man_stitch_cancelado', 'cancelled');
    await insertLocalManifest('man_stitch_conta', 'submitting');

    assert.strictEqual(
      await stitchManifestFromExternalSearchByCorrelation({
        manifestId: 'man_stitch_cancelado',
        integrationAccountId: ACCOUNT_ID,
        status: 'submitted',
        externalHashCode: 'h'
      }),
      null
    );

    assert.strictEqual(
      await stitchManifestFromExternalSearchByCorrelation({
        manifestId: 'man_stitch_conta',
        integrationAccountId: 'acc_outra_qualquer',
        status: 'submitted',
        externalHashCode: 'h'
      }),
      null,
      'marcador não pode atravessar a fronteira de conta'
    );
  });

  it('sem manHashCode a costura vale, mas não pode gravar `submitted` (chk_manifest_submitted_integrity)', async () => {
    await insertLocalManifest('man_stitch_sem_hash', 'submitting');

    const stitched = await stitchManifestFromExternalSearchByCorrelation({
      manifestId: 'man_stitch_sem_hash',
      integrationAccountId: ACCOUNT_ID,
      status: 'submitted',
      externalReference: { manCodigo: 99, manNumero: 'SP-99' },
      externalHashCode: null
    });

    assert.strictEqual(stitched.status, 'processing');
    assert.strictEqual(stitched.externalReference.manCodigo, 99);
  });

  // ---------------------------------------------------------------------------
  // Fiação: o laço de sincronização de fato LÊ o marcador
  // ("comentário não é evidência")
  // ---------------------------------------------------------------------------

  it('"Atualizar da CETESB" costura o MTR verdadeiro na linha original, sem criar linha órfã', async () => {
    await insertLocalManifest('man_stitch_sync', 'submit_unconfirmed');

    setManifestGatewayOverrideForTests({
      async searchManifests() {
        // Dado CRU da pesquisa: o MTR que nasceu, com o marcador que o gateway
        // gravou em manObservacao antes do PUT.
        return [buildRemoteItem({
          manCodigo: 777777,
          manNumero: '000777777',
          manHashCode: 'hash-sync-777',
          manObservacao: 'Obra 5 [sicat:man_stitch_sync] via SICAT'
        })];
      }
    });

    await listManifests({ integrationAccountId: ACCOUNT_ID, forceSync: 'true' }, 'corr_sync');

    assert.strictEqual(await countManifests(), 1, 'o MTR verdadeiro NÃO pode voltar como linha nova e desvinculada');
    const row = await query('select status, external_hash_code, external_reference from manifests where id = $1', ['man_stitch_sync']);
    assert.strictEqual(row.rows[0].status, 'submitted');
    assert.strictEqual(row.rows[0].external_hash_code, 'hash-sync-777');
    assert.strictEqual(row.rows[0].external_reference.manNumero, '000777777');
  });

  // ---------------------------------------------------------------------------
  // A TRAVA: reenviar um manifesto sem confirmação é o ato que cria o 2º MTR
  // ---------------------------------------------------------------------------

  it('recusa reenviar manifesto em submit_unconfirmed (409) — a trava do MTR duplicado', async () => {
    await insertLocalManifest('man_stitch_travado', 'submit_unconfirmed');

    await assert.rejects(
      async () => enqueueManifestSubmit('man_stitch_travado', { sessionContextId: 'scx_qualquer' }, {}, 'corr_guard'),
      (error) => {
        assert.strictEqual(error.status, 409);
        assert.strictEqual(error.code, 'MANIFEST_SUBMIT_UNCONFIRMED');
        assert.match(error.detail ?? error.message, /segundo MTR/i);
        return true;
      }
    );

    const jobs = await query('select count(*)::int as count from jobs where entity_id = $1', ['man_stitch_travado']);
    assert.strictEqual(jobs.rows[0].count, 0, 'nenhum job de submit pode ter sido enfileirado');
    const row = await query('select status from manifests where id = $1', ['man_stitch_travado']);
    assert.strictEqual(row.rows[0].status, 'submit_unconfirmed', 'a trava não pode alterar o estado');
  });

  it('CONTROLE NEGATIVO: a trava só vale para submit_unconfirmed', async () => {
    await insertLocalManifest('man_stitch_livre', 'draft');

    // Falha por OUTRO motivo (sessão inexistente), provando que a trava do
    // reenvio não capturou este manifesto.
    await assert.rejects(
      async () => enqueueManifestSubmit('man_stitch_livre', { sessionContextId: 'scx_inexistente' }, {}, 'corr_guard_neg'),
      (error) => {
        assert.notStrictEqual(error.code, 'MANIFEST_SUBMIT_UNCONFIRMED');
        return true;
      }
    );
  });

  it('CONTROLE NEGATIVO: item remoto sem marcador continua virando linha nova (upsert intocado)', async () => {
    await insertLocalManifest('man_stitch_intocado', 'submit_unconfirmed');

    setManifestGatewayOverrideForTests({
      async searchManifests() {
        return [buildRemoteItem({
          manCodigo: 888888,
          manNumero: '000888888',
          manHashCode: 'hash-sem-marcador',
          manObservacao: 'Obra de terceiro, sem marcador nenhum'
        })];
      }
    });

    await listManifests({ integrationAccountId: ACCOUNT_ID, forceSync: 'true' }, 'corr_sync_neg');

    assert.strictEqual(await countManifests(), 2, 'sem marcador o caminho tem de continuar sendo o upsert normal');
    const original = await query('select status, external_hash_code from manifests where id = $1', ['man_stitch_intocado']);
    assert.strictEqual(original.rows[0].status, 'submit_unconfirmed', 'a linha original não pode ser adotada por engano');
    assert.strictEqual(original.rows[0].external_hash_code, null);
  });
});
