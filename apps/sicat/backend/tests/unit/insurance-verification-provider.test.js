/**
 * Provider de verificação de seguros (PR-F2) — `createInsuranceVerificationProvider`.
 *
 * `mode: 'mock'` é hoje a ÚNICA implementação (nenhuma integração técnica com seguradora/ANTT
 * credenciada — [EXTERNAL DEPENDENCY] P8): determinístico e SEM ESTADO (mera consulta — ao
 * contrário de `ciot-provider-gateway.ts`/`vpo-gateway.ts`, não há Map por processo aqui). `mode:
 * 'antt'`/`'real'` recusam criar a instância com `INSURANCE_PROVIDER_NOT_CONFIGURED`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInsuranceVerificationProvider } from '../../src/gateways/insurance-verification-provider.js';

describe('insurance-verification-provider — mode: mock — verifyCarrier', () => {
  it('documento terminado em dígito PAR → devolve as 3 apólices obrigatórias (RCTR_C/RC_DC/RC_V)', async () => {
    const provider = createInsuranceVerificationProvider({ mode: 'mock' });
    const result = await provider.verifyCarrier({ partyDocument: '11222333000182' });
    assert.equal(result.source, 'mock');
    assert.equal(result.policies.length, 3);
    const types = result.policies.map((policy) => policy.policyType).sort();
    assert.deepEqual(types, ['RCTR_C', 'RC_DC', 'RC_V']);
    for (const policy of result.policies) {
      assert.match(policy.policyNumber, /^(RCTR_C|RC_DC|RC_V)-\d{6}$/);
      assert.ok(policy.validFrom <= policy.validUntil, 'validFrom deve ser <= validUntil');
      assert.equal(policy.insurerName, 'Seguradora Exemplo S.A.');
    }
  });

  it('documento terminado em dígito ÍMPAR → devolve lista vazia (não encontrado)', async () => {
    const provider = createInsuranceVerificationProvider({ mode: 'mock' });
    const result = await provider.verifyCarrier({ partyDocument: '11222333000181' });
    assert.equal(result.source, 'mock');
    assert.deepEqual(result.policies, []);
  });

  it('o MESMO documento sempre produz os MESMOS policyNumbers (determinístico)', async () => {
    const provider = createInsuranceVerificationProvider({ mode: 'mock' });
    const first = await provider.verifyCarrier({ partyDocument: '11222333000182' });
    const second = await provider.verifyCarrier({ partyDocument: '11222333000182' });
    assert.deepEqual(
      second.policies.map((policy) => policy.policyNumber).sort(),
      first.policies.map((policy) => policy.policyNumber).sort()
    );
  });

  it('mockOverrides (por documento) sobrepõe o resultado default', async () => {
    const provider = createInsuranceVerificationProvider({
      mode: 'mock',
      mockOverrides: {
        11222333000182: {
          policies: [
            { policyType: 'RCTR_C', policyNumber: 'RCTRC-OVERRIDE-1', insurerName: 'Seguradora Override', validFrom: '2020-01-01', validUntil: '2020-12-31' }
          ]
        }
      }
    });
    const result = await provider.verifyCarrier({ partyDocument: '11222333000182' });
    assert.equal(result.policies.length, 1);
    assert.equal(result.policies[0].policyNumber, 'RCTRC-OVERRIDE-1');
  });

  it('sem partyDocument → lança INSURANCE_PROVIDER_INVALID_QUERY', async () => {
    const provider = createInsuranceVerificationProvider({ mode: 'mock' });
    await assert.rejects(
      () => provider.verifyCarrier({ partyDocument: '' }),
      (error) => {
        assert.equal(error.code, 'INSURANCE_PROVIDER_INVALID_QUERY');
        return true;
      }
    );
  });
});

describe('insurance-verification-provider — mode: mock — verifyPolicy', () => {
  it('policyNumber terminado em dígito PAR → found=true', async () => {
    const provider = createInsuranceVerificationProvider({ mode: 'mock' });
    const result = await provider.verifyPolicy({ policyNumber: 'RCTRC-2026-000124', policyType: 'RCTR_C' });
    assert.equal(result.found, true);
    assert.equal(result.policyType, 'RCTR_C');
    assert.ok(result.validFrom <= result.validUntil);
  });

  it('policyNumber terminado em dígito ÍMPAR → found=false', async () => {
    const provider = createInsuranceVerificationProvider({ mode: 'mock' });
    const result = await provider.verifyPolicy({ policyNumber: 'RCTRC-2026-000123', policyType: 'RCTR_C' });
    assert.deepEqual(result, { found: false, policyType: 'RCTR_C', policyNumber: 'RCTRC-2026-000123' });
  });
});

describe('insurance-verification-provider — mode: antt/real', () => {
  it('mode: antt recusa criar a instância com INSURANCE_PROVIDER_NOT_CONFIGURED (P8 sem credenciamento)', () => {
    assert.throws(
      () => createInsuranceVerificationProvider({ mode: 'antt' }),
      (error) => {
        assert.equal(error.code, 'INSURANCE_PROVIDER_NOT_CONFIGURED');
        return true;
      }
    );
  });

  it('mode: real recusa criar a instância com INSURANCE_PROVIDER_NOT_CONFIGURED', () => {
    assert.throws(
      () => createInsuranceVerificationProvider({ mode: 'real' }),
      (error) => {
        assert.equal(error.code, 'INSURANCE_PROVIDER_NOT_CONFIGURED');
        return true;
      }
    );
  });
});
