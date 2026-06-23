// server.js — API (camadas: rotas finas). Servida em /helpflow/api (stripPrefix). Gerado pela Forge.
import express from 'express';
import { pool, migrate, seed } from './db.js';
import { M, startMetricsServer } from './metrics.js';
import * as jobsRepo from './repositories/jobs-repo.js';
import { repos } from './repositories/domain-repos.js';
import * as integrationAudit from './repositories/integration-audit-repo.js';
import { ping as gatewayPing } from './gateways/gateway.js';
const app = express(); app.use(express.json());
app.use((req, _res, next) => { req.tenantId = Number(req.header('X-Tenant-Id')) || 1; next(); });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { M.httpErrors.inc(); res.status(e.status || 500).json({ error: { message: e.message || 'erro' } }); });
app.get('/', (_q, res) => res.json({ app: 'helpflow', service: 'api', ok: true }));
app.get('/health', wrap(async (_q, res) => { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'connected' }); }));
// identidade da borda SSO (oauth2-proxy injeta X-Auth-Request-*): a casca usa /me p/ mostrar o usuário.
app.get('/me', (req, res) => res.json({ email: req.header('X-Auth-Request-Email') || null, name: req.header('X-Auth-Request-Preferred-Username') || req.header('X-Auth-Request-User') || null, role: req.header('X-Auth-Request-Groups') || null }));
app.get('/v1/health/jobs', wrap(async (_q, res) => res.json({ status: 'ok', jobs: await jobsRepo.counts() })));
// ---- fila transacional: monitor (lista), detalhe e reenfileiramento da DLQ ----
// Consumido por JobsMonitorView (lista + profundidade) e JobDetailView (detalhe + requeue).
// requeue é a operação canônica de recuperação (DLQ → fila): POST .../requeue (idempotente).
app.get('/v1/jobs', wrap(async (req, res) => res.json(await jobsRepo.list(req.query || {}))));
app.get('/v1/jobs/:id', wrap(async (req, res) => { const row = await jobsRepo.get(req.params.id); if (!row) return res.status(404).json({ error: { message: 'não encontrado' } }); res.json(row); }));
app.post('/v1/jobs/:id/requeue', wrap(async (req, res) => { const row = await jobsRepo.requeue(req.params.id); if (!row) return res.status(404).json({ error: { message: 'não encontrado' } }); M.recordsTotal.inc({ outcome: 'requeued' }); res.json(row); }));
app.get('/v1/records', wrap(async (req, res) => res.json({ data: (await pool.query('SELECT * FROM records WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [req.tenantId])).rows })));
app.get('/v1/records/:id', wrap(async (req, res) => { const r = (await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)])).rows[0]; if (!r) return res.status(404).json({ error: { message: 'não encontrado' } }); res.json(r); }));
app.post('/v1/records', wrap(async (req, res) => { if (!req.body || !req.body.title) { return res.status(400).json({ error: { message: 'title obrigatório' } }); } const r = (await pool.query('INSERT INTO records(tenant_id,title) VALUES ($1,$2) RETURNING *', [req.tenantId, req.body.title])).rows[0]; M.recordsTotal.inc({ outcome: 'created' }); res.status(201).json(r); }));
app.post('/v1/records/:id/submit', wrap(async (req, res) => { const id = Number(req.params.id); const r = (await pool.query('SELECT id FROM records WHERE id=$1', [id])).rows[0]; if (!r) return res.status(404).json({ error: { message: 'não encontrado' } }); await pool.query(`UPDATE records SET status='submitting', updated_at=now() WHERE id=$1`, [id]); const jid = await jobsRepo.enqueue('record.submit', { recordId: id }, 'submit:' + id); res.status(202).json({ id, status: 'submitting', enqueued: jid != null }); }));
// ---- CRUD de domínio (rotas finas → repositories/domain-repos.js) ----
// Handlers genéricos: validam o mínimo (required) e delegam ao repo. As rotas
// abaixo são registradas com paths literais (um por entidade) para que o
// validador anti-drift de OpenAPI as detecte e exija documentação no contrato.
const crudList = (key) => wrap(async (req, res) => {
  const { repo } = repos[key];
  // `q` é busca textual (ILIKE) restrita à allowlist `searchable` de cada repo;
  // entidades sem allowlist o ignoram. Sustenta o autocomplete de solicitante e a
  // sugestão de artigos do TicketCreateView, que chamam list({ q, pageSize }).
  const { page, pageSize, sort, dir, q } = req.query;
  const r = await repo.list(req.tenantId, { page, pageSize, sort, dir, q });
  res.json({ data: r.data, total: r.total, page: r.page, pageSize: r.pageSize });
});
const crudGet = (key) => wrap(async (req, res) => {
  const row = await repos[key].repo.get(req.tenantId, req.params.id);
  if (!row) return res.status(404).json({ error: { message: 'não encontrado' } });
  res.json(row);
});
const crudCreate = (key) => wrap(async (req, res) => {
  const { repo, required } = repos[key];
  const body = req.body || {};
  const missing = required.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) return res.status(400).json({ error: { message: 'campos obrigatórios: ' + missing.join(', ') } });
  const row = await repo.create(req.tenantId, body);
  res.status(201).json(row);
});
const crudUpdate = (key) => wrap(async (req, res) => {
  const row = await repos[key].repo.update(req.tenantId, req.params.id, req.body || {});
  if (!row) return res.status(404).json({ error: { message: 'não encontrado' } });
  res.json(row);
});
const crudDelete = (key) => wrap(async (req, res) => {
  const okDel = await repos[key].repo.remove(req.tenantId, req.params.id);
  if (!okDel) return res.status(404).json({ error: { message: 'não encontrado' } });
  res.status(204).end();
});

app.get('/v1/customers', crudList('customers'));
app.get('/v1/customers/:id', crudGet('customers'));
app.post('/v1/customers', crudCreate('customers'));
app.put('/v1/customers/:id', crudUpdate('customers'));
app.delete('/v1/customers/:id', crudDelete('customers'));

app.get('/v1/agents', crudList('agents'));
app.get('/v1/agents/:id', crudGet('agents'));
app.post('/v1/agents', crudCreate('agents'));
app.put('/v1/agents/:id', crudUpdate('agents'));
app.delete('/v1/agents/:id', crudDelete('agents'));

app.get('/v1/teams', crudList('teams'));
app.get('/v1/teams/:id', crudGet('teams'));
app.post('/v1/teams', crudCreate('teams'));
app.put('/v1/teams/:id', crudUpdate('teams'));
app.delete('/v1/teams/:id', crudDelete('teams'));

app.get('/v1/comments', crudList('comments'));
app.get('/v1/comments/:id', crudGet('comments'));
app.post('/v1/comments', crudCreate('comments'));
app.put('/v1/comments/:id', crudUpdate('comments'));
app.delete('/v1/comments/:id', crudDelete('comments'));

app.get('/v1/sla-policies', crudList('sla-policies'));
app.get('/v1/sla-policies/:id', crudGet('sla-policies'));
app.post('/v1/sla-policies', crudCreate('sla-policies'));
app.put('/v1/sla-policies/:id', crudUpdate('sla-policies'));
app.delete('/v1/sla-policies/:id', crudDelete('sla-policies'));

app.get('/v1/kb-articles', crudList('kb-articles'));
app.get('/v1/kb-articles/:id', crudGet('kb-articles'));
app.post('/v1/kb-articles', crudCreate('kb-articles'));
app.put('/v1/kb-articles/:id', crudUpdate('kb-articles'));
app.delete('/v1/kb-articles/:id', crudDelete('kb-articles'));

app.get('/v1/integrations', crudList('integrations'));
app.get('/v1/integrations/:id', crudGet('integrations'));
app.post('/v1/integrations', crudCreate('integrations'));
app.put('/v1/integrations/:id', crudUpdate('integrations'));
app.delete('/v1/integrations/:id', crudDelete('integrations'));

// ---- Ações de domínio da integração (gateway-externo) ----
//  · POST /v1/integrations/:id/test  → ping via gateway (resposta REDIGIDA server-side),
//    atualiza last_check_at e registra a chamada na trilha de auditoria.
//  · GET  /v1/integrations/:id/audit → trilha redigida { items: [{ id, method, path,
//    status_code, latency_ms, ok, redacted, response, created_at }], total }.
// O ping NUNCA sai do navegador: passa exclusivamente pelo gateway (única porta de
// saída) e a redação de segredos é autoritativa no gateway/repo, nunca no cliente.
app.post('/v1/integrations/:id/test', wrap(async (req, res) => {
  const integ = await repos.integrations.repo.get(req.tenantId, req.params.id);
  if (!integ) return res.status(404).json({ error: { message: 'não encontrado' } });
  const result = await gatewayPing(integ);
  await repos.integrations.repo.update(req.tenantId, integ.id, { last_check_at: new Date().toISOString() });
  await integrationAudit.record(req.tenantId, integ.id, result);
  res.json(result);
}));
app.get('/v1/integrations/:id/audit', wrap(async (req, res) => {
  const integ = await repos.integrations.repo.get(req.tenantId, req.params.id);
  if (!integ) return res.status(404).json({ error: { message: 'não encontrado' } });
  const { items, total } = await integrationAudit.list(req.tenantId, integ.id, { pageSize: req.query.pageSize });
  res.json({ items, total });
}));

// ---- tickets — entidade central. O prazo de SLA (sla_due_at) é SEMPRE derivado
// server-side da política aplicada (sla_policies.resolution_mins / business_hours_only),
// nunca do cliente. Assim o prazo persistido é a fonte da verdade que a tela relê. ----
const SLA_FALLBACK_MINS = { urgent: 240, high: 480, medium: 1440, low: 4320 }; // só quando não há política

// Calcula o vencimento de resolução a partir de `from` somando minutos.
// business_hours_only encurta a jornada para 8h/dia úteis (seg–sex, 09–17h);
// fins de semana e horas fora da janela não contam.
function addSlaMinutes(from, mins, businessHoursOnly) {
  const start = new Date(from.getTime());
  if (!businessHoursOnly) { start.setMinutes(start.getMinutes() + mins); return start; }
  const DAY_START = 9, DAY_END = 17;
  // Avança o cursor até o início da próxima janela comercial válida (dia útil,
  // dentro do horário). Repete até estar de fato dentro de uma janela.
  const advanceToWindow = (cursor) => {
    let guard = 0;
    while (guard++ < 4000) {
      const day = cursor.getDay();
      if (day === 0) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(DAY_START, 0, 0, 0); continue; }
      if (day === 6) { cursor.setDate(cursor.getDate() + 2); cursor.setHours(DAY_START, 0, 0, 0); continue; }
      if (cursor.getHours() < DAY_START) { cursor.setHours(DAY_START, 0, 0, 0); continue; }
      if (cursor.getHours() >= DAY_END) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(DAY_START, 0, 0, 0); continue; }
      return cursor; // já dentro de uma janela útil
    }
    return cursor;
  };
  let cursor = new Date(start.getTime());
  let remaining = mins;
  let guard = 0;
  while (remaining > 0 && guard++ < 4000) {
    cursor = advanceToWindow(cursor);
    const endOfDay = new Date(cursor.getTime()); endOfDay.setHours(DAY_END, 0, 0, 0);
    const availMins = Math.round((endOfDay.getTime() - cursor.getTime()) / 60000);
    if (remaining <= availMins) { cursor.setMinutes(cursor.getMinutes() + remaining); remaining = 0; }
    else { remaining -= availMins; cursor = new Date(endOfDay.getTime()); } // consome o dia; re-clamp no topo
  }
  return cursor;
}

// Resolve o prazo definitivo a partir do corpo (prioridade + política referenciada).
async function recomputeSlaDue(tenantId, body) {
  const priority = body.priority || 'medium';
  let mins = SLA_FALLBACK_MINS[priority] || SLA_FALLBACK_MINS.medium;
  let businessHoursOnly = false;
  const policyId = body.sla_policy_id;
  if (policyId !== undefined && policyId !== null && policyId !== '') {
    const pol = await repos['sla-policies'].repo.get(tenantId, policyId);
    if (pol) { mins = Number(pol.resolution_mins) || mins; businessHoursOnly = !!pol.business_hours_only; }
  }
  return addSlaMinutes(new Date(), mins, businessHoursOnly).toISOString();
}

// sla_due_at vem do servidor: removemos qualquer valor enviado pelo cliente.
function sanitizeTicketBody(body) {
  const clean = { ...(body || {}) };
  delete clean.sla_due_at;
  return clean;
}

app.get('/v1/tickets', crudList('tickets'));
app.get('/v1/tickets/:id', crudGet('tickets'));
app.post('/v1/tickets', wrap(async (req, res) => {
  const { repo, required } = repos.tickets;
  const body = sanitizeTicketBody(req.body);
  const missing = required.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) return res.status(400).json({ error: { message: 'campos obrigatórios: ' + missing.join(', ') } });
  body.sla_due_at = await recomputeSlaDue(req.tenantId, body);
  const row = await repo.create(req.tenantId, body);
  res.status(201).json(row);
}));
app.put('/v1/tickets/:id', wrap(async (req, res) => {
  const current = await repos.tickets.repo.get(req.tenantId, req.params.id);
  if (!current) return res.status(404).json({ error: { message: 'não encontrado' } });
  const body = sanitizeTicketBody(req.body);
  // recalcula o prazo quando prioridade OU política mudarem; senão preserva o atual
  const priorityChanged = body.priority !== undefined && body.priority !== current.priority;
  const policyChanged = body.sla_policy_id !== undefined && Number(body.sla_policy_id) !== (current.sla_policy_id == null ? null : Number(current.sla_policy_id));
  if (priorityChanged || policyChanged) {
    body.sla_due_at = await recomputeSlaDue(req.tenantId, {
      priority: body.priority !== undefined ? body.priority : current.priority,
      sla_policy_id: body.sla_policy_id !== undefined ? body.sla_policy_id : current.sla_policy_id,
    });
  }
  const row = await repos.tickets.repo.update(req.tenantId, req.params.id, body);
  if (!row) return res.status(404).json({ error: { message: 'não encontrado' } });
  res.json(row);
}));
app.delete('/v1/tickets/:id', crudDelete('tickets'));

// ---- Configurações do tenant (/v1/settings/*) ----
// GET  /v1/settings/tenant         → perfil do tenant (nome, domínio); is_default=true se nunca customizado
// PUT  /v1/settings/tenant         → atualiza nome e domínio do tenant (upsert por tenant_id)
// GET  /v1/settings/preferences    → preferências operacionais (fuso, idioma, notificações, page_size)
// PUT  /v1/settings/preferences    → salva preferências (upsert por tenant_id)
// GET  /v1/settings/roles          → papéis e capacidades do RBAC (dados estáticos + estrutura canônica)
app.get('/v1/settings/tenant', wrap(async (req, res) => {
  const r = (await pool.query('SELECT * FROM tenant_settings WHERE tenant_id=$1', [req.tenantId])).rows[0];
  if (!r) return res.json({ tenant_id: req.tenantId, name: 'Tenant #' + req.tenantId, domain: null, is_default: true });
  res.json(r);
}));
app.put('/v1/settings/tenant', wrap(async (req, res) => {
  const { name, domain } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: { message: 'name é obrigatório', fields: { name: 'Nome do workspace é obrigatório' } } });
  const r = (await pool.query(
    `INSERT INTO tenant_settings(tenant_id,name,domain,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(tenant_id) DO UPDATE SET name=$2,domain=$3,updated_at=now() RETURNING *`,
    [req.tenantId, String(name).trim(), domain ? String(domain).trim() : null]
  )).rows[0];
  res.json(r);
}));
app.get('/v1/settings/preferences', wrap(async (req, res) => {
  const r = (await pool.query('SELECT * FROM tenant_preferences WHERE tenant_id=$1', [req.tenantId])).rows[0];
  if (!r) return res.json({ tenant_id: req.tenantId, timezone: 'America/Sao_Paulo', language: 'pt-BR', notify_new_tickets: true, notify_sla: true, page_size: 25, is_default: true });
  res.json(r);
}));
app.put('/v1/settings/preferences', wrap(async (req, res) => {
  const { timezone, language, notify_new_tickets, notify_sla, page_size } = req.body || {};
  const ps = Number(page_size);
  if (!Number.isFinite(ps) || ps < 5 || ps > 100) return res.status(400).json({ error: { message: 'page_size deve ser entre 5 e 100', fields: { page_size: 'Valor entre 5 e 100' } } });
  const r = (await pool.query(
    `INSERT INTO tenant_preferences(tenant_id,timezone,language,notify_new_tickets,notify_sla,page_size,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(tenant_id) DO UPDATE SET timezone=$2,language=$3,notify_new_tickets=$4,notify_sla=$5,page_size=$6,updated_at=now() RETURNING *`,
    [req.tenantId, timezone || 'America/Sao_Paulo', language || 'pt-BR', notify_new_tickets !== false, notify_sla !== false, ps]
  )).rows[0];
  res.json(r);
}));
app.get('/v1/settings/roles', wrap(async (_q, res) => {
  res.json({
    roles: [
      { value: 'admin', label: 'Admin', description: 'Acesso total ao workspace' },
      { value: 'supervisor', label: 'Supervisor', description: 'Gestão de times, SLA e base de conhecimento' },
      { value: 'agent', label: 'Agente', description: 'Atendimento, atribuição e comentários' },
      { value: 'viewer', label: 'Leitor', description: 'Somente leitura dos chamados' },
    ],
    capabilities: [
      { key: 'view', label: 'Ver chamados', description: 'Acessar a fila e o histórico de atendimentos.', roles: ['admin', 'supervisor', 'agent', 'viewer'] },
      { key: 'comment', label: 'Comentar e responder', description: 'Interagir com clientes e notas internas.', roles: ['admin', 'supervisor', 'agent'] },
      { key: 'assign', label: 'Atribuir e priorizar', description: 'Encaminhar chamados e ajustar prioridade.', roles: ['admin', 'supervisor', 'agent'] },
      { key: 'team', label: 'Gerir times e SLA', description: 'Configurar times, políticas de SLA e escalonamento.', roles: ['admin', 'supervisor'] },
      { key: 'kb', label: 'Publicar base de conhecimento', description: 'Criar e revisar artigos da base.', roles: ['admin', 'supervisor'] },
      { key: 'admin', label: 'Administrar workspace', description: 'Agentes, integrações e configurações do tenant.', roles: ['admin'] },
    ],
  });
}));

async function depth() { try { const c = await jobsRepo.counts(); for (const s of ['queued','running','done','dlq']) M.queueDepth.set({ status: s }, c[s] || 0); } catch {} }
const PORT = Number(process.env.PORT) || 8080;
(async () => {
  if ((process.env.AUTO_MIGRATE || 'true') === 'true') await migrate();
  if ((process.env.AUTO_SEED || 'true') === 'true') await seed();
  startMetricsServer();
  setInterval(depth, 5000); depth();
  app.listen(PORT, () => console.log('[helpflow-api] :' + PORT));
})().catch((e) => { console.error('boot falhou', e); process.exit(1); });