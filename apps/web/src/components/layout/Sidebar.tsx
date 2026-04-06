'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  ShoppingBag,
  Calendar,
  Users,
  BarChart3,
  Settings,
  UtensilsCrossed,
  CreditCard,
  Zap,
  Phone,
  Plug2,
  Briefcase,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserButton, OrganizationSwitcher } from '@clerk/nextjs';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/dashboard/contacts', label: 'Contacts', icon: Users },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/dashboard/meetings', label: 'Meetings', icon: Calendar },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/dashboard/services', label: 'Services', icon: Briefcase },
  { href: '/dashboard/flows', label: 'Flows', icon: Zap },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Plug2 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/help', label: 'Help Center', icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Phone className="h-6 w-6 text-blue-400" />
          <span className="text-xl font-bold">
            RingBack<span className="text-blue-400">SMS</span>
          </span>
        </div>
      </div>

      {/* Org Switcher */}
      <div className="p-4 border-b border-slate-700">
        <OrganizationSwitcher
          appearance={{
            elements: {
              rootBox: 'w-full',
              organizationSwitcherTrigger: 'w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700',
            },
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              {...(item.href.startsWith('/dashboard') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-slate-700">
        <UserButton
          appearance={{
            elements: {
              userButtonBox: 'flex items-center gap-2',
              userButtonOuterIdentifier: 'text-slate-300 text-sm',
            },
          }}
          showName
        />
        <p className="text-[10px] text-slate-600 mt-3 text-center">
          by Agape Technology Solutions
        </p>
      </div>
    </aside>
  );
}
