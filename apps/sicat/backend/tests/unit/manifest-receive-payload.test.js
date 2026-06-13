import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceiptManifestPayload,
  buildReceiveRequestBody,
  normalizeCetesbReceiptTimestamp
} from '../../src/workers/operation-handlers.js';

// Verdade do fio = captura real do portal (cap_3012dde41ef83433f6):
// raiz {manifesto, paaCodigo: <access code da sessão>, remCodigo: null,
// rrmCodigo, remObservacao: "", remDataRecebimento: ISO-8601}; manifesto é uma
// PROJEÇÃO de 25 campos (não o GET inteiro) com parceiros de 9 campos.

describe('buildReceiveRequestBody', () => {
  const mergedManifestPayload = { manCodigo: 23788683, manNumero: '260012302059', listaManifestoResiduo: [] };

  it('monta a raiz EXATAMENTE como o portal real (sem vazar receiptPayload)', () => {
    const body = buildReceiveRequestBody({
      mergedManifestPayload,
      accessPartnerCode: 57380,
      resolvedResponsibleCode: 3960,
      receiptPayload: { dateFrom: '28-05-2026', dateTo: '12-06-2026', manifesto: { manNumero: '260012302059' } },
      now: new Date('2026-06-12T22:37:57.168Z')
    });

    assert.deepEqual(Object.keys(body).sort(), [
      'manifesto', 'paaCodigo', 'remCodigo', 'remDataRecebimento', 'remObservacao', 'rrmCodigo'
    ]);
    assert.equal(body.paaCodigo, 57380);
    assert.equal(body.rrmCodigo, 3960);
    assert.equal(body.remCodigo, null);
    assert.equal(body.remObservacao, '');
    assert.equal(body.remDataRecebimento, '2026-06-12T22:37:57.168Z');
    assert.equal(body.manifesto, mergedManifestPayload);
    assert.equal('dateFrom' in body, false);
    assert.equal('manCodigo' in body, false);
  });

  it('preserva remDataRecebimento ISO do frontend e respeita overrides', () => {
    const body = buildReceiveRequestBody({
      mergedManifestPayload,
      accessPartnerCode: 57380,
      resolvedResponsibleCode: null,
      receiptPayload: {
        rrmCodigo: 4001,
        remObservacao: 'Recebido com divergência de 0,2t',
        remDataRecebimento: '2026-06-12T15:00:00.000Z'
      }
    });

    assert.equal(body.rrmCodigo, 4001);
    assert.equal(body.remObservacao, 'Recebido com divergência de 0,2t');
    assert.equal(body.remDataRecebimento, '2026-06-12T15:00:00.000Z');
  });
});

describe('normalizeCetesbReceiptTimestamp (saída SEMPRE ISO-8601, como no fio real)', () => {
  const now = new Date('2026-06-12T22:37:57.168Z');

  it('ISO válido passa intocado; vazio vira o instante atual', () => {
    assert.equal(normalizeCetesbReceiptTimestamp('2026-06-12T15:00:00.000Z', now), '2026-06-12T15:00:00.000Z');
    assert.equal(normalizeCetesbReceiptTimestamp('', now), '2026-06-12T22:37:57.168Z');
    assert.equal(normalizeCetesbReceiptTimestamp(null, now), '2026-06-12T22:37:57.168Z');
  });

  it('data sem hora vira meio-dia de São Paulo (não recua um dia; TZ-independente)', () => {
    assert.equal(normalizeCetesbReceiptTimestamp('2026-06-10', now), '2026-06-10T15:00:00.000Z');
    assert.equal(normalizeCetesbReceiptTimestamp('06/12/2026', now), '2026-06-12T15:00:00.000Z');
  });

  it('ISO sem offset é hora de São Paulo — independente do TZ do processo', () => {
    assert.equal(normalizeCetesbReceiptTimestamp('2026-06-12T15:00:00', now), '2026-06-12T18:00:00.000Z');
    assert.equal(normalizeCetesbReceiptTimestamp('2026-06-12 15:00', now), '2026-06-12T18:00:00.000Z');
  });

  it('epoch numérico é convertido; MM/DD com hora é hora de SP; DD/MM inequívoco reordenado', () => {
    assert.equal(normalizeCetesbReceiptTimestamp(now.getTime(), now), '2026-06-12T22:37:57.168Z');
    assert.equal(normalizeCetesbReceiptTimestamp('06/12/2026 14:30:00', now), '2026-06-12T17:30:00.000Z');
    assert.equal(normalizeCetesbReceiptTimestamp('31/12/2026 23:59:59', now), '2027-01-01T02:59:59.000Z');
    assert.equal(normalizeCetesbReceiptTimestamp('25/06/2026', now), '2026-06-25T15:00:00.000Z');
  });

  it('não parseável é repassado como veio (erro estruturado vem da CETESB)', () => {
    assert.equal(normalizeCetesbReceiptTimestamp('data-invalida', now), 'data-invalida');
  });
});

describe('buildReceiptManifestPayload — projeção fiel à captura', () => {
  // GET remoto com campos EXTRAS que o portal NÃO envia no POST (manData,
  // recaptcha, paisExportacao...) e parceiro com 17 campos.
  const remoteManifest = {
    manData: 1781281635253,
    recaptcha: null,
    seuCodigo: null,
    paisExportacao: { paiCodigo: null, paiDescricao: null },
    estado: { estCodigo: 26, estAbreviacao: 'SP' },
    manCodigo: 23788534,
    manNumero: '260012301910',
    manHashCode: 'SxClZSrnBr3Up053QsfBRu9FamP2oo',
    manObservacao: 'fresa de asfalto',
    tipoManifesto: 1,
    manResponsavel: 'Djalma Ricardo Nunes',
    parceiroAcesso: { paaNome: 'Djalma Ricardo Nunes', paaCodigo: 357684 },
    manPlacaVeiculo: 'BXH2E22',
    parceiroGerador: {
      parUf: null, parCep: '00000-000', parCnpj: '00.000.000/0001-00', parBairro: 'Centro',
      parCidade: 'São Paulo', parCodigo: 184068, spaCodigo: 1, parLicenca: null,
      parEndereco: 'Rua X', parDescricao: 'GERADORA LTDA', possuiPerfil: null,
      parComplemento: 'Sala 1', parNomeFantasia: 'GER', parOrgaoEmissor: null,
      parCadastroCetesb: null, parNumeroEndereco: '100'
    },
    manDataExpedicao: 1781233200000,
    manNomeMotorista: 'Motorista',
    situacaoManifesto: { simOrdem: 1, simCodigo: 1, simDescricao: 'salvo' },
    parceiroDestinador: { parCodigo: 40110, parDescricao: 'MARDAN', parCnpj: null, parUf: null, parCidade: null, parLicenca: null, parEndereco: null, parOrgaoEmissor: null, parNumeroEndereco: null, parCep: '11111' },
    parceiroTransportador: { parCodigo: 182790, parDescricao: 'EYESERVICES', parBairro: 'B' },
    parceiroArmazenadorTemporario: { parCodigo: null, parDescricao: null },
    parceiroTransportadorArmazenadorTemporario: { parCodigo: null },
    possuiArmazenamentoTemporario: null,
    manJustificativaCancelamento: null,
    listaManifestoResiduo: [
      { marNumeroLinha: 1, marQuantidade: 25.2, marQuantidadeRecebida: null, residuo: { resCodigo: 731 }, marJustificativa: null }
    ]
  };

  it('remove campos fora da projeção e enxuga parceiros para 9 campos', () => {
    const payload = buildReceiptManifestPayload(remoteManifest, { manifesto: { manNumero: '260012301910' } }, null, 40110);

    // Campos extras do GET NÃO vão no POST (causavam 400 Tomcat/Jackson).
    assert.equal('manData' in payload, false);
    assert.equal('recaptcha' in payload, false);
    assert.equal('paisExportacao' in payload, false);
    assert.equal('seuCodigo' in payload, false);
    // 25 campos exatos da captura.
    assert.equal(Object.keys(payload).length, 25);
    // Parceiros: somente os 9 campos do shape do portal.
    assert.deepEqual(Object.keys(payload.parceiroGerador).sort(), [
      'parCidade', 'parCnpj', 'parCodigo', 'parDescricao', 'parEndereco',
      'parLicenca', 'parNumeroEndereco', 'parOrgaoEmissor', 'parUf'
    ]);
    assert.equal(payload.parceiroGerador.parCodigo, 184068);
    assert.equal('parCep' in payload.parceiroGerador, false);
    assert.equal('spaCodigo' in payload.parceiroGerador, false);
    // parceiroAcesso do GET fica INTOCADO (não é o destinador logado).
    assert.deepEqual(payload.parceiroAcesso, { paaNome: 'Djalma Ricardo Nunes', paaCodigo: 357684 });
    // Defaults de string vazia que o portal adiciona.
    assert.equal(payload.manObservacaoArmazenadorTemporario, '');
    assert.equal(payload.anJustificativaCancelamentoComplementar, '');
    // Quantidade recebida preenchida = declarada (lote).
    assert.equal(payload.listaManifestoResiduo[0].marQuantidadeRecebida, 25.2);
    assert.equal(payload.situacaoManifesto.simDescricao, 'salvo');
  });

  it('override por linha mantém a quantidade informada, inclusive 0', () => {
    const payload = buildReceiptManifestPayload(
      remoteManifest,
      {
        manifesto: {
          listaManifestoResiduo: [
            { marNumeroLinha: 1, residuo: { resCodigo: 731 }, marQuantidadeRecebida: 0 }
          ]
        }
      },
      null,
      40110
    );

    assert.equal(payload.listaManifestoResiduo[0].marQuantidadeRecebida, 0);
  });

  it('parceiro parcial do request não clobberiza o objeto do GET (merge por campo)', () => {
    const payload = buildReceiptManifestPayload(
      remoteManifest,
      { manifesto: { parceiroGerador: { parCnpj: '11.111.111/0001-11' } } },
      null,
      40110
    );

    assert.equal(payload.parceiroGerador.parCnpj, '11.111.111/0001-11');
    assert.equal(payload.parceiroGerador.parCodigo, 184068);
    assert.equal(payload.parceiroGerador.parDescricao, 'GERADORA LTDA');
  });
});
