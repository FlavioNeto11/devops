const express = require('express');
const { pool } = require('../db');

const router = express.Router();

const VALID_STAGES = ['lead', 'qualified', 'proposal', 'won', 'lost'];

// GET /summary — contagem e soma por estágio + últimos 10 negócios (para o painel)
router.get('/summary', async (req, res, next) => {
  try {
    const { rows: byStage } = await pool.query(`
      SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
      FROM deals
      GROUP BY stage
    `);
    const { rows: recent } = await pool.query(`
      SELECT d.*, c.name AS contact_name, co.name AS company_name
      FROM deals d
      LEFT JOIN contacts c  ON c.id  = d.contact_id
      LEFT JOIN companies co ON co.id = d.company_id
      ORDER BY d.created_at DESC
      LIMIT 10
    `);
    res.json({ byStage, recent });
  } catch (err) {
    next(err);
  }
});

// GET / — lista negócios (opcional: ?stage=, ?q=)
router.get('/', async (req, res, next) => {
  try {
    const { stage, q } = req.query;
    if (stage && !VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: 'estágio inválido' });
    }
    let query = `
      SELECT d.*, c.name AS contact_name, co.name AS company_name
      FROM deals d
      LEFT JOIN contacts c  ON c.id  = d.contact_id
      LEFT JOIN companies co ON co.id = d.company_id
    `;
    const params = [];
    const conditions = [];
    if (stage) {
      params.push(stage);
      conditions.push(`d.stage = $${params.length}::deal_stage`);
    }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(d.title ILIKE $${params.length} OR c.name ILIKE $${params.length} OR co.name ILIKE $${params.length})`);
    }
    if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ' ORDER BY d.stage, d.id';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /:id — negócio individual
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, c.name AS contact_name, co.name AS company_name
       FROM deals d
       LEFT JOIN contacts c  ON c.id  = d.contact_id
       LEFT JOIN companies co ON co.id = d.company_id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'negócio não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST / — criar negócio
router.post('/', async (req, res, next) => {
  try {
    const { title, amount, stage, contact_id, company_id } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'título obrigatório' });
    if (stage !== undefined && !VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: 'estágio inválido' });
    }
    const { rows } = await pool.query(
      `INSERT INTO deals (title, amount, stage, contact_id, company_id)
       VALUES ($1, $2, $3::deal_stage, $4, $5)
       RETURNING *`,
      [
        title.trim(),
        amount != null ? Number(amount) : null,
        stage || 'lead',
        contact_id || null,
        company_id || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /:id — atualizar negócio (campos ausentes mantêm valor atual)
router.put('/:id', async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'negócio não encontrado' });
    const cur = existing[0];

    const { title, amount, stage, contact_id, company_id } = req.body;
    if (title !== undefined && !title.trim()) return res.status(400).json({ error: 'título não pode ser vazio' });
    if (stage !== undefined && !VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: 'estágio inválido' });
    }

    const { rows } = await pool.query(
      `UPDATE deals
       SET title = $1, amount = $2, stage = $3::deal_stage,
           contact_id = $4, company_id = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        title !== undefined ? title.trim() : cur.title,
        amount !== undefined ? (amount === null ? null : Number(amount)) : cur.amount,
        stage || cur.stage,
        contact_id !== undefined ? (contact_id || null) : cur.contact_id,
        company_id !== undefined ? (company_id || null) : cur.company_id,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /:id/stage — mover para novo estágio
router.patch('/:id/stage', async (req, res, next) => {
  try {
    const { stage } = req.body;
    if (!stage || !VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: 'estágio inválido' });
    }
    const { rows } = await pool.query(
      'UPDATE deals SET stage = $1::deal_stage, updated_at = NOW() WHERE id = $2 RETURNING *',
      [stage, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'negócio não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM deals WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'negócio não encontrado' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
