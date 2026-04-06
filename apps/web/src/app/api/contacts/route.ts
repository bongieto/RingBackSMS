import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { ContactStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { apiSuccess, apiCreated, apiPaginated, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const CreateSchema = z.object({
  tenantId: z.string().min(1),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format'),
  name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.nativeEnum(ContactStatus).optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId is required', 400);
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const search = searchParams.get('search') ?? undefined;
  const tag = searchParams.get('tag') ?? undefined;
  const status = searchParams.get('status') as ContactStatus | undefined ?? undefined;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

  const where: Prisma.ContactWhereInput = {
    tenantId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as Prisma.QueryMode } },
        { phone: { contains: search } },
      ],
    }),
    ...(tag && { tags: { has: tag } }),
    ...(status && { status }),
  };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return apiPaginated(contacts, total, page, pageSize);
}

export async function POST(req: NextRequest) {
  try {
    const body = CreateSchema.parse(await req.json());
    const authResult = await verifyTenantAccess(body.tenantId);
    if (isNextResponse(authResult)) return authResult;

    const contact = await prisma.contact.create({
      data: {
        tenantId: body.tenantId,
        phone: body.phone,
        name: body.name ?? null,
        email: body.email || null,
        notes: body.notes ?? null,
        tags: body.tags ?? [],
        status: body.status ?? ContactStatus.LEAD,
      },
    });

    logger.info('Contact created', { contactId: contact.id, tenantId: body.tenantId });
    return apiCreated(contact);
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
