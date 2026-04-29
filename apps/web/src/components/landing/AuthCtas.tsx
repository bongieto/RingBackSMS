'use client';

import Link from 'next/link';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import { ArrowRight } from 'lucide-react';

export function DesktopNavAuthLinks() {
  return (
    <>
      <SignedOut>
        <Link href="/sign-in" className="hidden sm:block text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="hidden sm:inline-flex px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          Start Free
        </Link>
      </SignedOut>
      <SignedIn>
        <Link
          href="/dashboard"
          className="hidden sm:inline-flex px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          Dashboard
        </Link>
      </SignedIn>
    </>
  );
}

export function IndustryNavAuthLinks() {
  return (
    <>
      <SignedOut>
        <Link href="/sign-in" className="hover:text-blue-600">Sign In</Link>
        <Link href="/sign-up" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Start Free</Link>
      </SignedOut>
      <SignedIn>
        <Link href="/dashboard" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Dashboard</Link>
      </SignedIn>
    </>
  );
}

export function HeroAuthCtas() {
  return (
    <>
      <SignedOut>
        <Link
          href="/sign-up"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 sm:px-8 sm:py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/25 text-base sm:text-lg"
        >
          Start Free Today
          <ArrowRight className="h-5 w-5" />
        </Link>
        <a
          href="#how-it-works"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 sm:px-8 sm:py-4 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors border border-slate-200 text-base sm:text-lg"
        >
          See How It Works
        </a>
      </SignedOut>
      <SignedIn>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 sm:px-8 sm:py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/25 text-base sm:text-lg"
        >
          Go to Dashboard
          <ArrowRight className="h-5 w-5" />
        </Link>
      </SignedIn>
    </>
  );
}

export function FinalAuthCta() {
  return (
    <>
      <SignedOut>
        <Link
          href="/sign-up"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 sm:px-10 sm:py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors text-base sm:text-lg shadow-lg"
        >
          Get Started Free
          <ArrowRight className="h-5 w-5" />
        </Link>
      </SignedOut>
      <SignedIn>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 sm:px-10 sm:py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors text-base sm:text-lg shadow-lg"
        >
          Go to Dashboard
          <ArrowRight className="h-5 w-5" />
        </Link>
      </SignedIn>
    </>
  );
}

