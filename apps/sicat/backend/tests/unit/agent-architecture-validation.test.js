import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('validate-agent-architecture script passa no repositório atual', () => {
  const rootDir = process.cwd();
  const scriptPath = path.resolve(rootDir, 'scripts/validate-agent-architecture.js');

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: rootDir,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `Script deve finalizar com sucesso.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /Arquitetura de agentes validada com sucesso/i);
});
