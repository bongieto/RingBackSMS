'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Store, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';

interface PosStatusCardProps {
  posProvider: string | null;
  posMerchantId: string | null;
  posTokenExpiresAt: string | null;
  plan: string;
}

export function PosStatusCard({ posProvider, posMerchantId, posTokenExpiresAt, plan }: PosStatusCardProps) {
  // POS is plan-gated to BUSINESS and SCALE
  if (plan !== 'BUSINESS' && plan !== 'SCALE') return null;

  const isConnected = !!posProvider && !!posMerchantId;

  // Token health check
  let tokenHealth: 'healthy' | 'expiring' | 'expired' = 'healthy';
  if (posTokenExpiresAt) {
    const expiresAt = new Date(posTokenExpiresAt);
    const now = new Date();
    if (expiresAt < now) tokenHealth = 'expired';
    else if (expiresAt.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000) tokenHealth = 'expiring';
  }

  if (!isConnected) {
    return (
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <Store className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Connect your POS system</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Sync your menu and enable SMS ordering with Square, Clover, Toast, or Shopify
                </p>
              </div>
            </div>
            <Link href="/dashboard/integrations">
              <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100">
                Connect POS <ArrowRight className="h-3 w-3 ml-1.5" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const providerName = posProvider.charAt(0).toUpperCase() + posProvider.slice(1);

  return (
    <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">{providerName} Connected</p>
                {tokenHealth !== 'healthy' && (
                  <Badge variant={tokenHealth === 'expired' ? 'destructive' : 'warning'} className="text-[10px] gap-0.5 py-0">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {tokenHealth === 'expired' ? 'Expired' : 'Expiring'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-green-700 dark:text-green-300">
                Merchant: {posMerchantId}
              </p>
            </div>
          </div>
          <Link href="/dashboard/integrations">
            <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-100">
              Manage
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
