import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { z } from 'zod';

// Date-anchored stops API. Replaces the previous day-of-week schedule.
// PUT is diff-based: rows with no `id` are creates, rows with an `id`
// missing from the payload are deletes, others are updates.

const StopInput = z.object({
  id: z.string().uuid().optional(),
  stopDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'stopDate must be YYYY-MM-DD'),
  locationName: z.string().nullable().optional(),
  address: z.string().min(1, 'address is required'),
  openTime: z.string().regex(/^\d{2}:\d{2}$/, 'openTime must be HH:mm'),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, 'closeTime must be HH:mm'),
  note: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const PutSchema = z.object({ stops: z.array(StopInput) });

function serialize<T extends { stopDate: Date }>(row: T): Omit<T, 'stopDate'> & { stopDate: string } {
  const d = row.stopDate;
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { ...row, stopDate: iso };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const url = new URL(req.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const today = new Date();
    const todayIso = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    const sixtyOut = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
    const sixtyIso = `${sixtyOut.getUTCFullYear()}-${String(sixtyOut.getUTCMonth() + 1).padStart(2, '0')}-${String(sixtyOut.getUTCDate()).padStart(2, '0')}`;

    const from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : todayIso;
    const to = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : sixtyIso;

    const rows = await prisma.foodTruckStop.findMany({
      where: {
        tenantId: params.id,
        stopDate: { gte: new Date(from + 'T00:00:00Z'), lte: new Date(to + 'T00:00:00Z') },
      },
      orderBy: [{ stopDate: 'asc' }, { openTime: 'asc' }],
    });
    return apiSuccess({ stops: rows.map(serialize) });
  } catch (err) {
    console.error('[GET /api/tenants/:id/food-truck-schedule] failed', err);
    return apiError('Internal server error', 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const body = PutSchema.parse(await req.json());
    const incomingIds = new Set(body.stops.map((s) => s.id).filter(Boolean) as string[]);

    const existingIds = (
      await prisma.foodTruckStop.findMany({
        where: { tenantId: params.id },
        select: { id: true },
      })
    ).map((r) => r.id);

    const idsToDelete = existingIds.filter((id) => !incomingIds.has(id));

    await prisma.$transaction([
      ...(idsToDelete.length > 0
        ? [prisma.foodTruckStop.deleteMany({ where: { tenantId: params.id, id: { in: idsToDelete } } })]
        : []),
      ...body.stops.map((s) => {
        const data = {
          tenantId: params.id,
          stopDate: new Date(s.stopDate + 'T00:00:00Z'),
          locationName: s.locationName ?? null,
          address: s.address,
          openTime: s.openTime,
          closeTime: s.closeTime,
          note: s.note ?? null,
          isActive: s.isActive ?? true,
        };
        if (s.id) {
          return prisma.foodTruckStop.update({ where: { id: s.id }, data });
        }
        return prisma.foodTruckStop.create({ data });
      }),
    ]);

    const rows = await prisma.foodTruckStop.findMany({
      where: { tenantId: params.id },
      orderBy: [{ stopDate: 'asc' }, { openTime: 'asc' }],
    });
    return apiSuccess({ stops: rows.map(serialize) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '), 400);
    }
    console.error('[PUT /api/tenants/:id/food-truck-schedule] failed', err);
    return apiError('Internal server error', 500);
  }
}
