import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import { query, pool } from '../../src/db/pool.js';
import {
  applyManifestSubmitTerminalFailureSideEffect,
  mapManifestSubmitReconcilePatchToProvisorioStatus,
  PROVISORIO_SUBMIT_RECONCILE_ALLOWS_TERMINAL_FAILURE
} from '../../src/workers/operation-handlers.js';
import { findMtrProvisorioById } from '../../src/repositories/mtr-provisorio-repo.js';

/**
 * O ramo `mtr_provisorio` de `applyManifestSubmitTerminalFailureSideEffect`.
 *
 * DEFEITO QUE ESTE ARQUIVO PRENDE: em falha terminal de submit o ramo gravava `failed_submit` sem
 * NUNCA perguntar à CETESB — exatamente o defeito que o ramo definitivo já tinha corrigido. Quando a
 * resposta do PUT se perdia DEPOIS de o MTR nascer, o registro passava a dizer "falhou" sobre um
 * desfecho DESCONHECIDO. `failed_submit` cai em `failed_*` no mapa operacional
 * (`src/lib/operational-status.ts`), que é o que o operador lê antes de criar tudo de novo.
 *
 * DISCIPLINA DOS DOUBLES: `searchManifests` devolve a LISTA CRUA que a CETESB devolveria. Quem casa
 * pelo marcador de correlação, decide certeza e traduz para a taxonomia do provisório é o código sob
 * teste — nenhum double reimplementa isso. Cada guarda tem CONTROLE NEGATIVO: o mesmo cenário com o
 * eixo invertido tem de mudar o resultado.
 */

const ACCOUNT_ID = 'acc_test_prov_term_001';
const PROVISORIO_ID = 'man_test_prov_term_001';
const JOB_ID = 'job_test_prov_term_001';
const MARKER = `[sicat:${PROVISORIO_ID}]`;

// Nunca esperar o backoff real do reconciliador dentro de teste.
const NO_SLEEP = async () => {};

function terminalJob(overrides = {}) {
  return {
    jobId: JOB_ID,
    commandId: 'cmd_test_prov_term_001',
    entityType: 'mtr_provisorio',
    entityId: PROVISORIO_ID,
    operation: 'manifest.submit',
    status: 'dlq',
    attempts: 3,
    maxAttempts: 3,
    payload: { manifestId: PROVISORIO_ID, kind: 'provisorio' },
    correlationId: 'corr_test_prov_term_001',
    lastErrorCode: 'CETESB_TIMEOUT',
    lastErrorMessage: 'socket hang up',
    ...overrides
  };
}

/** Estado exato do defeito: PUT despachado (status `submitting`), resposta perdida, sem hash. */
async function resetProvisorio(status = 'submitting') {
  await query(`delete from manifests where id = $1`, [PROVISORIO_ID]);
  await query(
    `insert into manifests(id, integration_account_id, kind, status, external_status, payload, requested_by, correlation_id)
     values ($1, $2, 'provisorio', $3, $4, $5::jsonb, $6, $7)`,
    [
      PROVISORIO_ID,
      ACCOUNT_ID,
      status,
      'aguardando confirmação CETESB',
      JSON.stringify({
        expeditionDate: '2026-06-12',
        submitCorrelation: { marker: MARKER, jobId: JOB_ID, dispatchedAt: '2026-06-12T10:00:00.000Z' }
      }),
      'operator',
      'corr_test_prov_term_001'
    ]
  );
}

describe('mtr_provisorio — falha terminal de submit reconcilia antes de rotular', () => {
  before(async () => {
    await query(`delete from manifests where integration_account_id = $1`, [ACCOUNT_ID]);
    await query(`delete from integration_accounts where id = $1`, [ACCOUNT_ID]);
    await query(
      `insert into integration_accounts(id, account_name, is_active) values ($1, $2, $3)`,
      [ACCOUNT_ID, 'Test MTR Provisorio Terminal Failure', true]
    );
  });

  beforeEach(async () => {
    await resetProvisorio();
  });

  after(async () => {
    await query(`delete from manifests where integration_account_id = $1`, [ACCOUNT_ID]);
    await query(`delete from integration_accounts where id = $1`, [ACCOUNT_ID]);
    await pool.end();
  });

  it('PERGUNTA à CETESB antes de qualquer rótulo (o ramo antigo nunca perguntava)', async () => {
    let searchCalls = 0;
    await applyManifestSubmitTerminalFailureSideEffect(
      terminalJob(),
      { action: 'dlq', dlqReason: 'Max attempts exceeded. Last error: socket hang up' },
      null,
      { sleep: NO_SLEEP, searchManifests: async () => { searchCalls += 1; return []; } }
    );

    assert.ok(searchCalls >= 1, 'o ramo provisório concluiu sem consultar a CETESB');
  });

  it('a CETESB confirma que o MTR nasceu ⇒ `submitted`, com hash e número provisório', async () => {
    const result = await applyManifestSubmitTerminalFailureSideEffect(
      terminalJob(),
      { action: 'dlq', dlqReason: 'Max attempts exceeded. Last error: socket hang up' },
      null,
      {
        sleep: NO_SLEEP,
        // Dado CRU: dois manifestos com identidades DISTINTAS; só um traz o marcador deste registro.
        searchManifests: async () => [
          { manCodigo: 111, manNumero: 'SP-111', manHashCode: 'hash-vizinho', manObservacao: 'Obra 1 [sicat:man_outro_qualquer]' },
          { manCodigo: 424242, manNumero: '000424242', manHashCode: 'hash-provisorio-real', manObservacao: `Obra 5 ${MARKER} via SICAT` }
        ]
      }
    );

    assert.equal(result.status, 'submitted', 'o MTR nasceu — dizer "falhou" aqui é o gatilho do duplicado');
    assert.equal(result.externalHashCode, 'hash-provisorio-real');
    assert.equal(result.externalReference.manNumero, '000424242');
    assert.equal(result.provisionalNumber, '000424242');
    assert.doesNotMatch(result.externalStatus, /realize novo envio|reenfileire o envio/i);

    const persisted = await findMtrProvisorioById(PROVISORIO_ID);
    assert.equal(persisted.status, 'submitted');
    const jobResult = persisted.payload.jobResults['manifest.submit'];
    assert.equal(jobResult.outcome, 'manifest_submit_confirmed_by_reconcile');
    assert.equal(jobResult.retriable, false);
  });

  it('CONTROLE NEGATIVO: marcador de OUTRO registro não confirma este (vira `awaiting_remote`, não `submitted`)', async () => {
    const result = await applyManifestSubmitTerminalFailureSideEffect(
      terminalJob(),
      { action: 'dlq', dlqReason: 'Max attempts exceeded.' },
      null,
      {
        sleep: NO_SLEEP,
        searchManifests: async () => [
          { manCodigo: 111, manNumero: 'SP-111', manHashCode: 'hash-vizinho', manObservacao: 'Obra 1 [sicat:man_outro_qualquer]' }
        ]
      }
    );

    assert.equal(result.status, 'awaiting_remote');
    assert.equal(result.externalHashCode, null, 'não pode adotar o hash do vizinho');
    assert.equal(result.provisionalNumber, null);
  });

  it('desfecho DESCONHECIDO não é `failed_submit`, e a mensagem não manda reenviar', async () => {
    // Sem `searchManifests`: "não perguntei" não é "não existe". Este é o rótulo que o ramo antigo
    // errava — gravava `failed_submit` (que o mapa operacional exibe como falha) para um MTR que
    // pode ter nascido.
    const result = await applyManifestSubmitTerminalFailureSideEffect(
      terminalJob(),
      { action: 'dlq', dlqReason: 'Max attempts exceeded. Last error: socket hang up' }
    );

    assert.equal(result.status, 'awaiting_remote', 'rotular "falhou" um desfecho desconhecido convida ao MTR duplicado');
    assert.match(result.externalStatus, /NÃO reenvie/);
    assert.doesNotMatch(result.externalStatus, /realize novo envio|reenfileire o envio/i);
    assert.match(result.externalStatus, /socket hang up/, 'a causa técnica tem de continuar visível');

    const jobResult = result.payload.jobResults['manifest.submit'];
    assert.equal(jobResult.outcome, 'manifest_submit_unconfirmed');
    assert.equal(jobResult.status, 'awaiting_remote');
    assert.equal(jobResult.retriable, false, 'reenvio só é seguro com ausência PROVADA');
    assert.equal(jobResult.lastErrorCode, 'CETESB_TIMEOUT');
  });

  it('erro na pesquisa da CETESB também é desconhecido — nunca `failed_submit`', async () => {
    const result = await applyManifestSubmitTerminalFailureSideEffect(
      terminalJob(),
      { action: 'failed' },
      null,
      {
        sleep: NO_SLEEP,
        searchManifests: async () => {
          throw Object.assign(new Error('CETESB 503'), { code: 'CETESB_HTTP_ERROR', remoteStatus: 503 });
        }
      }
    );

    assert.equal(result.status, 'awaiting_remote');
    assert.doesNotMatch(result.externalStatus, /realize novo envio/i);
  });

  it('não toca registro que já saiu do estado transiente de submit', async () => {
    await resetProvisorio('cancelled');

    let searchCalls = 0;
    const result = await applyManifestSubmitTerminalFailureSideEffect(
      terminalJob(),
      { action: 'dlq' },
      null,
      { sleep: NO_SLEEP, searchManifests: async () => { searchCalls += 1; return []; } }
    );

    assert.equal(result, null);
    assert.equal(searchCalls, 0, 'nem pergunta: o registro já tem desfecho');
    const persisted = await findMtrProvisorioById(PROVISORIO_ID);
    assert.equal(persisted.status, 'cancelled');
  });
});

describe('mtr_provisorio — tradução do patch de reconciliação para a taxonomia do provisório', () => {
  // A função é PURA: cobre os quatro desfechos possíveis do reconciliador sem banco e sem CETESB —
  // inclusive `failed`, que HOJE é inalcançável em produção por causa da constante abaixo. Sem estes
  // casos o ramo `failed_submit` seria código morto não verificado no dia em que a constante virar.
  it('confirmado com identidade completa ⇒ `submitted`', () => {
    assert.equal(
      mapManifestSubmitReconcilePatchToProvisorioStatus({ status: 'submitted', confirmed: true }),
      'submitted'
    );
  });

  it('confirmado com identidade PARCIAL (`processing`) ⇒ `awaiting_remote`', () => {
    assert.equal(
      mapManifestSubmitReconcilePatchToProvisorioStatus({ status: 'processing', confirmed: true }),
      'awaiting_remote'
    );
  });

  it('não confirmado e não provado ausente (`submit_unconfirmed`) ⇒ `awaiting_remote`', () => {
    assert.equal(
      mapManifestSubmitReconcilePatchToProvisorioStatus({ status: 'submit_unconfirmed', confirmed: false }),
      'awaiting_remote'
    );
  });

  it('ausência PROVADA (`failed`) ⇒ `failed_submit` — o único caminho que autoriza reenvio', () => {
    assert.equal(
      mapManifestSubmitReconcilePatchToProvisorioStatus({ status: 'failed', confirmed: false }),
      'failed_submit'
    );
  });

  it('a pesquisa atual NÃO alcança o provisório, então ausência provada está desligada', () => {
    // `searchManifests` monta o path com tipoManifesto 8/5/9 (resolveManifestSearchTipo no gateway) e
    // o provisório é enviado com tipoManifesto=2 (PROVISORIO_TIPO_MANIFESTO_OVERRIDE). Ligar esta
    // constante sem uma pesquisa provisório-aware faria "não achei" virar "não nasceu" — que é a
    // mentira oposta à que esta unidade acabou de tirar do código.
    assert.equal(PROVISORIO_SUBMIT_RECONCILE_ALLOWS_TERMINAL_FAILURE, false);
  });
});
