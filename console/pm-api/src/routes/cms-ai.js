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
import { asyncH, invalid, notFound } from './_util.js';
import { assertProjectAccess, resolveProjectIdForSection } from '../auth.js';
import { aiEnabled, generatePortalDraft, aiEditSection, aiEditSite } from '../ai/generate.js';

const r = Router();

const aiUnavailable = (res) => res.status(503).json({
  error: { code: 'AI_UNAVAILABLE', message: 'IA nao configurada (defina OPENAI_API_KEY no Secret do pm-api).' },
});

/**
 * Contexto que acompanha TODA edição por IA: identidade do site, resumo das
 * páginas/seções (kinds + amostra do conteúdo) e os pedidos ORIGINAIS do dono
 * (prompts de geração) — a IA mantém tom/segmento coerentes com o site inteiro.
 */
async function buildSiteContext(projectId) {
  const [proj, site, pages, gens] = await Promise.all([
    query('SELECT key, name, description FROM projects WHERE id = $1', [projectId]),
    query('SELECT data FROM cms_site WHERE project_id = $1', [projectId]),
    query(
      `SELECT p.slug, p.title, s.kind, s.data
         FROM cms_pages p LEFT JOIN cms_sections s ON s.page_id = p.id
        WHERE p.project_id = $1 ORDER BY p.position, s.position`,
      [projectId],
    ),
    query(
      `SELECT prompt FROM cms_generation_requests
        WHERE project_id = $1 AND kind = 'portal' ORDER BY created_at ASC LIMIT 3`,
      [projectId],
    ),
  ]);
  const byPage = new Map();
  for (const row of pages.rows) {
    if (!byPage.has(row.slug)) byPage.set(row.slug, { title: row.title, kinds: [] });
    if (row.kind) byPage.get(row.slug).kinds.push(`${row.kind}: ${JSON.stringify(row.data).slice(0, 160)}`);
  }
  const p = proj.rows[0] || {};
  return [
    `Portal: ${p.name} (${p.key})${p.description ? ` — ${p.description}` : ''}`,
    `Identidade do site: ${JSON.stringify(site.rows[0]?.data || {}).slice(0, 1200)}`,
    gens.rows.length ? `Pedidos originais do dono (criação do site):\n${gens.rows.map((g) => `- ${g.prompt.slice(0, 400)}`).join('\n')}` : null,
    'Páginas e seções:',
    ...[...byPage.entries()].map(([slug, pg]) => `# ${slug} (${pg.title})\n${pg.kinds.map((k) => `  - ${k}`).join('\n')}`),
  ].filter(Boolean).join('\n').slice(0, 9000);
}

async function logGeneration(projectId, kind, prompt, context, status, result, error, email) {
  await query(
    `INSERT INTO cms_generation_requests (project_id, kind, prompt, context, status, result, error, created_by)
     VALUES ($1, $2, $3, $4, $5::cms_generation_status, $6, $7, $8)`,
    [projectId, kind, prompt, context || {}, status, result ? JSON.stringify(result) : null, error || null, email || null],
  );
}

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

// ---------------------------------------------------------------------------
// ✨ Edição assistida de UMA seção: reescreve o data conforme a instrução,
// preservando kind/shape. O contexto leva o site INTEIRO + prompts originais.
r.post('/cms/sections/:sectionId/ai', asyncH(async (req, res) => {
  const projectId = await resolveProjectIdForSection(req.params.sectionId);
  if (!(await assertProjectAccess(req, res, projectId))) return;
  const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : '';
  if (!instruction) return invalid(res, 'instruction e obrigatoria');
  if (!aiEnabled()) return aiUnavailable(res);

  const { rows } = await query('SELECT id, kind, data FROM cms_sections WHERE id = $1', [req.params.sectionId]);
  if (!rows.length) return notFound(res, 'secao');
  const sec = rows[0];

  let next;
  try {
    next = await aiEditSection({ instruction, kind: sec.kind, data: sec.data, context: await buildSiteContext(projectId) });
  } catch (e) {
    await logGeneration(projectId, 'section', instruction, { sectionId: sec.id, kind: sec.kind }, 'failed', null, String(e.message).slice(0, 500), req.auth?.email);
    return res.status(502).json({ error: { code: 'AI_FAILED', message: `edicao falhou: ${e.message}` } });
  }
  await query(
    `UPDATE cms_sections SET data = $2, generated_by = 'ai', updated_at = now() WHERE id = $1`,
    [sec.id, next],
  );
  await logGeneration(projectId, 'section', instruction, { sectionId: sec.id, kind: sec.kind }, 'done', { data: next }, null, req.auth?.email);
  res.json({ data: next });
}));

// ✨ Edição assistida do SITE (header/rodapé/identidade/paleta/contato):
// a instrução é intenção explícita do usuário → os campos retornados SOBRESCREVEM.
r.post('/projects/:projectId/cms/site/ai', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;
  const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : '';
  if (!instruction) return invalid(res, 'instruction e obrigatoria');
  if (!aiEnabled()) return aiUnavailable(res);

  const cur = await query('SELECT data FROM cms_site WHERE project_id = $1', [req.params.projectId]);
  let fields;
  try {
    fields = await aiEditSite({ instruction, site: cur.rows[0]?.data || {}, context: await buildSiteContext(req.params.projectId) });
  } catch (e) {
    await logGeneration(req.params.projectId, 'site', instruction, {}, 'failed', null, String(e.message).slice(0, 500), req.auth?.email);
    return res.status(502).json({ error: { code: 'AI_FAILED', message: `edicao falhou: ${e.message}` } });
  }
  const { rows } = await query(
    `INSERT INTO cms_site (project_id, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (project_id) DO UPDATE SET data = (cms_site.data || $2::jsonb), updated_at = now()
     RETURNING data`,
    [req.params.projectId, JSON.stringify(fields)],
  );
  await logGeneration(req.params.projectId, 'site', instruction, {}, 'done', { site: fields }, null, req.auth?.email);
  res.json({ data: rows[0].data });
}));

export default r;
