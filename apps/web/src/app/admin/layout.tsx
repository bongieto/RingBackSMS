import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AuthTokenProvider } from '@/components/providers/AuthTokenProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ViewSwitcher } from '@/components/layout/ViewSwitcher';
import { AdminNavigation } from '@/components/admin/AdminNavigation';
import { Logo } from '@/components/Logo';
import { Toaster } from 'sonner';

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
    <QueryProvider>
      <div className="admin-surface flex min-h-screen bg-[#F6F0E4] text-[#171713]">
        {/* Admin Sidebar */}
        <aside className="admin-sidebar fixed left-0 top-0 z-30 hidden h-screen w-64 flex-col border-r-2 border-[#080806] bg-[#171713] text-[#F6F0E4] lg:flex">
          <div className="border-b border-white/15 p-5">
            <div className="mb-4 inline-flex border border-[#F05A37]/60 bg-[#F05A37]/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#F05A37]">
              Platform control
            </div>
            <div className="mb-4">
              <Logo size="md" variant="dark" />
            </div>
            <ViewSwitcher />
          </div>
          <AdminNavigation className="flex-1 overflow-y-auto p-4" />
          <div className="border-t border-white/15 p-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#77776F]">
            RingBackSMS operations
          </div>
        </aside>

        {/* Compact navigation for phones and tablets */}
        <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b-2 border-[#171713] bg-[#F6F0E4]/95 px-4 backdrop-blur lg:hidden">
          <Logo size="sm" variant="light" />
          <details className="group relative">
            <summary className="cursor-pointer list-none border-2 border-[#171713] bg-[#F05A37] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] shadow-[3px_3px_0_#171713]">
              Menu
            </summary>
            <div className="absolute right-0 top-full mt-3 w-72 border-2 border-[#171713] bg-[#171713] p-3 shadow-[6px_6px_0_#F05A37]">
              <AdminNavigation />
            </div>
          </details>
        </header>

        <AuthTokenProvider />
        <main className="admin-content min-h-screen min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-6 lg:ml-64 lg:p-10">
          {children}
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </QueryProvider>
  );
}
