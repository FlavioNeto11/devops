DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_stage') THEN
    CREATE TYPE deal_stage AS ENUM ('lead', 'qualified', 'proposal', 'won', 'lost');
  END IF;
END
$$;

CREATE TABLE deals (
  id         SERIAL PRIMARY KEY,
  title      VARCHAR(255) NOT NULL,
  amount     NUMERIC(15,2),
  stage      deal_stage NOT NULL DEFAULT 'lead',
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
