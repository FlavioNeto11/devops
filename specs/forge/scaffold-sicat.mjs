// =============================================================================
// scaffold-sicat.mjs — GERA um app SICAT-style DEPLOYÁVEL a partir dos blocos de
// capacidade resolvidos de um produto (specs/products/<name>/product.json). A Forge
// gera a FUNDAÇÃO + observabilidade + (se os blocos pedem) fila transacional + gateway
// externo + idempotência — sem implementação manual. A LÓGICA de domínio específica
// vem depois (esteira/Claude pelo work-order com capability_guidance, ou edição).
//
// Reusa os padrões PROVADOS no FieldServe (apps/fieldserve), num recurso genérico "records".
//
// Uso:  node scaffold-sicat.mjs --product <name> [--force]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCatalog, resolveBlocks, catalogSourceSha } from './apply-capabilities.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPECS_DIR, '..');

function parseArgs(argv) { const a = {}; for (let i = 0; i < argv.length; i++) { if (argv[i] === '--product') a.product = argv[++i]; else if (argv[i] === '--force') a.force = true; } return a; }

const args = parseArgs(process.argv.slice(2));
if (!args.product) { console.error('uso: node scaffold-sicat.mjs --product <name> [--force]'); process.exit(2); }
const pp = path.join(SPECS_DIR, 'products', args.product, 'product.json');
if (!fs.existsSync(pp)) { console.error(`produto não encontrado: ${pp}`); process.exit(1); }
const product = JSON.parse(fs.readFileSync(pp, 'utf8'));
if ((product.stack || 'sicat') !== 'sicat') { console.error(`scaffold-sicat só gera stack sicat (produto é ${product.stack})`); process.exit(1); }

const byId = loadCatalog();
const blocks = resolveBlocks(product.capability_blocks || [], 'sicat', byId);
const has = (id) => blocks.includes(id);
// `ai`: assistente de IA de controle do app (bloco control-ai-por-app). Quando presente, o app NASCE
// com assistant-service + rota /v1/assistant que ACEITA ARQUIVOS (multimodal, fail-soft) + view (se web).
const F = { worker: has('worker-queue-transacional'), gateway: has('gateway-externo'), idem: has('idempotencia'), contract: has('contract-openapi'), ai: has('control-ai-por-app'), pgvector: has('rag-pgvector') };

// Vendoring (apps buildam em contexto Docker isolado e não alcançam packages/): os .tgz são copiados
// p/ apps/<app>/api/vendor/ ANTES do npm install (o Dockerfile COPY vendor). Fontes (em ordem de
// preferência): .vendor-cache/ (file-ingest-kit + ai-ingest-middleware) e packages/<kit>/<kit>.tgz
// (control-ai-kit). Determinístico: nomes fixos versionados.
const VENDOR_SOURCES = {
  'flavioneto11-file-ingest-kit-0.1.0.tgz': [path.join(REPO_ROOT, '.vendor-cache', 'flavioneto11-file-ingest-kit-0.1.0.tgz')],
  'flavioneto11-ai-ingest-middleware-0.1.0.tgz': [path.join(REPO_ROOT, '.vendor-cache', 'flavioneto11-ai-ingest-middleware-0.1.0.tgz')],
  'flavioneto11-control-ai-kit-0.1.0.tgz': [
    path.join(REPO_ROOT, '.vendor-cache', 'flavioneto11-control-ai-kit-0.1.0.tgz'),
    path.join(REPO_ROOT, 'packages', 'control-ai-kit', 'flavioneto11-control-ai-kit-0.1.0.tgz'),
    path.join(REPO_ROOT, 'apps', 'shopdesk', 'api', 'vendor', 'flavioneto11-control-ai-kit-0.1.0.tgz'),
  ],
};
// kits @flavioneto11/* que o bloco de IA vendora no app gerado (dep file:vendor/*).
const AI_VENDOR_TGZ = ['flavioneto11-file-ingest-kit-0.1.0.tgz', 'flavioneto11-ai-ingest-middleware-0.1.0.tgz', 'flavioneto11-control-ai-kit-0.1.0.tgz'];
// Auto-heal: se um .tgz não estiver em nenhuma origem, empacota do packages/ (npm pack -> .vendor-cache).
const PACK_FROM = {
  'flavioneto11-file-ingest-kit-0.1.0.tgz': 'packages/file-ingest-kit',
  'flavioneto11-ai-ingest-middleware-0.1.0.tgz': 'packages/ai-ingest-middleware',
  'flavioneto11-control-ai-kit-0.1.0.tgz': 'packages/control-ai-kit',
};

const APP = product.name;
const TITLE = product.display_name || APP;
const BASE = product.base_path || ('/' + APP);
const APPDIR = path.join(REPO_ROOT, 'apps', APP);

// ── builders dos arquivos (sem ${}; tokens @@APP@@/@@TITLE@@/@@BASE@@; código gerado usa concatenação) ──
const files = {};
const add = (rel, content) => { files[rel] = content; };

add('api/package.json', JSON.stringify({
  name: '@@APP@@-api', version: '1.0.0', private: true, type: 'module',
  description: '@@TITLE@@ — gerado pela Forge (SICAT-style robusto).',
  scripts: Object.assign({ start: 'node src/server.js', worker: 'node src/worker.js', test: 'node --test "test/**/*.test.mjs"' }, F.contract ? { 'validate:openapi': 'node openapi/validate.mjs' } : {}),
  dependencies: Object.assign(
    { express: '^4.19.2', pg: '^8.11.5', 'prom-client': '^15.1.2' },
    // bloco control-ai-por-app: IA de controle do app + ingestão de ARQUIVOS (multimodal). SDK Anthropic
    // (Claude) + kits vendorizados (file:vendor/*) + multer (upload) + extratores opcionais (pdf/docx/xls/zip).
    F.ai ? {
      '@anthropic-ai/sdk': '^0.32.1',
      '@flavioneto11/control-ai-kit': 'file:vendor/flavioneto11-control-ai-kit-0.1.0.tgz',
      '@flavioneto11/file-ingest-kit': 'file:vendor/flavioneto11-file-ingest-kit-0.1.0.tgz',
      '@flavioneto11/ai-ingest-middleware': 'file:vendor/flavioneto11-ai-ingest-middleware-0.1.0.tgz',
      multer: '^2.0.1',
      'pdf-parse': '^1.1.1',
      mammoth: '^1.8.0',
      xlsx: '^0.18.5',
      jszip: '^3.10.1',
    } : {},
  ),
}, null, 2) + '\n');

// bloco contract-openapi: contrato canônico + validador anti-drift (zero-dep, determinístico).
if (F.contract) {
  add('api/openapi/validate.mjs', fs.readFileSync(path.join(__dirname, 'templates', 'contract', 'validate.mjs'), 'utf8'));
  const routes = [['get', '/', 'root'], ['get', '/health', 'health'], ['get', '/me', 'me']]
    .concat(F.worker ? [['get', '/v1/health/jobs', 'healthJobs']] : [])
    .concat([['get', '/v1/records', 'listRecords'], ['get', '/v1/records/{id}', 'getRecord'], ['post', '/v1/records', 'createRecord']])
    .concat(F.worker ? [['post', '/v1/records/{id}/submit', 'submitRecord']] : [])
    // bloco control-ai-por-app: o assistente entra no contrato canônico (anti-drift bidirecional).
    .concat(F.ai ? [['post', '/v1/assistant', 'assistant'], ['get', '/v1/assistant/health', 'assistantHealth']] : []);
  // agrupa métodos por path (um bloco por path; GET+POST no MESMO /v1/records) — senão o YAML perde uma rota.
  const byPath = {};
  for (const [method, p, opId] of routes) { (byPath[p] = byPath[p] || []).push([method, opId]); }
  const oapi = ['openapi: 3.1.0', 'info: { title: "@@TITLE@@ API", version: "1.0.0" }', 'paths:'];
  for (const [p, methods] of Object.entries(byPath)) {
    oapi.push('  ' + p + ':');
    for (const [method, opId] of methods) {
      oapi.push('    ' + method + ':');
      oapi.push('      operationId: ' + opId);
      oapi.push('      responses: { "200": { description: ok } }');
    }
  }
  add('api/openapi/openapi.yaml', oapi.join('\n') + '\n');
}

add('api/Dockerfile', [
  '# @@TITLE@@ API' + (F.worker ? ' + worker (mesma imagem)' : '') + ' — gerado pela Forge.',
  'FROM node:20-alpine', 'WORKDIR /app', 'ENV NODE_ENV=production',
  'COPY package*.json ./',
  // vendor/ (kits @flavioneto11/* .tgz) ANTES do install p/ resolver as deps file:vendor/* (bloco de IA).
  ...(F.ai ? ['COPY vendor ./vendor'] : []),
  'RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi',
  'COPY src ./src', 'EXPOSE 8080 9464', 'USER node', 'CMD ["npm", "start"]', '',
].join('\n'));

// db.js — migrations (records + jobs/idempotency conforme blocos). Sem ${} (usa concatenação interna do pg).
const migrations = [
  "`CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', payload JSONB NOT NULL DEFAULT '{}'::jsonb, external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`",
];
if (F.worker) migrations.push(
  "`CREATE TABLE IF NOT EXISTS jobs (id BIGSERIAL PRIMARY KEY, type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','dlq')), attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 4, run_after TIMESTAMPTZ NOT NULL DEFAULT now(), locked_at TIMESTAMPTZ, locked_by TEXT, last_error TEXT, job_key TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()); CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (status, run_after) WHERE status='queued';`");
if (F.idem) migrations.push("`CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, response JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());`");
add('api/src/db.js', [
  "// db.js — pool + migrations versionadas (advisory-lock no boot) + seed. Gerado pela Forge.",
  "import pg from 'pg';",
  'export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });',
  'const MIGRATIONS = [' + migrations.join(',\n  ') + '];',
  'export async function migrate() {',
  '  const c = await pool.connect();',
  '  try {',
  '    await c.query(\'SELECT pg_advisory_lock(77131)\');',
  '    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);',
  "    const { rows } = await c.query('SELECT version FROM schema_migrations');",
  '    const done = new Set(rows.map((r) => r.version));',
  '    for (let i = 0; i < MIGRATIONS.length; i++) { const v = i + 1; if (done.has(v)) continue;',
  "      await c.query('BEGIN');",
  "      try { await c.query(MIGRATIONS[i]); await c.query('INSERT INTO schema_migrations(version) VALUES ($1)', [v]); await c.query('COMMIT'); }",
  "      catch (e) { await c.query('ROLLBACK'); throw e; }",
  "      console.log('[migrate] migration ' + v); }",
  "  } finally { await c.query('SELECT pg_advisory_unlock(77131)').catch(() => {}); c.release(); }",
  '}',
  'export async function seed() {',
  "  const { rows } = await pool.query('SELECT count(*)::int AS n FROM records');",
  '  if (rows[0].n > 0) return;',
  "  await pool.query(`INSERT INTO records(title) VALUES ('Registro de exemplo')`);",
  "  console.log('[seed] ok');",
  '}', '',
].join('\n'));

// metrics.js (observabilidade — sempre)
add('api/src/metrics.js', [
  '// metrics.js — observabilidade por padrão: métricas Prometheus na :9464. Gerado pela Forge.',
  "import http from 'node:http';",
  "import client from 'prom-client';",
  'const registry = new client.Registry();',
  "client.collectDefaultMetrics({ register: registry, prefix: '@@METRIC@@_' });",
  'export const M = {',
  "  recordsTotal: new client.Counter({ name: '@@METRIC@@_records_total', help: 'records por desfecho', labelNames: ['outcome'], registers: [registry] }),",
  (F.worker ? "  jobsTotal: new client.Counter({ name: '@@METRIC@@_jobs_total', help: 'jobs por status', labelNames: ['status'], registers: [registry] })," : ''),
  (F.worker ? "  jobDuration: new client.Histogram({ name: '@@METRIC@@_job_duration_seconds', help: 'duração do job', buckets: [0.05,0.1,0.3,1,3,10], registers: [registry] })," : ''),
  (F.gateway ? "  gatewayCalls: new client.Counter({ name: '@@METRIC@@_gateway_calls_total', help: 'chamadas ao gateway', labelNames: ['outcome'], registers: [registry] })," : ''),
  (F.worker ? "  queueDepth: new client.Gauge({ name: '@@METRIC@@_queue_depth', help: 'jobs na fila', labelNames: ['status'], registers: [registry] })," : ''),
  (F.ai ? "  assistantTurns: new client.Counter({ name: '@@METRIC@@_assistant_turns_total', help: 'turns do assistente por desfecho', labelNames: ['outcome'], registers: [registry] })," : ''),
  (F.ai ? "  assistantFiles: new client.Counter({ name: '@@METRIC@@_assistant_files_total', help: 'arquivos ingeridos pelo assistente por desfecho', labelNames: ['outcome'], registers: [registry] })," : ''),
  "  httpErrors: new client.Counter({ name: '@@METRIC@@_http_errors_total', help: 'erros HTTP', registers: [registry] }),",
  '};',
  'export function startMetricsServer(port = Number(process.env.METRICS_PORT) || 9464) {',
  '  const srv = http.createServer(async (req, res) => {',
  "    if (req.url === '/metrics') { res.setHeader('Content-Type', registry.contentType); res.end(await registry.metrics()); }",
  "    else { res.statusCode = 404; res.end('not found'); }",
  '  });',
  "  srv.listen(port, () => console.log('[metrics] :' + port));",
  '  return srv;',
  '}', '',
].filter((l) => l !== '').join('\n'));

// gateway (se gateway-externo)
if (F.gateway) add('api/src/gateways/gateway.js', [
  '// gateways/gateway.js — ÚNICA porta de saída para o sistema externo. Gerado pela Forge.',
  "const BASE = process.env.EXTERNAL_BASE_URL || 'http://@@APP@@-mock-central:8090';",
  'const TIMEOUT = Number(process.env.EXTERNAL_TIMEOUT_MS) || 4000;',
  "export class GatewayError extends Error { constructor(m, o = {}) { super(m); this.name = 'GatewayError'; this.transient = !!o.transient; } }",
  'export async function dispatch(record, opts = {}) {',
  '  const retries = opts.retries == null ? 2 : opts.retries; let last;',
  '  for (let a = 0; a <= retries; a++) {',
  '    try {',
  "      const r = await fetch(BASE + '/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id, title: record.title }), signal: AbortSignal.timeout(TIMEOUT) });",
  "      if (r.status >= 500) { last = new GatewayError('externo ' + r.status, { transient: true }); }",
  "      else if (!r.ok) { throw new GatewayError('externo ' + r.status, { transient: false }); }",
  "      else { const j = await r.json().catch(() => ({})); return { externalRef: j.ref || ('EXT-' + record.id) }; }",
  '    } catch (e) { last = e instanceof GatewayError ? e : new GatewayError(String(e.message || e), { transient: true }); if (!last.transient) break; }',
  '    if (a < retries) await new Promise((res) => setTimeout(res, 150 * (a + 1)));',
  '  }',
  '  throw last;',
  '}', '',
].join('\n'));

// ── bloco control-ai-por-app: assistente de IA do app que ACEITA ARQUIVOS (multimodal) ──────────────
// O app NASCE com o assistente: IA de controle via @flavioneto11/control-ai-kit (prompt governado +
// fail-closed sem chave) + LLM Anthropic (Claude). A INGESTÃO DE ARQUIVOS acontece na rota/serviço via
// @flavioneto11/file-ingest-kit (NÃO depende da versão do control-ai-kit): o handler usa attachIngest
// p/ obter req.ingested e o serviço monta o content multimodal (toMessageContent) que vai ao LLM.
// RETROCOMPAT: requisição application/json (só texto) segue o contrato anterior (o middleware é no-op).
// FAIL-SOFT: arquivo ilegível NÃO derruba a rota. FAIL-CLOSED: sem ANTHROPIC_API_KEY -> 503.
// LIÇÃO DE OOM: NUNCA serialize bytes/blobs em log/auditoria — só o manifest (path/type/bytes/chars/status).
if (F.ai) add('api/src/services/assistant-service.js', [
  '// services/assistant-service.js — IA de controle do app via @flavioneto11/control-ai-kit',
  '// (bloco control-ai-por-app), com INGESTÃO DE ARQUIVOS (multimodal) via @flavioneto11/file-ingest-kit.',
  '// Prompts versionados do ai-control-plane com cache+timeout+FALLBACK local; LLM = @anthropic-ai/sdk',
  '// (Claude). FAIL-CLOSED: sem ANTHROPIC_API_KEY -> 503. FAIL-SOFT: arquivo ilegível degrada p/ texto,',
  '// nunca derruba a rota. NUNCA logar bytes — só o manifest. Gerado pela Forge.',
  "import { createControlAi } from '@flavioneto11/control-ai-kit';",
  '',
  'const KEY = process.env.ANTHROPIC_API_KEY;',
  "const MODEL = process.env.ASSISTANT_MODEL || 'claude-haiku-4-5-20251001';",
  '',
  '// adapter estrutural mínimo da plataforma ({ complete({messages}) }) sobre o SDK Anthropic. Aceita',
  '// content de usuário como STRING (texto) ou ARRAY de blocos (multimodal: texto + imagem/PDF nativos).',
  'const llm = KEY',
  '  ? {',
  "      provider: 'anthropic',",
  '      model: MODEL,',
  '      async complete({ messages }) {',
  "        const { default: Anthropic } = await import('@anthropic-ai/sdk');",
  '        const client = new Anthropic({ apiKey: KEY });',
  "        const system = (messages.find((m) => m.role === 'system') || {}).content || '';",
  "        const userMsg = messages.find((m) => m.role === 'user') || {};",
  '        const r = await client.messages.create({ model: MODEL, max_tokens: 700, system, messages: [{ role: \'user\', content: userMsg.content }] });',
  "        return (r.content || []).map((b) => b.text || '').join('').trim();",
  '      },',
  '    }',
  '  : null;',
  '',
  'let ai = null;',
  'function getAi() {',
  '  if (ai) return ai;',
  "  if (!llm) { const e = new Error('assistente de IA indisponível — ANTHROPIC_API_KEY ausente (fail-closed)'); e.status = 503; throw e; }",
  '  ai = createControlAi({',
  "    appName: '@@APP@@',",
  '    llm,',
  "    prompts: { assist: 'Você é o assistente do @@TITLE@@. Ajude de forma concisa, em pt-BR, citando os dados e os arquivos informados. Quando o usuário anexar arquivos, raciocine sobre o conteúdo extraído.' },",
  '    controlPlaneUrl: process.env.AI_CONTROL_PLANE_URL,',
  '  });',
  '  return ai;',
  '}',
  '',
  '// Monta o content multimodal a partir do resultado de ingestão (req.ingested do attachIngest).',
  '// Lazy import do file-ingest-kit (só quando há arquivo) — o app sobe e testa sem a dep instalada.',
  '// FAIL-SOFT: qualquer erro aqui degrada p/ texto-only (devolve null -> o caminho de texto assume).',
  'async function buildUserContent(message, ingested) {',
  '  if (!ingested || (!((ingested.textParts || []).length) && !((ingested.blocks || []).length))) return null;',
  '  try {',
  "    const fik = await import('@flavioneto11/file-ingest-kit');",
  "    const model = (llm && llm.model) || '';",
  '    return fik.toMessageContent(ingested, {',
  "      provider: 'anthropic',",
  '      supportsVision: fik.supportsVision(model),',
  '      supportsPdf: fik.supportsPdf(model),',
  '      userText: String(message || \'\'),',
  '    });',
  '  } catch {',
  '    return null; // sem o kit/extração -> texto-only (fail-soft)',
  '  }',
  '}',
  '',
  '// assist(message, opts) — responde uma pergunta, opcionalmente sobre ARQUIVOS.',
  '// opts.ingested = req.ingested (IngestResult do attachIngest) | undefined.',
  '//',
  '// DUAS VIAS coerentes (documentadas):',
  '//  (1) SEM arquivos -> caminho de TEXTO PURO, IDÊNTICO ao contrato anterior: control-ai-kit ask({prompt,input}).',
  '//  (2) COM arquivos -> resolve o MESMO prompt governado via promptSource.resolve() e chama o LLM',
  '//      DIRETO com o content multimodal. Isso mantém a governança de prompt da control-ai-kit e é',
  '//      INDEPENDENTE da versão vendorizada do kit (a ingestão mora aqui, via file-ingest-kit).',
  'export async function assist(message, opts = {}) {',
  '  const a = getAi();',
  '  const ingested = opts.ingested || null;',
  '  const userContent = await buildUserContent(message, ingested);',
  '  let text;',
  '  if (userContent != null) {',
  '    // via (2): prompt governado + LLM direto com blocos multimodais.',
  "    const system = await a.promptSource.resolve('assist');",
  '    const out = await llm.complete({ messages: [{ role: \'system\', content: system }, { role: \'user\', content: userContent }] });',
  "    text = typeof out === 'string' ? out : (out && (out.content || out.text)) || '';",
  '  } else {',
  '    // via (1): texto puro — contrato retrocompatível.',
  "    const answer = await a.ask({ prompt: 'assist', input: String(message || '') });",
  "    text = typeof answer === 'string' ? answer : (answer && (answer.text || answer.answer)) || '';",
  '  }',
  '  // manifest = visão SEGURA dos arquivos (sem bytes) p/ telemetria/UI. NUNCA exponha bytes.',
  '  const files = ingested && Array.isArray(ingested.manifest)',
  '    ? ingested.manifest.map((m) => ({ path: m.path, type: m.type, bytes: m.bytes, chars: m.chars, status: m.status }))',
  '    : [];',
  '  const notes = (ingested && Array.isArray(ingested.notes)) ? ingested.notes : [];',
  '  return { answer: text, model: MODEL, files, notes };',
  '}',
  'export const aiEnabled = !!KEY;', '',
].join('\n'));

// jobs-repo + worker (se worker-queue)
if (F.worker) {
  add('api/src/repositories/jobs-repo.js', [
    '// repositories/jobs-repo.js — fila transacional (FOR UPDATE SKIP LOCKED). Gerado pela Forge.',
    "import { pool } from '../db.js';",
    'export async function enqueue(type, payload, jobKey, maxAttempts = 4) {',
    "  const { rows } = await pool.query('INSERT INTO jobs(type,payload,job_key,max_attempts) VALUES ($1,$2,$3,$4) ON CONFLICT (job_key) DO NOTHING RETURNING id', [type, JSON.stringify(payload), jobKey, maxAttempts]);",
    '  return rows[0] ? rows[0].id : null;',
    '}',
    'export async function claim(workerId) {',
    "  const { rows } = await pool.query(`UPDATE jobs SET status='running', locked_at=now(), locked_by=$1, attempts=attempts+1, updated_at=now() WHERE id = (SELECT id FROM jobs WHERE status='queued' AND run_after<=now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [workerId]);",
    '  return rows[0] || null;',
    '}',
    "export async function ack(id) { await pool.query(`UPDATE jobs SET status='done', locked_at=NULL, last_error=NULL, updated_at=now() WHERE id=$1`, [id]); }",
    'export async function fail(job, msg) {',
    "  if (job.attempts >= job.max_attempts) { await pool.query(`UPDATE jobs SET status='dlq', locked_at=NULL, last_error=$2, updated_at=now() WHERE id=$1`, [job.id, msg]); return 'dlq'; }",
    '  const backoff = Math.min(60, Math.pow(2, job.attempts));',
    "  await pool.query(`UPDATE jobs SET status='queued', locked_at=NULL, last_error=$2, run_after=now() + ($3 || ' seconds')::interval, updated_at=now() WHERE id=$1`, [job.id, msg, String(backoff)]);",
    "  return 'requeued';",
    '}',
    "export async function requeueStale(s = 120) { const { rowCount } = await pool.query(`UPDATE jobs SET status='queued', locked_at=NULL, updated_at=now() WHERE status='running' AND locked_at < now() - ($1 || ' seconds')::interval`, [String(s)]); return rowCount; }",
    "export async function counts() { const { rows } = await pool.query(`SELECT status, count(*)::int AS n FROM jobs GROUP BY status`); return Object.fromEntries(rows.map((r) => [r.status, r.n])); }", '',
  ].join('\n'));

  add('api/src/worker.js', [
    '// worker.js — consumidor da fila transacional. Gerado pela Forge.',
    "import { migrate, pool } from './db.js';",
    "import { M, startMetricsServer } from './metrics.js';",
    "import * as jobsRepo from './repositories/jobs-repo.js';",
    (F.gateway ? "import { dispatch } from './gateways/gateway.js';" : ''),
    "const WORKER_ID = 'w-' + process.pid; let running = true;",
    'async function handle(job) {',
    "  const id = (job.payload || {}).recordId;",
    "  const rec = (await pool.query('SELECT id,title FROM records WHERE id=$1', [id])).rows[0] || { id, title: 'Record ' + id };",
    (F.gateway
      ? "  let res; try { res = await dispatch(rec); M.gatewayCalls.inc({ outcome: 'ok' }); } catch (e) { M.gatewayCalls.inc({ outcome: 'error' }); throw e; }\n  await pool.query(`UPDATE records SET status='submitted', external_ref=$2, updated_at=now() WHERE id=$1`, [id, res.externalRef]);"
      : "  await pool.query(`UPDATE records SET status='submitted', updated_at=now() WHERE id=$1`, [id]);"),
    '}',
    'async function tick() {',
    '  const job = await jobsRepo.claim(WORKER_ID); if (!job) return false;',
    '  const end = M.jobDuration.startTimer();',
    "  try { await handle(job); await jobsRepo.ack(job.id); M.jobsTotal.inc({ status: 'done' }); console.log('[worker] job ' + job.id + ' OK'); }",
    "  catch (e) { const o = await jobsRepo.fail(job, String(e.message || e)); M.jobsTotal.inc({ status: o });",
    "    if (o === 'dlq') { try { await pool.query(`UPDATE records SET status='failed', updated_at=now() WHERE id=$1`, [(job.payload||{}).recordId]); } catch {} }",
    "    console.warn('[worker] job ' + job.id + ' falhou (' + job.attempts + '/' + job.max_attempts + ') -> ' + o); }",
    '  finally { end(); } return true;',
    '}',
    'async function loop() { let idle = 0; while (running) { let did = false; try { did = await tick(); } catch (e) { console.error(e.message); } if (!did) { idle++; if (idle % 12 === 0) await jobsRepo.requeueStale().catch(() => {}); await new Promise((r) => setTimeout(r, 1000)); } else idle = 0; } }',
    "process.on('SIGTERM', () => { running = false; });",
    "(async () => { if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate().catch(() => {}); startMetricsServer(); console.log('[@@APP@@-worker] iniciado'); await loop(); process.exit(0); })();", '',
  ].filter((l) => l !== '').join('\n'));
}

// server.js — foundation (health, métricas, records CRUD, submit se worker)
const submitRoute = F.worker
  ? "app.post('/v1/records/:id/submit', wrap(async (req, res) => { const id = Number(req.params.id); const r = (await pool.query('SELECT id FROM records WHERE id=$1', [id])).rows[0]; if (!r) return res.status(404).json({ error: { message: 'não encontrado' } }); await pool.query(`UPDATE records SET status='submitting', updated_at=now() WHERE id=$1`, [id]); const jid = await jobsRepo.enqueue('record.submit', { recordId: id }, 'submit:' + id); res.status(202).json({ id, status: 'submitting', enqueued: jid != null }); }));"
  : '';
add('api/src/server.js', [
  '// server.js — API (camadas: rotas finas). Servida em @@BASE@@/api (stripPrefix). Gerado pela Forge.',
  "import express from 'express';",
  "import { pool, migrate, seed } from './db.js';",
  "import { M, startMetricsServer } from './metrics.js';",
  (F.worker ? "import * as jobsRepo from './repositories/jobs-repo.js';" : ''),
  (F.ai ? "import { attachIngest } from '@flavioneto11/ai-ingest-middleware';" : ''),
  (F.ai ? "import * as assistantSvc from './services/assistant-service.js';" : ''),
  'const app = express(); app.use(express.json());',
  "app.use((req, _res, next) => { req.tenantId = Number(req.header('X-Tenant-Id')) || 1; next(); });",
  'const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { M.httpErrors.inc(); res.status(e.status || 500).json({ error: { message: e.message || \'erro\' } }); });',
  "app.get('/', (_q, res) => res.json({ app: '@@APP@@', service: 'api', ok: true }));",
  "app.get('/health', wrap(async (_q, res) => { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'connected' }); }));",
  "// identidade da borda SSO (oauth2-proxy injeta X-Auth-Request-*): a casca usa /me p/ mostrar o usuário.",
  "app.get('/me', (req, res) => res.json({ email: req.header('X-Auth-Request-Email') || null, name: req.header('X-Auth-Request-Preferred-Username') || req.header('X-Auth-Request-User') || null, role: req.header('X-Auth-Request-Groups') || null }));",
  (F.worker ? "app.get('/v1/health/jobs', wrap(async (_q, res) => res.json({ status: 'ok', jobs: await jobsRepo.counts() })));" : ''),
  "app.get('/v1/records', wrap(async (req, res) => res.json({ data: (await pool.query('SELECT * FROM records WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [req.tenantId])).rows })));",
  "app.get('/v1/records/:id', wrap(async (req, res) => { const r = (await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)])).rows[0]; if (!r) return res.status(404).json({ error: { message: 'não encontrado' } }); res.json(r); }));",
  "app.post('/v1/records', wrap(async (req, res) => { if (!req.body || !req.body.title) { return res.status(400).json({ error: { message: 'title obrigatório' } }); } const r = (await pool.query('INSERT INTO records(tenant_id,title) VALUES ($1,$2) RETURNING *', [req.tenantId, req.body.title])).rows[0]; M.recordsTotal.inc({ outcome: 'created' }); res.status(201).json(r); }));",
  submitRoute,
  // bloco control-ai-por-app: assistente de IA que ACEITA ARQUIVOS (multimodal).
  // attachIngest({field:'files'}): NO-OP em application/json (texto segue o contrato anterior, retrocompat);
  // em multipart/form-data, ingere (file-ingest-kit) -> req.ingested E popula req.body com os campos de
  // TEXTO do multipart (ex.: message). FAIL-SOFT: erro de ingestão NÃO vira 500. NUNCA logamos bytes —
  // o serviço devolve só o manifest (path/type/bytes/chars/status). FAIL-CLOSED: sem chave -> 503 (no serviço).
  (F.ai ? "app.post('/v1/assistant', attachIngest({ field: 'files', maxFiles: 10 }), wrap(async (req, res) => { const b = req.body || {}; const message = b.message != null ? b.message : b.input; const ingested = req.ingested || null; const out = await assistantSvc.assist(message, { ingested }); const filed = ingested && (ingested.manifest || []).length > 0; M.assistantTurns.inc({ outcome: 'ok' }); if (filed) M.assistantFiles.inc({ outcome: 'ingested' }); res.json(out); }));" : ''),
  (F.ai ? "app.get('/v1/assistant/health', (_q, res) => res.json({ ai: assistantSvc.aiEnabled, model: process.env.ASSISTANT_MODEL || 'claude-haiku-4-5-20251001' }));" : ''),
  (F.worker ? "async function depth() { try { const c = await jobsRepo.counts(); for (const s of ['queued','running','done','dlq']) M.queueDepth.set({ status: s }, c[s] || 0); } catch {} }" : ''),
  'const PORT = Number(process.env.PORT) || 8080;',
  '(async () => {',
  "  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();",
  "  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();",
  '  startMetricsServer();',
  (F.worker ? '  setInterval(depth, 5000); depth();' : ''),
  "  app.listen(PORT, () => console.log('[@@APP@@-api] :' + PORT));",
  "})().catch((e) => { console.error('boot falhou', e); process.exit(1); });", '',
].filter((l) => l !== '').join('\n'));

// mock-central (se gateway)
if (F.gateway) {
  add('mock-central/server.js', [
    "// mock-central — sistema externo SIMULADO (prova gateway + retry/DLQ). Gerado pela Forge.",
    "import http from 'node:http';",
    'const seen = new Map(); let calls = 0;',
    'const server = http.createServer((req, res) => {',
    "  if (req.method === 'GET' && req.url === '/health') { res.end(JSON.stringify({ status: 'ok', calls })); return; }",
    "  if (req.method !== 'POST' || req.url !== '/dispatch') { res.statusCode = 404; res.end('not found'); return; }",
    "  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {",
    '    calls++; let o = {}; try { o = JSON.parse(body || \'{}\'); } catch {}',
    '    const n = (seen.get(o.id) || 0) + 1; seen.set(o.id, n);',
    "    const fail = String(o.title || '').toUpperCase().includes('FALHA') || n === 1;",
    "    if (fail) { res.statusCode = 503; res.end(JSON.stringify({ error: 'indisponivel', attempt: n })); return; }",
    "    res.statusCode = 200; res.end(JSON.stringify({ ref: 'EXT-' + o.id + '-' + Math.floor(Date.now()/1000) }));",
    '  });',
    '});',
    "server.listen(Number(process.env.PORT) || 8090, () => console.log('[@@APP@@-mock-central] :8090'));", '',
  ].join('\n'));
  add('mock-central/Dockerfile', 'FROM node:20-alpine\nWORKDIR /app\nCOPY server.js ./\nEXPOSE 8090\nUSER node\nCMD ["node", "server.js"]\n');
}

// devops.yaml — service api (+ env de IA quando o bloco control-ai-por-app está presente: o assistente é
// fail-closed sem ANTHROPIC_API_KEY; a chave entra como Secret/Sealed Secret, NUNCA em git).
const apiSvc = F.ai
  ? '  api: { type: api, image: @@APP@@-api, path: /api, port: 8080, expose: true, stripPrefix: true, priority: 40, health: { path: /health }, env: { ASSISTANT_MODEL: claude-haiku-4-5-20251001 } }'
  : '  api: { type: api, image: @@APP@@-api, path: /api, port: 8080, expose: true, stripPrefix: true, priority: 40, health: { path: /health } }';
add('devops.yaml', [
  'app: { name: @@APP@@, namespace: apps, host: nvit.localhost, basePath: @@BASE@@ }',
  '# Gerado pela FORGE (SICAT-style). Blocos: ' + blocks.join(', '),
  (F.ai ? '# IA: assistente em POST @@BASE@@/api/v1/assistant (aceita ARQUIVOS, multimodal). Requer Secret com ANTHROPIC_API_KEY (fail-closed sem ela).' : ''),
  'services:',
  apiSvc,
  (F.worker ? '  worker: { type: worker, image: @@APP@@-api, port: 9464, expose: false, command: ["npm", "run", "worker"] }' : ''),
  'capabilities: [' + blocks.map((b) => b).join(', ') + ']',
  'observability: { metricsPort: 9464, serviceMonitor: true, prometheusRule: true }', '',
].filter((l) => l !== '').join('\n'));

// k8s — gerado conforme blocos (api + postgres + [worker] + [mock] + routing + servicemonitor + prometheusrule)
add('k8s/@@APP@@.yaml', buildK8s());

// docs + test + .forge manifest
add('CLAUDE.md', '---\ntitle: "@@TITLE@@ — Manual para Claude Code"\nstatus: canonical\napplies_to: [@@APP@@]\nupdated: ' + new Date().toISOString().slice(0, 10) + '\nlanguage: pt-BR\n---\n\n# @@TITLE@@ — gerado pela Forge\n\nApp SICAT-style com blocos: ' + blocks.join(', ') + '.\nVer apps/@@APP@@/.forge/applied-capabilities.json.\n\nVerificar: `BASE_URL=http://nvit.localhost@@BASE@@/api node apps/@@APP@@/test/integration.mjs`\n');
add('test/integration.mjs', buildTest());

function buildTest() {
  const lines = [
    "const API = (process.env.BASE_URL || 'http://nvit.localhost@@BASE@@/api').replace(/\\/$/, '');",
    "const post = (p, b) => fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));",
    "const get = (p) => fetch(API + p).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));",
    "const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };",
    "const sleep = (ms) => new Promise((r) => setTimeout(r, ms));",
    "ok((await get('/health')).j.status === 'ok', 'health + db');",
    "const r1 = (await post('/v1/records', { title: 'Teste' })).j; ok(r1.id, 'CRUD cria record');",
  ];
  if (F.worker) lines.push(
    "await post('/v1/records/' + r1.id + '/submit', {});",
    "let a = {}; for (let i = 0; i < 12; i++) { await sleep(3000); a = (await get('/v1/records/' + r1.id)).j; if (a.status === 'submitted' || a.status === 'failed') break; }",
    "ok(a.status === 'submitted', 'fila+gateway: record submetido (retry no transitório)');");
  if (F.ai) lines.push(
    "// IA: health sempre responde (200, { ai }); o caminho de texto (application/json) é retrocompatível.",
    "const ah = await get('/v1/assistant/health'); ok(ah.s === 200 && typeof ah.j.ai === 'boolean', 'assistant/health responde { ai }');",
    "const ar = await post('/v1/assistant', { message: 'olá' });",
    "ok(ar.s === 200 || ar.s === 503, 'assistant texto: 200 (chave) ou 503 fail-closed (sem chave) — nunca 500');",
    "// IA + ARQUIVOS: multipart com 1 arquivo de texto — fail-soft (nunca 500; 200 com chave ou 503 sem).",
    "const fd = new FormData(); fd.append('message', 'resuma o anexo'); fd.append('files', new Blob(['linha 1\\nlinha 2'], { type: 'text/plain' }), 'nota.txt');",
    "const fr = await fetch(API + '/v1/assistant', { method: 'POST', body: fd }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));",
    "ok(fr.s === 200 || fr.s === 503, 'assistant multipart (arquivo): aceito sem 500 (fail-soft)');");
  lines.push("console.log(process.exitCode ? 'FALHOU' : 'OK — robusto');", '');
  return lines.join('\n');
}

function buildK8s() {
  const L = [];
  L.push('# @@TITLE@@ — k8s gerado pela Forge. Imagens :local (IfNotPresent).');
  // postgres
  L.push('---', 'apiVersion: v1', 'kind: PersistentVolumeClaim',
    'metadata: { name: @@APP@@-postgres, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }',
    'spec: { accessModes: [ReadWriteOnce], resources: { requests: { storage: 1Gi } } }');
  L.push('---', 'apiVersion: apps/v1', 'kind: Deployment',
    'metadata: { name: @@APP@@-postgres, namespace: apps, labels: { app.kubernetes.io/name: @@APP@@-postgres, app.kubernetes.io/part-of: @@APP@@ } }',
    'spec:', '  replicas: 1', '  strategy: { type: Recreate }', '  selector: { matchLabels: { app.kubernetes.io/name: @@APP@@-postgres } }',
    '  template:', '    metadata: { labels: { app.kubernetes.io/name: @@APP@@-postgres, app.kubernetes.io/part-of: @@APP@@ } }',
    '    spec:', '      containers:', '        - name: postgres', '          image: ' + (F.pgvector ? 'pgvector/pgvector:pg16' : 'postgres:16-alpine'),
    '          envFrom: [ { secretRef: { name: @@APP@@-db } } ]', '          ports: [ { containerPort: 5432 } ]',
    '          volumeMounts: [ { name: data, mountPath: /var/lib/postgresql/data, subPath: pgdata } ]',
    '      volumes: [ { name: data, persistentVolumeClaim: { claimName: @@APP@@-postgres } } ]');
  L.push('---', 'apiVersion: v1', 'kind: Service',
    'metadata: { name: @@APP@@-postgres, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }',
    'spec: { selector: { app.kubernetes.io/name: @@APP@@-postgres }, ports: [ { port: 5432, targetPort: 5432 } ] }');
  if (F.gateway) {
    L.push('---', 'apiVersion: apps/v1', 'kind: Deployment',
      'metadata: { name: @@APP@@-mock-central, namespace: apps, labels: { app.kubernetes.io/name: @@APP@@-mock-central, app.kubernetes.io/part-of: @@APP@@ } }',
      'spec:', '  replicas: 1', '  selector: { matchLabels: { app.kubernetes.io/name: @@APP@@-mock-central } }',
      '  template:', '    metadata: { labels: { app.kubernetes.io/name: @@APP@@-mock-central, app.kubernetes.io/part-of: @@APP@@ } }',
      '    spec: { containers: [ { name: mock, image: @@APP@@-mock-central:local, imagePullPolicy: IfNotPresent, ports: [ { containerPort: 8090 } ], readinessProbe: { httpGet: { path: /health, port: 8090 }, initialDelaySeconds: 3 } } ] }');
    L.push('---', 'apiVersion: v1', 'kind: Service',
      'metadata: { name: @@APP@@-mock-central, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }',
      'spec: { selector: { app.kubernetes.io/name: @@APP@@-mock-central }, ports: [ { port: 8090, targetPort: 8090 } ] }');
  }
  // api
  const apiEnv = ['            - { name: METRICS_PORT, value: "9464" }', '            - { name: AUTO_MIGRATE, value: "true" }', '            - { name: AUTO_SEED, value: "true" }',
    // Langfuse always-on (Forja 4.0 B4): tracing de IA ligado por default; fail-soft — só ativa de
    // fato quando LANGFUSE_PUBLIC_KEY/SECRET_KEY existirem no Secret @@APP@@-ai (passo do operador).
    '            - { name: LANGFUSE_ENABLED, value: "true" }',
    '            - { name: LANGFUSE_BASE_URL, value: "http://langfuse.observability.svc.cluster.local:3000" }'];
  if (F.gateway) apiEnv.unshift('            - { name: EXTERNAL_BASE_URL, value: "http://@@APP@@-mock-central:8090" }');
  L.push('---', 'apiVersion: apps/v1', 'kind: Deployment',
    'metadata:', '  name: @@APP@@-api', '  namespace: apps',
    '  labels: { app.kubernetes.io/name: @@APP@@-api, app.kubernetes.io/component: api, app.kubernetes.io/part-of: @@APP@@, devops.flavioneto/app-type: product_software }',
    '  annotations: { devops.flavioneto/app: @@APP@@, devops.flavioneto/metrics-port: "9464" }',
    'spec:', '  replicas: 1', '  selector: { matchLabels: { app.kubernetes.io/name: @@APP@@-api } }',
    '  template:', '    metadata: { labels: { app.kubernetes.io/name: @@APP@@-api, app.kubernetes.io/component: api, app.kubernetes.io/part-of: @@APP@@ } }',
    '    spec:', '      containers:', '        - name: api', '          image: @@APP@@-api:local', '          imagePullPolicy: IfNotPresent',
    '          command: ["npm", "start"]', '          envFrom: [ { secretRef: { name: @@APP@@-db } }, { secretRef: { name: @@APP@@-ai, optional: true } } ]', '          env:', ...apiEnv,
    '          ports:', '            - { name: http, containerPort: 8080 }', '            - { name: metrics, containerPort: 9464 }',
    '          readinessProbe: { httpGet: { path: /health, port: 8080 }, initialDelaySeconds: 8, periodSeconds: 10 }');
  L.push('---', 'apiVersion: v1', 'kind: Service',
    'metadata: { name: @@APP@@-api, namespace: apps, labels: { app.kubernetes.io/name: @@APP@@-api, app.kubernetes.io/part-of: @@APP@@ } }',
    'spec: { selector: { app.kubernetes.io/name: @@APP@@-api }, ports: [ { name: http, port: 8080, targetPort: 8080 }, { name: metrics, port: 9464, targetPort: 9464 } ] }');
  if (F.worker) {
    const wEnv = ['            - { name: METRICS_PORT, value: "9464" }', '            - { name: AUTO_MIGRATE, value: "false" }'];
    if (F.gateway) wEnv.unshift('            - { name: EXTERNAL_BASE_URL, value: "http://@@APP@@-mock-central:8090" }');
    L.push('---', 'apiVersion: apps/v1', 'kind: Deployment',
      'metadata:', '  name: @@APP@@-worker', '  namespace: apps',
      '  labels: { app.kubernetes.io/name: @@APP@@-worker, app.kubernetes.io/component: worker, app.kubernetes.io/part-of: @@APP@@ }',
      '  annotations: { devops.flavioneto/app: @@APP@@, devops.flavioneto/metrics-port: "9464" }',
      'spec:', '  replicas: 1', '  selector: { matchLabels: { app.kubernetes.io/name: @@APP@@-worker } }',
      '  template:', '    metadata: { labels: { app.kubernetes.io/name: @@APP@@-worker, app.kubernetes.io/component: worker, app.kubernetes.io/part-of: @@APP@@ } }',
      '    spec:', '      containers:', '        - name: worker', '          image: @@APP@@-api:local', '          imagePullPolicy: IfNotPresent',
      '          command: ["npm", "run", "worker"]', '          envFrom: [ { secretRef: { name: @@APP@@-db } } ]', '          env:', ...wEnv,
      '          ports: [ { name: metrics, containerPort: 9464 } ]');
    L.push('---', 'apiVersion: v1', 'kind: Service',
      'metadata: { name: @@APP@@-worker, namespace: apps, labels: { app.kubernetes.io/name: @@APP@@-worker, app.kubernetes.io/part-of: @@APP@@ } }',
      'spec: { selector: { app.kubernetes.io/name: @@APP@@-worker }, ports: [ { name: metrics, port: 9464, targetPort: 9464 } ] }');
  }
  // routing
  L.push('---', 'apiVersion: traefik.io/v1alpha1', 'kind: Middleware',
    'metadata: { name: @@APP@@-api-strip, namespace: apps }', 'spec: { stripPrefix: { prefixes: ["@@BASE@@/api"] } }');
  L.push('---', 'apiVersion: traefik.io/v1alpha1', 'kind: IngressRoute',
    'metadata: { name: @@APP@@, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }',
    'spec:', '  entryPoints: [web]', '  routes:', '    - match: PathPrefix(`@@BASE@@/api`)', '      kind: Rule', '      priority: 40',
    '      services: [ { name: @@APP@@-api, port: 8080 } ]', '      middlewares: [ { name: @@APP@@-api-strip } ]');
  // observability
  L.push('---', 'apiVersion: monitoring.coreos.com/v1', 'kind: ServiceMonitor',
    'metadata: { name: @@APP@@, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@, release: kube-prometheus-stack } }',
    'spec:', '  selector: { matchLabels: { app.kubernetes.io/part-of: @@APP@@ } }', '  namespaceSelector: { matchNames: [apps] }',
    '  endpoints: [ { port: metrics, path: /metrics, interval: 15s } ]');
  L.push('---', 'apiVersion: monitoring.coreos.com/v1', 'kind: PrometheusRule',
    'metadata: { name: @@APP@@-slo, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@, release: kube-prometheus-stack } }',
    'spec:', '  groups:', '    - name: @@APP@@.slo', '      rules:',
    '        - alert: @@APP@@ApiDown', '          expr: absent(up{job=~".*@@APP@@-api.*"} == 1)', '          for: 3m',
    '          labels: { severity: critical, app: @@APP@@ }', '          annotations: { summary: "@@APP@@: API sem target UP" }');
  if (F.worker) L.push('        - alert: @@APP@@QueueDlq', '          expr: max(@@METRIC@@_queue_depth{status="dlq"}) > 3', '          for: 2m',
    '          labels: { severity: warning, app: @@APP@@ }', '          annotations: { summary: "@@APP@@: DLQ acumulando" }');
  return L.join('\n') + '\n';
}

// ── escrever ──
const METRIC = APP.replace(/[^a-zA-Z0-9_:]/g, '_'); // Prometheus exige [a-zA-Z_:][a-zA-Z0-9_:]* — slug com '-' quebra o prom-client no boot
const replace = (s) => s.replace(/@@APP@@/g, APP).replace(/@@METRIC@@/g, METRIC).replace(/@@TITLE@@/g, TITLE).replace(/@@BASE@@/g, BASE);
let written = 0;
for (const [rel, content] of Object.entries(files)) {
  const dest = path.join(APPDIR, replace(rel));
  if (fs.existsSync(dest) && !args.force) { console.log('[skip existe] ' + path.relative(REPO_ROOT, dest)); continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, replace(content));
  written++;
}
// ── vendoring dos kits @flavioneto11/* (bloco de IA): copia os .tgz p/ apps/<app>/api/vendor/ ──────
// O app builda em contexto Docker isolado (não alcança packages/), por isso o Dockerfile faz COPY vendor
// ANTES do npm install p/ resolver as deps file:vendor/*. Determinístico/idempotente: nomes versionados
// fixos; só copia se a origem existir (primeira que existir vence) e o destino não existir (salvo --force).
let vendored = 0;
if (F.ai) {
  const vendorDir = path.join(APPDIR, 'api', 'vendor');
  fs.mkdirSync(vendorDir, { recursive: true });
  for (const tgz of AI_VENDOR_TGZ) {
    const dest = path.join(vendorDir, tgz);
    if (fs.existsSync(dest) && !args.force) { console.log('[skip vendor existe] ' + path.relative(REPO_ROOT, dest)); continue; }
    let src = (VENDOR_SOURCES[tgz] || []).find((p) => fs.existsSync(p));
    // Auto-heal: nenhuma origem existe -> npm pack do packages/<kit> p/ o .vendor-cache.
    if (!src && PACK_FROM[tgz]) {
      const pkgDir = path.join(REPO_ROOT, PACK_FROM[tgz]);
      const cacheDir = path.join(REPO_ROOT, '.vendor-cache');
      if (fs.existsSync(pkgDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        try { execSync(`npm pack --pack-destination "${cacheDir}"`, { cwd: pkgDir, stdio: 'ignore' }); } catch { /* segue p/ o erro abaixo */ }
        const packed = path.join(cacheDir, tgz);
        if (fs.existsSync(packed)) { src = packed; console.log('[vendor auto-pack] ' + path.relative(REPO_ROOT, pkgDir) + ' -> ' + tgz); }
      }
    }
    if (!src) {
      console.error(`[scaffold-sicat] ERRO: vendor .tgz não encontrado: ${tgz}. Origens tentadas:\n  ` + (VENDOR_SOURCES[tgz] || []).map((p) => path.relative(REPO_ROOT, p)).join('\n  '));
      process.exit(3);
    }
    fs.copyFileSync(src, dest);
    vendored++;
  }
}

// manifesto de capacidades
const forgeDir = path.join(APPDIR, '.forge');
fs.mkdirSync(forgeDir, { recursive: true });
fs.writeFileSync(path.join(forgeDir, 'applied-capabilities.json'), JSON.stringify({ app: APP, stack: 'sicat', blocks, catalog_source_sha: catalogSourceSha(), generatedBy: 'scaffold-sicat.mjs' }, null, 2) + '\n');

console.log(`[scaffold-sicat] ${APP} (${blocks.length} blocos) — ${written} arquivos gerados em apps/${APP}/`);
console.log(`  blocos: ${blocks.join(', ')}`);
console.log(`  worker=${F.worker} gateway=${F.gateway} idempotencia=${F.idem} ai=${F.ai}` + (F.ai ? ` (${vendored} kit(s) vendorizado(s) em api/vendor/)` : ''));
if (F.ai) console.log('  IA: POST @@BASE@@/api/v1/assistant aceita ARQUIVOS (multimodal). Requer ANTHROPIC_API_KEY (Secret) — fail-closed sem ela.'.replace('@@BASE@@', BASE));
