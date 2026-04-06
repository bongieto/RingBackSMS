import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

const BulkSchema = z.object({
  tenantId: z.string().uuid(),
  contactIds: z.array(z.string()).min(1).max(100),
  action: z.enum(['tag', 'status', 'delete']),
  value: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { tenantId, contactIds, action, value } = BulkSchema.parse(await req.json());
    const authResult = await verifyTenantAccess(tenantId);
    if (isNextResponse(authResult)) return authResult;

    // Verify all contacts belong to this tenant
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds }, tenantId },
      select: { id: true, tags: true },
    });

    const validIds = contacts.map((c) => c.id);
    if (validIds.length === 0) return apiError('No matching contacts found', 404);

    let affected = 0;

    switch (action) {
      case 'tag': {
        if (!value) return apiError('Tag value is required', 400);
        for (const contact of contacts) {
          const currentTags = contact.tags as string[];
          if (!currentTags.includes(value)) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { tags: [...currentTags, value] },
            });
            affected++;
          }
        }
        break;
      }
      case 'status': {
        if (!value) return apiError('Status value is required', 400);
        const result = await prisma.contact.updateMany({
          where: { id: { in: validIds } },
          data: { status: value as any },
        });
        affected = result.count;
        break;
      }
      case 'delete': {
        const result = await prisma.contact.deleteMany({
          where: { id: { in: validIds } },
        });
        affected = result.count;
        break;
      }
    }

    return apiSuccess({ affected, action });
  } catch (err: any) {
    if (err instanceof z.ZodError) return apiError('Invalid request', 422);
    return apiError('Internal server error', 500);
  }
}
