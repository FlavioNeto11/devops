// node:test das funções PURAS da casca (sem DOM). Roda: `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURFACES, normalizeMe, healthFromStatus, groupSurfaces, activeSurfaceKey } from './shell.js';

test('SURFACES: manifesto canônico tem os 7 surfaces e caminhos únicos', () => {
  const keys = SURFACES.map((s) => s.key);
  for (const k of ['portal', 'devops', 'reqs', 'portal-rec', 'grafana', 'argocd', 'auth']) assert.ok(keys.includes(k), 'falta ' + k);
  const paths = SURFACES.map((s) => s.path);
  assert.equal(new Set(paths).size, paths.length, 'caminhos duplicados');
  assert.deepEqual(SURFACES.filter((s) => s.external).map((s) => s.key).sort(), ['argocd', 'auth', 'grafana']);
});

test('normalizeMe: email/grupos/isAdmin/initial; fail-soft', () => {
  const a = normalizeMe({ email: 'flavio@x.com', groups: ['platform-admins', 'project-members'] });
  assert.deepEqual(a, { email: 'flavio@x.com', groups: ['platform-admins', 'project-members'], isAdmin: true, initial: 'F', authed: true });
  const b = normalizeMe({ user: 'a@b.com', groups: 'project-members,outro' });
  assert.deepEqual(b.groups, ['project-members', 'outro']);
  assert.equal(b.isAdmin, false);
  assert.equal(b.authed, true);
  const c = normalizeMe(null);
  assert.deepEqual(c, { email: '', groups: [], isAdmin: false, initial: '?', authed: false });
  assert.equal(normalizeMe({ email: 'x@y.z', isAdmin: true }).isAdmin, true);
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
