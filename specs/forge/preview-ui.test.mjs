// =============================================================================
// preview-ui.test.mjs — testa o gerador de preview (smoke + invariantes), sem rodar vite.
//   - gera um preview a partir de um inventário sintético (todos os kinds),
//   - confere arquivos-chave + manifest + 1 view por tela,
//   - node --check em todo .js/.mjs gerado (syntax válida),
//   - CSP: nenhum .vue gerado tem `style=` inline / `:style` / `v-html`,
//   - determinismo do mock vendorado (mockValue estável p/ o mesmo campo).
// Roda com: node --test specs/forge/preview-ui.test.mjs
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generatePreview } from './preview-ui.mjs';
import { normalizeInventory, pascal } from './lib/ui-inventory.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INVENTORY = {
  product: 'preview-smoke',
  brand: { name: 'Preview Smoke', accent: '#0f766e', neutralBase: 'graphite', radius: 'lg', displayFont: 'Sora' },
  entities: [
    {
      name: 'pedidos', label: 'Pedidos', hasEndpoints: true, anchors: ['REQ-X-0001'],
      fields: [
        { name: 'cliente_nome', label: 'Cliente', type: 'text', required: true },
        { name: 'email', type: 'text' },
        { name: 'valor_total', label: 'Valor', type: 'currency' },
        { name: 'status', type: 'status', enumValues: ['novo', 'pago', 'enviado', 'cancelado'] },
        { name: 'observacoes', type: 'longtext' },
        { name: 'criado_em', type: 'datetime' },
        { name: 'urgente', type: 'boolean' },
      ],
    },
    {
      name: 'produtos', label: 'Produtos', hasEndpoints: true, anchors: ['REQ-X-0002'],
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'preco', type: 'currency' },
        { name: 'categoria', type: 'enum', enumValues: ['A', 'B', 'C'] },
      ],
    },
  ],
  screens: [
    { slug: 'painel', title: 'Painel', kind: 'dashboard', route: '/', entity: null, anchors: ['REQ-X-0001'], purpose: 'Visão geral do negócio.' },
    { slug: 'pedidos-lista', title: 'Pedidos', kind: 'list', route: '/pedidos', entity: 'pedidos', anchors: ['REQ-X-0001'], purpose: 'Acompanhar pedidos.' },
    { slug: 'pedido-novo', title: 'Novo pedido', kind: 'create', route: '/pedidos/novo', entity: 'pedidos', anchors: ['REQ-X-0001'] },
    { slug: 'pedido-editar', title: 'Editar pedido', kind: 'edit', route: '/pedidos/:id/editar', entity: 'pedidos', anchors: ['REQ-X-0001'] },
    { slug: 'pedido-detalhe', title: 'Detalhe do pedido', kind: 'detail', route: '/pedidos/:id', entity: 'pedidos', anchors: ['REQ-X-0001'] },
    { slug: 'produtos-lista', title: 'Produtos', kind: 'list', route: '/produtos', entity: 'produtos', anchors: ['REQ-X-0002'] },
    { slug: 'relatorios', title: 'Relatórios', kind: 'custom', route: '/relatorios', entity: null, anchors: ['REQ-X-0002'], purpose: 'Relatórios gerenciais.' },
  ],
  navGroups: [
    { group: '', items: ['painel'] },
    { group: 'Vendas', items: ['pedidos-lista', 'produtos-lista'] },
    { group: 'Gestão', items: ['relatorios'] },
  ],
  gaps: [],
};

function genToTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-preview-'));
  const r = generatePreview(INVENTORY, { outDir: dir, clean: true });
  return { dir, r };
}

test('gera os arquivos-chave da SPA', () => {
  const { dir, r } = genToTmp();
  try {
    const must = [
      'package.json', 'vite.config.js', 'index.html',
      'src/main.js', 'src/App.vue', 'src/router.js', 'src/nav.js',
      'src/tokens.generated.css', 'src/styles.css', 'src/mock-data.js',
      'src/ui/index.js', 'src/ui/ui.css', 'src/components/PreviewBanner.vue',
      'src/views/NotFoundView.vue', 'preview.manifest.json',
    ];
    for (const f of must) assert.ok(fs.existsSync(path.join(dir, f)), 'falta ' + f);
    // 1 view por tela
    for (const s of INVENTORY.screens) {
      const v = path.join(dir, 'src/views/' + pascal(s.slug) + 'View.vue');
      assert.ok(fs.existsSync(v), 'falta view ' + s.slug);
    }
    // kit vendorado (componentes copiados)
    assert.ok(fs.existsSync(path.join(dir, 'src/ui/components/UiAppShell.vue')), 'kit não vendorado');
    assert.equal(r.screens.length, INVENTORY.screens.length);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('manifest reflete telas + marca', () => {
  const { dir } = genToTmp();
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'preview.manifest.json'), 'utf8'));
    assert.equal(m.product, 'preview-smoke');
    assert.equal(m.screens.length, INVENTORY.screens.length);
    assert.equal(m.brand.accent, '#0f766e');
    assert.equal(m.brand.neutralBase, 'graphite');
    assert.ok(m.base.endsWith('/preview-smoke/'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('base path embute o produto e é usado em vite + router', () => {
  const { dir } = genToTmp();
  try {
    const vite = fs.readFileSync(path.join(dir, 'vite.config.js'), 'utf8');
    assert.match(vite, /\/reqs\/api\/v1\/forge\/preview\/preview-smoke\//);
    const main = fs.readFileSync(path.join(dir, 'src/main.js'), 'utf8');
    assert.match(main, /createWebHistory\("\/reqs\/api\/v1\/forge\/preview\/preview-smoke\/"\)/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('tokens da marca derivados (accent teal + radius lg)', () => {
  const { dir } = genToTmp();
  try {
    const css = fs.readFileSync(path.join(dir, 'src/tokens.generated.css'), 'utf8');
    assert.match(css, /--ui-accent:/);
    assert.match(css, /Preview Smoke/);      // nome da marca no cabeçalho
    assert.match(css, /--ui-radius-lg: 18px/); // radius lg
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('node --check em todo .js/.mjs gerado (syntax válida)', () => {
  const { dir } = genToTmp();
  try {
    const jsFiles = walk(dir).filter((f) => /\.(mjs|js)$/.test(f) && !f.includes('node_modules'));
    assert.ok(jsFiles.length > 0);
    for (const f of jsFiles) {
      execFileSync(process.execPath, ['--check', path.join(dir, f)], { stdio: 'pipe' });
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CSP: nenhum .vue gerado tem style= inline / :style / v-html', () => {
  const { dir } = genToTmp();
  try {
    // só os .vue que o gerador EMITE (fora de src/ui, que é o kit já testado pelo seu próprio gate)
    const generated = walk(dir).filter((f) => f.endsWith('.vue') && !f.startsWith('src/ui/'));
    assert.ok(generated.length > 0);
    for (const f of generated) {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      assert.ok(!/\sstyle\s*=/.test(raw), f + ' tem style= inline');
      assert.ok(!/:style\b/.test(raw), f + ' tem :style');
      assert.ok(!/v-html\b/.test(raw), f + ' tem v-html');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('views importam o kit e o mock-data (não chamam backend)', () => {
  const { dir } = genToTmp();
  try {
    const viewsDir = path.join(dir, 'src/views');
    for (const f of fs.readdirSync(viewsDir)) {
      if (f === 'NotFoundView.vue') continue;
      const raw = fs.readFileSync(path.join(viewsDir, f), 'utf8');
      assert.match(raw, /from '\.\.\/ui\/index\.js'/, f + ' não importa o kit');
      // não pode chamar /v1/ nem fetch a backend
      assert.ok(!/\/v1\//.test(raw), f + ' referencia rota de backend /v1/');
      assert.ok(!/\bfetch\(/.test(raw), f + ' faz fetch (preview é mock)');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('mock-data vendorado é determinístico (mesma API mockValue/mockRows)', async () => {
  const { dir } = genToTmp();
  try {
    const modUrl = 'file://' + path.join(dir, 'src/mock-data.js').replace(/\\/g, '/');
    const mod = await import(modUrl);
    assert.equal(typeof mod.mockValue, 'function');
    assert.equal(typeof mod.mockRows, 'function');
    const a = mod.mockValue({ name: 'email', type: 'text' });
    const b = mod.mockValue({ name: 'email', type: 'text' });
    assert.equal(a, b, 'mockValue não-determinístico');
    assert.match(a, /@/, 'campo email não parece e-mail');
    const rows = mod.mockRows([{ name: 'valor', type: 'currency' }, { name: 'status', type: 'status', enumValues: ['x', 'y'] }], 5);
    assert.equal(rows.length, 5);
    assert.equal(typeof rows[0].id, 'number');
    assert.ok(['x', 'y'].includes(rows[0].status));
    const rows2 = mod.mockRows([{ name: 'valor', type: 'currency' }, { name: 'status', type: 'status', enumValues: ['x', 'y'] }], 5);
    assert.deepEqual(rows, rows2, 'mockRows não-determinístico');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SEGURANÇA: nome de campo/entidade HOSTIL é saneado/descartado e NÃO escapa p/ o .vue', () => {
  // inventário com nomes hostis tentando quebrar atributo/expressão Vue + injetar marca no CSS.
  const HOSTILE = {
    product: 'hostile',
    brand: { name: 'Evil */ body{display:none} /*', accent: '#0f766e', neutralBase: 'slate', radius: 'md', displayFont: 'Sora; } body { x: y' },
    entities: [
      {
        name: 'recs', label: 'Recs', hasEndpoints: true, anchors: ['REQ-X-0001'],
        fields: [
          { name: 'a" @click="x', label: 'A hostil', type: 'text' },     // tenta sair do atributo
          { name: 'b}}<x>', label: 'B hostil', type: 'status', enumValues: ['ok', 'bad'] }, // tenta fechar mustache/abrir tag
          { name: 'c\' onload=\'y', label: 'C hostil', type: 'longtext' }, // aspas simples
          { name: '!!!', label: 'Só símbolos', type: 'text' },            // vira vazio -> DESCARTADO
          { name: 'valido_1', label: 'Válido', type: 'currency' },        // sobrevive intacto
        ],
      },
      { name: 'x"><script>', label: 'Entidade hostil', hasEndpoints: false, anchors: ['REQ-X-0002'], fields: [{ name: 'q', type: 'text' }] },
      { name: '###', label: 'Entidade lixo', hasEndpoints: false, anchors: ['REQ-X-0002'], fields: [{ name: 'z', type: 'text' }] }, // descartada
    ],
    screens: [
      { slug: 'painel', title: 'Painel', kind: 'dashboard', route: '/', entity: null, anchors: ['REQ-X-0001'] },
      { slug: 'recs-lista', title: 'Registros', kind: 'list', route: '/recs', entity: 'recs', anchors: ['REQ-X-0001'] },
      { slug: 'rec-novo', title: 'Novo', kind: 'create', route: '/recs/novo', entity: 'recs', anchors: ['REQ-X-0001'] },
      { slug: 'rec-detalhe', title: 'Detalhe', kind: 'detail', route: '/recs/:id', entity: 'recs', anchors: ['REQ-X-0001'] },
    ],
    gaps: [],
  };

  // (i) normalizeInventory saneia: nomes restritos a [a-zA-Z0-9_], lixo descartado.
  const norm = normalizeInventory(HOSTILE);
  const recs = norm.entities.find((e) => e.name === 'recs');
  assert.ok(recs, 'entidade recs sumiu');
  for (const f of recs.fields) {
    assert.match(f.name, /^[a-zA-Z0-9_]+$/, 'field.name não saneado: ' + JSON.stringify(f.name));
  }
  // os 3 campos hostis viram identificadores; o '!!!' (vazio após sanear) é DESCARTADO.
  assert.ok(!recs.fields.some((f) => f.name === ''), 'campo vazio não foi descartado');
  assert.equal(recs.fields.length, 4, 'esperado 4 campos (1 lixo descartado)');
  assert.ok(recs.fields.some((f) => f.name === 'valido_1'), 'campo válido foi perdido');
  // entidade '###' (vazia após sanear) é DESCARTADA; 'x"><script>' vira identificador.
  assert.ok(!norm.entities.some((e) => e.name === ''), 'entidade vazia não foi descartada');
  assert.ok(!norm.entities.some((e) => /[^a-zA-Z0-9_]/.test(e.name)), 'entity.name não saneado');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-preview-hostile-'));
  try {
    generatePreview(HOSTILE, { outDir: dir, clean: true });
    // (ii) NENHUM .vue gerado contém os tokens de BREAKOUT (saída de atributo/expressão/tag). Os
    // v-model/record/:status usam acesso por índice com literal serializado, então o nome hostil — mesmo
    // que tivesse sobrevivido — não escaparia. Aqui já está saneado a identificador, então some de vez.
    const generated = walk(dir).filter((f) => f.endsWith('.vue') && !f.startsWith('src/ui/'));
    assert.ok(generated.length > 0);
    // Fragmentos do PAYLOAD HOSTIL (vindos dos field.name) que NUNCA podem aparecer no .vue gerado.
    // (Nota: `@click=` legítimo do template não conta — checamos os fragmentos ÚNICOS do ataque.)
    const PAYLOAD_FRAGS = ['" @click="x', 'onload=\'y', '}}<x>', '<script>', '<x>'];
    for (const f of generated) {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const p of PAYLOAD_FRAGS) {
        assert.ok(!raw.includes(p), f + ' contém fragmento do payload hostil: ' + JSON.stringify(p));
      }
      // v-model / :status DEVEM usar ACESSO POR ÍNDICE (formv[...] / record[...]), nunca `.<name>` cru.
      assert.ok(!/v-model="formv\.[^"]+"/.test(raw), f + ' tem v-model="formv.<name>" (acesso por membro cru)');
      assert.ok(!/:status="record\.[^"]+"/.test(raw), f + ' tem :status="record.<name>" (acesso por membro cru)');
      // se há v-model, tem de ser pela forma INDEXADA com literal de aspas SIMPLES (sq) — nunca aspas
      // duplas dentro do atributo (quebraria o delimitador). Ex.: v-model="formv['nome']".
      if (raw.includes('v-model="formv')) {
        assert.match(raw, /v-model="formv\['[^']*'\]"/, f + ' v-model não usa acesso por índice com literal de aspas simples');
        assert.ok(!/v-model="formv\["/.test(raw), f + ' v-model usa aspas duplas dentro do atributo (delimitador quebrado)');
      }
    }
    // (ii.b) o CSS de tokens (marca) NÃO recebe o breakout do name/displayFont: o `*/` não fecha o
    // comentário cedo e não há `{`/`}` injetando regra; o displayFont não injeta `;`/`}`.
    const css = fs.readFileSync(path.join(dir, 'src/tokens.generated.css'), 'utf8');
    const header = css.split('\n').slice(0, 2).join('\n'); // o name vive só no comentário de cabeçalho
    assert.ok(!header.includes('*/ '), 'name hostil fechou o comentário do CSS cedo');
    assert.ok(!/\bbody\s*\{/.test(css), 'name hostil injetou uma regra CSS (body { ... })');
    const fontLine = css.split('\n').find((l) => l.includes('--ui-font-display')) || '';
    assert.match(fontLine, /--ui-font-display:\s*[A-Za-z0-9 _-]+,/, 'displayFont injetou caracteres na declaração: ' + fontLine);
    // (iii) o build não quebra (sintaxe): node --check em todo .js/.mjs gerado.
    const jsFiles = walk(dir).filter((f) => /\.(mjs|js)$/.test(f) && !f.includes('node_modules'));
    for (const f of jsFiles) execFileSync(process.execPath, ['--check', path.join(dir, f)], { stdio: 'pipe' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('normalizeInventory descarta telas inválidas e preenche defaults', () => {
  const out = normalizeInventory({
    brand: { name: 'X', accent: 'nao-hex' },
    screens: [
      { slug: 'ok', title: 'OK', kind: 'list', route: '/ok', anchors: ['R1'] },
      { slug: 'sem-titulo' },                 // descartada (sem title)
      { slug: 'ok', title: 'dup', kind: 'list', route: '/dup', anchors: [] }, // dup slug -> descartada
      { slug: 'bad-kind', title: 'Bad', kind: 'inexistente', route: 'sem-barra', anchors: [] },
    ],
    entities: [{ name: 'e1', fields: [{ name: 'f1', type: 'zzz' }] }],
  });
  assert.equal(out.brand.accent, '#4f46e5'); // hex inválido -> default
  assert.equal(out.screens.length, 2);       // ok + bad-kind
  const bad = out.screens.find((s) => s.slug === 'bad-kind');
  assert.equal(bad.kind, 'custom');          // kind inválido -> custom
  assert.ok(bad.route.startsWith('/'));      // rota normalizada
  assert.equal(out.entities[0].fields[0].type, 'text'); // tipo inválido -> text
});

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, base));
    else out.push(path.relative(base, abs).replace(/\\/g, '/'));
  }
  return out;
}
