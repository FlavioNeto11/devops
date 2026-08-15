/**
 * Gateway do provedor de VPO (PR-D1) — `createVpoProviderGateway`.
 *
 * `mode: 'mock'` é hoje a ÚNICA implementação (nenhuma fornecedora de VPO integrada tecnicamente —
 * [EXTERNAL DEPENDENCY] P6): determinístico e STATEFUL EM MEMÓRIA POR PROCESSO (Map por
 * `correlationMarker`, módulo-level — sobrevive à criação de novas instâncias do gateway, o que
 * permite ao reconciliador "achar" o que uma tentativa anterior registrou). `mode: 'real'` recusa
 * criar a instância com `VPO_PROVIDER_NOT_CONFIGURED`.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createVpoProviderGateway, resetVpoProviderMockStoreForTests } from '../../src/gateways/vpo-gateway.js';
import { isRetryableJobError } from '../../src/lib/retry.js';

function buildAcquirePayload(overrides = {}) {
  return {
    correlationMarker: '[sicat-vpo:vpoalloc_fixture]',
    operationId: 'trop_fixture',
    providerId: 'vpoprov_fixture',
    route: { originUf: 'SP', destinationUf: 'MG', distanceKm: 586.2 },
    ...overrides
  };
}

beforeEach(() => {
  resetVpoProviderMockStoreForTests();
});

describe('vpo-gateway — mode: mock — acquireVpo', () => {
  it('adquire e devolve uma providerReference determinística com amount > 0', async () => {
    const gateway = createVpoProviderGateway({ mode: 'mock' });
    const result = await gateway.acquireVpo(buildAcquirePayload());
    assert.match(result.providerReference, /^VPO\d+$/);
    assert.ok(result.amount > 0);
  });

  it('o MESMO correlationMarker sempre produz a MESMA providerReference/amount (determinístico)', async () => {
    const gateway = createVpoProviderGateway({ mode: 'mock' });
    const first = await gateway.acquireVpo(buildAcquirePayload());
    const second = await gateway.acquireVpo(buildAcquirePayload());
    assert.equal(second.providerReference, first.providerReference);
    assert.equal(second.amount, first.amount);
  });

  it('uma SEGUNDA acquireVpo com o mesmo marcador é IDEMPOTENTE — não duplica a aquisição (retry seguro)', async () => {
    const gateway = createVpoProviderGateway({ mode: 'mock' });
    const first = await gateway.acquireVpo(buildAcquirePayload());
    const second = await gateway.acquireVpo(buildAcquirePayload());
    assert.deepEqual(second, first);
  });

  it('distância maior produz um amount maior (proporcional à rota)', async () => {
    const gateway = createVpoProviderGateway({ mode: 'mock' });
    const short = await gateway.acquireVpo(buildAcquirePayload({ correlationMarker: '[sicat-vpo:vpoalloc_short]', route: { originUf: 'SP', destinationUf: 'SP', distanceKm: 50 } }));
    const long = await gateway.acquireVpo(buildAcquirePayload({ correlationMarker: '[sicat-vpo:vpoalloc_long]', route: { originUf: 'SP', destinationUf: 'PA', distanceKm: 2500 } }));
    assert.ok(long.amount > short.amount);
  });

  it('sem rota (route: null) → rejeita com VPO_PROVIDER_REJECTED_TEST', async () => {
    const gateway = createVpoProviderGateway({ mode: 'mock' });
    await assert.rejects(
      () => gateway.acquireVpo(buildAcquirePayload({ route: null })),
      (error) => {
        assert.equal(error.code, 'VPO_PROVIDER_REJECTED_TEST');
        assert.equal(isRetryableJobError(error), false, 'rejeição definitiva NÃO deve ser retentável');
        return true;
      }
    );
  });

  it('distanceKm nulo/<=0 → rejeita com VPO_PROVIDER_REJECTED_TEST', async () => {
    const gateway = createVpoProviderGateway({ mode: 'mock' });
    await assert.rejects(
      () => gateway.acquireVpo(buildAcquirePayload({ route: { originUf: 'SP', destinationUf: 'MG', distanceKm: 0 } })),
      (error) => {
        assert.equal(error.code, 'VPO_PROVIDER_REJECTED_TEST');
        return true;
      }
    );
  });

  it('testFlags.simulateLostResponse: GRAVA no Map mas LANÇA timeout (DL-102 — resposta perdida)', async () => {
    const gateway = createVpoProviderGateway({ mode: 'mock' });
    const marker = '[sicat-vpo:vpoalloc_lost_response]';

    await assert.rejects(
      () => gateway.acquireVpo(buildAcquirePayload({ correlationMarker: marker, testFlags: { simulateLostResponse: true } })),
      (error) => {
        assert.equal(error.code, 'VPO_PROVIDER_LOST_RESPONSE_TEST');
        assert.equal(isRetryableJobError(error), true, 'resposta perdida DEVE ser retentável (a fila decide o backoff)');
        return true;
      }
    );

    // O "provedor" processou de verdade — só a RESPOSTA se perdeu. queryVpoByMarker prova isso.
    const query = await gateway.queryVpoByMarker({ correlationMarker: marker });
    assert.equal(query.found, true);
    assert.match(query.providerReference, /^VPO\d+$/);
  });
});

describe('vpo-gateway — mode: mock — queryVpoByMarker', () => {
  it('marcador desconhecido → found=false (nunca lança)', async () => {
    const gateway = createVpoProviderGateway({ mode: 'mock' });
    const result = await gateway.queryVpoByMarker({ correlationMarker: '[sicat-vpo:vpoalloc_never_existed]' });
    assert.deepEqual(result, { found: false });
  });

  it('marcador registrado → found=true com a mesma providerReference/amount da aquisição', async () => {
    const gateway = createVpoProviderGateway({ mode: 'mock' });
    const acquired = await gateway.acquireVpo(buildAcquirePayload());
    const query = await gateway.queryVpoByMarker({ correlationMarker: '[sicat-vpo:vpoalloc_fixture]' });
    assert.equal(query.found, true);
    assert.equal(query.providerReference, acquired.providerReference);
    assert.equal(query.amount, acquired.amount);
  });
});

describe('vpo-gateway — mode: real', () => {
  it('recusa criar a instância com VPO_PROVIDER_NOT_CONFIGURED (P6 sem fornecedora integrada)', () => {
    assert.throws(
      () => createVpoProviderGateway({ mode: 'real' }),
      (error) => {
        assert.equal(error.code, 'VPO_PROVIDER_NOT_CONFIGURED');
        return true;
      }
    );
  });
});
