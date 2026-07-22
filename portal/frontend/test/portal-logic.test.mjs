import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  prettifyName,
  basePathOf,
  inferRequiresLogin,
  parseIngressRoutes,
  appsInNamespace,
  livePathSet,
  discoverExtras,
  matchesQuery,
  searchText,
  extraCardHTML,
  stateMarkup,
  isAuthError,
} from '../assets/portal.js';

test('escapeHtml neutraliza caracteres perigosos', () => {
  assert.equal(escapeHtml('<img src=x onerror="y">'), '&lt;img src=x onerror=&quot;y&quot;&gt;');
  assert.equal(escapeHtml(null), '');
});

test('prettifyName humaniza nomes de recursos k8s', () => {
  assert.equal(prettifyName('portal-recorder'), 'Portal Recorder');
  assert.equal(prettifyName('my_cool_app'), 'My Cool App');
});

test('basePathOf escolhe o menor path não-raiz e normaliza trailing slash', () => {
  assert.equal(basePathOf(['/sicat/api', '/sicat']), '/sicat');
  assert.equal(basePathOf(['/sicat/']), '/sicat'); // trailing slash normalizado
  assert.equal(basePathOf(['/']), null);
  assert.equal(basePathOf([]), null);
});

test('inferRequiresLogin detecta middlewares de auth', () => {
  assert.equal(inferRequiresLogin(['sicat-oidc', 'compress']), true);
  assert.equal(inferRequiresLogin(['forward-auth']), true);
  assert.equal(inferRequiresLogin(['strip-prefix', 'compress']), false);
});

test('parseIngressRoutes normaliza e descarta rotas sem base path', () => {
  const data = [
    {
      name: 'sicat',
      namespace: 'apps',
      paths: ['/sicat', '/sicat/api'],
      hosts: ['dev.nvit.com.br'],
      routes: [{ middlewares: ['sicat-oidc'] }],
    },
    { name: 'portal', namespace: 'devops-system', paths: ['/'], routes: [] },
  ];
  const parsed = parseIngressRoutes(data);
  assert.equal(parsed.length, 1);
  assert.deepEqual(
    { name: parsed[0].name, basePath: parsed[0].basePath, requiresLogin: parsed[0].requiresLogin },
    { name: 'sicat', basePath: '/sicat', requiresLogin: true },
  );
});

test('appsInNamespace e livePathSet', () => {
  const apps = [
    { name: 'a', namespace: 'apps', basePath: '/a' },
    { name: 'b', namespace: 'other', basePath: '/b' },
  ];
  assert.equal(appsInNamespace(apps).length, 1);
  assert.ok(livePathSet(apps).has('/a'));
});

test('discoverExtras deduplica contra o catálogo curado', () => {
  const apps = [
    { name: 'sicat', namespace: 'apps', basePath: '/sicat', requiresLogin: true },
    { name: 'novo-app', namespace: 'apps', basePath: '/novo', requiresLogin: false },
    { name: 'novo-app', namespace: 'apps', basePath: '/novo', requiresLogin: false },
  ];
  const extras = discoverExtras(apps, ['/sicat']);
  assert.equal(extras.length, 1);
  assert.equal(extras[0].basePath, '/novo');
  assert.equal(extras[0].name, 'Novo App');
});

test('app só-de-API / control-plane (sem frontend na raiz) NÃO vira card', () => {
  // ai-control-plane real: só PathPrefix(/ai-control/api) -> linkar /ai-control daria 404
  const data = [
    { name: 'ai-control-plane', namespace: 'apps', paths: ['/ai-control/api'], routes: [] },
  ];
  const apps = appsInNamespace(parseIngressRoutes(data));
  assert.equal(discoverExtras(apps, []).length, 0);
});

test('app navegável (frontend na raiz + api) vira UM card', () => {
  const data = [
    { name: 'foo', namespace: 'apps', paths: ['/foo'], routes: [] },
    { name: 'foo-api', namespace: 'apps', paths: ['/foo/api'], routes: [] },
  ];
  const apps = appsInNamespace(parseIngressRoutes(data));
  const extras = discoverExtras(apps, []);
  assert.equal(extras.length, 1);
  assert.equal(extras[0].basePath, '/foo');
});

test('app curada com trailing slash não vira card extra duplicado', () => {
  const data = [
    { name: 'sicat', namespace: 'apps', paths: ['/sicat/'], routes: [] },
    { name: 'sicat-api', namespace: 'apps', paths: ['/sicat/api'], routes: [] },
  ];
  const apps = appsInNamespace(parseIngressRoutes(data));
  const extras = discoverExtras(apps, ['/sicat']);
  assert.equal(extras.length, 0); // /sicat/ normaliza para /sicat (curado) → sem duplicata
});

test('matchesQuery: termo vazio casa tudo; tokens exigem todos', () => {
  const hay = searchText(['SICAT', 'gestão ambiental', 'cetesb']);
  assert.equal(matchesQuery(hay, ''), true);
  assert.equal(matchesQuery(hay, 'cetesb'), true);
  assert.equal(matchesQuery(hay, 'sicat ambiental'), true);
  assert.equal(matchesQuery(hay, 'gymops'), false);
});

test('extraCardHTML: card seguro com nome, path, status e CTA', () => {
  const html = extraCardHTML({ name: 'Novo App', basePath: '/novo', requiresLogin: true });
  assert.match(html, /<article class="card prod"/);
  assert.match(html, /Acessar Novo App/);
  assert.match(html, /href="\/novo"/);
  assert.match(html, /badge is-online/);
  assert.match(html, /exige login/);
  // injeção é escapada
  const evil = extraCardHTML({ name: '<x>', basePath: '/x', requiresLogin: false });
  assert.ok(!evil.includes('<x>'));
  assert.ok(evil.includes('&lt;x&gt;'));
});

test('isAuthError reconhece 401/403 (recurso de operador, esconde a seção)', () => {
  assert.equal(isAuthError(401), true);
  assert.equal(isAuthError(403), true);
  assert.equal(isAuthError(500), false);
  assert.equal(isAuthError(undefined), false);
});

test('stateMarkup cobre loading, empty e error', () => {
  assert.match(stateMarkup('loading'), /skeleton/);
  assert.match(stateMarkup('empty'), /Nenhuma aplicação extra/);
  const err = stateMarkup('error', { message: 'timeout x' });
  assert.match(err, /role="alert"/);
  assert.match(err, /data-retry/);
  assert.match(err, /timeout x/);
});

test('stateMarkup expired: aviso de sessão + CTA de relogin com href escapado', () => {
  const html = stateMarkup('expired', { loginHref: '/oauth2/start?rd=%2F' });
  assert.match(html, /Sua sessão expirou/);
  assert.match(html, /href="\/oauth2\/start\?rd=%2F"/);
  // href é escapado (sem aspas cruas injetadas)
  const evil = stateMarkup('expired', { loginHref: '"/x"><script>' });
  assert.ok(!evil.includes('"/x"><script>'));
  assert.match(evil, /&quot;/);
});
