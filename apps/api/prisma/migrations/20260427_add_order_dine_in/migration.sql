-- Dine-in support. Customers occasionally order ahead for dine-in;
-- pickupTime then carries their *arrival ETA* rather than a pickup
-- time. Default false so existing rows backfill as the dominant
-- pickup case.

ALTER TABLE "Order"
  ADD COLUMN "dineIn" BOOLEAN NOT NULL DEFAULT false;
