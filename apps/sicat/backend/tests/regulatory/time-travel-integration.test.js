/**
 * Teste de INTEGRAÇÃO time-travel (PR-A6) — a mesma operação, avaliada duas vezes via
 * `evaluateGateService` com `referenceDate` diferente, prova que a fronteira temporal do catálogo
 * (05/06-08-2026, Lei 15.485/2026) é honrada de ponta a ponta contra o Postgres local — não só na
 * resolução pura (`tests/regulatory/effective-dates.test.js`).
 *
 * Molde: `tests/api/transporte-conformidade.test.js` (PR-A5) — mesma convenção skip-if-no-DB, mas
 * chamando os SERVICES diretamente (sem subir `createApp`/HTTP): mais barato, e o que se quer
 * provar aqui é o motor de compliance, não a superfície HTTP (já coberta noutro arquivo).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ensureRegulatoryCatalogSeeded } from '../../src/bootstrap/regulatory-rules-seed.js';
import { createTransportPartyService } from '../../src/services/transport-party-service.js';
import { createTransportOperation } from '../../src/services/transport-operation-service.js';
import { evaluateGateService } from '../../src/services/transport-compliance-service.js';

let dbAvailable = true;
let dbUnavailableReason = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT = `acc_regtimetravel_${RUN_ID}`;
const CNPJ_CARRIER = '11.222.333/0001-81';
const CNPJ_CONTRACTOR = '11.888.888/0001-67';

const VALID_ROUTE = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Belo Horizonte',
  destinationUf: 'MG',
  distanceKm: 586.2
};

let operationId = '';

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste de integração pulado (${dbUnavailableReason})`);
  return true;
}

before(async () => {
  try {
    await pool.connect().then((client) => client.release());
  } catch (error) {
    dbAvailable = false;
    dbUnavailableReason = (error && (error.message || error.code)) || String(error);
    return;
  }

  await runMigrations();
  // Idempotente: garante o catálogo TR-* independente da ordem de execução dos arquivos de teste.
  await ensureRegulatoryCatalogSeeded();

  const carrier = await createTransportPartyService(
    {
      integrationAccountId: ACCOUNT,
      documentType: 'CNPJ',
      documentNumber: CNPJ_CARRIER,
      legalName: 'Transportes Time Travel LTDA',
      roles: ['carrier'],
      rntrcNumber: '12345678',
      rntrcCategory: 'TAC',
      rntrcStatus: 'active'
    },
    null
  );

  const contractor = await createTransportPartyService(
    {
      integrationAccountId: ACCOUNT,
      documentType: 'CNPJ',
      documentNumber: CNPJ_CONTRACTOR,
      legalName: 'Embarcadora Time Travel LTDA',
      roles: ['contractor']
    },
    null
  );

  // Operação COMPLETA (carrier + contractor + cargo + rota + frete ofertado) — depois da virada de
  // 06/08/2026, TR-CIOT-004 deveria ser avaliado de verdade e dar `pass` (nada faltando).
  const operation = await createTransportOperation(
    {
      integrationAccountId: ACCOUNT,
      cargoRegime: 'lotacao',
      route: VALID_ROUTE,
      parties: [
        { partyId: carrier.id, role: 'carrier' },
        { partyId: contractor.id, role: 'contractor' }
      ],
      cargo: [{ cargoType: 'granel', description: 'Soja em grãos', weightKg: 28000 }],
      freightOfferedAmount: 4000,
      paymentTermDays: 30
    },
    {},
    null
  );
  operationId = operation.id;
});

after(async () => {
  if (dbAvailable) {
    // compliance_evaluations (PR-A5) NÃO cascade-deleta com transport_operations (FK sem ON DELETE
    // CASCADE, de propósito) — apaga PRIMEIRO.
    await query(
      `delete from compliance_evaluations where operation_id in (
         select id from transport_operations where integration_account_id = $1
       )`,
      [ACCOUNT]
    );
    await query('delete from transport_operations where integration_account_id = $1', [ACCOUNT]);
    await query('delete from transport_parties where integration_account_id = $1', [ACCOUNT]);
    await query('delete from integration_accounts where id = $1', [ACCOUNT]);
  }
  await pool.end();
});

describe('time-travel — evaluateGateService: referenceDate 2026-08-05 vs 2026-08-07 muda TR-CIOT-004 (GATE_CIOT)', { concurrency: 1 }, () => {
  it('2026-08-05 (véspera da Lei 15.485/2026): TR-CIOT-004 NOT_APPLICABLE / RULE_NOT_YET_EFFECTIVE', async (t) => {
    if (skipIfNoDb(t)) return;

    const result = await evaluateGateService({
      operationId,
      integrationAccountId: ACCOUNT,
      gate: 'GATE_CIOT',
      referenceDate: '2026-08-05',
      triggeredBy: 'system',
      correlationId: `corr_timetravel_before_${RUN_ID}`
    });

    const ciot004 = result.checks.find((check) => check.ruleCode === 'TR-CIOT-004');
    assert.ok(ciot004, 'TR-CIOT-004 deveria estar entre os checks do GATE_CIOT');
    assert.equal(ciot004.status, 'not_applicable');
    assert.equal(ciot004.reasonCode, 'RULE_NOT_YET_EFFECTIVE');
    assert.equal(ciot004.ruleVersionLabel, '', 'sem versão resolvida, ruleVersionLabel fica vazio (molde do service)');
  });

  it('2026-08-07 (depois da virada): TR-CIOT-004 é AVALIADO de verdade (pass — operação completa)', async (t) => {
    if (skipIfNoDb(t)) return;

    const result = await evaluateGateService({
      operationId,
      integrationAccountId: ACCOUNT,
      gate: 'GATE_CIOT',
      referenceDate: '2026-08-07',
      triggeredBy: 'system',
      correlationId: `corr_timetravel_after_${RUN_ID}`
    });

    const ciot004 = result.checks.find((check) => check.ruleCode === 'TR-CIOT-004');
    assert.ok(ciot004, 'TR-CIOT-004 deveria estar entre os checks do GATE_CIOT');
    assert.notEqual(ciot004.reasonCode, 'RULE_NOT_YET_EFFECTIVE', 'depois da virada a regra já resolve versão e é avaliada de verdade');
    assert.equal(ciot004.status, 'pass', 'operação completa (carrier+contractor+cargo+rota+frete) → CIOT_DATA completo');
    assert.equal(ciot004.ruleVersionLabel, 'v2026-08-baseline');
  });
});
