// Fixtures de session contexts para testes
export const validSessionContext = {
  id: 'scx_test_001',
  integrationAccountId: 'acc_test_001',
  status: 'active',
  partnerDocument: '31913781000139',
  partnerType: 'J',
  partnerCode: 176163,
  userAccessCode: 333948,
  userName: 'Test User',
  email: 'test@example.com',
  jwtTokenRef: 'vault://test/token/scx_test_001',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  lastValidatedAt: new Date().toISOString(),
  metadata: {
    stateCode: 26,
    stateAbbreviation: 'SP',
    partnerDescription: 'Test Partner',
    autenticacaoNova: true
  }
};

export const expiredSessionContext = {
  id: 'scx_test_expired_001',
  integrationAccountId: 'acc_test_001',
  status: 'expired',
  partnerDocument: '31913781000139',
  partnerType: 'J',
  partnerCode: 176163,
  userAccessCode: 333948,
  userName: 'Test User',
  email: 'test@example.com',
  jwtTokenRef: 'vault://test/token/scx_test_expired_001',
  expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  lastValidatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  metadata: {
    stateCode: 26,
    stateAbbreviation: 'SP',
    partnerDescription: 'Test Partner',
    autenticacaoNova: true
  }
};
