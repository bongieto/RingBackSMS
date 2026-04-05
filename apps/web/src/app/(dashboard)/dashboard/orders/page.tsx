'use client';

import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { ShoppingBag, Clock } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { formatRelativeTime, maskPhone } from '@/lib/utils';

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  PENDING: 'warning',
  CONFIRMED: 'default' as 'outline',
  PREPARING: 'secondary',
  READY: 'success',
  COMPLETED: 'outline',
  CANCELLED: 'destructive',
};

export default function OrdersPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['orders', tenantId],
    queryFn: () => api.get('/conversations', { params: { tenantId, pageSize: 50 } }).then(r => r.data),
    enabled: !!tenantId,
  });

  // In a real app, we'd have a dedicated orders endpoint - using conversations for now
  return (
    <div>
      <Header title="Orders" description="Food orders placed via SMS" />

      <Card>
        <CardContent className="p-12 text-center">
          <ShoppingBag className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground font-medium">Orders will appear here</p>
          <p className="text-sm text-muted-foreground mt-1">
            When customers order via SMS, their orders show up here in real-time
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
