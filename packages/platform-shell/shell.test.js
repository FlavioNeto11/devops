// node:test das funções PURAS da casca (sem DOM). Roda: `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURFACES, normalizeMe, roleLabel, healthFromStatus, groupSurfaces, activeSurfaceKey } from './shell.js';

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

test('groupSurfaces: agrupa preservando ordem de aparição', () => {
  const g = groupSurfaces(SURFACES);
  assert.deepEqual(g.map((x) => x.group), ['Plataforma', 'Ferramentas']);
  assert.deepEqual(g[0].items.map((s) => s.key), ['portal', 'devops', 'reqs', 'portal-rec']);
  assert.deepEqual(g[1].items.map((s) => s.key), ['grafana', 'argocd', 'auth']);
});

test('activeSurfaceKey: casa o prefixo mais específico; / só casa exato', () => {
  assert.equal(activeSurfaceKey(SURFACES, '/reqs'), 'reqs');
  assert.equal(activeSurfaceKey(SURFACES, '/reqs/'), 'reqs');
  assert.equal(activeSurfaceKey(SURFACES, '/devops/api/apps'), 'devops');
  assert.equal(activeSurfaceKey(SURFACES, '/portal-rec/capture'), 'portal-rec');
  assert.equal(activeSurfaceKey(SURFACES, '/'), 'portal');
  assert.equal(activeSurfaceKey(SURFACES, '/sicat'), null);
});
