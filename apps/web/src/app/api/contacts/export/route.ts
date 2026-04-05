import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiError } from '@/lib/server/response';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  const tenantId = new URL(request.url).searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId is required', 400);

  const contacts = await prisma.contact.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });

  const escape = (val: string | null | undefined) => {
    if (val == null) return '';
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const header = 'id,phone,name,email,status,tags,totalOrders,totalSpent,lastContactAt,createdAt';
  const rows = contacts.map((c) =>
    [
      escape(c.id),
      escape(c.phone),
      escape(c.name),
      escape(c.email),
      escape(c.status),
      escape(c.tags.join(';')),
      c.totalOrders,
      c.totalSpent,
      escape(c.lastContactAt?.toISOString()),
      escape(c.createdAt.toISOString()),
    ].join(',')
  );

  const csv = [header, ...rows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="contacts.csv"',
    },
  });
}
