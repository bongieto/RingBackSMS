'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Clock,
  X as XIcon,
  Voicemail as VoicemailIcon,
  MessageSquare,
  ShoppingBag,
  Calendar,
  Phone,
  ListChecks,
  AlertCircle,
} from 'lucide-react';
import { taskApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CompleteTaskModal, shouldSkipCompleteConfirm } from './CompleteTaskModal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  source: string;
  priority: 'URGENT' | 'HIGH' | 'NORMAL';
  status: string;
  callerPhone?: string | null;
  createdAt: string;
  snoozedUntil?: string | null;
}

const SOURCE_ICONS: Record<string, typeof VoicemailIcon> = {
  VOICEMAIL: VoicemailIcon,
  CONVERSATION: MessageSquare,
  ORDER: ShoppingBag,
  MEETING: Calendar,
  RAPID_REDIAL: Phone,
  MANUAL: ListChecks,
};

const PRIORITY_DOT: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-amber-500',
  NORMAL: 'bg-slate-300',
};

export function TaskList({ tasks, compact = false }: { tasks: TaskItem[]; compact?: boolean }) {
  const queryClient = useQueryClient();
  const [pendingComplete, setPendingComplete] = useState<TaskItem | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['tasks-count'] });
  };

  const completeMutation = useMutation({
    mutationFn: (id: string) => taskApi.complete(id),
    onSuccess: () => {
      invalidate();
      toast.success('Task completed');
    },
    onError: () => toast.error('Failed to complete task'),
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, opt }: { id: string; opt: '1h' | 'tomorrow' | 'next_week' }) =>
      taskApi.snooze(id, opt),
    onSuccess: () => {
      invalidate();
      toast.success('Task snoozed');
    },
    onError: () => toast.error('Failed to snooze task'),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => taskApi.dismiss(id),
    onSuccess: () => {
      invalidate();
      toast.success('Task dismissed');
    },
    onError: () => toast.error('Failed to dismiss task'),
  });

  const requestComplete = (task: TaskItem) => {
    if (shouldSkipCompleteConfirm()) {
      completeMutation.mutate(task.id);
    } else {
      setPendingComplete(task);
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="text-center py-10 text-slate-500">
        <ListChecks className="h-10 w-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">All caught up. Nice.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {tasks.map((task) => {
          const Icon = SOURCE_ICONS[task.source] ?? ListChecks;
          return (
            <li key={task.id} className="py-3 flex items-start gap-3">
              <span className={cn('w-2 h-2 rounded-full mt-2 shrink-0', PRIORITY_DOT[task.priority])} />
              <Icon className="h-4 w-4 text-slate-500 mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                {!compact && task.description && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                  {task.callerPhone && <span>{task.callerPhone}</span>}
                  <span>· {new Date(task.createdAt).toLocaleString()}</span>
                  {task.priority === 'URGENT' && (
                    <span className="inline-flex items-center gap-0.5 text-red-600 font-semibold">
                      <AlertCircle className="h-3 w-3" /> URGENT
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => requestComplete(task)}
                  disabled={completeMutation.isPending}
                  title="Complete"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                {!compact && (
                  <>
                    <select
                      className="text-xs h-8 rounded-md border border-input bg-background px-2"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value as '1h' | 'tomorrow' | 'next_week' | '';
                        if (!v) return;
                        snoozeMutation.mutate({ id: task.id, opt: v });
                        e.currentTarget.value = '';
                      }}
                    >
                      <option value="">Snooze…</option>
                      <option value="1h">1 hour</option>
                      <option value="tomorrow">Tomorrow 9am</option>
                      <option value="next_week">Next Mon 9am</option>
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismissMutation.mutate(task.id)}
                      title="Dismiss without resolving"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <CompleteTaskModal
        task={pendingComplete}
        onCancel={() => setPendingComplete(null)}
        onConfirm={() => {
          if (pendingComplete) completeMutation.mutate(pendingComplete.id);
          setPendingComplete(null);
        }}
      />
    </>
  );
}
