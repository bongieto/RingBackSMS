'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';
import { MessageSquare, ShoppingBag, Users, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminActivityPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: () => api.get('/admin/activity').then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  const fmt = (date: string) => new Date(date).toLocaleString();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Feed</h1>
          <p className="text-slate-400 text-sm mt-1">Live platform activity — auto-refreshes every 30s</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="border-slate-700 text-slate-400 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* New tenants */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" /> New Tenants
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-slate-500 text-sm">Loading...</p>
            ) : data?.recentTenants?.length === 0 ? (
              <p className="text-slate-500 text-sm">No recent sign-ups</p>
            ) : (
              <div className="space-y-2">
                {data?.recentTenants?.map((t: any) => (
                  <div key={t.id} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                    <div>
                      <span className="text-slate-200 text-sm font-medium">{t.name}</span>
                      <span className="ml-2 text-xs text-slate-500">{t.businessType}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">{t.plan}</span>
                      <p className="text-xs text-slate-600">{fmt(t.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent conversations */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-400" /> Recent Conversations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-slate-500 text-sm">Loading...</p>
            ) : data?.recentConversations?.length === 0 ? (
              <p className="text-slate-500 text-sm">No recent conversations</p>
            ) : (
              <div className="space-y-2">
                {data?.recentConversations?.slice(0, 10).map((c: any) => (
                  <div key={c.id} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                    <div>
                      <span className="text-slate-300 text-xs font-mono">{c.callerPhone}</span>
                      <span className="ml-2 text-xs text-slate-500">{c.tenant?.name}</span>
                    </div>
                    <span className="text-xs text-slate-600">{fmt(c.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent orders */}
        <Card className="bg-slate-900 border-slate-800 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-orange-400" /> Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-slate-500 text-sm">Loading...</p>
            ) : data?.recentOrders?.length === 0 ? (
              <p className="text-slate-500 text-sm">No recent orders</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-800">
                      <th className="pb-2 pr-4">Order #</th>
                      <th className="pb-2 pr-4">Tenant</th>
                      <th className="pb-2 pr-4 text-right">Total</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.recentOrders?.map((o: any) => (
                      <tr key={o.id} className="border-b border-slate-800 last:border-0">
                        <td className="py-2 pr-4 font-mono text-slate-300 text-xs">{o.orderNumber}</td>
                        <td className="py-2 pr-4 text-slate-400 text-xs">{o.tenant?.name}</td>
                        <td className="py-2 pr-4 text-right text-slate-300">${Number(o.total).toFixed(2)}</td>
                        <td className="py-2 pr-4 text-xs text-slate-400">{o.status}</td>
                        <td className="py-2 text-xs text-slate-500">{fmt(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
