import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AuthTokenProvider } from '@/components/providers/AuthTokenProvider';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  const adminId = process.env.SUPER_ADMIN_CLERK_USER_ID?.trim();

  // Must be logged in
  if (!userId) {
    redirect('/sign-in');
  }

  // If admin gate is configured, enforce it
  if (adminId && userId !== adminId) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Admin Sidebar */}
      <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col fixed top-0 left-0 h-screen z-30">
        <div className="p-5 border-b border-slate-800">
          <div className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-1">Platform Admin</div>
          <div className="text-white font-bold text-lg">RingBack<span className="text-blue-400">SMS</span></div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <AdminNavLink href="/admin" label="Overview" />
          <AdminNavLink href="/admin/tenants" label="Tenants" />
          <AdminNavLink href="/admin/users" label="Users" />
          <AdminNavLink href="/admin/agencies" label="Agencies" />
          <AdminNavLink href="/admin/applications" label="Applications" />
          <AdminNavLink href="/admin/finance" label="Finance" />
          <AdminNavLink href="/admin/api-status" label="API Status" />
          <AdminNavLink href="/admin/activity" label="Activity" />
        </nav>
        <div className="p-4 border-t border-slate-800">
          <a href="/dashboard" className="text-xs text-slate-500 hover:text-slate-300">
            ← Back to Dashboard
          </a>
        </div>
      </aside>
      <AuthTokenProvider />
      <main className="flex-1 ml-56 p-8 min-h-screen">
        {children}
      </main>
    </div>
  );
}

function AdminNavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
    >
      {label}
    </a>
  );
}
