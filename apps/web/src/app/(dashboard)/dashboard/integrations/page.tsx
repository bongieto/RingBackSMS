'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useTenantId } from '@/components/providers/TenantProvider';
import Link from 'next/link';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { posApi, tenantApi } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import {
  CheckCircle, XCircle, RefreshCw, ArrowUpDown, Link2, Unlink,
  ShoppingBag, Store, UtensilsCrossed, Lock, ArrowRight, Settings2,
  Download, Upload, Clock, AlertTriangle, ChevronRight, Zap, ArrowLeft,
} from 'lucide-react';

interface ProviderStatus {
  provider: string;
  displayName: string;
  authType: 'oauth' | 'apikey';
  connected: boolean;
  merchantId: string | null;
  locationId: string | null;
  tokenExpiresAt: string | null;
  planGated: boolean;
}

interface SyncLog {
  id: string;
  provider: string;
  direction: string;
  totalItems: number;
  newItems: number;
  updatedItems: number;
  unchangedItems: number;
  errors: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  square: <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center text-white font-bold text-lg">S</div>,
  clover: <div className="h-10 w-10 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-lg">C</div>,
  toast: <div className="h-10 w-10 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-lg">T</div>,
  shopify: <div className="h-10 w-10 rounded-lg bg-[#96bf48] flex items-center justify-center text-white font-bold text-lg">S</div>,
};

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  square: 'Best for restaurants, retail, and service businesses',
  clover: 'Popular with restaurants and small businesses',
  toast: 'Built specifically for restaurants',
  shopify: 'For e-commerce and online stores',
};

export default function IntegrationsPage() {
  const { tenantId, isLoading: tenantLoading } = useTenantId();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [showPostConnect, setShowPostConnect] = useState(false);
  const [postConnectStep, setPostConnectStep] = useState(0);
  const [connectedProvider, setConnectedProvider] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // Show toast and post-connect flow on OAuth redirect
  useEffect(() => {
    if (searchParams.get('pos_connected') === 'true') {
      const provider = searchParams.get('provider') || 'POS';
      toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} connected successfully!`);
      const dismissed = sessionStorage.getItem(`pos_postconnect_${provider}`);
      if (!dismissed) {
        setShowPostConnect(true);
        setConnectedProvider(provider);
        setPostConnectStep(0);
      }
    }
    if (searchParams.get('pos_error')) {
      toast.error(`Failed to connect: ${searchParams.get('pos_error')}`);
    }
  }, [searchParams]);

  const { data: providers, isLoading, error: providersError } = useQuery({
    queryKey: ['pos-providers', tenantId],
    queryFn: () => posApi.listProviders(tenantId!),
    enabled: !!tenantId,
  });

  const { data: syncHistoryData } = useQuery({
    queryKey: ['sync-history', tenantId],
    queryFn: () => posApi.getSyncHistory(tenantId!),
    enabled: !!tenantId,
  });

  const { data: tenant } = useQuery({
    queryKey: ['tenant-me'],
    queryFn: () => tenantApi.getMe(),
  });

  const syncLogs: SyncLog[] = syncHistoryData?.logs ?? [];
  const activeProvider = providers?.find((p: ProviderStatus) => p.connected);
  const menuItemCount = tenant?.menuItems?.length ?? 0;
  const orderFlowEnabled = tenant?.flows?.some((f: { type: string; isEnabled: boolean }) => f.type === 'ORDER' && f.isEnabled) ?? false;

  if (isLoading || tenantLoading) {
    return (
      <div>
        <Header title="Integrations" description="Connect your POS system to sync menus and manage orders" />
        <div className="space-y-4 max-w-3xl">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-10 w-full bg-muted rounded" /></CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Determine which view to show
  const viewProvider = activeProvider
    ?? (selectedProvider ? providers?.find((p: ProviderStatus) => p.provider === selectedProvider) : null);

  return (
    <div>
      <Header title="Integrations" description="Connect your POS system to sync menus and manage orders" />

      <div className="space-y-6 max-w-3xl">
        {/* Error states */}
        {!tenantId && !tenantLoading && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-amber-800">No tenant found for this organization. Please complete onboarding first.</p>
            </CardContent>
          </Card>
        )}
        {providersError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-red-800">
                Failed to load providers: {(providersError as any)?.message || 'Unknown error'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Post-connect guided flow */}
        {showPostConnect && connectedProvider && (
          <PostConnectFlow
            provider={connectedProvider}
            tenantId={tenantId!}
            step={postConnectStep}
            onStepComplete={() => setPostConnectStep((s) => s + 1)}
            onDismiss={() => {
              setShowPostConnect(false);
              sessionStorage.setItem(`pos_postconnect_${connectedProvider}`, 'true');
            }}
            queryClient={queryClient}
          />
        )}

        {/* Main content: either POS selector or active provider details */}
        {viewProvider ? (
          <>
            {/* Back button when browsing (not connected) */}
            {!activeProvider && selectedProvider && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedProvider(null)}
                className="mb-2"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to POS selection
              </Button>
            )}

            <PosProviderCard
              provider={viewProvider}
              tenantId={tenantId!}
              queryClient={queryClient}
            />
          </>
        ) : (
          /* POS Selector — no provider connected or selected */
          <>
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <Store className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Select your POS system</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      Choose your point-of-sale provider to sync your menu catalog and enable order placement through SMS.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {providers?.map((p: ProviderStatus) => (
                <PosSelectorCard
                  key={p.provider}
                  provider={p}
                  onSelect={() => setSelectedProvider(p.provider)}
                />
              ))}
            </div>
          </>
        )}

        {/* Setup checklist — shown when a provider is connected */}
        {activeProvider && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Getting Started
              </CardTitle>
              <CardDescription>Complete these steps to start accepting orders via SMS</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <ChecklistItem done={true} label="POS Connected" />
                <ChecklistItem
                  done={menuItemCount > 0}
                  label={menuItemCount > 0 ? `Menu Synced (${menuItemCount} items)` : 'Sync your menu from POS'}
                  hint="Use the Pull from POS button above"
                />
                <ChecklistItem
                  done={orderFlowEnabled}
                  label={orderFlowEnabled ? 'ORDER flow enabled' : 'Enable the ORDER flow'}
                  href="/dashboard/flows"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sync History */}
        {activeProvider && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Sync History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {syncLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No sync history yet</p>
              ) : (
                <div className="space-y-2">
                  {syncLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 text-sm">
                      <div className="flex items-center gap-3">
                        {log.direction === 'pull' ? (
                          <Download className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Upload className="h-4 w-4 text-green-500" />
                        )}
                        <div>
                          <span className="font-medium capitalize">{log.direction}</span>
                          <span className="text-muted-foreground ml-2">
                            {log.totalItems} items
                            {log.newItems > 0 && ` (${log.newItems} new`}
                            {log.updatedItems > 0 && `, ${log.updatedItems} updated`}
                            {(log.newItems > 0 || log.updatedItems > 0) && ')'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={log.status === 'completed' ? 'success' : log.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">
                          {log.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatRelativeTime(log.startedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── POS Selector Card ─────────────────────────────────────────────────────────

function PosSelectorCard({ provider, onSelect }: {
  provider: ProviderStatus;
  onSelect: () => void;
}) {
  if (provider.planGated) {
    return (
      <Card className="opacity-50 cursor-not-allowed">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-3 mb-3">
            {PROVIDER_ICONS[provider.provider]}
            <div>
              <h3 className="font-semibold text-sm">{provider.displayName}</h3>
              <p className="text-xs text-muted-foreground">{PROVIDER_DESCRIPTIONS[provider.provider]}</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1 text-xs">
            <Lock className="h-3 w-3" /> Upgrade Required
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="cursor-pointer transition-all hover:border-blue-300 hover:shadow-md"
      onClick={onSelect}
    >
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-3 mb-2">
          {PROVIDER_ICONS[provider.provider]}
          <div>
            <h3 className="font-semibold text-sm">{provider.displayName}</h3>
            <p className="text-xs text-muted-foreground">{PROVIDER_DESCRIPTIONS[provider.provider]}</p>
          </div>
        </div>
        <div className="flex items-center justify-end text-xs text-blue-600 font-medium mt-3">
          Select <ChevronRight className="h-3 w-3 ml-0.5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Checklist Item ───────────────────────────────────────────────────────────

function ChecklistItem({ done, label, href, hint }: { done: boolean; label: string; href?: string; hint?: string }) {
  const content = (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        {done ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
        )}
        <span className={done ? 'text-sm text-muted-foreground line-through' : 'text-sm font-medium'}>
          {label}
        </span>
      </div>
      {!done && href && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      {!done && hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );

  if (!done && href) {
    return <Link href={href} className="block hover:bg-muted/50 rounded-lg px-2 -mx-2">{content}</Link>;
  }
  return <div className="px-2 -mx-2">{content}</div>;
}

// ── Post-Connect Flow ────────────────────────────────────────────────────────

function PostConnectFlow({ provider, tenantId, step, onStepComplete, onDismiss, queryClient }: {
  provider: string;
  tenantId: string;
  step: number;
  onStepComplete: () => void;
  onDismiss: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const syncMutation = useMutation({
    mutationFn: () => posApi.syncCatalog(tenantId, provider),
    onSuccess: (data) => {
      const msg = data?.newItems != null
        ? `Pulled ${data.synced} items (${data.newItems} new, ${data.updated} updated)`
        : `Synced ${data?.synced ?? 0} items`;
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ['sync-history', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['pos-providers', tenantId] });
      onStepComplete();
    },
    onError: () => toast.error('Sync failed — please try again'),
  });

  return (
    <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-green-900 dark:text-green-100">
              You&apos;re connected! Here&apos;s what to do next
            </h3>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              Follow these steps to start accepting SMS orders
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onDismiss} className="text-green-700">
            Dismiss
          </Button>
        </div>

        <div className="space-y-3">
          {/* Step 1: Sync menu */}
          <div className={`flex items-center gap-3 p-3 rounded-lg ${step === 0 ? 'bg-white dark:bg-green-900/30 shadow-sm' : 'opacity-60'}`}>
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${step > 0 ? 'bg-green-500 text-white' : 'bg-green-200 text-green-800'}`}>
              {step > 0 ? <CheckCircle className="h-4 w-4" /> : '1'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Sync your menu from {provider}</p>
            </div>
            {step === 0 && (
              <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                <RefreshCw className={`h-3 w-3 mr-1.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
              </Button>
            )}
          </div>

          {/* Step 2: Review menu */}
          <div className={`flex items-center gap-3 p-3 rounded-lg ${step === 1 ? 'bg-white dark:bg-green-900/30 shadow-sm' : 'opacity-60'}`}>
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${step > 1 ? 'bg-green-500 text-white' : 'bg-green-200 text-green-800'}`}>
              {step > 1 ? <CheckCircle className="h-4 w-4" /> : '2'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Review your menu items</p>
            </div>
            {step === 1 && (
              <Link href="/dashboard/menu">
                <Button size="sm" variant="outline">
                  <UtensilsCrossed className="h-3 w-3 mr-1.5" /> View Menu
                </Button>
              </Link>
            )}
          </div>

          {/* Step 3: Enable ORDER flow */}
          <div className={`flex items-center gap-3 p-3 rounded-lg ${step === 2 ? 'bg-white dark:bg-green-900/30 shadow-sm' : 'opacity-60'}`}>
            <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold bg-green-200 text-green-800">3</div>
            <div className="flex-1">
              <p className="text-sm font-medium">Enable SMS ordering</p>
            </div>
            {step >= 2 && (
              <Link href="/dashboard/flows">
                <Button size="sm" variant="outline">
                  <Zap className="h-3 w-3 mr-1.5" /> Enable Flows
                </Button>
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── POS Provider Card ────────────────────────────────────────────────────────

function PosProviderCard({ provider, tenantId, queryClient }: {
  provider: ProviderStatus;
  tenantId: string;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [showConfig, setShowConfig] = useState(false);
  const [apiCredentials, setApiCredentials] = useState<Record<string, string>>({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pos-providers', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['sync-history', tenantId] });
  };

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
    onSuccess: (data) => {
      const msg = data?.newItems != null
        ? `Pulled ${data.synced} items from ${provider.displayName} (${data.newItems} new, ${data.updated} updated, ${data.unchanged} unchanged)`
        : `Synced ${data?.synced ?? 0} items from ${provider.displayName}`;
      toast.success(msg);
      invalidate();
    },
    onError: () => toast.error('Sync failed'),
  });

  const pushMutation = useMutation({
    mutationFn: () => posApi.pushCatalog(tenantId, provider.provider),
    onSuccess: (data) => { toast.success(`Pushed ${data?.pushed ?? 0} items to ${provider.displayName}`); invalidate(); },
    onError: () => toast.error('Push failed'),
  });

  const reconnectMutation = useMutation({
    mutationFn: () => posApi.refreshToken(tenantId, provider.provider),
    onSuccess: () => { invalidate(); toast.success('Token refreshed!'); },
    onError: () => toast.error('Failed to refresh token — try reconnecting'),
  });

  // Square multi-location picker (only fetched when the user opens it
  // and only for adapters that expose listLocations — currently Square).
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const locationsQuery = useQuery({
    queryKey: ['pos-locations', tenantId, provider.provider],
    queryFn: () => posApi.listLocations(tenantId, provider.provider),
    enabled: showLocationPicker && provider.connected && provider.provider === 'square',
    staleTime: 60_000,
    retry: false,
  });
  const configureLocationMutation = useMutation({
    mutationFn: (locationId: string) =>
      posApi.configureLocation(tenantId, provider.provider, locationId),
    onSuccess: (data) => {
      toast.success(`Switched to ${data.name}`);
      invalidate();
      queryClient.invalidateQueries({
        queryKey: ['pos-locations', tenantId, provider.provider],
      });
      setShowLocationPicker(false);
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error ?? 'Failed to change location'),
  });

  // Token health
  const tokenHealth = getTokenHealth(provider.tokenExpiresAt);

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
                  : PROVIDER_DESCRIPTIONS[provider.provider]
                }
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {provider.connected && tokenHealth !== 'healthy' && (
              <Badge variant={tokenHealth === 'expired' ? 'destructive' : 'warning'} className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {tokenHealth === 'expired' ? 'Token Expired' : 'Expiring Soon'}
              </Badge>
            )}
            {provider.connected && (
              <Badge variant="success">
                <CheckCircle className="h-3 w-3 mr-1" /> Connected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {provider.connected ? (
          <>
            {/* Token health warning */}
            {tokenHealth !== 'healthy' && (
              <Card className={`${tokenHealth === 'expired' ? 'bg-red-50 border-red-200 dark:bg-red-950/20' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20'}`}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`h-4 w-4 ${tokenHealth === 'expired' ? 'text-red-600' : 'text-amber-600'}`} />
                      <span className={`text-sm font-medium ${tokenHealth === 'expired' ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'}`}>
                        {tokenHealth === 'expired' ? 'Your connection token has expired' : 'Your connection token expires soon'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reconnectMutation.mutate()}
                      disabled={reconnectMutation.isPending}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1.5 ${reconnectMutation.isPending ? 'animate-spin' : ''}`} />
                      {reconnectMutation.isPending ? 'Refreshing...' : 'Refresh Token'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Location picker (Square only for now) */}
            {provider.provider === 'square' && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-slate-600" />
                      <span className="text-sm font-medium">Synced location</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowLocationPicker((v) => !v)}
                    >
                      {showLocationPicker ? 'Cancel' : 'Change location'}
                    </Button>
                  </div>
                  {!showLocationPicker && (
                    <p className="text-xs text-muted-foreground">
                      {provider.locationId
                        ? `Location id: ${provider.locationId}`
                        : 'No location set'}
                    </p>
                  )}
                  {showLocationPicker && (
                    <div className="mt-3 space-y-2">
                      {locationsQuery.isLoading && (
                        <p className="text-xs text-muted-foreground">Loading locations…</p>
                      )}
                      {locationsQuery.isError && (
                        <p className="text-xs text-red-600">
                          Failed to load locations. Try reconnecting Square.
                        </p>
                      )}
                      {locationsQuery.data?.locations?.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No active locations found on this Square account.
                        </p>
                      )}
                      {locationsQuery.data?.locations?.map((loc) => {
                        const isCurrent =
                          loc.id === locationsQuery.data?.currentLocationId;
                        return (
                          <button
                            key={loc.id}
                            type="button"
                            disabled={
                              configureLocationMutation.isPending || isCurrent
                            }
                            onClick={() =>
                              configureLocationMutation.mutate(loc.id)
                            }
                            className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                              isCurrent
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                            } disabled:opacity-60`}
                          >
                            <div className="font-medium flex items-center gap-2">
                              {loc.name}
                              {isCurrent && (
                                <span className="text-xs text-blue-600">
                                  (current)
                                </span>
                              )}
                            </div>
                            {loc.address && (
                              <div className="text-xs text-muted-foreground">
                                {loc.address}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Sync actions */}
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

// ── Token Health Helper ──────────────────────────────────────────────────────

function getTokenHealth(tokenExpiresAt: string | null): 'healthy' | 'expiring' | 'expired' {
  if (!tokenExpiresAt) return 'healthy'; // API key providers or non-expiring tokens
  const expiresAt = new Date(tokenExpiresAt);
  const now = new Date();
  if (expiresAt < now) return 'expired';
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (expiresAt.getTime() - now.getTime() < sevenDays) return 'expiring';
  return 'healthy';
}

// ── API Key Config Form ──────────────────────────────────────────────────────

function ApiKeyConfigForm({ provider, credentials, setCredentials, onSubmit, isPending, onCancel }: {
  provider: ProviderStatus;
  credentials: Record<string, string>;
  setCredentials: (creds: Record<string, string>) => void;
  onSubmit: () => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const fields: Record<string, { label: string; fields: Array<{ key: string; label: string; placeholder: string; type?: string }> }> = {
    toast: {
      label: 'Toast API Credentials',
      fields: [
        { key: 'clientId', label: 'Client ID', placeholder: 'Your Toast client ID' },
        { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Toast client secret', type: 'password' },
        { key: 'restaurantGuid', label: 'Restaurant GUID', placeholder: 'Your Toast restaurant GUID' },
      ],
    },
    shopify: {
      label: 'Shopify Store',
      fields: [
        { key: 'shopDomain', label: 'Store Domain', placeholder: 'your-store.myshopify.com' },
      ],
    },
  };

  const config = fields[provider.provider] || {
    label: 'API Credentials',
    fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'Enter your API key' }],
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
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
