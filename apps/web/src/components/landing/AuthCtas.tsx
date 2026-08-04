'use client';

import Link from 'next/link';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import { ArrowRight } from 'lucide-react';

export function DesktopNavAuthLinks() {
  return (
    <>
      <SignedOut>
        <Link href="/sign-in" className="hidden text-sm font-black text-[#171713] transition-colors hover:text-[#F05A37] sm:block">
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="hidden border-2 border-[#171713] bg-[#F05A37] px-4 py-2 text-sm font-black text-[#171713] shadow-[3px_3px_0_#171713] transition-transform hover:-translate-y-0.5 sm:inline-flex"
        >
          Start Free
        </Link>
      </SignedOut>
      <SignedIn>
        <Link
          href="/dashboard"
          className="hidden border-2 border-[#171713] bg-[#F05A37] px-4 py-2 text-sm font-black text-[#171713] shadow-[3px_3px_0_#171713] transition-transform hover:-translate-y-0.5 sm:inline-flex"
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
          className="inline-flex items-center justify-center gap-2 border-2 border-[#171713] bg-[#F05A37] px-6 py-3.5 text-base font-black text-[#171713] shadow-[5px_5px_0_#171713] transition-transform hover:-translate-y-1 sm:px-8 sm:py-4 sm:text-lg"
        >
          Start free
          <ArrowRight className="h-5 w-5" />
        </Link>
        <a
          href="#how-it-works"
          className="inline-flex items-center justify-center gap-2 border-2 border-[#171713] bg-[#FFFBF3] px-6 py-3.5 text-base font-black text-[#171713] transition-colors hover:bg-[#DCE7A3] sm:px-8 sm:py-4 sm:text-lg"
        >
          See how it works
        </a>
      </SignedOut>
      <SignedIn>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 border-2 border-[#171713] bg-[#F05A37] px-6 py-3.5 text-base font-black text-[#171713] shadow-[5px_5px_0_#171713] transition-transform hover:-translate-y-1 sm:px-8 sm:py-4 sm:text-lg"
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
          className="inline-flex items-center justify-center gap-2 border-2 border-[#171713] bg-[#F6F0E4] px-7 py-4 text-base font-black text-[#171713] shadow-[6px_6px_0_#171713] transition-transform hover:-translate-y-1 sm:px-10 sm:text-lg"
        >
          Start free
          <ArrowRight className="h-5 w-5" />
        </Link>
      </SignedOut>
      <SignedIn>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 border-2 border-[#171713] bg-[#F6F0E4] px-7 py-4 text-base font-black text-[#171713] shadow-[6px_6px_0_#171713] transition-transform hover:-translate-y-1 sm:px-10 sm:text-lg"
        >
          Go to Dashboard
          <ArrowRight className="h-5 w-5" />
        </Link>
      </SignedIn>
    </>
  );
}
