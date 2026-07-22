// node:test das funções PURAS da casca (sem DOM). Roda: `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURFACES, normalizeMe, roleLabel, healthFromStatus, healthFromResponse, groupSurfaces, activeSurfaceKey, surfaceLink, productLinks } from './shell.js';

test('SURFACES: manifesto canônico tem os 7 surfaces e caminhos únicos', () => {
  const keys = SURFACES.map((s) => s.key);
  for (const k of ['portal', 'devops', 'reqs', 'portal-rec', 'grafana', 'argocd', 'auth']) assert.ok(keys.includes(k), 'falta ' + k);
  const paths = SURFACES.map((s) => s.path);
  assert.equal(new Set(paths).size, paths.length, 'caminhos duplicados');
  assert.deepEqual(SURFACES.filter((s) => s.external).map((s) => s.key).sort(), ['argocd', 'auth', 'grafana']);
});

test('normalizeMe: eco básico { email, groups, isAdmin } + isMember por grupo', () => {
  const a = normalizeMe({ email: 'flavio@x.com', groups: ['platform-admins', 'project-members'] });
  assert.equal(a.email, 'flavio@x.com');
  assert.deepEqual(a.groups, ['platform-admins', 'project-members']);
  assert.equal(a.isAdmin, true);
  assert.equal(a.isMember, true);
  assert.deepEqual(a.projects, []);
  assert.equal(a.initial, 'F');
  assert.equal(a.authed, true);
  const b = normalizeMe({ user: 'a@b.com', groups: 'project-members,outro' });
  assert.deepEqual(b.groups, ['project-members', 'outro']);
  assert.equal(b.isAdmin, false);
  assert.equal(b.isMember, true);
  assert.equal(b.authed, true);
});

test('normalizeMe: anônimo e flags explícitas', () => {
  const c = normalizeMe(null);
  assert.equal(c.authed, false);
  assert.equal(c.email, '');
  assert.equal(c.initial, '?');
  assert.equal(normalizeMe({ email: 'x@y.z', isAdmin: true }).isAdmin, true);
});

test('normalizeMe: desembrulha o { data } do pm-api (isMember + projects)', () => {
  const m = normalizeMe({ data: { email: 'm@x.com', isAdmin: false, isMember: true, projects: [{ id: 1 }, { id: 2 }] } });
  assert.equal(m.email, 'm@x.com');
  assert.equal(m.isAdmin, false);
  assert.equal(m.isMember, true);
  assert.equal(m.projects.length, 2);
  assert.equal(m.authed, true);
});

test('roleLabel: admin > membro > 1º grupo > sessão', () => {
  assert.equal(roleLabel(normalizeMe({ email: 'a@x', groups: ['platform-admins'] })), 'platform-admin');
  assert.equal(roleLabel(normalizeMe({ data: { email: 'm@x', isMember: true } })), 'acesso a projetos');
  assert.equal(roleLabel(normalizeMe({ email: 'g@x', groups: ['time-foo'] })), 'time-foo');
  assert.equal(roleLabel(normalizeMe({ email: 's@x' })), 'sessão autenticada');
  assert.equal(roleLabel(null), '');
});

test('healthFromStatus: 2xx/3xx/401/403 = up; 404/5xx = down; null = unknown', () => {
  for (const s of [200, 204, 301, 302, 401, 403]) assert.equal(healthFromStatus(s), 'up', String(s));
  for (const s of [404, 500, 502, 503]) assert.equal(healthFromStatus(s), 'down', String(s));
  assert.equal(healthFromStatus(null), 'unknown');
});

test('healthFromResponse: opaque redirect (SSO cross-origin não seguido) = up; 404/5xx = down; erro = unknown', () => {
  // UX-NAV-002: com { redirect: 'manual' } o gate SSO devolve um opaque redirect (type
  // 'opaqueredirect', status 0). A superfície está ROTEADA → 'up' (não mais falso 'down').
  assert.equal(healthFromResponse({ type: 'opaqueredirect', status: 0 }), 'up');
  // respostas diretas same-origin passam pelo mesmo julgamento de healthFromStatus
  assert.equal(healthFromResponse({ type: 'basic', status: 200 }), 'up');
  assert.equal(healthFromResponse({ type: 'basic', status: 401 }), 'up');
  assert.equal(healthFromResponse({ type: 'basic', status: 404 }), 'down');
  assert.equal(healthFromResponse({ type: 'basic', status: 503 }), 'down');
  // resposta ausente (catch/rede) = desconhecido
  assert.equal(healthFromResponse(null), 'unknown');
  assert.equal(healthFromResponse(undefined), 'unknown');
});

test('groupSurfaces: agrupa preservando ordem de aparição (E1: portal-rec vira Ferramenta)', () => {
  const g = groupSurfaces(SURFACES);
  assert.deepEqual(g.map((x) => x.group), ['Plataforma', 'Ferramentas']);
  assert.deepEqual(g[0].items.map((s) => s.key), ['portal', 'devops', 'reqs']);
  assert.deepEqual(g[1].items.map((s) => s.key), ['portal-rec', 'grafana', 'argocd', 'auth']);
});

test('surfaceLink: tabela canônica de deep-links (contexto viaja por URL)', () => {
  // formatos casados com os roteadores REAIS: reqhub applyHashRoute (#/forge?product=) e
  // console App.jsx bloco A4 (#logs?app= / #publications?app= / #conteudo?projeto=[&novo=1]).
  assert.equal(surfaceLink('studio', 'produto', { product: 'contaviva-pro' }), '/reqs/#/forge?product=contaviva-pro');
  assert.equal(surfaceLink('studio', 'produto'), '/reqs/#/forge');
  assert.equal(surfaceLink('console', 'logs', { product: 'shopdesk' }), '/devops/#logs?app=shopdesk');
  assert.equal(surfaceLink('console', 'logs'), '/devops/#logs');
  assert.equal(surfaceLink('console', 'pubs', { product: 'shopdesk' }), '/devops/#publications?app=shopdesk');
  assert.equal(surfaceLink('console', 'conteudo', { product: 'anarabottini' }), '/devops/#conteudo?projeto=anarabottini');
  assert.equal(surfaceLink('console', 'conteudo', { product: 'anarabottini', novo: true }), '/devops/#conteudo?projeto=anarabottini&novo=1');
  assert.equal(surfaceLink('console', 'conteudo', { novo: true }), '/devops/#conteudo?novo=1');
  assert.equal(surfaceLink('rec', 'captura'), '/portal-rec/');
  // contexto é URL-encoded (produto nunca deve quebrar o hash)
  assert.equal(surfaceLink('studio', 'produto', { product: 'a b/c&d' }), '/reqs/#/forge?product=a%20b%2Fc%26d');
  // combinações desconhecidas → null (fail-soft, quem pinta decide esconder)
  assert.equal(surfaceLink('nope', 'x'), null);
  assert.equal(surfaceLink('console', 'nope'), null);
});

test('productLinks: seção "Neste produto" por surface + kind', () => {
  assert.deepEqual(productLinks('', 'devops'), []);
  assert.deepEqual(productLinks(null, 'reqs'), []);
  const onConsole = productLinks('shopdesk', 'devops');
  assert.deepEqual(onConsole.map((l) => l.key), ['studio', 'logs', 'pubs']);
  assert.equal(onConsole[0].href, '/reqs/#/forge?product=shopdesk');
  assert.equal(onConsole[1].href, '/devops/#logs?app=shopdesk');
  assert.equal(onConsole[2].href, '/devops/#publications?app=shopdesk');
  // no reqs (Studio) o link para o próprio Studio é omitido
  const onReqs = productLinks('shopdesk', 'reqs');
  assert.deepEqual(onReqs.map((l) => l.key), ['logs', 'pubs']);
  // Conteúdo (CMS) só "quando fizer sentido": produto portal (kind)
  const portal = productLinks('anarabottini', 'reqs', { kind: 'portal' });
  assert.deepEqual(portal.map((l) => l.key), ['logs', 'pubs', 'conteudo']);
  assert.equal(portal[2].href, '/devops/#conteudo?projeto=anarabottini');
  for (const l of [...onConsole, ...onReqs, ...portal]) { assert.ok(l.href, l.key); assert.ok(l.label, l.key); assert.ok(l.sub, l.key); assert.ok(l.glyph, l.key); }
});

test('activeSurfaceKey: casa o prefixo mais específico; / só casa exato', () => {
  assert.equal(activeSurfaceKey(SURFACES, '/reqs'), 'reqs');
  assert.equal(activeSurfaceKey(SURFACES, '/reqs/'), 'reqs');
  assert.equal(activeSurfaceKey(SURFACES, '/devops/api/apps'), 'devops');
  assert.equal(activeSurfaceKey(SURFACES, '/portal-rec/capture'), 'portal-rec');
  assert.equal(activeSurfaceKey(SURFACES, '/'), 'portal');
  assert.equal(activeSurfaceKey(SURFACES, '/sicat'), null);
});
