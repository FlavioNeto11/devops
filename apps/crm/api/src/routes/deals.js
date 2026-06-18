const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM deals ORDER BY id');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
