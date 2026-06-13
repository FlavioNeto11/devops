import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableJobError } from '../../src/lib/retry.js';

// Os AppError do gateway CETESB chegam com status=502 (wrapper) e o código
// HTTP real em remoteStatus. A classificação deve olhar o erro REMOTO —
// incidente 2026-06-13: 400 definitivo re-tentado 5x até a DLQ.

function gatewayHttpError(remoteStatus, message = `A CETESB retornou ${remoteStatus} para POST /x.`) {
  return Object.assign(new Error(message), {
    status: 502,
    statusCode: 502,
    code: 'CETESB_HTTP_ERROR',
    remoteStatus
  });
}

describe('isRetryableJobError — erros do gateway CETESB', () => {
  it('4xx definitivo da CETESB NÃO re-tenta (400/403/404/409/422)', () => {
    for (const remoteStatus of [400, 403, 404, 409, 422]) {
      assert.equal(isRetryableJobError(gatewayHttpError(remoteStatus)), false, `remoteStatus ${remoteStatus}`);
    }
  });

  it('transitórios continuam retryable: 408, 429 e 5xx remotos', () => {
    for (const remoteStatus of [408, 429, 500, 502, 503]) {
      assert.equal(isRetryableJobError(gatewayHttpError(remoteStatus)), true, `remoteStatus ${remoteStatus}`);
    }
  });

  it('401 (CETESB_AUTH_FAILED, com refresh de sessão no gateway) segue retryable — comportamento preservado', () => {
    const authError = Object.assign(new Error('A CETESB retornou 401 para GET /x.'), {
      status: 502,
      statusCode: 502,
      code: 'CETESB_AUTH_FAILED',
      remoteStatus: 401
    });
    assert.equal(isRetryableJobError(authError), true);
  });

  it('CETESB_REMOTE_ERROR (erro de negócio, payload.erro=true) é definitivo mesmo embrulhado em 502', () => {
    const businessError = Object.assign(new Error('Manifesto não está Ativo para cancelamento.'), {
      status: 502,
      statusCode: 502,
      code: 'CETESB_REMOTE_ERROR'
    });
    assert.equal(isRetryableJobError(businessError), false);
  });

  it('regras gerais intactas: TEMPORARILY_UNAVAILABLE e timeouts re-tentam; erro genérico re-tenta', () => {
    assert.equal(isRetryableJobError(Object.assign(new Error('aguardando'), { code: 'TEMPORARILY_UNAVAILABLE' })), true);
    assert.equal(isRetryableJobError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), true);
    assert.equal(isRetryableJobError(new Error('algo inesperado')), true);
  });
});
