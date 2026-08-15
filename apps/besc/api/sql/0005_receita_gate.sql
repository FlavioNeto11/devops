-- Fase 4 — receita (first-transfer fee + aluguel) + contabilidade de dupla entrada +
-- gate regulatorio (docs/evolution/06, 10 + apendice B, D). Sem gateway: modela
-- obrigacoes/faturas/lancamentos; liquidacao e externa, conciliada pelo Gestor.

-- ---------- Tabela de tarifas (versionada; 1 active) ----------
CREATE TABLE fee_schedule (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version                  INT UNIQUE NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  first_transfer_fee_type  TEXT NOT NULL DEFAULT 'percent_of_face'
    CHECK (first_transfer_fee_type IN ('percent_of_face','fixed_per_operation')),
  first_transfer_fee_value NUMERIC(8,4) NOT NULL,     -- 0.5000 = 0,50%
  min_fee_per_operation    NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_fee_per_operation    NUMERIC(12,2),
  rounding_rule            TEXT NOT NULL DEFAULT 'half_up_2dp',
  effective_from           DATE,
  effective_to             DATE,
  notes                    TEXT,
  created_by               UUID REFERENCES users(id),
  approved_by              UUID REFERENCES users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fee_schedule_one_active ON fee_schedule (status) WHERE status = 'active';

-- ---------- Aluguel (lucro principal) ----------
CREATE TABLE lease (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_code               TEXT UNIQUE NOT NULL,
  contract_id              UUID NOT NULL REFERENCES token_contract(id),  -- contrato-lastro
  lessee_user_id           UUID NOT NULL REFERENCES users(id),
  base_amount_frozen       NUMERIC(18,2) NOT NULL CHECK (base_amount_frozen > 0),
  monthly_rate_pct         NUMERIC(8,4) NOT NULL CHECK (monthly_rate_pct >= 0),
  adjustment_index         TEXT NOT NULL DEFAULT 'ipca',   -- reusa enum monetary_index do dominio
  adjustment_period_months INT NOT NULL DEFAULT 12,
  period_start             DATE NOT NULL,
  period_end               DATE NOT NULL,
  billing_day              INT NOT NULL DEFAULT 5,
  auto_renew               BOOLEAN NOT NULL DEFAULT false,
  status                   TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','suspended','renewed','expired','terminated','written_off')),
  suspension_reason        TEXT,
  renewed_from_lease_id    UUID REFERENCES lease(id),
  terms_document_id        UUID REFERENCES terms_document(id),
  created_by               UUID REFERENCES users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);

-- competencia fechada (idempotente por competencia); snapshot pos-reajuste
CREATE TABLE lease_accrual (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id          UUID NOT NULL REFERENCES lease(id),
  competence_period CHAR(7) NOT NULL,                 -- 2026-07
  days_in_period    INT NOT NULL,
  days_billable     INT NOT NULL,
  base_applied      NUMERIC(18,2) NOT NULL,           -- base pos-reajuste (fatura auditavel sem recomputo)
  rate_applied_pct  NUMERIC(8,4) NOT NULL,
  amount            NUMERIC(18,2) NOT NULL,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lease_id, competence_period)
);

-- ---------- Fatura (ciclo manual, sem gateway) ----------
CREATE TABLE invoice (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_code          TEXT UNIQUE NOT NULL,
  counterparty_user_id  UUID REFERENCES users(id),
  invoice_type          TEXT NOT NULL CHECK (invoice_type IN ('first_transfer_fee','lease_rental','adjustment')),
  source_type           TEXT NOT NULL,
  source_id             TEXT NOT NULL,
  competence_period     CHAR(7),
  amount                NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency              CHAR(3) NOT NULL DEFAULT 'BRL',
  fee_schedule_snapshot JSONB,
  issue_date            DATE NOT NULL DEFAULT current_date,
  due_date              DATE,
  status                TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued','paid','cancelled','written_off')),
  paid_at               TIMESTAMPTZ,
  paid_marked_by        UUID REFERENCES users(id),
  payment_evidence_ref  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoice_status_idx ON invoice (status, issue_date);

-- ---------- Fee por contrato (only na 1a transferencia = saida da treasury) ----------
CREATE TABLE fee (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES token_contract(id),
  kind        TEXT NOT NULL CHECK (kind IN ('first_transfer','operational_adjustment')),
  amount      NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency    CHAR(3) NOT NULL DEFAULT 'BRL',
  basis       TEXT,
  invoice_id  UUID REFERENCES invoice(id),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','waived','cancelled')),
  charged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at  TIMESTAMPTZ
);
-- invariante I1/I7: no maximo 1 fee de primeira transferencia por contrato
CREATE UNIQUE INDEX fee_one_first_transfer ON fee (contract_id) WHERE kind = 'first_transfer';

-- ---------- Contabilidade de dupla entrada (append-only; correcao = estorno) ----------
CREATE TABLE ledger_entry (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq               BIGSERIAL UNIQUE,
  entry_date        DATE NOT NULL DEFAULT current_date,
  competence_period CHAR(7),
  debit_account     TEXT NOT NULL,
  credit_account    TEXT NOT NULL,
  amount            NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  source_type       TEXT NOT NULL,                    -- invoice|cost_entry|reversal
  source_id         TEXT,
  memo              TEXT,
  reversal_of_seq   BIGINT REFERENCES ledger_entry(seq),
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit_account IN ('accounts_receivable','cash_manual','revenue_first_transfer_fee','revenue_lease','expense_infra','expense_crypto_ops','expense_other','adjustments')),
  CHECK (credit_account IN ('accounts_receivable','cash_manual','revenue_first_transfer_fee','revenue_lease','expense_infra','expense_crypto_ops','expense_other','adjustments'))
);
-- imutabilidade (append-only; correcao so via reversal_of_seq -> nova linha)
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON ledger_entry
  FOR EACH ROW EXECUTE FUNCTION raise_immutable();

-- ---------- Custos lancados pelo Gestor ----------
CREATE TABLE cost_entry (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category          TEXT NOT NULL CHECK (category IN ('infra_hosting','crypto_ops','legal_regulatory','custody','other')),
  description       TEXT NOT NULL,
  amount            NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  competence_period CHAR(7) NOT NULL,
  evidence_ref      TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Gate regulatorio (docs/evolution/10) ----------
CREATE TABLE regulatory_gate_item (
  key                     TEXT PRIMARY KEY,           -- as 7 chaves do TOKENIZATION_TEMPLATE
  question_label          TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','satisfied','not_applicable','reopened')),
  opinion_document_ref    TEXT,
  professional_name       TEXT,
  professional_registration TEXT,
  notes                   TEXT,
  recorded_by             UUID REFERENCES users(id),
  recorded_at             TIMESTAMPTZ
);

-- atos append-only; go_live_enabled e DERIVADO do ultimo ato granted + todos os itens ok
CREATE TABLE regulatory_gate_approval (
  id            BIGSERIAL PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('granted','revoked')),
  item_snapshot JSONB NOT NULL,
  approved_by   UUID REFERENCES users(id),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER regulatory_gate_approval_immutable BEFORE UPDATE OR DELETE ON regulatory_gate_approval
  FOR EACH ROW EXECUTE FUNCTION raise_immutable();

-- parametro do fee inicial (placeholder a calibrar — ADR-006)
INSERT INTO fee_schedule (version, status, first_transfer_fee_type, first_transfer_fee_value, min_fee_per_operation, effective_from)
VALUES (1, 'active', 'percent_of_face', 0.5000, 25.00, current_date)
ON CONFLICT DO NOTHING;

-- os 7 itens requiresLegal do TOKENIZATION_TEMPLATE (api/src/domain.js:188-194) como
-- bloqueantes formais do go-live (docs/evolution/10)
INSERT INTO regulatory_gate_item (key, question_label) VALUES
  ('is_security',      'O token pode ser valor mobiliário? (CVM Parecer 40)'),
  ('offer_registration','Precisa de registro/dispensa de oferta? (Res. CVM 88)'),
  ('fidc_structure',   'Estrutura via FIDC / direito creditório? (Res. CVM 175)'),
  ('vasp_bcb',         'Enquadra no Marco Legal de Ativos Virtuais / BCB (VASP)?'),
  ('kyc_aml_pldft',    'Necessita PLD-FT / COAF?'),
  ('lgpd',             'Conformidade LGPD (dados pessoais / whitelist)?'),
  ('taxation',         'Aspectos tributários (ganho de capital) mapeados?')
ON CONFLICT (key) DO NOTHING;
