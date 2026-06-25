// routes/role-dashboards.js — Dashboards por role (REQ-CONTAVIVA360-0008).
import { pool } from '../db.js';
import { subscribe, unsubscribe } from '../events.js';

function num(v) { return Number(v || 0); }

async function fiscalStatusByEntity(tenantId) {
  const { rows } = await pool.query(
    `SELECT entidade_tipo, entidade_id,
       CASE
         WHEN COUNT(*) FILTER (WHERE status = 'atrasado' OR (status = 'pendente' AND data_vencimento < CURRENT_DATE)) > 0 THEN 'atrasado'
         WHEN COUNT(*) FILTER (WHERE status = 'pendente') > 0 THEN 'pendente'
         ELSE 'em_dia'
       END AS status_fiscal
     FROM fiscal_obligations WHERE tenant_id = $1
     GROUP BY entidade_tipo, entidade_id`,
    [tenantId]
  );
  const map = {};
  for (const r of rows) map[r.entidade_tipo + '_' + r.entidade_id] = r.status_fiscal;
  return map;
}

export function registerRoleDashboardRoutes(app) {
  // AC1: Dashboard Cliente PF
  app.get('/v1/dashboard/role/pf', async (req) => {
    const tid = req.tenantId;
    const yr12ago = new Date(); yr12ago.setFullYear(yr12ago.getFullYear() - 1);
    const yr12agoStr = yr12ago.toISOString().slice(0, 10);

    const [{ rows: pfs }, ieResult, docsResult, tasksResult, alertasResult, irResult] = await Promise.all([
      pool.query('SELECT id, nome, cpf, patrimonio_inicial FROM physical_persons WHERE tenant_id=$1 ORDER BY nome', [tid]),
      pool.query(
        `SELECT tipo, DATE_TRUNC('month', data) AS mes, SUM(valor) AS total
         FROM income_expenses WHERE tenant_id=$1 AND entity_type='pf' AND data >= $2
         GROUP BY tipo, mes ORDER BY mes`,
        [tid, yr12agoStr]
      ),
      pool.query(
        `SELECT id, tipo, mes, ano, status, entity_type, entity_id, created_at
         FROM documents WHERE tenant_id=$1 AND status='pendente' AND entity_type='pf'
         ORDER BY created_at DESC LIMIT 50`,
        [tid]
      ),
      pool.query(
        `SELECT id, title, priority, due_at, status, assignee
         FROM tasks WHERE tenant_id=$1 AND status NOT IN ('concluida','cancelada')
         ORDER BY due_at ASC NULLS LAST LIMIT 20`,
        [tid]
      ),
      pool.query(
        `SELECT id, tipo, data_vencimento, status, valor_estimado, entidade_tipo
         FROM fiscal_obligations
         WHERE tenant_id=$1 AND status NOT IN ('pago','cancelado')
           AND (data_vencimento <= CURRENT_DATE + 30 OR data_vencimento < CURRENT_DATE)
         ORDER BY data_vencimento ASC LIMIT 20`,
        [tid]
      ),
      pool.query(
        `SELECT id, tipo, status, data_vencimento, valor_estimado
         FROM fiscal_obligations WHERE tenant_id=$1 AND tipo='IRPF'
         ORDER BY data_vencimento DESC LIMIT 1`,
        [tid]
      ),
    ]);

    // Patrimônio: query separada por PF
    let patrimonioTotal = 0, saldoInvestimentos = 0;
    await Promise.all(pfs.map(async (pf) => {
      const [a, l] = await Promise.all([
        pool.query('SELECT tipo, COALESCE(SUM(valor),0) AS total FROM pf_assets WHERE tenant_id=$1 AND pf_id=$2 GROUP BY tipo', [tid, pf.id]),
        pool.query('SELECT COALESCE(SUM(valor),0) AS total FROM pf_liabilities WHERE tenant_id=$1 AND pf_id=$2', [tid, pf.id]),
      ]);
      patrimonioTotal += num(pf.patrimonio_inicial) + a.rows.reduce((s, r) => s + num(r.total), 0) - num(l.rows[0]?.total);
      const inv = a.rows.find(r => r.tipo === 'investimento');
      if (inv) saldoInvestimentos += num(inv.total);
    }));

    // Receitas/despesas por mês
    const recByMes = {}, despByMes = {};
    let receitasTotal = 0, despesasTotal = 0;
    for (const r of ieResult.rows) {
      const k = new Date(r.mes).toISOString().slice(0, 7);
      if (r.tipo === 'receita') { recByMes[k] = (recByMes[k] || 0) + num(r.total); receitasTotal += num(r.total); }
      else { despByMes[k] = (despByMes[k] || 0) + num(r.total); despesasTotal += num(r.total); }
    }
    const meses = [...new Set([...Object.keys(recByMes), ...Object.keys(despByMes)])].sort();
    const por_mes = meses.map(m => ({ mes: m, receitas: recByMes[m] || 0, despesas: despByMes[m] || 0 }));

    const ir = irResult.rows[0];
    return {
      patrimonio: { total: patrimonioTotal, saldo_investimentos: saldoInvestimentos },
      receitas_despesas: { receitas: receitasTotal, despesas: despesasTotal, por_mes },
      imposto_renda: {
        status: ir?.status || 'nao_encontrado',
        data_vencimento: ir?.data_vencimento || null,
        valor_estimado: num(ir?.valor_estimado),
        progresso: !ir ? 0 : ir.status === 'pago' ? 100 : 30,
      },
      documentos_pendentes: docsResult.rows,
      tarefas_abertas: tasksResult.rows,
      alertas_vencimento: alertasResult.rows,
      pf_count: pfs.length,
    };
  });

  // AC2: Dashboard Cliente PJ
  app.get('/v1/dashboard/role/pj', async (req) => {
    const tid = req.tenantId;
    const today = new Date().toISOString().slice(0, 10);
    const in90d = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

    const [
      { rows: pjs }, ieResult, fluxoResult,
      apResult, arResult, impostosResult,
      nfMesResult, folhaResult, obrigVencidas, obrigProximas, tasksResult,
    ] = await Promise.all([
      pool.query('SELECT id, razao_social, cnpj, regime_tributario FROM legal_persons WHERE tenant_id=$1 ORDER BY razao_social', [tid]),
      pool.query(
        `SELECT tipo, COALESCE(SUM(valor),0) AS total FROM income_expenses WHERE tenant_id=$1 AND entity_type='pj' GROUP BY tipo`,
        [tid]
      ),
      pool.query(
        `SELECT DATE_TRUNC('week', data) AS semana,
                COALESCE(SUM(CASE WHEN tipo='receita' THEN valor ELSE 0 END),0) AS entradas,
                COALESCE(SUM(CASE WHEN tipo='despesa' THEN valor ELSE 0 END),0) AS saidas
         FROM income_expenses WHERE tenant_id=$1 AND entity_type='pj' AND data BETWEEN $2 AND $3
         GROUP BY semana ORDER BY semana`,
        [tid, today, in90d]
      ),
      pool.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(valor),0) AS total
         FROM income_expenses WHERE tenant_id=$1 AND tipo='despesa' AND status='pendente'`,
        [tid]
      ),
      pool.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(valor),0) AS total
         FROM income_expenses WHERE tenant_id=$1 AND tipo='receita' AND status='pendente'`,
        [tid]
      ),
      pool.query(
        `SELECT COALESCE(SUM(valor_estimado),0) AS estimado,
                COALESCE(SUM(CASE WHEN status='pago' THEN valor_estimado ELSE 0 END),0) AS realizado
         FROM fiscal_obligations WHERE tenant_id=$1 AND entidade_tipo='PJ'`,
        [tid]
      ),
      pool.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total_nf),0) AS total
         FROM notas_fiscais WHERE tenant_id=$1 AND status='autorizada'
           AND DATE_TRUNC('month', data_emissao) = DATE_TRUNC('month', CURRENT_DATE)`,
        [tid]
      ),
      pool.query(
        `SELECT COALESCE(SUM(valor),0) AS total FROM income_expenses
         WHERE tenant_id=$1 AND categoria='folha' AND DATE_TRUNC('month', data) = DATE_TRUNC('month', CURRENT_DATE)`,
        [tid]
      ),
      pool.query(
        `SELECT id, tipo, data_vencimento, status, valor_estimado, entidade_tipo, entidade_id
         FROM fiscal_obligations WHERE tenant_id=$1 AND status NOT IN ('pago','cancelado') AND data_vencimento < CURRENT_DATE
         ORDER BY data_vencimento ASC LIMIT 10`,
        [tid]
      ),
      pool.query(
        `SELECT id, tipo, data_vencimento, status, valor_estimado, entidade_tipo, entidade_id
         FROM fiscal_obligations WHERE tenant_id=$1 AND status NOT IN ('pago','cancelado')
           AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
         ORDER BY data_vencimento ASC LIMIT 10`,
        [tid]
      ),
      pool.query(
        `SELECT id, title, priority, due_at, status, assignee_role
         FROM tasks WHERE tenant_id=$1 AND assignee_role IN ('manager','admin')
           AND status NOT IN ('concluida','cancelada')
         ORDER BY due_at ASC NULLS LAST LIMIT 10`,
        [tid]
      ),
    ]);

    const receitas = num(ieResult.rows.find(r => r.tipo === 'receita')?.total);
    const despesas = num(ieResult.rows.find(r => r.tipo === 'despesa')?.total);

    return {
      pj_count: pjs.length,
      receitas_despesas: { receitas, despesas, saldo: receitas - despesas },
      fluxo_caixa_90d: fluxoResult.rows.map(r => ({
        semana: new Date(r.semana).toISOString().slice(0, 10),
        entradas: num(r.entradas), saidas: num(r.saidas), saldo: num(r.entradas) - num(r.saidas),
      })),
      contas_pagar: { count: num(apResult.rows[0]?.count), total: num(apResult.rows[0]?.total) },
      contas_receber: { count: num(arResult.rows[0]?.count), total: num(arResult.rows[0]?.total) },
      impostos: { estimado: num(impostosResult.rows[0]?.estimado), realizado: num(impostosResult.rows[0]?.realizado) },
      notas_fiscais_mes: { count: num(nfMesResult.rows[0]?.count), total: num(nfMesResult.rows[0]?.total) },
      folha_pagamento: { total: num(folhaResult.rows[0]?.total) },
      obrigacoes_vencidas: obrigVencidas.rows,
      obrigacoes_proximas: obrigProximas.rows,
      tarefas_para_contador: tasksResult.rows,
    };
  });

  // AC3: Dashboard Contador
  app.get('/v1/dashboard/role/contador', async (req) => {
    const tid = req.tenantId;

    const [{ rows: pfs }, { rows: pjs }, statusMap, tarefasResult, docsResult, atrasadasResult, alertasResult] = await Promise.all([
      pool.query('SELECT id, nome, cpf FROM physical_persons WHERE tenant_id=$1 ORDER BY nome', [tid]),
      pool.query('SELECT id, razao_social, cnpj FROM legal_persons WHERE tenant_id=$1 ORDER BY razao_social', [tid]),
      fiscalStatusByEntity(tid),
      pool.query(
        `SELECT id, title, priority, due_at, status, assignee, entity_type, entity_id
         FROM tasks WHERE tenant_id=$1 AND assignee_role='manager' AND status NOT IN ('concluida','cancelada')
         ORDER BY due_at ASC NULLS LAST LIMIT 50`,
        [tid]
      ),
      pool.query(
        `SELECT id, tipo, mes, ano, status, entity_type, entity_id
         FROM documents WHERE tenant_id=$1 AND status='pendente'
         ORDER BY entity_type, entity_id LIMIT 100`,
        [tid]
      ),
      pool.query(
        `SELECT id, tipo, data_vencimento, status, valor_estimado, entidade_tipo, entidade_id
         FROM fiscal_obligations WHERE tenant_id=$1 AND status NOT IN ('pago','cancelado') AND data_vencimento < CURRENT_DATE
         ORDER BY data_vencimento ASC LIMIT 50`,
        [tid]
      ),
      pool.query(
        `SELECT id, tipo, data_vencimento, status, valor_estimado, entidade_tipo
         FROM fiscal_obligations WHERE tenant_id=$1 AND status = 'atrasado'
           AND tipo IN ('IRPF','IRPJ','ECF','ECD','e-Social')
         ORDER BY data_vencimento ASC LIMIT 20`,
        [tid]
      ),
    ]);

    const clientes = [
      ...pfs.map(pf => ({ id: pf.id, nome: pf.nome, cpf: pf.cpf, tipo: 'PF', status_fiscal: statusMap['PF_' + pf.id] || 'em_dia' })),
      ...pjs.map(pj => ({ id: pj.id, nome: pj.razao_social, cnpj: pj.cnpj, tipo: 'PJ', status_fiscal: statusMap['PJ_' + pj.id] || 'em_dia' })),
    ];

    const docsPorCliente = {};
    for (const d of docsResult.rows) {
      const k = d.entity_type + '_' + d.entity_id;
      if (!docsPorCliente[k]) docsPorCliente[k] = { entity_type: d.entity_type, entity_id: d.entity_id, docs: [] };
      docsPorCliente[k].docs.push(d);
    }

    return {
      clientes,
      tarefas_atribuidas: tarefasResult.rows,
      documentos_por_cliente: Object.values(docsPorCliente),
      obrigacoes_atrasadas: atrasadasResult.rows,
      alertas_criticos: alertasResult.rows,
    };
  });

  // AC4: Dashboard Admin
  app.get('/v1/dashboard/role/admin', async (req) => {
    const tid = req.tenantId;

    const [pfCount, pjCount, ieResult, jobsResult, dlqResult, alertasResult, usersResult] = await Promise.all([
      pool.query('SELECT COUNT(*) AS n FROM physical_persons WHERE tenant_id=$1', [tid]),
      pool.query('SELECT COUNT(*) AS n FROM legal_persons WHERE tenant_id=$1', [tid]),
      pool.query(`SELECT tipo, COALESCE(SUM(valor),0) AS total FROM income_expenses WHERE tenant_id=$1 GROUP BY tipo`, [tid]),
      pool.query(`SELECT id, type, status, error_message, created_at FROM jobs WHERE status NOT IN ('queued','running','done') ORDER BY created_at DESC LIMIT 20`),
      pool.query(`SELECT id, type, error_message, moved_at FROM job_dead_letter_queue ORDER BY moved_at DESC LIMIT 10`),
      pool.query(
        `SELECT id, tipo, data_vencimento, status, entidade_tipo
         FROM fiscal_obligations WHERE tenant_id=$1 AND status='atrasado'
         ORDER BY data_vencimento ASC LIMIT 20`,
        [tid]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT u) AS n FROM (
           SELECT created_by AS u FROM tasks WHERE tenant_id=$1
           UNION
           SELECT assignee AS u FROM tasks WHERE tenant_id=$1 AND assignee IS NOT NULL
         ) sub`,
        [tid]
      ),
    ]);

    let dbStatus = 'ok';
    try { await pool.query('SELECT 1'); } catch { dbStatus = 'error'; }

    return {
      total_usuarios: num(usersResult.rows[0]?.n),
      total_clientes_pf: num(pfCount.rows[0]?.n),
      total_clientes_pj: num(pjCount.rows[0]?.n),
      total_receitas: num(ieResult.rows.find(r => r.tipo === 'receita')?.total),
      total_despesas: num(ieResult.rows.find(r => r.tipo === 'despesa')?.total),
      alertas_sistema: alertasResult.rows,
      jobs_falhando: [...jobsResult.rows, ...dlqResult.rows],
      saude_componentes: { db: dbStatus, queue: 'ok' },
    };
  });

  // AC5: marcar obrigação como concluída (widget interativo)
  app.patch('/v1/fiscal-obligations/:id/concluir', async (req, reply) => {
    const { rows } = await pool.query(
      `UPDATE fiscal_obligations SET status='pago', updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'não encontrado' } }; }
    return rows[0];
  });

  // AC6: SSE endpoint para real-time updates
  app.get('/v1/events/dashboard', async (req, reply) => {
    const tid = req.tenantId;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(':connected\n\n');

    const send = (event) => { try { reply.raw.write('data: ' + JSON.stringify(event) + '\n\n'); } catch {} };
    subscribe(tid, send);

    const ping = setInterval(() => { try { reply.raw.write(':ping\n\n'); } catch { clearInterval(ping); } }, 25000);
    req.raw.on('close', () => { clearInterval(ping); unsubscribe(tid, send); });

    return reply;
  });
}
