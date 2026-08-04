'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import { Menu, X } from 'lucide-react';

const links = [
  { href: '/#how-it-works', label: 'How It Works' },
  { href: '/#features', label: 'Features' },
  { href: '/industries', label: 'Industries' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen((current) => !current)}
        className="-mr-2 p-2 text-[#171713] hover:text-[#F05A37]"
        aria-label="Toggle menu"
        aria-expanded={open}
        aria-controls="marketing-mobile-menu"
      >
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {open && (
        <div id="marketing-mobile-menu" className="absolute left-0 right-0 top-[68px] z-50 border-b-2 border-[#171713] bg-[#F6F0E4] shadow-[0_8px_0_rgba(23,23,19,.18)]">
          <div className="px-4 py-3 space-y-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block border-b border-[#171713]/20 px-3 py-3 text-sm font-black text-[#171713] transition-colors hover:bg-[#DCE7A3]"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 space-y-2 border-t-2 border-[#171713] pt-3">
              <SignedOut>
                <Link
                  href="/sign-in"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2.5 text-sm font-black text-[#171713] transition-colors hover:text-[#F05A37]"
                >
                  Sign In
                </Link>
                <Link
                  href="/sign-up"
                  onClick={() => setOpen(false)}
                  className="block border-2 border-[#171713] bg-[#F05A37] px-3 py-2.5 text-center text-sm font-black text-[#171713] shadow-[3px_3px_0_#171713]"
                >
                  Start Free
                </Link>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="block border-2 border-[#171713] bg-[#F05A37] px-3 py-2.5 text-center text-sm font-black text-[#171713] shadow-[3px_3px_0_#171713]"
                >
                  Dashboard
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
