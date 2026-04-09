import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isSuperAdmin } from '@/lib/server/agency';
import { prisma } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const statusParam = req.nextUrl.searchParams.get('status')?.toUpperCase();
  const status =
    statusParam === 'PENDING' ||
    statusParam === 'APPROVED' ||
    statusParam === 'REJECTED'
      ? statusParam
      : undefined;

  const apps = await prisma.agencyApplication.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  return apiSuccess(apps);
}
