'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';
import { Loader2 } from 'lucide-react';
import { tenantApi } from '@/lib/api';

interface TenantContextType {
  tenantId: string | undefined;
  tenant: TenantSummary | undefined;
  businessType: string | undefined;
  isLoading: boolean;
}

interface TenantSummary {
  id: string;
  businessType?: string;
  onboardingCompletedAt?: string | null;
  posProvider?: string | null;
  posMerchantId?: string | null;
  posTokenExpiresAt?: string | null;
  plan?: string;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: undefined,
  tenant: undefined,
  businessType: undefined,
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
  const [tenant, setTenant] = useState<TenantSummary | undefined>(undefined);
  const [businessType, setBusinessType] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  // Track the org id we last resolved so we can reset on org switch
  const lastOrgId = useRef<string | null>(null);

  const organizationId = organization?.id;
  const metadataTenantId = organization?.publicMetadata?.tenantId as string | undefined;

  useEffect(() => {
    if (!isLoaded) return;

    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    const orgChanged = Boolean(lastOrgId.current && lastOrgId.current !== organizationId);

    // If the org changed (user switched orgs), reset state and show
    // the loading spinner while we resolve the new tenant. This
    // prevents the dashboard from briefly rendering with stale data
    // from the previous org.
    if (orgChanged) {
      setResolvedTenantId(undefined);
      setTenant(undefined);
      setBusinessType(undefined);
      setIsLoading(true);
    }
    lastOrgId.current = organizationId;

    let cancelled = false;

    // Small delay on org switch to let Clerk's session settle. Without
    // this the /api/tenants/me call can fire before Clerk's server-side
    // auth() reflects the new orgId, causing a 403 or stale tenant.
    const delay = orgChanged ? 300 : 0;

    const timer = setTimeout(() => {
      tenantApi
        .getMe()
        .then((tenant: TenantSummary) => {
          if (cancelled) return;
          if (!tenant.onboardingCompletedAt) {
            setIsLoading(false);
            router.replace('/onboarding');
            return;
          }
          setResolvedTenantId(tenant.id);
          setTenant(tenant);
          setBusinessType(tenant.businessType);
          setIsLoading(false);
        })
        .catch((err: { response?: { status?: number } }) => {
          if (cancelled) return;
          const status = err?.response?.status;
          if (status === 404) {
            setIsLoading(false);
            router.replace('/onboarding');
            return;
          }
          if (status === 403) {
            // Clerk session hasn't settled yet — retry once after a
            // short delay instead of showing a broken dashboard.
            setTimeout(() => {
              if (cancelled) return;
              tenantApi
                .getMe()
                .then((tenant: TenantSummary) => {
                  if (cancelled) return;
                  if (!tenant.onboardingCompletedAt) {
                    setIsLoading(false);
                    router.replace('/onboarding');
                    return;
                  }
                  setResolvedTenantId(tenant.id);
                  setTenant(tenant);
                  setBusinessType(tenant.businessType);
                  setIsLoading(false);
                })
                .catch(() => {
                  if (cancelled) return;
                  setTenant(metadataTenantId ? { id: metadataTenantId } : undefined);
                  setResolvedTenantId(metadataTenantId);
                  setIsLoading(false);
                });
            }, 500);
            return;
          }
          // Other transient error — fall back to metadata
          setTenant(metadataTenantId ? { id: metadataTenantId } : undefined);
          setResolvedTenantId(metadataTenantId);
          setIsLoading(false);
        });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLoaded, organizationId, metadataTenantId, router]);

  return (
    <TenantContext.Provider value={{ tenantId: resolvedTenantId, tenant, businessType, isLoading }}>
      {isLoading || !resolvedTenantId ? (
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        children
      )}
    </TenantContext.Provider>
  );
}

export function useTenantId() {
  return useContext(TenantContext);
}
