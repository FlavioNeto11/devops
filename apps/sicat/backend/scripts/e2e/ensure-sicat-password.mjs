#!/usr/bin/env node
/**
 * Garante (idempotente) que o usuário SICAT de teste consegue logar com a senha
 * definida no ambiente — para habilitar o E2E de navegador.
 *
 * - NÃO contém credenciais hardcoded: lê de variáveis de ambiente / `.env.e2e` (gitignored).
 * - NUNCA imprime senha em texto puro (mascara e-mail; nunca loga a senha).
 * - Idempotente: tenta login; se já válido, não altera nada. Se inválido, redefine o
 *   password_hash usando o mesmo esquema do app (scrypt_v1) e revalida via login.
 *
 * Variáveis: SICAT_TEST_EMAIL, SICAT_TEST_PASSWORD, SICAT_API_BASE_URL, DATABASE_URL.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { scryptSync, randomBytes } from 'node:crypto';
import pg from 'pg';

function loadDotenv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return '***';
  return `${user.slice(0, 2)}***@${domain.replace(/^[^.]*/, '***')}`;
}

// Mesmo esquema do app (src/lib/sicat-security.ts): scrypt_v1$<salt>$<hash>.
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password || ''), salt, 64);
  return `scrypt_v1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

loadDotenv(resolve(process.cwd(), '.env'));
loadDotenv(resolve(process.cwd(), '.env.e2e'));

const baseUrl = (process.env.SICAT_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const email = process.env.SICAT_TEST_EMAIL || '';
const password = process.env.SICAT_TEST_PASSWORD || '';
const databaseUrl = (process.env.DATABASE_URL || '').replace('@postgres:', '@localhost:');

if (!email || !password) {
  console.error('[ensure-pwd] SICAT_TEST_EMAIL/SICAT_TEST_PASSWORD ausentes. Abortando.');
  process.exit(2);
}

async function login() {
  const res = await fetch(`${baseUrl}/v1/sicat/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return res.status;
}

async function main() {
  console.log(`[ensure-pwd] API: ${baseUrl}`);
  console.log(`[ensure-pwd] Usuário: ${maskEmail(email)}`);

  let status = await login();
  if (status === 200) {
    console.log('[ensure-pwd] Senha já válida — nenhuma alteração necessária.');
    return;
  }

  console.log(`[ensure-pwd] Login inicial HTTP ${status}. Redefinindo password_hash (scrypt_v1)...`);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      'update sicat_users set password_hash = $1, password_expires_at = null, updated_at = now() where email = $2',
      [hashPassword(password), email]
    );
    if (result.rowCount === 0) {
      console.error('[ensure-pwd] Usuário não encontrado em sicat_users. Abortando.');
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  status = await login();
  if (status === 200) {
    console.log('[ensure-pwd] OK — senha redefinida e login validado.');
  } else {
    console.error(`[ensure-pwd] Falha ao validar login após redefinição: HTTP ${status}.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[ensure-pwd] Erro inesperado:', err?.message || err);
  process.exit(1);
});
