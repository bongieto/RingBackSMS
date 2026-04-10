'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  ShoppingBag,
  Calendar,
  Users,
  BarChart3,
  Settings,
  UtensilsCrossed,
  CreditCard,
  Zap,
  Plug2,
  Briefcase,
  HelpCircle,
  Voicemail,
  MapPin,
  Menu,
  X,
  ChefHat,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserButton, OrganizationSwitcher, useUser } from '@clerk/nextjs';
import { useTenantId } from '@/components/providers/TenantProvider';
import { getProfile } from '@/lib/businessTypeProfile';
import { Logo } from '@/components/Logo';
import { ViewSwitcher } from '@/components/layout/ViewSwitcher';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: 'tasks';
  show?: (nav: ReturnType<typeof getProfile>['nav']) => boolean;
  labelFrom?: (nav: ReturnType<typeof getProfile>['nav']) => string;
};

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/tasks', label: 'Action Items', icon: ListChecks, badgeKey: 'tasks' },
  { href: '/dashboard/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/dashboard/voicemails', label: 'Voicemails', icon: Voicemail },
  { href: '/dashboard/contacts', label: 'Contacts', icon: Users },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag, show: (n) => n.showOrders },
  { href: '/dashboard/kitchen', label: 'Kitchen', icon: ChefHat, show: (n) => n.showOrders },
  { href: '/dashboard/meetings', label: 'Meetings', icon: Calendar, show: (n) => n.showMeetings },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  {
    href: '/dashboard/menu',
    label: 'Menu',
    icon: UtensilsCrossed,
    show: (n) => n.showMenu,
    labelFrom: (n) => n.menuLabel ?? 'Menu',
  },
  { href: '/dashboard/services', label: 'Services', icon: Briefcase, show: (n) => n.showServices },
  { href: '/dashboard/location', label: 'Location', icon: MapPin, show: (n) => !!n.showLocation },
  { href: '/dashboard/flows', label: 'Flows', icon: Zap },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Plug2 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/help', label: 'Help Center', icon: HelpCircle },
];

function useTaskBadge() {
  const { data } = useQuery<{ open: number; urgent: number }>({
    queryKey: ['tasks-count'],
    queryFn: () => axios.get('/api/tasks/count').then((r) => r.data.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  return data ?? { open: 0, urgent: 0 };
}

function useTenantProfile() {
  const { businessType } = useTenantId();
  return getProfile(businessType);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const taskBadge = useTaskBadge();
  const profile = useTenantProfile();
  const visibleItems = navItems.filter((i) => !i.show || i.show(profile.nav));
  const { user } = useUser();
  const isAgency = Boolean((user?.publicMetadata as Record<string, unknown> | undefined)?.isAgency);

  return (
    <>
      {/* Logo + view switcher */}
      <div className="p-6 border-b border-slate-700 space-y-4">
        <Logo size="md" variant="dark" />
        <ViewSwitcher />
      </div>

      {/* Org Switcher */}
      <div className="p-4 border-b border-slate-700">
        <OrganizationSwitcher
          afterCreateOrganizationUrl="/onboarding"
          afterSelectOrganizationUrl="/dashboard"
          skipInvitationScreen={true}
          appearance={{
            elements: {
              rootBox: 'w-full',
              organizationSwitcherTrigger: 'w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700',
              ...(isAgency
                ? {}
                : { organizationSwitcherPopoverActionButton__createOrganization: 'hidden' }),
            },
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const label = item.labelFrom ? item.labelFrom(profile.nav) : item.label;
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              {...(item.href.startsWith('/dashboard') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {('badgeKey' in item) && item.badgeKey === 'tasks' && taskBadge.open > 0 && (
                <span
                  className={cn(
                    'ml-auto inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold min-w-[20px]',
                    taskBadge.urgent > 0
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-blue-500 text-white'
                  )}
                >
                  {taskBadge.open}
                </span>
              )}
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
              userButtonPopoverCard:
                'bg-white text-slate-900 shadow-2xl border border-slate-200 rounded-xl',
              userButtonPopoverMain: 'bg-white',
              userButtonPopoverActions: 'bg-white',
              userButtonPopoverActionButton:
                'text-slate-700 hover:bg-slate-100',
              userButtonPopoverActionButtonText: 'text-slate-700 font-medium',
              userButtonPopoverActionButtonIcon: 'text-slate-500',
              userButtonPopoverFooter: 'bg-slate-50 border-t border-slate-200',
              userPreviewMainIdentifier: 'text-slate-900 font-semibold',
              userPreviewSecondaryIdentifier: 'text-slate-500',
            },
          }}
          showName
        />
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-64 bg-slate-900 text-white flex-col h-screen fixed left-0 top-0 z-30">
      <SidebarContent />
    </aside>
  );
}

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900 text-white h-14 flex items-center justify-between px-4">
        <button onClick={() => setOpen(true)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-800">
          <Menu className="h-6 w-6" />
        </button>
        <Logo size="sm" variant="dark" />
        <div className="w-9" /> {/* Spacer for centering */}
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white flex flex-col transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Close button */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </aside>
    </>
  );
}
