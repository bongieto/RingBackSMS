'use client';

import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { useTenantId } from '@/components/providers/TenantProvider';
import { webApi } from '@/lib/api';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  order: { id: string; orderNumber: string; customerName: string | null; total: number | string; createdAt: string } | null;
}

interface ReviewData {
  totals: { count: number; avg: number; distribution: Array<{ rating: number; count: number }> };
  rows: Review[];
}

function Stars({ n }: { n: number }) {
  return (
    <div className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= n ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`}
        />
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const { tenantId } = useTenantId();
  const { data, isLoading } = useQuery<ReviewData>({
    queryKey: ['reviews', tenantId],
    queryFn: () => webApi.get('/reviews', { params: { tenantId } }).then((r) => r.data.data),
    enabled: !!tenantId,
  });

  return (
    <div>
      <Header title="Reviews" description="Customer ratings after pickup" />
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : !data || data.totals.count === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Star className="h-10 w-10 mx-auto text-muted-foreground opacity-30 mb-3" />
            <p className="font-medium text-slate-700">No reviews yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              When an order is marked Picked Up, we text the customer 2 hours later asking them to rate 1-5.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-6">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Average</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{data.totals.avg.toFixed(1)}</span>
                  <Stars n={Math.round(data.totals.avg)} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{data.totals.count} rating{data.totals.count === 1 ? '' : 's'}</p>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardContent className="p-6 space-y-1.5">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const row = data.totals.distribution.find((d) => d.rating === rating);
                  const count = row?.count ?? 0;
                  const pct = data.totals.count ? (count / data.totals.count) * 100 : 0;
                  return (
                    <div key={rating} className="flex items-center gap-3 text-sm">
                      <span className="w-4 text-right">{rating}</span>
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            {data.rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Stars n={r.rating} />
                        {r.order && (
                          <span className="text-xs text-muted-foreground">
                            #{r.order.orderNumber}{r.order.customerName ? ` · ${r.order.customerName}` : ''}
                          </span>
                        )}
                      </div>
                      {r.comment && (
                        <p className="mt-1 text-sm text-slate-700">{r.comment}</p>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
