async function seed(pool) {
  await pool.query(`
    INSERT INTO companies (id, name, segment, website) VALUES
      (1, 'Acme Corp',    'Tecnologia', 'https://acme.example.com'),
      (2, 'Globex Ltda',  'Industria',  'https://globex.example.com')
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(
    `SELECT setval('companies_id_seq', GREATEST((SELECT MAX(id) FROM companies), 1))`
  );

  await pool.query(`
    INSERT INTO contacts (id, name, email, phone, company_id) VALUES
      (1, 'Alice Silva', 'alice@acme.example.com',   '+55 11 91234-5678', 1),
      (2, 'Bob Santos',  'bob@globex.example.com',   '+55 21 98765-4321', 2),
      (3, 'Carol Lima',  'carol@acme.example.com',   NULL,                1)
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(
    `SELECT setval('contacts_id_seq', GREATEST((SELECT MAX(id) FROM contacts), 1))`
  );

  await pool.query(`
    INSERT INTO deals (id, title, amount, stage, contact_id, company_id) VALUES
      (1, 'Proposta Software ERP', 15000.00, 'proposal',  1, 1),
      (2, 'Licenca Anual Plus',     5000.00, 'qualified', 2, 2)
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(
    `SELECT setval('deals_id_seq', GREATEST((SELECT MAX(id) FROM deals), 1))`
  );

  console.log('[seed] done');
}

module.exports = { seed };
