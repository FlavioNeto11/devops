import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const examplesDir = path.join(repoRoot, 'examples');
const baseUrl = (process.env.SMOKE_BASE_URL || process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

/**
 * `POST /v1/session-contexts` e `POST /v1/manifestos` exigem sessão SICAT desde o fechamento da
 * superfície `/v1`. Exporte `SMOKE_ACCESS_TOKEN` (access token do `POST /v1/sicat/auth/login`).
 */
const accessToken = String(process.env.SMOKE_ACCESS_TOKEN || '').trim();

function smokeHeaders(prefix) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Correlation-Id': `${prefix}-${Date.now()}`,
    'Idempotency-Key': `${prefix}-${Date.now()}`,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };
}

async function readJson(fileName) {
  const content = await fs.readFile(path.join(examplesDir, fileName), 'utf8');
  return JSON.parse(content);
}

async function ensureSessionContext() {
  const requestBody = await readJson('post_v1_session-contexts_request.json');
  const response = await fetch(`${baseUrl}/v1/session-contexts`, {
    method: 'POST',
    headers: smokeHeaders('smoke-session'),
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
    headers: smokeHeaders('smoke-manifest'),
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
