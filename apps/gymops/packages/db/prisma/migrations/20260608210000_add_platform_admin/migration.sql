-- Super-admin da plataforma: flag no usuário (acima dos owners de academia).
-- Aditiva, com DEFAULT, sem índice (cardinalidade baixíssima; lookup por id/email já únicos).
ALTER TABLE "users" ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;
