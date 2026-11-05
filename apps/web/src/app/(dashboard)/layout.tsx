import { Sidebar, MobileHeader } from '@/components/layout/Sidebar';
import { AuthTokenProvider } from '@/components/providers/AuthTokenProvider';
import { TenantProvider } from '@/components/providers/TenantProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { GlobalSearch } from '@/components/dashboard/GlobalSearch';
import { Toaster } from 'sonner';

export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <div className="flex min-h-screen min-w-0 bg-gray-50">
        <AuthTokenProvider />
        <TenantProvider>
          <Sidebar />
          <MobileHeader />
          <main className="min-w-0 flex-1 overflow-y-auto pt-14 lg:ml-64 lg:pt-0">
            <div className="sticky top-14 z-30 flex min-w-0 justify-end border-b bg-gray-50/90 px-3 py-3 backdrop-blur-sm sm:px-5 lg:top-0 lg:px-8">
              <GlobalSearch />
            </div>
            <div className="min-w-0 max-w-full p-3 sm:p-5 lg:p-8">
              {children}
            </div>
          </main>
        </TenantProvider>
      </div>
      <Toaster richColors position="top-right" />
    </QueryProvider>
  );
}
