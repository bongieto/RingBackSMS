-- These commerce synchronization tables are internal server-side data.
-- Keep them inaccessible through Supabase's exposed public Data API.
ALTER TABLE "MenuSyncCursor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExternalSale" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "MenuSyncCursor" FROM anon, authenticated;
REVOKE ALL ON TABLE "ExternalSale" FROM anon, authenticated;
