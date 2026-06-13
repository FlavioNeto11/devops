import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceiptManifestPayload,
  buildReceiveRequestBody,
  formatCetesbReceiptTimestamp,
  normalizeCetesbReceiptTimestamp
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

  it('converte remDataRecebimento ISO (frontend) para o formato do portal', () => {
    // O ManifestsView envia toISOString() de meio-dia local — nunca o formato CETESB.
    const body = buildReceiveRequestBody({
      mergedManifestPayload,
      effectivePartnerCode: 57380,
      resolvedResponsibleCode: 3960,
      receiptPayload: { remDataRecebimento: '2026-06-12T15:00:00.000Z' }
    });

    assert.equal(body.remDataRecebimento, '06/12/2026 12:00:00');
  });
});

describe('normalizeCetesbReceiptTimestamp', () => {
  const now = new Date('2026-06-12T22:37:57Z');

  it('ISO vira MM/DD/YYYY HH:mm:ss em São Paulo', () => {
    assert.equal(normalizeCetesbReceiptTimestamp('2026-06-12T15:00:00.000Z', now), '06/12/2026 12:00:00');
  });

  it('formato do portal passa intocado (sem reinterpretação de fuso)', () => {
    assert.equal(normalizeCetesbReceiptTimestamp('06/12/2026 22:37:57', now), '06/12/2026 22:37:57');
  });

  it('data sem hora vira meio-dia de São Paulo (não recua um dia pelo parse UTC)', () => {
    assert.equal(normalizeCetesbReceiptTimestamp('2026-06-10', now), '06/10/2026 12:00:00');
    assert.equal(normalizeCetesbReceiptTimestamp('06/12/2026', now), '06/12/2026 12:00:00');
  });

  it('ISO sem offset é hora de São Paulo — independente do TZ do processo (container=UTC, dev=SP)', () => {
    assert.equal(normalizeCetesbReceiptTimestamp('2026-06-12T15:00:00', now), '06/12/2026 15:00:00');
    assert.equal(normalizeCetesbReceiptTimestamp('2026-06-12 15:00', now), '06/12/2026 15:00:00');
  });

  it('epoch numérico (chat/LLM) é convertido em vez de virar string de dígitos', () => {
    const epoch = new Date('2026-06-12T22:37:57Z').getTime();
    assert.equal(normalizeCetesbReceiptTimestamp(epoch, now), '06/12/2026 19:37:57');
  });

  it('DD/MM inequívoco (dia > 12) é reordenado; ambíguo passa intocado', () => {
    assert.equal(normalizeCetesbReceiptTimestamp('31/12/2026 23:59:59', now), '12/31/2026 23:59:59');
    assert.equal(normalizeCetesbReceiptTimestamp('25/06/2026', now), '06/25/2026 12:00:00');
    // 12/06 pode ser 6-de-dezembro ou 12-de-junho: não adivinhamos.
    assert.equal(normalizeCetesbReceiptTimestamp('12/06/2026 14:30:00', now), '12/06/2026 14:30:00');
  });

  it('vazio gera timestamp de agora; não parseável é repassado como veio', () => {
    assert.equal(normalizeCetesbReceiptTimestamp('', now), '06/12/2026 19:37:57');
    assert.equal(normalizeCetesbReceiptTimestamp(null, now), '06/12/2026 19:37:57');
    assert.equal(normalizeCetesbReceiptTimestamp('data-invalida', now), 'data-invalida');
  });
});

describe('buildReceiptManifestPayload — quantidade recebida', () => {
  const remoteManifest = {
    manCodigo: 23788683,
    manNumero: '260012302059',
    parceiroAcesso: { paaCodigo: 99, paaNome: 'DESTINO FINAL LTDA' },
    listaManifestoResiduo: [
      { marNumeroLinha: 1, marQuantidade: 25.2, marQuantidadeRecebida: null, residuo: { resCodigo: 10 } }
    ]
  };

  it('lote (sem resíduos no request): preenche recebida = declarada, como o portal', () => {
    // Na captura real o GET vem com marQuantidadeRecebida null e o portal POSTa 25.2.
    const payload = buildReceiptManifestPayload(remoteManifest, { manifesto: { manNumero: '260012302059' } }, null, 57380);

    assert.equal(payload.listaManifestoResiduo.length, 1);
    assert.equal(payload.listaManifestoResiduo[0].marQuantidadeRecebida, 25.2);
    assert.equal(payload.parceiroAcesso.paaCodigo, 57380);
  });

  it('parceiroGerador parcial do request não clobberiza o objeto completo do GET', () => {
    const remoteWithGenerator = {
      ...remoteManifest,
      parceiroGerador: { parCodigo: 11111, parDescricao: 'GERADORA LTDA', parCnpj: '00.000.000/0001-00' }
    };
    const payload = buildReceiptManifestPayload(
      remoteWithGenerator,
      { manifesto: { parceiroGerador: { parCnpj: '00.000.000/0001-00' } } },
      null,
      57380
    );

    assert.equal(payload.parceiroGerador.parCodigo, 11111);
    assert.equal(payload.parceiroGerador.parDescricao, 'GERADORA LTDA');
    assert.equal(payload.parceiroGerador.parCnpj, '00.000.000/0001-00');
    // Sem parceiro em nenhum dos lados, a chave não é inventada.
    assert.equal('parceiroTransportador' in payload, false);
  });

  it('single (override por linha): mantém a quantidade informada, inclusive 0', () => {
    const payload = buildReceiptManifestPayload(
      remoteManifest,
      {
        manifesto: {
          listaManifestoResiduo: [
            { marNumeroLinha: 1, residuo: { resCodigo: 10 }, marQuantidadeRecebida: 0 }
          ]
        }
      },
      null,
      57380
    );

    assert.equal(payload.listaManifestoResiduo[0].marQuantidadeRecebida, 0);
  });
});
