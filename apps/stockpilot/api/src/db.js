// db.js — pool + migrations versionadas (advisory-lock no boot) + seed. Gerado pela Forge.
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const MIGRATIONS = [`CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', payload JSONB NOT NULL DEFAULT '{}'::jsonb, external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS jobs (id BIGSERIAL PRIMARY KEY, type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','dlq')), attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 4, run_after TIMESTAMPTZ NOT NULL DEFAULT now(), locked_at TIMESTAMPTZ, locked_by TEXT, last_error TEXT, job_key TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()); CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (status, run_after) WHERE status='queued';`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, response JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, current_stock INTEGER NOT NULL DEFAULT 0, min_stock INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS product_orders (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered')), external_ref TEXT, last_error TEXT, last_attempt_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()); CREATE INDEX IF NOT EXISTS idx_product_orders_product ON product_orders(product_id); CREATE INDEX IF NOT EXISTS idx_product_orders_status ON product_orders(status);`,
  // REQ-STOCKPILOT-0002 — isolamento multi-tenant: coluna tenant_id + índice (tenant_id, id) em toda tabela de negócio.
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default'; ALTER TABLE product_orders ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default'; CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id, id); CREATE INDEX IF NOT EXISTS idx_product_orders_tenant ON product_orders(tenant_id, id);`,
  // REQ-STOCKPILOT-0003 — reposição assíncrona: o pedido pode terminar em 'failed' (DLQ do job).
  `ALTER TABLE product_orders DROP CONSTRAINT IF EXISTS product_orders_status_check; ALTER TABLE product_orders ADD CONSTRAINT product_orders_status_check CHECK (status IN ('pending','processing','delivered','failed'));`,
  // REQ-STOCKPILOT-0004 — trilha de auditoria das trocas com o fornecedor externo (uma linha por troca/tentativa).
  // Payloads SANITIZADOS e erro REDIGIDO (segredos nunca persistidos); escopado por tenant_id.
  `CREATE TABLE IF NOT EXISTS gateway_audit (
     id BIGSERIAL PRIMARY KEY,
     tenant_id TEXT NOT NULL DEFAULT 'default',
     operation TEXT NOT NULL DEFAULT 'submeter_pedido',
     product_id INTEGER,
     order_id INTEGER,
     outcome TEXT NOT NULL CHECK (outcome IN ('success','failure')),
     status_code INTEGER,
     attempt INTEGER,
     request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
     response_payload JSONB,
     error_redacted TEXT,
     duration_ms INTEGER,
     created_at TIMESTAMPTZ DEFAULT now()
   ); CREATE INDEX IF NOT EXISTS idx_gateway_audit_tenant ON gateway_audit(tenant_id, id DESC);`,
  // REQ-STOCKPILOT-0007 — notificações multi-canal (e-mail/push/whatsapp) por evento (ruptura/falha_pedido).
  // Um registro por evento; `canais` guarda o desfecho POR canal (sent/failed/skipped); `dedupe_key` UNIQUE
  // dá idempotência (mesmo evento não duplica). Escopado por tenant_id (REQ-STOCKPILOT-0002).
  `CREATE TABLE IF NOT EXISTS notifications (
     id BIGSERIAL PRIMARY KEY,
     tenant_id TEXT NOT NULL DEFAULT 'default',
     usuario_id TEXT,
     tipo TEXT NOT NULL CHECK (tipo IN ('ruptura','falha_pedido')),
     referencia_id BIGINT,
     dedupe_key TEXT UNIQUE,
     canais JSONB NOT NULL DEFAULT '[]'::jsonb,
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
     tentativas INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   ); CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id, id DESC);`,
  // REQ-STOCKPILOT-0004 — CRUD de fornecedores (gateway externo configurável). Guarda a FORMA da
  // autenticação (auth_type) + a URL do gateway + política de timeout/retry; NUNCA o segredo em si
  // (api_key/token vêm de env/Sealed Secrets na hora da troca). Escopado por tenant_id.
  `CREATE TABLE IF NOT EXISTS suppliers (
     id SERIAL PRIMARY KEY,
     tenant_id TEXT NOT NULL DEFAULT 'default',
     name TEXT NOT NULL,
     gateway_url TEXT NOT NULL,
     auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('api_key','bearer','basic','none')),
     timeout_ms INTEGER,
     max_retries INTEGER,
     active BOOLEAN NOT NULL DEFAULT true,
     notes TEXT,
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   ); CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id, id);`,
  // REF-STOCKPILOT-0002 — coluna sku no catálogo de produtos (opcional, max 60 chars).
  // Exibida na lista de produtos e editável via CRUD de produtos (POST/PUT /v1/products).
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;`,
  // REQ-STOCKPILOT-0007 — CRUD de canais de notificação (assinaturas de webhook). Complementa o
  // fan-out multi-canal (notifications) com a CONFIGURAÇÃO persistida por canal: tipo, webhook,
  // eventos assinados, habilitado e o último desfecho da entrega. Escopado por tenant_id.
  `CREATE TABLE IF NOT EXISTS channels (
     id SERIAL PRIMARY KEY,
     tenant_id TEXT NOT NULL DEFAULT 'default',
     channel TEXT NOT NULL CHECK (channel IN ('email','push','whatsapp')),
     webhook_url TEXT NOT NULL,
     events TEXT CHECK (events IS NULL OR events IN ('ruptura','falha_pedido')),
     enabled BOOLEAN NOT NULL DEFAULT true,
     last_status TEXT CHECK (last_status IS NULL OR last_status IN ('sent','failed','skipped')),
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   ); CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels(tenant_id, id);`];
export async function migrate() {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(77131)');
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    const { rows } = await c.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((r) => r.version));
    for (let i = 0; i < MIGRATIONS.length; i++) { const v = i + 1; if (done.has(v)) continue;
      await c.query('BEGIN');
      try { await c.query(MIGRATIONS[i]); await c.query('INSERT INTO schema_migrations(version) VALUES ($1)', [v]); await c.query('COMMIT'); }
      catch (e) { await c.query('ROLLBACK'); throw e; }
      console.log('[migrate] migration ' + v); }
  } finally { await c.query('SELECT pg_advisory_unlock(77131)').catch(() => {}); c.release(); }
}
export async function seed() {
  const { rows: recs } = await pool.query('SELECT count(*)::int AS n FROM records');
  if (recs[0].n === 0) {
    await pool.query(`INSERT INTO records(title) VALUES ('Registro de exemplo')`);
  }
  // REQ-STOCKPILOT-0004 — fornecedores de exemplo (idempotente: só se a tabela estiver vazia).
  const { rows: sup } = await pool.query('SELECT count(*)::int AS n FROM suppliers');
  if (sup[0].n === 0) {
    await pool.query(`
      INSERT INTO suppliers(name, gateway_url, auth_type, timeout_ms, max_retries, active, notes) VALUES
        ('MedSupply Brasil', 'https://gw.medsupply.example/v1/orders', 'api_key', 5000, 4, true, 'Fornecedor principal de EPI'),
        ('Distribuidora Norte', 'https://api.distnorte.example/orders', 'bearer', 8000, 2, true, 'Cobertura região Norte'),
        ('Legado Hospitalar', 'https://legacy.hosp.example/submit', 'basic', 10000, 1, false, 'Em desativação')`);
  }
  // REQ-STOCKPILOT-0007 — canais de notificação de exemplo (idempotente).
  const { rows: ch } = await pool.query('SELECT count(*)::int AS n FROM channels');
  if (ch[0].n === 0) {
    await pool.query(`
      INSERT INTO channels(channel, webhook_url, events, enabled, last_status) VALUES
        ('email', 'https://hooks.example/email', 'ruptura', true, 'sent'),
        ('whatsapp', 'https://hooks.example/whatsapp', 'falha_pedido', true, 'failed'),
        ('push', 'https://hooks.example/push', 'ruptura', false, 'skipped')`);
  }
  const { rows: prods } = await pool.query('SELECT count(*)::int AS n FROM products');
  if (prods[0].n > 0) return;
  const ins = await pool.query(`
    INSERT INTO products(name, current_stock, min_stock) VALUES
      ('Álcool 70%', 5, 50),
      ('Luvas de látex P', 42, 40),
      ('Máscaras N95', 200, 50),
      ('Avental descartável', 8, 30)
    RETURNING id, current_stock, min_stock`);
  // produto 2 (luvas): stock=42 < 1.5*40=60 → ALERTA com pedido aberto
  const luvas = ins.rows[1];
  await pool.query(`INSERT INTO product_orders(product_id, status) VALUES ($1, 'pending')`, [luvas.id]);
  // produto 4 (avental): stock=8 < min=30 com pedido pendente + erro → ALERTA + ERROR no alertas
  const avental = ins.rows[3];
  await pool.query(`INSERT INTO product_orders(product_id, status, last_error, last_attempt_at) VALUES ($1, 'pending', 'Timeout ao contatar fornecedor', now() - interval '2 hours')`, [avental.id]);
  console.log('[seed] produtos ok');
}
