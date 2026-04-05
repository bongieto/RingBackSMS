import { Sidebar } from '@/components/layout/Sidebar';
import { AuthTokenProvider } from '@/components/providers/AuthTokenProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AuthTokenProvider />
      <Sidebar />
      <main className="flex-1 ml-64 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
