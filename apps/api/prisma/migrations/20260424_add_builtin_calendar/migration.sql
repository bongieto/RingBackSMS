-- ================================================================
-- Built-in calendar — native SMS-driven booking without cal.com.
--
-- Adds per-tenant calendar config (duration, buffer, lead time, max
-- days out, master enable), guest fields + duration on Meeting for
-- proper booking records, a scheduledAt index to accelerate slot
-- conflict checks, and a CalendarBlackout table for manual block-out
-- windows (holidays, off-sites). Tenants without cal.com fall to the
-- built-in path automatically (meetingEnabled defaults to true).
-- ================================================================

-- 1. TenantConfig: built-in calendar knobs
ALTER TABLE "TenantConfig"
  ADD COLUMN "meetingEnabled"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "meetingDurationMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "meetingBufferMinutes"   INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "meetingLeadTimeMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "meetingMaxDaysOut"      INTEGER NOT NULL DEFAULT 30;

-- 2. Meeting: guest identity + duration (cal.com path leaves these null)
ALTER TABLE "Meeting"
  ADD COLUMN "durationMinutes" INTEGER,
  ADD COLUMN "guestName"       TEXT,
  ADD COLUMN "guestEmail"      TEXT;

-- 3. Meeting: index for fast scheduledAt-window conflict checks
CREATE INDEX "Meeting_tenantId_scheduledAt_idx"
  ON "Meeting"("tenantId", "scheduledAt");

-- 4. CalendarBlackout: manual block-out windows
CREATE TABLE "CalendarBlackout" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "startAt"   TIMESTAMP(3) NOT NULL,
  "endAt"     TIMESTAMP(3) NOT NULL,
  "label"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CalendarBlackout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarBlackout_tenantId_startAt_endAt_idx"
  ON "CalendarBlackout"("tenantId", "startAt", "endAt");

ALTER TABLE "CalendarBlackout"
  ADD CONSTRAINT "CalendarBlackout_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
