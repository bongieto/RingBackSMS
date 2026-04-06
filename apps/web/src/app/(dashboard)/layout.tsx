import { Sidebar } from '@/components/layout/Sidebar';
import { AuthTokenProvider } from '@/components/providers/AuthTokenProvider';
import { TenantProvider } from '@/components/providers/TenantProvider';
import { GlobalSearch } from '@/components/dashboard/GlobalSearch';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AuthTokenProvider />
      <TenantProvider>
        <Sidebar />
        <main className="flex-1 ml-64 overflow-y-auto">
          <div className="sticky top-0 z-30 bg-gray-50/80 backdrop-blur-sm border-b px-8 py-3 flex justify-end">
            <GlobalSearch />
          </div>
          <div className="p-8">
            {children}
          </div>
        </main>
      </TenantProvider>
    </div>
  );
}
