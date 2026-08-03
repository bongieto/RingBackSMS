-- Durable operator lifecycle for Recovery Inbox cases. These tables are
-- server-managed only; they are not exposed to anon or authenticated Data API
-- roles. New caller activity after the handled watermark reopens the case.

CREATE TYPE "RecoveryCaseStatus" AS ENUM ('ACTIVE', 'SNOOZED', 'RESOLVED');
CREATE TYPE "RecoveryResolutionReason" AS ENUM (
  'CUSTOMER_CONTACTED',
  'ORDER_HANDLED',
  'QUESTION_ANSWERED',
  'NO_RESPONSE_NEEDED',
  'SPAM_OR_WRONG_NUMBER',
  'OTHER'
);
CREATE TYPE "RecoveryCaseActionType" AS ENUM ('RESOLVED', 'SNOOZED', 'REOPENED', 'AUTO_REOPENED');

CREATE TABLE "RecoveryCase" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "callerPhone" TEXT NOT NULL,
  "status" "RecoveryCaseStatus" NOT NULL DEFAULT 'ACTIVE',
  "resolutionReason" "RecoveryResolutionReason",
  "resolutionNote" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "snoozedUntil" TIMESTAMP(3),
  "lastHandledActivityAt" TIMESTAMP(3),
  "reopenedAt" TIMESTAMP(3),
  "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecoveryCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecoveryCaseAction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "recoveryCaseId" TEXT NOT NULL,
  "action" "RecoveryCaseActionType" NOT NULL,
  "reason" "RecoveryResolutionReason",
  "note" TEXT,
  "actorId" TEXT NOT NULL,
  "snoozedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecoveryCaseAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecoveryCase_tenantId_callerPhone_key"
  ON "RecoveryCase"("tenantId", "callerPhone");
CREATE INDEX "RecoveryCase_tenantId_status_updatedAt_idx"
  ON "RecoveryCase"("tenantId", "status", "updatedAt");
CREATE INDEX "RecoveryCase_tenantId_snoozedUntil_idx"
  ON "RecoveryCase"("tenantId", "snoozedUntil");
CREATE INDEX "RecoveryCaseAction_tenantId_createdAt_idx"
  ON "RecoveryCaseAction"("tenantId", "createdAt");
CREATE INDEX "RecoveryCaseAction_recoveryCaseId_createdAt_idx"
  ON "RecoveryCaseAction"("recoveryCaseId", "createdAt");

ALTER TABLE "RecoveryCase"
  ADD CONSTRAINT "RecoveryCase_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryCaseAction"
  ADD CONSTRAINT "RecoveryCaseAction_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryCaseAction"
  ADD CONSTRAINT "RecoveryCaseAction_recoveryCaseId_fkey"
  FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecoveryCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecoveryCaseAction" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RecoveryCase" FROM anon, authenticated;
REVOKE ALL ON TABLE "RecoveryCaseAction" FROM anon, authenticated;
