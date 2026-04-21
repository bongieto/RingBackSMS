-- ================================================================
-- Turn Record observation layer — first migration in this repo.
--
-- Historically this project has used `prisma db push` for dev and
-- `prisma migrate deploy` for prod-equivalent; the migrations folder
-- was empty. This file captures ONLY the Turn-record delta. Before
-- running `migrate deploy` the first time, baseline existing prod
-- against this migration with:
--
--   prisma migrate resolve --applied 20260421_add_turn_record
--
-- after applying the SQL manually (or via `prisma db push`). From this
-- point forward, new migrations can be added incrementally.
-- ================================================================

-- 1. Enums
CREATE TYPE "TurnDirection" AS ENUM ('INBOUND', 'OUTBOUND_PROACTIVE');
CREATE TYPE "DecisionPhase" AS ENUM ('PRE_HANDLER', 'FLOW', 'POST_HANDLER');
CREATE TYPE "TurnOutcome" AS ENUM (
  'REPLIED',
  'DEFLECTED',
  'SUPPRESSED_COMPLIANCE',
  'SUPPRESSED_RATE_LIMIT',
  'SUPPRESSED_DUPLICATE',
  'HANDED_OFF_TO_HUMAN',
  'QUEUED_FOR_BUSINESS_HOURS',
  'ERROR_LLM_TIMEOUT',
  'ERROR_LLM_REFUSED',
  'ERROR_HANDLER_THREW',
  'ERROR_UNHANDLED'
);

-- 2. Turn table
CREATE TABLE "Turn" (
  "id"                   TEXT PRIMARY KEY,
  "tenantId"             TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "callerPhone"          TEXT NOT NULL,
  "direction"            "TurnDirection" NOT NULL DEFAULT 'INBOUND',
  "inboundMessageSid"    TEXT,
  "inboundBodyEncrypted" TEXT,
  "inboundReceivedAt"    TIMESTAMP(3) NOT NULL,
  "tenantConfigSnapshot" JSONB NOT NULL,
  "contactStateSnapshot" JSONB,
  "outcome"              "TurnOutcome" NOT NULL,
  "outcomeReason"        TEXT,
  "replyBodyEncrypted"   TEXT,
  "replyMessageSid"      TEXT,
  "durationMs"           INTEGER NOT NULL,
  "llmCalled"            BOOLEAN NOT NULL DEFAULT false,
  "llmLatencyMs"         INTEGER,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Turn_tenantId_callerPhone_createdAt_idx" ON "Turn" ("tenantId", "callerPhone", "createdAt");
CREATE INDEX "Turn_tenantId_outcome_createdAt_idx"     ON "Turn" ("tenantId", "outcome", "createdAt");
CREATE INDEX "Turn_createdAt_idx"                      ON "Turn" ("createdAt");

-- 3. Decision table
CREATE TABLE "Decision" (
  "id"         TEXT PRIMARY KEY,
  "turnId"     TEXT NOT NULL REFERENCES "Turn"("id") ON DELETE CASCADE,
  "sequence"   INTEGER NOT NULL,
  "handler"    TEXT NOT NULL,
  "phase"      "DecisionPhase" NOT NULL,
  "outcome"    TEXT NOT NULL,
  "reason"     TEXT,
  "evidence"   JSONB,
  "durationMs" INTEGER NOT NULL
);
CREATE INDEX "Decision_turnId_sequence_idx"   ON "Decision" ("turnId", "sequence");
CREATE INDEX "Decision_handler_outcome_idx"   ON "Decision" ("handler", "outcome");

-- 4. causingTurnId back-pointers (nullable, NO FK — business data must
--    outlive Turn retention window).
ALTER TABLE "SmsSuppression" ADD COLUMN "causingTurnId" TEXT;
ALTER TABLE "Order"          ADD COLUMN "causingTurnId" TEXT;
ALTER TABLE "Conversation"   ADD COLUMN "causingTurnId" TEXT;
