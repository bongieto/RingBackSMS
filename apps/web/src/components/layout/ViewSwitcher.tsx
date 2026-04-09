'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Handshake, Shield, Grid3x3, Check } from 'lucide-react';
import api from '@/lib/api';

type Scope = 'dashboard' | 'partner' | 'admin';

interface Scopes {
  isAgency: boolean;
  isSuperAdmin: boolean;
}

const VIEWS: Array<{
  scope: Scope;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  description: string;
}> = [
  {
    scope: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Your tenant workspace',
  },
  {
    scope: 'partner',
    label: 'Partner',
    href: '/partner/overview',
    icon: Handshake,
    description: 'Agency portfolio & earnings',
  },
  {
    scope: 'admin',
    label: 'Platform Admin',
    href: '/admin',
    icon: Shield,
    description: 'Manage every tenant',
  },
];

export function ViewSwitcher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery<Scopes>({
    queryKey: ['me-scopes'],
    queryFn: () => api.get('/me/scopes').then((r) => r.data.data),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const activeScope: Scope = pathname.startsWith('/admin')
    ? 'admin'
    : pathname.startsWith('/partner')
      ? 'partner'
      : 'dashboard';

  const visible = VIEWS.filter((v) => {
    if (v.scope === 'dashboard') return true;
    if (v.scope === 'partner') return Boolean(data?.isAgency || data?.isSuperAdmin);
    if (v.scope === 'admin') return Boolean(data?.isSuperAdmin);
    return false;
  });

  // If only dashboard is available, render nothing (avoid a dead button)
  if (visible.length <= 1) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch view"
        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 text-xs font-medium border border-slate-700"
      >
        <Grid3x3 className="h-3.5 w-3.5" />
        <span>Switch view</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
            Switch view
          </div>
          <div className="p-1">
            {visible.map((v) => {
              const Icon = v.icon;
              const active = v.scope === activeScope;
              return (
                <Link
                  key={v.scope}
                  href={v.href}
                  className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-blue-600/20 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 mt-0.5 opacity-80" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {v.label}
                      {active && <Check className="h-3 w-3 text-blue-400" />}
                    </div>
                    <div className="text-xs text-slate-500">{v.description}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
