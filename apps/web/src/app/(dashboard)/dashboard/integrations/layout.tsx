import { requireAdmin } from '@/lib/server/requireRole';

// Integrations OAuth's into Square, Cal.com, etc. Owner-level action;
// never something kitchen staff should be hitting.
export default async function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
