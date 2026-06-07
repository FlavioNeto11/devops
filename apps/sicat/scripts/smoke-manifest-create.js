import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const examplesDir = path.join(repoRoot, 'examples');
const baseUrl = (process.env.SMOKE_BASE_URL || process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

async function readJson(fileName) {
  const content = await fs.readFile(path.join(examplesDir, fileName), 'utf8');
  return JSON.parse(content);
}

async function ensureSessionContext() {
  const requestBody = await readJson('post_v1_session-contexts_request.json');
  const response = await fetch(`${baseUrl}/v1/session-contexts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Correlation-Id': `smoke-session-${Date.now()}`,
      'Idempotency-Key': `smoke-session-${Date.now()}`
    },
    body: JSON.stringify(requestBody)
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Falha ao criar session context: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  return body.id;
}

async function createManifest(sessionContextId) {
  const requestBody = await readJson('post_v1_manifestos_request.json');
  requestBody.sessionContextId = sessionContextId;
  requestBody.requestedBy = 'smoke.runner';

  const response = await fetch(`${baseUrl}/v1/manifestos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Correlation-Id': `smoke-manifest-${Date.now()}`,
      'Idempotency-Key': `smoke-manifest-${Date.now()}`
    },
    body: JSON.stringify(requestBody)
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Falha ao criar manifesto: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

async function main() {
  const sessionContextId = await ensureSessionContext();
  const manifest = await createManifest(sessionContextId);
  console.log(JSON.stringify({ ok: true, sessionContextId, manifest }, null, 2));
}

main().catch((error) => {
  console.error('Erro no smoke de manifesto:', error);
  process.exit(1);
});
