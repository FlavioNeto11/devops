#!/usr/bin/env node
/**
 * Setup idempotente do usuário interno SICAT para testes E2E.
 *
 * - NÃO contém credenciais hardcoded: lê de variáveis de ambiente (e, se existir,
 *   de um arquivo `.env.e2e` local NÃO versionado).
 * - NUNCA imprime senha/CPF/CNPJ/e-mail em texto puro (mascara em qualquer log).
 * - Idempotente: registra o usuário; se já existir (409), faz login.
 * - NÃO vincula conta CETESB aqui (o vínculo usa credenciais reais e é feito
 *   com cautela pelo fluxo de navegador, após checagem de reachability).
 *
 * Uso:
 *   node scripts/e2e/setup-e2e-user.mjs
 *   (variáveis: SICAT_API_BASE_URL, SICAT_E2E_INTERNAL_USER_{NAME,EMAIL,PASSWORD})
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotenv(file) {
  if (!existsSync(file)) return;
  const raw = readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return '***';
  return `${user.slice(0, 2)}***@${domain.replace(/^[^.]*/, '***')}`;
}

loadDotenv(resolve(process.cwd(), '.env.e2e'));
loadDotenv(resolve(process.cwd(), '.env.local'));

const baseUrl = (process.env.SICAT_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const name = process.env.SICAT_E2E_INTERNAL_USER_NAME || 'Usuário E2E Gerador';
const email = process.env.SICAT_E2E_INTERNAL_USER_EMAIL || 'sicat.e2e.gerador.local@example.test';
const password = process.env.SICAT_E2E_INTERNAL_USER_PASSWORD || '';

if (!password) {
  console.error('[setup-e2e] SICAT_E2E_INTERNAL_USER_PASSWORD ausente. Abortando.');
  process.exit(2);
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* corpo não-JSON */ }
  return { status: res.status, json };
}

async function main() {
  console.log(`[setup-e2e] API: ${baseUrl}`);
  console.log(`[setup-e2e] Usuário interno: ${maskEmail(email)}`);

  // 1) Tenta registrar (idempotente: 409 => já existe => login)
  let token = null;
  let userId = null;
  const reg = await post('/v1/sicat/auth/register', { name, email, password });
  if (reg.status === 201 || reg.status === 200) {
    token = reg.json?.accessToken || null;
    userId = reg.json?.user?.userId || reg.json?.user?.id || null;
    console.log('[setup-e2e] Usuário registrado.');
  } else if (reg.status === 409) {
    console.log('[setup-e2e] Usuário já existe — efetuando login.');
    const login = await post('/v1/sicat/auth/login', { email, password });
    if (login.status === 200) {
      token = login.json?.accessToken || null;
      userId = login.json?.user?.userId || login.json?.user?.id || null;
      console.log('[setup-e2e] Login OK (usuário reutilizado).');
    } else {
      console.error(`[setup-e2e] Falha no login do usuário existente: HTTP ${login.status} (${login.json?.code || 'sem código'}).`);
      process.exit(1);
    }
  } else {
    console.error(`[setup-e2e] Falha no registro: HTTP ${reg.status} (${reg.json?.code || 'sem código'}).`);
    process.exit(1);
  }

  console.log(`[setup-e2e] Token SICAT obtido: ${token ? 'sim' : 'não'}`);
  console.log(`[setup-e2e] userId: ${userId ? 'ok' : 'n/d'}`);
  console.log('[setup-e2e] OK — usuário interno pronto para login no portal.');
}

main().catch((err) => {
  console.error('[setup-e2e] Erro inesperado:', err?.message || err);
  process.exit(1);
});
