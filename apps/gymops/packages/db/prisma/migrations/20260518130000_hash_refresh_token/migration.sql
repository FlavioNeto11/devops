-- Rename refresh_token column to refresh_token_hash and truncate existing sessions.
-- Existing refresh tokens are plaintext JWTs; after this migration they'll be SHA-256 hashes.
-- All active sessions are invalidated (users will be asked to log in again).

-- Drop the old unique index
DROP INDEX IF EXISTS "sessions_refresh_token_key";

-- Rename the column
ALTER TABLE "sessions" RENAME COLUMN "refresh_token" TO "refresh_token_hash";

-- Invalidate all existing sessions (they have plaintext tokens, not hashes)
UPDATE "sessions" SET "revoked_at" = NOW() WHERE "revoked_at" IS NULL;

-- Re-create the unique index on the new column name
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");
