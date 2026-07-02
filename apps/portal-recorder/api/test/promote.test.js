import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROMOTE_SLUG_RE, MAX_PAYLOAD_BYTES,
  canonicalize, contentHashOfEndpoints, deriveGroup, endpointId,
  buildCanonicalExport, buildPromotePayload, dispatchContractPromote,
} from '../src/promote.js';

// ── fixtures (linhas do banco, COM samples — o export deve descartá-los) ──────
const PORTAL = { id: 'por_1', slug: 'cetesb', base_origin: 'https://mtrr.cetesb.sp.gov.br' };
const CONTRACT = { id: 'ctr_abc', portal_id: 'por_1', session_id: 'cap_9', version: 3, created_at: '2026-07-01T12:00:00.000Z' };
const DB_ENDPOINTS = [
  {
    method: 'POST', host: 'mtrr.cetesb.sp.gov.br', path_template: '/api/mtr/carregaDadosLogin',
    requires_auth: false, requires_captcha: true, occurrence_count: 2,
    request_schema: { type: 'object', properties: { login: { type: 'string', sensitive: true } } },
    response_schema: { type: 'object', properties: { token: { type: 'string', sensitive: true } } },
    sample_request: { login: '***', senha: '***' },
    sample_response: { token: '***' },
  },
  {
    method: 'GET', host: 'mtrr.cetesb.sp.gov.br', path_template: '/api/mtr/manifesto/{p3}',
    requires_auth: true, requires_captcha: false, occurrence_count: 5,
    request_schema: {}, response_schema: { type: 'object', properties: { manNumero: { type: 'string' } } },
    sample_request: {}, sample_response: { manNumero: '4700001' },
  },
];

const makeExport = () => buildCanonicalExport({
  portal: PORTAL, contract: CONTRACT, endpoints: DB_ENDPOINTS, now: new Date('2026-07-02T10:00:00Z'),
});

test('deriveGroup: pula segmentos genéricos e params; fallback general', () => {
  assert.equal(deriveGroup('/api/mtr/manifesto/{p3}'), 'mtr');
  assert.equal(deriveGroup('/v1/{p1}/cdf'), 'cdf');
  assert.equal(deriveGroup('/api/v2/'), 'general');
});

test('endpointId: estável, no padrão canônico e único (sufixo em colisão)', () => {
  const taken = new Set();
  const a = endpointId('cetesb', 'GET', '/api/mtr/manifesto/{p3}', taken);
  const b = endpointId('cetesb', 'GET', '/api/mtr/manifesto/{p3}', taken);
  assert.equal(a, 'cetesb-get-api-mtr-manifesto-p3');
  assert.equal(b, 'cetesb-get-api-mtr-manifesto-p3-2');
  for (const id of [a, b]) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)+$/);
});

test('buildCanonicalExport: manifest completo + endpoints SEM samples', () => {
  const ex = makeExport();
  assert.equal(ex.ok, true);
  const { manifest, endpoints } = ex.value;

  assert.equal(manifest.portal, 'cetesb');
  assert.equal(manifest.base_url, 'https://mtrr.cetesb.sp.gov.br');
  assert.equal(manifest.version, '2026-07-02'); // pasta datada = data da promoção
  assert.equal(manifest.endpoint_count, 2);
  assert.match(manifest.content_hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(manifest.generated_by, 'portal-recorder@ctr_abc');
  assert.deepEqual(manifest.capture_window, { from: '2026-07-01', to: '2026-07-01' });

  for (const ep of endpoints) {
    assert.equal('sample_request' in ep, false, 'sample_request não pode vazar para o export');
    assert.equal('sample_response' in ep, false, 'sample_response não pode vazar para o export');
    assert.match(ep.id, /^[a-z0-9]+(-[a-z0-9]+)+$/);
    assert.equal(ep.portal, 'cetesb');
    assert.equal(typeof ep.group, 'string');
    assert.equal(typeof ep.requires_captcha, 'boolean');
    assert.ok(ep.observability.sample_count >= 1);
  }
  // params do template declarados
  const withParam = endpoints.find((e) => e.path_template.includes('{p3}'));
  assert.deepEqual(withParam.path_params, [{ name: 'p3', type: 'string', detected_from: 'capture' }]);
  // auth mapeada best-effort
  assert.equal(withParam.auth.required, true);
  assert.equal(withParam.auth.token_header_mode, 'authorization');
  const open = endpoints.find((e) => !e.auth.required);
  assert.equal(open.auth.token_header_mode, 'none');
});

test('buildCanonicalExport: content_hash bate com o algoritmo canônico (validador)', () => {
  const ex = makeExport();
  assert.equal(ex.value.manifest.content_hash, contentHashOfEndpoints(ex.value.endpoints));
  // canonicalize é estável independentemente da ordem das chaves
  assert.equal(
    JSON.stringify(canonicalize({ b: 1, a: { d: 2, c: [3] } })),
    JSON.stringify(canonicalize({ a: { c: [3], d: 2 }, b: 1 })),
  );
});

test('buildCanonicalExport: fail-closed sem endpoints e em método+path duplicado', () => {
  assert.equal(buildCanonicalExport({ portal: PORTAL, contract: CONTRACT, endpoints: [] }).code, 'NO_ENDPOINTS');
  const dup = [
    { ...DB_ENDPOINTS[1] },
    { ...DB_ENDPOINTS[1], host: 'outra-origem.example.com' },
  ];
  const r = buildCanonicalExport({ portal: PORTAL, contract: CONTRACT, endpoints: dup });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DUPLICATE_METHOD_PATH');
});

test('buildPromotePayload: shape + teto de 60KB com erro claro', () => {
  const ex = makeExport();
  const ok = buildPromotePayload({
    portalSlug: 'cetesb', contractId: 'ctr_abc', contractVersion: 3,
    requestedBy: 'flavio@example.com', exportData: ex.value,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.payload_version, 1);
  assert.equal(ok.payload.portal_slug, 'cetesb');
  assert.equal(ok.payload.contract_id, 'ctr_abc');
  assert.equal(ok.payload.version, '2026-07-02');
  assert.equal(ok.payload.export.manifest.portal, 'cetesb');
  assert.ok(ok.bytes > 0 && ok.bytes <= MAX_PAYLOAD_BYTES);

  const fat = { manifest: ex.value.manifest, endpoints: [{ ...ex.value.endpoints[0], title: 'x'.repeat(MAX_PAYLOAD_BYTES) }] };
  const big = buildPromotePayload({ portalSlug: 'cetesb', contractId: 'ctr_abc', contractVersion: 3, requestedBy: 'x', exportData: fat });
  assert.equal(big.ok, false);
  assert.equal(big.code, 'PAYLOAD_TOO_LARGE');
  assert.match(big.message, /excede/);
});

test('dispatchContractPromote: 204 ok; não-204 vira erro com detalhe', async () => {
  const calls = [];
  const ok = await dispatchContractPromote({
    token: 'gh_x', repo: 'FlavioNeto11/devops', payload: { a: 1 },
    fetchImpl: async (url, opts) => { calls.push({ url, opts }); return { status: 204, text: async () => '' }; },
  });
  assert.equal(ok.ok, true);
  assert.equal(calls[0].url, 'https://api.github.com/repos/FlavioNeto11/devops/dispatches');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer gh_x');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.event_type, 'portal-contract-promote');
  assert.deepEqual(body.client_payload, { a: 1 });

  const bad = await dispatchContractPromote({
    token: 'gh_x', repo: 'FlavioNeto11/devops', payload: {},
    fetchImpl: async () => ({ status: 401, text: async () => 'Bad credentials' }),
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 401);
  assert.equal(bad.detail, 'Bad credentials');
});

test('PROMOTE_SLUG_RE espelha o guard do workflow', () => {
  assert.ok(PROMOTE_SLUG_RE.test('cetesb'));
  assert.ok(PROMOTE_SLUG_RE.test('meu-portal-2'));
  assert.ok(!PROMOTE_SLUG_RE.test('2portal'));   // começa com dígito
  assert.ok(!PROMOTE_SLUG_RE.test('X'));
  assert.ok(!PROMOTE_SLUG_RE.test('a'.repeat(40)));
});
