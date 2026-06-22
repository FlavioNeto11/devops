// LOCKED — gerado de bloco camadas-rigidas por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, sleep, LIVE } from '../_lib.mjs';

test('camadas-rigidas: SQL fica em repositories/, não no server (arch-review)', async () => {
  const fs = (await import('node:fs')).default; const path = (await import('node:path')).default;
  const srv = path.resolve(process.cwd(), 'apps/helpflow/api/src/server.js');
  if (!fs.existsSync(srv)) return; // ainda não scaffoldado
  const txt = fs.readFileSync(srv, 'utf8');
  assert.ok(!/\b(SELECT|INSERT|UPDATE|DELETE)\b[^;]*\bFROM\b/i.test(txt) || /repositories/.test(txt), 'SQL deve viver em repositories/');
});
