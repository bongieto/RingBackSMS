ALTER TABLE "Conversation"
ADD COLUMN "reviewedMessageCount" INTEGER NOT NULL DEFAULT 0;

-- Existing reviewed conversations have already had their current transcript
-- evaluated. Start their cursor at the current count so administrative updates
-- do not cause the same transcript to be reviewed again after deployment.
UPDATE "Conversation"
SET "reviewedMessageCount" = "messageCount"
WHERE "reviewedAt" IS NOT NULL;
