// routes/fiscal-obligations.js — Obrigações Fiscais e Alertas (REQ-CONTAVIVA360-0003).
import { pool } from '../db.js';
import { requireRole } from '../rbac.js';
import { enqueueObligationAlert } from '../queue.js';

const TIPOS = ['IRPF', 'IRPJ', 'ICMS', 'ISS', 'DARF', 'ECF', 'ECD', 'e-Social', 'CAGED', 'Simples DAS', 'PER', 'DIRF', 'RRA', 'outro'];
const STATUS = ['pendente', 'pago', 'cancelado', 'atrasado', 'aprovacao_pendente'];
const PERIODICIDADES = ['mensal', 'trimestral', 'anual'];

// AC5: obrigações geradas por regime tributário
const OBRIGACOES_POR_REGIME = {
  simples: [{ tipo: 'Simples DAS', periodicidade: 'mensal' }],
  lucro_presumido: [
    { tipo: 'IRPJ', periodicidade: 'mensal' },
    { tipo: 'CSLL', periodicidade: 'mensal' },
  ],
  lucro_real: [
    { tipo: 'IRPJ', periodicidade: 'trimestral' },
    { tipo: 'CSLL', periodicidade: 'trimestral' },
  ],
};

export function calcNivelAlerta(dataVencimento) {
  // Compara strings YYYY-MM-DD no timezone local para evitar drift de UTC
  const todayStr = new Date().toLocaleDateString('sv-SE');
  const vencStr = typeof dataVencimento === 'string'
    ? dataVencimento.slice(0, 10)
    : new Date(dataVencimento).toLocaleDateString('sv-SE');
  if (vencStr < todayStr) return 'critico';
  if (vencStr === todayStr) return 'vermelho';
  // Usa meio-dia para evitar edge cases de DST
  const diffDays = Math.round((new Date(vencStr + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000);
  if (diffDays <= 7) return 'laranja';
  if (diffDays <= 30) return 'amarelo';
  return null;
}

export function registerFiscalObligationRoutes(app) {
  // ---- CRUD ----

  app.get('/v1/fiscal-obligations', async (req) => {
    const { status, tipo, period_start, period_end } = req.query || {};
    let sql = 'SELECT * FROM fiscal_obligations WHERE tenant_id=$1';
    const params = [req.tenantId]; let idx = 2;
    if (status) { sql += ` AND status=$${idx++}`; params.push(status); }
    if (tipo)   { sql += ` AND tipo=$${idx++}`; params.push(tipo); }
    if (period_start) { sql += ` AND data_vencimento >= $${idx++}`; params.push(period_start); }
    if (period_end)   { sql += ` AND data_vencimento <= $${idx++}`; params.push(period_end); }
    sql += ' ORDER BY data_vencimento ASC LIMIT 200';
    const { rows } = await pool.query(sql, params);
    return { data: rows.map(r => ({ ...r, nivel_alerta: calcNivelAlerta(r.data_vencimento) })) };
  });

  app.post('/v1/fiscal-obligations', async (req, reply) => {
    const b = req.body || {};
    if (!b.tipo) { reply.code(400); return { error: { message: 'tipo é obrigatório' } }; }
    if (!b.data_vencimento) { reply.code(400); return { error: { message: 'data_vencimento é obrigatória' } }; }
    if (!b.entidade_tipo || !['PF', 'PJ'].includes(b.entidade_tipo)) {
      reply.code(400); return { error: { message: 'entidade_tipo deve ser PF ou PJ' } };
    }
    const { rows } = await pool.query(
      `INSERT INTO fiscal_obligations(tenant_id,tipo,data_vencimento,periodicidade,entidade_tipo,entidade_id,status,descricao,valor_estimado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.tenantId, b.tipo, b.data_vencimento, b.periodicidade || 'mensal',
       b.entidade_tipo, b.entidade_id || null, b.status || 'pendente', b.descricao || null, b.valor_estimado || null]
    );
    const ob = rows[0];
    const nivel = calcNivelAlerta(ob.data_vencimento);
    if (nivel) await enqueueObligationAlert(ob.id, nivel).catch(() => {});
    reply.code(201); return ob;
  });

  app.get('/v1/fiscal-obligations/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM fiscal_obligations WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    const alerts = await pool.query(
      'SELECT * FROM obligation_alerts WHERE tenant_id=$1 AND obligation_id=$2 ORDER BY created_at DESC',
      [req.tenantId, Number(req.params.id)]
    );
    return { ...rows[0], nivel_alerta: calcNivelAlerta(rows[0].data_vencimento), historico_alertas: alerts.rows };
  });

  app.put('/v1/fiscal-obligations/:id', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE fiscal_obligations SET
         tipo=COALESCE($1,tipo), data_vencimento=COALESCE($2,data_vencimento),
         periodicidade=COALESCE($3,periodicidade), status=COALESCE($4,status),
         descricao=COALESCE($5,descricao), valor_estimado=COALESCE($6,valor_estimado),
         entidade_tipo=COALESCE($7,entidade_tipo), entidade_id=COALESCE($8,entidade_id),
         updated_at=now()
       WHERE tenant_id=$9 AND id=$10 RETURNING *`,
      [b.tipo || null, b.data_vencimento || null, b.periodicidade || null, b.status || null,
       b.descricao || null, b.valor_estimado || null, b.entidade_tipo || null, b.entidade_id || null,
       req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  app.delete('/v1/fiscal-obligations/:id', async (req) => {
    await pool.query('DELETE FROM fiscal_obligations WHERE tenant_id=$1 AND id=$2', [req.tenantId, Number(req.params.id)]);
    return { deleted: true };
  });

  // AC3: contador (manager+) pode aprovar/concluir; cliente só vê
  app.patch('/v1/fiscal-obligations/:id/status', async (req, reply) => {
    const b = req.body || {};
    const { novo_status } = b;
    if (!novo_status || !STATUS.includes(novo_status)) {
      reply.code(400); return { error: { message: `status inválido: use ${STATUS.join('|')}` } };
    }
    if (['pago', 'cancelado', 'aprovacao_pendente'].includes(novo_status) && !['admin', 'manager'].includes(req.role)) {
      reply.code(403); return { error: { message: 'Permissão insuficiente para alterar este status' } };
    }
    const { rows } = await pool.query(
      `UPDATE fiscal_obligations SET status=$1, updated_at=now() WHERE tenant_id=$2 AND id=$3 RETURNING *`,
      [novo_status, req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  // AC2: scan e enfileira alertas (admin) — disparado por evento ou cron
  app.post('/v1/fiscal-obligations/scan-alerts', { preHandler: requireRole('admin') }, async (req) => {
    const { rows } = await pool.query(
      `SELECT * FROM fiscal_obligations WHERE tenant_id=$1 AND status IN ('pendente','aprovacao_pendente')
       AND data_vencimento <= (CURRENT_DATE + INTERVAL '30 days')`,
      [req.tenantId]
    );
    const enqueued = [];
    for (const ob of rows) {
      const nivel = calcNivelAlerta(ob.data_vencimento);
      if (nivel) {
        await enqueueObligationAlert(ob.id, nivel).catch(() => {});
        enqueued.push({ id: ob.id, tipo: ob.tipo, nivel });
      }
    }
    return { scanned: rows.length, enqueued };
  });

  // AC5: PJ → gera obrigações pelo regime tributário
  app.post('/v1/pj/:pjId/fiscal-obligations/generate', async (req, reply) => {
    const pjId = Number(req.params.pjId);
    const { rows: pjRows } = await pool.query(
      'SELECT * FROM legal_persons WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, pjId]
    );
    if (!pjRows[0]) { reply.code(404); return { error: { message: 'PJ não encontrada' } }; }
    const pj = pjRows[0];
    const regime = pj.regime_tributario || 'simples';
    const templates = OBRIGACOES_POR_REGIME[regime] || OBRIGACOES_POR_REGIME.simples;
    const b = req.body || {};
    const ano = b.ano || new Date().getFullYear();
    const mes = b.mes || (new Date().getMonth() + 1);
    const diaVenc = b.dia_vencimento || 20;
    const criadas = [];
    for (const tmpl of templates) {
      const dataVenc = `${ano}-${String(mes).padStart(2, '0')}-${String(diaVenc).padStart(2, '0')}`;
      const { rows } = await pool.query(
        `INSERT INTO fiscal_obligations(tenant_id,tipo,data_vencimento,periodicidade,entidade_tipo,entidade_id,status,descricao)
         VALUES ($1,$2,$3,$4,'PJ',$5,'pendente',$6) RETURNING *`,
        [req.tenantId, tmpl.tipo, dataVenc, tmpl.periodicidade, pjId,
         `Gerado para ${pj.razao_social} (${regime})`]
      );
      const ob = rows[0];
      const nivel = calcNivelAlerta(ob.data_vencimento);
      if (nivel) await enqueueObligationAlert(ob.id, nivel).catch(() => {});
      criadas.push(ob);
    }
    reply.code(201); return { regime, obrigacoes: criadas };
  });

  // ---- DASHBOARD (AC3) ----

  app.get('/v1/dashboard/obligations', async (req) => {
    const { status, tipo, period_start, period_end } = req.query || {};
    let sql = 'SELECT * FROM fiscal_obligations WHERE tenant_id=$1';
    const params = [req.tenantId]; let idx = 2;
    if (status) { sql += ` AND status=$${idx++}`; params.push(status); }
    if (tipo)   { sql += ` AND tipo=$${idx++}`; params.push(tipo); }
    if (period_start) { sql += ` AND data_vencimento >= $${idx++}`; params.push(period_start); }
    if (period_end)   { sql += ` AND data_vencimento <= $${idx++}`; params.push(period_end); }
    sql += ' ORDER BY data_vencimento ASC LIMIT 200';
    const { rows } = await pool.query(sql, params);
    const data = rows.map(r => ({ ...r, nivel_alerta: calcNivelAlerta(r.data_vencimento) }));
    const resumo = {
      total: data.length,
      pendentes: data.filter(r => r.status === 'pendente').length,
      pagos: data.filter(r => r.status === 'pago').length,
      atrasados: data.filter(r => r.status === 'atrasado' || r.nivel_alerta === 'critico').length,
      aprovacao_pendente: data.filter(r => r.status === 'aprovacao_pendente').length,
    };
    // AC3: contador/admin vê can_approve=true (botão "Aprovar")
    const can_approve = ['admin', 'manager'].includes(req.role);
    return { data, resumo, can_approve };
  });

  // AC4: relatório de compliance (export CSV/PDF client-side)
  app.get('/v1/dashboard/obligations/compliance', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT *, CURRENT_DATE - data_vencimento::date AS dias_vencido
       FROM fiscal_obligations WHERE tenant_id=$1 ORDER BY data_vencimento ASC`,
      [req.tenantId]
    );
    const em_dia = rows.filter(r => r.status === 'pago');
    const atrasadas = rows.filter(r => {
      if (r.status === 'atrasado') return true;
      return r.status === 'pendente' && calcNivelAlerta(r.data_vencimento) === 'critico';
    });
    const para_vencer = rows.filter(r => {
      if (r.status !== 'pendente') return false;
      const nivel = calcNivelAlerta(r.data_vencimento);
      return nivel === 'amarelo' || nivel === 'laranja' || nivel === 'vermelho';
    });
    const report = {
      gerado_em: new Date().toISOString(),
      tenant_id: req.tenantId,
      resumo: { total: rows.length, em_dia: em_dia.length, atrasadas: atrasadas.length, para_vencer: para_vencer.length },
      em_dia: em_dia.map(r => ({ id: r.id, tipo: r.tipo, data_vencimento: r.data_vencimento, status: r.status })),
      atrasadas: atrasadas.map(r => ({ id: r.id, tipo: r.tipo, data_vencimento: r.data_vencimento, dias_vencido: Number(r.dias_vencido) || 0 })),
      para_vencer: para_vencer.map(r => ({ id: r.id, tipo: r.tipo, data_vencimento: r.data_vencimento, nivel: calcNivelAlerta(r.data_vencimento) })),
    };
    if ((req.query || {}).format === 'pdf') {
      reply.type('text/csv');
      const lines = ['ID,Tipo,Vencimento,Status,Situacao'];
      for (const r of rows) {
        const sit = calcNivelAlerta(r.data_vencimento) === 'critico' ? 'atrasada' : r.status === 'pago' ? 'em_dia' : 'para_vencer';
        lines.push(`${r.id},"${r.tipo}",${r.data_vencimento},${r.status},${sit}`);
      }
      return lines.join('\n');
    }
    return report;
  });
}
