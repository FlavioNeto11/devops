import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceiveRequestBody,
  formatCetesbReceiptTimestamp
} from '../../src/workers/operation-handlers.js';

// Raiz do POST /api/mtr/manifesto/recebimento/ fiel à captura real do portal
// (cap_3012dde41ef83433f6): {manifesto, paaCodigo, remCodigo, rrmCodigo,
// remObservacao, remDataRecebimento} — sem vazar campos internos do
// receiptPayload (dateFrom/dateTo/manifesto-request) na raiz.

describe('formatCetesbReceiptTimestamp', () => {
  it('formata MM/DD/YYYY HH:mm:ss na hora de São Paulo', () => {
    // 2026-06-12T22:37:57Z = 19:37:57 em São Paulo (UTC-3)
    const formatted = formatCetesbReceiptTimestamp(new Date('2026-06-12T22:37:57Z'));
    assert.equal(formatted, '06/12/2026 19:37:57');
  });

  it('zero-padding e ciclo 24h (meia-noite vira 00, não 24)', () => {
    // 03:05:09Z = 00:05:09 em São Paulo
    const formatted = formatCetesbReceiptTimestamp(new Date('2026-01-02T03:05:09Z'));
    assert.equal(formatted, '01/02/2026 00:05:09');
  });
});

describe('buildReceiveRequestBody', () => {
  const mergedManifestPayload = { manCodigo: 23788683, manNumero: '260012302059', listaManifestoResiduo: [] };

  it('monta a raiz EXATAMENTE como o portal real (sem vazar receiptPayload)', () => {
    const body = buildReceiveRequestBody({
      mergedManifestPayload,
      effectivePartnerCode: 57380,
      resolvedResponsibleCode: 3960,
      receiptPayload: { dateFrom: '28-05-2026', dateTo: '12-06-2026', manifesto: { manNumero: '260012302059' } },
      now: new Date('2026-06-12T22:37:57Z')
    });

    assert.deepEqual(Object.keys(body).sort(), [
      'manifesto', 'paaCodigo', 'remCodigo', 'remDataRecebimento', 'remObservacao', 'rrmCodigo'
    ]);
    assert.equal(body.paaCodigo, 57380);
    assert.equal(body.rrmCodigo, 3960);
    assert.equal(body.remCodigo, '');
    assert.equal(body.remObservacao, '');
    assert.equal(body.remDataRecebimento, '06/12/2026 19:37:57');
    assert.equal(body.manifesto, mergedManifestPayload);
    // Campos internos NÃO vazam para a raiz.
    assert.equal('dateFrom' in body, false);
    assert.equal('manCodigo' in body, false);
  });

  it('respeita remObservacao/remDataRecebimento/rrmCodigo vindos do receiptPayload', () => {
    const body = buildReceiveRequestBody({
      mergedManifestPayload,
      effectivePartnerCode: 57380,
      resolvedResponsibleCode: null,
      receiptPayload: {
        rrmCodigo: 4001,
        remObservacao: 'Recebido com divergência de 0,2t',
        remDataRecebimento: '06/10/2026 08:00:00'
      }
    });

    assert.equal(body.rrmCodigo, 4001);
    assert.equal(body.remObservacao, 'Recebido com divergência de 0,2t');
    assert.equal(body.remDataRecebimento, '06/10/2026 08:00:00');
  });
});
