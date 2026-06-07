import { query, pool } from './src/db/pool.js';

(async () => {
  const res = await query(
    "SELECT id, jwt_token, metadata FROM session_contexts WHERE id LIKE 'scx_real%' ORDER BY created_at DESC LIMIT 1"
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    console.log('SessionContext ID:', row.id);
    console.log('JWT Token:', row.jwt_token ? row.jwt_token.substring(0, 50) + '...' : 'NULL');
    console.log('Metadata:', row.metadata);
  } else {
    console.log('No session contexts found');
  }

  await pool.end();
})();
