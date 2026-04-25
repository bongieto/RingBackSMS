-- Rename Plan enum tiers to match the new pricing model shipped in PR #85
-- (feat(billing): rename plan tiers — FREE / PRO / BUSINESS / SCALE).
-- The schema change shipped without a migration, leaving prod DB on the old
-- enum (STARTER/GROWTH/SCALE/ENTERPRISE) while runtime expected the new values.
--
-- Mapping (preserves intent, not name):
--   STARTER    -> FREE       (entry tier)
--   GROWTH     -> PRO        (low/mid)
--   SCALE      -> BUSINESS   (old mid-tier -> new mid-tier)
--   ENTERPRISE -> SCALE      (top tier -> top tier, now self-serve)

ALTER TABLE "Tenant" ALTER COLUMN "plan" DROP DEFAULT;

ALTER TYPE "Plan" RENAME TO "Plan_old";

CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'BUSINESS', 'SCALE');

ALTER TABLE "Tenant"
  ALTER COLUMN "plan" TYPE "Plan" USING (
    CASE "plan"::text
      WHEN 'STARTER'    THEN 'FREE'
      WHEN 'GROWTH'     THEN 'PRO'
      WHEN 'SCALE'      THEN 'BUSINESS'
      WHEN 'ENTERPRISE' THEN 'SCALE'
    END::"Plan"
  );

ALTER TABLE "Tenant" ALTER COLUMN "plan" SET DEFAULT 'FREE';

DROP TYPE "Plan_old";
