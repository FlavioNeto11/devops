const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const { rows } = q
      ? await pool.query(
          `SELECT c.*, co.name AS company_name
             FROM contacts c
             LEFT JOIN companies co ON co.id = c.company_id
            WHERE c.name ILIKE $1 OR c.email ILIKE $1
            ORDER BY c.name`,
          [`%${q}%`]
        )
      : await pool.query(
          `SELECT c.*, co.name AS company_name
             FROM contacts c
             LEFT JOIN companies co ON co.id = c.company_id
            ORDER BY c.name`
        );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, company_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name é obrigatório' });
    const { rows } = await pool.query(
      'INSERT INTO contacts (name, email, phone, company_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), email ? email.trim() || null : null, phone ? phone.trim() || null : null, company_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, co.name AS company_name
         FROM contacts c
         LEFT JOIN companies co ON co.id = c.company_id
        WHERE c.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'contato não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, phone, company_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name é obrigatório' });
    const { rows } = await pool.query(
      'UPDATE contacts SET name=$1, email=$2, phone=$3, company_id=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [name.trim(), email ? email.trim() || null : null, phone ? phone.trim() || null : null, company_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'contato não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    // FK em deals usa ON DELETE SET NULL — cascade automático sem bloqueio
    const { rows } = await pool.query('DELETE FROM contacts WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'contato não encontrado' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
