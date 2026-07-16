// db.js — pool Postgres + migrations multi-tenant. Gerado pela Forge (gymops-style).
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', external_ref TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS physical_persons (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, cpf TEXT NOT NULL, nome TEXT NOT NULL, data_nascimento DATE, endereco JSONB DEFAULT '{}', patrimonio_inicial NUMERIC(15,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS legal_persons (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, razao_social TEXT NOT NULL, cnpj TEXT NOT NULL, inscricao_estadual TEXT, inscricao_municipal TEXT, regime_tributario TEXT NOT NULL DEFAULT 'simples', cnae TEXT, dados_bancarios JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pf_assets (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, pf_id INTEGER NOT NULL, tipo TEXT NOT NULL, descricao TEXT, valor NUMERIC(15,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pf_liabilities (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, pf_id INTEGER NOT NULL, tipo TEXT NOT NULL, descricao TEXT, valor NUMERIC(15,2) DEFAULT 0, recorrente BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pj_partners (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, pj_id INTEGER NOT NULL, nome TEXT NOT NULL, cpf TEXT NOT NULL, participacao_pct NUMERIC(5,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS income_expenses (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, tipo TEXT NOT NULL, categoria TEXT, descricao TEXT, valor NUMERIC(15,2) NOT NULL, data DATE NOT NULL, recorrente BOOLEAN DEFAULT false, centro_custo TEXT, contraparte TEXT, status TEXT DEFAULT 'pendente', comprovante_url TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS documents (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, entity_type TEXT, entity_id INTEGER, tipo TEXT NOT NULL, mes INTEGER, ano INTEGER, status TEXT DEFAULT 'pendente', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS document_versions (id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, filename TEXT NOT NULL, content_type TEXT, file_size INTEGER, uploaded_by TEXT DEFAULT 'local', uploaded_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS idempotency_registry (idempotency_key TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT, entity_id INTEGER, response_json JSONB, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (idempotency_key, operation))`,
  `CREATE TABLE IF NOT EXISTS jobs (id SERIAL PRIMARY KEY, type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, run_after TIMESTAMPTZ DEFAULT now(), locked_at TIMESTAMPTZ, locked_by TEXT, claim_heartbeat_at TIMESTAMPTZ, error_message TEXT, result JSONB, version INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS job_dead_letter_queue (id SERIAL PRIMARY KEY, original_job_id INTEGER, type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}', attempts INTEGER, error_message TEXT, dlq_reason TEXT, moved_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS fiscal_obligations (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, tipo TEXT NOT NULL, data_vencimento DATE NOT NULL, periodicidade TEXT NOT NULL DEFAULT 'mensal', entidade_tipo TEXT NOT NULL DEFAULT 'PJ', entidade_id INTEGER, status TEXT NOT NULL DEFAULT 'pendente', descricao TEXT, valor_estimado NUMERIC(15,2), created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS obligation_alerts (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, obligation_id INTEGER NOT NULL, nivel TEXT NOT NULL, canais TEXT[] DEFAULT '{}', enviado_em TIMESTAMPTZ DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, description TEXT, assignee TEXT, assignee_role TEXT NOT NULL DEFAULT 'member', due_at DATE, priority TEXT NOT NULL DEFAULT 'media', status TEXT NOT NULL DEFAULT 'aberta', entity_type TEXT, entity_id INTEGER, obligation_id INTEGER, created_by TEXT NOT NULL DEFAULT 'local', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS task_comments (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, task_id INTEGER NOT NULL, author TEXT NOT NULL DEFAULT 'local', content TEXT NOT NULL, metadata JSONB DEFAULT '{}', edited_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS task_attachments (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, task_id INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, filename TEXT NOT NULL, content_type TEXT, file_size INTEGER, uploaded_by TEXT NOT NULL DEFAULT 'local', created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS task_notifications (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, task_id INTEGER NOT NULL, event_type TEXT NOT NULL, canais TEXT[] DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT now())`,
  `ALTER TABLE income_expenses ADD COLUMN IF NOT EXISTS forma_pagamento TEXT`,
  `ALTER TABLE income_expenses ADD COLUMN IF NOT EXISTS forma_recebimento TEXT`,
  `ALTER TABLE income_expenses ADD COLUMN IF NOT EXISTS data_pagamento_realizado DATE`,
  `ALTER TABLE income_expenses ADD COLUMN IF NOT EXISTS recorrencia_tipo TEXT`,
  `CREATE TABLE IF NOT EXISTS nf_clients (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, razao_social TEXT NOT NULL, cnpj TEXT NOT NULL, inscricao_estadual TEXT, inscricao_municipal TEXT, endereco JSONB DEFAULT '{}', contato JSONB DEFAULT '{}', tipo_cliente TEXT NOT NULL DEFAULT 'empresa', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS nf_products (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, codigo TEXT, descricao TEXT NOT NULL, valor_unitario NUMERIC(15,4) NOT NULL DEFAULT 0, aliquota_icms NUMERIC(8,4) NOT NULL DEFAULT 0, aliquota_iss NUMERIC(8,4) NOT NULL DEFAULT 0, aliquota_pis NUMERIC(8,4) NOT NULL DEFAULT 0, aliquota_cofins NUMERIC(8,4) NOT NULL DEFAULT 0, cfop TEXT NOT NULL DEFAULT '5102', ncm_nbs TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS notas_fiscais (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, nf_client_id INTEGER, serie TEXT NOT NULL DEFAULT '001', numero_nf TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'rascunho', chave_acesso TEXT, xml_content TEXT, pdf_content TEXT, data_emissao DATE, data_autorizacao_sefaz TIMESTAMPTZ, sefaz_protocolo TEXT, sefaz_motivo TEXT, observacoes TEXT, total_nf NUMERIC(15,2) NOT NULL DEFAULT 0, total_impostos NUMERIC(15,2) NOT NULL DEFAULT 0, emitente_razao_social TEXT, emitente_cnpj TEXT, destinatario_razao_social TEXT, destinatario_cnpj TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS nf_items (id SERIAL PRIMARY KEY, nf_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL DEFAULT 1, nf_product_id INTEGER, codigo TEXT, descricao TEXT NOT NULL, quantidade NUMERIC(15,4) NOT NULL DEFAULT 1, valor_unitario NUMERIC(15,4) NOT NULL DEFAULT 0, valor_total NUMERIC(15,2) NOT NULL DEFAULT 0, aliquota_icms NUMERIC(8,4) NOT NULL DEFAULT 0, icms NUMERIC(15,2) NOT NULL DEFAULT 0, aliquota_iss NUMERIC(8,4) NOT NULL DEFAULT 0, iss NUMERIC(15,2) NOT NULL DEFAULT 0, aliquota_pis NUMERIC(8,4) NOT NULL DEFAULT 0, pis NUMERIC(15,2) NOT NULL DEFAULT 0, aliquota_cofins NUMERIC(8,4) NOT NULL DEFAULT 0, cofins NUMERIC(15,2) NOT NULL DEFAULT 0, cfop TEXT NOT NULL DEFAULT '5102', ncm_nbs TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
  // REQ-CONTAVIVA360-0007: IA — pgvector, thread store, audit log, rascunhos
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE TABLE IF NOT EXISTS knowledge_sources (source_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, chunk_count INTEGER NOT NULL DEFAULT 0, embedding_model TEXT, ingested_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS knowledge_chunks (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES knowledge_sources(source_id) ON DELETE CASCADE, chunk_index INTEGER NOT NULL DEFAULT 0, title TEXT, content TEXT NOT NULL, embedding vector(1536), created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)`,
  `CREATE TABLE IF NOT EXISTS ai_thread_store (thread_id TEXT PRIMARY KEY, messages JSONB NOT NULL DEFAULT '[]', rolling_summary TEXT, turn_count INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS assistant_audit_log (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, conversation_id TEXT, question TEXT, answer TEXT, tools_used JSONB DEFAULT '[]', files_manifest JSONB DEFAULT '[]', confirmations JSONB DEFAULT '[]', duration_ms INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS assistant_drafts (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, draft_id TEXT NOT NULL, draft_type TEXT NOT NULL, draft_data JSONB NOT NULL DEFAULT '{}', conversation_id TEXT, status TEXT NOT NULL DEFAULT 'pendente_confirmacao', created_at TIMESTAMPTZ DEFAULT now(), confirmed_at TIMESTAMPTZ)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS assistant_drafts_draft_id_idx ON assistant_drafts(tenant_id, draft_id)`,
  // REQ-CONTAVIVA360-0009: auditoria de chamadas a sistemas externos (SEFAZ, RFB, e-Social)
  `CREATE TABLE IF NOT EXISTS gateway_audit_log (id SERIAL PRIMARY KEY, gateway TEXT NOT NULL, method TEXT NOT NULL, endpoint TEXT NOT NULL, request_payload_sanitized TEXT, response_status INTEGER, response_snippet TEXT, duration_ms INTEGER, attempts INTEGER NOT NULL DEFAULT 1, user_id TEXT, error_code TEXT, logged_at TIMESTAMPTZ DEFAULT now())`,
];
export async function migrate() {
  const c = await pool.connect();
  try { await c.query('SELECT pg_advisory_lock(66021)');
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`);
    const done = new Set((await c.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    for (let i = 0; i < MIGRATIONS.length; i++) { const v = i + 1; if (done.has(v)) continue;
      await c.query('BEGIN'); try { await c.query(MIGRATIONS[i]); await c.query('INSERT INTO schema_migrations(version) VALUES ($1)', [v]); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK'); throw e; }
      console.log('[migrate] ' + v); }
  } finally { await c.query('SELECT pg_advisory_unlock(66021)').catch(() => {}); c.release(); }
}
export async function seed() {
  // records
  const { rows: rr } = await pool.query('SELECT count(*)::int n FROM records');
  if (rr[0].n === 0) await pool.query(`INSERT INTO records(title) VALUES ('Exemplo')`);

  // pf_assets / pf_liabilities: seed se houver ao menos 1 PF mas nenhum asset/liability
  const { rows: pfr } = await pool.query('SELECT id FROM physical_persons LIMIT 1');
  if (pfr[0]) {
    const pfId = pfr[0].id;
    const { rows: ar } = await pool.query('SELECT count(*)::int n FROM pf_assets WHERE pf_id=$1', [pfId]);
    if (ar[0].n === 0) {
      await pool.query(`INSERT INTO pf_assets(pf_id,tipo,descricao,valor) VALUES ($1,'imovel','Apartamento 70m² Zona Sul',320000),($1,'carro','Volkswagen Polo 2022',65000),($1,'aplicacao','CDB Banco Inter',50000)`, [pfId]);
    }
    const { rows: lr } = await pool.query('SELECT count(*)::int n FROM pf_liabilities WHERE pf_id=$1', [pfId]);
    if (lr[0].n === 0) {
      await pool.query(`INSERT INTO pf_liabilities(pf_id,tipo,descricao,valor,recorrente) VALUES ($1,'financiamento','Financiamento imóvel',1850,true),($1,'cartao','Cartão de crédito',650,false)`, [pfId]);
    }
  }

  // pj_partners: seed se houver ao menos 1 PJ mas nenhum parceiro
  const { rows: pjr } = await pool.query('SELECT id FROM legal_persons LIMIT 1');
  if (pjr[0]) {
    const pjId = pjr[0].id;
    const { rows: pr } = await pool.query('SELECT count(*)::int n FROM pj_partners WHERE pj_id=$1', [pjId]);
    if (pr[0].n === 0) {
      await pool.query(`INSERT INTO pj_partners(pj_id,nome,cpf,participacao_pct) VALUES ($1,'Ana Beatriz Costa','111.222.333-44',60),($1,'Carlos Menezes Silva','555.666.777-88',40)`, [pjId]);
    }
  }

  // task_comments / task_attachments: seed se houver ao menos 1 task mas nenhum comment
  const { rows: tr } = await pool.query('SELECT id FROM tasks LIMIT 1');
  if (tr[0]) {
    const tId = tr[0].id;
    const { rows: cr } = await pool.query('SELECT count(*)::int n FROM task_comments WHERE task_id=$1', [tId]);
    if (cr[0].n === 0) {
      await pool.query(`INSERT INTO task_comments(task_id,author,content) VALUES ($1,'contador','Aguardando envio dos documentos do mês.'),($1,'cliente','Documentos enviados por e-mail hoje.')`, [tId]);
    }
    const { rows: atr } = await pool.query('SELECT count(*)::int n FROM task_attachments WHERE task_id=$1', [tId]);
    if (atr[0].n === 0) {
      await pool.query(`INSERT INTO task_attachments(task_id,version,filename,content_type,file_size) VALUES ($1,1,'extrato_jan_2026.pdf','application/pdf',204800),($1,1,'nota_fiscal_001.xml','application/xml',8192)`, [tId]);
    }
  }

  // gateway_audit_log: seed se vazio
  const { rows: gr } = await pool.query('SELECT count(*)::int n FROM gateway_audit_log');
  if (gr[0].n === 0) {
    await pool.query(`INSERT INTO gateway_audit_log(gateway,method,endpoint,response_status,duration_ms,attempts) VALUES ('sefaz','POST','/nfe/v4/NFeAutorizacao4',200,430,1),('rfb','GET','/cadastral/12345678000100',200,210,1),('esocial','POST','/eventos/S-1000',200,550,1)`);
  }
}
