// LOCKED — gerado de bloco contract-openapi por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, sleep, LIVE } from '../_lib.mjs';

test('contract-openapi: contrato sem drift (validate:openapi)', async () => {
  const fs = (await import('node:fs')).default; const path = (await import('node:path')).default;
  const v = path.resolve(process.cwd(), 'apps/helpflow/api/openapi/validate.mjs');
  if (!fs.existsSync(v)) return; // contrato ainda não gerado
  const { execFileSync } = (await import('node:child_process'));
  execFileSync('node', [v], { cwd: path.dirname(path.dirname(v)) }); // exit !=0 lança -> teste falha
});
