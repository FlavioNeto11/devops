// =============================================================================
// CMS — geração assistida por IA (autenticada; escopo por projeto).
// Fluxo: cria uma cms_generation_request (prompt/template/contexto salvos para
// rastreabilidade), chama o provider e materializa o resultado como RASCUNHO
// (pages/sections status=draft, generated_by='ai'). Nunca sobrescreve seção
// existente — regenerar adiciona novos rascunhos; ajustes manuais ficam intactos.
// Sem OPENAI_API_KEY (ou AI_ENABLED=false) a rota degrada graciosamente (503),
// e o CMS segue 100% funcional sem IA.
// =============================================================================
import { Router } from 'express';
import { query, withTx } from '../db/pool.js';
import { asyncH, invalid } from './_util.js';
import { assertProjectAccess } from '../auth.js';
import { aiEnabled, generatePortalDraft } from '../ai/generate.js';

const r = Router();

// Lista pedidos de geração do projeto (auditoria/rastreabilidade).
r.get('/projects/:projectId/cms/generations', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;
  const { rows } = await query(
    `SELECT id, kind, prompt, template, status, error, created_by, created_at, updated_at
       FROM cms_generation_requests WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.params.projectId],
  );
  res.json({ data: rows });
}));

// Gera conteúdo inicial do portal a partir de um prompt (síncrono, timeout curto).
r.post('/projects/:projectId/cms/generate', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;
  const b = req.body || {};
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (!prompt) return invalid(res, 'prompt e obrigatorio');

  const insert = await query(
    `INSERT INTO cms_generation_requests (project_id, kind, prompt, template, context, status, created_by)
     VALUES ($1, COALESCE($2, 'portal'), $3, $4, COALESCE($5, '{}'::jsonb), $6::cms_generation_status, $7)
     RETURNING id`,
    [req.params.projectId, b.kind, prompt, b.template || null, b.context || {},
      aiEnabled() ? 'queued' : 'unavailable', req.auth?.email || null],
  );
  const genId = insert.rows[0].id;

  if (!aiEnabled()) {
    return res.status(503).json({
      error: { code: 'AI_UNAVAILABLE', message: 'IA nao configurada (defina OPENAI_API_KEY no Secret do pm-api). O pedido foi registrado.' },
      data: { generationId: genId, status: 'unavailable' },
    });
  }

  await query(`UPDATE cms_generation_requests SET status = 'generating', updated_at = now() WHERE id = $1`, [genId]);
  let draft;
  try {
    const proj = await query('SELECT name FROM projects WHERE id = $1', [req.params.projectId]);
    draft = await generatePortalDraft({
      prompt,
      siteName: proj.rows[0]?.name,
      template: b.template || null,
      context: b.context || {},
    });
  } catch (e) {
    await query(
      `UPDATE cms_generation_requests SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [genId, String(e.message || e).slice(0, 500)],
    );
    return res.status(502).json({ error: { code: 'AI_FAILED', message: `geracao falhou: ${e.message}` }, data: { generationId: genId, status: 'failed' } });
  }

  // Materializa o portal completo. Criador ADMIN → conteúdo nasce PUBLICADO
  // (portal pronto e visível em /sites/<chave>); member → rascunho (revisão +
  // aprovação do dono). Páginas existentes (mesmo slug) recebem as seções
  // geradas no fim; o hero gerado entra como PRIMEIRA seção da página.
  const publish = req.auth?.isAdmin ? 'published' : 'draft';
  const created = { pages: 0, sections: 0 };
  await withTx(async (client) => {
    for (const page of draft.pages) {
      const existing = await client.query(
        'SELECT id FROM cms_pages WHERE project_id = $1 AND slug = $2', [req.params.projectId, page.slug],
      );
      let pageId = existing.rows[0]?.id;
      if (!pageId) {
        const pos = await client.query(
          'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM cms_pages WHERE project_id = $1', [req.params.projectId],
        );
        const ins = await client.query(
          `INSERT INTO cms_pages (project_id, slug, title, position, status)
           VALUES ($1, $2, $3, $4, $5::cms_status) RETURNING id`,
          [req.params.projectId, page.slug, page.title, pos.rows[0].pos, publish],
        );
        pageId = ins.rows[0].id;
        created.pages += 1;
      } else if (publish === 'published') {
        await client.query(
          `UPDATE cms_pages SET status = 'published', updated_at = now() WHERE id = $1`, [pageId],
        );
      }
      for (const s of page.sections) {
        // hero abre a página (position -1 reordena via posição mínima atual)
        let position;
        if (s.kind === 'hero') {
          const min = await client.query('SELECT COALESCE(MIN(position), 1) - 1 AS pos FROM cms_sections WHERE page_id = $1', [pageId]);
          position = min.rows[0].pos;
        } else {
          const max = await client.query('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM cms_sections WHERE page_id = $1', [pageId]);
          position = max.rows[0].pos;
        }
        await client.query(
          `INSERT INTO cms_sections (page_id, kind, position, data, status, visible, generated_by, generation_id)
           VALUES ($1, $2, $3, $4, $5::cms_status, true, 'ai', $6)`,
          [pageId, s.kind, position, s.data, publish, genId],
        );
        created.sections += 1;
      }
    }
    // Identidade do site (nome/tagline/descrição) + paleta: o GERADO preenche
    // lacunas, mas NUNCA sobrescreve o que o usuário já configurou (existente
    // vence no merge jsonb: generated || data).
    const siteFields = { ...(draft.site || {}) };
    if (draft.palette && (draft.palette.primary || draft.palette.accent)) {
      siteFields.palette = draft.palette;
      siteFields.aiPalette = draft.palette; // rastreio do que veio da IA
    }
    Object.keys(siteFields).forEach((k) => siteFields[k] === undefined && delete siteFields[k]);
    if (Object.keys(siteFields).length) {
      await client.query(
        `INSERT INTO cms_site (project_id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (project_id) DO UPDATE
           SET data = ($2::jsonb || cms_site.data), updated_at = now()`,
        [req.params.projectId, JSON.stringify(siteFields)],
      );
    }
    await client.query(
      `UPDATE cms_generation_requests SET status = 'done', result = $2, updated_at = now() WHERE id = $1`,
      [genId, JSON.stringify(draft)],
    );
  });

  res.status(201).json({ data: { generationId: genId, status: 'done', published: publish === 'published', created } });
}));

export default r;
