CREATE TABLE companies (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  segment    VARCHAR(100),
  website    VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
