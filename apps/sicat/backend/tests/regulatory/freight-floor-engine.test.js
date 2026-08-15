/**
 * Teste de INTEGRAÇÃO do `FreightFloorEngine` (PR-B1, skip-if-no-DB) — o LOADER de verdade
 * (`scripts/load-freight-floor-tables.js`) contra o Postgres local, seguido do cálculo end-to-end
 * (`calculateAndPersistFloorForOperation`) e do efeito nos evaluators TR-PMF-002/004
 * (`evaluateGateService`). MODO SHADOW confirmado: mesmo com `block` bruto (oferta abaixo do
 * piso), o `overallStatus` nunca passa de `WARN` — o seed segue 100% `blocking=false`.
 *
 * Molde: `tests/regulatory/time-travel-integration.test.js` (PR-A6) — chama os SERVICES
 * diretamente, sem subir `createApp`/HTTP.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ensureRegulatoryCatalogSeeded } from '../../src/bootstrap/regulatory-rules-seed.js';
import { createTransportPartyService } from '../../src/services/transport-party-service.js';
import { createTransportVehicleService } from '../../src/services/transport-vehicle-service.js';
import { createTransportOperation } from '../../src/services/transport-operation-service.js';
import { calculateAndPersistFloorForOperation } from '../../src/services/freight-floor-service.js';
import { evaluateGateService } from '../../src/services/transport-compliance-service.js';
import { loadAllFreightFloorTables } from '../../scripts/load-freight-floor-tables.js';

let dbAvailable = true;
let dbUnavailableReason = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT = `acc_regfreightfloor_${RUN_ID}`;
const CNPJ_CARRIER = '11.222.333/0001-81';
const CNPJ_CONTRACTOR = '11.888.888/0001-67';

// Rota de 850 km — mesmo cenário do exemplo do contrato (carga_geral, 6 eixos, 850 km).
const ROUTE_850KM = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Belo Horizonte',
  destinationUf: 'MG',
  distanceKm: 850
};

let carrierPartyId = '';
let contractorPartyId = '';
let vehicleId = '';

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste de integração pulado (${dbUnavailableReason})`);
  return true;
}

/** Operação lotação, carga_geral, 6 eixos (via 2 veículos de 3 eixos), rota de 850 km. */
async function createCargaGeral6EixosOperation(overrides = {}) {
  return createTransportOperation(
    {
      integrationAccountId: ACCOUNT,
      cargoRegime: 'lotacao',
      route: ROUTE_850KM,
      parties: [
        { partyId: carrierPartyId, role: 'carrier' },
        { partyId: contractorPartyId, role: 'contractor' }
      ],
      vehicles: [{ vehicleId, position: 'traction' }],
      cargo: [{ cargoType: 'carga_geral', description: 'Carga geral diversa', weightKg: 20000 }],
      paymentTermDays: 30,
      ...overrides
    },
    {},
    null
  );
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
  await ensureRegulatoryCatalogSeeded();

  const carrier = await createTransportPartyService(
    {
      integrationAccountId: ACCOUNT,
      documentType: 'CNPJ',
      documentNumber: CNPJ_CARRIER,
      legalName: 'Transportes Piso Mínimo LTDA',
      roles: ['carrier'],
      rntrcNumber: '12345678',
      rntrcCategory: 'TAC',
      rntrcStatus: 'active'
    },
    null
  );
  carrierPartyId = carrier.id;

  const contractor = await createTransportPartyService(
    {
      integrationAccountId: ACCOUNT,
      documentType: 'CNPJ',
      documentNumber: CNPJ_CONTRACTOR,
      legalName: 'Embarcadora Piso Mínimo LTDA',
      roles: ['contractor']
    },
    null
  );
  contractorPartyId = contractor.id;

  // 6 eixos via UM veículo de tração com axlesCount=6 (mais simples que compor 2 veículos).
  const vehicle = await createTransportVehicleService(
    { integrationAccountId: ACCOUNT, plate: 'PMF6E23', vehicleType: 'truck', axlesCount: 6 },
    null
  );
  vehicleId = vehicle.id;
});

after(async () => {
  if (dbAvailable) {
    await query(
      `delete from freight_floor_calculations where operation_id in (
         select id from transport_operations where integration_account_id = $1
       )`,
      [ACCOUNT]
    );
    await query(
      `delete from compliance_evaluations where operation_id in (
         select id from transport_operations where integration_account_id = $1
       )`,
      [ACCOUNT]
    );
    await query('delete from transport_operations where integration_account_id = $1', [ACCOUNT]);
    await query('delete from transport_vehicles where integration_account_id = $1', [ACCOUNT]);
    await query('delete from transport_parties where integration_account_id = $1', [ACCOUNT]);
    await query('delete from integration_accounts where id = $1', [ACCOUNT]);

    // Esta suíte roda o loader REAL (loadAllFreightFloorTables) e é a única dona dos dados de
    // piso no banco de teste compartilhado — sem esta limpeza, os 150 coeficientes persistem
    // entre execuções e poluem qualquer teste que dependa do estado das tabelas de piso
    // (bug de ordem de execução reproduzido no PR-C1). Ordem: cálculos que referenciam versão
    // (FK) → versões (coeficientes caem por on delete cascade).
    await query('delete from freight_floor_calculations where floor_version_id is not null');
    await query('delete from freight_floor_versions');
  }
  await pool.end();
});

describe('freight-floor-engine (integração) — loader real', { concurrency: 1 }, () => {
  it('carrega a Tabela A (Res. ANTT 6.084/2026): 1 versão pending_review + 11 cargoTypes / 75 linhas / 150 coeficientes', async (t) => {
    if (skipIfNoDb(t)) return;

    const results = await loadAllFreightFloorTables();
    assert.equal(results.length, 1, 'esperava exatamente 1 arquivo em reference-data/freight-floor/');

    const [result] = results;
    assert.equal(result.skipped, false);
    assert.equal(result.tableCode, 'A');
    assert.equal(result.normativeReference, 'Resolução ANTT nº 6.084/2026');
    assert.equal(result.reviewStatus, 'pending_review');
    assert.equal(result.effectiveFrom, '2026-07-17');
    assert.equal(result.uniqueCargoTypes, 11);
    assert.equal(result.rowsCount, 75, '75 linhas (cargoType×axlesCount) na Tabela A transcrita');
    assert.equal(result.coefficientsWritten, 150, '2 coeficientes por linha (displacement + load/unload)');

    const versionRow = await query(
      `select review_status, count(*)::int as versions
         from freight_floor_versions
        where normative_reference = $1 and table_code = $2
        group by review_status`,
      ['Resolução ANTT nº 6.084/2026', 'A']
    );
    assert.equal(versionRow.rows.length, 1, 'deveria existir exatamente 1 versão desta tabela');
    assert.equal(versionRow.rows[0].review_status, 'pending_review');
    assert.equal(versionRow.rows[0].versions, 1);

    const coefficientCount = await query(
      `select count(*)::int as count
         from freight_floor_coefficients c
         inner join freight_floor_versions v on v.id = c.floor_version_id
        where v.normative_reference = $1 and v.table_code = $2`,
      ['Resolução ANTT nº 6.084/2026', 'A']
    );
    assert.equal(coefficientCount.rows[0].count, 150);
  });

  it('rodar o loader DUAS VEZES é idempotente — mesmo hash, mesma contagem, mesma versão (id estável)', async (t) => {
    if (skipIfNoDb(t)) return;

    const before1 = await query(
      'select id, source_hash from freight_floor_versions where normative_reference = $1 and table_code = $2',
      ['Resolução ANTT nº 6.084/2026', 'A']
    );
    assert.equal(before1.rowCount, 1);

    const results = await loadAllFreightFloorTables();
    assert.equal(results[0].skipped, false);
    assert.equal(results[0].coefficientsWritten, 150);

    const after1 = await query(
      'select id, source_hash from freight_floor_versions where normative_reference = $1 and table_code = $2',
      ['Resolução ANTT nº 6.084/2026', 'A']
    );
    assert.equal(after1.rowCount, 1, 'idempotente: continua sendo 1 versão, não duplica');
    assert.equal(after1.rows[0].id, before1.rows[0].id, 'mesmo id — upsert, não insert novo');
    assert.equal(after1.rows[0].source_hash, before1.rows[0].source_hash);

    const coefficientCount = await query(
      `select count(*)::int as count
         from freight_floor_coefficients c
         inner join freight_floor_versions v on v.id = c.floor_version_id
        where v.normative_reference = $1 and v.table_code = $2`,
      ['Resolução ANTT nº 6.084/2026', 'A']
    );
    assert.equal(coefficientCount.rows[0].count, 150, 'replace idempotente: continua 150, não dobra');
  });
});

describe('freight-floor-engine (integração) — calcular-piso end-to-end', { concurrency: 1 }, () => {
  it('lotacao, carga_geral, 6 eixos, 850 km → minimum=6923.43, calculation persistido, freightFloorAmount atualizado', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createCargaGeral6EixosOperation({ freightOfferedAmount: 7200 });

    const result = await calculateAndPersistFloorForOperation({
      operationId: operation.id,
      integrationAccountId: ACCOUNT,
      referenceDate: '2026-08-13',
      correlationId: `corr_ffcalc_ok_${RUN_ID}`
    });

    assert.equal(result.outcome, 'calculated');
    assert.equal(result.cargoFloorSlug, 'carga_geral');
    assert.equal(result.axlesCount, 6);
    assert.equal(result.distanceKm, 850);
    assert.equal(result.minimumAmount, 6923.43);
    assert.equal(result.displacementCoefficient, 7.3547);
    assert.equal(result.loadUnloadCoefficient, 671.93);
    assert.equal(result.compliant, true, '7200 >= 6923.43');
    assert.ok(result.floorVersionRef);
    assert.equal(result.floorVersionRef.reviewStatus, 'pending_review');
    assert.equal(result.floorVersionRef.tableCode, 'A');
    assert.equal(result.trace.formula, 'CCD*km + CC');

    const persisted = await query(
      'select outcome, minimum_amount, cargo_type, axles_count, distance_km from freight_floor_calculations where id = $1',
      [result.id]
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(persisted.rows[0].outcome, 'calculated');
    assert.equal(Number(persisted.rows[0].minimum_amount), 6923.43);

    const updatedOperation = await query(
      'select freight_floor_amount from transport_operations where id = $1',
      [operation.id]
    );
    assert.equal(Number(updatedOperation.rows[0].freight_floor_amount), 6923.43);
  });

  it('referenceDate 2026-07-16 (véspera da vigência da Res. 6.084/2026) → missing_coefficients (nenhuma tabela vigente)', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createCargaGeral6EixosOperation({ freightOfferedAmount: 7200 });

    const result = await calculateAndPersistFloorForOperation({
      operationId: operation.id,
      integrationAccountId: ACCOUNT,
      referenceDate: '2026-07-16',
      correlationId: `corr_ffcalc_before_effective_${RUN_ID}`
    });

    assert.equal(result.outcome, 'missing_coefficients');
    assert.equal(result.minimumAmount, null);
    assert.equal(result.floorVersionRef, null);
  });

  it('fracionada → not_applicable, sem tocar freightFloorAmount', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createCargaGeral6EixosOperation({ cargoRegime: 'fracionada' });

    const result = await calculateAndPersistFloorForOperation({
      operationId: operation.id,
      integrationAccountId: ACCOUNT,
      referenceDate: '2026-08-13',
      correlationId: `corr_ffcalc_fracionada_${RUN_ID}`
    });

    assert.equal(result.outcome, 'not_applicable');
    assert.equal(result.minimumAmount, null);

    const updatedOperation = await query(
      'select freight_floor_amount from transport_operations where id = $1',
      [operation.id]
    );
    assert.equal(updatedOperation.rows[0].freight_floor_amount, null);
  });
});

describe('freight-floor-engine (integração) — efeito SHADOW nos evaluators TR-PMF-002/004', { concurrency: 1 }, () => {
  it('oferta ABAIXO do piso calculado → GATE_PROPOSAL WARN (shadow!) com TR-PMF-002 raw_status=block/FREIGHT_BELOW_FLOOR', async (t) => {
    if (skipIfNoDb(t)) return;

    // 6923.43 é o piso; 5000 fica abaixo.
    const operation = await createCargaGeral6EixosOperation({ freightOfferedAmount: 5000 });
    await calculateAndPersistFloorForOperation({
      operationId: operation.id,
      integrationAccountId: ACCOUNT,
      referenceDate: '2026-08-13',
      correlationId: `corr_ffcalc_below_${RUN_ID}`
    });

    const evaluation = await evaluateGateService({
      operationId: operation.id,
      integrationAccountId: ACCOUNT,
      gate: 'GATE_PROPOSAL',
      referenceDate: '2026-08-13',
      triggeredBy: 'system',
      correlationId: `corr_gate_below_${RUN_ID}`
    });

    // MODO SHADOW: mesmo com um bruto block, o seed 100% blocking=false clampa para warn — nunca block.
    assert.notEqual(evaluation.overallStatus, 'block');

    const pmf002 = evaluation.checks.find((check) => check.ruleCode === 'TR-PMF-002');
    assert.ok(pmf002, 'TR-PMF-002 deveria estar entre os checks do GATE_PROPOSAL');
    assert.equal(pmf002.status, 'warn');
    assert.equal(pmf002.rawStatus, 'block');
    assert.equal(pmf002.reasonCode, 'RULE_NOT_ENFORCEABLE');
    assert.match(pmf002.humanMessage, /abaixo do piso/i);

    // O motivo ORIGINAL (FREIGHT_BELOW_FLOOR, pré-clamp) fica preservado em
    // `result_snapshot.clamp.originalReasonCode` — persistido, mas não exposto no DTO da API
    // (só rawStatus/reasonCode/humanMessage saem); confere direto no banco (compliance_checks).
    const checkRow = await query(
      `select result_snapshot from compliance_checks
        where evaluation_id = $1 and rule_code = 'TR-PMF-002'`,
      [evaluation.evaluationId]
    );
    assert.equal(checkRow.rows[0].result_snapshot.clamp.originalReasonCode, 'FREIGHT_BELOW_FLOOR');
  });

  it('oferta ACIMA do piso + tabela pending_review → GATE_PROPOSAL WARN FLOOR_TABLE_PENDING_REVIEW (nunca pass "limpo")', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createCargaGeral6EixosOperation({ freightOfferedAmount: 7200 });
    await calculateAndPersistFloorForOperation({
      operationId: operation.id,
      integrationAccountId: ACCOUNT,
      referenceDate: '2026-08-13',
      correlationId: `corr_ffcalc_above_${RUN_ID}`
    });

    const evaluation = await evaluateGateService({
      operationId: operation.id,
      integrationAccountId: ACCOUNT,
      gate: 'GATE_PROPOSAL',
      referenceDate: '2026-08-13',
      triggeredBy: 'system',
      correlationId: `corr_gate_above_${RUN_ID}`
    });

    const pmf002 = evaluation.checks.find((check) => check.ruleCode === 'TR-PMF-002');
    assert.ok(pmf002);
    assert.equal(pmf002.status, 'warn');
    assert.equal(pmf002.reasonCode, 'FLOOR_TABLE_PENDING_REVIEW');

    const pmf004 = evaluation.checks.find((check) => check.ruleCode === 'TR-PMF-004');
    assert.ok(pmf004);
    assert.equal(pmf004.status, 'warn');
    assert.equal(pmf004.reasonCode, 'FLOOR_TABLE_PENDING_REVIEW');
  });

  it('time-travel: referenceDate 2026-07-16 (antes da vigência da 6.084/2026) → TR-PMF-004 warn FLOOR_VERSION_UNAVAILABLE', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createCargaGeral6EixosOperation({ freightOfferedAmount: 7200 });
    await calculateAndPersistFloorForOperation({
      operationId: operation.id,
      integrationAccountId: ACCOUNT,
      referenceDate: '2026-07-16',
      correlationId: `corr_ffcalc_timetravel_${RUN_ID}`
    });

    const evaluation = await evaluateGateService({
      operationId: operation.id,
      integrationAccountId: ACCOUNT,
      gate: 'GATE_PROPOSAL',
      referenceDate: '2026-07-16',
      triggeredBy: 'system',
      correlationId: `corr_gate_timetravel_${RUN_ID}`
    });

    const pmf004 = evaluation.checks.find((check) => check.ruleCode === 'TR-PMF-004');
    assert.ok(pmf004);
    assert.equal(pmf004.status, 'warn');
    assert.equal(pmf004.reasonCode, 'FLOOR_VERSION_UNAVAILABLE');
  });
});
