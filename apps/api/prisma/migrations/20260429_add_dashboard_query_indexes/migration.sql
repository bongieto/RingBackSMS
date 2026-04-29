-- Focused indexes for high-traffic dashboard and staff workflow queries.
-- These mirror the actual tenant-scoped filters and sort orders used by
-- tasks, voicemails, contacts, global search, caller context, and printer
-- polling routes.

CREATE INDEX IF NOT EXISTS "MissedCall_tenantId_callerPhone_occurredAt_idx"
  ON "MissedCall"("tenantId", "callerPhone", "occurredAt");

CREATE INDEX IF NOT EXISTS "MissedCall_tenantId_smsSent_occurredAt_idx"
  ON "MissedCall"("tenantId", "smsSent", "occurredAt");

CREATE INDEX IF NOT EXISTS "MissedCall_tenantId_firstReplyAt_occurredAt_idx"
  ON "MissedCall"("tenantId", "firstReplyAt", "occurredAt");

CREATE INDEX IF NOT EXISTS "MissedCall_tenantId_ownerRespondedAt_occurredAt_idx"
  ON "MissedCall"("tenantId", "ownerRespondedAt", "occurredAt");

CREATE INDEX IF NOT EXISTS "MissedCall_tenantId_voicemailReceivedAt_idx"
  ON "MissedCall"("tenantId", "voicemailReceivedAt");

CREATE INDEX IF NOT EXISTS "MissedCall_tenantId_voicemailIntent_voicemailReceivedAt_idx"
  ON "MissedCall"("tenantId", "voicemailIntent", "voicemailReceivedAt");

CREATE INDEX IF NOT EXISTS "Conversation_tenantId_callerPhone_createdAt_idx"
  ON "Conversation"("tenantId", "callerPhone", "createdAt");

CREATE INDEX IF NOT EXISTS "Conversation_tenantId_createdAt_idx"
  ON "Conversation"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "Order_tenantId_callerPhone_createdAt_idx"
  ON "Order"("tenantId", "callerPhone", "createdAt");

CREATE INDEX IF NOT EXISTS "Order_tenantId_paymentStatus_callerPhone_createdAt_idx"
  ON "Order"("tenantId", "paymentStatus", "callerPhone", "createdAt");

CREATE INDEX IF NOT EXISTS "Order_tenantId_status_printedAt_createdAt_idx"
  ON "Order"("tenantId", "status", "printedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "Contact_tenantId_status_updatedAt_idx"
  ON "Contact"("tenantId", "status", "updatedAt");

CREATE INDEX IF NOT EXISTS "Contact_tenantId_createdAt_idx"
  ON "Contact"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "Task_tenantId_status_priority_createdAt_idx"
  ON "Task"("tenantId", "status", "priority", "createdAt");

CREATE INDEX IF NOT EXISTS "Task_status_snoozedUntil_idx"
  ON "Task"("status", "snoozedUntil");

CREATE INDEX IF NOT EXISTS "Task_status_updatedAt_idx"
  ON "Task"("status", "updatedAt");
