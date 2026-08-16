/**
 * Reconciliador do ciclo da averbação (PR-I3, DL-102) — `reconcileAverbacaoDeclaration`. Molde:
 * `tests/unit/manifest-submit-reconciler.test.js` (double honesto injetado, sem banco/provedor) +
 * o par com o sandbox real do gateway (a mesma pergunta `queryByMarker` que o sandbox responde).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  AVERBACAO_RECONCILE_POLLING_DELAYS_MS,
  reconcileAverbacaoDeclaration
} from '../../src/services/averbacao-reconciler.js';
import { createAverbacaoGateway, resetAverbacaoSandboxStoreForTests } from '../../src/gateways/averbacao-gateway.js';

const noSleep = async () => {};

beforeEach(() => {
  resetAverbacaoSandboxStoreForTests();
});

describe('averbacao-reconciler — validação de entrada', () => {
  it('sem queryByMarker → AVERBACAO_RECONCILE_MISSING_DEPENDENCY', async () => {
    await assert.rejects(
      () => reconcileAverbacaoDeclaration({}, { declarationId: 'insdecl_1', correlationMarker: '[sicat:insdecl_1]' }),
      (error) => {
        assert.equal(error.code, 'AVERBACAO_RECONCILE_MISSING_DEPENDENCY');
        return true;
      }
    );
  });

  it('sem declarationId/correlationMarker → AVERBACAO_RECONCILE_INVALID_INPUT', async () => {
    await assert.rejects(
      () => reconcileAverbacaoDeclaration({ queryByMarker: async () => ({ found: false }) }, { declarationId: '', correlationMarker: '' }),
      (error) => {
        assert.equal(error.code, 'AVERBACAO_RECONCILE_INVALID_INPUT');
        return true;
      }
    );
  });
});

describe('averbacao-reconciler — encontra a declaração CERTA', () => {
  it('found na primeira tentativa quando o provedor conhece o marcador', async () => {
    const calls = [];
    const queryByMarker = async (args) => {
      calls.push(args);
      return { found: true, declarationRef: 'AVB1234567890', externalStatus: 'DECLARED', raw: {} };
    };

    const result = await reconcileAverbacaoDeclaration(
      { queryByMarker, sleep: noSleep },
      { declarationId: 'insdecl_1', correlationMarker: '[sicat:insdecl_1]' }
    );

    assert.equal(result.outcome, 'found');
    assert.equal(result.attempts, 1);
    assert.equal(result.match.declarationRef, 'AVB1234567890');
    assert.deepEqual(calls, [{ correlationMarker: '[sicat:insdecl_1]' }], 'a pergunta é SEMPRE pelo marcador da linha local');
  });

  it('dois marcadores distintos resolvem para declarações DISTINTAS (nunca "o mesmo item para qualquer marcador")', async () => {
    // Par com o sandbox REAL: duas declarações no MESMO store, diferenciadas só pelo marcador —
    // é o cenário que o marcador existe para resolver (mesmo racional do lote do MTR).
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    const declaredA = await gateway.declareShipment({
      correlationMarker: '[sicat:insdecl_a]',
      policyType: 'RCTR_C',
      policyNumber: 'POL-A',
      cargoAmount: 25000,
      routeScope: null,
      operationRef: 'trop_a'
    });
    const declaredB = await gateway.declareShipment({
      correlationMarker: '[sicat:insdecl_b]',
      policyType: 'RC_DC',
      policyNumber: 'POL-B',
      cargoAmount: 25000,
      routeScope: null,
      operationRef: 'trop_a'
    });
    assert.notEqual(declaredA.declarationRef, declaredB.declarationRef);

    const resultA = await reconcileAverbacaoDeclaration(
      { queryByMarker: gateway.queryByMarker, sleep: noSleep },
      { declarationId: 'insdecl_a', correlationMarker: '[sicat:insdecl_a]' }
    );
    const resultB = await reconcileAverbacaoDeclaration(
      { queryByMarker: gateway.queryByMarker, sleep: noSleep },
      { declarationId: 'insdecl_b', correlationMarker: '[sicat:insdecl_b]' }
    );

    assert.equal(resultA.outcome, 'found');
    assert.equal(resultB.outcome, 'found');
    assert.equal(resultA.match.declarationRef, declaredA.declarationRef);
    assert.equal(resultB.match.declarationRef, declaredB.declarationRef);
    assert.notEqual(resultA.match.declarationRef, resultB.match.declarationRef);
  });

  it('resposta perdida (.98) deixa o store consultável — o reconciliador acha o que o dispatch nunca viu', async () => {
    const gateway = createAverbacaoGateway({ mode: 'sandbox' });
    await assert.rejects(() => gateway.declareShipment({
      correlationMarker: '[sicat:insdecl_lost]',
      policyType: 'RCTR_C',
      policyNumber: 'POL-L',
      cargoAmount: 25000.98,
      routeScope: null,
      operationRef: 'trop_l'
    }));

    const result = await reconcileAverbacaoDeclaration(
      { queryByMarker: gateway.queryByMarker, sleep: noSleep },
      { declarationId: 'insdecl_lost', correlationMarker: '[sicat:insdecl_lost]' }
    );
    assert.equal(result.outcome, 'found', 'o cenário DL-102 por excelência: dispatch aconteceu, só a resposta se perdeu');
    assert.equal(result.match.externalStatus, 'DECLARED');
  });
});

describe('averbacao-reconciler — polling e desfechos negativos', () => {
  it('not-found-after-polling só depois de esgotar TODO o orçamento (nunca declara ausência cedo)', async () => {
    let calls = 0;
    const queryByMarker = async () => {
      calls += 1;
      return { found: false };
    };

    const sleeps = [];
    const result = await reconcileAverbacaoDeclaration(
      { queryByMarker, sleep: async (ms) => { sleeps.push(ms); } },
      { declarationId: 'insdecl_x', correlationMarker: '[sicat:insdecl_x]' }
    );

    assert.equal(result.outcome, 'not-found-after-polling');
    assert.equal(result.attempts, AVERBACAO_RECONCILE_POLLING_DELAYS_MS.length);
    assert.equal(calls, AVERBACAO_RECONCILE_POLLING_DELAYS_MS.length);
    // O ÚLTIMO delay nunca vira sleep — N tentativas, N-1 esperas.
    assert.deepEqual(sleeps, AVERBACAO_RECONCILE_POLLING_DELAYS_MS.slice(0, -1));
  });

  it('encontra numa tentativa TARDIA (não só na primeira) — o polling existe para isso', async () => {
    let calls = 0;
    const queryByMarker = async () => {
      calls += 1;
      if (calls < 3) return { found: false };
      return { found: true, declarationRef: 'AVB999', externalStatus: 'DECLARED', raw: {} };
    };

    const result = await reconcileAverbacaoDeclaration(
      { queryByMarker, sleep: noSleep },
      { declarationId: 'insdecl_late', correlationMarker: '[sicat:insdecl_late]' }
    );
    assert.equal(result.outcome, 'found');
    assert.equal(result.attempts, 3);
  });

  it('erro de consulta é INCONCLUSIVO → outcome error com o original em cause (nunca "não existe")', async () => {
    const remoteFailure = Object.assign(new Error('rede caiu'), { code: 'ECONNRESET' });
    const queryByMarker = async () => { throw remoteFailure; };

    const result = await reconcileAverbacaoDeclaration(
      { queryByMarker, sleep: noSleep },
      { declarationId: 'insdecl_err', correlationMarker: '[sicat:insdecl_err]' }
    );

    assert.equal(result.outcome, 'error');
    assert.equal(result.attempts, 1, 'erro NA CONSULTA aborta o polling — retry é decisão da fila, não daqui');
    assert.equal(result.error.code, 'AVERBACAO_RECONCILE_QUERY_FAILED');
    assert.equal(result.error.cause, remoteFailure, 'o erro original precisa sobreviver em cause para os classificadores de retry');
  });
});
