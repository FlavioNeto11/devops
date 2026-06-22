import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNfeXml,
  createFiscalGateway,
  FiscalConfigError,
} from '../src/index.js';

const sampleInvoice = {
  number: '1001',
  series: '1',
  cnpj: '12345678000199',
  items: [
    { desc: 'Servico de consultoria', qty: 2, price: 150.5 },
    { desc: 'Item A & B <test>', qty: 1, price: 10 },
  ],
  total: 311.0,
};

test('buildNfeXml e deterministico — mesma invoice -> string identica', () => {
  const a = buildNfeXml(sampleInvoice);
  const b = buildNfeXml(JSON.parse(JSON.stringify(sampleInvoice)));
  assert.equal(a, b);
  // sanidade: escapou caracteres especiais
  assert.match(a, /Item A &amp; B &lt;test&gt;/);
});

test('fluxo sandbox: build -> sign -> submit -> queryStatus -> authorized', () => {
  const gw = createFiscalGateway({ mode: 'sandbox' });
  const xml = gw.buildNfeXml(sampleInvoice);
  const signed = gw.signXml(xml);
  assert.match(signed, /<Signature sandbox="true" digest="[0-9a-f]{32}"\/>/);

  const { receipt, status } = gw.submit(signed);
  assert.equal(status, 'received');
  assert.match(receipt, /^rec_[0-9a-f]{16}$/);

  const result = gw.queryStatus(receipt);
  assert.equal(result.status, 'authorized');
  assert.ok(result.protocol && result.protocol.startsWith('NFe'));
});

test('modo real sem certificado -> createFiscalGateway lanca FiscalConfigError', () => {
  assert.throws(
    () => createFiscalGateway({ mode: 'real' }),
    (err) => err instanceof FiscalConfigError && err.code === 'FISCAL_CONFIG',
  );
});
