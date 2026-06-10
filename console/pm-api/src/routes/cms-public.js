// =============================================================================
// CMS — leitura PUBLICA (consumida pelos portais). Montada ANTES de authContext:
// estruturalmente sem auth. SOMENTE leitura, SOMENTE conteudo publicado, escopada
// por projeto (resolvido pelo `key`). Nunca expoe draft/oculto nem outro projeto.
// A IngressRoute /devops/api/cms remove o prefixo -> pm-api ve /public/...
// =============================================================================
import { Router } from 'express';
import { query } from '../db/pool.js';
import { resolveProjectIdByKey } from '../auth.js';
import { notFound } from './_util.js';

const r = Router();

// Arvore de conteudo publicada de um portal.
r.get('/public/:projectKey', async (req, res, next) => {
  try {
    const projectId = await resolveProjectIdByKey(req.params.projectKey);
    if (!projectId) return notFound(res, 'portal');

    const [{ rows: projRows }, { rows: siteRows }, { rows: pages }] = await Promise.all([
      query('SELECT key, name FROM projects WHERE id = $1', [projectId]),
      query('SELECT data FROM cms_site WHERE project_id = $1', [projectId]),
      query(
        "SELECT id, slug, title FROM cms_pages WHERE project_id = $1 AND status = 'published' ORDER BY position, created_at",
        [projectId],
      ),
    ]);

    const pageIds = pages.map((p) => p.id);
    let sections = [];
    if (pageIds.length) {
      const { rows } = await query(
        `SELECT id, page_id, kind, anchor, data FROM cms_sections
          WHERE page_id = ANY($1) AND status = 'published' AND visible = true
          ORDER BY position, created_at`,
        [pageIds],
      );
      sections = rows;
    }
    const byPage = new Map(pageIds.map((id) => [id, []]));
    for (const s of sections) {
      byPage.get(s.page_id)?.push({ id: s.id, kind: s.kind, anchor: s.anchor, data: s.data });
    }

    res.set('Cache-Control', 'public, max-age=30');
    res.json({
      data: {
        project: projRows[0] || { key: req.params.projectKey },
        site: siteRows[0]?.data ?? {},
        pages: pages.map((p) => ({ slug: p.slug, title: p.title, sections: byPage.get(p.id) || [] })),
      },
    });
  } catch (e) {
    next(e);
  }
});

// Serve um arquivo (imagem/PDF) por id, com o content-type correto.
r.get('/public/files/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT mime, bytes FROM cms_files WHERE id = $1', [req.params.id]);
    if (!rows.length) return notFound(res, 'arquivo');
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].bytes);
  } catch (e) {
    next(e);
  }
});

export default r;
