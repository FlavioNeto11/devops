/**
 * API do motor de compliance (PR-A5): `validar-conformidade`/`conformidade` (avaliação/overview
 * ad-hoc) e a ATIVAÇÃO das transições guardadas (`submeter-validacao` orquestrado, `contratar`,
 * `reabrir`) — contra o app REAL (createApp) e o Postgres local.
 *
 * Molde: `tests/api/transporte-operacoes.test.js` (PR-A4) — mesma convenção de skip quando o
 * banco está indisponível, mesma estratégia de tenancy (duas contas criadas no setup).
 *
 * Regra de ouro do programa (seed 100% `blocking=false`): NENHUM evaluator produz um `block`
 * não-clampado com os dados do seed real — todo `block` vira `warn` (`RULE_NOT_ENFORCEABLE`), e a
 * aprovação de `submeter-validacao` SEMPRE ocorre na Fase A. O caminho `blocked` só é alcançável
 * forçando uma versão `blocking=true` + `ACTIVE` + revisada NO BANCO DE TESTE — feito na suíte
 * dedicada no fim deste arquivo, que MUTA e RESTAURA a linha (catálogo é global, não por conta) em
 * `try/finally` para não vazar estado para outras suítes.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ensureRegulatoryCatalogSeeded } from '../../src/bootstrap/regulatory-rules-seed.js';
import { createApp } from '../../src/app.js';
import { authHeaders } from '../helpers/sicat-token.js';

let dbAvailable = true;
let dbUnavailableReason = '';
let server;
let API_BASE = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT_A = `acc_tropconf_a_${RUN_ID}`;
const ACCOUNT_B = `acc_tropconf_b_${RUN_ID}`;
const CNPJ_CARRIER = '11.222.333/0001-81';
const CNPJ_CONTRACTOR = '11.888.888/0001-67';

const VALID_ROUTE = {
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
  t.skip(`Postgres indisponível — teste de API pulado (${dbUnavailableReason})`);
  return true;
}

async function callApi(method, path, { body, headers = authHeaders() } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json().catch(() => null);
  return { response, body: json };
}

async function createDraftOperation(overrides = {}) {
  const { response, body } = await callApi('POST', '/v1/transporte/operacoes', {
    body: {
      integrationAccountId: ACCOUNT_A,
      cargoRegime: 'lotacao',
      route: VALID_ROUTE,
      parties: [
        { partyId: carrierPartyId, role: 'carrier' },
        { partyId: contractorPartyId, role: 'contractor' }
      ],
      vehicles: [{ vehicleId, position: 'traction' }],
      cargo: [{ cargoType: 'granel', description: 'Soja em grãos', weightKg: 28000 }],
      freightOfferedAmount: 4000,
      paymentTermDays: 30,
      ...overrides
    }
  });
  assert.equal(response.status, 201, JSON.stringify(body));
  return body;
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

  await query(
    `insert into integration_accounts (id, account_name)
     values ($1, 'Conta A - teste conformidade'), ($2, 'Conta B - teste conformidade')
     on conflict (id) do nothing`,
    [ACCOUNT_A, ACCOUNT_B]
  );

  const app = createApp();
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  API_BASE = `http://127.0.0.1:${server.address().port}`;

  const carrier = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: ACCOUNT_A,
      documentType: 'CNPJ',
      documentNumber: CNPJ_CARRIER,
      legalName: 'Transportes Conformidade LTDA',
      roles: ['carrier'],
      rntrcNumber: '12345678',
      rntrcCategory: 'TAC',
      rntrcStatus: 'active'
    }
  });
  assert.equal(carrier.response.status, 201, JSON.stringify(carrier.body));
  carrierPartyId = carrier.body.id;

  const contractor = await callApi('POST', '/v1/transporte/transportadores', {
    body: {
      integrationAccountId: ACCOUNT_A,
      documentType: 'CNPJ',
      documentNumber: CNPJ_CONTRACTOR,
      legalName: 'Embarcadora Conformidade LTDA',
      roles: ['contractor']
    }
  });
  assert.equal(contractor.response.status, 201, JSON.stringify(contractor.body));
  contractorPartyId = contractor.body.id;

  const vehicle = await callApi('POST', '/v1/transporte/veiculos', {
    body: { integrationAccountId: ACCOUNT_A, plate: 'CNF1O23', vehicleType: 'truck', axlesCount: 3 }
  });
  assert.equal(vehicle.response.status, 201, JSON.stringify(vehicle.body));
  vehicleId = vehicle.body.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (dbAvailable) {
    // compliance_evaluations NÃO cascade-deleta com transport_operations (FK sem ON DELETE
    // CASCADE — de propósito, ver header da migration 025) — apaga PRIMEIRO (cascade cuida de
    // checks/evidência), senão o delete de transport_operations abaixo falha por violação de FK.
    await query(
      `delete from compliance_evaluations where operation_id in (
         select id from transport_operations where integration_account_id = any($1)
       )`,
      [[ACCOUNT_A, ACCOUNT_B]]
    );
    await query('delete from transport_operations where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_vehicles where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from transport_parties where integration_account_id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
    await query('delete from integration_accounts where id = any($1)', [[ACCOUNT_A, ACCOUNT_B]]);
  }
  await pool.end();
});

describe('Conformidade — validar-conformidade ad-hoc', { concurrency: 1 }, () => {
  it('sem token responde 401 (rota nasce fechada)', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createDraftOperation();
    const response = await fetch(`${API_BASE}/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationAccountId: ACCOUNT_A, gate: 'GATE_PROPOSAL' })
    });
    assert.equal(response.status, 401);
    await response.arrayBuffer().catch(() => {});
  });

  it('gate inválido → 400 TRANSPORT_COMPLIANCE_GATE_INVALID', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createDraftOperation();
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_A, gate: 'GATE_INEXISTENTE' }
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_COMPLIANCE_GATE_INVALID');
  });

  it('GATE_PROPOSAL de operação lotação sem piso calculado → 200 com TR-PMF-001 PASS e TR-PMF-002 WARN FLOOR_NOT_CALCULATED', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createDraftOperation();
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_A, gate: 'GATE_PROPOSAL' }
    });

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.gate, 'GATE_PROPOSAL');
    assert.equal(body.operationId, operation.id);
    assert.equal(body.overallStatus, 'WARN');
    assert.ok(body.evaluationId?.startsWith('cmpeval_'));

    const pmf001 = body.checks.find((check) => check.ruleCode === 'TR-PMF-001');
    assert.equal(pmf001?.status, 'PASS');
    assert.equal(pmf001?.rawStatus, null);

    const pmf002 = body.checks.find((check) => check.ruleCode === 'TR-PMF-002');
    assert.equal(pmf002?.status, 'WARN');
    assert.equal(pmf002?.reasonCode, 'FLOOR_NOT_CALCULATED');
    assert.ok(Array.isArray(pmf002?.legalBasis) && pmf002.legalBasis.length > 0);
    assert.ok(Array.isArray(pmf002?.evidenceRefs) && pmf002.evidenceRefs.length === 1);
  });

  it('avaliações são APPEND-ONLY: duas chamadas do mesmo gate criam DUAS evaluations', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createDraftOperation();
    const first = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_A, gate: 'GATE_PROPOSAL' }
    });
    const second = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_A, gate: 'GATE_PROPOSAL' }
    });

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.notEqual(first.body.evaluationId, second.body.evaluationId, 'cada avaliação é uma linha NOVA');

    const count = await query(
      'select count(*)::int as count from compliance_evaluations where operation_id = $1 and gate = $2',
      [operation.id, 'GATE_PROPOSAL']
    );
    assert.equal(count.rows[0].count, 2);
  });

  it('referenceDate 2026-05-23 vs 2026-05-24 muda a versão de TR-CIOT-001 nos checks do GATE_CIOT', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createDraftOperation();

    const before2405 = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_A, gate: 'GATE_CIOT', referenceDate: '2026-05-23' }
    });
    const after2405 = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_A, gate: 'GATE_CIOT', referenceDate: '2026-05-24' }
    });

    assert.equal(before2405.response.status, 200, JSON.stringify(before2405.body));
    assert.equal(after2405.response.status, 200, JSON.stringify(after2405.body));

    const ciot001Before = before2405.body.checks.find((check) => check.ruleCode === 'TR-CIOT-001');
    const ciot001After = after2405.body.checks.find((check) => check.ruleCode === 'TR-CIOT-001');

    assert.equal(ciot001Before?.ruleVersionLabel, 'v2019-baseline');
    assert.equal(ciot001After?.ruleVersionLabel, 'v2026-05-universal');
    // PR-C2: TR-CIOT-001 ganhou evaluator — nos dois lados a operação é remunerada e nunca
    // solicitou CIOT, então o resultado é WARN CIOT_NOT_REGISTERED em AMBAS as versões (a
    // fronteira temporal muda a VERSÃO resolvida, não o resultado — nenhuma delas é `blocking`).
    assert.equal(ciot001Before?.status, 'WARN');
    assert.equal(ciot001After?.status, 'WARN');
    assert.equal(ciot001Before?.reasonCode, 'CIOT_NOT_REGISTERED');
    assert.equal(ciot001After?.reasonCode, 'CIOT_NOT_REGISTERED');
  });

  it('tenancy: conta B não avalia operação da conta A', async (t) => {
    if (skipIfNoDb(t)) return;

    const operation = await createDraftOperation();
    const { response, body } = await callApi('POST', `/v1/transporte/operacoes/${operation.id}/validar-conformidade`, {
      body: { integrationAccountId: ACCOUNT_B, gate: 'GATE_PROPOSAL' }
    });
    assert.equal(response.status, 404, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_OPERATION_NOT_FOUND');
  });
});

describe('Conformidade — ciclo feliz: submeter-validacao → contratar → overview', { concurrency: 1 }, () => {
  let operation = null;

  it('submeter-validacao ORQUESTRA GATE_PROPOSAL e aprova (draft → ready_for_contract)', async (t) => {
    if (skipIfNoDb(t)) return;

    operation = await createDraftOperation();
    const { response, body } = await callApi(
      'POST',
      `/v1/transporte/operacoes/${operation.id}/submeter-validacao`,
      { body: { integrationAccountId: ACCOUNT_A, version: operation.version } }
    );

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.operation.status, 'ready_for_contract', 'nenhum evaluator do GATE_PROPOSAL bloqueia com o seed real');
    assert.equal(body.operation.version, operation.version + 2, 'duas CAS: submit_validation + approve_validation');
    assert.deepEqual([...body.operation.availableCommands].sort(), ['cancel', 'contract']);
    assert.equal(body.evaluation.gate, 'GATE_PROPOSAL');
    assert.equal(body.evaluation.operationId, operation.id);
    assert.ok(['WARN', 'PASS'].includes(body.evaluation.overallStatus));

    operation = body.operation;
  });

  it('contratar ATIVA GATE_CONTRACT e aprova (ready_for_contract → contracted), atualizando contractedAmount', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi(
      'POST',
      `/v1/transporte/operacoes/${operation.id}/contratar`,
      { body: { integrationAccountId: ACCOUNT_A, version: operation.version, contractedAmount: 4000 } }
    );

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.operation.status, 'contracted');
    assert.equal(body.operation.freight.contractedAmount, 4000);
    assert.deepEqual(body.operation.availableCommands, ['cancel']);
    assert.equal(body.evaluation.gate, 'GATE_CONTRACT');

    // PR-C1: TR-RNTRC-001 evoluiu para considerar a última verificação de `rntrc_verifications`
    // (`ctx.carrierRntrcVerification`), não mais o `rntrcStatus` DECLARADO no cadastro. O carrier
    // deste setup nunca passou por `verificar-rntrc` — WARN RNTRC_NOT_VERIFIED é o resultado
    // CORRETO agora (não bloqueia `contratar`; só um `block` bloquearia). Cobertura completa do
    // frescor/estratégias de TR-RNTRC-001 vive em `tests/unit/rule-evaluators.test.js`.
    const rntrc001 = body.evaluation.checks.find((check) => check.ruleCode === 'TR-RNTRC-001');
    assert.equal(rntrc001?.status, 'WARN');
    assert.equal(rntrc001?.reasonCode, 'RNTRC_NOT_VERIFIED');

    operation = body.operation;
  });

  it('conformidade (overview) reflete a última avaliação de GATE_PROPOSAL e GATE_CONTRACT; demais gates null', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi(
      'GET',
      `/v1/transporte/operacoes/${operation.id}/conformidade?integrationAccountId=${ACCOUNT_A}`
    );

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.operationId, operation.id);
    assert.equal(body.gates.length, 8);

    const proposal = body.gates.find((entry) => entry.gate === 'GATE_PROPOSAL');
    assert.ok(proposal?.latestEvaluation, 'GATE_PROPOSAL deveria ter avaliação registrada');

    const contract = body.gates.find((entry) => entry.gate === 'GATE_CONTRACT');
    assert.ok(contract?.latestEvaluation, 'GATE_CONTRACT deveria ter avaliação registrada');

    for (const gate of ['GATE_CIOT', 'GATE_FISCAL', 'GATE_PRE_BOARDING', 'GATE_RELEASE', 'GATE_IN_TRANSIT', 'GATE_COMPLETION']) {
      const entry = body.gates.find((candidate) => candidate.gate === gate);
      assert.equal(entry?.latestEvaluation, null, `${gate} nunca foi avaliado nesta operação`);
    }
  });

  it('contratar fora de ready_for_contract → 409 TRANSPORT_INVALID_TRANSITION', async (t) => {
    if (skipIfNoDb(t)) return;

    const { response, body } = await callApi(
      'POST',
      `/v1/transporte/operacoes/${operation.id}/contratar`,
      { body: { integrationAccountId: ACCOUNT_A, version: operation.version } }
    );
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.code, 'TRANSPORT_INVALID_TRANSITION');
  });
});

describe('Conformidade — caminho blocked (versão forçada blocking=true+reviewed no banco de teste)', { concurrency: 1 }, () => {
  it('GATE_PROPOSAL bloqueado → submeter-validacao rejeita (validating → blocked); reabrir devolve a draft', async (t) => {
    if (skipIfNoDb(t)) return;

    // TR-PMF-002 é GATE_PROPOSAL, sempre nasce blocking=false (regra de ouro). Aqui simulamos a
    // ÚNICA forma de um `block` sobreviver ao clamp: promoção manual (via banco) a
    // ACTIVE+blocking=true+revisado — mesma trava (`chk_regrulev_blocking_reviewed`) que o
    // catálogo exige em produção. Muta o catálogo GLOBAL, por isso roda em `try/finally` e
    // restaura ANTES de qualquer outro teste rodar.
    const original = await query(
      `select v.id, v.implementation_state, v.blocking, v.reviewed_by, v.reviewed_at
         from regulatory_rule_versions v
         inner join regulatory_rules r on r.id = v.rule_id
        where r.code = 'TR-PMF-002' and v.version_label = 'v2026-08-baseline'`
    );
    assert.equal(original.rowCount, 1, 'versão baseline de TR-PMF-002 deveria existir (seed do PR-A1)');
    const versionId = original.rows[0].id;

    try {
      await query(
        `update regulatory_rule_versions
            set implementation_state = 'ACTIVE', blocking = true,
                reviewed_by = 'qa-forcing-block@exemplo.test', reviewed_at = now()
          where id = $1`,
        [versionId]
      );

      // Operação com piso JÁ calculado e oferta abaixo dele — TR-PMF-002 dá block DE VERDADE, sem clamp.
      const operation = await createDraftOperation({ freightOfferedAmount: 2000, freightFloorAmount: 5000 });

      const { response, body } = await callApi(
        'POST',
        `/v1/transporte/operacoes/${operation.id}/submeter-validacao`,
        { body: { integrationAccountId: ACCOUNT_A, version: operation.version } }
      );

      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.operation.status, 'blocked');
      assert.equal(body.operation.blockedReasonCode, 'FREIGHT_BELOW_FLOOR');
      assert.equal(body.evaluation.overallStatus, 'BLOCK');
      assert.deepEqual(body.operation.availableCommands.sort(), ['cancel', 'reopen'].sort());

      const pmf002 = body.evaluation.checks.find((check) => check.ruleCode === 'TR-PMF-002');
      assert.equal(pmf002?.status, 'BLOCK');
      assert.equal(pmf002?.rawStatus, null, 'sem clamp: rawStatus fica null (o BLOCK É o status final)');

      const reopened = await callApi(
        'POST',
        `/v1/transporte/operacoes/${operation.id}/reabrir`,
        { body: { integrationAccountId: ACCOUNT_A, version: body.operation.version } }
      );
      assert.equal(reopened.response.status, 200, JSON.stringify(reopened.body));
      assert.equal(reopened.body.status, 'draft');
      assert.equal(reopened.body.blockedReasonCode, null);
    } finally {
      await query(
        `update regulatory_rule_versions
            set implementation_state = $2, blocking = $3, reviewed_by = $4, reviewed_at = $5
          where id = $1`,
        [
          versionId,
          original.rows[0].implementation_state,
          original.rows[0].blocking,
          original.rows[0].reviewed_by,
          original.rows[0].reviewed_at
        ]
      );
    }
  });
});
