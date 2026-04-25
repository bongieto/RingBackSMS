-- Replace FoodTruckSchedule (recurring weekly, keyed on dayOfWeek) with
-- FoodTruckStop (date-anchored, multiple stops per day allowed).
--
-- The old model couldn't answer date-specific questions like "where are
-- you tomorrow / this Friday / Apr 30?". Food truck owners plan by
-- date, not weekday. Production has zero rows in FoodTruckSchedule
-- across all tenants at the time of this migration, so no data needs to
-- be carried over.

DROP TABLE "FoodTruckSchedule";

CREATE TABLE "FoodTruckStop" (
    "id"           TEXT PRIMARY KEY,
    "tenantId"     TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
    "stopDate"     DATE NOT NULL,
    "locationName" TEXT,
    "address"      TEXT NOT NULL,
    "openTime"     TEXT NOT NULL,
    "closeTime"    TEXT NOT NULL,
    "note"         TEXT,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL
);

CREATE INDEX "FoodTruckStop_tenantId_stopDate_idx"
    ON "FoodTruckStop" ("tenantId", "stopDate");

CREATE INDEX "FoodTruckStop_tenantId_isActive_stopDate_idx"
    ON "FoodTruckStop" ("tenantId", "isActive", "stopDate");
