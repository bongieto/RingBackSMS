import { Sidebar, MobileHeader } from '@/components/layout/Sidebar';
import { AuthTokenProvider } from '@/components/providers/AuthTokenProvider';
import { TenantProvider } from '@/components/providers/TenantProvider';
import { GlobalSearch } from '@/components/dashboard/GlobalSearch';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AuthTokenProvider />
      <TenantProvider>
        <Sidebar />
        <MobileHeader />
        <main className="flex-1 lg:ml-64 overflow-y-auto pt-14 lg:pt-0">
          <div className="sticky top-0 z-20 bg-gray-50/80 backdrop-blur-sm border-b px-4 lg:px-8 py-3 flex justify-end">
            <GlobalSearch />
          </div>
          <div className="p-4 lg:p-8">
            {children}
          </div>
        </main>
      </TenantProvider>
    </div>
  );
}
