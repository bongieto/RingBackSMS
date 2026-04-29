ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "nameSearchHash" TEXT,
  ADD COLUMN IF NOT EXISTS "emailSearchHash" TEXT;

CREATE INDEX IF NOT EXISTS "Contact_tenantId_nameSearchHash_idx"
  ON "Contact"("tenantId", "nameSearchHash");

CREATE INDEX IF NOT EXISTS "Contact_tenantId_emailSearchHash_idx"
  ON "Contact"("tenantId", "emailSearchHash");
