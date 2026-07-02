// routes/gateway-routes.js — Rotas expostas para operações de gateway fiscal (SEFAZ, RFB, e-Social).
// Toda HTTP a sistemas externos é delegada aos módulos em gateways/. NUNCA use fetch() diretamente aqui.
import { pool } from '../db.js';
import { createSefazGateway, SefazError, formatGatewayError as formatSefazError } from '../gateways/sefaz-gateway.js';
import { createRfbGateway, RfbError, formatRfbError } from '../gateways/rfb-gateway.js';
import { createESocialGateway, ESocialError, formatESocialError, TIPOS_VALIDOS } from '../gateways/esocial-gateway.js';

function handleGatewayError(reply, err) {
  if (err instanceof SefazError) {
    const typed = formatSefazError(err);
    reply.code(err.status >= 400 && err.status < 500 ? err.status : 502);
    return typed;
  }
  if (err instanceof RfbError) {
    const typed = formatRfbError(err);
    reply.code(err.status >= 400 && err.status < 500 ? err.status : 502);
    return typed;
  }
  if (err instanceof ESocialError) {
    const typed = formatESocialError(err);
    reply.code(err.status >= 400 && err.status < 500 ? err.status : 502);
    return typed;
  }
  throw err;
}

export function registerGatewayRoutes(app) {
  // ── Health de gateways ─────────────────────────────────────────────────────
  // Retorna se cada gateway está em modo sandbox ou real (sem fazer chamadas reais).

  app.get('/v1/gateways/health', async () => {
    return {
      gateways: {
        sefaz: {
          mode: process.env.SEFAZ_PROVIDER ? 'real' : 'sandbox',
          cert_configured: !!(process.env.SEFAZ_CERT_PEM),
        },
        rfb: {
          mode: process.env.RFB_PROVIDER ? 'real' : 'sandbox',
          credentials_configured: !!(process.env.RFB_CNJ_LOGIN && process.env.RFB_CNJ_PASS),
        },
        esocial: {
          mode: process.env.ESOCIAL_PROVIDER ? 'real' : 'sandbox',
          credentials_configured: !!(process.env.ESOCIAL_CERT_PEM || process.env.ESOCIAL_CODIGO_ACESSO),
        },
      },
    };
  });

  // ── Trilha de auditoria ────────────────────────────────────────────────────

  app.get('/v1/gateways/audit', async (req) => {
    const limit = Math.min(Number(req.query?.limit) || 50, 200);
    const { rows } = await pool.query(
      `SELECT id, gateway, method, endpoint, response_status, duration_ms, attempts, user_id, error_code, logged_at
       FROM gateway_audit_log ORDER BY logged_at DESC LIMIT $1`,
      [limit],
    );
    return { data: rows, count: rows.length };
  });

  // ── SEFAZ: consulta de autorização ─────────────────────────────────────────

  app.post('/v1/gateways/sefaz/consultar', async (req, reply) => {
    const { chave_acesso } = req.body || {};
    if (!chave_acesso) { reply.code(400); return { error: 'chave_acesso é obrigatório' }; }
    const gw = createSefazGateway();
    try {
      const result = await gw.consultar(chave_acesso, { userId: req.user });
      return result;
    } catch (err) { return handleGatewayError(reply, err); }
  });

  // ── SEFAZ: inutilização ────────────────────────────────────────────────────

  app.post('/v1/gateways/sefaz/inutilizar', async (req, reply) => {
    const { serie, n_nf_ini, n_nf_fin, justificativa } = req.body || {};
    if (!serie || !n_nf_ini || !n_nf_fin) { reply.code(400); return { error: 'serie, n_nf_ini e n_nf_fin são obrigatórios' }; }
    const gw = createSefazGateway();
    try {
      const result = await gw.inutilizar(serie, n_nf_ini, n_nf_fin, justificativa, { userId: req.user });
      return result;
    } catch (err) { return handleGatewayError(reply, err); }
  });

  // ── SEFAZ: cancelamento (gateway layer — complementa nf.js que atualiza o DB) ─────

  app.post('/v1/gateways/sefaz/cancelar', async (req, reply) => {
    const { chave_acesso, justificativa } = req.body || {};
    if (!chave_acesso || !justificativa) { reply.code(400); return { error: 'chave_acesso e justificativa são obrigatórios' }; }
    const gw = createSefazGateway();
    try {
      const result = await gw.cancelar(chave_acesso, justificativa, { userId: req.user });
      return result;
    } catch (err) { return handleGatewayError(reply, err); }
  });

  // ── RFB: consulta cadastral ────────────────────────────────────────────────

  app.get('/v1/gateways/rfb/cadastral/:cnpj', async (req, reply) => {
    const { cnpj } = req.params;
    const gw = createRfbGateway();
    try {
      const result = await gw.consultarCadastral(cnpj, { userId: req.user });
      return result;
    } catch (err) { return handleGatewayError(reply, err); }
  });

  // ── RFB: submissão de documento ────────────────────────────────────────────

  app.post('/v1/gateways/rfb/documentos', async (req, reply) => {
    const doc = req.body || {};
    if (!doc.tipo) { reply.code(400); return { error: 'tipo do documento é obrigatório' }; }
    const gw = createRfbGateway();
    try {
      const result = await gw.submeterDocumento(doc, { userId: req.user });
      return result;
    } catch (err) { return handleGatewayError(reply, err); }
  });

  // ── RFB: downloads (Malha Fina, etc.) ─────────────────────────────────────

  app.get('/v1/gateways/rfb/downloads', async (req, reply) => {
    const gw = createRfbGateway();
    try {
      const result = await gw.listarDownloads({ userId: req.user });
      return result;
    } catch (err) { return handleGatewayError(reply, err); }
  });

  // ── e-Social: envio de evento ──────────────────────────────────────────────

  app.post('/v1/gateways/esocial/eventos', async (req, reply) => {
    const { tipo, payload } = req.body || {};
    if (!tipo) { reply.code(400); return { error: `tipo é obrigatório. Valores válidos: ${TIPOS_VALIDOS.join(', ')}` }; }
    const gw = createESocialGateway();
    try {
      const result = await gw.enviarEvento(tipo, payload || {}, { userId: req.user });
      reply.code(202);
      return result;
    } catch (err) { return handleGatewayError(reply, err); }
  });

  // ── e-Social: consulta de evento ───────────────────────────────────────────

  app.get('/v1/gateways/esocial/eventos/:eventoId', async (req, reply) => {
    const { eventoId } = req.params;
    const gw = createESocialGateway();
    try {
      const result = await gw.consultarEvento(eventoId, { userId: req.user });
      return result;
    } catch (err) { return handleGatewayError(reply, err); }
  });
}
