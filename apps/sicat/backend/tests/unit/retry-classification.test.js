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

// Precedência de NON_RETRYABLE_ERROR_CODES sobre o status HTTP: erros permanentes de
// configuração/capacidade dos gateways do Transporte chegam com 501 e eram classificados
// como retentáveis pela regra ">=500", gastando max_attempts em erros que nunca mudam.
// A lista curada vence o status; a exceção documentada é CETESB_AUTH_FAILED (abaixo).

function permanentConfigError(code, status = 501) {
  return Object.assign(new Error(`configuração ausente (${code})`), {
    status,
    statusCode: status,
    code
  });
}

describe('isRetryableJobError — código não-retentável vence status 5xx', () => {
  it('erros permanentes de configuração/capacidade com 501 NÃO re-tentam', () => {
    for (const code of [
      'CIOT_PROVIDER_NOT_CONFIGURED',
      'VPO_PROVIDER_NOT_CONFIGURED',
      'INSURANCE_PROVIDER_NOT_CONFIGURED',
      'DFE_ISSUANCE_DISABLED',
      'DFE_ISSUANCE_TYPE_NOT_SUPPORTED'
    ]) {
      assert.equal(isRetryableJobError(permanentConfigError(code)), false, code);
    }
  });

  it('a lista vence QUALQUER 5xx, não só 501', () => {
    assert.equal(isRetryableJobError(permanentConfigError('DFE_ISSUANCE_DISABLED', 500)), false);
    assert.equal(isRetryableJobError(permanentConfigError('CIOT_PROVIDER_NOT_CONFIGURED', 503)), false);
  });

  it('controle negativo: 5xx com código DESCONHECIDO continua retryable (regra de status intacta)', () => {
    assert.equal(isRetryableJobError(permanentConfigError('SOME_UNKNOWN_TRANSIENT_CODE', 501)), true);
    assert.equal(isRetryableJobError(Object.assign(new Error('boom'), { status: 500, statusCode: 500 })), true);
  });

  it('exceção documentada: CETESB_AUTH_FAILED mantém status-first (502 wrapper → retryable com refresh de sessão; sem status → definitivo)', () => {
    const wrapped = Object.assign(new Error('A CETESB retornou 401 para GET /x.'), {
      status: 502,
      statusCode: 502,
      code: 'CETESB_AUTH_FAILED',
      remoteStatus: 401
    });
    assert.equal(isRetryableJobError(wrapped), true, 'embrulhado em 502: gateway renova sessão no retry');

    const bare = Object.assign(new Error('credenciais CETESB inválidas'), { code: 'CETESB_AUTH_FAILED' });
    assert.equal(isRetryableJobError(bare), false, 'sem status classificável: decide a lista não-retentável');
  });

  it('recusas definitivas de provedor (side-effect terminal lê o código) seguem não-retentáveis', () => {
    assert.equal(isRetryableJobError(permanentConfigError('CIOT_PROVIDER_REJECTED_TEST', 502)), false);
    assert.equal(isRetryableJobError(permanentConfigError('VPO_PROVIDER_REJECTED_TEST', 502)), false);
  });
});
