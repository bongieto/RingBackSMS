import { redirect } from 'next/navigation';
import { getCurrentRole } from './roles';
import { TenantMemberRole } from '@prisma/client';

type AllowedRole = TenantMemberRole | 'OWNER' | 'MANAGER' | 'KITCHEN' | 'VIEWER' | 'MEMBER';

/**
 * Server-component guard: enforces that the signed-in user has one of
 * the allowed roles for their tenant before rendering the page. Call
 * at the TOP of page.tsx / layout.tsx server components. On denial,
 * redirects to the dashboard root (which every role can access).
 *
 * Client-side sidebar hiding (Sidebar.tsx) complements this — the
 * sidebar won't show the link, but if a determined user types the URL
 * directly we need server-side to enforce. Previously only the
 * sidebar was gated.
 */
export async function requireRole(allowed: AllowedRole[]): Promise<void> {
  const ctx = await getCurrentRole();
  if (!ctx) {
    redirect('/sign-in');
  }
  if (!allowed.includes(ctx.role)) {
    redirect('/dashboard');
  }
}

/** Shortcut for owner/manager-only admin pages. */
export async function requireAdmin(): Promise<void> {
  await requireRole([TenantMemberRole.OWNER, TenantMemberRole.MANAGER]);
}
