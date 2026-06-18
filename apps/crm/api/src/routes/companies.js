const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const { rows } = q
      ? await pool.query(
          'SELECT * FROM companies WHERE name ILIKE $1 OR segment ILIKE $1 ORDER BY name',
          [`%${q}%`]
        )
      : await pool.query('SELECT * FROM companies ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, segment, website } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name é obrigatório' });
    const { rows } = await pool.query(
      'INSERT INTO companies (name, segment, website) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), segment ? segment.trim() || null : null, website ? website.trim() || null : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM companies WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'empresa não encontrada' });
    const { rows: contacts } = await pool.query(
      'SELECT id, name, email, phone FROM contacts WHERE company_id=$1 ORDER BY name',
      [req.params.id]
    );
    res.json({ ...rows[0], contacts });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, segment, website } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name é obrigatório' });
    const { rows } = await pool.query(
      'UPDATE companies SET name=$1, segment=$2, website=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
      [name.trim(), segment ? segment.trim() || null : null, website ? website.trim() || null : null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'empresa não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    // FK em contacts e deals usa ON DELETE SET NULL — cascade automático sem bloqueio
    const { rows } = await pool.query('DELETE FROM companies WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'empresa não encontrada' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
