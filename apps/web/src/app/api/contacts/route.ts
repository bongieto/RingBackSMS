import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { ContactStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { apiSuccess, apiCreated, apiPaginated, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { encryptNullable, decryptMaybePlaintext } from '@/lib/server/encryption';

// Decrypt name/email on the way out; phone stays plaintext (lookup key)
function decryptContact<T extends { name: string | null; email: string | null }>(c: T): T {
  return { ...c, name: decryptMaybePlaintext(c.name), email: decryptMaybePlaintext(c.email) };
}

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

  // Name is encrypted — cannot do a SQL-level LIKE on it. If a search term
  // is present, fetch the full tenant-scoped set (filtered by tag/status/
  // phone prefix) then filter + paginate in memory after decryption.
  const baseWhere: Prisma.ContactWhereInput = {
    tenantId,
    ...(tag && { tags: { has: tag } }),
    ...(status && { status }),
  };

  if (search) {
    const all = await prisma.contact.findMany({
      where: baseWhere,
      orderBy: { updatedAt: 'desc' },
    });
    const needle = search.toLowerCase();
    const decrypted = all.map(decryptContact);
    const filtered = decrypted.filter((c) => {
      return (
        (c.name && c.name.toLowerCase().includes(needle)) ||
        (c.email && c.email.toLowerCase().includes(needle)) ||
        (c.phone && c.phone.includes(search))
      );
    });
    const total = filtered.length;
    const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
    return apiPaginated(pageItems, total, page, pageSize);
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where: baseWhere,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where: baseWhere }),
  ]);

  return apiPaginated(contacts.map(decryptContact), total, page, pageSize);
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
        name: encryptNullable(body.name ?? null),
        email: encryptNullable(body.email || null),
        notes: body.notes ?? null,
        tags: body.tags ?? [],
        status: body.status ?? ContactStatus.LEAD,
      },
    });

    logger.info('Contact created', { contactId: contact.id, tenantId: body.tenantId });
    return apiCreated(decryptContact(contact));
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
