'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function Header({ title, description, action }: HeaderProps) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:mb-8">
      <div className="min-w-0">
        <h1 className="break-words text-xl font-bold text-gray-900 lg:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        {action}
        <Button variant="ghost" size="icon" className="ml-auto sm:ml-0" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
