'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { setAuthToken } from '@/lib/api';

/**
 * Keeps the Axios default Authorization header in sync with the Clerk session token.
 * Render this once inside the dashboard layout.
 */
export function AuthTokenProvider() {
  const { getToken } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      const token = await getToken();
      if (!cancelled) setAuthToken(token);
    }

    sync();
    // Re-sync every 55 seconds (tokens expire at 60s)
    const interval = setInterval(sync, 55_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [getToken]);

  return null;
}
