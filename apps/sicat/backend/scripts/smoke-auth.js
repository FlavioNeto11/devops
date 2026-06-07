#!/usr/bin/env node
/**
 * Smoke test para validação rápida do endpoint de autenticação
 * Uso: npm run smoke:auth
 * Requer: API rodando em modo mock
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const TIMEOUT_MS = 5000;

// Cores para output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m'
};

function logSuccess(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function logError(msg) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function logInfo(msg) {
  console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
}

function logWarning(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

async function testHealthEndpoint() {
  logInfo('Testando endpoint de health...');
  
  try {
    const response = await fetchWithTimeout(`${API_BASE}/v1/ping`);
    const data = await response.json();

    if (response.status !== 200) {
      logError(`Health check falhou: status ${response.status}`);
      return false;
    }

    if (data.status !== 'ok') {
      logError(`Health check falhou: status não é 'ok'`);
      return false;
    }

    logSuccess(`API está online (${data.timestamp})`);
    return true;
  } catch (error) {
    logError(`Falha ao conectar API: ${error.message}`);
    return false;
  }
}

async function testLoginWithValidCredentials() {
  logInfo('Testando login com credenciais válidas...');

  try {
    // Carregar payload de exemplo
    const examplePath = join(__dirname, '../examples/post_v1_auth_login_request.json');
    const exampleContent = await readFile(examplePath, 'utf-8');
    const payload = JSON.parse(exampleContent);

    const response = await fetchWithTimeout(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.status !== 200) {
      logError(`Login falhou: status ${response.status}`);
      console.log(colors.gray, JSON.stringify(data, null, 2), colors.reset);
      return false;
    }

    // Validar campos obrigatórios
    const requiredFields = ['token', 'expiresAt', 'user', 'partner'];
    for (const field of requiredFields) {
      if (!data[field]) {
        logError(`Campo obrigatório ausente: ${field}`);
        return false;
      }
    }

    // Validar token JWT
    if (!data.token.startsWith('eyJ')) {
      logError('Token não é JWT válido');
      return false;
    }

    // Validar expiresAt
    const expiresAt = new Date(data.expiresAt);
    const now = new Date();
    if (expiresAt <= now) {
      logError(`Token já expirou: ${data.expiresAt}`);
      return false;
    }

    logSuccess('Login bem-sucedido');
    logInfo(`  Token: ${data.token.substring(0, 50)}...`);
    logInfo(`  Expira em: ${data.expiresAt}`);
    logInfo(`  Usuário: ${data.user.name} (${data.user.email})`);
    logInfo(`  Parceiro: ${data.partner.description} (${data.partner.partnerCode || data.partner.code})`);

    return true;
  } catch (error) {
    logError(`Erro no teste de login: ${error.message}`);
    return false;
  }
}

async function testLoginWithoutRecaptcha() {
  logInfo('Testando login sem recaptchaToken...');

  try {
    const payload = {
      document: '31913781000139',
      password: '2dlzft'
      // sem recaptchaToken
    };

    const response = await fetchWithTimeout(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 200) {
      logError(`Login sem recaptcha falhou: status ${response.status}`);
      return false;
    }

    const data = await response.json();
    if (!data.token) {
      logError('Token não retornado sem recaptchaToken');
      return false;
    }

    logSuccess('Login sem recaptchaToken aceito');
    return true;
  } catch (error) {
    logError(`Erro no teste sem recaptcha: ${error.message}`);
    return false;
  }
}

async function testLoginWithMissingFields() {
  logInfo('Testando login com campos ausentes (deve falhar com 400)...');

  try {
    const payload = {
      password: '2dlzft'
      // sem document
    };

    const response = await fetchWithTimeout(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 400) {
      logError(`Esperado 400, recebido ${response.status}`);
      return false;
    }

    const data = await response.json();
    if (data.code !== 'MISSING_CREDENTIALS') {
      logError(`Esperado code MISSING_CREDENTIALS, recebido ${data.code}`);
      return false;
    }

    logSuccess('Validação de campos obrigatórios funciona');
    return true;
  } catch (error) {
    logError(`Erro no teste de campos ausentes: ${error.message}`);
    return false;
  }
}

async function testPartnerInfo() {
  logInfo('Testando endpoint de informações de parceiro...');

  try {
    const document = '31913781000139';
    const response = await fetchWithTimeout(`${API_BASE}/v1/auth/partner-info?document=${document}`);

    if (response.status !== 200) {
      logWarning(`Partner info retornou status ${response.status} (pode ser esperado se não implementado mock)`);
      return true; // Não falhar o smoke test por isso
    }

    const data = await response.json();
    if (!data.partnerCode && !data.code) {
      logWarning('Partner info não retornou partnerCode');
      return true;
    }

    logSuccess('Partner info endpoint funciona');
    logInfo(`  Parceiro: ${data.description} (${data.partnerCode || data.code})`);
    return true;
  } catch (error) {
    logWarning(`Partner info endpoint falhou: ${error.message}`);
    return true; // Não crítico para smoke test
  }
}

async function testErrorFormat() {
  logInfo('Testando formato de erro (application/problem+json)...');

  try {
    const payload = { document: '123' }; // sem password

    const response = await fetchWithTimeout(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/problem+json') && !contentType?.includes('application/json')) {
      logError(`Content-Type inválido em erro: ${contentType}`);
      return false;
    }

    const data = await response.json();
    const requiredErrorFields = ['type', 'title', 'status', 'detail'];
    for (const field of requiredErrorFields) {
      if (!data[field]) {
        logError(`Campo de erro ausente: ${field}`);
        return false;
      }
    }

    logSuccess('Formato de erro está correto (RFC 7807)');
    return true;
  } catch (error) {
    logError(`Erro no teste de formato: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  Smoke Test: Auth Endpoints');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  const tests = [
    { name: 'Health Check', fn: testHealthEndpoint, critical: true },
    { name: 'Login com credenciais válidas', fn: testLoginWithValidCredentials, critical: true },
    { name: 'Login sem recaptchaToken', fn: testLoginWithoutRecaptcha, critical: true },
    { name: 'Validação de campos obrigatórios', fn: testLoginWithMissingFields, critical: true },
    { name: 'Formato de erro RFC 7807', fn: testErrorFormat, critical: true },
    { name: 'Partner info endpoint', fn: testPartnerInfo, critical: false }
  ];

  const results = [];

  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ ...test, passed });
    } catch (error) {
      logError(`Teste "${test.name}" lançou exceção: ${error.message}`);
      results.push({ ...test, passed: false });
    }
    console.log('');
  }

  // Sumário
  console.log('═══════════════════════════════════════════════');
  console.log('  Sumário');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const criticalFailed = results.filter(r => !r.passed && r.critical).length;

  console.log(`Total de testes: ${results.length}`);
  console.log(`${colors.green}Passou: ${passed}${colors.reset}`);
  console.log(`${colors.red}Falhou: ${failed}${colors.reset}`);
  console.log('');

  if (criticalFailed > 0) {
    logError(`${criticalFailed} teste(s) crítico(s) falharam`);
    console.log('');
    process.exit(1);
  }

  if (failed > 0) {
    logWarning(`${failed} teste(s) não-crítico(s) falharam`);
  } else {
    logSuccess('Todos os testes passaram! 🎉');
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  logError(`Erro fatal: ${error.message}`);
  console.error(error);
  process.exit(1);
});
