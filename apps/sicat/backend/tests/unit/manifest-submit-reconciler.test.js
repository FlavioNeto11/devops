import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCorrelationMarker,
  reconcileManifestSubmit,
  SUBMIT_RECONCILE_POLLING_DELAYS_MS
} from '../../src/services/manifest-submit-reconciler.js';

const noSleep = async () => {};

// Lote realista: dois manifestos enviados no MESMO dia, MESMO parceiro e MESMO
// resíduo — os atributos de negócio não distinguem um do outro; só a identidade
// remota e o marcador de correlação diferem. É o cenário que o reconciliador
// existe para resolver.
function buildBatchItems() {
  const sharedAttributes = {
    manDataExpedicao: '05-08-2026',
    parceiroDescricao: 'GERADORA X LTDA',
    residuoCodigo: '170504'
  };
  return [
    {
      ...sharedAttributes,
      manCodigo: 111,
      manNumero: 'SP-111',
      manHashCode: 'hash-111',
      manObservacao: `Obra 5 ${buildCorrelationMarker('mtr-1')} via SICAT`
    },
    {
      ...sharedAttributes,
      manCodigo: 222,
      manNumero: 'SP-222',
      manHashCode: 'hash-222',
      manObservacao: `Obra 5 ${buildCorrelationMarker('mtr-2')} via SICAT`
    }
  ];
}

// Double honesto: devolve SEMPRE o lote inteiro, com marcadores DISTINTOS por
// manifestId — nunca "o mesmo item para qualquer marcador". Se o reconciliador
// casar o item errado, o teste enxerga.
function buildBatchSearchDouble() {
  const calls = [];
  const searchManifests = async (args) => {
    calls.push(args);
    return buildBatchItems();
  };
  return { searchManifests, calls };
}

test('buildCorrelationMarker - forma [sicat:<id>] pareada com a unidade C1', () => {
  assert.equal(buildCorrelationMarker('mtr-42'), '[sicat:mtr-42]');
  assert.equal(buildCorrelationMarker('  mtr-42  '), '[sicat:mtr-42]', 'Deve normalizar espaços do id');

  assert.throws(() => buildCorrelationMarker(''), (error) => {
    assert.equal(error.name, 'AppError');
    assert.equal(error.code, 'SUBMIT_RECONCILE_INVALID_MANIFEST_ID');
    return true;
  });
});

test('reconcileManifestSubmit - casa o manifesto CERTO num lote com marcadores distintos', async () => {
  const double = buildBatchSearchDouble();
  const resultForMtr2 = await reconcileManifestSubmit(
    { searchManifests: double.searchManifests, sleep: noSleep },
    { manifestId: 'mtr-2', search: { dateFrom: '05-08-2026', dateTo: '05-08-2026' } }
  );

  assert.equal(resultForMtr2.outcome, 'found');
  assert.equal(resultForMtr2.attempts, 1);
  assert.equal(resultForMtr2.match.manHashCode, 'hash-222', 'Deve casar o item do mtr-2, não o do mtr-1');
  assert.equal(resultForMtr2.match.manCodigo, 222);
  assert.equal(resultForMtr2.match.manNumero, 'SP-222');

  const resultForMtr1 = await reconcileManifestSubmit(
    { searchManifests: double.searchManifests, sleep: noSleep },
    { manifestId: 'mtr-1', search: { dateFrom: '05-08-2026', dateTo: '05-08-2026' } }
  );

  assert.equal(resultForMtr1.outcome, 'found');
  assert.equal(resultForMtr1.match.manHashCode, 'hash-111');

  // O double devolve o MESMO lote nas duas chamadas; os resultados diferem
  // porque o marcador diferencia — não porque o double concordou consigo mesmo.
  assert.notEqual(resultForMtr1.match.manHashCode, resultForMtr2.match.manHashCode);

  // A janela de datas do manifesto é repassada ao gateway injetado.
  assert.equal(double.calls.length, 2);
  assert.equal(double.calls[0].dateFrom, '05-08-2026');
  assert.equal(double.calls[0].dateTo, '05-08-2026');
});

test('reconcileManifestSubmit - mutação: casar por atributos (sem marcador) reintroduz ambiguidade no lote', async () => {
  const items = buildBatchItems();

  // Simula o matcher mutante: ignora o marcador e casa pelos atributos de
  // negócio do manifesto local (data + parceiro + resíduo). No lote, os DOIS
  // itens satisfazem o filtro → ambiguidade irrecuperável.
  const [localManifestAttributes] = items;
  const attributeMatches = items.filter((item) =>
    item.manDataExpedicao === localManifestAttributes.manDataExpedicao
    && item.parceiroDescricao === localManifestAttributes.parceiroDescricao
    && item.residuoCodigo === localManifestAttributes.residuoCodigo);

  assert.equal(attributeMatches.length, 2, 'Sem o marcador, os atributos casam os DOIS itens do lote');
  assert.notEqual(attributeMatches[0].manHashCode, attributeMatches[1].manHashCode,
    'Os candidatos ambíguos são manifestos remotos DISTINTOS — escolher um seria chute');

  // Com o marcador, o mesmo lote resolve para exatamente UM item, o correto.
  const { searchManifests } = buildBatchSearchDouble();
  const result = await reconcileManifestSubmit(
    { searchManifests, sleep: noSleep },
    { manifestId: 'mtr-1' }
  );
  assert.equal(result.outcome, 'found');
  assert.equal(result.match.manHashCode, 'hash-111');
});

test('reconcileManifestSubmit - marcador delimitado não sofre colisão de prefixo (mtr-1 × mtr-10)', async () => {
  const items = [
    { manCodigo: 10, manNumero: 'SP-10', manHashCode: 'hash-10', manObservacao: buildCorrelationMarker('mtr-10') },
    { manCodigo: 1, manNumero: 'SP-1', manHashCode: 'hash-1', manObservacao: buildCorrelationMarker('mtr-1') }
  ];
  const result = await reconcileManifestSubmit(
    { searchManifests: async () => items, sleep: noSleep },
    { manifestId: 'mtr-1' }
  );
  assert.equal(result.outcome, 'found');
  assert.equal(result.match.manHashCode, 'hash-1', 'O marcador de mtr-1 não pode casar o item de mtr-10');
});

test('reconcileManifestSubmit - polling: aparece na terceira tentativa com os delays do gateway', async () => {
  assert.deepEqual([...SUBMIT_RECONCILE_POLLING_DELAYS_MS], [2000, 5000, 10000, 15000, 20000],
    'Delays devem espelhar o padrão de polling existente no cetesb-gateway');

  let callCount = 0;
  const sleeps = [];
  const searchManifests = async () => {
    callCount += 1;
    return callCount < 3 ? [] : buildBatchItems();
  };
  const result = await reconcileManifestSubmit(
    { searchManifests, sleep: async (ms) => { sleeps.push(ms); } },
    { manifestId: 'mtr-2' }
  );

  assert.equal(result.outcome, 'found');
  assert.equal(result.attempts, 3, 'Não achar nas primeiras tentativas NUNCA encerra o polling');
  assert.equal(result.match.manHashCode, 'hash-222');
  assert.deepEqual(sleeps, [2000, 5000], 'Backoff crescente entre as tentativas, igual ao gateway');
});

test('reconcileManifestSubmit - não-encontrado só após esgotar TODAS as tentativas de polling', async () => {
  let callCount = 0;
  const sleeps = [];
  const result = await reconcileManifestSubmit(
    {
      searchManifests: async () => { callCount += 1; return []; },
      sleep: async (ms) => { sleeps.push(ms); }
    },
    { manifestId: 'mtr-7' }
  );

  assert.equal(result.outcome, 'not-found-after-polling');
  assert.equal(result.attempts, SUBMIT_RECONCILE_POLLING_DELAYS_MS.length, 'Uma busca por posição de delay');
  assert.equal(callCount, SUBMIT_RECONCILE_POLLING_DELAYS_MS.length);
  assert.deepEqual(sleeps, [2000, 5000, 10000, 15000], 'Sem sleep depois da última tentativa (padrão do gateway)');
  assert.equal(result.marker, '[sicat:mtr-7]');
});

test('reconcileManifestSubmit - o chamador pode injetar o orçamento de polling (delaysMs)', async () => {
  let callCount = 0;
  const sleeps = [];
  const result = await reconcileManifestSubmit(
    {
      searchManifests: async () => { callCount += 1; return []; },
      sleep: async (ms) => { sleeps.push(ms); },
      delaysMs: [50, 75]
    },
    { manifestId: 'mtr-8' }
  );

  assert.equal(result.outcome, 'not-found-after-polling');
  assert.equal(result.attempts, 2);
  assert.equal(callCount, 2);
  assert.deepEqual(sleeps, [50], 'Mesma anatomia do gateway com o orçamento do chamador');
});

test('reconcileManifestSubmit - erro de pesquisa vira resultado tipado, nunca throw nem "não existe"', async () => {
  const result = await reconcileManifestSubmit(
    {
      searchManifests: async () => { throw new Error('ETIMEDOUT: socket timed out'); },
      sleep: noSleep
    },
    { manifestId: 'mtr-9' }
  );

  assert.equal(result.outcome, 'error');
  assert.equal(result.attempts, 1);
  assert.equal(result.error.name, 'AppError');
  assert.equal(result.error.code, 'SUBMIT_RECONCILE_SEARCH_FAILED');
  assert.match(result.error.cause.message, /ETIMEDOUT/, 'O erro original é preservado em cause');
});

test('reconcileManifestSubmit - preserva os discriminantes de retry do erro CETESB original', async () => {
  const cetesbError = new Error('CETESB respondeu 404 para a pesquisa.');
  cetesbError.name = 'AppError';
  cetesbError.code = 'CETESB_HTTP_ERROR';
  cetesbError.remoteStatus = 404;

  const result = await reconcileManifestSubmit(
    { searchManifests: async () => { throw cetesbError; }, sleep: noSleep },
    { manifestId: 'mtr-11' }
  );

  assert.equal(result.outcome, 'error');
  assert.equal(result.error.code, 'SUBMIT_RECONCILE_SEARCH_FAILED');
  // Classificadores de retry (src/lib/retry.ts) leem remoteStatus e cause.code:
  // um 404 definitivo não pode virar 502 "re-tentável" mascarado.
  assert.equal(result.error.remoteStatus, 404);
  assert.equal(result.error.cause.code, 'CETESB_HTTP_ERROR');
});

test('reconcileManifestSubmit - dois manifestos remotos DISTINTOS com o mesmo marcador = ambiguidade explícita', async () => {
  const marker = buildCorrelationMarker('mtr-dup');
  const items = [
    { manCodigo: 501, manNumero: 'SP-501', manHashCode: 'hash-501', manObservacao: marker },
    { manCodigo: 502, manNumero: 'SP-502', manHashCode: 'hash-502', manObservacao: `reenvio ${marker}` }
  ];
  const result = await reconcileManifestSubmit(
    { searchManifests: async () => items, sleep: noSleep },
    { manifestId: 'mtr-dup' }
  );

  assert.equal(result.outcome, 'error');
  assert.equal(result.error.code, 'SUBMIT_RECONCILE_AMBIGUOUS_MARKER_MATCH');
  assert.equal(result.error.context.matchCount, 2);
});

test('reconcileManifestSubmit - o MESMO item remoto repetido na busca não é ambiguidade', async () => {
  const marker = buildCorrelationMarker('mtr-3');
  const duplicatedItem = { manCodigo: 300, manNumero: 'SP-300', manHashCode: 'hash-300', manObservacao: marker };
  const result = await reconcileManifestSubmit(
    { searchManifests: async () => [duplicatedItem, { ...duplicatedItem }], sleep: noSleep },
    { manifestId: 'mtr-3' }
  );

  assert.equal(result.outcome, 'found');
  assert.equal(result.match.manHashCode, 'hash-300');
});

test('reconcileManifestSubmit - aceita o formato { items } do gateway e marcador explícito', async () => {
  const marker = '[sicat:custom-id]';
  const result = await reconcileManifestSubmit(
    {
      searchManifests: async () => ({
        items: [{ manCodigo: 900, manNumero: 'SP-900', manHashCode: 'hash-900', manObservacao: `x ${marker} y` }]
      }),
      sleep: noSleep
    },
    { manifestId: 'mtr-ignored-by-marker', expectedMarker: marker }
  );

  assert.equal(result.outcome, 'found');
  assert.equal(result.marker, marker);
  assert.equal(result.match.manHashCode, 'hash-900');
});

test('reconcileManifestSubmit - valida dependência e manifestId com AppError de code estável', async () => {
  await assert.rejects(
    () => reconcileManifestSubmit({}, { manifestId: 'mtr-1' }),
    (error) => {
      assert.equal(error.code, 'SUBMIT_RECONCILE_MISSING_DEPENDENCY');
      return true;
    }
  );

  await assert.rejects(
    () => reconcileManifestSubmit({ searchManifests: async () => [], sleep: noSleep }, { manifestId: '   ' }),
    (error) => {
      assert.equal(error.code, 'SUBMIT_RECONCILE_INVALID_MANIFEST_ID');
      return true;
    }
  );
});
