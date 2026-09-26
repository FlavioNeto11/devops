// ADR-010 — capacidades congeladas no código e guardas de domínio do marketplace legado.
// As funções de escrita do marketplace precisam recusar ANTES de tocar o banco: estes testes
// rodam sem DATABASE_URL, então qualquer acesso ao banco falharia com "db indisponível".
import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
delete process.env.SESSION_SECRET;
for (const k of ['TOKENIZATION_REAL', 'MARKETPLACE_REAL', 'REAL_MONEY', 'REAL_INVESTMENT']) process.env[k] = 'true';

const caps = await import('../src/governance/capabilities.js');

test('capacidades reais estão todas desligadas e o objeto é imutável', () => {
  assert.deepEqual(caps.CAPABILITIES, { TOKENIZATION_REAL: false, MARKETPLACE_REAL: false, REAL_MONEY: false, REAL_INVESTMENT: false });
  assert.ok(Object.isFrozen(caps.CAPABILITIES));
  assert.throws(() => { caps.CAPABILITIES.TOKENIZATION_REAL = true; }, TypeError);
  assert.equal(caps.CAPABILITIES.TOKENIZATION_REAL, false);
});

test('variáveis de ambiente não ligam capacidades', async () => {
  const fresh = await import('../src/governance/capabilities.js?env-override-attempt');
  for (const v of Object.values(fresh.CAPABILITIES)) assert.equal(v, false);
});

test('capacidade desconhecida é erro, não "permitido"', () => {
  assert.throws(() => caps.isCapabilityEnabled('WHATEVER'), /desconhecida/);
});

const actor = { userId: '00000000-0000-0000-0000-000000000001', role: 'admin', ip: '127.0.0.1' };
const expectRefused = (out, capability) => {
  assert.equal(out.status, 403);
  assert.equal(out.body.code, 'CAPABILITY_DISABLED');
  if (capability) assert.equal(out.body.capability, capability);
};

test('usuário não consegue emitir token real: issueBatch/createParameter/activateParameter recusam no domínio', async () => {
  const issuance = await import('../src/marketplace/issuance.js');
  const titles = await import('../src/marketplace/titles.js');
  expectRefused(await issuance.issueBatch('t1', { quantity: 1000 }, actor), 'TOKENIZATION_REAL');
  expectRefused(await titles.createParameter('t1', { tokensPerShare: 100, unitFaceValue: 10 }, actor), 'TOKENIZATION_REAL');
  expectRefused(await titles.activateParameter('p1', actor), 'TOKENIZATION_REAL');
});

test('usuário não consegue ativar marketplace: título, listagem, valuation, estado jurídico, contratação, substituição recusam', async () => {
  const issuance = await import('../src/marketplace/issuance.js');
  const titles = await import('../src/marketplace/titles.js');
  expectRefused(await titles.createTitle({ caseId: 'c1', override: true }, actor), 'MARKETPLACE_REAL');
  expectRefused(await titles.addValuation('t1', { valuePerShare: 1000, source: 'pericia' }, actor), 'MARKETPLACE_REAL');
  expectRefused(await titles.setListing('t1', 'listed', actor), 'MARKETPLACE_REAL');
  expectRefused(await titles.transitionLegalStatus('t1', { toStatus: 'ruled_favorable', reason: 'x' }, actor), 'MARKETPLACE_REAL');
  expectRefused(await issuance.contractTokens('t1', { quantity: 1, holderUserId: actor.userId }, actor));
  expectRefused(await issuance.substituteContract('c1', { toTitleId: 't2' }, actor), 'MARKETPLACE_REAL');
  expectRefused(await issuance.writeOffContract('c1', actor), 'MARKETPLACE_REAL');
});

test('dinheiro real desligado: fatura, aluguel, competência, custo e fee de distribuição recusam', async () => {
  const revenue = await import('../src/marketplace/revenue.js');
  expectRefused(await revenue.markInvoicePaid('i1', { evidenceRef: 'x' }, actor), 'REAL_MONEY');
  expectRefused(await revenue.createLease('c1', { baseAmount: 40000, monthlyRatePct: 0.9 }, actor), 'REAL_MONEY');
  expectRefused(await revenue.closeCompetence('l1', { competence: '2026-09' }, actor), 'REAL_MONEY');
  expectRefused(await revenue.addCost({ amount: 10, category: 'infra', competence: '2026-09' }, actor), 'REAL_MONEY');
  const calls = [];
  const fakeClient = { query: async (...a) => { calls.push(a); return { rows: [] }; } };
  await assert.rejects(() => revenue.chargeFirstTransferFee(fakeClient, { contract: { id: 'c1' }, actor }), { code: 'CAPABILITY_DISABLED' });
  assert.equal(calls.length, 0, 'a guarda precisa recusar antes de qualquer query');
});

test('gate de go-live legado não liga nada', async () => {
  const gate = await import('../src/marketplace/gate.js');
  expectRefused(await gate.grantGoLive(actor), 'MARKETPLACE_REAL');
  expectRefused(await gate.setGateItem('is_security', { status: 'satisfied', professionalName: 'x' }, actor), 'MARKETPLACE_REAL');
  const portals = await import('../src/marketplace/portals.js');
  assert.equal(await portals.goLiveEnabled(), false);
});

test('boot recusa o BesuAdapter enquanto TOKENIZATION_REAL = false', async () => {
  const { config } = await import('../src/config.js');
  Object.assign(config, { ledgerAdapter: 'besu', besuRpcUrl: 'http://127.0.0.1:1', besuPrivateKey: '0x' + '1'.repeat(64), besuContractAddress: '0x' + '2'.repeat(40) });
  const { bootMarketplace } = await import('../src/marketplace/index.js');
  const { getLedger } = await import('../src/ledger/port.js');
  const { SimulatedLedgerAdapter } = await import('../src/ledger/simulated.js');
  await bootMarketplace();
  assert.ok(getLedger() instanceof SimulatedLedgerAdapter);
});
