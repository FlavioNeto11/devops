/**
 * Gateway de averbação eletrônica (PR-I3) — `createAverbacaoGateway`. Molde:
 * `tests/unit/ciot-provider-gateway.test.js`.
 *
 * `mode: 'sandbox'` é hoje a ÚNICA implementação (nenhuma seguradora/averbadora integrada):
 * determinístico e STATEFUL EM MEMÓRIA POR PROCESSO (Map por `correlationMarker`, módulo-level —
 * sobrevive à criação de novas instâncias do gateway, o que permite ao reconciliador "achar" o que
 * uma tentativa anterior declarou). `mode: 'off'` (default) recusa criar a instância com
 * `AVERBACAO_GATEWAY_DISABLED`. Cenários pelos CENTAVOS de `cargoAmount`: `.99` → outcome
 * `rejected`; `.98` → grava no store e LANÇA (resposta perdida, DL-102).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createAverbacaoGateway, resetAverbacaoSandboxStoreForTests } from '../../src/gateways/averbacao-gateway.js';
import { isRetryableJobError } from '../../src/lib/retry.js';

function buildDeclarePayload(overrides = {}) {
  return {
    correlationMarker: '[sicat:insdecl_fixture]',
    policyType: 'RCTR_C',
    policyNumber: 'RCTRC-2026-000123',
    cargoAmount: 25000, // caso de ouro: R$ 25.000,00
    routeScope: 'SP-MG',
    operationRef: 'trop_fixture',
    ...overrides
  };
}

beforeEach(() => {
  resetAverbacaoSandboxStoreForTests();
});

describe('averbacao-gateway — mode: sandbox — declareShipment', () => {
  it('declara e devolve um declarationRef determinístico (prefixo AVB)', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    const result = await gateway.declareShipment(buildDeclarePayload());
    assert.equal(result.outcome, 'declared');
    assert.match(result.declarationRef, /^AVB\d+$/);
  });

  it('o MESMO correlationMarker sempre produz o MESMO declarationRef (determinístico)', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    const first = await gateway.declareShipment(buildDeclarePayload());
    const second = await gateway.declareShipment(buildDeclarePayload());
    assert.equal(second.declarationRef, first.declarationRef);
  });

  it('um SEGUNDO declareShipment com o mesmo marcador é IDEMPOTENTE — não duplica a averbação (retry seguro)', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    const first = await gateway.declareShipment(buildDeclarePayload());
    const second = await gateway.declareShipment(buildDeclarePayload());
    assert.deepEqual(second, first);
  });

  it('centavos .99 → outcome rejected (AVERBACAO_REJECTED_TEST), SEM gravar no store', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    const result = await gateway.declareShipment(buildDeclarePayload({ cargoAmount: 25000.99 }));
    assert.equal(result.outcome, 'rejected');
    assert.equal(result.declarationRef, null);
    assert.equal(result.raw.reasonCode, 'AVERBACAO_REJECTED_TEST');

    // Recusa definitiva NUNCA registra do lado da seguradora — não há o que reconciliar.
    const query = await gateway.queryByMarker({ correlationMarker: '[sicat:insdecl_fixture]' });
    assert.deepEqual(query, { found: false });
  });

  it('centavos .98: GRAVA no store mas LANÇA timeout (DL-102 — resposta perdida)', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    const marker = '[sicat:insdecl_lost_response]';

    await assert.rejects(
      () => gateway.declareShipment(buildDeclarePayload({ correlationMarker: marker, cargoAmount: 25000.98 })),
      (error) => {
        assert.equal(error.code, 'AVERBACAO_LOST_RESPONSE_TEST');
        assert.equal(isRetryableJobError(error), true, 'resposta perdida DEVE ser retentável (a fila decide o backoff)');
        return true;
      }
    );

    // A "seguradora" processou de verdade — só a RESPOSTA se perdeu. queryByMarker prova isso.
    const query = await gateway.queryByMarker({ correlationMarker: marker });
    assert.equal(query.found, true);
    assert.match(query.declarationRef, /^AVB\d+$/);
    assert.equal(query.externalStatus, 'DECLARED');
  });
});

describe('averbacao-gateway — mode: sandbox — queryByMarker', () => {
  it('marcador desconhecido → found=false (nunca lança)', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    const result = await gateway.queryByMarker({ correlationMarker: '[sicat:insdecl_never_existed]' });
    assert.deepEqual(result, { found: false });
  });

  it('marcador declarado → found=true com o mesmo declarationRef da declaração', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    const declared = await gateway.declareShipment(buildDeclarePayload());
    const query = await gateway.queryByMarker({ correlationMarker: '[sicat:insdecl_fixture]' });
    assert.equal(query.found, true);
    assert.equal(query.declarationRef, declared.declarationRef);
    assert.equal(query.externalStatus, 'DECLARED');
  });
});

describe('averbacao-gateway — mode: sandbox — rectifyShipment/cancelShipment', () => {
  it('rectifyShipment sobre um marcador declarado → externalStatus RECTIFIED (novo cargoAmount no raw)', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    await gateway.declareShipment(buildDeclarePayload());
    const result = await gateway.rectifyShipment({ correlationMarker: '[sicat:insdecl_fixture]', cargoAmount: 30000 });
    assert.equal(result.outcome, 'rectified');

    const query = await gateway.queryByMarker({ correlationMarker: '[sicat:insdecl_fixture]' });
    assert.equal(query.externalStatus, 'RECTIFIED');
    assert.equal(query.raw.cargoAmount, 30000);
  });

  it('cancelShipment sobre um marcador declarado → externalStatus CANCELLED', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    await gateway.declareShipment(buildDeclarePayload());
    const result = await gateway.cancelShipment({ correlationMarker: '[sicat:insdecl_fixture]', reason: 'teste' });
    assert.equal(result.outcome, 'cancelled');

    const query = await gateway.queryByMarker({ correlationMarker: '[sicat:insdecl_fixture]' });
    assert.equal(query.externalStatus, 'CANCELLED');
  });

  it('mutação sobre marcador NUNCA declarado → AVERBACAO_NOT_FOUND_TEST', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    await assert.rejects(
      () => gateway.rectifyShipment({ correlationMarker: '[sicat:insdecl_never_existed]', cargoAmount: 100 }),
      (error) => {
        assert.equal(error.code, 'AVERBACAO_NOT_FOUND_TEST');
        return true;
      }
    );
  });

  it('rectify com centavos .98: aplica no store mas LANÇA timeout (resposta perdida na retificação)', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    await gateway.declareShipment(buildDeclarePayload());

    await assert.rejects(
      () => gateway.rectifyShipment({ correlationMarker: '[sicat:insdecl_fixture]', cargoAmount: 30000.98 }),
      (error) => {
        assert.equal(error.code, 'AVERBACAO_LOST_RESPONSE_TEST');
        return true;
      }
    );

    const query = await gateway.queryByMarker({ correlationMarker: '[sicat:insdecl_fixture]' });
    assert.equal(query.found, true);
    assert.equal(query.externalStatus, 'RECTIFIED', 'a seguradora processou a retificação — só a resposta se perdeu');
  });
});

describe('averbacao-gateway — mode: off', () => {
  it('recusa criar a instância com AVERBACAO_GATEWAY_DISABLED (nenhuma averbadora integrada)', () => {
    assert.throws(
      () => createAverbacaoGateway({ mode: 'off' }),
      (error) => {
        assert.equal(error.code, 'AVERBACAO_GATEWAY_DISABLED');
        assert.equal(error.status, 501);
        assert.equal(isRetryableJobError(error), false, 'flag desligada NÃO deve ser retentável');
        return true;
      }
    );
  });
});
