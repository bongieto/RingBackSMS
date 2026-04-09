import type { Metadata } from 'next';

// All pages in this app are authenticated and depend on runtime env vars.
// Force dynamic rendering to prevent pre-render failures at build time.
export const dynamic = 'force-dynamic';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'RingBackSMS — AI SMS for Missed Calls',
  description: 'Auto-respond to missed calls with AI-powered SMS. Never lose a customer again.',
  icons: {
    icon: '/favicon.svg',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'RingBackSMS — AI SMS for Missed Calls',
    description: 'Auto-respond to missed calls with AI-powered SMS. Never lose a customer again.',
    images: [{ url: '/logo.png', width: 1200, height: 630 }],
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <QueryProvider>
            {children}
            <Toaster richColors position="top-right" />
          </QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
