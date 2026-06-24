// forge-status.test.js — buildLaunchStatus mapeia o estado do GitHub p/ stages (fail-soft).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunchStatus, slugToReqPrefix } from './forge-status.js';

function mkFetch(routes) {
  return async (url) => {
    for (const [match, body] of routes) {
      if (url.includes(match)) return { ok: true, json: async () => body };
    }
    return { ok: true, json: async () => [] };
  };
}

test('product inválido => INVALID_PRODUCT', async () => {
  const out = await buildLaunchStatus({ token: 't', repo: 'o/r', product: 'X!', fetchImpl: mkFetch([]) });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'INVALID_PRODUCT');
});

test('reqs merged + plan aberto + impl em andamento', async () => {
  const fetchImpl = mkFetch([
    ['head=o:forge%2Fmeuapp%2Frequisitos', [{ number: 5, state: 'closed', merged_at: '2026-01-01', html_url: 'u5', created_at: '2026-01-01', title: 't' }]],
    ['head=o:forge%2Fplan%2Fmeuapp', [{ number: 6, state: 'open', merged_at: null, html_url: 'u6', created_at: '2026-01-02', title: 't' }]],
    ['pulls?state=open', [{ number: 7, head: { ref: 'req/REQ-MEUAPP-0001/x' }, labels: [{ name: 'claude-generated' }], html_url: 'u7', title: 't' }]],
  ]);
  const out = await buildLaunchStatus({ token: 't', repo: 'o/r', product: 'meuapp', fetchImpl });
  assert.equal(out.ok, true);
  const by = Object.fromEntries(out.stages.map((s) => [s.key, s]));
  assert.equal(by.requisitos.status, 'done');
  assert.equal(by.plano.status, 'active');
  assert.equal(by.build.status, 'active');
  assert.match(by.build.detail, /1 PR/);
});

test('nada disparado ainda => tudo pending', async () => {
  const out = await buildLaunchStatus({ token: 't', repo: 'o/r', product: 'novo', fetchImpl: mkFetch([]) });
  const by = Object.fromEntries(out.stages.map((s) => [s.key, s]));
  assert.equal(by.requisitos.status, 'pending');
  assert.equal(by.plano.status, 'pending');
});

test('slugToReqPrefix remove hífens e sobe caixa', () => {
  assert.equal(slugToReqPrefix('forja-gate-test'), 'REQ-FORJAGATETEST-');
});
