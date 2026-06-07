import fs from 'node:fs';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DEFAULT_ENV_PATH = 'scripts/ai-smoke/.env';
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8080';
const DEFAULT_EMAIL = 'operador@example.com';

function parseArgs(argv) {
  const args = {
    apiBaseUrl: '',
    email: '',
    password: '',
    accountId: '',
    output: DEFAULT_ENV_PATH,
    nonInteractive: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--api-base-url') args.apiBaseUrl = argv[++index] || '';
    else if (arg === '--email') args.email = argv[++index] || '';
    else if (arg === '--password') args.password = argv[++index] || '';
    else if (arg === '--account-id') args.accountId = argv[++index] || '';
    else if (arg === '--output') args.output = argv[++index] || DEFAULT_ENV_PATH;
    else if (arg === '--non-interactive') args.nonInteractive = true;
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const env = {};
  const raw = fs.readFileSync(filePath, 'utf8');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    env[key] = value;
  }

  return env;
}

function preserveExistingEnv(filePath) {
  return {
    OPENAI_API_KEY: '',
    OPENAI_AGENT_MODEL: 'gpt-5-mini',
    OPENAI_SYNTHESIS_MODEL: 'gpt-4.1-mini',
    OPENAI_JUDGE_MODEL: 'gpt-4.1-mini',
    OPENAI_ESCALATION_MODEL: 'gpt-5.1',
    OPENAI_MODEL: 'gpt-5-mini',
    SICAT_AI_SMOKE_ALLOW_MUTATIONS: 'false',
    SICAT_AI_SMOKE_FORCE_SAFE_PROMPT_PREFIX: 'true',
    SICAT_AI_SMOKE_TIMEOUT_MS: '45000',
    SICAT_AI_SMOKE_CONCURRENCY: '1',
    SICAT_AI_SMOKE_OUTPUT_DIR: 'artifacts/ai-smoke',
    ...loadEnvFile(filePath)
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail = typeof payload === 'object'
      ? payload?.detail || payload?.message || payload?.title || JSON.stringify(payload)
      : text;

    throw new Error(`HTTP ${response.status} em ${url}: ${detail}`);
  }

  return payload;
}

function authHeaders(accessToken) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Correlation-Id': `ai-smoke-bootstrap-${Date.now()}`
  };
}

function normalizeSessionContext(sessionContext) {
  if (!sessionContext || typeof sessionContext !== 'object') return null;

  return {
    ...sessionContext,
    id: sessionContext.id || sessionContext.sessionContextId || '',
    sessionContextId: sessionContext.sessionContextId || sessionContext.id || ''
  };
}

function pickAccount(accountsResponse, requestedAccountId) {
  const accounts = Array.isArray(accountsResponse?.accounts) ? accountsResponse.accounts : [];
  const normalizedRequested = String(requestedAccountId || '').trim();

  if (!accounts.length) {
    return null;
  }

  if (normalizedRequested) {
    const byRequested = accounts.find((account) => String(account.accountId || '') === normalizedRequested);
    if (byRequested) return byRequested;

    throw new Error(`Conta CETESB informada não encontrada: ${normalizedRequested}`);
  }

  const activeAccountId = String(accountsResponse?.activeAccountId || '').trim();
  if (activeAccountId) {
    const active = accounts.find((account) => String(account.accountId || '') === activeAccountId);
    if (active) return active;
  }

  const preferredActive = accounts.find((account) => account.active || account.isActive);
  return preferredActive || accounts[0];
}

function buildEnvContent(values) {
  const lines = [
    '# Gerado automaticamente por scripts/ai-smoke/bootstrap-sicat-smoke-env.mjs',
    '# Não commitar este arquivo se ele tiver tokens reais.',
    '',
    `SICAT_API_BASE_URL=${values.SICAT_API_BASE_URL}`,
    `SICAT_ACCESS_TOKEN=${values.SICAT_ACCESS_TOKEN}`,
    `SICAT_REFRESH_TOKEN=${values.SICAT_REFRESH_TOKEN}`,
    `SICAT_INTEGRATION_ACCOUNT_ID=${values.SICAT_INTEGRATION_ACCOUNT_ID}`,
    `SICAT_SESSION_CONTEXT_ID=${values.SICAT_SESSION_CONTEXT_ID}`,
    `SICAT_ACCOUNT_ID=${values.SICAT_ACCOUNT_ID}`,
    `SICAT_USER_ID=${values.SICAT_USER_ID}`,
    `SICAT_REQUESTED_BY=${values.SICAT_REQUESTED_BY}`,
    '',
    '# IA do backend e juiz real',
    `OPENAI_API_KEY=${values.OPENAI_API_KEY || ''}`,
    `OPENAI_AGENT_MODEL=${values.OPENAI_AGENT_MODEL || 'gpt-5-mini'}`,
    `OPENAI_SYNTHESIS_MODEL=${values.OPENAI_SYNTHESIS_MODEL || 'gpt-4.1-mini'}`,
    `OPENAI_JUDGE_MODEL=${values.OPENAI_JUDGE_MODEL || 'gpt-4.1-mini'}`,
    `OPENAI_ESCALATION_MODEL=${values.OPENAI_ESCALATION_MODEL || 'gpt-5.1'}`,
    '# Compatibilidade legada: usado apenas como fallback se os modelos explicitos nao estiverem definidos.',
    `OPENAI_MODEL=${values.OPENAI_MODEL || 'gpt-5-mini'}`,
    '',
    '# Segurança do smoke',
    `SICAT_AI_SMOKE_ALLOW_MUTATIONS=${values.SICAT_AI_SMOKE_ALLOW_MUTATIONS || 'false'}`,
    `SICAT_AI_SMOKE_FORCE_SAFE_PROMPT_PREFIX=${values.SICAT_AI_SMOKE_FORCE_SAFE_PROMPT_PREFIX || 'true'}`,
    '',
    '# Execução',
    `SICAT_AI_SMOKE_TIMEOUT_MS=${values.SICAT_AI_SMOKE_TIMEOUT_MS || '45000'}`,
    `SICAT_AI_SMOKE_CONCURRENCY=${values.SICAT_AI_SMOKE_CONCURRENCY || '1'}`,
    `SICAT_AI_SMOKE_OUTPUT_DIR=${values.SICAT_AI_SMOKE_OUTPUT_DIR || 'artifacts/ai-smoke'}`,
    ''
  ];

  return lines.join('\n');
}

async function promptIfNeeded(args, existing) {
  if (args.nonInteractive) return args;

  const rl = readline.createInterface({ input, output });

  try {
    if (!args.apiBaseUrl) {
      const value = await rl.question(`SICAT API Base URL [${existing.SICAT_API_BASE_URL || DEFAULT_API_BASE_URL}]: `);
      args.apiBaseUrl = value.trim() || existing.SICAT_API_BASE_URL || DEFAULT_API_BASE_URL;
    }

    if (!args.email) {
      const value = await rl.question(`E-mail SICAT [${existing.SICAT_LOGIN_EMAIL || DEFAULT_EMAIL}]: `);
      args.email = value.trim() || existing.SICAT_LOGIN_EMAIL || DEFAULT_EMAIL;
    }

    if (!args.password) {
      const value = await rl.question('Senha SICAT (não será salva): ', { hideEchoBack: true });
      args.password = value;
    }

    if (!args.accountId && existing.SICAT_ACCOUNT_ID) {
      const value = await rl.question(`Forçar accountId CETESB [enter para usar ativo/primeiro; atual ${existing.SICAT_ACCOUNT_ID}]: `);
      args.accountId = value.trim();
    }
  } finally {
    rl.close();
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const existing = preserveExistingEnv(args.output);

  args.apiBaseUrl ||= process.env.SICAT_API_BASE_URL || existing.SICAT_API_BASE_URL || DEFAULT_API_BASE_URL;
  args.email ||= process.env.SICAT_LOGIN_EMAIL || existing.SICAT_LOGIN_EMAIL || DEFAULT_EMAIL;
  args.password ||= process.env.SICAT_LOGIN_PASSWORD || '';
  args.accountId ||= process.env.SICAT_ACCOUNT_ID || '';

  await promptIfNeeded(args, existing);

  const apiBaseUrl = String(args.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const email = String(args.email || '').trim();
  const password = String(args.password || '');

  if (!email) {
    throw new Error('E-mail SICAT não informado.');
  }

  if (!password) {
    throw new Error('Senha SICAT não informada. Use prompt interativo ou SICAT_LOGIN_PASSWORD localmente.');
  }

  console.log(`Autenticando no SICAT em ${apiBaseUrl} com usuário ${email}...`);

  const login = await requestJson(`${apiBaseUrl}/v1/sicat/auth/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Correlation-Id': `ai-smoke-login-${Date.now()}`
    },
    body: JSON.stringify({ email, password })
  });

  const accessToken = String(login?.accessToken || '').trim();
  const refreshToken = String(login?.refreshToken || '').trim();

  if (!accessToken) {
    throw new Error('Login realizado, mas accessToken não foi retornado.');
  }

  const userId = String(login?.user?.userId || login?.user?.email || email).trim() || email;

  console.log('Login OK. Buscando contas CETESB...');

  const accountsResponse = await requestJson(`${apiBaseUrl}/v1/sicat/cetesb-accounts`, {
    method: 'GET',
    headers: authHeaders(accessToken)
  });

  const selectedAccount = pickAccount(accountsResponse, args.accountId);

  if (!selectedAccount?.accountId) {
    throw new Error('Nenhuma conta CETESB encontrada para este usuário. Ative/cadastre uma conta no SICAT antes do smoke.');
  }

  console.log(`Ativando conta CETESB ${selectedAccount.accountId}...`);

  let activeSession = await requestJson(`${apiBaseUrl}/v1/sicat/cetesb-accounts/${encodeURIComponent(selectedAccount.accountId)}/activate`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({})
  });

  let sessionContext = normalizeSessionContext(activeSession?.sessionContext);
  let activeAccount = activeSession?.activeAccount || selectedAccount;

  if (!sessionContext?.id || !sessionContext?.integrationAccountId) {
    console.log('Sessão ativada sem contexto completo. Sincronizando /v1/sicat/session...');
    activeSession = await requestJson(`${apiBaseUrl}/v1/sicat/session`, {
      method: 'GET',
      headers: authHeaders(accessToken)
    });

    sessionContext = normalizeSessionContext(activeSession?.sessionContext);
    activeAccount = activeSession?.activeAccount || activeAccount;
  }

  const integrationAccountId = String(sessionContext?.integrationAccountId || '').trim();
  const sessionContextId = String(sessionContext?.id || sessionContext?.sessionContextId || '').trim();
  const accountId = String(activeAccount?.accountId || selectedAccount.accountId || '').trim();

  if (!integrationAccountId || !sessionContextId || !accountId) {
    throw new Error([
      'Não foi possível montar o contexto operacional completo.',
      `integrationAccountId=${integrationAccountId || '<vazio>'}`,
      `sessionContextId=${sessionContextId || '<vazio>'}`,
      `accountId=${accountId || '<vazio>'}`
    ].join(' '));
  }

  const values = {
    ...existing,
    SICAT_API_BASE_URL: apiBaseUrl,
    SICAT_ACCESS_TOKEN: accessToken,
    SICAT_REFRESH_TOKEN: refreshToken,
    SICAT_INTEGRATION_ACCOUNT_ID: integrationAccountId,
    SICAT_SESSION_CONTEXT_ID: sessionContextId,
    SICAT_ACCOUNT_ID: accountId,
    SICAT_USER_ID: userId,
    SICAT_REQUESTED_BY: email
  };

  fs.mkdirSync('scripts/ai-smoke', { recursive: true });
  fs.writeFileSync(args.output, buildEnvContent(values), 'utf8');

  console.log('');
  console.log(`Arquivo gerado: ${args.output}`);
  console.log(`Usuário: ${userId}`);
  console.log(`Conta CETESB: ${accountId}`);
  console.log(`integrationAccountId: ${integrationAccountId}`);
  console.log(`sessionContextId: ${sessionContextId}`);
  console.log('');
  console.log('Agora execute: npm run smoke:ai-chat:sample');
}

main().catch((error) => {
  console.error('');
  console.error(`Falha no bootstrap: ${error.message}`);
  process.exitCode = 1;
});
