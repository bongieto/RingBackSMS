'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Link from 'next/link';
import { useTenantId } from '@/components/providers/TenantProvider';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { maskPhone, formatRelativeTime, cn } from '@/lib/utils';
import {
  PhoneIncoming,
  MessageCircle,
  CalendarClock,
  CheckCircle2,
  Trophy,
  XCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';

type Stage = 'new' | 'engaged' | 'booked' | 'confirmed' | 'completed' | 'lost';

interface LeadCard {
  callerPhone: string;
  name: string | null;
  lastTouchAt: string;
  conversationId: string | null;
  meetingId: string | null;
  scheduledAt: string | null;
  summary: string;
}

interface PipelineResponse {
  success: boolean;
  data: {
    stages: Record<Stage, LeadCard[]>;
    counts: Record<Stage, number>;
  };
}

const STAGE_DEFS: Array<{
  key: Stage;
  label: string;
  Icon: typeof PhoneIncoming;
  accent: string;     // border + header bg
  badgeClass: string; // count badge
}> = [
  {
    key: 'new',
    label: 'New leads',
    Icon: PhoneIncoming,
    accent: 'border-blue-200 bg-blue-50/60',
    badgeClass: 'bg-blue-100 text-blue-700',
  },
  {
    key: 'engaged',
    label: 'In conversation',
    Icon: MessageCircle,
    accent: 'border-violet-200 bg-violet-50/60',
    badgeClass: 'bg-violet-100 text-violet-700',
  },
  {
    key: 'booked',
    label: 'Meeting booked',
    Icon: CalendarClock,
    accent: 'border-amber-200 bg-amber-50/60',
    badgeClass: 'bg-amber-100 text-amber-800',
  },
  {
    key: 'confirmed',
    label: 'Confirmed',
    Icon: CheckCircle2,
    accent: 'border-emerald-200 bg-emerald-50/60',
    badgeClass: 'bg-emerald-100 text-emerald-700',
  },
  {
    key: 'completed',
    label: 'Won',
    Icon: Trophy,
    accent: 'border-green-200 bg-green-50/60',
    badgeClass: 'bg-green-100 text-green-700',
  },
  {
    key: 'lost',
    label: 'Lost / cold',
    Icon: XCircle,
    accent: 'border-slate-200 bg-slate-50/60',
    badgeClass: 'bg-slate-100 text-slate-600',
  },
];

export default function PipelinePage() {
  const { tenantId } = useTenantId();

  const { data, isLoading, error } = useQuery<PipelineResponse>({
    queryKey: ['pipeline', tenantId],
    queryFn: async () => {
      const r = await axios.get('/api/pipeline', { params: { tenantId } });
      return r.data;
    },
    enabled: !!tenantId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const stages = data?.data.stages;
  const counts = data?.data.counts;

  return (
    <>
      <Header
        title="Pipeline"
        description="Where every recovered call is in your funnel"
      />
      <div className="p-6">
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Loading pipeline…
          </div>
        )}

        {error && (
          <Card className="p-6 text-sm text-red-700 bg-red-50 border-red-200">
            Failed to load pipeline. Try refreshing.
          </Card>
        )}

        {!isLoading && stages && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            {STAGE_DEFS.map(({ key, label, Icon, accent, badgeClass }) => {
              const cards = stages[key] ?? [];
              const count = counts?.[key] ?? cards.length;
              return (
                <div
                  key={key}
                  className={cn(
                    'rounded-lg border flex flex-col min-h-[200px]',
                    accent,
                  )}
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-inherit">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Icon className="h-4 w-4" />
                      {label}
                    </div>
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', badgeClass)}>
                      {count}
                    </span>
                  </div>
                  <div className="flex-1 p-2 space-y-2">
                    {cards.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6">
                        No leads here
                      </p>
                    ) : (
                      cards.map((card) => <LeadCardView key={`${key}-${card.callerPhone}`} card={card} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function LeadCardView({ card }: { card: LeadCard }) {
  const href = card.conversationId
    ? `/dashboard/conversations/${card.conversationId}`
    : null;

  const inner = (
    <Card className="p-3 hover:shadow-md transition-shadow cursor-pointer bg-white border-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {card.name ?? maskPhone(card.callerPhone)}
          </p>
          {card.name && (
            <p className="text-xs text-slate-500 truncate">{maskPhone(card.callerPhone)}</p>
          )}
        </div>
        {href && <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />}
      </div>
      <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">{card.summary}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          {formatRelativeTime(card.lastTouchAt)}
        </span>
        {card.scheduledAt && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
            {new Date(card.scheduledAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </Badge>
        )}
      </div>
    </Card>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}
