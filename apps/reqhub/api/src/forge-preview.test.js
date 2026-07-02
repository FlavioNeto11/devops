import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateProduct, validateInventory, sanitizeScreen, mergeScreen, buildPreviewPayload,
  dispatchForgePreview, previewStatus, previewInventory, previewBaseUrl, resolveAsset, _internals,
} from './forge-preview.js';

const SCREEN = { slug: 'product-list', title: 'Produtos', kind: 'list', route: '/products', entity: 'products', anchors: ['REQ-X-0001'], purpose: 'listar' };
const INV = {
  brand: { name: 'X', accent: '#0f766e', neutralBase: 'slate', radius: 'md' },
  entities: [{ name: 'products', label: 'Produtos', fields: [{ name: 'title', type: 'text', required: true }], hasEndpoints: false, anchors: ['REQ-X-0001'] }],
  screens: [SCREEN],
};

test('validateProduct: slug', () => {
  assert.equal(validateProduct('Bad Slug').ok, false);
  assert.equal(validateProduct('').code, 'INVALID_PRODUCT');
  const ok = validateProduct('ShopDesk');
  assert.equal(ok.ok, true);
  assert.equal(ok.product, 'shopdesk'); // normaliza p/ minúsculo
});

test('validateInventory: ok + tipos saneados', () => {
  const r = validateInventory(INV);
  assert.equal(r.ok, true);
  assert.equal(r.value.screens.length, 1);
  assert.equal(r.value.screens[0].kind, 'list');
  assert.equal(r.value.brand.accent, '#0f766e');
  assert.equal(r.value.entities[0].fields[0].type, 'text');
});

test('validateInventory: defaults p/ valores fora do enum', () => {
  const r = validateInventory({ brand: { accent: 'nao-hex', neutralBase: 'roxo', radius: 'xl' }, screens: [{ slug: 's', title: 'T', kind: 'inventado', route: '/s', anchors: [] }] });
  assert.equal(r.ok, true);
  assert.equal(r.value.brand.accent, '#4f46e5'); // hex inválido -> default
  assert.equal(r.value.brand.neutralBase, 'slate');
  assert.equal(r.value.brand.radius, 'md');
  assert.equal(r.value.screens[0].kind, 'custom'); // kind inválido -> custom
});

test('validateInventory: sem telas -> NO_SCREENS', () => {
  assert.equal(validateInventory({ brand: {}, entities: [], screens: [] }).code, 'NO_SCREENS');
  assert.equal(validateInventory({}).code, 'NO_SCREENS');
});

test('SEGURANÇA: nome de campo/entidade hostil é saneado a identificador OU descartado', () => {
  const r = validateInventory({
    brand: { name: 'Evil */ x { y } z', displayFont: 'Sora; } body { a: b' },
    entities: [
      {
        name: 'recs', label: 'Recs', hasEndpoints: true,
        fields: [
          { name: 'a" @click="x', type: 'text' },   // -> aclickx
          { name: 'b}}<x>', type: 'status', enumValues: ['ok'] }, // -> bx
          { name: '!!!', type: 'text' },             // vazio -> descartado
          { name: 'valido_1', type: 'currency' },    // intacto
        ],
      },
      { name: 'x"><script>', label: 'E', hasEndpoints: false, fields: [{ name: 'q', type: 'text' }] }, // -> xscript
      { name: '###', label: 'lixo', hasEndpoints: false, fields: [{ name: 'z', type: 'text' }] },       // descartada
    ],
    screens: [{ slug: 's', title: 'T', kind: 'list', route: '/s', entity: 'recs', anchors: [] }],
  });
  assert.equal(r.ok, true);
  // entidades: charset seguro, lixo descartado.
  for (const e of r.value.entities) assert.match(e.name, /^[a-zA-Z0-9_]+$/, 'entity.name não saneado: ' + e.name);
  assert.ok(!r.value.entities.some((e) => e.name === '###' || e.name === ''), 'entidade lixo não descartada');
  const recs = r.value.entities.find((e) => e.name === 'recs');
  for (const f of recs.fields) assert.match(f.name, /^[a-zA-Z0-9_]+$/, 'field.name não saneado: ' + f.name);
  assert.equal(recs.fields.length, 3, 'esperado 3 campos (1 lixo descartado)');
  assert.ok(recs.fields.some((f) => f.name === 'valido_1'));
  // brand: name sem `*/`/`{`/`}`; displayFont restrito.
  assert.ok(!/\*\/|[{}]/.test(r.value.brand.name), 'brand.name não saneado: ' + r.value.brand.name);
  assert.match(r.value.brand.displayFont, /^[A-Za-z0-9 _-]*$/, 'displayFont não saneado: ' + r.value.brand.displayFont);
});

test('ident: helper restringe ao charset de identificador', () => {
  assert.equal(_internals.ident('a" @click="x'), 'aclickx');
  assert.equal(_internals.ident('!!!'), '');
  assert.equal(_internals.ident('ok_123'), 'ok_123');
  assert.equal(_internals.ident('x'.repeat(80)).length, 60); // cap 60
});

test('validateInventory: dedup por slug', () => {
  const r = validateInventory({ screens: [SCREEN, { ...SCREEN, title: 'Outro' }] });
  assert.equal(r.value.screens.length, 1);
  assert.equal(r.value.screens[0].title, 'Produtos'); // mantém a primeira
});

test('sanitizeScreen: slug kebab + null entity', () => {
  const s = sanitizeScreen({ slug: 'Product List', title: 'X', kind: 'list', route: '/p', entity: '' });
  assert.equal(s.slug, 'product-list');
  assert.equal(s.entity, null);
  assert.equal(sanitizeScreen({ title: 'sem slug' }), null);
});

test('mergeScreen: substitui por slug, preserva resto', () => {
  const r = mergeScreen(INV, { ...SCREEN, title: 'Catálogo' });
  assert.equal(r.ok, true);
  assert.equal(r.value.screens.length, 1);
  assert.equal(r.value.screens[0].title, 'Catálogo');
  // tela nova (slug diferente) -> append
  const r2 = mergeScreen(INV, { slug: 'dash', title: 'Dashboard', kind: 'dashboard', route: '/', anchors: ['REQ-X-0001'] });
  assert.equal(r2.value.screens.length, 2);
});

test('buildPreviewPayload: ok + cap de tamanho', () => {
  const r = buildPreviewPayload({ product: 'x', inventory: INV, identity: 'admin@x', jobId: 'x-1' });
  assert.equal(r.ok, true);
  assert.equal(r.payload.product, 'x');
  assert.equal(r.payload.requested_by, 'admin@x');
  assert.equal(r.payload.job_id, 'x-1');
  // inventário gigante -> PAYLOAD_TOO_LARGE
  const big = { ...INV, screens: Array.from({ length: 40 }, (_, i) => ({ ...SCREEN, slug: 's' + i, purpose: 'a'.repeat(600) })) };
  const r2 = buildPreviewPayload({ product: 'x', inventory: big });
  // pode passar dependendo do tamanho; força com campo enorme
  const huge = { ...INV, brand: { ...INV.brand, vibe: 'a'.repeat(70000) } };
  const r3 = buildPreviewPayload({ product: 'x', inventory: huge });
  assert.equal(r3.ok, false);
  assert.equal(r3.code, 'PAYLOAD_TOO_LARGE');
  void r2;
});

test('dispatchForgePreview: 204 + event_type', async () => {
  let captured;
  const fetchImpl = async (url, opts) => { captured = { url, opts }; return { status: 204 }; };
  const r = await dispatchForgePreview({ token: 't', repo: 'o/r', payload: { x: 1 }, fetchImpl });
  assert.equal(r.ok, true);
  assert.match(captured.url, /o\/r\/dispatches$/);
  assert.equal(JSON.parse(captured.opts.body).event_type, 'forge-preview');
});

test('dispatchForgePreview: !=204 devolve status+detail', async () => {
  const fetchImpl = async () => ({ status: 403, text: async () => 'forbidden' });
  const r = await dispatchForgePreview({ token: 't', repo: 'o/r', payload: {}, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.match(r.detail, /forbidden/);
});

test('previewBaseUrl', () => {
  assert.equal(previewBaseUrl('shopdesk'), '/reqs/api/v1/forge/preview/shopdesk/');
  assert.equal(previewBaseUrl('Bad Slug'), null);
});

// --- estado lido do volume (fail-soft) ---
function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-test-'));
  const prev = process.env.FORGE_PREVIEW_DIR;
  process.env.FORGE_PREVIEW_DIR = dir;
  try { return fn(dir); } finally {
    process.env.FORGE_PREVIEW_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('previewStatus: absent quando volume vazio', () => {
  withTmpDir(() => {
    const st = previewStatus('shopdesk');
    assert.equal(st.status, 'absent');
    assert.equal(st.url, null);
  });
});

test('previewStatus: building quando manifest building', () => {
  withTmpDir((dir) => {
    fs.mkdirSync(path.join(dir, 'shopdesk'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'shopdesk', 'manifest.json'), JSON.stringify({ product: 'shopdesk', jobId: 'j1', status: 'building' }));
    const st = previewStatus('shopdesk');
    assert.equal(st.status, 'building');
    assert.equal(st.jobId, 'j1');
  });
});

test('previewStatus: ready só quando manifest ready E dist/index.html existe', () => {
  withTmpDir((dir) => {
    const pdir = path.join(dir, 'shopdesk');
    fs.mkdirSync(path.join(pdir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(pdir, 'manifest.json'), JSON.stringify({ product: 'shopdesk', jobId: 'j1', status: 'ready', screens: [{ slug: 's', title: 'T', route: '/s', kind: 'list' }] }));
    // sem index.html ainda -> building (marcou ready mas dist não copiado)
    assert.equal(previewStatus('shopdesk').status, 'building');
    fs.writeFileSync(path.join(pdir, 'dist', 'index.html'), '<html></html>');
    const st = previewStatus('shopdesk');
    assert.equal(st.status, 'ready');
    assert.equal(st.url, '/reqs/api/v1/forge/preview/shopdesk/');
    assert.equal(st.screens.length, 1);
  });
});

test('previewStatus: error com mensagem', () => {
  withTmpDir((dir) => {
    fs.mkdirSync(path.join(dir, 'shopdesk'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'shopdesk', 'manifest.json'), JSON.stringify({ status: 'error', error: 'vite quebrou' }));
    const st = previewStatus('shopdesk');
    assert.equal(st.status, 'error');
    assert.match(st.error, /vite quebrou/);
  });
});

test('previewStatus: nunca lança em product inválido', () => {
  const st = previewStatus('../etc');
  assert.equal(st.status, 'invalid');
});

// --- servir assets (anti-traversal) ---
test('resolveAsset: serve index.html + bloqueia traversal', () => {
  withTmpDir((dir) => {
    const distRoot = path.join(dir, 'shopdesk', 'dist');
    fs.mkdirSync(path.join(distRoot, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(distRoot, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(distRoot, 'assets', 'app.js'), 'console.log(1)');
    // raiz -> index.html
    const r = resolveAsset('shopdesk', '');
    assert.equal(r.ok, true);
    assert.match(r.contentType, /text\/html/);
    // asset
    const a = resolveAsset('shopdesk', 'assets/app.js');
    assert.equal(a.ok, true);
    assert.match(a.contentType, /javascript/);
    // rota interna do Vue (sem extensão) -> fallback index.html
    const spa = resolveAsset('shopdesk', 'products/123');
    assert.equal(spa.ok, true);
    assert.match(spa.contentType, /text\/html/);
    // traversal -> FORBIDDEN
    const t = resolveAsset('shopdesk', '../../../../etc/passwd');
    assert.equal(t.ok, false);
    assert.ok(['FORBIDDEN', 'NOT_FOUND'].includes(t.code));
    // produto inválido
    assert.equal(resolveAsset('Bad Slug', 'x').code, 'INVALID_PRODUCT');
  });
});


// --- inventário persistido (A2, Forja 4.0): o refino fora do wizard lê daqui ---
test('previewInventory: NOT_FOUND sem inventory.json; ok e SANEADO quando existe', () => {
  withTmpDir((dir) => {
    assert.equal(previewInventory('shopdesk').ok, false);
    assert.equal(previewInventory('shopdesk').code, 'NOT_FOUND');
    fs.mkdirSync(path.join(dir, 'shopdesk'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'shopdesk', 'inventory.json'), JSON.stringify(INV));
    const r = previewInventory('shopdesk');
    assert.equal(r.ok, true);
    assert.equal(r.inventory.screens[0].slug, 'product-list');
    // fronteira: inventário inválido no volume -> INVALID_INVENTORY (nunca lança)
    fs.writeFileSync(path.join(dir, 'shopdesk', 'inventory.json'), JSON.stringify({ screens: [] }));
    assert.equal(previewInventory('shopdesk').code, 'INVALID_INVENTORY');
    // slug inválido -> INVALID_PRODUCT
    assert.equal(previewInventory('Bad Slug').code, 'INVALID_PRODUCT');
  });
});
