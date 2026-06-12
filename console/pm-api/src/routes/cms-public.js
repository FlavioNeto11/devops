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

// Arvore de conteudo publicada de um portal. Alem de published/visible, o
// PROJETO precisa estar aprovado (portal criado por member fica pending ate o
// dono/admin aprovar — rascunho nunca vaza para o publico).
r.get('/public/:projectKey', async (req, res, next) => {
  try {
    const projectId = await resolveProjectIdByKey(req.params.projectKey);
    if (!projectId) return notFound(res, 'portal');

    const approved = await query(
      "SELECT 1 FROM projects WHERE id = $1 AND approval_status = 'approved'", [projectId],
    );
    if (!approved.rowCount) return notFound(res, 'portal');

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

// Serve um arquivo (imagem/PDF/vídeo) por id, com o content-type correto.
// Suporta HTTP Range simples (single range) — necessário para <video> fazer
// seek e para o Safari reproduzir vídeo (ele exige 206).
r.get('/public/files/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT mime, bytes FROM cms_files WHERE id = $1', [req.params.id]);
    if (!rows.length) return notFound(res, 'arquivo');
    const buf = rows[0].bytes;
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Accept-Ranges', 'bytes');

    const range = req.headers.range;
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] || m[2])) {
      const size = buf.length;
      let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10); // bytes=a-b | bytes=-suffix
      let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start) || start < 0) start = 0;
      if (Number.isNaN(end) || end >= size) end = size - 1;
      if (start > end || start >= size) {
        res.status(416).set('Content-Range', `bytes */${size}`).end();
        return;
      }
      res.status(206);
      res.set('Content-Range', `bytes ${start}-${end}/${size}`);
      res.set('Content-Length', String(end - start + 1));
      res.end(buf.subarray(start, end + 1));
      return;
    }
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

export default r;
