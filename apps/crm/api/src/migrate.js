const path = require('path');
const fs = require('fs');

async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const filename of files) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename]
    );
    if (rowCount > 0) continue;

    const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`[migrate] applied: ${filename}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`[migrate] failed on ${filename}: ${err.message}`);
    } finally {
      client.release();
    }
  }

  console.log('[migrate] up to date');
}

module.exports = { migrate };
