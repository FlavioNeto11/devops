// routes/nf.js — Emissão, Rastreamento e Relatório de NF-e (REQ-CONTAVIVA360-0006 AC3-AC6).
// Toda HTTP externa à SEFAZ passa pelo gateways/sefaz-gateway.js — nunca diretamente aqui.
import { pool } from '../db.js';
import { getIdempotentResponse, rememberIdempotentResponse } from '../idempotency.js';
import { enqueueNfSubmit } from '../queue.js';

const STATUS_NF = ['rascunho', 'processando', 'emitida', 'cancelada', 'rejeitada'];

function calcImpostos(itens) {
  let icms = 0, iss = 0, pis = 0, cofins = 0;
  for (const it of itens) {
    const base = Number(it.valor_total);
    it.icms = Number(((base * Number(it.aliquota_icms || 0)) / 100).toFixed(2));
    it.iss = Number(((base * Number(it.aliquota_iss || 0)) / 100).toFixed(2));
    it.pis = Number(((base * Number(it.aliquota_pis || 0)) / 100).toFixed(2));
    it.cofins = Number(((base * Number(it.aliquota_cofins || 0)) / 100).toFixed(2));
    icms += it.icms;
    iss += it.iss;
    pis += it.pis;
    cofins += it.cofins;
  }
  return { icms: Number(icms.toFixed(2)), iss: Number(iss.toFixed(2)), pis: Number(pis.toFixed(2)), cofins: Number(cofins.toFixed(2)) };
}

export function registerNfRoutes(app) {
  // ── Listagem ───────────────────────────────────────────────────────────────

  app.get('/v1/nf', async (req) => {
    const q = req.query || {};
    let sql = 'SELECT id,tenant_id,nf_client_id,serie,numero_nf,status,chave_acesso,data_emissao,data_autorizacao_sefaz,total_nf,total_impostos,observacoes,destinatario_razao_social,destinatario_cnpj,created_at FROM notas_fiscais WHERE tenant_id=$1';
    const params = [req.tenantId];
    let idx = 2;
    if (q.status) { sql += ` AND status=$${idx++}`; params.push(q.status); }
    if (q.nf_client_id) { sql += ` AND nf_client_id=$${idx++}`; params.push(Number(q.nf_client_id)); }
    if (q.serie) { sql += ` AND serie=$${idx++}`; params.push(q.serie); }
    if (q.period_start) { sql += ` AND data_emissao >= $${idx++}`; params.push(q.period_start); }
    if (q.period_end) { sql += ` AND data_emissao <= $${idx++}`; params.push(q.period_end); }
    sql += ' ORDER BY id DESC LIMIT 500';
    const { rows } = await pool.query(sql, params);
    return { data: rows };
  });

  // ── Rastreamento (AC5) ─────────────────────────────────────────────────────
  // GET /v1/nf/:id retorna XML, PDF (base64), chave, status, data emissão, data autorização SEFAZ.

  app.get('/v1/nf/:id', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM notas_fiscais WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'nota fiscal não encontrada' } }; }
    const nf = rows[0];
    const itens = (await pool.query('SELECT * FROM nf_items WHERE nf_id=$1 ORDER BY id', [nf.id])).rows;
    return {
      id: nf.id,
      chave_acesso: nf.chave_acesso,
      status: nf.status,
      serie: nf.serie,
      numero_nf: nf.numero_nf,
      data_emissao: nf.data_emissao,
      data_autorizacao_sefaz: nf.data_autorizacao_sefaz,
      sefaz_protocolo: nf.sefaz_protocolo,
      sefaz_motivo: nf.sefaz_motivo,
      total_nf: nf.total_nf,
      total_impostos: nf.total_impostos,
      observacoes: nf.observacoes,
      emitente_razao_social: nf.emitente_razao_social,
      emitente_cnpj: nf.emitente_cnpj,
      destinatario_razao_social: nf.destinatario_razao_social,
      destinatario_cnpj: nf.destinatario_cnpj,
      xml: nf.xml_content,
      pdf_base64: nf.pdf_content,
      itens,
      created_at: nf.created_at,
      updated_at: nf.updated_at,
    };
  });

  // PDF download
  app.get('/v1/nf/:id/pdf', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT pdf_content,numero_nf,serie FROM notas_fiscais WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0] || !rows[0].pdf_content) { reply.code(404); return { error: { message: 'PDF não disponível' } }; }
    const buf = Buffer.from(rows[0].pdf_content, 'base64');
    reply.type('application/octet-stream')
      .header('Content-Disposition', `attachment; filename="NF-${rows[0].serie}-${rows[0].numero_nf}.pdf"`);
    return buf;
  });

  // ── Emissão (AC3 + AC4) ────────────────────────────────────────────────────

  app.post('/v1/nf', async (req, reply) => {
    const b = req.body || {};
    const key = req.headers['idempotency-key'];
    const cached = await getIdempotentResponse('emit_nf', key);
    if (cached) return cached;

    if (!b.nf_client_id) { reply.code(400); return { error: { message: 'nf_client_id é obrigatório' } }; }
    if (!Array.isArray(b.itens) || b.itens.length === 0) { reply.code(400); return { error: { message: 'itens é obrigatório (array não vazio)' } }; }

    // Valida cliente
    const { rows: clientRows } = await pool.query(
      'SELECT * FROM nf_clients WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(b.nf_client_id)]
    );
    if (!clientRows[0]) { reply.code(404); return { error: { message: 'cliente NF não encontrado' } }; }
    const cliente = clientRows[0];

    // Resolve emitente do ambiente (empresa do tenant)
    const emitente = {
      razao_social: process.env.EMITENTE_RAZAO_SOCIAL || 'CONTAVIVA 360 LTDA',
      cnpj: process.env.EMITENTE_CNPJ || '00000000000000',
    };

    // Resolve itens: busca produto se product_id informado, senão usa dados inline
    const itensResolvidos = [];
    for (const it of b.itens) {
      let item = { ...it };
      if (it.nf_product_id) {
        const { rows: prodRows } = await pool.query(
          'SELECT * FROM nf_products WHERE tenant_id=$1 AND id=$2',
          [req.tenantId, Number(it.nf_product_id)]
        );
        if (prodRows[0]) {
          const p = prodRows[0];
          item = {
            nf_product_id: p.id,
            codigo: it.codigo || p.codigo,
            descricao: it.descricao || p.descricao,
            valor_unitario: it.valor_unitario != null ? Number(it.valor_unitario) : Number(p.valor_unitario),
            aliquota_icms: it.aliquota_icms != null ? Number(it.aliquota_icms) : Number(p.aliquota_icms),
            aliquota_iss: it.aliquota_iss != null ? Number(it.aliquota_iss) : Number(p.aliquota_iss),
            aliquota_pis: it.aliquota_pis != null ? Number(it.aliquota_pis) : Number(p.aliquota_pis),
            aliquota_cofins: it.aliquota_cofins != null ? Number(it.aliquota_cofins) : Number(p.aliquota_cofins),
            cfop: it.cfop || p.cfop,
            ncm_nbs: it.ncm_nbs || p.ncm_nbs,
            quantidade: Number(it.quantidade || 1),
          };
        }
      }
      if (!item.descricao) { reply.code(400); return { error: { message: 'cada item precisa de descricao' } }; }
      if (item.valor_unitario == null) { reply.code(400); return { error: { message: 'cada item precisa de valor_unitario' } }; }
      const qty = Number(item.quantidade || 1);
      item.quantidade = qty;
      item.valor_total = Number((Number(item.valor_unitario) * qty).toFixed(2));
      itensResolvidos.push(item);
    }

    const totalNF = Number(itensResolvidos.reduce((s, it) => s + it.valor_total, 0).toFixed(2));
    const impostos = calcImpostos(itensResolvidos);
    const totalImpostos = Number((impostos.icms + impostos.iss + impostos.pis + impostos.cofins).toFixed(2));
    const serie = b.serie || '001';
    const dataEmissao = b.data_emissao || new Date().toISOString().slice(0, 10);

    // Insere NF em transação
    const client = await pool.connect();
    let nf;
    try {
      await client.query('BEGIN');
      const { rows: nfRows } = await client.query(
        `INSERT INTO notas_fiscais(tenant_id,nf_client_id,serie,data_emissao,status,total_nf,total_impostos,observacoes,
           emitente_razao_social,emitente_cnpj,destinatario_razao_social,destinatario_cnpj)
         VALUES ($1,$2,$3,$4,'processando',$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [req.tenantId, cliente.id, serie, dataEmissao, totalNF, totalImpostos,
         b.observacoes || null, emitente.razao_social, emitente.cnpj,
         cliente.razao_social, cliente.cnpj]
      );
      nf = nfRows[0];
      // Número da NF = id padded (por série/tenant em produção usaria sequência)
      const numeroNf = String(nf.id).padStart(9, '0');
      await client.query('UPDATE notas_fiscais SET numero_nf=$1 WHERE id=$2', [numeroNf, nf.id]);
      nf.numero_nf = numeroNf;
      for (const it of itensResolvidos) {
        await client.query(
          `INSERT INTO nf_items(nf_id,tenant_id,nf_product_id,codigo,descricao,quantidade,valor_unitario,valor_total,
             aliquota_icms,icms,aliquota_iss,iss,aliquota_pis,pis,aliquota_cofins,cofins,cfop,ncm_nbs)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [nf.id, req.tenantId, it.nf_product_id || null, it.codigo || null, it.descricao,
           it.quantidade, it.valor_unitario, it.valor_total,
           it.aliquota_icms || 0, it.icms || 0, it.aliquota_iss || 0, it.iss || 0,
           it.aliquota_pis || 0, it.pis || 0, it.aliquota_cofins || 0, it.cofins || 0,
           it.cfop || '5102', it.ncm_nbs || null]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    // Enfileira submissão à SEFAZ via fila transacional (worker-queue-transacional)
    await enqueueNfSubmit(nf.id, req.tenantId, { emitente, cliente, itensResolvidos, impostos, observacoes: b.observacoes || '' });

    const response = { id: nf.id, numero_nf: nf.numero_nf, serie, status: 'processando', total_nf: totalNF, total_impostos: totalImpostos };
    await rememberIdempotentResponse({ operation: 'emit_nf', idempotencyKey: key, entityType: 'nota_fiscal', entityId: nf.id, response });
    reply.code(202); return response;
  });

  // ── Cancelamento ───────────────────────────────────────────────────────────

  app.post('/v1/nf/:id/cancel', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM notas_fiscais WHERE tenant_id=$1 AND id=$2',
      [req.tenantId, Number(req.params.id)]
    );
    if (!rows[0]) { reply.code(404); return { error: { message: 'nota fiscal não encontrada' } }; }
    const nf = rows[0];
    if (!['emitida', 'processando'].includes(nf.status)) {
      reply.code(409); return { error: { message: `NF com status '${nf.status}' não pode ser cancelada` } };
    }
    const motivo = (req.body || {}).motivo || 'Cancelamento solicitado pelo emitente';
    await pool.query(
      `UPDATE notas_fiscais SET status='cancelada', sefaz_motivo=$1, updated_at=now() WHERE id=$2`,
      [motivo, nf.id]
    );
    return { id: nf.id, status: 'cancelada', motivo };
  });

  // ── Relatório (AC6) ────────────────────────────────────────────────────────

  app.get('/v1/nf/report', async (req, reply) => {
    const q = req.query || {};
    let sql = `SELECT n.*, c.razao_social AS cliente_razao_social
               FROM notas_fiscais n LEFT JOIN nf_clients c ON c.id=n.nf_client_id
               WHERE n.tenant_id=$1`;
    const params = [req.tenantId];
    let idx = 2;
    if (q.period_start) { sql += ` AND n.data_emissao >= $${idx++}`; params.push(q.period_start); }
    if (q.period_end)   { sql += ` AND n.data_emissao <= $${idx++}`; params.push(q.period_end); }
    if (q.nf_client_id) { sql += ` AND n.nf_client_id=$${idx++}`; params.push(Number(q.nf_client_id)); }
    if (q.serie)        { sql += ` AND n.serie=$${idx++}`; params.push(q.serie); }
    if (q.status)       { sql += ` AND n.status=$${idx++}`; params.push(q.status); }
    sql += ' ORDER BY n.data_emissao DESC, n.id DESC LIMIT 1000';

    const { rows } = await pool.query(sql, params);
    const totalEmitido = rows.filter(r => r.status === 'emitida').reduce((s, r) => s + Number(r.total_nf || 0), 0);
    const totalImpostos = rows.filter(r => r.status === 'emitida').reduce((s, r) => s + Number(r.total_impostos || 0), 0);

    const report = {
      gerado_em: new Date().toISOString(),
      filtros: { period_start: q.period_start, period_end: q.period_end, nf_client_id: q.nf_client_id, serie: q.serie, status: q.status },
      resumo: {
        total_nfs: rows.length,
        emitidas: rows.filter(r => r.status === 'emitida').length,
        canceladas: rows.filter(r => r.status === 'cancelada').length,
        processando: rows.filter(r => r.status === 'processando').length,
        total_emitido: Number(totalEmitido.toFixed(2)),
        total_impostos: Number(totalImpostos.toFixed(2)),
      },
      notas: rows.map(r => ({
        id: r.id, serie: r.serie, numero_nf: r.numero_nf, chave_acesso: r.chave_acesso,
        status: r.status, data_emissao: r.data_emissao, data_autorizacao_sefaz: r.data_autorizacao_sefaz,
        cliente: r.cliente_razao_social || r.destinatario_razao_social,
        total_nf: r.total_nf, total_impostos: r.total_impostos,
      })),
    };

    if (q.format === 'pdf') {
      reply.type('text/csv');
      const lines = ['ID,Serie,Numero,Chave,Status,DataEmissao,Cliente,TotalNF,TotalImpostos'];
      for (const r of report.notas) {
        lines.push(`${r.id},${r.serie},${r.numero_nf},"${r.chave_acesso || ''}",${r.status},${r.data_emissao},"${r.cliente || ''}",${r.total_nf},${r.total_impostos}`);
      }
      return lines.join('\n');
    }
    return report;
  });
}
