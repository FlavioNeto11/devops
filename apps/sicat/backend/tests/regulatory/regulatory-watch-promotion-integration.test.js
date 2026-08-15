/**
 * Teste de INTEGRAÇÃO da promoção administrativa → BLOCK REAL (PR-H1, skip-if-no-DB) — chama os
 * SERVICES diretamente, sem subir `createApp`/HTTP (molde `tests/regulatory/freight-floor-engine.test.js`).
 *
 * Prova a regra de ouro do programa NA PONTA: TR-PMF-002 nasce `blocking=false` no seed (meta-guarda
 * 1 de `rule-catalog-invariants.test.js` garante isso). Este teste PROMOVE a versão do seed
 * (`v2026-08-baseline`) via `promoteTransportRuleVersionService` — o MESMO caminho que
 * `POST /v1/transporte/regras/{code}/versoes/{versionLabel}/promover` usa — e prova que o motor de
 * compliance passa a produzir `block` REAL (sem clamp) para uma oferta abaixo do piso.
 *
 * MUTA o catálogo GLOBAL (`regulatory_rule_versions` do seed) — roda em `try/finally` e RESTAURA a
 * linha ANTES de qualquer outro teste rodar, exatamente como
 * `tests/api/transporte-conformidade.test.js` (describe "caminho blocked") já faz forçando o mesmo
 * estado via SQL direto. A diferença aqui é que a mutação passa pelo SERVICE real, não por UPDATE
 * cru — é o que prova que o endpoint (e não só a constraint de banco) sustenta a regra de ouro.
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
import { evaluateGateService } from '../../src/services/transport-compliance-service.js';
import { promoteTransportRuleVersionService } from '../../src/services/transporte-regras-service.js';
import { AppError } from '../../src/lib/problem.js';

let dbAvailable = true;
let dbUnavailableReason = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT = `acc_regwatchpromo_${RUN_ID}`;
const CNPJ_CARRIER = '11.222.333/0001-81';
const CNPJ_CONTRACTOR = '11.888.888/0001-67';

const RULE_CODE = 'TR-PMF-002';
const VERSION_LABEL = 'v2026-08-baseline';

const ROUTE = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Belo Horizonte',
  destinationUf: 'MG',
  distanceKm: 586.2
};

let carrierPartyId = '';
let contractorPartyId = '';
let vehicleId = '';

function skipIfNoDb(t) {
  if (dbAvailable) return false;
  t.skip(`Postgres indisponível — teste de integração pulado (${dbUnavailableReason})`);
  return true;
}

async function createBelowFloorOperation() {
  return createTransportOperation(
    {
      integrationAccountId: ACCOUNT,
      cargoRegime: 'lotacao',
      route: ROUTE,
      parties: [
        { partyId: carrierPartyId, role: 'carrier' },
        { partyId: contractorPartyId, role: 'contractor' }
      ],
      vehicles: [{ vehicleId, position: 'traction' }],
      cargo: [{ cargoType: 'granel', description: 'Soja em grãos', weightKg: 28000 }],
      freightOfferedAmount: 2000,
      freightFloorAmount: 5000,
      paymentTermDays: 30
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
      legalName: 'Transportes Promoção LTDA',
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
      legalName: 'Embarcadora Promoção LTDA',
      roles: ['contractor']
    },
    null
  );
  contractorPartyId = contractor.id;

  const vehicle = await createTransportVehicleService(
    { integrationAccountId: ACCOUNT, plate: 'PRM1O23', vehicleType: 'truck', axlesCount: 3 },
    null
  );
  vehicleId = vehicle.id;
});

after(async () => {
  if (dbAvailable) {
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
  }
  await pool.end();
});

describe('promoção administrativa de TR-PMF-002 (integração) — golden path + BLOCK real', { concurrency: 1 }, () => {
  it('promover sem reviewNotes → 400 REGULATORY_RULE_PROMOTION_REVIEW_NOTES_REQUIRED (não muta o catálogo)', async (t) => {
    if (skipIfNoDb(t)) return;

    const before = await query(
      `select v.blocking from regulatory_rule_versions v
         inner join regulatory_rules r on r.id = v.rule_id
        where r.code = $1 and v.version_label = $2`,
      [RULE_CODE, VERSION_LABEL]
    );
    assert.equal(before.rows[0].blocking, false);

    await assert.rejects(
      promoteTransportRuleVersionService(
        RULE_CODE,
        VERSION_LABEL,
        { blocking: true, version: before.rows[0].version },
        { correlationId: null, evaluatedBy: 'qa-integration-test' }
      ),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.status, 400);
        assert.equal(error.code, 'REGULATORY_RULE_PROMOTION_REVIEW_NOTES_REQUIRED');
        return true;
      }
    );

    const after = await query(
      `select blocking from regulatory_rule_versions v
         inner join regulatory_rules r on r.id = v.rule_id
        where r.code = $1 and v.version_label = $2`,
      [RULE_CODE, VERSION_LABEL]
    );
    assert.equal(after.rows[0].blocking, false, 'tentativa recusada não pode ter mutado o catálogo');
  });

  it('promove a bloqueante → blocking=true + reviewed_by preenchido → evaluators produzem BLOCK REAL (sem clamp); restaura no finally', async (t) => {
    if (skipIfNoDb(t)) return;

    const original = await query(
      `select v.id, v.version, v.implementation_state, v.blocking, v.reviewed_by, v.reviewed_at
         from regulatory_rule_versions v
         inner join regulatory_rules r on r.id = v.rule_id
        where r.code = $1 and v.version_label = $2`,
      [RULE_CODE, VERSION_LABEL]
    );
    assert.equal(original.rowCount, 1, `versão ${RULE_CODE}/${VERSION_LABEL} deveria existir (seed do PR-A1)`);
    assert.equal(original.rows[0].blocking, false, 'regra de ouro: o seed nunca nasce blocking=true');
    const row = original.rows[0];

    try {
      const promoted = await promoteTransportRuleVersionService(
        RULE_CODE,
        VERSION_LABEL,
        { blocking: true, reviewNotes: 'Confirmado com jurídico — teste de integração automatizado.', version: row.version },
        { correlationId: null, evaluatedBy: 'qa-integration-test' }
      );
      assert.equal(promoted.blocking, true);
      assert.equal(promoted.reviewedBy, 'qa-integration-test');
      assert.ok(promoted.reviewedAt);

      const persisted = await query('select blocking, reviewed_by, reviewed_at, implementation_state from regulatory_rule_versions where id = $1', [row.id]);
      assert.equal(persisted.rows[0].blocking, true);
      assert.equal(persisted.rows[0].reviewed_by, 'qa-integration-test');
      assert.ok(persisted.rows[0].reviewed_at);
      assert.equal(persisted.rows[0].implementation_state, 'ACTIVE');

      // Operação com piso JÁ calculado e oferta abaixo dele — TR-PMF-002 dá block DE VERDADE, sem clamp.
      const operation = await createBelowFloorOperation();
      const evaluation = await evaluateGateService({
        operationId: operation.id,
        integrationAccountId: ACCOUNT,
        gate: 'GATE_PROPOSAL',
        triggeredBy: 'system',
        correlationId: `corr_regwatchpromo_${RUN_ID}`
      });

      assert.equal(evaluation.overallStatus, 'block');
      const pmf002 = evaluation.checks.find((check) => check.ruleCode === RULE_CODE);
      assert.ok(pmf002, 'TR-PMF-002 deveria estar entre os checks de GATE_PROPOSAL');
      assert.equal(pmf002.status, 'block');
      assert.equal(pmf002.rawStatus, null, 'sem clamp: o BLOCK É o status final, não uma versão rebaixada');
    } finally {
      await query(
        `update regulatory_rule_versions
            set blocking = $2, reviewed_by = $3, reviewed_at = $4, implementation_state = $5
          where id = $1`,
        [row.id, row.blocking, row.reviewed_by, row.reviewed_at, row.implementation_state]
      );
    }

    const restored = await query('select blocking, reviewed_by, reviewed_at from regulatory_rule_versions where id = $1', [row.id]);
    assert.equal(restored.rows[0].blocking, false, 'a linha do seed deveria voltar exatamente ao estado original');
    assert.equal(restored.rows[0].reviewed_by, null);
    assert.equal(restored.rows[0].reviewed_at, null);
  });

  it('APÓS a restauração, a mesma oferta abaixo do piso volta a WARN (clampada) — nenhum efeito residual', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createBelowFloorOperation();
    const evaluation = await evaluateGateService({
      operationId: operation.id,
      integrationAccountId: ACCOUNT,
      gate: 'GATE_PROPOSAL',
      triggeredBy: 'system',
      correlationId: `corr_regwatchpromo_after_${RUN_ID}`
    });

    assert.notEqual(evaluation.overallStatus, 'block', 'sem promoção ativa, a regra de ouro (seed 100% blocking=false) volta a valer');
    const pmf002 = evaluation.checks.find((check) => check.ruleCode === RULE_CODE);
    assert.equal(pmf002.status, 'warn');
    assert.equal(pmf002.rawStatus, 'block', 'o BLOCK bruto continua ali — só não é enforçado (RULE_NOT_ENFORCEABLE)');
  });
});
