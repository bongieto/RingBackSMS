import { requireAdmin } from '@/lib/server/requireRole';

// Settings edits tenant-wide configuration (business hours, greetings,
// custom AI instructions, consent copy). Owner/Manager only — a kitchen
// staff member accidentally editing the greeting would be bad. Sidebar
// already hides the link for non-admins; this layout enforces even when
// someone types the URL directly.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
