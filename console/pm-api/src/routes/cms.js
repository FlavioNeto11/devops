// =============================================================================
// CMS — rotas AUTENTICADAS (editor do console). Montadas APOS authContext.
// Escopo por projeto via assertProjectAccess (admin = todos; member = atribuidos).
// Conteudo heterogeneo vive em `data jsonb`; `kind` validado contra SECTION_KINDS.
// =============================================================================
import { Router } from 'express';
import multer from 'multer';
import { query, withTx } from '../db/pool.js';
import { asyncH, buildPatch, notFound, invalid } from './_util.js';
import {
  assertProjectAccess,
  resolveProjectIdForPage,
  resolveProjectIdForSection,
} from '../auth.js';

const r = Router();

// Tipos de bloco aceitos. Genericos sao criaveis pelo editor sem mudar codigo.
const SECTION_KINDS = new Set([
  'hero',
  'rich-text',
  'section-heading',
  'card-grid',
  'feature-grid',
  'timeline',
  'accordion',
  'video-gallery',
  'materials',
  'palestras',
  'testimonials',
  'logos',
  'cta',
  'image',
  'lead-form',
  // específicos do rmambiental (semeados; precisam ser PATCHaveis sem "kind invalido")
  'stats',
  'gallery',
  'services-detail',
  'contact-form',
]);

const ALLOWED_MIME = new Set([
  // imagens
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  // documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'application/zip',
  // vídeo (limite próprio de 50 MB — ver VIDEO_MAX/DEFAULT_MAX abaixo)
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

// Limites por tipo: vídeo até 50 MB; demais (imagem/doc) até 8 MB. O multer
// corta no teto global (50 MB, memoryStorage); o cap por mime roda no handler.
// Atenção: 50 MB em memória + cópia no driver pg cabe no limit de 256Mi do pod
// para uso single-user; uploads de vídeo simultâneos podem estourar (lab).
const VIDEO_MAX = 50 * 1024 * 1024;
const DEFAULT_MAX = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX },
});

// ---------------------------------------------------------------- site config
r.get('/projects/:projectId/cms/site', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;
  const { rows } = await query('SELECT data FROM cms_site WHERE project_id = $1', [req.params.projectId]);
  res.json({ data: rows[0]?.data ?? {} });
}));

r.put('/projects/:projectId/cms/site', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;
  const data = req.body?.data ?? req.body ?? {};
  const { rows } = await query(
    `INSERT INTO cms_site (project_id, data) VALUES ($1, $2)
     ON CONFLICT (project_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING data`,
    [req.params.projectId, data],
  );
  res.json({ data: rows[0].data });
}));

// ---------------------------------------------------------------- pages
r.get('/projects/:projectId/cms/pages', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;
  const { rows } = await query(
    'SELECT * FROM cms_pages WHERE project_id = $1 ORDER BY position, created_at',
    [req.params.projectId],
  );
  res.json({ data: rows });
}));

r.post('/projects/:projectId/cms/pages', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;
  const b = req.body || {};
  if (!b.slug || !b.title) return invalid(res, 'slug e title sao obrigatorios');
  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM cms_pages WHERE project_id = $1',
    [req.params.projectId],
  );
  const { rows } = await query(
    `INSERT INTO cms_pages (project_id, slug, title, position, status)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'draft')::cms_status) RETURNING *`,
    [req.params.projectId, b.slug, b.title, maxRows[0].pos, b.status],
  );
  res.status(201).json({ data: rows[0] });
}));

r.patch('/cms/pages/:pageId', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, await resolveProjectIdForPage(req.params.pageId)))) return;
  const { sets, values } = buildPatch(req.body || {}, ['slug', 'title', 'position', 'status']);
  if (!sets.length) return invalid(res, 'nada a atualizar');
  values.push(req.params.pageId);
  const { rows } = await query(
    `UPDATE cms_pages SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows.length) return notFound(res, 'pagina');
  res.json({ data: rows[0] });
}));

r.delete('/cms/pages/:pageId', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, await resolveProjectIdForPage(req.params.pageId)))) return;
  const { rowCount } = await query('DELETE FROM cms_pages WHERE id = $1', [req.params.pageId]);
  if (!rowCount) return notFound(res, 'pagina');
  res.status(204).end();
}));

// ---------------------------------------------------------------- sections
// Editor ve TODAS as secoes (draft + published).
r.get('/cms/pages/:pageId/sections', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, await resolveProjectIdForPage(req.params.pageId)))) return;
  const { rows } = await query(
    'SELECT * FROM cms_sections WHERE page_id = $1 ORDER BY position, created_at',
    [req.params.pageId],
  );
  res.json({ data: rows });
}));

r.post('/cms/pages/:pageId/sections', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, await resolveProjectIdForPage(req.params.pageId)))) return;
  const b = req.body || {};
  if (!b.kind || !SECTION_KINDS.has(b.kind)) return invalid(res, 'kind invalido');
  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM cms_sections WHERE page_id = $1',
    [req.params.pageId],
  );
  const { rows } = await query(
    `INSERT INTO cms_sections (page_id, kind, anchor, position, data, status, visible)
     VALUES ($1, $2, $3, $4, COALESCE($5, '{}'::jsonb), COALESCE($6, 'draft')::cms_status, COALESCE($7, true))
     RETURNING *`,
    [req.params.pageId, b.kind, b.anchor ?? null, maxRows[0].pos, b.data ?? {}, b.status, b.visible],
  );
  res.status(201).json({ data: rows[0] });
}));

r.patch('/cms/sections/:sectionId', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, await resolveProjectIdForSection(req.params.sectionId)))) return;
  const b = req.body || {};
  if (b.kind !== undefined && !SECTION_KINDS.has(b.kind)) return invalid(res, 'kind invalido');
  const { sets, values } = buildPatch(b, ['kind', 'anchor', 'data', 'position', 'status', 'visible']);
  if (!sets.length) return invalid(res, 'nada a atualizar');
  values.push(req.params.sectionId);
  const { rows } = await query(
    `UPDATE cms_sections SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows.length) return notFound(res, 'secao');
  res.json({ data: rows[0] });
}));

r.delete('/cms/sections/:sectionId', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, await resolveProjectIdForSection(req.params.sectionId)))) return;
  const { rowCount } = await query('DELETE FROM cms_sections WHERE id = $1', [req.params.sectionId]);
  if (!rowCount) return notFound(res, 'secao');
  res.status(204).end();
}));

// Reordena todas as secoes de uma pagina (1 UPDATE de position por id).
r.put('/cms/pages/:pageId/sections/reorder', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, await resolveProjectIdForPage(req.params.pageId)))) return;
  const order = Array.isArray(req.body?.order) ? req.body.order : null;
  if (!order) return invalid(res, 'order (array de ids) e obrigatorio');
  await withTx(async (client) => {
    for (let i = 0; i < order.length; i += 1) {
      await client.query(
        'UPDATE cms_sections SET position = $1, updated_at = now() WHERE id = $2 AND page_id = $3',
        [i, order[i], req.params.pageId],
      );
    }
  });
  const { rows } = await query(
    'SELECT * FROM cms_sections WHERE page_id = $1 ORDER BY position, created_at',
    [req.params.pageId],
  );
  res.json({ data: rows });
}));

// ---------------------------------------------------------------- files
// Biblioteca em DOIS niveis: arquivos do PORTAL (scope=project) + biblioteca
// PUBLICA da plataforma (scope=global, project_id NULL, gerida por admin).
// ?scope=project | global | all (default all: o picker mostra tudo que o portal pode usar).
const fileUrl = (f) => ({ ...f, url: `/devops/api/cms/public/files/${f.id}` });

r.get('/projects/:projectId/cms/files', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;
  const scope = ['project', 'global', 'all'].includes(req.query.scope) ? req.query.scope : 'all';
  let sql;
  let params;
  if (scope === 'project') {
    sql = 'project_id = $1';
    params = [req.params.projectId];
  } else if (scope === 'global') {
    sql = `scope = 'global'`;
    params = [];
  } else {
    sql = `(project_id = $1 OR scope = 'global')`;
    params = [req.params.projectId];
  }
  const { rows } = await query(
    `SELECT id, filename, mime, size, scope, project_id, created_by, created_at
       FROM cms_files WHERE ${sql} ORDER BY created_at DESC`,
    params,
  );
  res.json({ data: rows.map(fileUrl) });
}));

r.post('/projects/:projectId/cms/files', upload.single('file'), asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;
  const f = req.file;
  if (!f) return invalid(res, 'arquivo (campo "file") e obrigatorio');
  if (!ALLOWED_MIME.has(f.mimetype)) return invalid(res, `tipo nao permitido: ${f.mimetype}`);
  const max = f.mimetype.startsWith('video/') ? VIDEO_MAX : DEFAULT_MAX;
  if (f.size > max) return invalid(res, `arquivo excede o limite de ${Math.round(max / 1024 / 1024)} MB para ${f.mimetype}`);
  // Upload na biblioteca publica e exclusivo de admin (afeta todos os portais).
  const wantGlobal = (req.body?.scope || 'project') === 'global';
  if (wantGlobal && !req.auth?.isAdmin) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'apenas administradores publicam na biblioteca publica' } });
  }
  const { rows } = await query(
    `INSERT INTO cms_files (project_id, scope, filename, mime, size, bytes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, filename, mime, size, scope, project_id, created_at`,
    [wantGlobal ? null : req.params.projectId, wantGlobal ? 'global' : 'project',
      f.originalname, f.mimetype, f.size, f.buffer, req.auth?.email || null],
  );
  res.status(201).json({ data: fileUrl(rows[0]) });
}));

r.delete('/cms/files/:fileId', asyncH(async (req, res) => {
  const { rows } = await query('SELECT scope, project_id FROM cms_files WHERE id = $1', [req.params.fileId]);
  if (!rows.length) return notFound(res, 'arquivo');
  if (rows[0].scope === 'global') {
    // arquivo da biblioteca publica: so admin exclui (pode estar em uso por N portais)
    if (!req.auth?.isAdmin) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'apenas administradores excluem arquivos da biblioteca publica' } });
    }
  } else if (!(await assertProjectAccess(req, res, rows[0].project_id))) return;
  const { rowCount } = await query('DELETE FROM cms_files WHERE id = $1', [req.params.fileId]);
  if (!rowCount) return notFound(res, 'arquivo');
  res.status(204).end();
}));

export default r;
