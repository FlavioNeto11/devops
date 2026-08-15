/**
 * `parseDfeXml` (PR-E1) — parser PURO de NF-e/CT-e/MDF-e contra as fixtures sintéticas de
 * `tests/fixtures/regulatory/dfe/`. Sem banco, sem service — só o parser.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { DfeParseError, parseDfeXml } from '../../src/lib/transport/dfe-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures/regulatory/dfe');

function readFixture(name) {
  return readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

describe('parseDfeXml — detecção de tipo e chave de acesso', () => {
  it('nfe-authorized.xml → NFE, chave de 44 dígitos, authorized', () => {
    const parsed = parseDfeXml(readFixture('nfe-authorized.xml'));
    assert.equal(parsed.documentType, 'NFE');
    assert.equal(parsed.accessKey, '35260811222333000181550010000000011000000017');
    assert.equal(parsed.accessKey.length, 44);
    assert.equal(parsed.layoutVersion, '4.00');
    assert.equal(parsed.authorizationStatus, 'authorized');
    assert.equal(parsed.protocol, '135260000012345');
    assert.equal(parsed.issuedAt, '2026-08-01T10:00:00-03:00');
    assert.equal(parsed.issuer.document, '11222333000181');
    assert.equal(parsed.issuer.name, 'Transportes Fixture LTDA');
    assert.equal(parsed.recipient.document, '22333444000155');
    assert.equal(parsed.totalAmount, 26000);
  });

  it('nfe-cancelled.xml → authorizationStatus cancelled (cStat 101)', () => {
    const parsed = parseDfeXml(readFixture('nfe-cancelled.xml'));
    assert.equal(parsed.documentType, 'NFE');
    assert.equal(parsed.authorizationStatus, 'cancelled');
    assert.equal(parsed.accessKey, '35260811222333000181550010000000021000000022');
  });

  it('cte-authorized.xml → CTE com referencedDocuments apontando para a NF-e (infCTeNorm/infDoc/infNFe)', () => {
    const parsed = parseDfeXml(readFixture('cte-authorized.xml'));
    assert.equal(parsed.documentType, 'CTE');
    assert.equal(parsed.accessKey, '35260811222333000181570010000000011000000030');
    assert.equal(parsed.authorizationStatus, 'authorized');
    assert.equal(parsed.totalAmount, 3800);
    assert.ok(parsed.cte);
    assert.deepEqual(parsed.cte.referencedDocuments, [
      { documentType: 'NFE', accessKey: '35260811222333000181550010000000011000000017' }
    ]);
  });

  it('mdfe-with-ciot.xml → MDFE com infCIOT, infDoc (CT-e) e routeUfs extraídos', () => {
    const parsed = parseDfeXml(readFixture('mdfe-with-ciot.xml'));
    assert.equal(parsed.documentType, 'MDFE');
    assert.equal(parsed.accessKey, '35260811222333000181580010000000011000000042');
    assert.ok(parsed.mdfe);
    assert.deepEqual(parsed.mdfe.ciots, [{ ciotNumber: '2026081500000001', responsibleDocument: '11222333000181' }]);
    assert.equal(parsed.mdfe.toll.hasValePedagio, false);
    assert.deepEqual(parsed.mdfe.referencedDocuments, [
      { documentType: 'CTE', accessKey: '35260811222333000181570010000000011000000030' }
    ]);
    assert.deepEqual(parsed.mdfe.routeUfs, ['SP', 'SP']);
    // MDF-e não tem destinatário no layout real — recipient é sempre null.
    assert.equal(parsed.recipient.document, null);
    assert.equal(parsed.recipient.name, null);
  });

  it('mdfe-without-ciot.xml → MDFE sem nenhum infCIOT (infANTT ausente)', () => {
    const parsed = parseDfeXml(readFixture('mdfe-without-ciot.xml'));
    assert.equal(parsed.documentType, 'MDFE');
    assert.deepEqual(parsed.mdfe.ciots, []);
    assert.equal(parsed.mdfe.toll.hasValePedagio, false);
  });

  it('mdfe-with-valeped.xml → MDFE com infANTT/valePed/disp (categorias) e SEM infDoc', () => {
    const parsed = parseDfeXml(readFixture('mdfe-with-valeped.xml'));
    assert.equal(parsed.documentType, 'MDFE');
    assert.equal(parsed.mdfe.toll.hasValePedagio, true);
    assert.deepEqual(parsed.mdfe.toll.categories, ['06']);
    assert.deepEqual(parsed.mdfe.ciots, [{ ciotNumber: '2026081500000001', responsibleDocument: '11222333000181' }]);
    assert.deepEqual(parsed.mdfe.routeUfs, ['SP', 'MG']);
  });

  it('malformed.xml → lança DfeParseError DFE_XML_INVALID', () => {
    assert.throws(
      () => parseDfeXml(readFixture('malformed.xml')),
      (error) => error instanceof DfeParseError && error.code === 'DFE_XML_INVALID'
    );
  });
});

describe('parseDfeXml — erros tipados', () => {
  it('string vazia → DFE_XML_INVALID', () => {
    assert.throws(() => parseDfeXml(''), (error) => error instanceof DfeParseError && error.code === 'DFE_XML_INVALID');
  });

  it('XML bem-formado mas raiz desconhecida → DFE_UNSUPPORTED_ROOT', () => {
    const xml = '<?xml version="1.0"?><algumaCoisa><valor>1</valor></algumaCoisa>';
    assert.throws(
      () => parseDfeXml(xml),
      (error) => error instanceof DfeParseError && error.code === 'DFE_UNSUPPORTED_ROOT'
    );
  });

  it('NFe isolada SEM protNFe (nunca autorizada) → authorizationStatus unknown, protocol null', () => {
    const xml = readFixture('nfe-authorized.xml').replace(/<protNFe[\s\S]*<\/protNFe>/, '');
    const parsed = parseDfeXml(xml);
    assert.equal(parsed.authorizationStatus, 'unknown');
    assert.equal(parsed.protocol, null);
  });

  it('infNFe sem atributo Id → DFE_XML_INVALID', () => {
    const xml = readFixture('nfe-authorized.xml').replace(
      'Id="NFe35260811222333000181550010000000011000000017"',
      ''
    );
    assert.throws(() => parseDfeXml(xml), (error) => error instanceof DfeParseError && error.code === 'DFE_XML_INVALID');
  });
});
