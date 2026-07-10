// Instalacao do dominio de marketplace (Fase 1). Rotas do Gestor + catalogo publico.
// Adapter de ledger simulado ligado ao pool. As permissoes seguem o apendice C.
import { query } from '../db.js';
import { authorize } from '../foundation/rbac.js';
import { setLedgerAdapter } from '../ledger/port.js';
import { SimulatedLedgerAdapter } from '../ledger/simulated.js';
import { LEGAL_STATUSES, TRANSITIONS } from './states.js';
import {
  createTitle, listTitles, getTitle, addValuation, createParameter, activateParameter,
  setListing, transitionLegalStatus,
} from './titles.js';
import { issueBatch, contractTokens, substituteContract, writeOffContract, listContracts } from './issuance.js';
import { installPortals } from './portals.js';

export function bootMarketplace() {
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
}
