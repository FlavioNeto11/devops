// Instalacao do dominio de marketplace (Fase 1). Rotas do Gestor + catalogo publico.
// Adapter de ledger simulado ligado ao pool. As permissoes seguem o apendice C.
import { query } from '../db.js';
import { authorize } from '../foundation/rbac.js';
import { setLedgerAdapter } from '../ledger/port.js';
import { SimulatedLedgerAdapter } from '../ledger/simulated.js';
import { config } from '../config.js';
import { LEGAL_STATUSES, TRANSITIONS } from './states.js';
import {
  createTitle, listTitles, getTitle, addValuation, createParameter, activateParameter,
  setListing, transitionLegalStatus,
} from './titles.js';
import { issueBatch, contractTokens, substituteContract, writeOffContract, listContracts } from './issuance.js';
import { installPortals } from './portals.js';
import { markInvoicePaid, createLease, closeCompetence, addCost, trialBalance, revenueVsCost, listInvoices, listLeases } from './revenue.js';
import { gateStatus, setGateItem, grantGoLive, revokeGoLive } from './gate.js';

export async function bootMarketplace() {
  // Toggle simulado<->besu (docs/evolution/05). Default simulado: o off-chain e a fonte
  // da verdade e a chain so entra apos o gate regulatorio. besu exige BESU_* no ambiente.
  if (config.ledgerAdapter === 'besu' && config.besuRpcUrl && config.besuPrivateKey && config.besuContractAddress) {
    try {
      const { BesuAdapter } = await import('../ledger/besu.js');
      const adapter = new BesuAdapter({ rpcUrl: config.besuRpcUrl, privateKey: config.besuPrivateKey, contractAddress: config.besuContractAddress, chainId: config.besuChainId });
      const h = await adapter.health();
      if (h.ok) { setLedgerAdapter(adapter); console.log(`[ledger] BesuAdapter ativo (${config.besuChainId}, bloco ${h.blockHeight})`); return; }
      console.error('[ledger] Besu indisponível — caindo para o adaptador simulado:', h.error);
    } catch (e) {
      console.error('[ledger] falha ao iniciar BesuAdapter — usando simulado:', e.message);
    }
  }
  setLedgerAdapter(new SimulatedLedgerAdapter((text, params) => query(text, params)));
}

const actorOf = (req) => ({ userId: req.auth.user.id, role: req.auth.roles[0], ip: req.ip });
const send = (res, out) => res.status(out.status).json(out.body);

export function installMarketplace(app) {
  // meta do dominio p/ a UI (estados + transicoes)
  app.get('/marketplace/meta', (req, res) => res.json({ legalStatuses: LEGAL_STATUSES, transitions: TRANSITIONS }));

  // catalogo PUBLICO (teaser) — sem PII, so titulos listados
  app.get('/marketplace/catalog', async (req, res) => res.json(await listTitles({ publicView: true })));

  // ---- Gestor: titulos ----
  app.get('/titles', authorize('titles:read'), async (req, res) => res.json(await listTitles()));
  app.post('/titles', authorize('titles:create'), async (req, res) => send(res, await createTitle(req.body || {}, actorOf(req))));
  app.get('/titles/:id', authorize('titles:read'), async (req, res) => {
    const t = await getTitle(req.params.id);
    if (!t) return res.status(404).json({ error: 'título não encontrado' });
    res.json(t);
  });
  app.post('/titles/:id/valuations', authorize('valuations:write'), async (req, res) => send(res, await addValuation(req.params.id, req.body || {}, actorOf(req))));
  app.post('/titles/:id/parameters', authorize('params:write'), async (req, res) => send(res, await createParameter(req.params.id, req.body || {}, actorOf(req))));
  app.post('/parameters/:id/activate', authorize('params:write'), async (req, res) => send(res, await activateParameter(req.params.id, actorOf(req))));
  app.post('/titles/:id/listing', authorize('titles:create'), async (req, res) => send(res, await setListing(req.params.id, (req.body || {}).listingStatus, actorOf(req))));
  app.post('/titles/:id/legal-status', authorize('legal_status:transition'), async (req, res) => send(res, await transitionLegalStatus(req.params.id, req.body || {}, actorOf(req))));

  // ---- emissao / contratos ----
  app.post('/titles/:id/batches', authorize('tokens:issue'), async (req, res) => send(res, await issueBatch(req.params.id, req.body || {}, actorOf(req))));
  app.post('/titles/:id/contracts', authorize('tokens:issue'), async (req, res) => send(res, await contractTokens(req.params.id, req.body || {}, actorOf(req))));
  app.get('/contracts', authorize('titles:read'), async (req, res) => res.json(await listContracts({ titleId: req.query.titleId })));
  app.post('/contracts/:id/substitute', authorize('tokens:issue'), async (req, res) => send(res, await substituteContract(req.params.id, req.body || {}, actorOf(req))));
  app.post('/contracts/:id/write-off', authorize('tokens:issue'), async (req, res) => send(res, await writeOffContract(req.params.id, actorOf(req))));

  // ---- leitura de auditoria de titulo (advogado/juiz — Fase 2 amplia com escopo linked) ----
  app.get('/titles/:id/legal-history', authorize('legal_status:read'), async (req, res) => {
    const t = await getTitle(req.params.id);
    if (!t) return res.status(404).json({ error: 'título não encontrado' });
    res.json(t.legalHistory);
  });

  // portais por perfil (investidor/auditor/gestor-grants) — Fase 2
  installPortals(app);

  // ---- receita (Fase 4): faturas, aluguel, custos, relatorios ----
  app.get('/invoices', authorize('fees:read'), async (req, res) => res.json(await listInvoices({ status: req.query.status })));
  app.post('/invoices/:id/pay', authorize('fees:write'), async (req, res) => send(res, await markInvoicePaid(req.params.id, req.body || {}, actorOf(req))));
  app.get('/leases', authorize('fees:read'), async (req, res) => res.json(await listLeases()));
  app.post('/contracts/:id/leases', authorize('fees:write'), async (req, res) => send(res, await createLease(req.params.id, req.body || {}, actorOf(req))));
  app.post('/leases/:id/close-competence', authorize('fees:write'), async (req, res) => send(res, await closeCompetence(req.params.id, req.body || {}, actorOf(req))));
  app.post('/costs', authorize('fees:write'), async (req, res) => send(res, await addCost(req.body || {}, actorOf(req))));
  app.get('/reports/trial-balance', authorize('fees:read'), async (req, res) => res.json(await trialBalance()));
  app.get('/reports/revenue-vs-cost', authorize('fees:read'), async (req, res) => res.json(await revenueVsCost({ from: req.query.from, to: req.query.to })));

  // ---- gate regulatorio (Fase 4): trava go-live em codigo ----
  app.get('/gate', authorize('fees:read'), async (req, res) => res.json(await gateStatus()));
  app.put('/gate/items/:key', authorize('gate:manage'), async (req, res) => send(res, await setGateItem(req.params.key, req.body || {}, actorOf(req))));
  app.post('/gate/grant', authorize('gate:manage'), async (req, res) => send(res, await grantGoLive(actorOf(req))));
  app.post('/gate/revoke', authorize('gate:manage'), async (req, res) => send(res, await revokeGoLive(actorOf(req), (req.body || {}).reason)));
}
