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
import { ingest } from '@flavioneto11/file-ingest-kit';
import { setSseHeaders, startSseKeepAlive, writeFrame } from '../sse.js';

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

// Materializa o draft gerado (páginas/seções/identidade). Criador ADMIN → PUBLICADO;
// member → rascunho. Páginas existentes (mesmo slug) recebem as seções no fim; hero abre a página.
// O GERADO preenche lacunas da identidade mas NUNCA sobrescreve o que o usuário já configurou.
// Compartilhado por /generate e /generate-from-files.
async function persistGeneratedDraft({ projectId, genId, draft, publish }) {
  const created = { pages: 0, sections: 0 };
  await withTx(async (client) => {
    for (const page of draft.pages) {
      const existing = await client.query(
        'SELECT id FROM cms_pages WHERE project_id = $1 AND slug = $2', [projectId, page.slug],
      );
      let pageId = existing.rows[0]?.id;
      if (!pageId) {
        const pos = await client.query(
          'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM cms_pages WHERE project_id = $1', [projectId],
        );
        const ins = await client.query(
          `INSERT INTO cms_pages (project_id, slug, title, position, status)
           VALUES ($1, $2, $3, $4, $5::cms_status) RETURNING id`,
          [projectId, page.slug, page.title, pos.rows[0].pos, publish],
        );
        pageId = ins.rows[0].id;
        created.pages += 1;
      } else if (publish === 'published') {
        await client.query(
          `UPDATE cms_pages SET status = 'published', updated_at = now() WHERE id = $1`, [pageId],
        );
      }
      for (const s of page.sections) {
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
        [projectId, JSON.stringify(siteFields)],
      );
    }
    await client.query(
      `UPDATE cms_generation_requests SET status = 'done', result = $2, updated_at = now() WHERE id = $1`,
      [genId, JSON.stringify(draft)],
    );
  });
  return created;
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
  const created = await persistGeneratedDraft({ projectId: req.params.projectId, genId, draft, publish });
  res.status(201).json({ data: { generationId: genId, status: 'done', published: publish === 'published', created } });
}));

// Gera o portal a partir de ARQUIVOS já enviados (reusa cms_files). Body JSON:
// { fileIds:[...], prompt?, template?, context? }. A ingestão extrai TEXTO + blocos
// (imagem/PDF); o prompt do dono é OPCIONAL — os arquivos são a entrada principal.
// Mesma materialização/saída de /generate (helper compartilhado). Sem chave → 503.
r.post('/projects/:projectId/cms/generate-from-files', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;
  const b = req.body || {};
  const fileIds = Array.isArray(b.fileIds) ? b.fileIds.filter((x) => typeof x === 'string' && x).slice(0, 20) : [];
  const userPrompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (!fileIds.length) return invalid(res, 'fileIds (array) e obrigatorio');

  // Carrega os bytes dos arquivos do projeto (ou biblioteca global) e ingere.
  const { rows: files } = await query(
    `SELECT filename, mime, bytes FROM cms_files
      WHERE id = ANY($1::uuid[]) AND (project_id = $2 OR scope = 'global')`,
    [fileIds, req.params.projectId],
  );
  if (!files.length) return invalid(res, 'nenhum arquivo encontrado para os fileIds informados');
  const ingested = await ingest(files.map((f) => ({ filename: f.filename, mime: f.mime, bytes: f.bytes })));

  // prompt = pedido do dono (se houver) + conteúdo extraído dos arquivos.
  const promptParts = [];
  if (userPrompt) promptParts.push(userPrompt);
  promptParts.push('Construa o portal a partir do CONTEÚDO dos arquivos enviados (use estrutura, textos e dados como base do site):');
  for (const tp of ingested.textParts) promptParts.push(`### ${tp.name}${tp.truncated ? ' (truncado)' : ''}\n${tp.text}`);
  if (ingested.notes.length) promptParts.push(`Notas de ingestão: ${ingested.notes.join(' ')}`);
  const prompt = promptParts.join('\n\n').slice(0, 60000);

  // manifesto (NUNCA os bytes) no context p/ rastreabilidade/auditoria.
  const ctx = { ...(b.context || {}), ingest: { manifest: ingested.manifest, notes: ingested.notes, images: ingested.blocks.filter((x) => x.type === 'image').length } };

  const insert = await query(
    `INSERT INTO cms_generation_requests (project_id, kind, prompt, template, context, status, created_by)
     VALUES ($1, 'portal', $2, $3, $4::jsonb, $5::cms_generation_status, $6) RETURNING id`,
    [req.params.projectId, prompt, b.template || null, JSON.stringify(ctx), aiEnabled() ? 'queued' : 'unavailable', req.auth?.email || null],
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
      blocks: ingested.blocks,
    });
  } catch (e) {
    await query(`UPDATE cms_generation_requests SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [genId, String(e.message || e).slice(0, 500)]);
    return res.status(502).json({ error: { code: 'AI_FAILED', message: `geracao falhou: ${e.message}` }, data: { generationId: genId, status: 'failed' } });
  }

  const publish = req.auth?.isAdmin ? 'published' : 'draft';
  const created = await persistGeneratedDraft({ projectId: req.params.projectId, genId, draft, publish });
  res.status(201).json({ data: { generationId: genId, status: 'done', published: publish === 'published', created, manifest: ingested.manifest } });
}));

// ---------------------------------------------------------------------------
// Geração AO VIVO (SSE): mesma lógica de /generate(-from-files), porém TRANSMITINDO as etapas
// (ingest → IA → validação → persistência → publicação) ao cliente em tempo real (fetch-reader no
// front). O modal não congela e mostra tudo de forma transparente. Body JSON: { prompt?, fileIds?,
// template?, context? }. Precisa de prompt OU fileIds. Fail-soft: erro vira evento `error` (não 500).
// IMPORTANTE infra: esta rota NÃO pode passar pelo middleware `compress` do Traefik (ver IngressRoute).
r.post('/projects/:projectId/cms/generate-stream', asyncH(async (req, res) => {
  if (!(await assertProjectAccess(req, res, req.params.projectId))) return;       // 403 normal
  const b = req.body || {};
  const userPrompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  const fileIds = Array.isArray(b.fileIds) ? b.fileIds.filter((x) => typeof x === 'string' && x).slice(0, 20) : [];
  if (!userPrompt && !fileIds.length) return invalid(res, 'prompt ou fileIds e obrigatorio');
  if (!aiEnabled()) return aiUnavailable(res);                                    // 503 JSON normal ANTES do SSE

  setSseHeaders(res);
  const keepAlive = startSseKeepAlive(res);
  const ctrl = new AbortController();
  let done = false;
  let genId = null;
  const markFailed = (msg) => { if (genId) query(`UPDATE cms_generation_requests SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [genId, String(msg).slice(0, 500)]).catch(() => {}); };
  const cleanup = () => { clearInterval(keepAlive); if (!done) { done = true; ctrl.abort(); markFailed('cliente desconectou'); } };
  req.on('close', cleanup); req.on('aborted', cleanup); res.on('error', cleanup);

  try {
    const proj = await query('SELECT name, key FROM projects WHERE id = $1', [req.params.projectId]);
    const siteName = proj.rows[0]?.name;
    const key = proj.rows[0]?.key;
    writeFrame(res, 'hello', { at: new Date().toISOString(), siteName });

    // 1) Ingestão (se houver arquivos): mostra os arquivos sendo lidos.
    let prompt = userPrompt;
    let blocks = [];
    const ctx = (b.context && typeof b.context === 'object') ? { ...b.context } : {};
    if (fileIds.length) {
      const { rows: files } = await query(
        `SELECT filename, mime, bytes FROM cms_files WHERE id = ANY($1::uuid[]) AND (project_id = $2 OR scope = 'global')`,
        [fileIds, req.params.projectId],
      );
      if (!files.length) { writeFrame(res, 'error', { stage: 'ingest', code: 'NO_FILES', message: 'nenhum arquivo encontrado para os fileIds informados' }); done = true; return res.end(); }
      writeFrame(res, 'ingest-start', { count: files.length, files: files.map((f) => ({ name: f.filename, mime: f.mime, size: f.bytes ? f.bytes.length : 0 })) });
      const ingested = await ingest(files.map((f) => ({ filename: f.filename, mime: f.mime, bytes: f.bytes })));
      const parts = [];
      if (userPrompt) parts.push(userPrompt);
      parts.push('Construa o portal a partir do CONTEÚDO dos arquivos enviados (use estrutura, textos e dados como base do site):');
      for (const tp of ingested.textParts) parts.push(`### ${tp.name}${tp.truncated ? ' (truncado)' : ''}\n${tp.text}`);
      if (ingested.notes.length) parts.push(`Notas de ingestão: ${ingested.notes.join(' ')}`);
      prompt = parts.join('\n\n').slice(0, 60000);
      blocks = ingested.blocks;
      const imageCount = ingested.blocks.filter((x) => x.type === 'image').length;
      ctx.ingest = { manifest: ingested.manifest, notes: ingested.notes, images: imageCount };
      writeFrame(res, 'ingest-done', { textParts: ingested.textParts.length, images: imageCount, blocks: ingested.blocks.length, notes: ingested.notes });
    }

    // 2) request de geração (rastreabilidade) — já em 'generating'.
    const insert = await query(
      `INSERT INTO cms_generation_requests (project_id, kind, prompt, template, context, status, created_by)
       VALUES ($1, 'portal', $2, $3, $4::jsonb, 'generating'::cms_generation_status, $5) RETURNING id`,
      [req.params.projectId, prompt, b.template || null, JSON.stringify(ctx), req.auth?.email || null],
    );
    genId = insert.rows[0].id;

    // 3) IA — emite ai-start/ai-done/validate via onProgress; cancelável pelo signal.
    let draft;
    try {
      draft = await generatePortalDraft({
        prompt, siteName, template: b.template || null, context: b.context || {}, blocks,
        signal: ctrl.signal,
        onProgress: (event, data) => writeFrame(res, event, data),
      });
    } catch (e) {
      markFailed(e.message || e);
      writeFrame(res, 'error', { stage: 'ai', code: 'AI_FAILED', message: String(e.message || e).slice(0, 300) });
      done = true; return res.end();
    }

    // 4) persistência + publicação (admin → published; member → draft).
    const publish = req.auth?.isAdmin ? 'published' : 'draft';
    const created = await persistGeneratedDraft({ projectId: req.params.projectId, genId, draft, publish });
    writeFrame(res, 'persist', { created, published: publish === 'published' });
    writeFrame(res, 'done', { generationId: genId, key, url: key ? `/sites/${key}` : null, published: publish === 'published', created });
    done = true;
    res.end();
  } catch (e) {
    markFailed(e.message || e);
    writeFrame(res, 'error', { stage: 'server', code: 'SERVER', message: String(e.message || e).slice(0, 300) });
    done = true;
    try { res.end(); } catch { /* já fechado */ }
  } finally {
    clearInterval(keepAlive);
  }
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
