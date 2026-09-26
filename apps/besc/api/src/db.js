// Postgres da fundação com separação de papéis (ADR-010, hardening P0).
//
// admin pool   = DATABASE_URL (MIGRATION_ROLE; no cluster é o POSTGRES_USER, superusuário).
//                Usado SÓ no boot: migrations, seed de RBAC, usuário bootstrap, preparo do papel.
// runtime pool = besc_app (APPLICATION_ROLE, sql/0008_runtime_role.sql). Atende as requisições.
//   modo 'login'    : BESC_DB_APP_PASSWORD definido → o boot faz ALTER ROLE besc_app LOGIN PASSWORD
//                     e o pool conecta como besc_app. Separação real de credenciais.
//   modo 'set_role' : sem senha → conecta com a credencial de migração e assume besc_app no início
//                     de cada sessão (parâmetro role). Os privilégios efetivos são os de besc_app, mas um SQL injection
//                     poderia fazer RESET ROLE. Por isso BESC_DB_REQUIRE_APP_ROLE=true recusa esse modo.
// Fail-soft: se o banco cair, o portal público segue; rotas gated respondem 503.
import pg from 'pg';
import { config } from './config.js';

export const APP_ROLE = 'besc_app';

let adminPool = null;
let runtimePool = null;
let runtimeMode = null;
let ready = false;

export function getAdminPool() {
  if (!adminPool && config.databaseUrl) {
    adminPool = new pg.Pool({ connectionString: config.databaseUrl, max: 3, ssl: false });
    adminPool.on('error', (e) => { console.error('[db] admin pool error:', e.message); });
  }
  return adminPool;
}

function runtimeConnectionString() {
  const u = new URL(config.databaseUrl);
  u.username = APP_ROLE;
  u.password = encodeURIComponent(config.dbAppPassword);
  return u.toString();
}

// Prepara o papel de runtime (no boot, depois das migrations) e cria o pool de runtime.
export async function prepareRuntimeRole() {
  const admin = getAdminPool();
  if (!admin) return null;
  if (config.dbAppPassword) {
    const c = await admin.connect();
    try {
      await c.query(`ALTER ROLE ${APP_ROLE} LOGIN PASSWORD ${c.escapeLiteral(config.dbAppPassword)}`);
    } finally { c.release(); }
    runtimeMode = 'login';
    runtimePool = new pg.Pool({ connectionString: runtimeConnectionString(), max: 10, ssl: false });
  } else {
    if (config.requireAppRole) {
      throw new Error('BESC_DB_REQUIRE_APP_ROLE=true exige BESC_DB_APP_PASSWORD (credencial própria do papel besc_app)');
    }
    runtimeMode = 'set_role';
    // papel como parâmetro de inicialização da sessão: se não puder assumir besc_app, a conexão falha
    runtimePool = new pg.Pool({ connectionString: config.databaseUrl, max: 10, ssl: false, options: `-c role=${APP_ROLE}` });
    console.warn('[db] runtime em modo SET ROLE besc_app (sem credencial própria) — defina BESC_DB_APP_PASSWORD para separação completa');
  }
  runtimePool.on('error', (e) => { console.error('[db] pool error:', e.message); ready = false; });
  const who = await runtimePool.query('SELECT current_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS su');
  const { u, su } = who.rows[0];
  if (u !== APP_ROLE || su) throw new Error(`runtime conectou como ${u} (superuser=${su}); esperado ${APP_ROLE} sem superusuário`);
  return { mode: runtimeMode, currentUser: u };
}

export function runtimeRoleInfo() { return { mode: runtimeMode, role: runtimeMode ? APP_ROLE : null }; }

// Pool das requisições. Nunca devolve a credencial de migração: sem runtime preparado, não há pool.
export function getPool() { return runtimePool; }

export function isDbReady() { return ready && !!runtimePool; }

export async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('db indisponível');
  return p.query(text, params);
}

// Transacao com client dedicado.
export async function tx(fn) {
  const p = getPool();
  if (!p) throw new Error('db indisponível');
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Espera o banco ficar pronto (boot) pelo pool de migração.
export async function waitDbReady({ attempts = 30, delayMs = 2000 } = {}) {
  const p = getAdminPool();
  if (!p) return false;
  for (let i = 0; i < attempts; i++) {
    try {
      await p.query('SELECT 1');
      ready = true;
      return true;
    } catch (e) {
      if (i === 0 || i % 5 === 4) console.error(`[db] aguardando postgres (${i + 1}/${attempts}):`, e.message);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

// Vigia continuo: reavalia a saude do banco pelo pool de runtime.
export function startDbWatch({ intervalMs = 15000 } = {}) {
  setInterval(async () => {
    const p = runtimePool || getAdminPool();
    if (!p) return;
    try { await p.query('SELECT 1'); ready = true; }
    catch { ready = false; }
  }, intervalMs).unref();
}

// Encerra os dois pools (testes e desligamento).
export async function closePools() {
  await Promise.all([runtimePool?.end().catch(() => {}), adminPool?.end().catch(() => {})]);
  runtimePool = null; adminPool = null; runtimeMode = null; ready = false;
}
