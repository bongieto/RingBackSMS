'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { tenantApi } from '@/lib/api';

interface TenantContextType {
  tenantId: string | undefined;
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: undefined,
  isLoading: true,
});

/**
 * Resolves tenantId for dashboard pages.
 * 1. First tries organization.publicMetadata.tenantId (fast, from Clerk)
 * 2. If not set, calls /api/tenants/me to look up tenant by clerkOrgId
 * 3. That endpoint also backfills Clerk publicMetadata for future loads
 */
export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { organization, isLoaded } = useOrganization();
  const [resolvedTenantId, setResolvedTenantId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  const metadataTenantId = organization?.publicMetadata?.tenantId as string | undefined;

  useEffect(() => {
    if (!isLoaded) return;

    // If tenantId is already in metadata, use it
    if (metadataTenantId) {
      setResolvedTenantId(metadataTenantId);
      setIsLoading(false);
      return;
    }

    // If no organization, can't resolve
    if (!organization) {
      setIsLoading(false);
      return;
    }

    // Look up tenant by clerkOrgId via API
    tenantApi
      .getMe()
      .then((tenant: { id: string }) => {
        setResolvedTenantId(tenant.id);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [isLoaded, organization, metadataTenantId]);

  return (
    <TenantContext.Provider value={{ tenantId: resolvedTenantId, isLoading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantId() {
  return useContext(TenantContext);
}
