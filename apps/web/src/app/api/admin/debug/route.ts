import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';

export async function GET(_request: NextRequest) {
  const results: Record<string, unknown> = {};

  // 1. Check auth
  try {
    const { userId, orgId } = await auth();
    results.auth = { userId, orgId };
  } catch (e: any) {
    results.auth = { error: e.message };
  }

  // 2. Check env vars
  results.envs = {
    SUPER_ADMIN_USER_ID: process.env.SUPER_ADMIN_USER_ID ? 'set' : 'missing',
    DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'missing',
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ? process.env.CLERK_SECRET_KEY.slice(0, 7) + '...' : 'missing',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'not set',
  };

  // 3. Check DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.db = 'connected';
  } catch (e: any) {
    results.db = { error: e.message };
  }

  // 4. Check tenant count
  try {
    const count = await prisma.tenant.count();
    results.tenants = count;
  } catch (e: any) {
    results.tenants = { error: e.message };
  }

  // 5. Check isSuperAdmin logic
  const userId = results.auth && typeof results.auth === 'object' && 'userId' in results.auth
    ? (results.auth as any).userId
    : null;
  const adminId = process.env.SUPER_ADMIN_USER_ID?.trim();
  results.superAdminCheck = {
    userId,
    adminId: adminId ? adminId.slice(0, 15) + '...' : null,
    match: !!userId && !!adminId && userId === adminId,
  };

  return Response.json(results);
}
