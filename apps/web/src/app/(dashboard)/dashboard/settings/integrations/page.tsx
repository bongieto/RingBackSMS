'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { posApi } from '@/lib/api';
import {
  CheckCircle, XCircle, RefreshCw, ArrowUpDown, Link2, Unlink,
  ShoppingBag, Store, UtensilsCrossed, Lock, ArrowRight, Settings2,
  Download, Upload
} from 'lucide-react';

interface ProviderStatus {
  provider: string;
  displayName: string;
  authType: 'oauth' | 'apikey';
  connected: boolean;
  merchantId: string | null;
  locationId: string | null;
  planGated: boolean;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  square: <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center text-white font-bold text-lg">S</div>,
  clover: <div className="h-10 w-10 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-lg">C</div>,
  toast: <div className="h-10 w-10 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-lg">T</div>,
  shopify: <div className="h-10 w-10 rounded-lg bg-[#96bf48] flex items-center justify-center text-white font-bold text-lg">S</div>,
};

const PROVIDER_COLORS: Record<string, string> = {
  square: 'bg-black',
  clover: 'bg-green-600',
  toast: 'bg-orange-500',
  shopify: 'bg-[#96bf48]',
};

export default function IntegrationsPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Show toast on OAuth redirect
  useEffect(() => {
    if (searchParams.get('pos_connected') === 'true') {
      const provider = searchParams.get('provider') || 'POS';
      toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} connected successfully!`);
    }
    if (searchParams.get('pos_error')) {
      toast.error(`Failed to connect: ${searchParams.get('pos_error')}`);
    }
  }, [searchParams]);

  const { data: providers, isLoading } = useQuery({
    queryKey: ['pos-providers', tenantId],
    queryFn: () => posApi.listProviders(tenantId!),
    enabled: !!tenantId,
  });

  if (isLoading) {
    return (
      <div>
        <Header title="Integrations" description="Connect your POS system to sync menus and manage orders" />
        <div className="space-y-4 max-w-3xl">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-10 w-full bg-muted rounded" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Integrations" description="Connect your POS system to sync menus and manage orders" />

      <div className="space-y-4 max-w-3xl">
        {/* Info banner */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Store className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Connect your POS system</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Link your point-of-sale provider to automatically sync your menu catalog and enable order placement through SMS conversations.
                  Only one POS provider can be active at a time.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {providers?.map((p: ProviderStatus) => (
          <PosProviderCard
            key={p.provider}
            provider={p}
            tenantId={tenantId!}
            queryClient={queryClient}
          />
        ))}
      </div>
    </div>
  );
}

function PosProviderCard({ provider, tenantId, queryClient }: {
  provider: ProviderStatus;
  tenantId: string;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [showConfig, setShowConfig] = useState(false);
  const [apiCredentials, setApiCredentials] = useState<Record<string, string>>({});

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pos-providers', tenantId] });

  const connectMutation = useMutation({
    mutationFn: () => posApi.getConnectUrl(tenantId, provider.provider),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to start connection'),
  });

  const configureMutation = useMutation({
    mutationFn: (creds: Record<string, string>) => posApi.configure(tenantId, provider.provider, creds),
    onSuccess: () => { invalidate(); toast.success(`${provider.displayName} configured!`); setShowConfig(false); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Configuration failed'),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => posApi.disconnect(tenantId, provider.provider),
    onSuccess: () => { invalidate(); toast.success(`${provider.displayName} disconnected`); },
    onError: () => toast.error('Failed to disconnect'),
  });

  const syncMutation = useMutation({
    mutationFn: () => posApi.syncCatalog(tenantId, provider.provider),
    onSuccess: (data) => toast.success(`Synced ${data?.synced ?? 0} items from ${provider.displayName}`),
    onError: () => toast.error('Sync failed'),
  });

  const pushMutation = useMutation({
    mutationFn: () => posApi.pushCatalog(tenantId, provider.provider),
    onSuccess: (data) => toast.success(`Pushed ${data?.pushed ?? 0} items to ${provider.displayName}`),
    onError: () => toast.error('Push failed'),
  });

  if (provider.planGated) {
    return (
      <Card className="opacity-60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {PROVIDER_ICONS[provider.provider]}
              <div>
                <CardTitle className="text-base">{provider.displayName}</CardTitle>
                <CardDescription>POS integration requires Growth plan or above</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="gap-1">
              <Lock className="h-3 w-3" /> Upgrade Required
            </Badge>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {PROVIDER_ICONS[provider.provider]}
            <div>
              <CardTitle className="text-base">{provider.displayName}</CardTitle>
              <CardDescription>
                {provider.connected
                  ? `Connected · Merchant: ${provider.merchantId}`
                  : provider.authType === 'oauth'
                    ? 'Click connect to authorize via OAuth'
                    : 'Enter your API credentials to connect'
                }
              </CardDescription>
            </div>
          </div>
          <Badge variant={provider.connected ? 'success' : 'secondary'}>
            {provider.connected ? (
              <><CheckCircle className="h-3 w-3 mr-1" /> Connected</>
            ) : (
              <><XCircle className="h-3 w-3 mr-1" /> Not connected</>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {provider.connected ? (
          <>
            {/* Connected state - show sync actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="bg-muted/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Download className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Pull Menu from POS</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Import your menu items from {provider.displayName} into RingBackSMS
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                    {syncMutation.isPending ? 'Syncing...' : 'Pull from POS'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Upload className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Push Menu to POS</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Push your RingBackSMS menu items to {provider.displayName}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => pushMutation.mutate()}
                    disabled={pushMutation.isPending}
                  >
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    {pushMutation.isPending ? 'Pushing...' : 'Push to POS'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Order placement info */}
            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">
                    Order Placement Active
                  </span>
                </div>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  Orders placed via SMS conversations will be automatically sent to {provider.displayName}.
                  Menu items synced from your POS are available for customers to order.
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm(`Disconnect ${provider.displayName}? This will stop menu sync and order placement.`)) {
                    disconnectMutation.mutate();
                  }
                }}
                disabled={disconnectMutation.isPending}
              >
                <Unlink className="h-4 w-4 mr-2" />
                {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Not connected state */}
            {provider.authType === 'oauth' && !showConfig ? (
              <div className="flex items-center gap-3">
                {provider.provider === 'shopify' ? (
                  <Button onClick={() => setShowConfig(true)}>
                    <Settings2 className="h-4 w-4 mr-2" />
                    Configure & Connect
                  </Button>
                ) : (
                  <Button
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    {connectMutation.isPending ? 'Connecting...' : `Connect ${provider.displayName}`}
                  </Button>
                )}
              </div>
            ) : provider.authType === 'apikey' || showConfig ? (
              <ApiKeyConfigForm
                provider={provider}
                credentials={apiCredentials}
                setCredentials={setApiCredentials}
                onSubmit={() => configureMutation.mutate(apiCredentials)}
                isPending={configureMutation.isPending}
                onCancel={() => setShowConfig(false)}
              />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ApiKeyConfigForm({ provider, credentials, setCredentials, onSubmit, isPending, onCancel }: {
  provider: ProviderStatus;
  credentials: Record<string, string>;
  setCredentials: (creds: Record<string, string>) => void;
  onSubmit: () => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const fields: Record<string, { label: string; placeholder: string; fields: Array<{ key: string; label: string; placeholder: string; type?: string }> }> = {
    toast: {
      label: 'Toast API Credentials',
      placeholder: '',
      fields: [
        { key: 'clientId', label: 'Client ID', placeholder: 'Your Toast client ID' },
        { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Toast client secret', type: 'password' },
        { key: 'restaurantGuid', label: 'Restaurant GUID', placeholder: 'Your Toast restaurant GUID' },
      ],
    },
    shopify: {
      label: 'Shopify Store',
      placeholder: '',
      fields: [
        { key: 'shopDomain', label: 'Store Domain', placeholder: 'your-store.myshopify.com' },
      ],
    },
  };

  const config = fields[provider.provider] || {
    label: 'API Credentials',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'Enter your API key' },
    ],
  };

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
      <h4 className="text-sm font-medium">{config.label}</h4>
      {config.fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label className="text-xs">{field.label}</Label>
          <Input
            type={field.type || 'text'}
            placeholder={field.placeholder}
            value={credentials[field.key] || ''}
            onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
          />
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <Button onClick={onSubmit} disabled={isPending} size="sm">
          <ArrowRight className="h-4 w-4 mr-2" />
          {isPending ? 'Connecting...' : 'Connect'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
