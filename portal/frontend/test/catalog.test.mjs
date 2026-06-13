import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, TOOLS, curatedPaths, catalogByPath } from '../assets/catalog.js';
import { readFrontend } from './helpers.mjs';

test('catálogo cobre os produtos e portais conhecidos', () => {
  const keys = PRODUCTS.map((p) => p.key);
  for (const k of ['sicat', 'gymops', 'rmambiental', 'anarabottini']) {
    assert.ok(keys.includes(k), `faltou produto ${k}`);
  }
});

test('produtos que exigem login estão marcados', () => {
  const sicat = PRODUCTS.find((p) => p.key === 'sicat');
  assert.equal(sicat.requiresLogin, true);
});

test('DevOps Console (gated por OIDC) tem requiresLogin true', () => {
  const devops = TOOLS.find((t) => t.key === 'devops');
  assert.equal(devops.requiresLogin, true);
  // portal-recorder não tem gate OIDC → false (confirmado no IngressRoute)
  const rec = TOOLS.find((t) => t.key === 'portal-rec');
  assert.equal(rec.requiresLogin, false);
});

test('ferramentas cobrem as rotas da plataforma', () => {
  const paths = TOOLS.map((t) => t.path);
  for (const p of ['/devops', '/grafana', '/argocd', '/auth', '/portal-rec']) {
    assert.ok(paths.includes(p), `faltou ferramenta em ${p}`);
  }
});

test('curatedPaths e catalogByPath estão consistentes', () => {
  const paths = curatedPaths();
  for (const p of ['/sicat', '/gymops', '/rmambiental', '/anarabottini', '/devops', '/auth']) {
    assert.ok(paths.includes(p));
  }
  const map = catalogByPath();
  assert.equal(map['/sicat'].name, 'SICAT');
  assert.equal(map['/auth'].name, 'Keycloak');
});

test('os CTAs do catálogo batem com os cards estáticos do index.html', () => {
  const html = readFrontend('index.html');
  for (const a of [...PRODUCTS, ...TOOLS]) {
    assert.ok(
      html.includes(`>${a.cta}<`) || html.includes(a.cta),
      `CTA do catálogo ausente no HTML: "${a.cta}" (${a.key})`,
    );
    assert.ok(html.includes(`href="${a.path}"`), `rota do catálogo ausente no HTML: ${a.path}`);
  }
});
