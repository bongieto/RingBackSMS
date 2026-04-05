'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { squareApi, tenantApi } from '@/lib/api';
import { CheckCircle, XCircle, RefreshCw, ArrowUpDown } from 'lucide-react';

export default function IntegrationsPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const queryClient = useQueryClient();

  const { data: tenant } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantApi.getMe(),
    enabled: !!tenantId,
  });

  const isSquareConnected = !!tenant?.squareMerchantId;

  const connectMutation = useMutation({
    mutationFn: () => squareApi.getConnectUrl(tenantId!),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: () => toast.error('Failed to start Square OAuth'),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => squareApi.disconnect(tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
      toast.success('Square disconnected');
    },
    onError: () => toast.error('Failed to disconnect Square'),
  });

  const syncMutation = useMutation({
    mutationFn: () => squareApi.syncCatalog(tenantId!),
    onSuccess: (data) => toast.success(`Synced ${data?.synced ?? 0} items from Square`),
    onError: () => toast.error('Sync failed'),
  });

  const pushMutation = useMutation({
    mutationFn: () => squareApi.pushCatalog(tenantId!),
    onSuccess: (data) => toast.success(`Pushed ${data?.pushed ?? 0} items to Square`),
    onError: () => toast.error('Push failed'),
  });

  return (
    <div>
      <Header title="Integrations" description="Connect your tools to RingBack" />

      {/* Square */}
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center text-white font-bold text-lg">S</div>
              <div>
                <CardTitle>Square POS</CardTitle>
                <CardDescription>Sync your menu catalog and create orders in Square</CardDescription>
              </div>
            </div>
            <Badge variant={isSquareConnected ? 'success' : 'secondary'}>
              {isSquareConnected ? (
                <><CheckCircle className="h-3 w-3 mr-1" /> Connected</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> Not connected</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSquareConnected ? (
            <>
              <p className="text-sm text-muted-foreground">
                Merchant ID: <span className="font-mono">{tenant?.squareMerchantId}</span>
              </p>
              <div className="flex gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                  Pull from Square
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pushMutation.mutate()}
                  disabled={pushMutation.isPending}
                >
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  Push to Square
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending ? 'Connecting...' : 'Connect Square'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
