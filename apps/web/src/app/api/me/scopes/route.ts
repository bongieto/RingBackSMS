import { auth } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isAgencyUser, isSuperAdmin } from '@/lib/server/agency';

export const dynamic = 'force-dynamic';

/**
 * Lightweight "what scopes does the current user have?" endpoint used
 * by the client-side ViewSwitcher to render only the views the user
 * can actually open. Returns { isAgency, isSuperAdmin } — never throws.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  const [agency, superAdmin] = await Promise.all([
    isAgencyUser(userId),
    Promise.resolve(isSuperAdmin(userId)),
  ]);
  return apiSuccess({ isAgency: agency, isSuperAdmin: superAdmin });
}
