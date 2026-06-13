import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFrontend, count } from './helpers.mjs';

test('404.html: noindex, código 404 e link de volta', () => {
  const h = readFrontend('404.html');
  assert.match(h, /name="robots"[^>]*noindex/);
  assert.ok(h.includes('404'));
  assert.match(h, /href="\/"/);
  assert.equal(count(h, /<h1[\s>]/g), 1);
});

test('robots.txt declara sitemap e user-agent', () => {
  const r = readFrontend('robots.txt');
  assert.match(r, /User-agent:\s*\*/);
  assert.match(r, /Sitemap:\s*https:\/\/dev\.nvit\.com\.br\/sitemap\.xml/);
});

test('sitemap.xml é bem-formado e referencia a raiz', () => {
  const s = readFrontend('sitemap.xml');
  assert.match(s, /<urlset/);
  assert.match(s, /<loc>https:\/\/dev\.nvit\.com\.br\/<\/loc>/);
});

test('site.webmanifest é JSON válido com campos essenciais', () => {
  const m = JSON.parse(readFrontend('site.webmanifest'));
  assert.equal(m.start_url, '/');
  assert.ok(m.name && m.short_name);
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 1);
});

test('favicon.svg e og-cover.svg são SVG', () => {
  assert.match(readFrontend('favicon.svg'), /<svg[\s>]/);
  assert.match(readFrontend('assets/og-cover.svg'), /<svg[\s\S]*viewBox="0 0 1200 630"/);
});

test('nginx.conf aplica segurança, compressão, cache e 404', () => {
  const n = readFrontend('nginx.conf');
  assert.match(n, /Content-Security-Policy/);
  assert.match(n, /Referrer-Policy/);
  assert.match(n, /Permissions-Policy/);
  assert.match(n, /X-Content-Type-Options "nosniff"/);
  assert.match(n, /gzip on;/);
  assert.match(n, /error_page 404 \/404\.html;/);
  assert.match(n, /location = \/healthz/);
  // CSP precisa liberar as Google Fonts e fetch same-origin
  assert.match(n, /fonts\.googleapis\.com/);
  assert.match(n, /connect-src 'self'/);
  // CSP endurecida: a diretiva (não o comentário) não pode ter 'unsafe-inline'
  const csp = (n.match(/Content-Security-Policy "([^"]*)"/) || [])[1] || '';
  assert.ok(csp.length > 0, 'CSP header presente');
  assert.ok(!/unsafe-inline/.test(csp), "diretiva CSP não deve conter 'unsafe-inline'");
});

test('HTML não tem estilos inline (mantém a CSP de style-src endurecida)', () => {
  for (const f of ['index.html', '404.html']) {
    assert.ok(!/\sstyle=/.test(readFrontend(f)), `${f} não deve ter atributo style= inline`);
  }
});

test('HTML não tem scripts/handlers inline (mantém script-src self)', () => {
  const html = readFrontend('index.html');
  // <script> só pode ser o módulo externo ou JSON-LD (data block)
  const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]);
  for (const attrs of scripts) {
    assert.ok(
      /type="application\/ld\+json"/.test(attrs) || /src=/.test(attrs),
      `<script${attrs}> inline não permitido`,
    );
  }
  assert.ok(!/\son\w+=/.test(html), 'sem handlers inline (onclick=...)');
});

test('CSS tem tokens e modo escuro', () => {
  const css = readFrontend('assets/styles.css');
  assert.match(css, /:root\s*\{/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.skip-link/);
});
