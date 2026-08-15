/**
 * Time-travel do schema registry de DF-e (PR-E1) — a MESMA entrada MDFE/3.00 resolve para a
 * BASELINE (`validation_profile: {}`) antes de 2026-10-01 e para o perfil da NT MDF-e 2026.001
 * (`mdfeRequiresCiot: true`) a partir dessa data — contra o Postgres local, não só a resolução pura
 * em memória (`resolveVersionFromList` já é testada por `tests/regulatory/effective-dates.test.js`).
 * [ASSUMPTION] `2026-10-01` é a data PLANEJADA usada pelo seed (`bootstrap/dfe-schema-seed.ts`) —
 * a NT MDF-e 2026.001 ainda não tem cronograma técnico oficial publicado (pendência P7 do guia).
 *
 * A segunda parte prova de ponta a ponta, contra `importarDocumentoFiscal`: o MESMO MDF-e sintético
 * (sem CIOT, operação remunerada) importa `valid` ANTES da virada e `invalid`/`MDFE_CIOT_MISSING`
 * NA/DEPOIS da virada — só a data de EMISSÃO do XML muda entre os dois cenários.
 *
 * Molde: `tests/regulatory/time-travel-integration.test.js` (PR-A6) — chama services/repos
 * diretamente (sem `createApp`/HTTP), skip-if-no-DB.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ensureRegulatoryCatalogSeeded } from '../../src/bootstrap/regulatory-rules-seed.js';
import { ensureDfeSchemaRegistrySeeded } from '../../src/bootstrap/dfe-schema-seed.js';
import { findActiveSchemaRegistryEntry } from '../../src/repositories/dfe-schema-registry-repo.js';
import { createTransportPartyService } from '../../src/services/transport-party-service.js';
import { createTransportOperation } from '../../src/services/transport-operation-service.js';
import { importarDocumentoFiscal } from '../../src/services/transport-fiscal-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_XML = readFileSync(path.join(__dirname, '../fixtures/regulatory/dfe/mdfe-without-ciot.xml'), 'utf8');
const ORIGINAL_ACCESS_KEY = '35260811222333000181580010000000021000000058';
const ORIGINAL_DH_EMI = '2026-08-04T07:00:00-03:00';

const KEY_BEFORE_VIRADA = '35260911222333000181580010000000061000000107'; // AAMM 2609 — irrelevante para a resolução (só dhEmi importa)
const KEY_AFTER_VIRADA = '35261011222333000181580010000000071000000112'; // AAMM 2610

/** Clona o XML da fixture com uma chave de acesso e um `dhEmi` diferentes — mesmo documento, outra data de emissão. */
function buildMdfeXml(dhEmi, accessKey) {
  return FIXTURE_XML.split(ORIGINAL_ACCESS_KEY).join(accessKey).split(ORIGINAL_DH_EMI).join(dhEmi);
}

let dbAvailable = true;
let dbUnavailableReason = '';

const RUN_ID = randomBytes(4).toString('hex');
const ACCOUNT = `acc_regdfetimetravel_${RUN_ID}`;
const CNPJ_CARRIER = '11.222.333/0001-81';
const CNPJ_CONTRACTOR = '11.888.888/0001-67';

const VALID_ROUTE = {
  originMunicipality: 'São Paulo',
  originUf: 'SP',
  destinationMunicipality: 'Campinas',
  destinationUf: 'SP',
  distanceKm: 99.5
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
  await ensureRegulatoryCatalogSeeded();
  await ensureDfeSchemaRegistrySeeded();

  const carrier = await createTransportPartyService(
    {
      integrationAccountId: ACCOUNT,
      documentType: 'CNPJ',
      documentNumber: CNPJ_CARRIER,
      legalName: 'Transportes Fixture LTDA', // mesmo emit das fixtures — sem DFE_PARTY_MISMATCH
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
      legalName: 'Embarcadora Time Travel DF-e LTDA',
      roles: ['contractor']
    },
    null
  );

  // Operação REMUNERADA (freightOfferedAmount > 0) — pré-condição de MDFE_CIOT_MISSING.
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
    await query(
      `delete from fiscal_document_events where document_id in (
         select id from fiscal_documents where integration_account_id = $1
       )`,
      [ACCOUNT]
    );
    await query('delete from fiscal_documents where integration_account_id = $1', [ACCOUNT]);
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

describe('dfe-schema-registry — time-travel puro (findActiveSchemaRegistryEntry) contra o Postgres', () => {
  it('MDFE/3.00 em 2026-09-30 (véspera da NT 2026.001) resolve para a BASELINE', async (t) => {
    if (skipIfNoDb(t)) return;
    const entry = await findActiveSchemaRegistryEntry('MDFE', '3.00', '2026-09-30');
    assert.ok(entry, 'esperava uma entrada vigente em 2026-09-30');
    assert.equal(entry.technicalNote, null);
    assert.deepEqual(entry.validationProfile, {});
  });

  it('MDFE/3.00 em 2026-10-01 (virada [ASSUMPTION]) resolve para o perfil mdfeRequiresCiot=true', async (t) => {
    if (skipIfNoDb(t)) return;
    const entry = await findActiveSchemaRegistryEntry('MDFE', '3.00', '2026-10-01');
    assert.ok(entry);
    assert.equal(entry.technicalNote, 'NT MDF-e 2026.001');
    assert.equal(entry.validationProfile.mdfeRequiresCiot, true);
  });

  it('MDFE/3.00 bem depois da virada (2026-12-31) continua no perfil da NT (sem effective_until)', async (t) => {
    if (skipIfNoDb(t)) return;
    const entry = await findActiveSchemaRegistryEntry('MDFE', '3.00', '2026-12-31');
    assert.ok(entry);
    assert.equal(entry.technicalNote, 'NT MDF-e 2026.001');
  });
});

describe('importarDocumentoFiscal — o MESMO MDF-e sem CIOT, antes/depois da virada da NT 2026.001', { concurrency: 1 }, () => {
  it('dhEmi=2026-09-30 (antes da virada): importa valid, SEM MDFE_CIOT_MISSING', async (t) => {
    if (skipIfNoDb(t)) return;
    const xml = buildMdfeXml('2026-09-30T08:00:00-03:00', KEY_BEFORE_VIRADA);

    const result = await importarDocumentoFiscal(
      { integrationAccountId: ACCOUNT, xmlContent: xml, operationId },
      { correlationId: `corr_dfe_before_${RUN_ID}` }
    );

    assert.equal(result.accessKey, KEY_BEFORE_VIRADA);
    assert.equal(result.validationStatus, 'valid');
    assert.ok(
      !result.validationIssues.some((issue) => issue.code === 'MDFE_CIOT_MISSING'),
      JSON.stringify(result.validationIssues)
    );
  });

  it('dhEmi=2026-10-01 (na virada [ASSUMPTION]): importa invalid, MDFE_CIOT_MISSING — antecipação em TESTE da NT 2026.001', async (t) => {
    if (skipIfNoDb(t)) return;
    const xml = buildMdfeXml('2026-10-01T08:00:00-03:00', KEY_AFTER_VIRADA);

    const result = await importarDocumentoFiscal(
      { integrationAccountId: ACCOUNT, xmlContent: xml, operationId },
      { correlationId: `corr_dfe_after_${RUN_ID}` }
    );

    assert.equal(result.accessKey, KEY_AFTER_VIRADA);
    assert.equal(result.validationStatus, 'invalid');
    assert.ok(
      result.validationIssues.some((issue) => issue.code === 'MDFE_CIOT_MISSING'),
      JSON.stringify(result.validationIssues)
    );
  });
});
