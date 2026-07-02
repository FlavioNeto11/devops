// forge-preview.js — núcleo do PREVIEW iterativo da Forja (F3): a Forja mostra TODAS as telas
// propostas com componentes ui-vue REAIS + dados FAKE ANTES de construir; o dono itera (refina tela a
// tela) e só então a esteira constrói. Este módulo é a parte do reqhub-api: funções PURAS (validação,
// merge do inventário, leitura do manifest do volume) + DISPATCH do workflow que builda a SPA no runner
// (vite não roda no pod non-root). Mesmo padrão de forge-launch.js: fetch nativo, dispatch injetável.
//
// CONTRATO (o que o frontend consome) — documentado em ROUTES no topo de routes.js. Resumo:
//   - inventário de preview = { brand, entities, screens } (mesmo shape do ARCHITECT_SCHEMA do
//     specs/forge/workflows/generate-ui.workflow.mjs, produzido pela tool forge.propose_screens).
//   - o build roda no runner (forge-preview.yml via repository_dispatch event_type 'forge-preview'),
//     escreve dist/ + manifest.json no volume FORGE_PREVIEW_DIR/<product>/, e o reqhub-api serve os bytes.
import fs from 'node:fs';
import path from 'node:path';

const PRODUCT_RE = /^[a-z][a-z0-9-]{1,30}$/;
const MAX_PAYLOAD_BYTES = 60 * 1024; // teto do client_payload do repository_dispatch (~64KB)

// Diretório (volume RWX) onde o runner deposita dist/ + manifest.json por produto. Fail-soft:
// ausente -> status 'absent' (nunca 500), igual ao forge-state.js.
export const PREVIEW_DIR = () => process.env.FORGE_PREVIEW_DIR || '/preview-data';

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// ident — saneia um nome de campo/entidade para um IDENTIFICADOR SEGURO: o `name` vira código no .vue
// gerado (acesso por índice/membro, defs de mock), então restringimos ao charset de identificador.
// Vazio -> '' (o chamador DESCARTA o campo/entidade). Isto é a defesa-de-fonte; o gerador
// (preview-ui.mjs) ainda serializa o nome por literal (defesa-em-profundidade).
const ident = (v) => String(v == null ? '' : v).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);

// ---------------------------------------------------------------------------
// Validação do slug do produto (compartilhada por todas as rotas de preview).
// ---------------------------------------------------------------------------
export function validateProduct(raw) {
  const product = String(raw || '').trim().toLowerCase();
  if (!PRODUCT_RE.test(product)) return { ok: false, code: 'INVALID_PRODUCT', message: 'product inválido (slug minúsculo 2-31 chars: ^[a-z][a-z0-9-]{1,30}$)' };
  return { ok: true, product };
}

// ---------------------------------------------------------------------------
// Validação do INVENTÁRIO de preview { brand, entities, screens }.
// É uma checagem ESTRUTURAL de fronteira (defesa em profundidade) — o gate semântico real é o schema
// ARCHITECT do gerador. Aqui só garantimos shape mínimo + tetos, e devolvemos um inventário SANEADO.
// ---------------------------------------------------------------------------
const FIELD_TYPES = new Set(['text', 'number', 'currency', 'date', 'datetime', 'boolean', 'enum', 'status', 'longtext']);
const SCREEN_KINDS = new Set(['dashboard', 'list', 'create', 'edit', 'detail', 'custom']);
const NEUTRALS = new Set(['slate', 'graphite', 'zinc', 'warm']);
const RADII = new Set(['sm', 'md', 'lg']);
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

function sanitizeField(f) {
  if (!isObj(f)) return null;
  const name = ident(f.name);
  if (!name) return null; // nome vazio após sanear -> DESCARTA (não gera campo inseguro)
  return {
    name,
    label: str(f.label, 80) || str(name, 80),
    type: FIELD_TYPES.has(f.type) ? f.type : 'text',
    required: f.required === true,
    enumValues: Array.isArray(f.enumValues) ? f.enumValues.filter((x) => typeof x === 'string').slice(0, 24).map((x) => x.slice(0, 60)) : [],
  };
}

function sanitizeEntity(e) {
  if (!isObj(e)) return null;
  const name = ident(e.name);
  if (!name) return null; // nome de entidade vazio após sanear -> DESCARTA
  return {
    name,
    label: str(e.label, 80) || str(name, 80),
    fields: (Array.isArray(e.fields) ? e.fields : []).map(sanitizeField).filter(Boolean).slice(0, 40),
    hasEndpoints: e.hasEndpoints === true,
    anchors: Array.isArray(e.anchors) ? e.anchors.filter((x) => typeof x === 'string').slice(0, 12) : [],
  };
}

export function sanitizeScreen(s) {
  if (!isObj(s) || !str(s.slug) || !str(s.title)) return null;
  return {
    slug: str(s.slug, 60).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''),
    title: str(s.title, 120),
    kind: SCREEN_KINDS.has(s.kind) ? s.kind : 'custom',
    route: str(s.route, 120) || '/',
    entity: ident(s.entity) || null,
    anchors: Array.isArray(s.anchors) ? s.anchors.filter((x) => typeof x === 'string').slice(0, 12) : [],
    purpose: str(s.purpose, 600),
    components: Array.isArray(s.components) ? s.components.filter((x) => typeof x === 'string').slice(0, 24).map((x) => x.slice(0, 60)) : [],
    apiEndpoints: Array.isArray(s.apiEndpoints) ? s.apiEndpoints.filter((x) => typeof x === 'string').slice(0, 24).map((x) => x.slice(0, 120)) : [],
  };
}

function sanitizeBrand(b) {
  const o = isObj(b) ? b : {};
  // name vira COMENTÁRIO/CSS no tokens.generated.css (forge-brand.mjs) — remove os caracteres que
  // poderiam fechar o comentário `*/` ou abrir um bloco `{` `}` no CSS.
  const name = str(o.name, 80).replace(/\*\/|[{}]/g, '');
  // displayFont vira `--ui-font-display: <font>, ...;` no CSS — restringe a um nome de fonte plausível
  // (letras/dígitos/espaço/_/-) p/ não injetar `;` ou `}` na declaração.
  const displayFont = str(o.displayFont, 60).replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 60);
  return {
    name,
    accent: HEX_RE.test(o.accent) ? o.accent : '#4f46e5',
    neutralBase: NEUTRALS.has(o.neutralBase) ? o.neutralBase : 'slate',
    radius: RADII.has(o.radius) ? o.radius : 'md',
    displayFont,
    vibe: str(o.vibe, 120),
  };
}

/** Valida + saneia o inventário { brand, entities, screens }. -> { ok, value } | { ok:false, code, message }. */
export function validateInventory(raw) {
  const inv = isObj(raw) ? raw : {};
  const screens = (Array.isArray(inv.screens) ? inv.screens : []).map(sanitizeScreen).filter(Boolean).slice(0, 40);
  if (!screens.length) return { ok: false, code: 'NO_SCREENS', message: 'inventário precisa de ao menos 1 tela (screens[])' };
  // dedup por slug (preserva a primeira ocorrência)
  const seen = new Set();
  const uniq = screens.filter((s) => (s.slug && !seen.has(s.slug) && seen.add(s.slug)));
  return {
    ok: true,
    value: {
      brand: sanitizeBrand(inv.brand),
      entities: (Array.isArray(inv.entities) ? inv.entities : []).map(sanitizeEntity).filter(Boolean).slice(0, 24),
      screens: uniq,
    },
  };
}

/** Substitui UMA tela (por slug) no inventário, preservando o resto. Usado pelo refino. */
export function mergeScreen(inventory, nextScreen) {
  const inv = isObj(inventory) ? inventory : { brand: {}, entities: [], screens: [] };
  const screen = sanitizeScreen(nextScreen);
  if (!screen) return { ok: false, code: 'INVALID_SCREEN', message: 'a tela refinada é inválida' };
  const screens = (Array.isArray(inv.screens) ? inv.screens : []).slice();
  const i = screens.findIndex((s) => s && s.slug === screen.slug);
  if (i >= 0) screens[i] = screen;
  else screens.push(screen);
  return { ok: true, value: { brand: inv.brand || {}, entities: inv.entities || [], screens } };
}

// ---------------------------------------------------------------------------
// client_payload do repository_dispatch 'forge-preview' (impõe o teto de tamanho).
// O runner recebe o inventário INTEIRO e gera+builda a SPA — sem ler nada do git além do kit.
// ---------------------------------------------------------------------------
export function buildPreviewPayload({ product, inventory, identity, jobId }) {
  const payload = {
    payload_version: 1,
    requested_by: str(identity, 120) || 'reqhub',
    job_id: str(jobId, 60) || '',
    product,
    inventory, // { brand, entities, screens } já saneado
  };
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > MAX_PAYLOAD_BYTES) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE', message: `inventário ${Math.round(bytes / 1024)}KB excede ${Math.round(MAX_PAYLOAD_BYTES / 1024)}KB — reduza o escopo (menos telas/campos)` };
  }
  return { ok: true, payload, bytes };
}

/** Dispara o repository_dispatch (event_type 'forge-preview'). GitHub responde 204 em sucesso. */
export async function dispatchForgePreview({ token, repo, payload, fetchImpl }) {
  const f = fetchImpl || fetch;
  const res = await f(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'reqhub-forge-preview',
    },
    body: JSON.stringify({ event_type: 'forge-preview', client_payload: payload }),
  });
  if (res.status === 204) return { ok: true };
  let detail = '';
  try { detail = (await res.text()).slice(0, 300); } catch { /* noop */ }
  return { ok: false, status: res.status, detail };
}

// ---------------------------------------------------------------------------
// Estado do preview lido do VOLUME (manifest.json escrito pelo runner). Fail-soft.
//   manifest.json: { product, jobId, status:'building'|'ready'|'error', generatedAt, error?,
//                    screens:[{slug,title,route,kind}], baseHref }
// Status derivado:
//   - 'absent'   : sem manifest e sem dist (nunca pedido, ou volume vazio)
//   - 'building' : manifest.status === 'building'
//   - 'ready'    : manifest.status === 'ready' E dist/index.html existe
//   - 'error'    : manifest.status === 'error' (com .error)
// ---------------------------------------------------------------------------
function safeProductDir(product) {
  const v = validateProduct(product);
  if (!v.ok) return null;
  // path.join + guarda de slug já bloqueiam traversal; defesa extra: o resultado tem de ficar sob a raiz.
  const root = path.resolve(PREVIEW_DIR());
  const dir = path.resolve(root, v.product);
  if (dir !== path.join(root, v.product)) return null;
  return dir;
}

/** Lê o INVENTÁRIO persistido do preview (A2, Forja 4.0). O runner grava inventory.json ao lado do
    manifest — com isto o refino por IA funciona FORA do wizard (o preview deixa de ser descartável).
    Passa pela MESMA fronteira de saneamento do /generate (validateInventory). Nunca lança. */
export function previewInventory(product) {
  const dir = safeProductDir(product);
  if (!dir) return { ok: false, code: 'INVALID_PRODUCT' };
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(path.join(dir, 'inventory.json'), 'utf8')); } catch { return { ok: false, code: 'NOT_FOUND' }; }
  const v = validateInventory(raw);
  if (!v.ok) return { ok: false, code: 'INVALID_INVENTORY' };
  return { ok: true, inventory: v.value };
}

/** Lê o estado do preview de um produto do volume. Nunca lança. */
export function previewStatus(product) {
  const dir = safeProductDir(product);
  if (!dir) return { product: String(product || ''), status: 'invalid', message: 'product inválido' };
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { /* ausente */ }
  const hasDist = (() => { try { return fs.existsSync(path.join(dir, 'dist', 'index.html')); } catch { return false; } })();
  const base = previewBaseUrl(product);
  if (!manifest) {
    return { product: String(product), status: hasDist ? 'ready' : 'absent', url: hasDist ? base : null, screens: [] };
  }
  let status = manifest.status === 'ready' && hasDist ? 'ready'
    : manifest.status === 'error' ? 'error'
    : manifest.status === 'ready' && !hasDist ? 'building' // marcou ready mas dist ainda não copiado
    : 'building';
  return {
    product: String(product),
    status,
    jobId: typeof manifest.jobId === 'string' ? manifest.jobId : null,
    generatedAt: typeof manifest.generatedAt === 'string' ? manifest.generatedAt : null,
    error: status === 'error' ? String(manifest.error || 'falha no build do preview') : null,
    url: status === 'ready' ? base : null,
    screens: Array.isArray(manifest.screens) ? manifest.screens.slice(0, 40) : [],
  };
}

/** URL (relativa à origem do Reqhub) onde o preview de um produto é servido. */
export function previewBaseUrl(product) {
  const v = validateProduct(product);
  return v.ok ? `/reqs/api/v1/forge/preview/${v.product}/` : null;
}

// ---------------------------------------------------------------------------
// Servir os bytes de dist/ pelo Express (sem express.static p/ controlar mime + guardas de traversal).
// resolveAsset(product, relPath) -> { ok, file, contentType } | { ok:false, code }.
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

export function resolveAsset(product, relPath) {
  const dir = safeProductDir(product);
  if (!dir) return { ok: false, code: 'INVALID_PRODUCT' };
  const distRoot = path.join(dir, 'dist');
  // SPA: caminho vazio ou diretório -> index.html
  let rel = String(relPath || '').replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const resolved = path.resolve(distRoot, rel);
  // anti-traversal: o resolvido TEM de ficar sob distRoot.
  if (resolved !== distRoot && !resolved.startsWith(distRoot + path.sep)) return { ok: false, code: 'FORBIDDEN' };
  try {
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      // SPA fallback: rotas internas do Vue -> index.html (mas só p/ navegações, não p/ assets faltando)
      if (!path.extname(rel)) {
        const idx = path.join(distRoot, 'index.html');
        if (fs.existsSync(idx)) return { ok: true, file: idx, contentType: MIME['.html'] };
      }
      return { ok: false, code: 'NOT_FOUND' };
    }
  } catch { return { ok: false, code: 'NOT_FOUND' }; }
  return { ok: true, file: resolved, contentType: MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream' };
}

export const _internals = { PRODUCT_RE, MAX_PAYLOAD_BYTES, FIELD_TYPES, SCREEN_KINDS, MIME, ident, sanitizeField, sanitizeEntity, sanitizeBrand };
