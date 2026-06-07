// Fixtures de manifestos para testes
export const validManifestDraft = {
  id: 'man_test_draft_001',
  integrationAccountId: 'acc_test_001',
  sessionContextId: 'scx_test_001',
  status: 'draft',
  externalStatus: null,
  externalReference: null,
  externalHashCode: null,
  payload: {
    manTipo: 'E',
    manOrigem: 'P',
    resCodigoGerador: 176163,
    resNomeGerador: 'Nova IT',
    resDocumentoGerador: '31913781000139',
    resCodigoTransportador: 176163,
    resNomeTransportador: 'Nova IT',
    resDocumentoTransportador: '31913781000139',
    resCodigoDestinatario: 176163,
    resNomeDestinatario: 'Nova IT',
    resDocumentoDestinatario: '31913781000139',
    residuos: [
      {
        resCodigoResiduo: 10,
        resDescricao: 'Papel',
        resUnidade: 'KG',
        resQuantidade: 100
      }
    ]
  }
};

export const validManifestWithoutSessionContext = {
  id: 'man_test_no_session_001',
  integrationAccountId: 'acc_test_001',
  sessionContextId: null,
  status: 'draft',
  externalStatus: null,
  externalReference: null,
  externalHashCode: null,
  payload: {
    manTipo: 'E',
    manOrigem: 'P',
    resCodigoGerador: 176163
  }
};

export const submittedManifest = {
  id: 'man_test_submitted_001',
  integrationAccountId: 'acc_test_001',
  sessionContextId: 'scx_test_001',
  status: 'submitted',
  externalStatus: 'aguardando transporte',
  externalReference: {
    manCodigo: 123456,
    manNumero: '000123456'
  },
  externalHashCode: 'abc123def456',
  payload: {
    manTipo: 'E',
    manOrigem: 'P',
    resCodigoGerador: 176163
  },
  lastSubmittedAt: new Date().toISOString()
};
