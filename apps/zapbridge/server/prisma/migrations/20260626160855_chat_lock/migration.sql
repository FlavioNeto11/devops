-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN "lockSecret" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Chat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageId" TEXT,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Chat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Chat" ("archived", "avatarUrl", "id", "isGroup", "jid", "lastMessageAt", "lastMessageId", "name", "sessionId", "unreadCount") SELECT "archived", "avatarUrl", "id", "isGroup", "jid", "lastMessageAt", "lastMessageId", "name", "sessionId", "unreadCount" FROM "Chat";
DROP TABLE "Chat";
ALTER TABLE "new_Chat" RENAME TO "Chat";
CREATE INDEX "Chat_sessionId_lastMessageAt_idx" ON "Chat"("sessionId", "lastMessageAt");
CREATE UNIQUE INDEX "Chat_sessionId_jid_key" ON "Chat"("sessionId", "jid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
