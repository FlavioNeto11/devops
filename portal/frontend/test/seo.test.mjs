import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFrontend, count } from './helpers.mjs';

const html = readFrontend('index.html');

test('declara idioma pt-BR e charset UTF-8', () => {
  assert.match(html, /<html[^>]*\blang="pt-BR"/);
  assert.match(html, /<meta[^>]*charset="UTF-8"/i);
});

test('tem meta viewport responsiva', () => {
  assert.match(html, /<meta[^>]*name="viewport"[^>]*width=device-width/);
});

test('título e descrição contêm a marca', () => {
  assert.match(html, /<title>[^<]*NovaIT[^<]*<\/title>/);
  assert.match(html, /<meta[^>]*name="description"[^>]*content="[^"]*NovaIT/);
});

test('possui exatamente um h1', () => {
  assert.equal(count(html, /<h1[\s>]/g), 1);
});

test('SEO: canonical, robots e keywords', () => {
  assert.match(html, /<link[^>]*rel="canonical"[^>]*href="https:\/\/dev\.nvit\.com\.br\/"/);
  assert.match(html, /<meta[^>]*name="robots"[^>]*content="index, follow"/);
  assert.match(html, /<meta[^>]*name="keywords"/);
  assert.match(html, /<meta[^>]*name="author"/);
});

test('Open Graph e Twitter Cards básicos', () => {
  assert.match(html, /<meta[^>]*property="og:title"/);
  assert.match(html, /<meta[^>]*property="og:description"/);
  assert.match(html, /<meta[^>]*property="og:url"[^>]*dev\.nvit\.com\.br/);
  assert.match(html, /<meta[^>]*property="og:image"/);
  assert.match(html, /<meta[^>]*name="twitter:card"[^>]*content="summary_large_image"/);
  assert.match(html, /<meta[^>]*name="twitter:image"/);
});

test('ícone, manifesto e theme-color por esquema', () => {
  assert.match(html, /<link[^>]*rel="icon"[^>]*favicon\.svg/);
  assert.match(html, /<link[^>]*rel="manifest"[^>]*site\.webmanifest/);
  assert.match(html, /theme-color"[^>]*media="\(prefers-color-scheme: dark\)"/);
});

test('CSS e JS são externos (CSP-friendly) e versionados', () => {
  assert.match(html, /<link[^>]*rel="stylesheet"[^>]*\/assets\/styles\.css\?v=/);
  assert.match(html, /<script[^>]*type="module"[^>]*\/assets\/portal\.js\?v=/);
});

test('JSON-LD presente e parseável (Organization + WebSite)', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 2, 'esperava >= 2 blocos JSON-LD');
  const parsed = blocks.map((b) => JSON.parse(b[1]));
  const types = parsed.map((p) => p['@type']);
  assert.ok(types.includes('Organization'));
  assert.ok(types.includes('WebSite'));
});

test('não há artefato de template literal vazado no HTML', () => {
  assert.ok(!html.includes('${'), 'HTML não deve conter ${...}');
});
