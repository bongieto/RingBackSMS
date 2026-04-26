'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Header } from '@/components/layout/Header';
import { TaskList, isCallbackTask, type TaskItem } from '@/components/tasks/TaskList';
import { taskApi } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Tab = 'OPEN' | 'SNOOZED' | 'DONE';

export default function TasksPage() {
  const [tab, setTab] = useState<Tab>('OPEN');
  const [callbacksOnly, setCallbacksOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const queryClient = useQueryClient();

  const { data: rawTasks = [], isLoading } = useQuery<TaskItem[]>({
    queryKey: ['tasks', tab],
    queryFn: () => taskApi.list(tab),
    refetchInterval: 30_000,
  });

  const tasks = callbacksOnly ? rawTasks.filter(isCallbackTask) : rawTasks;
  const callbackCount = rawTasks.filter(isCallbackTask).length;

  const dismissAllMutation = useMutation({
    mutationFn: () => taskApi.dismissAll(),
    onSuccess: (data: { dismissed?: number } | null) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-count'] });
      toast.success(`Dismissed ${data?.dismissed ?? 'all'} items`);
    },
    onError: () => toast.error('Failed to dismiss all tasks'),
  });

  const createMutation = useMutation({
    mutationFn: () => taskApi.create({ title: newTitle, description: newDescription || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-count'] });
      setNewTitle('');
      setNewDescription('');
      setShowCreate(false);
      toast.success('Task added');
    },
    onError: () => toast.error('Failed to create task'),
  });

  return (
    <div>
      <Header title="Action Items" description="Everything that needs your attention, in one place." />
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border bg-white p-1">
            {(['OPEN', 'SNOOZED', 'DONE'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-4 py-1.5 text-sm rounded-md transition-colors',
                  tab === t ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {t === 'OPEN' ? 'Open' : t === 'SNOOZED' ? 'Snoozed' : 'Done'}
              </button>
            ))}
          </div>
          {callbackCount > 0 && (
            <button
              onClick={() => setCallbacksOnly((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors',
                callbacksOnly
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50',
              )}
              title="Show only scheduled phone callbacks (customers who asked to be rung at a specific time)"
            >
              📞 Callbacks ({callbackCount})
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tab === 'OPEN' && rawTasks.length > 0 && (
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              disabled={dismissAllMutation.isPending}
              onClick={() => {
                if (confirm(`Dismiss all ${rawTasks.length} open items?`)) {
                  dismissAllMutation.mutate();
                }
              }}
            >
              Dismiss all
            </Button>
          )}
          <Button onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add task
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="mb-4">
          <CardContent className="pt-6 space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Call supplier about cheese delivery"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!newTitle.trim() || createMutation.isPending}
              >
                Add task
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-sm text-slate-500 text-center py-6">Loading…</p>
          ) : (
            <TaskList tasks={tasks} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
