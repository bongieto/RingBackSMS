import { QueryProvider } from '@/components/providers/QueryProvider';
import { Toaster } from 'sonner';

export default function BecomePartnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      {children}
      <Toaster richColors position="top-right" />
    </QueryProvider>
  );
}

