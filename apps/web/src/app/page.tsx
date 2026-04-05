import Link from 'next/link';
import { SignedIn, SignedOut } from '@clerk/nextjs';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-8 text-white">
      <div className="max-w-2xl text-center space-y-8">
        {/* Logo */}
        <div className="space-y-2">
          <h1 className="text-6xl font-extrabold tracking-tight">
            RingBack
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              SMS
            </span>
          </h1>
          <p className="text-xl text-slate-300">
            AI-Powered SMS Auto-Response for Missed Calls
          </p>
        </div>

        {/* Value props */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            { icon: '📱', title: 'Instant Reply', desc: 'Auto-SMS every missed call in seconds' },
            { icon: '🤖', title: 'AI Powered', desc: 'Claude handles orders, meetings & questions' },
            { icon: '📊', title: 'Multi-Tenant', desc: 'One platform, unlimited businesses' },
          ].map((item) => (
            <div key={item.title} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="font-semibold">{item.title}</div>
              <div className="text-slate-400 text-xs mt-1">{item.desc}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <SignedOut>
            <Link
              href="/sign-up"
              className="px-8 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg font-semibold transition-colors"
            >
              Get Started Free
            </Link>
            <Link
              href="/sign-in"
              className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-lg font-semibold transition-colors border border-white/20"
            >
              Sign In
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="px-8 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg font-semibold transition-colors"
            >
              Go to Dashboard →
            </Link>
          </SignedIn>
        </div>
      </div>
    </main>
  );
}
