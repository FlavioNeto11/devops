import test from 'node:test';
import assert from 'node:assert';
import {
  buildCorrelationMarker,
  buildManifestSubmitReconcilePatch,
  buildManifestSubmitReconcileSearchArgs,
  buildManifestSubmitUnaskedPatch,
  resolveManifestSubmitMarker,
  resolveManifestSubmitReconcilePatch
} from '../../src/services/manifest-submit-reconciler.js';

// Tradução DESFECHO → PATCH. É aqui que se decide, para os dois pontos que
// antes declaravam falha sem perguntar nada, o que cada resposta da CETESB
// significa para a linha local.
//
// Regra de double desta casa: o double devolve dado CRU (os itens como a
// pesquisa da CETESB devolveria) e nunca reimplementa o casamento por marcador
// — quem casa é o código sob teste. Valores distintos por identidade para que
// trocar de item mude a asserção.

const NO_SLEEP = async () => {};

function buildRemoteItem({ id, manCodigo, manNumero, manHashCode, notes = 'Obra 5' }) {
  return {
    manCodigo,
    manNumero,
    manHashCode,
    manObservacao: `${notes} ${buildCorrelationMarker(id)} via SICAT`
  };
}

test('found com identidade completa vira `submitted` confirmado — nunca falha', () => {
  const patch = buildManifestSubmitReconcilePatch(
    {
      outcome: 'found',
      manifestId: 'man_a',
      marker: '[sicat:man_a]',
      attempts: 1,
      match: { manCodigo: 777, manNumero: 'SP-777', manHashCode: 'hash-777', manObservacao: null }
    },
    { allowTerminalFailure: true, terminalAction: 'dlq' }
  );

  assert.equal(patch.confirmed, true);
  assert.equal(patch.status, 'submitted');
  assert.equal(patch.externalHashCode, 'hash-777');
  assert.deepEqual(patch.externalReference, { manCodigo: 777, manNumero: 'SP-777' });
  assert.match(patch.externalStatus, /SP-777/);
});

test('found SEM manHashCode não pode virar `submitted` (chk_manifest_submitted_integrity)', () => {
  // A constraint exige external_hash_code not null quando status = 'submitted'.
  // Sem esta guarda o UPDATE estouraria 23514 justamente no caso que a
  // reconciliação existe para consertar.
  const patch = buildManifestSubmitReconcilePatch(
    {
      outcome: 'found',
      manifestId: 'man_b',
      marker: '[sicat:man_b]',
      attempts: 2,
      match: { manCodigo: 55, manNumero: 'SP-55', manHashCode: null, manObservacao: null }
    },
    { allowTerminalFailure: true }
  );

  assert.equal(patch.confirmed, true, 'continua sendo confirmação: o MTR existe');
  assert.equal(patch.status, 'processing');
  assert.equal(patch.externalHashCode, null);
  assert.deepEqual(patch.externalReference, { manCodigo: 55, manNumero: 'SP-55' });
});

test('not-found: só com orçamento de polling CHEIO vira `failed`', () => {
  const result = { outcome: 'not-found-after-polling', manifestId: 'man_c', marker: '[sicat:man_c]', attempts: 5 };

  const comAutoridade = buildManifestSubmitReconcilePatch(result, { allowTerminalFailure: true, terminalAction: 'dlq' });
  assert.equal(comAutoridade.status, 'failed');
  assert.equal(comAutoridade.confirmed, false);
  assert.match(comAutoridade.externalStatus, /realize novo envio/i, 'provou a ausência: pode mandar reenviar');

  // Caminho de leitura (1 tentativa, sem sleep): uma pesquisa que não achou NÃO
  // é prova de ausência — a pesquisa da CETESB atrasa em relação ao envio.
  const semAutoridade = buildManifestSubmitReconcilePatch(result, { allowTerminalFailure: false, terminalAction: 'dlq' });
  assert.equal(semAutoridade.status, 'submit_unconfirmed');
  assert.match(semAutoridade.externalStatus, /NÃO reenvie/);
  assert.doesNotMatch(semAutoridade.externalStatus, /realize novo envio/i);
});

test('error (pesquisa falhou ou marcador ambíguo) é sempre `submit_unconfirmed`', () => {
  for (const allowTerminalFailure of [true, false]) {
    const patch = buildManifestSubmitReconcilePatch(
      {
        outcome: 'error',
        manifestId: 'man_d',
        marker: '[sicat:man_d]',
        attempts: 1,
        error: new Error('boom')
      },
      { allowTerminalFailure, terminalAction: 'dlq' }
    );

    assert.equal(patch.status, 'submit_unconfirmed', 'erro de pesquisa é INCONCLUSIVO, nunca "não existe"');
    assert.equal(patch.confirmed, false);
    assert.doesNotMatch(patch.externalStatus, /realize novo envio/i);
  }
});

test('sem meio de perguntar (nenhum searchManifests injetado) o desfecho é `submit_unconfirmed`', async () => {
  const patch = await resolveManifestSubmitReconcilePatch(
    { id: 'man_e', integrationAccountId: 'acc_1', payload: {} },
    {},
    { allowTerminalFailure: true, terminalAction: 'dlq' }
  );

  assert.equal(patch.status, 'submit_unconfirmed');
  assert.match(patch.externalStatus, /NÃO reenvie/);
  assert.deepEqual(
    patch,
    buildManifestSubmitUnaskedPatch({ terminalAction: 'dlq', detail: null, technicalCause: null })
  );
});

test('resolve confirma o manifesto quando a CETESB devolve o item com o marcador', async () => {
  const calls = [];
  const searchManifests = async (args) => {
    calls.push(args);
    // Dado CRU: três itens, um por identidade. Quem casa pelo marcador é o
    // código sob teste, não este double.
    return [
      buildRemoteItem({ id: 'man_outro', manCodigo: 1, manNumero: 'SP-1', manHashCode: 'hash-1' }),
      buildRemoteItem({ id: 'man_alvo', manCodigo: 2, manNumero: 'SP-2', manHashCode: 'hash-2' }),
      { manCodigo: 3, manNumero: 'SP-3', manHashCode: 'hash-3', manObservacao: 'sem marcador nenhum' }
    ];
  };

  const patch = await resolveManifestSubmitReconcilePatch(
    {
      id: 'man_alvo',
      integrationAccountId: 'acc_1',
      sessionContextId: 'scx_1',
      payload: { expeditionDate: '2026-08-05' }
    },
    { searchManifests, sleep: NO_SLEEP },
    { allowTerminalFailure: true, terminalAction: 'dlq', correlationId: 'corr_9' }
  );

  assert.equal(patch.confirmed, true, 'o envio nasceu: não pode virar falha');
  assert.equal(patch.status, 'submitted');
  assert.equal(patch.externalHashCode, 'hash-2', 'tem de casar o item do PRÓPRIO manifesto, não o vizinho');
  assert.deepEqual(patch.externalReference, { manCodigo: 2, manNumero: 'SP-2' });

  assert.equal(calls.length, 1, 'achou na primeira tentativa: não deve continuar o polling');
  assert.deepEqual(calls[0], {
    integrationAccountId: 'acc_1',
    sessionContextId: 'scx_1',
    correlationId: 'corr_9',
    dateFrom: '2026-08-02',
    dateTo: '2026-08-08'
  });
});

test('CONTROLE NEGATIVO: item de OUTRO manifesto não confirma este', async () => {
  const searchManifests = async () => [
    buildRemoteItem({ id: 'man_vizinho', manCodigo: 9, manNumero: 'SP-9', manHashCode: 'hash-9' })
  ];

  const patch = await resolveManifestSubmitReconcilePatch(
    { id: 'man_alvo', integrationAccountId: 'acc_1', payload: { expeditionDate: '2026-08-05' } },
    { searchManifests, sleep: NO_SLEEP, delaysMs: [0] },
    { allowTerminalFailure: true, terminalAction: 'dlq' }
  );

  assert.equal(patch.confirmed, false);
  assert.equal(patch.status, 'failed');
});

test('pesquisa que explode não vira "não existe"', async () => {
  const searchManifests = async () => {
    throw Object.assign(new Error('CETESB fora do ar'), { code: 'CETESB_HTTP_ERROR', remoteStatus: 503 });
  };

  const patch = await resolveManifestSubmitReconcilePatch(
    { id: 'man_f', integrationAccountId: 'acc_1', payload: { expeditionDate: '2026-08-05' } },
    { searchManifests, sleep: NO_SLEEP, delaysMs: [0] },
    { allowTerminalFailure: true, terminalAction: 'dlq' }
  );

  assert.equal(patch.status, 'submit_unconfirmed');
  assert.doesNotMatch(patch.externalStatus, /realize novo envio/i);
});

test('marcador vem do payload persistido no pré-submit; senão é derivado do id', () => {
  assert.equal(
    resolveManifestSubmitMarker({ id: 'man_x', payload: { submitCorrelation: { marker: '[sicat:man_legado]' } } }),
    '[sicat:man_legado]',
    'a linha guarda o marcador REALMENTE enviado — não o que o id sugere hoje'
  );
  assert.equal(resolveManifestSubmitMarker({ id: 'man_x', payload: {} }), '[sicat:man_x]');
  assert.equal(resolveManifestSubmitMarker({ id: 'id com espaço', payload: null }), null);
});

test('janela de pesquisa cai para a data de criação e depois para hoje', () => {
  assert.deepEqual(
    buildManifestSubmitReconcileSearchArgs({ id: 'm', createdAt: '2026-01-31T10:00:00.000Z' }),
    {
      integrationAccountId: null,
      sessionContextId: null,
      correlationId: null,
      dateFrom: '2026-01-28',
      dateTo: '2026-02-03'
    }
  );

  const semData = buildManifestSubmitReconcileSearchArgs({ id: 'm' });
  assert.match(semData.dateFrom, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(semData.dateTo, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(semData.dateFrom < semData.dateTo);
});
