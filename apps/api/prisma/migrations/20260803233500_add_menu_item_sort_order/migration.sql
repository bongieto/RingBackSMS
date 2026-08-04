ALTER TABLE "MenuItem"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked_items AS (
  SELECT
    "id",
    CAST(
      ROW_NUMBER() OVER (
        PARTITION BY "tenantId", "categoryId"
        ORDER BY "name" ASC, "id" ASC
      ) - 1 AS INTEGER
    ) AS position
  FROM "MenuItem"
)
UPDATE "MenuItem" AS item
SET "sortOrder" = ranked_items.position
FROM ranked_items
WHERE item."id" = ranked_items."id";

CREATE INDEX "MenuItem_tenantId_categoryId_sortOrder_idx"
ON "MenuItem"("tenantId", "categoryId", "sortOrder");
