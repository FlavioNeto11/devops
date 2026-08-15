/**
 * Gateway do Regulatory Watch (PR-H1) — `createRegulatoryWatchGateway`.
 *
 * Duas frentes:
 *   1. `mode: 'off'` (default) — NO-OP LIMPO, nunca toca a rede, nunca lança.
 *   2. `mode: 'live'` — `fetch` monkeypatchado (molde `tests/unit/antt-rntrc-gateway.test.js`):
 *      hash sha256 do corpo, comparação com `previousHash`, etag/last-modified propagados, persiste
 *      só quando o hash MUDA, erro HTTP/timeout/rede vira `AppError` retryable.
 *
 * Nenhum destes testes toca a rede real.
 */

import { describe, it, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

import { createRegulatoryWatchGateway } from '../../src/gateways/regulatory-watch-gateway.js';
import { resolveStoragePath } from '../../src/lib/files.js';
import { isRetryableJobError } from '../../src/lib/retry.js';

const originalFetch = globalThis.fetch;

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function installFetchOnce(response) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (response instanceof Error) throw response;
    return response;
  };
  return calls;
}

function textResponse(body, { status = 200, etag = null, lastModified = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'etag' ? etag : name.toLowerCase() === 'last-modified' ? lastModified : null) },
    arrayBuffer: async () => Buffer.from(body, 'utf8')
  };
}

const createdFiles = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(async () => {
  await Promise.all(createdFiles.map((filePath) => fs.rm(filePath, { force: true })));
});

describe('regulatory-watch-gateway — mode: off', () => {
  it('fetchSource devolve { skipped: true } sem tocar a rede', async () => {
    const calls = installFetchOnce(new Error('fetch NÃO deveria ser chamado em mode off'));
    const gateway = createRegulatoryWatchGateway({ mode: 'off' });
    assert.equal(gateway.mode, 'off');

    const result = await gateway.fetchSource({ url: 'https://example.test/norma', previousHash: null });
    assert.deepEqual(result, { skipped: true, reason: 'watch_mode_off' });
    assert.equal(calls.length, 0);
  });
});

describe('regulatory-watch-gateway — mode: live', () => {
  it('primeira verificação (previousHash null) → changed=true, contentHash correto, contentRef gravado', async () => {
    const body = '<html>norma versão 1</html>';
    installFetchOnce(textResponse(body, { etag: 'W/"abc123"', lastModified: 'Wed, 12 Aug 2026 10:00:00 GMT' }));
    const gateway = createRegulatoryWatchGateway({ mode: 'live', timeoutMs: 5000 });

    const result = await gateway.fetchSource({ url: 'https://example.test/norma', previousHash: null });
    assert.equal(result.skipped, false);
    assert.equal(result.changed, true);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.contentHash, sha256(body));
    assert.equal(result.etag, 'W/"abc123"');
    assert.equal(result.lastModified, 'Wed, 12 Aug 2026 10:00:00 GMT');
    assert.ok(result.contentRef, 'contentRef deveria ser gravado quando o hash muda');
    createdFiles.push(result.contentRef);

    const persisted = await fs.readFile(result.contentRef, 'utf8');
    assert.equal(persisted, body);
    assert.equal(result.exchange.response.httpStatus, 200);
  });

  it('hash igual ao previousHash → changed=false, NADA é gravado em disco', async () => {
    const body = '<html>norma sem mudança</html>';
    const knownHash = sha256(body);
    installFetchOnce(textResponse(body));
    const gateway = createRegulatoryWatchGateway({ mode: 'live', timeoutMs: 5000 });

    const result = await gateway.fetchSource({ url: 'https://example.test/norma', previousHash: knownHash });
    assert.equal(result.changed, false);
    assert.equal(result.contentHash, knownHash);
    assert.equal(result.contentRef, null);
  });

  it('hash diferente do previousHash → changed=true', async () => {
    const body = '<html>norma versão 2 — texto novo</html>';
    installFetchOnce(textResponse(body));
    const gateway = createRegulatoryWatchGateway({ mode: 'live', timeoutMs: 5000 });

    const result = await gateway.fetchSource({ url: 'https://example.test/norma', previousHash: sha256('<html>norma versão 1</html>') });
    assert.equal(result.changed, true);
    createdFiles.push(result.contentRef);
  });

  it('resposta HTTP não-2xx → AppError retryable (REGULATORY_WATCH_GATEWAY_HTTP_ERROR)', async () => {
    installFetchOnce(textResponse('erro', { status: 503 }));
    const gateway = createRegulatoryWatchGateway({ mode: 'live', timeoutMs: 5000 });

    await assert.rejects(
      gateway.fetchSource({ url: 'https://example.test/norma', previousHash: null }),
      (error) => {
        assert.equal(error.code, 'REGULATORY_WATCH_GATEWAY_HTTP_ERROR');
        assert.equal(isRetryableJobError(error), true);
        return true;
      }
    );
  });

  it('falha de rede → AppError REGULATORY_WATCH_GATEWAY_NETWORK_ERROR, retryable', async () => {
    installFetchOnce(new TypeError('fetch failed'));
    const gateway = createRegulatoryWatchGateway({ mode: 'live', timeoutMs: 5000 });

    await assert.rejects(
      gateway.fetchSource({ url: 'https://example.test/norma', previousHash: null }),
      (error) => {
        assert.equal(error.code, 'REGULATORY_WATCH_GATEWAY_NETWORK_ERROR');
        assert.equal(isRetryableJobError(error), true);
        return true;
      }
    );
  });

  it('url vazia → 400 REGULATORY_WATCH_GATEWAY_INVALID_URL', async () => {
    const gateway = createRegulatoryWatchGateway({ mode: 'live' });
    await assert.rejects(
      gateway.fetchSource({ url: '', previousHash: null }),
      (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.code, 'REGULATORY_WATCH_GATEWAY_INVALID_URL');
        return true;
      }
    );
  });

  it('User-Agent identificado é enviado na requisição', async () => {
    const calls = installFetchOnce(textResponse('conteúdo'));
    const gateway = createRegulatoryWatchGateway({ mode: 'live', userAgent: 'sicat-teste/1.0' });
    await gateway.fetchSource({ url: 'https://example.test/norma', previousHash: null });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers['user-agent'], 'sicat-teste/1.0');
  });
});

describe('regulatory-watch-gateway — armazenamento', () => {
  it('grava sob STORAGE_DIR/regulatory-watch/', async () => {
    const body = 'conteúdo de teste único ' + Date.now();
    installFetchOnce(textResponse(body));
    const gateway = createRegulatoryWatchGateway({ mode: 'live' });

    const result = await gateway.fetchSource({ url: 'https://example.test/norma', previousHash: null });
    createdFiles.push(result.contentRef);

    const expectedPath = resolveStoragePath('regulatory-watch', `${result.contentHash}.bin`);
    assert.equal(result.contentRef, expectedPath);
  });
});
