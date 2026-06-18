import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Testa o coverage-report contra a baseline REAL gerada: invariantes determinísticos.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(SPECS, 'baseline', 'current-baseline.json'), 'utf8'));
const cov = JSON.parse(fs.readFileSync(path.join(SPECS, 'baseline', 'coverage-report.json'), 'utf8'));

test('coverage-report bate com a baseline (hash + total)', () => {
  assert.equal(cov.baseline_hash, baseline.baseline_hash);
  assert.equal(cov.totals.total, baseline.counts.total);
  assert.equal(cov.totals.scopes, Object.keys(cov.by_scope).length);
});

test('soma por escopo == total', () => {
  const sum = Object.values(cov.by_scope).reduce((a, s) => a + s.total, 0);
  assert.equal(sum, cov.totals.total);
});

test('without_source_paths == 0 (Gate 1 cobre todos)', () => {
  assert.equal(cov.totals.without_source_paths, 0);
  assert.equal(cov.totals.coverage_pct.source_paths, 100);
});

test('percentuais entre 0 e 100 e dimensões declaradas', () => {
  assert.deepEqual(cov.dimensions.sort(), ['allocation', 'evidence', 'links', 'refinement', 'source_paths', 'verification_method']);
  for (const s of Object.values(cov.by_scope)) {
    for (const d of cov.dimensions) {
      assert.ok(s.coverage_pct[d] >= 0 && s.coverage_pct[d] <= 100);
      assert.ok(s[`without_${d}`] >= 0 && s[`without_${d}`] <= s.total);
    }
  }
});
