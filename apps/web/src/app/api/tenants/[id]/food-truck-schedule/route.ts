import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { z } from 'zod';

const DayRow = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  locationName: z.string().nullable().optional(),
  address: z.string(),
  openTime: z.string(),
  closeTime: z.string(),
  note: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const PutSchema = z.object({ days: z.array(DayRow) });

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const rows = await prisma.foodTruckSchedule.findMany({
      where: { tenantId: params.id },
      orderBy: { dayOfWeek: 'asc' },
    });
    return apiSuccess(rows);
  } catch (err) {
    return apiError('Internal server error', 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const { days } = PutSchema.parse(await req.json());
    await prisma.$transaction(
      days.map((d) =>
        prisma.foodTruckSchedule.upsert({
          where: { tenantId_dayOfWeek: { tenantId: params.id, dayOfWeek: d.dayOfWeek } },
          create: {
            tenantId: params.id,
            dayOfWeek: d.dayOfWeek,
            locationName: d.locationName ?? null,
            address: d.address,
            openTime: d.openTime,
            closeTime: d.closeTime,
            note: d.note ?? null,
            isActive: d.isActive ?? true,
          },
          update: {
            locationName: d.locationName ?? null,
            address: d.address,
            openTime: d.openTime,
            closeTime: d.closeTime,
            note: d.note ?? null,
            isActive: d.isActive ?? true,
          },
        })
      )
    );
    const rows = await prisma.foodTruckSchedule.findMany({
      where: { tenantId: params.id },
      orderBy: { dayOfWeek: 'asc' },
    });
    return apiSuccess(rows);
  } catch (err) {
    return apiError('Invalid request', 400);
  }
}
