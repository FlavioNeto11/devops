import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeFromPayload } from './forge-write-reqs.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fwr-'));

test('writeFromPayload: YAMLs verbatim + product.json/architecture/build-plan', () => {
  const dir = tmp();
  const payload = {
    product: 'cadastro-de-pacientes', display_name: 'Cadastro', blueprint: 'node-api-vue-spa',
    brief: 'sistema de cadastro de pacientes',
    architecture: { stack: 'sicat', selected_blocks: [{ id: 'camadas-rigidas' }, { id: 'oidc-sessao' }], adrs: [{ title: 'ADR-1' }], waves: [{ id: 'w0' }] },
    requirements: [
      { id: 'REQ-CADASTRODEPACIENTES-0001', title: 'Fundação: Arquitetura em camadas', type: 'functional', priority: 'critical', statement: 'O sistema DEVE implementar camadas rígidas.', acceptance_criteria: ['health em /health'], capability_blocks: ['camadas-rigidas'] },
      { id: 'REQ-CADASTRODEPACIENTES-0008', title: 'Contract-first OpenAPI', type: 'non-functional', priority: 'high', statement: 'API auditável e versionada.', acceptance_criteria: ['openapi valida'] },
    ],
  };
  const r = writeFromPayload(payload, { specsDir: path.join(dir, 'specs'), repoRoot: dir });
  assert.equal(r.name, 'cadastro-de-pacientes');
  assert.equal(r.stack, 'sicat');
  assert.deepEqual(r.ids, ['REQ-CADASTRODEPACIENTES-0001', 'REQ-CADASTRODEPACIENTES-0008']);

  const y1 = fs.readFileSync(path.join(dir, 'specs/requirements/cadastro-de-pacientes/REQ-CADASTRODEPACIENTES-0001.yaml'), 'utf8');
  assert.match(y1, /id: REQ-CADASTRODEPACIENTES-0001/);
  assert.match(y1, /Fundação: Arquitetura em camadas/);
  assert.match(y1, /product_scope: cadastro-de-pacientes/);
  assert.match(y1, /capability_blocks: \["camadas-rigidas"\]/);
  assert.match(y1, /verification_method: \[test-integration\]/);

  const y8 = fs.readFileSync(path.join(dir, 'specs/requirements/cadastro-de-pacientes/REQ-CADASTRODEPACIENTES-0008.yaml'), 'utf8');
  assert.match(y8, /type: non-functional/);
  assert.match(y8, /quality_scenarios:/); // NFR exige -> sintetizado

  const prod = JSON.parse(fs.readFileSync(path.join(dir, 'specs/products/cadastro-de-pacientes/product.json'), 'utf8'));
  assert.equal(prod.stack, 'sicat');
  assert.deepEqual(prod.requirement_ids, r.ids);
  assert.ok(prod.capability_blocks.includes('camadas-rigidas'));
  assert.ok(fs.existsSync(path.join(dir, 'specs/products/cadastro-de-pacientes/architecture.json')));
  assert.ok(fs.existsSync(path.join(dir, 'apps/reqhub/frontend/data/products/cadastro-de-pacientes/build-plan.json')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('writeFromPayload: rejeita slug inválido e requirements vazio', () => {
  assert.throws(() => writeFromPayload({ product: 'Bad Slug', requirements: [{ title: 'x' }] }));
  assert.throws(() => writeFromPayload({ product: 'ok-app', requirements: [] }));
});

test('writeFromPayload: slug hifenizado deriva id SEM hífens (schema-válido) — bug do besc-next (#212)', () => {
  const dir = tmp();
  const payload = {
    product: 'besc-next', display_name: 'BESC 2.0', blueprint: 'app-simples',
    requirements: [{ title: 'Fundação', type: 'functional', statement: 'DEVE existir.' }],
  };
  const r = writeFromPayload(payload, { specsDir: path.join(dir, 'specs'), repoRoot: dir });
  assert.deepEqual(r.ids, ['REQ-BESCNEXT-0001']); // NÃO REQ-BESC-NEXT-0001
  for (const id of r.ids) assert.match(id, /^REQ-[A-Z0-9]+-(NFR-)?[0-9]{3,4}$/);
  const y = fs.readFileSync(path.join(dir, 'specs/requirements/besc-next/REQ-BESCNEXT-0001.yaml'), 'utf8');
  assert.match(y, /id: REQ-BESCNEXT-0001/);
  assert.match(y, /product_scope: besc-next/); // vínculo com o produto continua pelo scope, não pelo id
  fs.rmSync(dir, { recursive: true, force: true });
});

test('writeFromPayload: id explícito fora do schema é rejeitado (fail-closed, nada escrito no git)', () => {
  const dir = tmp();
  assert.throws(
    () => writeFromPayload(
      { product: 'ok-app', requirements: [{ id: 'REQ-BESC-NEXT-0001', title: 'x', statement: 'y' }] },
      { specsDir: path.join(dir, 'specs'), repoRoot: dir },
    ),
    /req id inválido/,
  );
  assert.equal(fs.existsSync(path.join(dir, 'specs/requirements')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
