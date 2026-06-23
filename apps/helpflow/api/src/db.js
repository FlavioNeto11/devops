// db.js — pool + migrations versionadas (advisory-lock no boot) + seed. Gerado pela Forge.
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const MIGRATIONS = [`CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', payload JSONB NOT NULL DEFAULT '{}'::jsonb, external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`,
  `CREATE TABLE IF NOT EXISTS jobs (id BIGSERIAL PRIMARY KEY, type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','dlq')), attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 4, run_after TIMESTAMPTZ NOT NULL DEFAULT now(), locked_at TIMESTAMPTZ, locked_by TEXT, last_error TEXT, job_key TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()); CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (status, run_after) WHERE status='queued';`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, response JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());`,
  // ---- entidades de domínio do HelpFlow (CRUD) — migração 4 ----
  `CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, organization TEXT, vip BOOLEAN NOT NULL DEFAULT false, status TEXT NOT NULL DEFAULT 'active', notes TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
   CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers (tenant_id);
   CREATE TABLE IF NOT EXISTS teams (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, description TEXT, lead_agent_id INTEGER, default_sla_policy_id INTEGER, status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
   CREATE INDEX IF NOT EXISTS teams_tenant_idx ON teams (tenant_id);
   CREATE TABLE IF NOT EXISTS agents (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'agent', team_id INTEGER, status TEXT NOT NULL DEFAULT 'active', last_login_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
   CREATE INDEX IF NOT EXISTS agents_tenant_idx ON agents (tenant_id);
   CREATE TABLE IF NOT EXISTS comments (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, ticket_id INTEGER NOT NULL, author_id INTEGER NOT NULL, body TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'public', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
   CREATE INDEX IF NOT EXISTS comments_tenant_idx ON comments (tenant_id);
   CREATE TABLE IF NOT EXISTS sla_policies (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium', first_response_mins INTEGER NOT NULL DEFAULT 60, resolution_mins INTEGER NOT NULL DEFAULT 480, business_hours_only BOOLEAN NOT NULL DEFAULT false, status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
   CREATE INDEX IF NOT EXISTS sla_policies_tenant_idx ON sla_policies (tenant_id);
   CREATE TABLE IF NOT EXISTS kb_articles (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, body TEXT NOT NULL, category TEXT, tags TEXT, status TEXT NOT NULL DEFAULT 'draft', embedding_status TEXT NOT NULL DEFAULT 'pending', author_id INTEGER, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
   CREATE INDEX IF NOT EXISTS kb_articles_tenant_idx ON kb_articles (tenant_id);
   CREATE TABLE IF NOT EXISTS integrations (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, kind TEXT NOT NULL, base_url TEXT, timeout_ms INTEGER, retries INTEGER, status TEXT NOT NULL DEFAULT 'active', last_check_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
   CREATE INDEX IF NOT EXISTS integrations_tenant_idx ON integrations (tenant_id);`,
  // ---- tickets (entidade central do service desk) — migração 5 ----
  // A tabela 'comments' já referencia ticket_id; esta migração cria a entidade
  // que ela acompanha. sla_due_at é o prazo derivado da política aplicada.
  `CREATE TABLE IF NOT EXISTS tickets (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, subject TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'open', channel TEXT, team_id INTEGER, assignee_id INTEGER, sla_policy_id INTEGER, external_ref TEXT, customer_id INTEGER, sla_due_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
   CREATE INDEX IF NOT EXISTS tickets_tenant_idx ON tickets (tenant_id);
   CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (tenant_id, status);`,
  // ---- trilha de auditoria do gateway (integration_audit) — migração 6 ----
  // Registra cada chamada que o gateway faz por integração (método/rota/código/
  // latência) + o corpo da resposta JÁ REDIGIDO (a redação é server-side, fonte
  // da verdade — ver gateways/gateway.js). A tela /integrations/:id lê esta trilha.
  `CREATE TABLE IF NOT EXISTS integration_audit (id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, integration_id INTEGER NOT NULL, method TEXT NOT NULL DEFAULT 'GET', path TEXT NOT NULL DEFAULT '', status_code INTEGER, latency_ms INTEGER, ok BOOLEAN, redacted BOOLEAN NOT NULL DEFAULT true, response JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT now());
   CREATE INDEX IF NOT EXISTS integration_audit_idx ON integration_audit (tenant_id, integration_id, created_at DESC);`,
  // ---- pgvector: extensão vector + tabela de chunks para busca semântica (RAG) — migração 7 ----
  // CREATE EXTENSION é envolvido em DO-block que absorve a exceção caso o binário do
  // pgvector não esteja na imagem Postgres (upgrade postgres:16 → pgvector/pgvector:pg16
  // resolve). kb_chunks é criada SEM coluna de embedding; o segundo DO-block adiciona
  // embedding vector(1536) + índice HNSW somente quando a extensão estiver presente.
  // Assim o app NUNCA falha no boot por falta do pgvector e degrada para busca textual.
  `DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS vector; EXCEPTION WHEN OTHERS THEN NULL; END $$;
   CREATE TABLE IF NOT EXISTS kb_chunks (
     id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1,
     article_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
     chunk_index INTEGER NOT NULL, content TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS kb_chunks_article_idx ON kb_chunks (tenant_id, article_id);
   DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
       EXECUTE 'ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)';
       EXECUTE 'CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx ON kb_chunks USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL';
     END IF;
   END $$;`];
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
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM records');
  if (rows[0].n === 0) {
    await pool.query(`INSERT INTO records(title) VALUES ('Registro de exemplo')`);
    console.log('[seed] records ok');
  }
  await seedDomain();
}

// Seed das entidades de domínio — idempotente (cada tabela só semeia quando vazia).
async function seedDomain() {
  const empty = async (t) => (await pool.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n === 0;

  if (await empty('teams')) {
    await pool.query(`INSERT INTO teams(name,description,status) VALUES
      ('Suporte N1','Triagem e primeiro atendimento','active'),
      ('Suporte N2','Casos escalados / técnicos','active'),
      ('Faturamento','Dúvidas financeiras','active')`);
  }
  if (await empty('agents')) {
    await pool.query(`INSERT INTO agents(name,email,role,team_id,status) VALUES
      ('Ana Souza','ana@helpflow.local','admin',1,'active'),
      ('Bruno Lima','bruno@helpflow.local','supervisor',2,'active'),
      ('Carla Dias','carla@helpflow.local','agent',1,'active')`);
  }
  if (await empty('customers')) {
    await pool.query(`INSERT INTO customers(name,email,phone,organization,vip,status,notes) VALUES
      ('João Pereira','joao@cliente.com','+55 11 90000-0001','Acme Ltda',true,'active','Cliente prioritário'),
      ('Maria Santos','maria@cliente.com','+55 11 90000-0002','Beta SA',false,'active',NULL),
      ('Pedro Alves','pedro@cliente.com',NULL,'Gamma ME',false,'inactive','Conta encerrada')`);
  }
  if (await empty('sla_policies')) {
    await pool.query(`INSERT INTO sla_policies(name,priority,first_response_mins,resolution_mins,business_hours_only,status) VALUES
      ('SLA Urgente','urgent',15,120,false,'active'),
      ('SLA Padrão','medium',60,480,true,'active'),
      ('SLA Baixo','low',240,2880,true,'active')`);
  }
  if (await empty('comments')) {
    await pool.query(`INSERT INTO comments(ticket_id,author_id,body,visibility) VALUES
      (1,1,'Olá, recebemos seu chamado e já estamos analisando.','public'),
      (1,2,'Cliente VIP — priorizar.','internal'),
      (2,3,'Pode tentar reiniciar o serviço?','public')`);
  }
  if (await empty('kb_articles')) {
    await pool.query(`INSERT INTO kb_articles(title,body,category,tags,status,embedding_status,author_id) VALUES
      ('Como redefinir a senha','Acesse Configurações > Segurança e clique em Redefinir.','Conta','senha,login','published','indexed',1),
      ('Política de reembolso','Reembolsos são processados em até 5 dias úteis.','Faturamento','reembolso','published','indexed',2),
      ('Rascunho: nova integração','Documentação em andamento.','Integrações','draft','draft','pending',1)`);
  }
  if (await empty('integrations')) {
    await pool.query(`INSERT INTO integrations(name,kind,base_url,timeout_ms,retries,status,last_check_at) VALUES
      ('E-mail SMTP','email','smtp://mail.helpflow.local:587',5000,3,'active',now()),
      ('Central Externa','external_central','https://central.example.com/api',8000,2,'degraded',now()),
      ('Webhook Eventos','webhook','https://hooks.helpflow.local/in',3000,4,'active',NULL)`);
  }
  if (await empty('tickets')) {
    // sla_due_at é o prazo aplicado; aqui apenas valores de exemplo coerentes
    // (urgente vence cedo, baixo vence longe) — o servidor recalcula ao salvar.
    await pool.query(`INSERT INTO tickets(subject,description,priority,status,channel,team_id,assignee_id,sla_policy_id,external_ref,customer_id,sla_due_at) VALUES
      ('Não consigo acessar o portal','Ao tentar logar recebo erro 500 desde hoje de manhã.','urgent','open','email',1,3,1,'JIRA-4821',1, now() + interval '2 hours'),
      ('Dúvida sobre a fatura de junho','O valor cobrado está diferente do contratado.','medium','in_progress','portal',3,2,2,NULL,2, now() + interval '8 hours'),
      ('Solicitação de novo usuário','Preciso liberar acesso para um colaborador novo.','low','pending','chat',1,NULL,3,NULL,3, now() + interval '2 days')`);
  }
  console.log('[seed] domain ok');
}
