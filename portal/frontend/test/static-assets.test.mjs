import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('sitemap.xml lista os portais públicos (CMS) e NÃO expõe rotas com login/operador', () => {
  const s = readFrontend('sitemap.xml');
  // Portais públicos indexáveis
  assert.match(s, /<loc>https:\/\/dev\.nvit\.com\.br\/rmambiental<\/loc>/);
  assert.match(s, /<loc>https:\/\/dev\.nvit\.com\.br\/anarabottini<\/loc>/);
  // Apps com login e ferramentas de operador não entram no sitemap
  for (const priv of [
    '/sicat',
    '/gymops',
    '/devops',
    '/argocd',
    '/grafana',
    '/auth',
    '/portal-rec',
  ]) {
    assert.ok(
      !s.includes(`<loc>https://dev.nvit.com.br${priv}</loc>`),
      `sitemap não deve listar ${priv}`,
    );
  }
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

const JS_GATE =
  "document.documentElement.classList.add('js');window.__pf=setTimeout(function(){document.documentElement.classList.add('no-anim')},2500)";

test('HTML só tem scripts permitidos (externo, JSON-LD ou o js-gate hash-liberado)', () => {
  const html = readFrontend('index.html');
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  for (const [, attrs, body] of scripts) {
    const ok =
      /type="application\/ld\+json"/.test(attrs) || /\ssrc=/.test(attrs) || body.trim() === JS_GATE;
    assert.ok(ok, `<script${attrs}> inline não permitido`);
  }
  assert.ok(!/\son\w+=/.test(html), 'sem handlers inline (onclick=...)');
});

test('o js-gate inline tem o hash sha256 correspondente liberado no CSP', () => {
  const html = readFrontend('index.html');
  assert.ok(html.includes(`<script>${JS_GATE}</script>`), 'js-gate presente no <head>');
  const hash = createHash('sha256').update(JS_GATE, 'utf8').digest('base64');
  const nginx = readFrontend('nginx.conf');
  assert.ok(nginx.includes(`'sha256-${hash}'`), `CSP deve liberar 'sha256-${hash}'`);
  // e nada de 'unsafe-inline' (continua endurecida)
  const csp = (nginx.match(/Content-Security-Policy "([^"]*)"/) || [])[1] || '';
  assert.ok(!/unsafe-inline/.test(csp));
});

test('config.js (no-op default) existe e é carregado antes do portal.js', () => {
  assert.match(readFrontend('assets/config.js'), /window\.PORTAL_CONFIG/);
  assert.ok(readFrontend('assets/shots/placeholder.svg').includes('<svg'));
  const html = readFrontend('index.html');
  assert.ok(
    html.indexOf('/assets/config.js') < html.indexOf('/assets/portal.js'),
    'config.js deve vir antes de portal.js',
  );
});

test('CSS tem tokens e modo escuro', () => {
  const css = readFrontend('assets/styles.css');
  assert.match(css, /:root\s*\{/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.skip-link/);
  // Progressive enhancement: o esconder do reveal é gated por .js (não global)
  assert.match(css, /\.js \.reveal\s*\{/);
  assert.ok(!/^\.reveal\s*\{[^}]*opacity:\s*0/m.test(css), '.reveal não deve esconder sem .js');
  // Failsafe: .no-anim revela tudo se o módulo morrer
  assert.match(css, /\.no-anim \.reveal\s*\{/);
});

test('CSS: foco visível e alvos de toque >=44px (a11y)', () => {
  const css = readFrontend('assets/styles.css');
  // Foco visível consistente em elementos interativos
  assert.match(css, /:focus-visible/);
  // Botão hamburguer (só-ícone) tem alvo de toque >=44px
  const navToggle = (css.match(/\.nav-toggle\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(navToggle, /width:\s*44px/);
  assert.match(navToggle, /height:\s*44px/);
  // Botões ganham min-height de 44px no mobile
  assert.match(css, /min-height:\s*44px/);
});
