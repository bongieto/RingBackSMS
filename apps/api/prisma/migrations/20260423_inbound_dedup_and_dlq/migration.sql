-- Persistent idempotency for inbound Twilio SMS webhooks.
-- Redis has a 5-min TTL on the hot path; Twilio retries up to 24h, so a
-- late retry would double-process without this table.
CREATE TABLE "InboundSmsDedup" (
    "id"         TEXT        NOT NULL,
    "tenantId"   TEXT        NOT NULL,
    "messageSid" TEXT        NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundSmsDedup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundSmsDedup_tenantId_messageSid_key"
    ON "InboundSmsDedup"("tenantId", "messageSid");

CREATE INDEX "InboundSmsDedup_receivedAt_idx"
    ON "InboundSmsDedup"("receivedAt");

-- Dead-letter queue for side-effect failures (SAVE_ORDER etc.) after the
-- in-request retry loop gives up. Operator UI + reprocessor cron consume it.
CREATE TABLE "SideEffectFailure" (
    "id"             TEXT         NOT NULL,
    "tenantId"       TEXT         NOT NULL,
    "effectType"     TEXT         NOT NULL,
    "payload"        JSONB        NOT NULL,
    "conversationId" TEXT,
    "callerPhone"    TEXT,
    "error"          TEXT         NOT NULL,
    "attempts"       INTEGER      NOT NULL DEFAULT 1,
    "lastAttemptAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"     TIMESTAMP(3),
    "resolvedBy"     TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SideEffectFailure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SideEffectFailure_tenantId_resolvedAt_idx"
    ON "SideEffectFailure"("tenantId", "resolvedAt");

CREATE INDEX "SideEffectFailure_createdAt_idx"
    ON "SideEffectFailure"("createdAt");

CREATE INDEX "SideEffectFailure_effectType_resolvedAt_idx"
    ON "SideEffectFailure"("effectType", "resolvedAt");
