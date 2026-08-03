ALTER TABLE "MenuItemModifierGroup"
ADD COLUMN "conditions" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "IntegrationConnection"
ADD COLUMN "accessTokenEncrypted" TEXT;

CREATE TABLE "MenuSyncCursor" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "revision" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MenuSyncCursor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MenuSyncCursor_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "MenuSyncCursor_checksum_check" CHECK ("checksum" ~ '^[0-9a-fA-F]{64}$')
);

CREATE UNIQUE INDEX "MenuSyncCursor_connectionId_locationId_key"
ON "MenuSyncCursor"("connectionId", "locationId");
CREATE INDEX "MenuSyncCursor_tenantId_locationId_idx"
ON "MenuSyncCursor"("tenantId", "locationId");

ALTER TABLE "MenuSyncCursor"
ADD CONSTRAINT "MenuSyncCursor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "MenuSyncCursor_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "MenuSyncCursor_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "TenantLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExternalSale" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "fulfillmentStatus" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "grossCents" INTEGER NOT NULL,
  "discountCents" INTEGER NOT NULL DEFAULT 0,
  "taxCents" INTEGER NOT NULL DEFAULT 0,
  "feeCents" INTEGER NOT NULL DEFAULT 0,
  "tipCents" INTEGER NOT NULL DEFAULT 0,
  "refundCents" INTEGER NOT NULL DEFAULT 0,
  "netCents" INTEGER NOT NULL,
  "tenderTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "items" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalSale_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalSale_version_check" CHECK ("version" > 0),
  CONSTRAINT "ExternalSale_amounts_check" CHECK (
    "grossCents" >= 0 AND "discountCents" >= 0 AND "taxCents" >= 0
    AND "feeCents" >= 0 AND "tipCents" >= 0 AND "refundCents" >= 0
    AND "refundCents" <= "grossCents" AND "netCents" = "grossCents" - "refundCents"
  ),
  CONSTRAINT "ExternalSale_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "ExternalSale_status_check" CHECK ("status" IN ('PENDING', 'PAID', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  CONSTRAINT "ExternalSale_fulfillment_status_check" CHECK ("fulfillmentStatus" IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'))
);

CREATE UNIQUE INDEX "ExternalSale_connectionId_externalId_key"
ON "ExternalSale"("connectionId", "externalId");
CREATE INDEX "ExternalSale_tenantId_occurredAt_idx"
ON "ExternalSale"("tenantId", "occurredAt");
CREATE INDEX "ExternalSale_tenantId_status_occurredAt_idx"
ON "ExternalSale"("tenantId", "status", "occurredAt");
CREATE INDEX "ExternalSale_locationId_occurredAt_idx"
ON "ExternalSale"("locationId", "occurredAt");

ALTER TABLE "ExternalSale"
ADD CONSTRAINT "ExternalSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "ExternalSale_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "ExternalSale_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "TenantLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
