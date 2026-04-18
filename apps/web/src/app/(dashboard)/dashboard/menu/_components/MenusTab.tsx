'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';
import { MenuQRCard } from './MenuQRCard';

/**
 * The "Menus" tab. Today each tenant has a single implicit menu, so we
 * render one row wrapping `ordersAcceptingEnabled` — flipping it off
 * pauses ORDER intent across every category/item without mass toggling.
 */
export function MenusTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();

  const { data: tenant } = useQuery<{ name?: string; slug?: string | null; config?: { ordersAcceptingEnabled?: boolean } }>({
    queryKey: ['tenant-me'],
    queryFn: () => tenantApi.getMe(),
  });

  const toggleMutation = useMutation({
    mutationFn: (isEnabled: boolean) =>
      tenantApi.updateConfig(tenantId, { ordersAcceptingEnabled: isEnabled } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-me'] });
      toast.success('Menu availability updated');
    },
    onError: () => toast.error('Failed to update availability'),
  });

  const ordersAccepting = tenant?.config?.ordersAcceptingEnabled ?? true;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div>Menu</div>
            <div>Available</div>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-4">
            <div>
              <div className="font-medium">{tenant?.name ?? 'Your menu'}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Turn this off to temporarily pause all new orders. Customer-facing menu still displays.
              </div>
            </div>
            <Switch
              checked={ordersAccepting}
              disabled={toggleMutation.isPending}
              onCheckedChange={(v) => toggleMutation.mutate(v)}
            />
          </div>
        </CardContent>
      </Card>

      <MenuQRCard slug={tenant?.slug ?? null} />
    </div>
  );
}
