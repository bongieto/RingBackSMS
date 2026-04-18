'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Minimal, accessible tab primitive. No external deps.
 * Usage:
 *   <Tabs value={active} onChange={setActive}>
 *     <TabList>
 *       <TabTrigger value="menus">Menus</TabTrigger>
 *       ...
 *     </TabList>
 *     <TabPanel value="menus">...</TabPanel>
 *   </Tabs>
 */

interface TabsContext {
  value: string;
  onChange: (value: string) => void;
}

const TabsCtx = React.createContext<TabsContext | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsCtx);
  if (!ctx) throw new Error('Tabs.* must be used inside <Tabs>');
  return ctx;
}

export function Tabs({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsCtx.Provider value={{ value, onChange }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="tablist" className={cn('flex items-center gap-6 border-b', className)}>
      {children}
    </div>
  );
}

export function TabTrigger({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const { value: active, onChange } = useTabs();
  const selected = active === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onChange(value)}
      className={cn(
        'px-1 pb-2 text-sm font-medium transition-colors border-b-2 -mb-[1px]',
        selected
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function TabPanel({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { value: active } = useTabs();
  if (active !== value) return null;
  return (
    <div role="tabpanel" className={cn('mt-6', className)}>
      {children}
    </div>
  );
}
