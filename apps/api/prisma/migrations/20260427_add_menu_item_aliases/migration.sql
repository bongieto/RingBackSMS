-- Menu aliases let operators teach the SMS order agent what customers
-- actually call an item ("egg rolls", "pork rolls", "regular lumpia").
-- Stored as text[] so exact alias matching stays cheap in app memory after
-- the tenant menu is loaded.

ALTER TABLE "MenuItem"
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
