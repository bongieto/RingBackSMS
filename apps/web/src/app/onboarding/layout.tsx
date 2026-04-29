import { QueryProvider } from '@/components/providers/QueryProvider';
import { Toaster } from 'sonner';

export const dynamic = 'force-dynamic';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      {children}
      <Toaster richColors position="top-right" />
    </QueryProvider>
  );
}
