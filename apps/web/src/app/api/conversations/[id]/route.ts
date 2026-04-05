import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  const conversation = await prisma.conversation.findUnique({ where: { id: params.id }, include: { orders: true, meetings: true } });
  if (!conversation) return apiError('Not found', 404);
  return apiSuccess(conversation);
}
