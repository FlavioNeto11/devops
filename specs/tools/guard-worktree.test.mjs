import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, globToRegExp, DENYLIST, ALWAYS_ALLOW } from './guard-worktree.mjs';

test('glob: ** cruza segmentos; * fica no segmento', () => {
  assert.ok(globToRegExp('apps/sicat/**').test('apps/sicat/src/x.js'));
  assert.ok(globToRegExp('apps/sicat/**').test('apps/sicat/a/b/c.ts'));
  assert.ok(!globToRegExp('apps/sicat/**').test('apps/gymops/a.js'));
  assert.ok(globToRegExp('**/.env.*').test('apps/x/.env.docker'));
  assert.ok(globToRegExp('**/*.secret.yaml').test('console/k8s/db.secret.yaml'));
  // sealed-secret (criptografado, seguro) NÃO casa com *.secret.yaml
  assert.ok(!globToRegExp('**/*.secret.yaml').test('apps/x/k8s/sealed-secret.yaml'));
});

test('produto: dentro do allowed_paths passa; fora reprova', () => {
  const opts = { allowedPaths: ['apps/sicat/**'], restricted: false };
  assert.equal(evaluate(['apps/sicat/src/server.js'], opts).ok, true);
  const out = evaluate(['apps/gymops/src/x.js'], opts);
  assert.equal(out.ok, false);
  assert.match(out.violations[0].reason, /fora de allowed_paths/);
});

test('denylist vence mesmo dentro do allowed_paths', () => {
  // escopo specs PODE tocar specs/**, mas specs/requirements/** é denylist
  const specs = evaluate(['specs/requirements/sicat/REQ-SICAT-0002.yaml'], { allowedPaths: ['specs/**'], restricted: false });
  assert.equal(specs.ok, false);
  assert.match(specs.violations[0].reason, /denylist/);
  // secret dentro do próprio app também é denylist
  const sec = evaluate(['apps/sicat/k8s/db.secret.yaml'], { allowedPaths: ['apps/sicat/**'], restricted: false });
  assert.equal(sec.ok, false);
  assert.match(sec.violations[0].reason, /denylist/);
});

test('denylist transversal: .github, platform, .claude sempre proibidos', () => {
  for (const f of ['.github/workflows/ci.yml', 'platform/argocd/apps/x.yaml', '.claude/settings.json']) {
    const out = evaluate([f], { allowedPaths: ['apps/sicat/**'], restricted: false });
    assert.equal(out.ok, false, `${f} deveria reprovar`);
    assert.match(out.violations[0].reason, /denylist/);
  }
});

test('testes LOCKED são denylist mesmo dentro do allowed_paths do app', () => {
  // o headless tem allowed_paths apps/<app>/** mas NÃO pode tocar tests/locked nem o manifesto
  const a = evaluate(['apps/stockpilot/tests/locked/functional/REQ-STOCKPILOT-0001.ac1.test.mjs'], { allowedPaths: ['apps/stockpilot/**'], restricted: false });
  assert.equal(a.ok, false);
  assert.match(a.violations[0].reason, /denylist/);
  const m = evaluate(['apps/stockpilot/tests/.test-locks.json'], { allowedPaths: ['apps/stockpilot/**'], restricted: false });
  assert.equal(m.ok, false);
  assert.match(m.violations[0].reason, /denylist/);
  // testes NÃO-locked (fora de tests/locked) seguem editáveis pelo headless
  const ok = evaluate(['apps/stockpilot/test/integration.mjs', 'apps/stockpilot/api/test/x.test.mjs'], { allowedPaths: ['apps/stockpilot/**'], restricted: false });
  assert.equal(ok.ok, true);
});

test('escopo restrito: qualquer edição reprova (allowed vazio)', () => {
  const out = evaluate(['platform/keycloak/realm.yaml', 'apps/x/y.js'], { allowedPaths: [], restricted: true });
  assert.equal(out.ok, false);
  assert.equal(out.violations.length, 2);
});

test('exceção: implementation-status.json sempre permitido', () => {
  assert.ok(ALWAYS_ALLOW.has('specs/baseline/implementation-status.json'));
  const out = evaluate(['specs/baseline/implementation-status.json', 'apps/sicat/src/x.js'], { allowedPaths: ['apps/sicat/**'], restricted: false });
  assert.equal(out.ok, true);
});

test('normaliza separador do Windows e ./ inicial', () => {
  const out = evaluate(['.\\apps\\sicat\\src\\x.js'], { allowedPaths: ['apps/sicat/**'], restricted: false });
  assert.equal(out.ok, true);
});

test('DENYLIST cobre os pontos exigidos pela validação', () => {
  for (const g of ['.github/**', 'platform/**', 'specs/requirements/**', '**/.env', '**/*.secret.yaml']) {
    assert.ok(DENYLIST.includes(g), `denylist precisa conter ${g}`);
  }
});
