/**
 * Gateway de pesquisa cadastral de risco (PR-I5, REQ-SICAT-0036) — molde do teste do
 * `averbacao-gateway`: determinismo do sandbox, cenários por último dígito, `off` recusa, e o
 * caminho DL-102 (resposta perdida resolvida por `queryByMarker`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { setConfigOverride } from '../../src/lib/config.ts';
import {
  createRiskScreeningGateway,
  resetRiskScreeningSandboxStoreForTests
} from '../../src/gateways/risk-screening-gateway.ts';

function withSandbox() {
  setConfigOverride('riskScreeningMode', 'sandbox');
  resetRiskScreeningSandboxStoreForTests();
  return createRiskScreeningGateway();
}

test('modo off RECUSA a criação do gateway (nunca devolve um provedor que não faz nada)', () => {
  setConfigOverride('riskScreeningMode', 'off');
  assert.throws(() => createRiskScreeningGateway(), /RISK_SCREENING_DISABLED|desabilitada/);
  setConfigOverride('riskScreeningMode', 'sandbox');
});

test('motorista com documento comum é aprovado com validade de 30 dias', async () => {
  const gateway = withSandbox();
  const result = await gateway.screenDriver({
    correlationMarker: '[sicat:riskscr_ok]',
    driverDocument: '11144477735',
    cnhNumber: '12345678900',
    referenceDate: '2026-08-16'
  });
  assert.equal(result.outcome, 'approved');
  assert.equal(result.validUntil, '2026-09-15');
  assert.match(result.screeningRef, /^GRS\d+$/);
  // LGPD: o payload não carrega documento nem dado pessoal.
  assert.equal(JSON.stringify(result.raw).includes('11144477735'), false);
});

test('cenários determinísticos: 7 reprova, 9 é inconclusivo', async () => {
  const gateway = withSandbox();
  const rejected = await gateway.screenVehicle({
    correlationMarker: '[sicat:riskscr_rej]',
    plate: 'ABC1D07',
    referenceDate: '2026-08-16'
  });
  assert.equal(rejected.outcome, 'rejected');
  assert.equal(rejected.validUntil, null, 'reprovado não gera validade');

  const inconclusive = await gateway.screenVehicle({
    correlationMarker: '[sicat:riskscr_inc]',
    plate: 'XYZ9E29',
    referenceDate: '2026-08-16'
  });
  assert.equal(inconclusive.outcome, 'inconclusive');
});

test('resposta perdida (dígito 3): o provedor GRAVOU e só queryByMarker revela', async () => {
  const gateway = withSandbox();
  const marker = '[sicat:riskscr_lost]';
  await assert.rejects(
    () => gateway.screenDriver({ correlationMarker: marker, driverDocument: '11144477703', cnhNumber: '1', referenceDate: '2026-08-16' }),
    /RISK_SCREENING_LOST_RESPONSE_TEST|perdida/
  );

  const answer = await gateway.queryByMarker({ correlationMarker: marker });
  assert.equal(answer.found, true, 'o dispatch aconteceu — a reconciliação encontra pelo marcador');
  if (answer.found) {
    assert.equal(answer.outcome, 'approved');
    assert.equal(answer.validUntil, '2026-09-15');
  }
});

test('mesmo marcador devolve o mesmo resultado (retry nunca produz veredito novo)', async () => {
  const gateway = withSandbox();
  const payload = {
    correlationMarker: '[sicat:riskscr_idem]',
    driverDocument: '11144477735',
    cnhNumber: '12345678900',
    referenceDate: '2026-08-16'
  };
  const first = await gateway.screenDriver(payload);
  const second = await gateway.screenDriver(payload);
  assert.deepEqual(second, first);
});

test('marcador desconhecido: queryByMarker responde found=false (nada a reconciliar)', async () => {
  const gateway = withSandbox();
  const answer = await gateway.queryByMarker({ correlationMarker: '[sicat:riskscr_inexistente]' });
  assert.deepEqual(answer, { found: false });
});
