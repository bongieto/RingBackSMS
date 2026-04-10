'use client';

import { Flame, Clock, AlertTriangle, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface KitchenStats {
  totalToday: number;
  cooking: number;
  overdue: number;
  avgPrepMins: number | null;
}

export function KitchenHeader({
  stats,
  soundEnabled,
  onToggleSound,
}: {
  stats: KitchenStats;
  soundEnabled: boolean;
  onToggleSound: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-slate-900 text-white rounded-xl px-4 py-3 mb-4">
      <div className="flex items-center gap-4 sm:gap-6 text-sm overflow-x-auto">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="font-bold text-lg">{stats.cooking}</span>
          <span className="text-slate-400 hidden sm:inline">cooking</span>
        </div>
        {stats.overdue > 0 && (
          <div className="flex items-center gap-1.5 whitespace-nowrap text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-bold">{stats.overdue}</span>
            <span className="hidden sm:inline">overdue</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Clock className="h-4 w-4 text-slate-400" />
          <span>{stats.avgPrepMins != null ? `~${stats.avgPrepMins}m avg` : '--'}</span>
        </div>
        <div className="text-slate-400 whitespace-nowrap hidden sm:block">
          {stats.totalToday} orders today
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-slate-800 shrink-0"
        onClick={onToggleSound}
      >
        {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </Button>
    </div>
  );
}
