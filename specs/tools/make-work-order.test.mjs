import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkOrder, RESTRICTED_SCOPES } from './make-work-order.mjs';

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
