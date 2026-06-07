import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  prepareOperationalFront,
  updateOperationalFront,
  resolveExecutionDir,
  readManifest,
  STATUS_BOARD_FILE,
  BRIEFINGS_DIR
} from '../../scripts/operational-front-lib.js';

test('prepareOperationalFront cria pacote observável completo', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'operational-front-'));
  const manifest = prepareOperationalFront({
    rootDir,
    dlId: 'DL-999',
    title: 'Teste de frente operacional',
    request: 'Validar geração de artefatos'
  });

  assert.equal(manifest.dlId, 'DL-999');
  assert.equal(fs.existsSync(path.join(manifest.executionDir, 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(manifest.executionDir, STATUS_BOARD_FILE)), true);
  assert.equal(fs.existsSync(path.join(manifest.executionDir, BRIEFINGS_DIR, 'integrador-cetesb-mtr.md')), true);

  const persisted = readManifest(manifest.executionDir);
  const testerLane = persisted.lanes.find((lane) => lane.agent === 'tester-qa-mtr');
  assert.equal(testerLane.status, 'pending');
});

test('updateOperationalFront atualiza lane e regrava status board', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'operational-front-'));

  prepareOperationalFront({
    rootDir,
    dlId: 'DL-998',
    title: 'Teste de atualização',
    request: 'Validar transição de status'
  });

  const executionDir = resolveExecutionDir(rootDir, 'DL-998');
  const updated = updateOperationalFront({
    rootDir,
    executionDir,
    agent: 'integrador-cetesb-mtr',
    status: 'completed',
    note: 'Integração concluída',
    actor: 'test-suite'
  });

  const lane = updated.lanes.find((item) => item.agent === 'integrador-cetesb-mtr');
  assert.equal(lane.status, 'completed');
  assert.equal(lane.note, 'Integração concluída');

  const board = fs.readFileSync(path.join(executionDir, STATUS_BOARD_FILE), 'utf8');
  assert.match(board, /integrador-cetesb-mtr/);
  assert.match(board, /concluído/);
});
