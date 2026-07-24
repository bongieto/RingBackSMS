-- Structured, tenant-verified facts for grounded customer replies.
CREATE TABLE "KnowledgeFact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'OWNER',
    "sourceUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiResponseAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "turnId" TEXT,
    "callerPhoneHash" TEXT,
    "purpose" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "questionEncrypted" TEXT,
    "answerEncrypted" TEXT,
    "supportedFactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retrievedFactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION,
    "validationStatus" TEXT NOT NULL,
    "validationReason" TEXT,
    "needsHuman" BOOLEAN NOT NULL DEFAULT false,
    "providerFallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "customerCorrection" BOOLEAN NOT NULL DEFAULT false,
    "correctionEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiResponseAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeFact_tenantId_key_key" ON "KnowledgeFact"("tenantId", "key");
CREATE INDEX "KnowledgeFact_tenantId_isActive_isVerified_idx" ON "KnowledgeFact"("tenantId", "isActive", "isVerified");
CREATE INDEX "KnowledgeFact_tenantId_category_idx" ON "KnowledgeFact"("tenantId", "category");
CREATE INDEX "AiResponseAudit_tenantId_createdAt_idx" ON "AiResponseAudit"("tenantId", "createdAt");
CREATE INDEX "AiResponseAudit_tenantId_validationStatus_createdAt_idx" ON "AiResponseAudit"("tenantId", "validationStatus", "createdAt");
CREATE INDEX "AiResponseAudit_turnId_idx" ON "AiResponseAudit"("turnId");
CREATE INDEX "AiResponseAudit_tenantId_callerPhoneHash_createdAt_idx" ON "AiResponseAudit"("tenantId", "callerPhoneHash", "createdAt");

ALTER TABLE "KnowledgeFact"
ADD CONSTRAINT "KnowledgeFact_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiResponseAudit"
ADD CONSTRAINT "AiResponseAudit_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- These tables are internal server-side accuracy infrastructure. Keep them
-- inaccessible through Supabase's exposed public Data API.
ALTER TABLE "KnowledgeFact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiResponseAudit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "KnowledgeFact" FROM anon, authenticated;
REVOKE ALL ON TABLE "AiResponseAudit" FROM anon, authenticated;
