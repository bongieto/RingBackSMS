import { Sidebar } from '@/components/layout/Sidebar';
import { AuthTokenProvider } from '@/components/providers/AuthTokenProvider';
import { TenantProvider } from '@/components/providers/TenantProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AuthTokenProvider />
      <TenantProvider>
        <Sidebar />
        <main className="flex-1 ml-64 p-8 overflow-y-auto">
          {children}
        </main>
      </TenantProvider>
    </div>
  );
}
