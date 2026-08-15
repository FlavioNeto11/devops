// Testes do _lib.mjs gerado por make-test-suite.mjs — injeção de identidade de teste
// pelo GATE (FORGE_TEST_HEADERS). Prova COMPORTAMENTAL: sobe um http server local que
// captura headers e chama o helper gerado com/sem identidade injetada.
// NB: o filho roda ASSÍNCRONO (execFile, não execFileSync) — spawn síncrono bloquearia o
// event loop do pai e o server nunca responderia o fetch do filho (deadlock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { LIB } from './make-test-suite.mjs';

const pExecFile = promisify(execFile);

const materializeLib = () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-lib-'));
  const libPath = path.join(tmp, '_lib.mjs');
  fs.writeFileSync(libPath, LIB.replace(/@@APP@@/g, 'fixture').replace(/@@BASE@@/g, '/fixture'));
  return { tmp, libPath };
};

const startCapture = () => new Promise((resolve) => {
  const captured = [];
  const srv = http.createServer((req, res) => {
    captured.push({ url: req.url, headers: req.headers });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"id":1}');
  });
  srv.listen(0, '127.0.0.1', () => resolve({ srv, captured, url: 'http://127.0.0.1:' + srv.address().port }));
});

// roda um snippet ESM num processo FILHO (env própria — o parse do FORGE_TEST_HEADERS
// acontece no import do módulo, então precisa de processo novo por cenário).
const runChild = (libPath, snippet, env) => pExecFile(
  process.execPath,
  ['--input-type=module', '-e', `const { get, post } = await import(${JSON.stringify(pathToFileURL(libPath).href)});\n${snippet}`],
  { encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env } },
);

test('LIB gerada contém a injeção FORGE_TEST_HEADERS (identidade vem do GATE, não do teste)', () => {
  assert.match(LIB, /FORGE_TEST_HEADERS/);
  assert.match(LIB, /test-identity\.json/);
});

test('FORGE_TEST_HEADERS injeta header default em toda chamada; extra do teste sobrescreve', async () => {
  const { tmp, libPath } = materializeLib();
  const { srv, captured, url } = await startCapture();
  try {
    await runChild(libPath, "await post('/v1/records', { title: 'q' }); await post('/v1/records', {}, { 'X-Role': 'patient' }); await get('/health');", {
      BASE_URL: url,
      FORGE_TEST_HEADERS: JSON.stringify({ 'X-Role': 'professional', 'X-Tenant-Id': '1' }),
    });
    assert.equal(captured.length, 3);
    assert.equal(captured[0].headers['x-role'], 'professional', 'POST leva a identidade injetada pelo gate');
    assert.equal(captured[0].headers['x-tenant-id'], '1');
    assert.equal(captured[1].headers['x-role'], 'patient', 'header extra por chamada SOBRESCREVE o default');
    assert.equal(captured[2].headers['x-role'], 'professional', 'GET também leva a identidade');
  } finally {
    srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('sem FORGE_TEST_HEADERS o comportamento é o de sempre (nenhum header de identidade)', async () => {
  const { tmp, libPath } = materializeLib();
  const { srv, captured, url } = await startCapture();
  try {
    const env = { BASE_URL: url };
    delete env.FORGE_TEST_HEADERS;
    await runChild(libPath, "await post('/v1/records', { title: 'q' });", env);
    assert.equal(captured[0].headers['x-role'], undefined);
  } finally {
    srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('FORGE_TEST_HEADERS inválido -> falha IMEDIATA e clara (fail-closed, sem fallback silencioso)', async () => {
  const { tmp, libPath } = materializeLib();
  try {
    await assert.rejects(
      () => runChild(libPath, "await get('/health');", { BASE_URL: 'http://127.0.0.1:9', FORGE_TEST_HEADERS: '{nope' }),
      (e) => /FORGE_TEST_HEADERS invalido/.test(String(e.stderr || '')),
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
