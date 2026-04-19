import { requireAdmin } from '@/lib/server/requireRole';

// Billing shows invoices + subscription management. Admin only.
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
