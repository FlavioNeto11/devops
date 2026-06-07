#!/usr/bin/env node
/**
 * Vínculo idempotente da conta CETESB GERADOR ao usuário interno E2E.
 *
 * - Lê credenciais de env / `.env.e2e` (NÃO versionado). Nada hardcoded.
 * - NUNCA imprime senha/CPF/CNPJ/e-mail/token em texto puro (mascara tudo).
 * - Faz UMA única tentativa de autenticação real CETESB (login = CNPJ confirmado
 *   por sondagem read-only). NÃO repete em caso de erro de credencial (evita
 *   lockout da conta real).
 * - Idempotente: se a conta GERADOR já estiver vinculada, apenas ativa.
 * - Não executa nenhuma mutação real na CETESB (apenas login/leitura de sessão).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotenv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0 && process.env[t.slice(0, i).trim()] === undefined) {
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
}
const digits = (s) => String(s || '').replace(/\D/g, '');
const maskDoc = (s) => { const d = digits(s); return d ? `***${d.slice(-4)}` : '***'; };

loadDotenv(resolve(process.cwd(), '.env.e2e'));
loadDotenv(resolve(process.cwd(), '.env.local'));

const base = (process.env.SICAT_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const email = process.env.SICAT_E2E_INTERNAL_USER_EMAIL;
const password = process.env.SICAT_E2E_INTERNAL_USER_PASSWORD;
const cnpj = digits(process.env.CETESB_COMPANY_DOCUMENT);
const cetesbPassword = process.env.CETESB_USER_PASSWORD;
const cetesbEmail = process.env.CETESB_USER_EMAIL || '';

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  if (!password || !cnpj || !cetesbPassword) {
    console.error('[link-cetesb] Variáveis obrigatórias ausentes (.env.e2e). Abortando.');
    process.exit(2);
  }

  // 1) Login do usuário interno
  const login = await api('/v1/sicat/auth/login', { method: 'POST', body: { email, password } });
  if (login.status !== 200 || !login.json?.accessToken) {
    console.error(`[link-cetesb] Falha no login interno: HTTP ${login.status}.`);
    process.exit(1);
  }
  const token = login.json.accessToken;
  console.log('[link-cetesb] Login interno OK.');

  // 2) Idempotência: conta GERADOR já vinculada?
  const list = await api('/v1/sicat/cetesb-accounts', { token });
  const existing = (list.json?.accounts || []).find((a) => digits(a.partnerDocument) === cnpj);
  let accountId = existing?.accountId || null;

  if (accountId) {
    console.log(`[link-cetesb] Conta GERADOR já vinculada (doc ${maskDoc(cnpj)}) — reutilizando.`);
  } else {
    // 3) partnerCode via lookup read-only (capturado internamente, não impresso)
    const info = await api(`/v1/auth/partner-info?document=${encodeURIComponent(cnpj)}`);
    const partnerCode = info.json?.partnerCode ? Number(info.json.partnerCode) : null;

    // 4) Vínculo — ÚNICA tentativa real de auth CETESB
    console.log('[link-cetesb] Vinculando conta CETESB (1 tentativa real)…');
    const add = await api('/v1/sicat/cetesb-accounts', {
      method: 'POST', token,
      body: { login: cnpj, password: cetesbPassword, email: cetesbEmail, partnerCode, recaptchaToken: '' }
    });
    if ((add.status === 201 || add.status === 200) && add.json?.accountId) {
      accountId = add.json.accountId;
      console.log(`[link-cetesb] Conta vinculada. accountType=${add.json?.accountType || add.json?.partner?.accountType || 'n/d'}`);
    } else {
      console.error(`[link-cetesb] Falha no vínculo: HTTP ${add.status} | code=${add.json?.code || 'n/d'} | detail=${String(add.json?.detail || '').slice(0, 120)}`);
      console.error('[link-cetesb] NÃO será feita nova tentativa (proteção contra lockout).');
      process.exit(1);
    }
  }

  // 5) Ativar a conta (estabelece sessionContext)
  const act = await api(`/v1/sicat/cetesb-accounts/${encodeURIComponent(accountId)}/activate`, { method: 'POST', token });
  console.log(`[link-cetesb] Ativação: HTTP ${act.status} | accountType=${act.json?.activeAccount?.accountType || 'n/d'} | sessionContext=${act.json?.sessionContext?.id || act.json?.sessionContext?.sessionContextId ? 'ativo' : 'n/d'}`);

  // 6) Status da sessão
  const sess = await api('/v1/sicat/session', { token });
  const sc = sess.json?.sessionContext;
  console.log(`[link-cetesb] Sessão SICAT: HTTP ${sess.status} | contaAtiva=${sess.json?.activeAccount ? 'sim' : 'nao'} | integrationAccountId=${sess.json?.integrationAccountId ? 'ok' : 'n/d'} | sessionContext=${sc?.id || sc?.sessionContextId ? 'ativo' : 'n/d'}`);
  console.log('[link-cetesb] OK.');
}

main().catch((e) => { console.error('[link-cetesb] Erro:', e?.message || e); process.exit(1); });
