import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AuthTokenProvider } from '@/components/providers/AuthTokenProvider';
import { ViewSwitcher } from '@/components/layout/ViewSwitcher';
import { isAgencyUser, isSuperAdmin } from '@/lib/server/agency';

export const dynamic = 'force-dynamic';

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  if (!isSuperAdmin(userId) && !(await isAgencyUser(userId))) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col fixed top-0 left-0 h-screen z-30">
        <div className="p-5 border-b border-slate-800">
          <div className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-1">
            Partner
          </div>
          <div className="text-white font-bold text-lg mb-3">
            RingBack<span className="text-blue-400">SMS</span>
          </div>
          <ViewSwitcher />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <PartnerNavLink href="/partner/overview" label="Overview" />
          <PartnerNavLink href="/partner/clients" label="Clients" />
          <PartnerNavLink href="/partner/earnings" label="Earnings" />
          <PartnerNavLink href="/partner/payouts" label="Payouts" />
          <PartnerNavLink href="/partner/settings" label="Settings" />
        </nav>
      </aside>
      <AuthTokenProvider />
      <main className="flex-1 ml-56 p-8 min-h-screen">{children}</main>
    </div>
  );
}

function PartnerNavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
    >
      {label}
    </a>
  );
}
