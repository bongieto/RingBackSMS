import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiPaginated, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId') ?? '';
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);
  const isActiveParam = searchParams.get('isActive');
  const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

  const where = { tenantId, ...(isActive !== undefined && { isActive }) };
  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.conversation.count({ where }),
  ]);
  return apiPaginated(conversations, total, page, pageSize);
}
