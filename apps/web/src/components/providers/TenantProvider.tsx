'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
 * Resolves tenantId for dashboard pages by calling /api/tenants/me,
 * which is the single source of truth. Clerk publicMetadata is used
 * only as a last-resort fallback if the API call fails for a reason
 * other than 404, because metadata can be stale (e.g. a seed id left
 * over from an earlier dev session).
 *
 * If no tenant exists for the current Clerk org, the user is
 * redirected to /onboarding.
 */
export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { organization, isLoaded } = useOrganization();
  const router = useRouter();
  const [resolvedTenantId, setResolvedTenantId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  const metadataTenantId = organization?.publicMetadata?.tenantId as string | undefined;

  useEffect(() => {
    if (!isLoaded) return;

    if (!organization) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    tenantApi
      .getMe()
      .then((tenant: { id: string }) => {
        if (cancelled) return;
        setResolvedTenantId(tenant.id);
        setIsLoading(false);
      })
      .catch((err: { response?: { status?: number } }) => {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 404) {
          // No tenant for this Clerk org yet — user needs to onboard.
          setIsLoading(false);
          router.replace('/onboarding');
          return;
        }
        // Transient error — fall back to metadata if present, but flag
        // that the id may be stale.
        setResolvedTenantId(metadataTenantId);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, organization, metadataTenantId, router]);

  return (
    <TenantContext.Provider value={{ tenantId: resolvedTenantId, isLoading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantId() {
  return useContext(TenantContext);
}
