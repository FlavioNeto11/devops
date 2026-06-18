import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkOrder, buildRefinementWorkOrder, RESTRICTED_SCOPES } from './make-work-order.mjs';

const req = {
  id: 'REQ-SICAT-0002', scope: { product_scope: 'sicat' }, title: 'Submit MTR', type: 'functional',
  statement: 'O sistema deve submeter MTR', acceptance_criteria: ['x'], verification_method: [], quality_scenarios: [],
  priority: 'critical', criticality: 'critical', architectural_significance: true, version: { item_revision: 1 },
  allocation: { service_refs: ['svc-sicat-api'] }, file: 'requirements/sicat/REQ-SICAT-0002.yaml',
};
const edges = [
  { from: 'REQ-SICAT-0002', to: 'REQ-SICAT-0011', type: 'depends_on' },
  { from: 'REQ-SICAT-NFR-0002', to: 'REQ-SICAT-0002', type: 'constrains' },
];
const baseline = { reprocess_queue: [{ id: 'REQ-SICAT-0002', reasons: ['sem evidência de verificação'] }] };

test('work order de REFINAMENTO: puxa âncoras (com título/critérios) + head ref/<id>', () => {
  const ref = {
    id: 'REF-GYMOPS-0001', scope: { product_scope: 'gymops' }, title: 'Endereço no perfil', kind: 'screen',
    surface: { route: '/profile' }, behavior: { states: [{ name: 'normal' }] },
    acceptance_criteria: ['exibe endereço'], source: { source_paths: ['apps/gymops'] }, version: { item_revision: 1 },
    anchors: [{ requirement_id: 'REQ-GYMOPS-0010', relation: 'refines' }],
  };
  const reqById = new Map([['REQ-GYMOPS-0010', { id: 'REQ-GYMOPS-0010', title: 'Telas administrativas', statement: 'O sistema DEVE...', acceptance_criteria: ['c1'] }]]);
  const wo = buildRefinementWorkOrder(ref, reqById, { refinements: [ref] }, {});
  assert.equal(wo.ref_id, 'REF-GYMOPS-0001');
  assert.equal(wo.product_scope, 'gymops');
  assert.deepEqual(wo.allowed_paths, ['apps/gymops/**']);
  assert.equal(wo.pr_template.head, 'ref/REF-GYMOPS-0001/r1');
  assert.equal(wo.pr_template.trailer, 'Closes-Ref: REF-GYMOPS-0001');
  assert.ok(wo.pr_template.labels.includes('refinement'));
  assert.equal(wo.anchors[0].title, 'Telas administrativas'); // âncora resolvida da baseline
  assert.deepEqual(wo.anchors[0].acceptance_criteria, ['c1']);
  assert.equal(wo.refinement.surface.route, '/profile');
});

test('work order de produto (nao restrito)', () => {
  const wo = buildWorkOrder(req, edges, baseline);
  assert.equal(wo.req_id, 'REQ-SICAT-0002');
  assert.equal(wo.restricted, false);
  assert.deepEqual(wo.allowed_paths, ['apps/sicat/**']);
  assert.equal(wo.impact.outgoing.length, 1);
  assert.equal(wo.impact.incoming.length, 1);
  assert.deepEqual(wo.impact.allocation.service_refs, ['svc-sicat-api']);
  assert.deepEqual(wo.reprocess_reasons, ['sem evidência de verificação']);
  assert.equal(wo.pr_template.head, 'req/REQ-SICAT-0002/r1');
  assert.equal(wo.pr_template.trailer, 'Closes-Req: REQ-SICAT-0002');
});

test('escopo de infra/CICD e RESTRITO (allowed vazio)', () => {
  for (const scope of ['traefik', 'keycloak', 'argocd', 'observability', 'platform', 'cicd']) {
    assert.ok(RESTRICTED_SCOPES.has(scope));
    const wo = buildWorkOrder({ ...req, id: 'REQ-X-0001', scope: { product_scope: scope } }, [], {});
    assert.equal(wo.restricted, true);
    assert.deepEqual(wo.allowed_paths, []);
  }
});

test('produto greenfield: blueprint anexado + allowed_paths = apps/<app>/**', () => {
  const products = { crm: { name: 'crm', blueprint: 'node-api-vue-spa' } };
  const wo = buildWorkOrder({ ...req, id: 'REQ-CRM-0003', scope: { product_scope: 'crm' } }, [], {}, products);
  assert.equal(wo.product_scope, 'crm');
  assert.equal(wo.blueprint, 'node-api-vue-spa');
  assert.equal(wo.restricted, false);
  assert.deepEqual(wo.allowed_paths, ['apps/crm/**']);
});

test('scope.blueprint do requisito tem precedencia sobre o do produto', () => {
  const wo = buildWorkOrder({ ...req, scope: { product_scope: 'sicat', blueprint: 'explicit-bp' } }, [], {});
  assert.equal(wo.blueprint, 'explicit-bp');
});

test('sem produto/blueprint => blueprint null (retrocompat)', () => {
  const wo = buildWorkOrder(req, edges, baseline);
  assert.equal(wo.blueprint, null);
});
