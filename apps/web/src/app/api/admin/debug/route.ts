import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET(_request: NextRequest) {
  const { userId, orgId } = await auth();
  const adminId = process.env.SUPER_ADMIN_USER_ID?.trim();
  const adminClerkId = process.env.SUPER_ADMIN_CLERK_USER_ID?.trim();

  return Response.json({
    userId,
    orgId,
    adminId: adminId ? adminId.slice(0, 10) + '...' : null,
    adminClerkId: adminClerkId ? adminClerkId.slice(0, 10) + '...' : null,
    match: userId === adminId,
    envKeys: Object.keys(process.env).filter(k => k.includes('ADMIN')).sort(),
  });
}
