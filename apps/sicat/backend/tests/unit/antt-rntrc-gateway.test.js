/**
 * Gateway RNTRC/ANTT (PR-C1) — `createAnttRntrcGateway`.
 *
 * Duas frentes:
 *   1. `mode: 'mock'` — determinístico, sem rede (documentos terminados em dígito PAR → active/ETC;
 *      ÍMPAR → not_found; `mockOverrides` sobrepõe).
 *   2. `mode: 'open_data'` — parse do shape REAL do CKAN da ANTT (package_show + datastore_search),
 *      com `fetch` monkeypatchado (molde `tests/unit/whatsapp-worker-hardening.test.js`) devolvendo
 *      as fixtures de `tests/fixtures/regulatory/antt-open-data-sample.json` (shape real, valores
 *      fictícios — ver comentário da fixture).
 *
 * Nenhum destes testes toca a rede real — a sondagem real (curl/CKAN) foi feita manualmente durante
 * o desenvolvimento e o resultado está documentado no relatório do PR e nos comentários de
 * `src/gateways/antt-rntrc-gateway.ts`.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createAnttRntrcGateway } from '../../src/gateways/antt-rntrc-gateway.js';
import { isRetryableJobError } from '../../src/lib/retry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/regulatory/antt-open-data-sample.json');
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null }
  };
}

/** Enfileira respostas na ORDEM das chamadas — 1ª chamada = package_show, 2ª = datastore_search. */
function installFetchQueue(responses) {
  const calls = [];
  const queue = [...responses];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const next = queue.shift();
    if (!next) throw new Error(`fetch chamado além do esperado (url: ${url})`);
    if (next instanceof Error) throw next;
    return next;
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('antt-rntrc-gateway — mode: mock', () => {
  it('documento terminado em dígito PAR → found=true, active, ETC', async () => {
    const gateway = createAnttRntrcGateway({ mode: 'mock' });
    const result = await gateway.lookupCarrier({ document: '11222333000182' });
    assert.equal(result.found, true);
    assert.equal(result.status, 'active');
    assert.equal(result.category, 'ETC');
    assert.equal(result.source, 'mock');
    assert.deepEqual(result.exchanges, []);
  });

  it('documento terminado em dígito ÍMPAR → found=false, not_found', async () => {
    const gateway = createAnttRntrcGateway({ mode: 'mock' });
    const result = await gateway.lookupCarrier({ document: '11222333000181' });
    assert.equal(result.found, false);
    assert.equal(result.status, 'not_found');
    assert.equal(result.rntrcNumber, null);
  });

  it('mockOverrides sobrepõe o resultado default, por documento', async () => {
    const gateway = createAnttRntrcGateway({
      mode: 'mock',
      mockOverrides: {
        11222333000182: { found: true, status: 'suspended', category: 'TAC' }
      }
    });
    const result = await gateway.lookupCarrier({ document: '11.222.333/0001-82' });
    assert.equal(result.status, 'suspended');
    assert.equal(result.category, 'TAC');
  });

  it('lança RNTRC_GATEWAY_INVALID_QUERY sem document nem rntrcNumber', async () => {
    const gateway = createAnttRntrcGateway({ mode: 'mock' });
    await assert.rejects(
      () => gateway.lookupCarrier({}),
      (error) => {
        assert.equal(error.code, 'RNTRC_GATEWAY_INVALID_QUERY');
        assert.equal(error.status, 400);
        return true;
      }
    );
  });
});

describe('antt-rntrc-gateway — mode: open_data (datastore ativo, shape real via fixture)', () => {
  it('encontra o registro via datastore_search e mapeia ATIVO/ETC → active', async () => {
    installFetchQueue([
      jsonResponse(fixture.packageShow),
      jsonResponse(fixture.datastoreSearchFound)
    ]);

    const gateway = createAnttRntrcGateway({ mode: 'open_data', baseUrl: 'https://fixture.invalid', timeoutMs: 5000 });
    const result = await gateway.lookupCarrier({ document: '11222333000181' });

    assert.equal(result.found, true);
    assert.equal(result.status, 'active');
    assert.equal(result.category, 'ETC');
    assert.equal(result.rntrcNumber, '50085788');
    assert.equal(result.source, 'datastore');
    assert.equal(result.dataReferenceDate, '2026-02-10', 'dataReferenceDate vem de last_modified do resource');
    assert.equal(result.exchanges.length, 2, 'package_show + datastore_search');
    assert.equal(result.exchanges[1].response.httpStatus, 200);

    // LGPD: raw NUNCA carrega nome/endereço, só o necessário para o relatório.
    assert.deepEqual(Object.keys(result.raw).sort(), ['category', 'rntrcNumber', 'status', 'statusDate', 'uf']);
  });

  it('PENDENTE mapeia para status "unknown" (nem regular, nem irregular)', async () => {
    installFetchQueue([
      jsonResponse(fixture.packageShow),
      jsonResponse(fixture.datastoreSearchPendente)
    ]);

    const gateway = createAnttRntrcGateway({ mode: 'open_data', baseUrl: 'https://fixture.invalid', timeoutMs: 5000 });
    const result = await gateway.lookupCarrier({ document: '11444777000161' });

    assert.equal(result.found, true);
    assert.equal(result.status, 'unknown');
    assert.equal(result.category, 'TAC');
  });

  it('sem registro correspondente → found=false, not_found (nunca prova irregularidade)', async () => {
    installFetchQueue([
      jsonResponse(fixture.packageShow),
      jsonResponse(fixture.datastoreSearchNotFound)
    ]);

    const gateway = createAnttRntrcGateway({ mode: 'open_data', baseUrl: 'https://fixture.invalid', timeoutMs: 5000 });
    const result = await gateway.lookupCarrier({ rntrcNumber: '99999999' });

    assert.equal(result.found, false);
    assert.equal(result.status, 'not_found');
    assert.deepEqual(result.raw, {});
  });

  it('busca por rntrcNumber usa filtro numero_rntrc sem zeros à esquerda', async () => {
    let capturedFilters = null;
    globalThis.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith('datastore_search')) {
        capturedFilters = JSON.parse(parsed.searchParams.get('filters'));
      }
      if (parsed.pathname.endsWith('package_show')) return jsonResponse(fixture.packageShow);
      return jsonResponse(fixture.datastoreSearchFound);
    };

    const gateway = createAnttRntrcGateway({ mode: 'open_data', baseUrl: 'https://fixture.invalid', timeoutMs: 5000 });
    await gateway.lookupCarrier({ rntrcNumber: '050085788' });

    assert.deepEqual(capturedFilters, { numero_rntrc: '50085788' });
  });
});

describe('antt-rntrc-gateway — mode: open_data, erros tipados', () => {
  it('5xx do CKAN vira erro retryable (status >= 500)', async () => {
    installFetchQueue([jsonResponse({ success: false }, 503)]);

    const gateway = createAnttRntrcGateway({ mode: 'open_data', baseUrl: 'https://fixture.invalid', timeoutMs: 5000 });
    await assert.rejects(
      () => gateway.lookupCarrier({ document: '11222333000181' }),
      (error) => {
        assert.equal(error.code, 'RNTRC_GATEWAY_HTTP_ERROR');
        assert.equal(error.status, 503);
        assert.equal(isRetryableJobError(error), true, 'erro 5xx deve ser classificado como retryable');
        return true;
      }
    );
  });

  it('falha de rede (fetch rejeita) vira RNTRC_GATEWAY_NETWORK_ERROR, retryable', async () => {
    installFetchQueue([new Error('ECONNRESET simulado')]);

    const gateway = createAnttRntrcGateway({ mode: 'open_data', baseUrl: 'https://fixture.invalid', timeoutMs: 5000 });
    await assert.rejects(
      () => gateway.lookupCarrier({ document: '11222333000181' }),
      (error) => {
        assert.equal(error.code, 'RNTRC_GATEWAY_NETWORK_ERROR');
        assert.equal(isRetryableJobError(error), true);
        return true;
      }
    );
  });

  it('404 do CKAN vira erro NÃO retryable (status definitivo)', async () => {
    installFetchQueue([jsonResponse({ success: false }, 404)]);

    const gateway = createAnttRntrcGateway({ mode: 'open_data', baseUrl: 'https://fixture.invalid', timeoutMs: 5000 });
    await assert.rejects(
      () => gateway.lookupCarrier({ document: '11222333000181' }),
      (error) => {
        assert.equal(error.status, 404);
        assert.equal(isRetryableJobError(error), false, '4xx definitivo não deve ser retentado');
        return true;
      }
    );
  });
});
