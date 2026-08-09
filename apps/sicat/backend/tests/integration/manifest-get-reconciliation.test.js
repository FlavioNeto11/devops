import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { getManifest, setManifestGatewayOverrideForTests } from '../../src/services/manifest-service.js';
import { validManifestDraft } from '../fixtures/manifests.js';

// Caminho de LEITURA da reconciliação de submit.
//
// Antes desta unidade, `getManifest` sobre um manifesto preso em estado
// transiente marcava `failed` + "revise e reenvie" SEM nunca perguntar à CETESB
// se o MTR já existia — e o reenvio produzia um SEGUNDO MTR real.
//
// A regra que este arquivo protege: o caminho de leitura só pode CONFIRMAR ou
// rebaixar para `submit_unconfirmed`. Concluir `failed` exige o orçamento cheio
// de polling, que só a varredura de fundo e a falha terminal do job possuem.

// Double do gateway: devolve dado CRU da pesquisa CETESB. Quem casa pelo
// marcador é o código sob teste — este double nunca reimplementa o casamento.
function buildGatewayDouble(items) {
  const calls = [];
  return {
    calls,
    gateway: {
      async searchManifests(args) {
        calls.push(args);
        return typeof items === 'function' ? items(args) : items;
      }
    }
  };
}

function instructsResend(message) {
  return /realize novo envio|reenfileire o envio|reenvie o manifesto/i.test(String(message || ''));
}

async function insertManifest(id, status, extra = {}) {
  await query(
    `INSERT INTO manifests(
      id, integration_account_id, session_context_id, status,
      external_status, external_reference, external_hash_code, payload, correlation_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    [
      id,
      'acc_test_rec_001',
      null,
      status,
      extra.externalStatus ?? 'aguardando processamento',
      null,
      null,
      JSON.stringify({ ...validManifestDraft.payload, ...(extra.payload || {}) }),
      `corr_${id}`
    ]
  );
}

describe('getManifest - Reconciliation', () => {
  before(async () => {
    await pool.connect().then(client => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_test_rec_%']);
    await query('DELETE FROM manifests WHERE id LIKE $1', ['man_test_rec_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_test_rec_%']);

    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)',
      ['acc_test_rec_001', 'Test Reconciliation Account', true]
    );
  });

  afterEach(() => {
    setManifestGatewayOverrideForTests(null);
  });

  after(async () => {
    setManifestGatewayOverrideForTests(null);
    await query('DELETE FROM jobs WHERE entity_id LIKE $1', ['man_test_rec_%']);
    await query('DELETE FROM manifests WHERE id LIKE $1', ['man_test_rec_%']);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', ['acc_test_rec_%']);
    await pool.end();
  });

  it('manifesto órfão vira submit_unconfirmed (não failed) e NÃO manda reenviar', async () => {
    await insertManifest('man_test_rec_orphan_001', 'submitting');
    const { gateway, calls } = buildGatewayDouble([]);
    setManifestGatewayOverrideForTests(gateway);

    const manifest = await getManifest('man_test_rec_orphan_001');

    assert.strictEqual(calls.length, 1, 'a leitura tem de PERGUNTAR à CETESB antes de declarar qualquer coisa');
    assert.strictEqual(manifest.status, 'submit_unconfirmed');
    assert.match(manifest.externalStatus, /job de submit não encontrado/i, 'preserva o diagnóstico do SICAT');
    assert.match(manifest.externalStatus, /NÃO reenvie/);
    assert.strictEqual(
      instructsResend(manifest.externalStatus),
      false,
      'uma única pesquisa que não achou nada NÃO prova ausência — não pode autorizar reenvio'
    );
  });

  it('job terminal em DLQ com manifesto processing vira submit_unconfirmed e preserva a causa técnica', async () => {
    await insertManifest('man_test_rec_dlq_001', 'processing', { externalStatus: 'aguardando confirmação CETESB' });

    await query(
      `INSERT INTO jobs(
        job_id, command_id, entity_type, entity_id, operation, payload,
        status, max_attempts, attempts, correlation_id,
        last_error_code, last_error_message, dlq_reason, finished_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,now())`,
      [
        'job_test_rec_dlq_001',
        'cmd_test_rec_dlq_001',
        'manifest',
        'man_test_rec_dlq_001',
        'manifest.submit',
        JSON.stringify({ validateOnly: false }),
        'dlq',
        3,
        3,
        'corr_test_rec_dlq_001',
        'CETESB_VALIDATION_ERROR',
        'Resíduo informado com unidade incorreta!',
        'Max attempts exceeded. Last error: Resíduo informado com unidade incorreta!'
      ]
    );

    const { gateway } = buildGatewayDouble([]);
    setManifestGatewayOverrideForTests(gateway);

    const manifest = await getManifest('man_test_rec_dlq_001');

    assert.strictEqual(manifest.status, 'submit_unconfirmed');
    assert.match(manifest.externalStatus, /DLQ/i);
    assert.match(manifest.externalStatus, /Resíduo informado com unidade incorreta/i);
    assert.strictEqual(instructsResend(manifest.externalStatus), false);
  });

  it('confirma o manifesto quando a CETESB devolve o item com o marcador de correlação', async () => {
    const id = 'man_test_rec_found_001';
    await insertManifest(id, 'processing', {
      payload: { submitCorrelation: { marker: `[sicat:${id}]`, jobId: 'job_perdido' } }
    });

    // Dois itens com identidades DISTINTAS; só um traz o marcador deste manifesto.
    const { gateway } = buildGatewayDouble([
      { manCodigo: 111, manNumero: 'SP-111', manHashCode: 'hash-vizinho', manObservacao: 'Obra [sicat:man_outro]' },
      { manCodigo: 555111, manNumero: '000555111', manHashCode: 'hash-real-555', manObservacao: `Obra 9 [sicat:${id}]` }
    ]);
    setManifestGatewayOverrideForTests(gateway);

    const manifest = await getManifest(id);

    assert.strictEqual(manifest.status, 'submitted', 'o MTR nasceu — declarar falha aqui é o que gera o duplicado');
    assert.strictEqual(manifest.externalHashCode, 'hash-real-555');
    assert.strictEqual(instructsResend(manifest.externalStatus), false);
  });

  it('CONTROLE NEGATIVO: manifesto fora do estado transiente não é reconciliado nem consultado', async () => {
    await insertManifest('man_test_rec_draft_001', 'draft');
    const { gateway, calls } = buildGatewayDouble([]);
    setManifestGatewayOverrideForTests(gateway);

    const manifest = await getManifest('man_test_rec_draft_001');

    assert.strictEqual(calls.length, 0, 'não pode gastar chamada à CETESB em manifesto que não está em submit');
    assert.strictEqual(manifest.status, 'draft');
  });
});
