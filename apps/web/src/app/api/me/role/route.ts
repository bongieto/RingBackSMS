import { getCurrentRole } from '@/lib/server/roles';
import { apiError, apiSuccess } from '@/lib/server/response';

/**
 * Returns the authenticated user's per-tenant role + accessible route
 * prefixes. Consumed by the sidebar to hide disallowed items and by the
 * dashboard layout to redirect kitchen staff who try to hit /settings.
 */
export async function GET() {
  const ctx = await getCurrentRole();
  if (!ctx) return apiError('Unauthenticated', 401);
  return apiSuccess({ role: ctx.role, tenantId: ctx.tenantId });
}
