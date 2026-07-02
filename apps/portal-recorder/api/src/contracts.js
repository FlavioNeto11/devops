// contracts.js — superfície HTTP dos CONTRATOS (A5/E3): listagem por portal, leitura,
// export canônico e PROMOÇÃO para o git (padrão forge-launch: a API não escreve git,
// só dispara o workflow portal-contract-promote via repository_dispatch, fail-closed
// sem GITHUB_DISPATCH_TOKEN). Dependências INJETÁVEIS (getPool/store/env/fetchImpl)
// para testes node:test puros sem banco — padrão do app (pool injetado no store).
import express from 'express';
import { requireWriteAuth } from './auth.js';
import { getPool as defaultGetPool } from './db.js';
import * as defaultStore from './store.js';
import {
  PROMOTE_SLUG_RE, buildCanonicalExport, buildPromotePayload, dispatchContractPromote,
} from './promote.js';

const notFound = (res, code, message) => res.status(404).json({ error: { code, message } });

export function buildContractsRouter({
  getPool = defaultGetPool,
  store = defaultStore,
  env = process.env,
  fetchImpl,
} = {}) {
  const router = express.Router();

  // Carrega contrato + portal (ambos ou erro já respondido). null = resposta enviada.
  async function loadContractWithPortal(req, res) {
    const contract = await store.getContract(getPool(), req.params.id);
    if (!contract) { notFound(res, 'CONTRACT_NOT_FOUND', 'not found'); return null; }
    const portal = await store.getPortal(getPool(), contract.portal_id);
    if (!portal) { notFound(res, 'PORTAL_NOT_FOUND', 'portal of contract not found'); return null; }
    return { contract, portal };
  }

  // ── Listagem: GET /v1/contracts?portal=<id|slug> ──────────────────────────
  // Campos leves (id, version, created_at, session_id, endpoint_count) — o corpo
  // pesado (endpoints) continua só no GET por id / export.
  router.get('/v1/contracts', async (req, res, next) => {
    try {
      const portalRef = typeof req.query.portal === 'string' ? req.query.portal.trim() : '';
      let portalId = null;
      if (portalRef) {
        const portal = await store.getPortal(getPool(), portalRef);
        if (!portal) return notFound(res, 'PORTAL_NOT_FOUND', 'portal not found');
        portalId = portal.id;
      }
      res.json({ data: await store.listContracts(getPool(), { portalId }) });
    } catch (e) { next(e); }
  });

  // ── Export canônico: GET /v1/contracts/:id/export ─────────────────────────
  // FORMATO de docs/portal-contracts (manifest + endpoints) SEM sample_request/
  // sample_response — allowlist em buildCanonicalExport.
  router.get('/v1/contracts/:id/export', async (req, res, next) => {
    try {
      const loaded = await loadContractWithPortal(req, res);
      if (!loaded) return;
      const ex = buildCanonicalExport({ portal: loaded.portal, contract: loaded.contract, endpoints: loaded.contract.endpoints });
      if (!ex.ok) return res.status(422).json({ error: { code: ex.code, message: ex.message } });
      res.json({ data: ex.value });
    } catch (e) { next(e); }
  });

  // ── PROMOÇÃO: POST /v1/contracts/:id/promote ──────────────────────────────
  // WRITE fail-closed em DUAS camadas: Bearer PORTAL_REC_TOKEN (padrão dos writes)
  // E GITHUB_DISPATCH_TOKEN no env (503 claro se faltar). O payload leva o export
  // completo (o runner não alcança o Postgres do app) com teto de 60KB.
  router.post('/v1/contracts/:id/promote', requireWriteAuth, async (req, res, next) => {
    try {
      const token = env.GITHUB_DISPATCH_TOKEN;
      if (!token) {
        return res.status(503).json({ error: {
          code: 'DISPATCH_DISABLED',
          message: 'promoção para o git desligada — defina GITHUB_DISPATCH_TOKEN no Secret portal-recorder-config (PAT fine-grained, Contents: Read and write)',
        } });
      }
      const loaded = await loadContractWithPortal(req, res);
      if (!loaded) return;
      const { contract, portal } = loaded;
      if (!PROMOTE_SLUG_RE.test(portal.slug)) {
        return res.status(400).json({ error: { code: 'INVALID_SLUG', message: `slug '${portal.slug}' fora do padrão promovível (^[a-z][a-z0-9-]{1,30}$)` } });
      }
      const ex = buildCanonicalExport({ portal, contract, endpoints: contract.endpoints });
      if (!ex.ok) return res.status(422).json({ error: { code: ex.code, message: ex.message } });

      // identidade best-effort: o oauth2-proxy da rota injeta X-Auth-Request-Email.
      const requestedBy = String(req.headers['x-auth-request-email'] || '').trim() || 'portal-recorder';
      const built = buildPromotePayload({
        portalSlug: portal.slug, contractId: contract.id, contractVersion: contract.version,
        requestedBy, exportData: ex.value,
      });
      if (!built.ok) return res.status(413).json({ error: { code: built.code, message: built.message } });

      const repo = env.GITHUB_DISPATCH_REPO || 'FlavioNeto11/devops';
      const d = await dispatchContractPromote({ token, repo, payload: built.payload, fetchImpl });
      if (!d.ok) return res.status(502).json({ error: { code: 'DISPATCH_FAILED', message: `GitHub ${d.status}: ${d.detail || 'falha ao disparar o workflow'}` } });

      const branch = `portal-contract/${portal.slug}`;
      return res.status(202).json({ data: {
        dispatched: true,
        portal_slug: portal.slug,
        contract_id: contract.id,
        version: ex.value.manifest.version,
        endpoint_count: ex.value.endpoints.length,
        bytes: built.bytes,
        expected_branch: branch,
        actions_url: `https://github.com/${repo}/actions/workflows/portal-contract-promote.yml`,
        pulls_url: `https://github.com/${repo}/pulls?q=is%3Apr+head%3A${encodeURIComponent(branch)}`,
      } });
    } catch (e) { next(e); }
  });

  // ── Leitura por id (movida de routes.js — todas as rotas de contrato juntas) ──
  router.get('/v1/contracts/:id', async (req, res, next) => {
    try {
      const contract = await store.getContract(getPool(), req.params.id);
      if (!contract) return notFound(res, 'CONTRACT_NOT_FOUND', 'not found');
      res.json({ data: contract });
    } catch (e) { next(e); }
  });

  return router;
}
