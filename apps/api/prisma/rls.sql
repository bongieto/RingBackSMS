-- Row Level Security for RingBack multi-tenant isolation
-- Run this after prisma migrate deploy

-- Enable RLS on all tenant-scoped tables
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Flow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MissedCall" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageLog" ENABLE ROW LEVEL SECURITY;

-- Create app role (used by the API via Prisma)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ringback_app') THEN
    CREATE ROLE ringback_app;
  END IF;
END
$$;

-- Set current_setting for tenant isolation
-- The app sets: SET LOCAL app.current_tenant_id = '<tenantId>';

-- Tenant table: app role can only see own tenant
CREATE POLICY tenant_isolation ON "Tenant"
  AS PERMISSIVE FOR ALL
  TO ringback_app
  USING (id = current_setting('app.current_tenant_id', true)::uuid);

-- TenantConfig
CREATE POLICY tenant_config_isolation ON "TenantConfig"
  AS PERMISSIVE FOR ALL
  TO ringback_app
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- Flow
CREATE POLICY flow_isolation ON "Flow"
  AS PERMISSIVE FOR ALL
  TO ringback_app
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- MissedCall
CREATE POLICY missed_call_isolation ON "MissedCall"
  AS PERMISSIVE FOR ALL
  TO ringback_app
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- Conversation
CREATE POLICY conversation_isolation ON "Conversation"
  AS PERMISSIVE FOR ALL
  TO ringback_app
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- Order
CREATE POLICY order_isolation ON "Order"
  AS PERMISSIVE FOR ALL
  TO ringback_app
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- Meeting
CREATE POLICY meeting_isolation ON "Meeting"
  AS PERMISSIVE FOR ALL
  TO ringback_app
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- MenuItem
CREATE POLICY menu_item_isolation ON "MenuItem"
  AS PERMISSIVE FOR ALL
  TO ringback_app
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- UsageLog
CREATE POLICY usage_log_isolation ON "UsageLog"
  AS PERMISSIVE FOR ALL
  TO ringback_app
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);

-- Grant privileges to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ringback_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ringback_app;
