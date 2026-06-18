-- P6 — handoff learning loop.
-- One row per human-authored outbound SMS on a tenant's conversation.
-- Pairs the customer inbound with the operator's reply (and the bot's prior
-- reply for audit). Used as few-shot exemplars in the fallback LLM prompt.

CREATE TYPE "ExemplarStatus" AS ENUM ('APPROVED', 'SUPPRESSED');

CREATE TABLE "HandoffExemplar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT,
    "callerPhone" TEXT NOT NULL,
    "inboundMessage" TEXT NOT NULL,
    "humanReply" TEXT NOT NULL,
    "botReplyBefore" TEXT,
    "status" "ExemplarStatus" NOT NULL DEFAULT 'APPROVED',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandoffExemplar_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HandoffExemplar_tenantId_createdAt_idx"
    ON "HandoffExemplar"("tenantId", "createdAt");

CREATE INDEX "HandoffExemplar_tenantId_status_createdAt_idx"
    ON "HandoffExemplar"("tenantId", "status", "createdAt");

ALTER TABLE "HandoffExemplar"
    ADD CONSTRAINT "HandoffExemplar_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
