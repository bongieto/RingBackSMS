'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ListChecks, ArrowRight, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { taskApi } from '@/lib/api';
import { TaskList, type TaskItem } from '@/components/tasks/TaskList';

export function ActionItemsCard() {
  const { data: tasks } = useQuery<TaskItem[]>({
    queryKey: ['tasks', 'OPEN'],
    queryFn: () => taskApi.list('OPEN'),
    refetchInterval: 30_000,
  });

  if (!tasks || tasks.length === 0) return null;
  const top = tasks.slice(0, 5);
  const urgentCount = tasks.filter((t) => t.priority === 'URGENT').length;

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-5 w-5 text-blue-600" />
            Action items ({tasks.length})
            {urgentCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5">
                <AlertCircle className="h-3 w-3" />
                {urgentCount} urgent
              </span>
            )}
          </CardTitle>
          {tasks.length > 5 && (
            <Link
              href="/dashboard/tasks"
              className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <TaskList tasks={top} compact />
      </CardContent>
    </Card>
  );
}
