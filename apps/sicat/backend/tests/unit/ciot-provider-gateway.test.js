/**
 * Gateway do provedor de CIOT (PR-C2) — `createCiotProviderGateway`.
 *
 * `mode: 'mock'` é hoje a ÚNICA implementação (nenhum provedor CIOT contratado/homologado —
 * [EXTERNAL DEPENDENCY] P5): determinístico e STATEFUL EM MEMÓRIA POR PROCESSO (Map por
 * `correlationMarker`, módulo-level — sobrevive à criação de novas instâncias do gateway, o que
 * permite ao reconciliador "achar" o que uma tentativa anterior registrou). `mode: 'real'` recusa
 * criar a instância com `CIOT_PROVIDER_NOT_CONFIGURED`.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createCiotProviderGateway, resetCiotProviderMockStoreForTests } from '../../src/gateways/ciot-provider-gateway.js';
import { isRetryableJobError } from '../../src/lib/retry.js';

function buildRegisterPayload(overrides = {}) {
  return {
    correlationMarker: '[sicat:ciot_fixture]',
    operationId: 'trop_fixture',
    parties: [{ role: 'carrier', document: '11222333000181' }, { role: 'contractor', document: '99888777000166' }],
    cargo: [{ cargoType: 'granel', weightKg: 30000 }],
    route: { originUf: 'SP', destinationUf: 'MG' },
    freight: { offeredAmount: 3800, contractedAmount: 3800 },
    payment: { method: 'boleto', termDays: 30 },
    ...overrides
  };
}

beforeEach(() => {
  resetCiotProviderMockStoreForTests();
});

describe('ciot-provider-gateway — mode: mock — registerCiot', () => {
  it('registra e devolve um ciotNumber determinístico', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    const result = await gateway.registerCiot(buildRegisterPayload());
    assert.equal(result.externalStatus, 'REGISTERED');
    assert.match(result.ciotNumber, /^\d+$/);
  });

  it('o MESMO correlationMarker sempre produz o MESMO ciotNumber (determinístico)', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    const first = await gateway.registerCiot(buildRegisterPayload());
    const second = await gateway.registerCiot(buildRegisterPayload());
    assert.equal(second.ciotNumber, first.ciotNumber);
  });

  it('um SEGUNDO registerCiot com o mesmo marcador é IDEMPOTENTE — não duplica o registro (retry seguro)', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    const first = await gateway.registerCiot(buildRegisterPayload());
    const second = await gateway.registerCiot(buildRegisterPayload());
    assert.deepEqual(second, first);
  });

  it('freight abaixo do mínimo (100) → rejeita com CIOT_PROVIDER_REJECTED_TEST', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    await assert.rejects(
      () => gateway.registerCiot(buildRegisterPayload({ freight: { offeredAmount: 50, contractedAmount: null } })),
      (error) => {
        assert.equal(error.code, 'CIOT_PROVIDER_REJECTED_TEST');
        assert.equal(isRetryableJobError(error), false, 'rejeição definitiva NÃO deve ser retentável');
        return true;
      }
    );
  });

  it('testFlags.simulateLostResponse: GRAVA no Map mas LANÇA timeout (DL-102 — resposta perdida)', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    const marker = '[sicat:ciot_lost_response]';

    await assert.rejects(
      () => gateway.registerCiot(buildRegisterPayload({ correlationMarker: marker, testFlags: { simulateLostResponse: true } })),
      (error) => {
        assert.equal(error.code, 'CIOT_PROVIDER_LOST_RESPONSE_TEST');
        assert.equal(isRetryableJobError(error), true, 'resposta perdida DEVE ser retentável (a fila decide o backoff)');
        return true;
      }
    );

    // O "provedor" processou de verdade — só a RESPOSTA se perdeu. queryCiotByMarker prova isso.
    const query = await gateway.queryCiotByMarker({ correlationMarker: marker });
    assert.equal(query.found, true);
    assert.match(query.ciotNumber, /^\d+$/);
  });
});

describe('ciot-provider-gateway — mode: mock — queryCiotByMarker', () => {
  it('marcador desconhecido → found=false (nunca lança)', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    const result = await gateway.queryCiotByMarker({ correlationMarker: '[sicat:ciot_never_existed]' });
    assert.deepEqual(result, { found: false });
  });

  it('marcador registrado → found=true com o mesmo ciotNumber do registro', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    const registered = await gateway.registerCiot(buildRegisterPayload());
    const query = await gateway.queryCiotByMarker({ correlationMarker: '[sicat:ciot_fixture]' });
    assert.equal(query.found, true);
    assert.equal(query.ciotNumber, registered.ciotNumber);
    assert.equal(query.externalStatus, 'REGISTERED');
  });
});

describe('ciot-provider-gateway — mode: mock — rectifyCiot/cancelCiot/closeCiot', () => {
  it('rectifyCiot sobre um marcador registrado → externalStatus RECTIFIED', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    await gateway.registerCiot(buildRegisterPayload());
    const result = await gateway.rectifyCiot({ correlationMarker: '[sicat:ciot_fixture]' });
    assert.equal(result.externalStatus, 'RECTIFIED');

    const query = await gateway.queryCiotByMarker({ correlationMarker: '[sicat:ciot_fixture]' });
    assert.equal(query.externalStatus, 'RECTIFIED');
  });

  it('cancelCiot sobre um marcador registrado → externalStatus CANCELLED', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    await gateway.registerCiot(buildRegisterPayload());
    const result = await gateway.cancelCiot({ correlationMarker: '[sicat:ciot_fixture]', reason: 'teste' });
    assert.equal(result.externalStatus, 'CANCELLED');
  });

  it('closeCiot sobre um marcador registrado → externalStatus CLOSED', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    await gateway.registerCiot(buildRegisterPayload());
    const result = await gateway.closeCiot({ correlationMarker: '[sicat:ciot_fixture]' });
    assert.equal(result.externalStatus, 'CLOSED');
  });

  it('mutação sobre marcador NUNCA registrado → CIOT_PROVIDER_NOT_FOUND_TEST', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    await assert.rejects(
      () => gateway.rectifyCiot({ correlationMarker: '[sicat:ciot_never_existed]' }),
      (error) => {
        assert.equal(error.code, 'CIOT_PROVIDER_NOT_FOUND_TEST');
        return true;
      }
    );
  });

  it('testFlags.simulateLostResponse numa mutação: aplica no Map mas LANÇA timeout', async () => {
    const gateway = createCiotProviderGateway({ mode: 'mock' });
    await gateway.registerCiot(buildRegisterPayload());

    await assert.rejects(
      () => gateway.cancelCiot({ correlationMarker: '[sicat:ciot_fixture]', testFlags: { simulateLostResponse: true } }),
      (error) => {
        assert.equal(error.code, 'CIOT_PROVIDER_LOST_RESPONSE_TEST');
        return true;
      }
    );

    const query = await gateway.queryCiotByMarker({ correlationMarker: '[sicat:ciot_fixture]' });
    assert.equal(query.found, true);
    assert.equal(query.externalStatus, 'CANCELLED', 'o provedor processou a mutação — só a resposta se perdeu');
  });
});

describe('ciot-provider-gateway — mode: real', () => {
  it('recusa criar a instância com CIOT_PROVIDER_NOT_CONFIGURED (P5 sem provedor contratado)', () => {
    assert.throws(
      () => createCiotProviderGateway({ mode: 'real' }),
      (error) => {
        assert.equal(error.code, 'CIOT_PROVIDER_NOT_CONFIGURED');
        return true;
      }
    );
  });
});
