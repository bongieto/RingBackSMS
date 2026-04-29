-- Speed up conversation list pages, which filter by tenant / active state and
-- sort by most recently updated.
CREATE INDEX IF NOT EXISTS "Conversation_tenantId_updatedAt_idx"
  ON "Conversation"("tenantId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Conversation_tenantId_isActive_updatedAt_idx"
  ON "Conversation"("tenantId", "isActive", "updatedAt");
