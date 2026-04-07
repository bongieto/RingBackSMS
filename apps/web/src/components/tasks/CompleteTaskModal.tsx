'use client';

import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'rb_skip_task_complete_confirm';

export function shouldSkipCompleteConfirm(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

interface Task {
  id: string;
  title: string;
  source: string;
}

interface Props {
  task: Task | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const SIDE_EFFECT_COPY: Record<string, string> = {
  VOICEMAIL:
    'This will mark the voicemail as handled and remove it from your voicemail inbox. The recording will not be deleted.',
  CONVERSATION:
    'This will return the conversation to AI mode. The bot will resume responding automatically.',
  ORDER:
    'This will mark the order as CONFIRMED and notify the customer.',
  MEETING:
    'This will mark the meeting request as CONFIRMED.',
  RAPID_REDIAL:
    'This will close out the urgent callback alert.',
  MANUAL: 'This will mark this task as done.',
};

export function CompleteTaskModal({ task, onCancel, onConfirm }: Props) {
  const [dontAsk, setDontAsk] = useState(false);
  if (!task) return null;
  const copy = SIDE_EFFECT_COPY[task.source] ?? 'This will mark the task as done.';

  const handleConfirm = () => {
    if (dontAsk && typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-100 p-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold">Complete this task?</h2>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-slate-700 mb-2 font-medium">{task.title}</p>
        <p className="text-sm text-slate-600 mb-4">{copy}</p>

        <label className="flex items-center gap-2 text-sm text-slate-600 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="rounded"
          />
          Don&apos;t ask me again
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Complete task</Button>
        </div>
      </div>
    </div>
  );
}
