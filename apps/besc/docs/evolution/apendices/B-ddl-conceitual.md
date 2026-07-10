---
title: "Apêndice B — DDL conceitual (normativo) de todas as tabelas novas"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# Apêndice B — DDL conceitual (normativo)

> DDL **conceitual e normativo** de TODAS as tabelas novas do Postgres `besc-postgres`. Conceitual:
> é proposta, não migration pronta (índices de performance, `OWNER`/grants finais e detalhes de
> trigger ficam para a implementação). Normativo: **nomes de tabela/coluna, tipos, constraints e
> invariantes aqui descritos são o contrato** — os docs [02](../02-modelo-de-dados.md),
> [03](../03-elasticidade-tokenizacao.md), [04](../04-maquina-estado-juridico.md),
> [05](../05-camada-ledger-blockchain.md), [06](../06-modelo-receita.md) e
> [07](../07-trilha-auditoria.md) referenciam este apêndice.

## Convenções gerais

- **PKs**: `UUID` (geradas na aplicação), exceto onde a **ordem total** é semântica
  (`audit_event.id`, `ledger_entry.seq`, `token_movement.id`, `ledger_outbox.id`,
  `sim_ledger_tx.id`, `audit_anchor.id` — `BIGSERIAL`).
- **Enums**: `TEXT + CHECK` (não `CREATE TYPE`) — evolução por migration simples; os valores são
  contrato de API.
- **Dinheiro**: `NUMERIC(18,2)` + `currency CHAR(3) DEFAULT 'BRL'`; taxas em `NUMERIC` dedicado;
  quantidades em `BIGINT`; **sem float** ([02 §5](../02-modelo-de-dados.md)).
- **Append-only**: tabelas marcadas `-- APPEND-ONLY` recebem `REVOKE UPDATE, DELETE, TRUNCATE` +
  trigger `BEFORE UPDATE OR DELETE` que lança exceção (padrão da trilha,
  [07-trilha-auditoria](../07-trilha-auditoria.md)). Correção = registro compensatório, nunca edição.
- **Estados jurídicos (7, canônicos — [ADR-008](../adr/ADR-008-maquina-estado-juridico.md))**:
  `unjudged · ruled_favorable · ruled_against · under_appeal · reinstated · defeated · archived`.
- Extensão exigida: `citext` (e-mails case-insensitive).
- Toda mutação destas tabelas emite `audit_event` **na mesma transação** (§iv).

---

## (i) Identidade / RBAC

Racional e enforcement em [01-rbac-permissoes](../01-rbac-permissoes.md).

```sql
-- Conta de usuário do marketplace (SSO Keycloak realm 'besc' e/ou local de bootstrap).
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  email         CITEXT UNIQUE NOT NULL,
  name          TEXT,
  keycloak_sub  TEXT UNIQUE,                 -- NULL p/ conta local pura
  password_hash TEXT,                        -- NULL p/ conta só-SSO
  is_active     BOOLEAN NOT NULL DEFAULT true,
  kyc_status    TEXT NOT NULL DEFAULT 'none'
    CHECK (kyc_status IN ('none','pending','approved','rejected')),  -- gate de capacidade futuro
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ
);

-- Papel (linha, não código): criar/recombinar papéis não exige deploy.
CREATE TABLE roles (
  id          UUID PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,          -- 'public','investor','lawyer','judge','manager','admin',...
  label       TEXT NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false, -- seeds: não deletáveis, key imutável
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catálogo de permissões, espelhado do código no boot (upsert) — fonte p/ a UI de administração.
CREATE TABLE permissions (
  key          TEXT PRIMARY KEY,             -- '<resource>:<action>', ex.: 'titles:read'
  label        TEXT NOT NULL,
  category     TEXT NOT NULL,                -- agrupamento p/ UI
  is_sensitive BOOLEAN NOT NULL DEFAULT false -- rbac:*, params:*, legal_status:* etc.
);

-- Concessão permissão→papel com escopo como coluna (não embutido na chave).
CREATE TABLE role_permissions (
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key),
  scope          TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('own','linked','all')),
  PRIMARY KEY (role_id, permission_key)
);

-- Atribuição papel→usuário; multi-papel cobre composição (não há herança entre papéis).
CREATE TABLE user_roles (
  user_id    UUID NOT NULL REFERENCES users(id),
  role_id    UUID NOT NULL REFERENCES roles(id),
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- Sessão própria do besc-api (oidc-kit); guarda apenas o hash do refresh token.
CREATE TABLE user_sessions (
  id                 UUID PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES users(id),
  refresh_token_hash TEXT NOT NULL,          -- sha256; NUNCA o token
  user_agent         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ
);

-- Convite de uso único p/ papéis qualificados (lawyer/judge/manager) — nunca auto-registro.
CREATE TABLE invitations (
  id               UUID PRIMARY KEY,
  email            CITEXT NOT NULL,
  role_id          UUID NOT NULL REFERENCES roles(id),
  token_hash       TEXT UNIQUE NOT NULL,     -- sha256 do token de convite
  invited_by       UUID NOT NULL REFERENCES users(id),
  expires_at       TIMESTAMPTZ NOT NULL,
  accepted_at      TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES users(id)
);

-- Singleton de invalidação do cache de permissões (bump na mesma tx de toda mutação de RBAC).
CREATE TABLE rbac_meta (
  id      INT PRIMARY KEY CHECK (id = 1),
  version BIGINT NOT NULL
);

-- Vínculo p/ o escopo 'linked': advogado/juiz enxergam SÓ os títulos concedidos pelo Gestor.
CREATE TABLE title_access_grants (
  id         UUID PRIMARY KEY,
  title_id   UUID NOT NULL REFERENCES security_title(id),
  user_id    UUID NOT NULL REFERENCES users(id),
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  purpose    TEXT                            -- 'audit', 'litigation', ...
);
```

---

## (ii) Marketplace — títulos, emissão, contratos, aluguel

Elasticidade em [03](../03-elasticidade-tokenizacao.md); máquina jurídica em
[04](../04-maquina-estado-juridico.md).

```sql
-- O ativo do marketplace; origina-se de um case elegível do store JSON (referência SOFT — ADR-002).
CREATE TABLE security_title (
  id             UUID PRIMARY KEY,
  case_id        TEXT UNIQUE NOT NULL,       -- id do case no store JSON; 1 case → máx. 1 título
  label          TEXT NOT NULL,              -- nome de exibição no catálogo
  share_class    TEXT NOT NULL CHECK (share_class IN ('ON','PNA','PNB','unknown')), -- enum atual (api/src/domain.js:26-31)
  share_quantity BIGINT NOT NULL CHECK (share_quantity > 0),
  legal_status   TEXT NOT NULL DEFAULT 'unjudged'
    CHECK (legal_status IN ('unjudged','ruled_favorable','ruled_against',
                            'under_appeal','reinstated','defeated','archived')),
    -- denormalização do último legal_status_history; consistência na MESMA transação
  listing_status TEXT NOT NULL DEFAULT 'draft' CHECK (listing_status IN ('draft','listed','delisted')),
  eligibility_snapshot JSONB NOT NULL,       -- case.status + risk + docPct no momento do cadastro
  eligibility_override BOOLEAN NOT NULL DEFAULT false, -- ready_with_caveats aceito pelo Gestor
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ
);
-- Disponibilidade é DERIVADA (nunca coluna):
--   available = legal_status IN ('unjudged','ruled_favorable','reinstated') AND listing_status = 'listed'

-- APPEND-ONLY. Verdade da máquina de estado jurídico (7 estados); só o Gestor transiciona.
CREATE TABLE legal_status_history (
  id            UUID PRIMARY KEY,
  title_id      UUID NOT NULL REFERENCES security_title(id),
  from_status   TEXT NOT NULL,
  to_status     TEXT NOT NULL,
  reason        TEXT NOT NULL,               -- obrigatório
  evidence_ref  JSONB,                       -- {caseId, docKey, attId} | nº processo/decisão
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','court_integration')),
  actor_user_id UUID NOT NULL REFERENCES users(id),
  occurred_at   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_status IN ('unjudged','ruled_favorable','ruled_against',
                         'under_appeal','reinstated','defeated','archived')),
  CHECK (to_status   IN ('unjudged','ruled_favorable','ruled_against',
                         'under_appeal','reinstated','defeated','archived'))
);

-- APPEND-ONLY. Série temporal do valor de mercado da ação (manual/perícia; feed futuro).
CREATE TABLE market_valuation (
  id              UUID PRIMARY KEY,
  title_id        UUID NOT NULL REFERENCES security_title(id),
  value_per_share NUMERIC(18,2) NOT NULL CHECK (value_per_share > 0),
  currency        CHAR(3) NOT NULL DEFAULT 'BRL',
  valuation_date  DATE NOT NULL,
  source          TEXT NOT NULL,             -- 'manual' | 'pericia' | 'market_feed' (futuro)
  evidence_ref    JSONB,                     -- {caseId, docKey, attId} | URL do laudo
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Parâmetro de tokenização versionado: fator ação→token + valor unitário de contratação.
CREATE TABLE tokenization_parameter (
  id                    UUID PRIMARY KEY,
  title_id              UUID NOT NULL REFERENCES security_title(id),
  version               INT NOT NULL,
  tokens_per_share      INT NOT NULL CHECK (tokens_per_share > 0), -- IMUTÁVEL pós-1ª emissão do título
  unit_face_value       NUMERIC(18,2) NOT NULL CHECK (unit_face_value > 0),
  currency              CHAR(3) NOT NULL DEFAULT 'BRL',
  based_on_valuation_id UUID REFERENCES market_valuation(id),      -- rastreabilidade do preço
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','superseded')),
  effective_from        TIMESTAMPTZ,         -- setado na ativação
  effective_to          TIMESTAMPTZ,         -- setado quando superseded; janelas nunca se sobrepõem
  created_by            UUID REFERENCES users(id),
  approved_by           UUID REFERENCES users(id), -- dupla aprovação (opcional na fase 1)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (title_id, version)
);
CREATE UNIQUE INDEX tokenization_parameter_one_active
  ON tokenization_parameter (title_id) WHERE status = 'active';   -- máx. 1 versão ativa por título

-- Dossiê público do título: projeção ALLOWLIST publicada pelo Gestor (nunca PII — ADR-003).
CREATE TABLE title_listing (
  id             UUID PRIMARY KEY,
  title_id       UUID UNIQUE NOT NULL REFERENCES security_title(id),
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','unpublished')),
  public_payload JSONB NOT NULL,             -- somente campos da allowlist da ADR-003
  published_at   TIMESTAMPTZ,
  published_by   UUID REFERENCES users(id),
  updated_at     TIMESTAMPTZ
);

-- Termos de uso/contratação versionados; o aceite vira audit_event + FK no contrato/lease.
CREATE TABLE terms_document (
  id           UUID PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('purchase_terms','lease_terms','substitution_terms')),
  version      INT NOT NULL,
  title        TEXT NOT NULL,
  content_hash TEXT NOT NULL,                -- SHA-256 do documento (binário no PVC)
  file_ref     TEXT,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  published_at TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id),
  UNIQUE (kind, version)
);
CREATE UNIQUE INDEX terms_document_one_active ON terms_document (kind) WHERE status = 'active';

-- Parâmetros operacionais da plataforma: key/value tipado, versionado, auditado.
-- Ex.: 'resolution_window_days' (default 30 — DECISÃO — revisar, ADR-008), 'anchor_policy'.
CREATE TABLE system_parameters (
  id             UUID PRIMARY KEY,
  key            TEXT NOT NULL,
  version        INT NOT NULL,
  value          JSONB NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  effective_from TIMESTAMPTZ NOT NULL,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);
CREATE UNIQUE INDEX system_parameters_one_active ON system_parameters (key) WHERE status = 'active';

-- Uma emissão (lote) de tokens de um título, sob a versão vigente do parâmetro.
CREATE TABLE token_batch (
  id                          UUID PRIMARY KEY,
  title_id                    UUID NOT NULL REFERENCES security_title(id),
  parameter_id                UUID NOT NULL REFERENCES tokenization_parameter(id),
  quantity                    BIGINT NOT NULL CHECK (quantity > 0),
  unit_face_value_at_issuance NUMERIC(18,2) NOT NULL, -- snapshot do parâmetro (metadado da emissão)
  chain_network               TEXT,          -- 'sim' | 'hyperledger-besu' | ...
  chain_contract_address      TEXT,
  chain_tx_hash               TEXT,
  status                      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','minted','failed','burned')),
  issued_at                   TIMESTAMPTZ,
  created_by                  UUID REFERENCES users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Invariante de supply (verificado em transação com lock no título):
--   Σ quantity (status NOT IN ('burned','failed')) por título ≤ share_quantity × tokens_per_share

-- Carteira custodial/treasury/externa; user_id nulo SÓ para a treasury do emissor.
CREATE TABLE wallets (
  id            UUID PRIMARY KEY,
  user_id       UUID REFERENCES users(id),
  kind          TEXT NOT NULL DEFAULT 'custodial' CHECK (kind IN ('custodial','external','treasury')),
  chain_address TEXT,
  label         TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind = 'treasury' OR user_id IS NOT NULL)
);

-- Posição fungível por lote (sem linha-por-token); PROJEÇÃO materializada de token_movement.
CREATE TABLE wallet_position (
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  batch_id  UUID NOT NULL REFERENCES token_batch(id),
  quantity  BIGINT NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (wallet_id, batch_id)
);

-- APPEND-ONLY. Ledger de movimentos de token (o que a auditoria exporta); isenções de fee EXPLÍCITAS.
CREATE TABLE token_movement (
  id                   BIGSERIAL PRIMARY KEY,          -- ordem total
  batch_id             UUID NOT NULL REFERENCES token_batch(id),
  from_wallet_id       UUID REFERENCES wallets(id),    -- NULL = mint
  to_wallet_id         UUID REFERENCES wallets(id),    -- NULL = burn
  quantity             BIGINT NOT NULL CHECK (quantity > 0),
  reason               TEXT NOT NULL CHECK (reason IN
    ('mint','transfer_primary','transfer_secondary','substitution_out','substitution_in',
     'burn','adjustment_reversal')),
  contract_id          UUID REFERENCES token_contract(id),
  fee_exemption_reason TEXT CHECK (fee_exemption_reason IN
    ('secondary_transfer','substitution_event','manual_waiver')),
    -- obrigatório (regra de serviço) em transferências sem fee; NULL só em movimentos que faturam
    -- ou não faturáveis (mint/burn)
  ledger_tx_hash       TEXT,                 -- ref da execução no ledger (sim/besu)
  actor_user_id        UUID REFERENCES users(id),
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_wallet_id IS NOT NULL OR to_wallet_id IS NOT NULL)
);

-- Contrato com valor TRAVADO na contratação — o coração da elasticidade (doc 03).
-- IMUTÁVEL exceto status/closed_at/substitution_id (trigger rejeita UPDATE nas demais colunas).
CREATE TABLE token_contract (
  id                     UUID PRIMARY KEY,
  contract_number        TEXT UNIQUE NOT NULL,      -- humano-legível sequencial
  holder_user_id         UUID NOT NULL REFERENCES users(id),
  wallet_id              UUID NOT NULL REFERENCES wallets(id),
  title_id               UUID NOT NULL REFERENCES security_title(id),
  batch_id               UUID NOT NULL REFERENCES token_batch(id),
  parameter_id           UUID NOT NULL REFERENCES tokenization_parameter(id), -- versão VIGENTE na contratação
  quantity               BIGINT NOT NULL CHECK (quantity > 0),
  unit_face_value_frozen NUMERIC(18,2) NOT NULL CHECK (unit_face_value_frozen > 0), -- SNAPSHOT, nunca recalculado
  total_face_value       NUMERIC(18,2) NOT NULL,
  currency               CHAR(3) NOT NULL DEFAULT 'BRL',
  purpose                TEXT NOT NULL CHECK (purpose IN ('purchase','collateral','lease_backing')),
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN
    ('active','suspended','substituted','written_off','settled','terminated')),
  terms_document_id      UUID REFERENCES terms_document(id),  -- termos aceitos na contratação
  contracted_at          TIMESTAMPTZ NOT NULL,
  closed_at              TIMESTAMPTZ,
  substitution_id        UUID REFERENCES contract_substitution(id), -- quando status='substituted'
  created_by             UUID NOT NULL REFERENCES users(id),
  CHECK (total_face_value = quantity * unit_face_value_frozen)
);
-- FK circular token_contract ↔ contract_substitution: na migration real, um dos lados entra
-- via ALTER TABLE posterior (ou DEFERRABLE). Aqui, conceitual.

-- Troca por título disponível preservando o MONTANTE travado (fluxo 'defeated', doc 04).
CREATE TABLE contract_substitution (
  id                   UUID PRIMARY KEY,
  old_contract_id      UUID UNIQUE NOT NULL REFERENCES token_contract(id),
  new_contract_id      UUID UNIQUE NOT NULL REFERENCES token_contract(id),
  reason               TEXT NOT NULL DEFAULT 'title_defeated',
  preserved_face_value NUMERIC(18,2) NOT NULL CHECK (preserved_face_value > 0),
  residual_value       NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (residual_value >= 0),
    -- sobra não-realocável (crédito do usuário) quando a divisão não fecha
  decided_by_user      BOOLEAN NOT NULL,     -- usuário escolheu (vs. default write-off)
  executed_at          TIMESTAMPTZ,
  executed_by          UUID REFERENCES users(id),
  CHECK (old_contract_id <> new_contract_id)
);

-- Caso de resolução aberto quando o título 'cai': prazo + escolha substituição × write-off.
CREATE TABLE contract_resolution_case (
  id              UUID PRIMARY KEY,
  contract_id     UUID UNIQUE NOT NULL REFERENCES token_contract(id),
  opened_at       TIMESTAMPTZ NOT NULL,
  deadline_at     TIMESTAMPTZ NOT NULL,      -- opened_at + system_parameters['resolution_window_days']
  chosen_option   TEXT CHECK (chosen_option IN ('substitution','write_off')), -- NULL = pendente
  substitution_id UUID REFERENCES contract_substitution(id),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','defaulted')),
    -- 'defaulted' = prazo expirou sem escolha → aplica o default parametrizado (write-off — ADR-008)
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id)
);

-- Aluguel/locação de tokens — a receita principal (ADR-006). Definição ÚNICA harmonizada:
-- contrato-lastro + quantidade (modelo de dados) + base congelada/taxa/índice/billing (faturamento).
CREATE TABLE lease (
  id                       UUID PRIMARY KEY,
  lease_code               TEXT UNIQUE NOT NULL,       -- humano-legível (ex.: 'LSE-2026-0003')
  contract_id              UUID NOT NULL REFERENCES token_contract(id), -- contrato-lastro do aluguel
  lessee_user_id           UUID NOT NULL REFERENCES users(id),
  quantity                 BIGINT NOT NULL CHECK (quantity > 0),
  base_amount_frozen       NUMERIC(18,2) NOT NULL CHECK (base_amount_frozen > 0),
    -- base de cálculo CONGELADA na assinatura (valor de face de referência na data do contrato)
  currency                 CHAR(3) NOT NULL DEFAULT 'BRL',
  monthly_rate_pct         NUMERIC(8,4) NOT NULL CHECK (monthly_rate_pct > 0), -- % a.m. sobre a base congelada
  adjustment_index         TEXT NOT NULL DEFAULT 'ipca',
    -- reusa o enum monetary_index existente (api/src/domain.js:117-125): igpm|ipca|inpc|selic|tr|tabela_tj|outro
  adjustment_period_months INT NOT NULL DEFAULT 12,    -- reajuste anual por padrão
  period_start             DATE NOT NULL,
  period_end               DATE NOT NULL,
  billing_day              SMALLINT NOT NULL DEFAULT 5 CHECK (billing_day BETWEEN 1 AND 28),
  auto_renew               BOOLEAN NOT NULL DEFAULT false,
  status                   TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','active','suspended','renewed','expired','terminated','written_off')),
  suspension_reason        TEXT,             -- preenchido quando o estado jurídico do título suspende
  renewed_from_lease_id    UUID REFERENCES lease(id),  -- cadeia de renovações
  terms_document_id        UUID REFERENCES terms_document(id),
  created_by               UUID NOT NULL REFERENCES users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);

-- Fee cobrada por contrato. RECONCILIAÇÃO: 1ª transferência = SAÍDA DA TREASURY (distribuição
-- primária) — % do valor de face do contrato + piso (placeholders 0,5% / R$ 25,00 —
-- DECISÃO — revisar, ADR-006). Sem flag por token individual.
CREATE TABLE fee (
  id              UUID PRIMARY KEY,
  contract_id     UUID NOT NULL REFERENCES token_contract(id),
  kind            TEXT NOT NULL CHECK (kind IN ('first_transfer','operational_adjustment')),
  amount          NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency        CHAR(3) NOT NULL DEFAULT 'BRL',
  fee_schedule_id UUID REFERENCES fee_schedule(id),   -- versão da tabela de fees aplicada (§iii)
  basis           TEXT,                     -- fórmula aplicada (ex.: 'pct:0.5|floor:25.00')
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','waived','cancelled')),
  charged_at      TIMESTAMPTZ,
  settled_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX fee_first_transfer_once
  ON fee (contract_id) WHERE kind = 'first_transfer';  -- fee ÚNICA por contrato (invariante I1)
```

---

## (iii) Receita — tarifas, faturas e contabilidade

Modelo e invariantes I1–I7 em [06-modelo-receita](../06-modelo-receita.md); exemplos no
[Apêndice D](./D-exemplos-numericos.md).

```sql
-- Tabela de fees versionada; imutável após ativação (a fatura congela a regra em snapshot).
CREATE TABLE fee_schedule (
  id                       UUID PRIMARY KEY,
  version                  INT UNIQUE NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  first_transfer_fee_type  TEXT NOT NULL DEFAULT 'percent_of_face'
    CHECK (first_transfer_fee_type IN ('percent_of_face','fixed_per_operation')),
  first_transfer_fee_value NUMERIC(8,4) NOT NULL,     -- ex.: 0.5000 = 0,50% (placeholder — ADR-006)
  min_fee_per_operation    NUMERIC(18,2) NOT NULL,    -- piso por operação (ex.: 25.00)
  max_fee_per_operation    NUMERIC(18,2),             -- teto opcional
  rounding_rule            TEXT NOT NULL DEFAULT 'half_up_2dp',
  effective_from           DATE,
  effective_to             DATE,
  created_by               UUID REFERENCES users(id),
  approved_by              UUID REFERENCES users(id), -- 2º usuário quando houver 2 gestores
  notes                    TEXT                       -- justificativa da mudança
);
CREATE UNIQUE INDEX fee_schedule_one_active ON fee_schedule (status) WHERE status = 'active';

-- Fatura — ciclo MANUAL sem gateway: issued → paid (comprovante anexado pelo Gestor).
CREATE TABLE invoice (
  id                    UUID PRIMARY KEY,
  invoice_code          TEXT UNIQUE NOT NULL,         -- humano-legível (ex.: 'INV-2026-0041')
  counterparty_user_id  UUID NOT NULL REFERENCES users(id),
  invoice_type          TEXT NOT NULL CHECK (invoice_type IN ('first_transfer_fee','lease_rental','adjustment')),
  source_type           TEXT NOT NULL CHECK (source_type IN ('fee','lease_accrual','manual')),
  source_id             UUID,                         -- fee.id | lease_accrual.id
  competence_period     CHAR(7),                      -- 'YYYY-MM' (competência ≠ caixa)
  amount                NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency              CHAR(3) NOT NULL DEFAULT 'BRL',
  fee_schedule_snapshot JSONB,                        -- regra congelada na emissão (auditabilidade)
  issue_date            DATE NOT NULL,
  due_date              DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued','paid','cancelled','written_off')),
  paid_at               TIMESTAMPTZ,
  paid_marked_by        UUID REFERENCES users(id),    -- marcado MANUALMENTE pelo Gestor
  payment_evidence_ref  TEXT                          -- comprovante (infra de anexos do PVC)
);

-- Competência de aluguel fechada por ação explícita do Gestor; pro-rata dias corridos em suspensão.
CREATE TABLE lease_accrual (
  id                UUID PRIMARY KEY,
  lease_id          UUID NOT NULL REFERENCES lease(id),
  competence_period CHAR(7) NOT NULL,                 -- 'YYYY-MM'
  days_in_period    SMALLINT NOT NULL CHECK (days_in_period BETWEEN 28 AND 31),
  days_billable     SMALLINT NOT NULL CHECK (days_billable >= 0),
  base_applied      NUMERIC(18,2) NOT NULL,            -- snapshot pós-reajuste: fatura auditável
  rate_applied_pct  NUMERIC(8,4) NOT NULL,             -- sem recomputar
  amount            NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency          CHAR(3) NOT NULL DEFAULT 'BRL',
  invoice_id        UUID REFERENCES invoice(id),
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lease_id, competence_period),               -- idempotência do "Fechar competência" (I5)
  CHECK (days_billable <= days_in_period)
);

-- APPEND-ONLY. Contabilidade de dupla entrada simplificada; correção SÓ por estorno.
CREATE TABLE ledger_entry (
  seq               BIGSERIAL PRIMARY KEY,            -- ordenação total
  entry_date        DATE NOT NULL,
  competence_period CHAR(7) NOT NULL,
  debit_account     TEXT NOT NULL,
  credit_account    TEXT NOT NULL,
  amount            NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency          CHAR(3) NOT NULL DEFAULT 'BRL',
  source_type       TEXT NOT NULL CHECK (source_type IN ('invoice','cost_entry','reversal')),
  source_id         UUID,
  reversal_of_seq   BIGINT REFERENCES ledger_entry(seq), -- estorno referencia o lançamento original
  memo              TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit_account <> credit_account),
  CHECK (debit_account IN ('accounts_receivable','cash_manual','revenue_first_transfer_fee',
                           'revenue_lease','expense_infra','expense_crypto_ops','expense_other','adjustments')),
  CHECK (credit_account IN ('accounts_receivable','cash_manual','revenue_first_transfer_fee',
                            'revenue_lease','expense_infra','expense_crypto_ops','expense_other','adjustments'))
);
-- Invariante I7: SUM(débitos) = SUM(créditos) por construção (1 débito + 1 crédito por linha);
-- balancete (trial_balance) verifica por relatório/teste.

-- Custo lançado pelo Gestor; cada registro gera ledger_entry (D expense_* / C cash_manual).
CREATE TABLE cost_entry (
  id                UUID PRIMARY KEY,
  category          TEXT NOT NULL CHECK (category IN
    ('infra_hosting','crypto_ops','legal_regulatory','custody','other')),
  description       TEXT NOT NULL,
  amount            NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency          CHAR(3) NOT NULL DEFAULT 'BRL',
  competence_period CHAR(7) NOT NULL,
  evidence_ref      TEXT,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## (iv) Ledger / auditoria

Arquitetura em [05-camada-ledger-blockchain](../05-camada-ledger-blockchain.md) e
[07-trilha-auditoria](../07-trilha-auditoria.md); interface `LedgerPort` no
[Apêndice A](./A-ledger-port.md).

```sql
-- Outbox transacional: o domínio NUNCA chama o LedgerPort no request HTTP.
CREATE TABLE ledger_outbox (
  id              BIGSERIAL PRIMARY KEY,
  operation       TEXT NOT NULL,             -- 'issueBatch' | 'transfer' | 'freezeTitle' | ...
  params          JSONB NOT NULL,            -- canônico, SEM PII
  idempotency_key UUID NOT NULL UNIQUE,
  state           TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','submitted','confirmed','failed','abandoned')),
    -- 'abandoned' = falha permanente → pendência bloqueante no título + intervenção manual
  attempts        INT NOT NULL DEFAULT 0,
  ledger_tx_hash  TEXT,
  chain_id        TEXT,                      -- 'sim:1' | 'besu:<id>'
  block_number    BIGINT,
  last_error      TEXT,
  audit_event_id  BIGINT NOT NULL REFERENCES audit_event(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- APPEND-ONLY (REVOKE + trigger + append_audit_event() SECURITY DEFINER com advisory lock).
-- Trilha hash-encadeada: verificável offline pelo perito sem confiar no operador (doc 07).
CREATE TABLE audit_event (
  id             BIGSERIAL PRIMARY KEY,      -- posição na cadeia (gaps detectáveis)
  event_uid      UUID NOT NULL UNIQUE,
  occurred_at    TIMESTAMPTZ NOT NULL,       -- momento do fato de negócio
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_party_id UUID,                       -- ator opaco (NULL p/ system); PII só em party
  actor_role     TEXT NOT NULL,              -- papel efetivo no momento do ato
  actor_ip_hash  TEXT,                       -- SHA-256(ip + pepper) — IP bruto é dado pessoal
  event_type     TEXT NOT NULL,              -- taxonomia fechada 'dominio.entidade.acao' (doc 07)
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  payload        JSONB NOT NULL,             -- canônico (RFC 8785/JCS), allowlist por event_type, SEM PII
  schema_version SMALLINT NOT NULL DEFAULT 1,
  payload_hash   TEXT NOT NULL,              -- SHA-256(JCS(payload))
  prev_hash      TEXT NOT NULL,              -- event_hash do id-1; genesis = 64 zeros
  event_hash     TEXT NOT NULL               -- SHA-256 sobre encoding canônico normativo (doc 07)
);
CREATE INDEX ON audit_event (entity_type, entity_id);
CREATE INDEX ON audit_event (event_type, occurred_at);
CREATE INDEX ON audit_event (actor_party_id, occurred_at);

-- Ancoragem Merkle periódica (RFC 6962) da hash-chain no ledger via anchorAuditRoot().
CREATE TABLE audit_anchor (
  id            BIGSERIAL PRIMARY KEY,
  merkle_root   TEXT NOT NULL,
  from_event_id BIGINT NOT NULL REFERENCES audit_event(id),
  to_event_id   BIGINT NOT NULL REFERENCES audit_event(id),
  algorithm     TEXT NOT NULL DEFAULT 'sha256-rfc6962',
  tx_hash       TEXT,
  chain_id      TEXT,
  block_number  BIGINT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed')),
  anchored_at   TIMESTAMPTZ,
  CHECK (to_event_id >= from_event_id)
);

-- APPEND-ONLY. "Chain" do SimulatedLedgerAdapter: id = altura de bloco; tx_hash DETERMINÍSTICO.
CREATE TABLE sim_ledger_tx (
  id              BIGSERIAL PRIMARY KEY,     -- sequência monotônica = block number ('sim:1')
  tx_hash         TEXT UNIQUE NOT NULL,      -- SHA-256(JCS(operação canônica)) — verificável offline
  operation       TEXT NOT NULL,             -- espelha LedgerPort ('issueBatch','transfer',...)
  params          JSONB NOT NULL,            -- canônico, SEM PII (ids opacos, carteiras, hashes)
  idempotency_key UUID UNIQUE NOT NULL,      -- retry naturalmente idempotente
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estado corrente do ledger simulado por título (saldos + paused); PROJEÇÃO de sim_ledger_tx.
CREATE TABLE sim_ledger_state (
  title_id     TEXT PRIMARY KEY,             -- id opaco do título no domínio
  paused       BOOLEAN NOT NULL DEFAULT false, -- freeze jurídico (semântica idêntica ao pause() do Besu)
  total_supply BIGINT NOT NULL DEFAULT 0 CHECK (total_supply >= 0),
  balances     JSONB NOT NULL DEFAULT '{}',  -- { "<wallet>": quantidade }
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ÚNICA zona de PII do marketplace — apagável/anonimizável (LGPD art. 18) SEM quebrar a hash-chain
-- (eventos referenciam party_id opaco; apagar party = anonimização por quebra de vínculo).
CREATE TABLE party (
  id           UUID PRIMARY KEY,
  user_id      UUID UNIQUE REFERENCES users(id), -- NULL p/ partes não-usuárias (ex.: titular original)
  display_name TEXT,
  document_id  TEXT,                         -- CPF/CNPJ
  email        CITEXT,
  erased_at    TIMESTAMPTZ,                  -- eliminação executada (evento gdpr.erasure.executed)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dossiê KYC/PLD-FT off-chain; on-chain vai SÓ claims_hash (registerIdentity).
CREATE TABLE kyc_record (
  id              UUID PRIMARY KEY,
  party_id        UUID NOT NULL REFERENCES party(id),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','revoked')),
  claims          JSONB,                     -- dossiê (documentos referenciados, nunca embutidos)
  claims_hash     TEXT NOT NULL,             -- SHA-256 do dossiê canônico
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  retention_until DATE,                      -- prazo de retenção PLD-FT/COAF — DECISÃO — revisar (ADR-007)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vínculo whitelist identidade↔carteira (party → wallet); revogação corta transferências.
CREATE TABLE wallet_link (
  id         UUID PRIMARY KEY,
  party_id   UUID NOT NULL REFERENCES party(id),
  wallet_id  UUID NOT NULL REFERENCES wallets(id),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','revoked')),
  linked_at  TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (party_id, wallet_id)
);
```

---

## (v) Gate regulatório

Item a item em [10-gate-regulatorio](../10-gate-regulatorio.md);
[ADR-007](../adr/ADR-007-gate-regulatorio-bloqueante.md).

```sql
-- 1 linha por item requiresLegal do TOKENIZATION_TEMPLATE (api/src/domain.js:188-194).
-- Responder exige parecer externo anexado de profissional habilitado identificado.
CREATE TABLE regulatory_gate_item (
  id                        UUID PRIMARY KEY,
  key                       TEXT UNIQUE NOT NULL CHECK (key IN
    ('is_security','offer_registration','fidc_structure','vasp_bcb','kyc_aml_pldft','lgpd','taxation')),
  question_label            TEXT NOT NULL,   -- rótulo espelhado do TOKENIZATION_TEMPLATE no boot
  status                    TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','satisfied','not_applicable','reopened')),
  answer                    TEXT CHECK (answer IN ('sim','nao_se_aplica')),  -- enum do checklist reusado
  opinion_document_ref      JSONB,           -- parecer externo (anexo no PVC / hash); obrigatório p/ sair de pending
  professional_name         TEXT,            -- profissional habilitado, identificado
  professional_registration TEXT,            -- OAB/CRC/etc.
  issued_at                 DATE,            -- data do parecer
  recorded_by               UUID REFERENCES users(id),  -- gestor que registrou
  recorded_at               TIMESTAMPTZ,
  notes                     TEXT,
  CHECK (status = 'pending'
         OR (opinion_document_ref IS NOT NULL AND professional_name IS NOT NULL))
);

-- APPEND-ONLY de ATOS: cada linha é um ato (kind granted|revoked); revogação = NOVA linha
-- kind='revoked', nunca UPDATE. O flag go_live_enabled é DERIVADO do último ato (granted ⇒ true;
-- revoked/nenhum ⇒ false) — nunca coluna editável. Enquanto false, o sistema RECUSA EM CÓDIGO
-- operação real (investidor apto, remoção de watermark, fatura fora do piloto).
CREATE TABLE regulatory_gate_approval (
  id            BIGSERIAL PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('granted','revoked')),
  item_snapshot JSONB NOT NULL,              -- estado dos 7 itens + refs dos pareceres no momento do ato
  approved_by   UUID NOT NULL REFERENCES users(id),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT
);
```

---

## Índice de tabelas × doc de referência

| Grupo | Tabelas | Doc |
|---|---|---|
| (i) Identidade/RBAC | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_sessions`, `invitations`, `rbac_meta`, `title_access_grants` | [01](../01-rbac-permissoes.md) |
| (ii) Marketplace | `security_title`, `legal_status_history`, `market_valuation`, `tokenization_parameter`, `title_listing`, `terms_document`, `system_parameters`, `token_batch`, `wallets`, `wallet_position`, `token_movement`, `token_contract`, `contract_substitution`, `contract_resolution_case`, `lease`, `fee` | [02](../02-modelo-de-dados.md) · [03](../03-elasticidade-tokenizacao.md) · [04](../04-maquina-estado-juridico.md) |
| (iii) Receita | `fee_schedule`, `invoice`, `lease_accrual`, `ledger_entry`, `cost_entry` | [06](../06-modelo-receita.md) |
| (iv) Ledger/auditoria | `ledger_outbox`, `audit_event`, `audit_anchor`, `sim_ledger_tx`, `sim_ledger_state`, `party`, `kyc_record`, `wallet_link` | [05](../05-camada-ledger-blockchain.md) · [07](../07-trilha-auditoria.md) |
| (v) Gate regulatório | `regulatory_gate_item`, `regulatory_gate_approval` | [10](../10-gate-regulatorio.md) |
