/**
 * `validateDfeDocument`/`deriveValidationStatus` (PR-E1) — validador PURO contra `ParsedDfeDocument`
 * (via `parseDfeXml` sobre as fixtures) + `DfeSchemaRegistryEntry`/`DfeValidationContext` sintéticos.
 * Sem banco — o service (`transport-fiscal-service.ts`) é quem monta o contexto de verdade.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseDfeXml } from '../../src/lib/transport/dfe-parser.js';
import {
  computeAccessKeyCheckDigit,
  deriveValidationStatus,
  extractReferencedDocuments,
  validateDfeDocument
} from '../../src/lib/transport/dfe-validator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures/regulatory/dfe');

function readFixture(name) {
  return readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

function parseFixture(name) {
  return parseDfeXml(readFixture(name));
}

function buildRegistryEntry(overrides = {}) {
  return {
    id: 'dfeschema_fixture',
    documentType: 'MDFE',
    layoutVersion: '3.00',
    technicalNote: null,
    effectiveFrom: '2018-01-01',
    effectiveUntil: null,
    validationProfile: {},
    notes: '',
    version: 1,
    createdAt: '2026-08-13T00:00:00Z',
    updatedAt: '2026-08-13T00:00:00Z',
    ...overrides
  };
}

function issuesByCode(issues) {
  return issues.map((issue) => issue.code);
}

describe('validateDfeDocument — coerência da chave de acesso (DFE_ACCESS_KEY_MISMATCH)', () => {
  it('chave válida (DV/modelo/CNPJ coerentes) → nenhum issue de chave', () => {
    const parsed = parseFixture('nfe-authorized.xml');
    const issues = validateDfeDocument(parsed, null, {});
    assert.ok(!issuesByCode(issues).includes('DFE_ACCESS_KEY_MISMATCH'));
  });

  it('dígito verificador (DV) incorreto → DFE_ACCESS_KEY_MISMATCH', () => {
    const parsed = parseFixture('nfe-authorized.xml');
    const body = parsed.accessKey.slice(0, 43);
    const wrongDv = (computeAccessKeyCheckDigit(body) + 1) % 10;
    const tampered = { ...parsed, accessKey: `${body}${wrongDv}` };
    const issues = validateDfeDocument(tampered, null, {});
    assert.ok(issuesByCode(issues).includes('DFE_ACCESS_KEY_MISMATCH'));
    assert.equal(issues.find((issue) => issue.code === 'DFE_ACCESS_KEY_MISMATCH').severity, 'error');
  });

  it('modelo embutido na chave incompatível com o documentType → DFE_ACCESS_KEY_MISMATCH', () => {
    const parsed = parseFixture('nfe-authorized.xml'); // chave com modelo 55 (NFe)
    const tampered = { ...parsed, documentType: 'CTE' }; // esperado seria modelo 57
    const issues = validateDfeDocument(tampered, null, {});
    assert.ok(issuesByCode(issues).includes('DFE_ACCESS_KEY_MISMATCH'));
  });

  it('CNPJ do emitente diverge do CNPJ embutido na chave → DFE_ACCESS_KEY_MISMATCH', () => {
    const parsed = parseFixture('nfe-authorized.xml');
    const tampered = { ...parsed, issuer: { ...parsed.issuer, document: '99999999000199' } };
    const issues = validateDfeDocument(tampered, null, {});
    assert.ok(issuesByCode(issues).includes('DFE_ACCESS_KEY_MISMATCH'));
  });

  it('chave com menos de 44 dígitos → DFE_ACCESS_KEY_MISMATCH', () => {
    const parsed = parseFixture('nfe-authorized.xml');
    const tampered = { ...parsed, accessKey: '123' };
    const issues = validateDfeDocument(tampered, null, {});
    assert.ok(issuesByCode(issues).includes('DFE_ACCESS_KEY_MISMATCH'));
  });
});

describe('validateDfeDocument — DFE_NOT_AUTHORIZED', () => {
  it('authorizationStatus unknown (sem protNFe) → warning DFE_NOT_AUTHORIZED', () => {
    const xml = readFixture('nfe-authorized.xml').replace(/<protNFe[\s\S]*<\/protNFe>/, '');
    const parsed = parseDfeXml(xml);
    const issues = validateDfeDocument(parsed, null, {});
    const issue = issues.find((entry) => entry.code === 'DFE_NOT_AUTHORIZED');
    assert.ok(issue);
    assert.equal(issue.severity, 'warning');
    assert.equal(deriveValidationStatus(issues), 'warnings');
  });

  it('authorized → sem DFE_NOT_AUTHORIZED', () => {
    const parsed = parseFixture('nfe-authorized.xml');
    const issues = validateDfeDocument(parsed, null, {});
    assert.ok(!issuesByCode(issues).includes('DFE_NOT_AUTHORIZED'));
  });
});

describe('validateDfeDocument — MDFE_CIOT_MISSING (a regra da NT MDF-e 2026.001 ANTECIPADA)', () => {
  it('perfil SEM mdfeRequiresCiot → MDF-e sem CIOT NÃO gera o issue, mesmo remunerado', () => {
    const parsed = parseFixture('mdfe-without-ciot.xml');
    const registryEntry = buildRegistryEntry({ validationProfile: {} });
    const issues = validateDfeDocument(parsed, registryEntry, { remunerated: true });
    assert.ok(!issuesByCode(issues).includes('MDFE_CIOT_MISSING'));
  });

  it('perfil COM mdfeRequiresCiot + remunerated=true + MDF-e sem CIOT → error MDFE_CIOT_MISSING', () => {
    const parsed = parseFixture('mdfe-without-ciot.xml');
    const registryEntry = buildRegistryEntry({
      technicalNote: 'NT MDF-e 2026.001',
      validationProfile: { mdfeRequiresCiot: true }
    });
    const issues = validateDfeDocument(parsed, registryEntry, { remunerated: true });
    const issue = issues.find((entry) => entry.code === 'MDFE_CIOT_MISSING');
    assert.ok(issue);
    assert.equal(issue.severity, 'error');
    assert.equal(deriveValidationStatus(issues), 'invalid');
  });

  it('perfil COM mdfeRequiresCiot mas remunerated=false → sem MDFE_CIOT_MISSING (não é transporte remunerado por terceiros)', () => {
    const parsed = parseFixture('mdfe-without-ciot.xml');
    const registryEntry = buildRegistryEntry({ validationProfile: { mdfeRequiresCiot: true } });
    const issues = validateDfeDocument(parsed, registryEntry, { remunerated: false });
    assert.ok(!issuesByCode(issues).includes('MDFE_CIOT_MISSING'));
  });

  it('perfil COM mdfeRequiresCiot + remunerated=true + MDF-e COM CIOT → sem MDFE_CIOT_MISSING', () => {
    const parsed = parseFixture('mdfe-with-ciot.xml');
    const registryEntry = buildRegistryEntry({ validationProfile: { mdfeRequiresCiot: true } });
    const issues = validateDfeDocument(parsed, registryEntry, { remunerated: true });
    assert.ok(!issuesByCode(issues).includes('MDFE_CIOT_MISSING'));
  });
});

describe('validateDfeDocument — MDFE_CIOT_MISMATCH (cross-check pós-vínculo)', () => {
  it('linkedCiotNumber presente no infCIOT → sem mismatch', () => {
    const parsed = parseFixture('mdfe-with-ciot.xml');
    const issues = validateDfeDocument(parsed, null, { linkedCiotNumber: '2026081500000001' });
    assert.ok(!issuesByCode(issues).includes('MDFE_CIOT_MISMATCH'));
  });

  it('linkedCiotNumber AUSENTE do infCIOT → error MDFE_CIOT_MISMATCH', () => {
    const parsed = parseFixture('mdfe-with-ciot.xml');
    const issues = validateDfeDocument(parsed, null, { linkedCiotNumber: '9999999999999999' });
    const issue = issues.find((entry) => entry.code === 'MDFE_CIOT_MISMATCH');
    assert.ok(issue);
    assert.equal(issue.severity, 'error');
  });

  it('sem linkedCiotNumber (operação sem CIOT registrado) → sem checagem', () => {
    const parsed = parseFixture('mdfe-without-ciot.xml');
    const issues = validateDfeDocument(parsed, null, {});
    assert.ok(!issuesByCode(issues).includes('MDFE_CIOT_MISMATCH'));
  });
});

describe('validateDfeDocument — MDFE_VPO_MISSING_INFO', () => {
  it('tollExpected=true e MDF-e SEM valePed → warning MDFE_VPO_MISSING_INFO', () => {
    const parsed = parseFixture('mdfe-without-ciot.xml');
    const issues = validateDfeDocument(parsed, null, { tollExpected: true });
    const issue = issues.find((entry) => entry.code === 'MDFE_VPO_MISSING_INFO');
    assert.ok(issue);
    assert.equal(issue.severity, 'warning');
  });

  it('tollExpected=true e MDF-e COM valePed → sem o warning', () => {
    const parsed = parseFixture('mdfe-with-valeped.xml');
    const issues = validateDfeDocument(parsed, null, { tollExpected: true });
    assert.ok(!issuesByCode(issues).includes('MDFE_VPO_MISSING_INFO'));
  });

  it('tollExpected não informado (rota sem operação vinculada) → sem o warning', () => {
    const parsed = parseFixture('mdfe-without-ciot.xml');
    const issues = validateDfeDocument(parsed, null, {});
    assert.ok(!issuesByCode(issues).includes('MDFE_VPO_MISSING_INFO'));
  });
});

describe('validateDfeDocument — CTE_WITHOUT_NFE_REFERENCE', () => {
  it('CT-e sem infDoc/infNFe → warning', () => {
    const xml = readFixture('cte-authorized.xml').replace(/<infDoc>[\s\S]*<\/infDoc>/, '');
    const parsed = parseDfeXml(xml);
    const issues = validateDfeDocument(parsed, null, {});
    assert.ok(issuesByCode(issues).includes('CTE_WITHOUT_NFE_REFERENCE'));
  });

  it('CT-e com infDoc/infNFe presente → sem o warning', () => {
    const parsed = parseFixture('cte-authorized.xml');
    const issues = validateDfeDocument(parsed, null, {});
    assert.ok(!issuesByCode(issues).includes('CTE_WITHOUT_NFE_REFERENCE'));
  });
});

describe('validateDfeDocument — DFE_PARTY_MISMATCH', () => {
  it('nenhuma parte da operação corresponde ao emitente/destinatário → warning', () => {
    const parsed = parseFixture('nfe-authorized.xml');
    const issues = validateDfeDocument(parsed, null, { partyDocuments: ['00000000000000'] });
    assert.ok(issuesByCode(issues).includes('DFE_PARTY_MISMATCH'));
  });

  it('emitente corresponde a uma parte da operação (mesmo com máscara) → sem o warning', () => {
    const parsed = parseFixture('nfe-authorized.xml');
    const issues = validateDfeDocument(parsed, null, { partyDocuments: ['11.222.333/0001-81'] });
    assert.ok(!issuesByCode(issues).includes('DFE_PARTY_MISMATCH'));
  });

  it('sem partyDocuments (sem operação vinculada) → sem checagem', () => {
    const parsed = parseFixture('nfe-authorized.xml');
    const issues = validateDfeDocument(parsed, null, {});
    assert.ok(!issuesByCode(issues).includes('DFE_PARTY_MISMATCH'));
  });
});

describe('validateDfeDocument — DFE_ROUTE_MISMATCH (só MDF-e)', () => {
  it('UF origem/destino da rota fora do percurso do MDF-e → warning', () => {
    const parsed = parseFixture('mdfe-with-ciot.xml'); // routeUfs: SP, SP
    const issues = validateDfeDocument(parsed, null, { route: { originUf: 'SP', destinationUf: 'RJ' } });
    assert.ok(issuesByCode(issues).includes('DFE_ROUTE_MISMATCH'));
  });

  it('UF origem/destino coerentes com o percurso → sem o warning', () => {
    const parsed = parseFixture('mdfe-with-valeped.xml'); // routeUfs: SP, MG
    const issues = validateDfeDocument(parsed, null, { route: { originUf: 'SP', destinationUf: 'MG' } });
    assert.ok(!issuesByCode(issues).includes('DFE_ROUTE_MISMATCH'));
  });

  it('NF-e/CT-e nunca disparam DFE_ROUTE_MISMATCH (checagem exclusiva de MDF-e)', () => {
    const parsed = parseFixture('nfe-authorized.xml');
    const issues = validateDfeDocument(parsed, null, { route: { originUf: 'SP', destinationUf: 'RJ' } });
    assert.ok(!issuesByCode(issues).includes('DFE_ROUTE_MISMATCH'));
  });
});

describe('deriveValidationStatus', () => {
  it('sem issues → valid', () => {
    assert.equal(deriveValidationStatus([]), 'valid');
  });

  it('só warnings → warnings', () => {
    assert.equal(deriveValidationStatus([{ severity: 'warning', code: 'X', message: 'x' }]), 'warnings');
  });

  it('qualquer error → invalid, mesmo com warnings junto', () => {
    assert.equal(
      deriveValidationStatus([
        { severity: 'warning', code: 'X', message: 'x' },
        { severity: 'error', code: 'Y', message: 'y' }
      ]),
      'invalid'
    );
  });
});

describe('extractReferencedDocuments', () => {
  it('CT-e → NF-e referenciada', () => {
    const parsed = parseFixture('cte-authorized.xml');
    assert.deepEqual(extractReferencedDocuments(parsed), [
      { documentType: 'NFE', accessKey: '35260811222333000181550010000000011000000017' }
    ]);
  });

  it('MDF-e → CT-e referenciado', () => {
    const parsed = parseFixture('mdfe-with-ciot.xml');
    assert.deepEqual(extractReferencedDocuments(parsed), [
      { documentType: 'CTE', accessKey: '35260811222333000181570010000000011000000030' }
    ]);
  });

  it('NF-e → nada a referenciar (folha da árvore de documentos)', () => {
    const parsed = parseFixture('nfe-authorized.xml');
    assert.deepEqual(extractReferencedDocuments(parsed), []);
  });
});
