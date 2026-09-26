-- 0009 — papel legado `investor` sem capacidades (ADR-010, hardening P0).
-- O primeiro login SSO não concede mais papel algum (identidade pendente, sem capacidade). O papel
-- `investor` continua existindo só por compatibilidade com linhas antigas de user_roles; perde todas as
-- permissões e o resolver (foundation/rbac.js, DEPRECATED_ROLES) ignora qualquer uma que reapareça.
DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE key = 'investor');
UPDATE roles SET label = 'Investidor (DEPRECATED — sem capacidades, ADR-010)' WHERE key = 'investor';
UPDATE rbac_meta SET version = version + 1 WHERE id = 1;
