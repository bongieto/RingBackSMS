-- Audit trail for config changes. Populated from write paths that
-- mutate Tenant or TenantConfig (dashboard saves, admin edits, POS
-- OAuth connections, etc.). The existing schema had no way to answer
-- "who changed this tenant's greeting last week?" — this table does.
CREATE TABLE "ConfigAuditLog" (
    "id"        TEXT         NOT NULL,
    "tenantId"  TEXT         NOT NULL,
    "actor"     TEXT         NOT NULL,
    "action"    TEXT         NOT NULL,
    "entity"    TEXT         NOT NULL,
    "entityId"  TEXT,
    "changes"   JSONB        NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConfigAuditLog_tenantId_createdAt_idx"
    ON "ConfigAuditLog"("tenantId", "createdAt");

CREATE INDEX "ConfigAuditLog_actor_createdAt_idx"
    ON "ConfigAuditLog"("actor", "createdAt");

CREATE INDEX "ConfigAuditLog_createdAt_idx"
    ON "ConfigAuditLog"("createdAt");
