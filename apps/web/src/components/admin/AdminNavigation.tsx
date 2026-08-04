'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  Building2,
  ClipboardCheck,
  CreditCard,
  Gauge,
  Network,
  ShieldCheck,
  TestTube2,
  UserRoundCog,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ADMIN_NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: Gauge },
  { href: '/admin/tenants', label: 'Tenants', icon: Building2 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/agencies', label: 'Agencies', icon: Network },
  { href: '/admin/applications', label: 'Applications', icon: ClipboardCheck },
  { href: '/admin/finance', label: 'Finance', icon: CreditCard },
  { href: '/admin/api-status', label: 'API Status', icon: Activity },
  { href: '/admin/activity', label: 'Activity', icon: ShieldCheck },
  { href: '/admin/bot-tester', label: 'Bot Tester', icon: Bot },
  { href: '/admin/replay-evaluator', label: 'Replay Evaluator', icon: TestTube2 },
  { href: '/admin/conversation-reviews', label: 'Convo Reviews', icon: UserRoundCog },
];

export function AdminNavigation({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn('space-y-1', className)} aria-label="Platform administration">
      {ADMIN_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.href === '/admin'
          ? pathname === '/admin'
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all',
              active
                ? 'bg-[#F05A37] text-[#171713] shadow-[3px_3px_0_#080806]'
                : 'text-[#C8C3B7] hover:bg-[#30312B] hover:text-[#F6F0E4]',
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#171713]' : 'text-[#8F8B82] group-hover:text-[#F05A37]')} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
