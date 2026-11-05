import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AuthTokenProvider } from '@/components/providers/AuthTokenProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ViewSwitcher } from '@/components/layout/ViewSwitcher';
import { isAgencyUser, isSuperAdmin } from '@/lib/server/agency';
import { Toaster } from 'sonner';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

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
    <QueryProvider>
      <div className="flex min-h-screen min-w-0 bg-slate-950">
        <aside className="fixed left-0 top-0 z-30 hidden h-screen w-56 flex-col border-r border-slate-800 bg-slate-900 md:flex">
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

        <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 backdrop-blur md:hidden">
          <Logo size="sm" variant="dark" />
          <details className="group relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-slate-700 bg-slate-800 px-4 text-sm font-semibold text-white">
              Menu
            </summary>
            <div className="absolute right-0 top-full mt-2 max-h-[calc(100vh-5rem)] w-[calc(100vw-2rem)] max-w-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl">
              <div className="mb-3 border-b border-slate-800 pb-3">
                <ViewSwitcher />
              </div>
              <nav className="space-y-1" aria-label="Partner navigation">
                <PartnerNavLink href="/partner/overview" label="Overview" />
                <PartnerNavLink href="/partner/clients" label="Clients" />
                <PartnerNavLink href="/partner/earnings" label="Earnings" />
                <PartnerNavLink href="/partner/payouts" label="Payouts" />
                <PartnerNavLink href="/partner/settings" label="Settings" />
              </nav>
            </div>
          </details>
        </header>
        <AuthTokenProvider />
        <main className="min-h-screen min-w-0 max-w-full flex-1 px-3 pb-8 pt-24 sm:px-6 md:ml-56 md:p-8">
          {children}
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </QueryProvider>
  );
}

function PartnerNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
    >
      {label}
    </Link>
  );
}
