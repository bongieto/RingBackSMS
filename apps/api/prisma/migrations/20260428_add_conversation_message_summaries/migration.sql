-- Store lightweight list-view summaries so conversation pages do not need to
-- load and decrypt full encrypted message histories for every row.
ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "lastMessagePreview" TEXT,
  ADD COLUMN IF NOT EXISTS "messageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "messageSummarySyncedAt" TIMESTAMP(3);
