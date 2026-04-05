'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';
import {
  Users, MessageSquare, ShoppingBag, Phone, BarChart3,
  TrendingUp, Activity, UserCheck,
} from 'lucide-react';

interface AdminStats {
  tenants: { total: number; active: number; newLast30Days: number };
  conversations: { total: number; active: number };
  orders: number;
  contacts: number;
  meetings: number;
  sms: { sentLast30Days: number };
  plans: Record<string, number>;
}

const PLAN_COLORS: Record<string, string> = {
  STARTER:    'bg-slate-600',
  GROWTH:     'bg-blue-600',
  SCALE:      'bg-purple-600',
  ENTERPRISE: 'bg-yellow-500',
};

export default function AdminOverviewPage() {
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-8">Platform Overview</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="bg-slate-900 border-slate-800 animate-pulse h-28" />
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Tenants', value: stats?.tenants.total ?? 0, sub: `${stats?.tenants.active ?? 0} active`, icon: Users, color: 'text-blue-400' },
    { label: 'New (30d)', value: stats?.tenants.newLast30Days ?? 0, sub: 'new sign-ups', icon: TrendingUp, color: 'text-green-400' },
    { label: 'Conversations', value: stats?.conversations.total ?? 0, sub: `${stats?.conversations.active ?? 0} active`, icon: MessageSquare, color: 'text-purple-400' },
    { label: 'SMS Sent (30d)', value: stats?.sms.sentLast30Days ?? 0, sub: 'last 30 days', icon: Phone, color: 'text-blue-400' },
    { label: 'Total Orders', value: stats?.orders ?? 0, sub: 'all time', icon: ShoppingBag, color: 'text-orange-400' },
    { label: 'Contacts', value: stats?.contacts ?? 0, sub: 'in all CRMs', icon: UserCheck, color: 'text-pink-400' },
    { label: 'Meetings', value: stats?.meetings ?? 0, sub: 'all time', icon: Activity, color: 'text-yellow-400' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <p className="text-slate-400 text-sm mt-1">Real-time metrics across all RingBackSMS tenants</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((s) => (
          <Card key={s.label} className="bg-slate-900 border-slate-800">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">{s.label}</p>
                  <p className="text-3xl font-bold text-white mt-1">{s.value.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-1">{s.sub}</p>
                </div>
                <s.icon className={`h-5 w-5 ${s.color} opacity-70`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan Breakdown */}
      <Card className="bg-slate-900 border-slate-800 max-w-lg">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-slate-400" /> Plan Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.plans && Object.keys(stats.plans).length === 0 ? (
            <p className="text-slate-500 text-sm">No tenants yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats?.plans ?? {}).map(([plan, count]) => {
                const total = stats?.tenants.total || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={plan}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300 font-medium">{plan}</span>
                      <span className="text-slate-400">{count} tenants ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${PLAN_COLORS[plan] ?? 'bg-slate-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
