-- =============================================================================================
-- 0008 — Papel de runtime com privilégio mínimo (ADR-010, hardening P0).
--
-- MIGRATION_ROLE  = o usuário do DATABASE_URL (no cluster, POSTGRES_USER da imagem oficial, que é
--                   SUPERUSER). Só ele aplica migrations, semeia RBAC e cria o usuário bootstrap.
-- APPLICATION_ROLE = besc_app. A API atende requisições com este papel:
--   * não é dono de nenhuma tabela: não altera schema, não desabilita nem dropa trigger;
--   * sem TRUNCATE, TRIGGER ou REFERENCES em tabela alguma;
--   * sem superusuário: não liga session_replication_role (que desligaria os triggers);
--   * SELECT em tudo; INSERT só onde o domínio F1/F2 cria linhas; UPDATE só em colunas listadas;
--     DELETE só nas tabelas de RBAC;
--   * NENHUMA escrita em governance_gate, allowed_transition, tabelas do marketplace (0003–0005),
--     external_confirmation, claim_validation, recognized_right, registration_request,
--     registered_asset: sem API de mutação de governança e sem caminho para ativo nesta fase.
-- O estado das projeções (claim.state etc.) só muda pelo trigger de entity_transition, que passa
-- a ser SECURITY DEFINER: o runtime não tem UPDATE nessas tabelas.
-- Toda migration futura que criar tabela recebe só SELECT por padrão (default privileges) e
-- precisa conceder escrita de forma explícita; o teste de grants falha se esquecer.
-- =============================================================================================

DO $$
BEGIN
  -- papel é do cluster: bancos migrando em paralelo no mesmo servidor não podem colidir
  BEGIN
    CREATE ROLE besc_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  -- o papel de migração precisa poder assumir besc_app (modo SET ROLE) — superusuário já pode.
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    EXECUTE format('GRANT besc_app TO %I', current_user);
  END IF;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO besc_app;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM besc_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM besc_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO besc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO besc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO besc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO besc_app;

-- identidade e RBAC (fundação)
GRANT INSERT ON users, user_sessions, invitations, roles, role_permissions, user_roles TO besc_app;
GRANT UPDATE (approval_status, is_active, keycloak_sub, password_hash, updated_at) ON users TO besc_app;
GRANT UPDATE (revoked_at) ON user_sessions TO besc_app;
GRANT UPDATE (accepted_at, accepted_user_id) ON invitations TO besc_app;
GRANT UPDATE (version) ON rbac_meta TO besc_app;
GRANT DELETE ON roles, role_permissions, user_roles TO besc_app;

-- trilha de auditoria (append-only; v1 e v2)
GRANT INSERT ON audit_event TO besc_app;

-- recuperação de ativos legados (F1/F2)
GRANT INSERT ON claimant, evidence, evidence_classification, claim, claim_evidence, entity_transition, valuation, approval_request TO besc_app;
GRANT UPDATE (state, reviewed_by, reviewed_at, review_notes, decision, approved_by, approved_at, decision_notes) ON approval_request TO besc_app;

-- guarda (trava a linha com FOR UPDATE) e aplicação da transição rodam com o dono da função: o
-- runtime não precisa (nem tem) UPDATE nas projeções; estado só muda por INSERT em entity_transition.
ALTER FUNCTION entity_transition_guard() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION entity_transition_apply() SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION entity_transition_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION entity_transition_apply() FROM PUBLIC;
