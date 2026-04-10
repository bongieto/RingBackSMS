import { prisma } from '@/lib/server/db';
import { apiSuccess } from '@/lib/server/response';

export const dynamic = 'force-dynamic';

export async function GET() {
  const templates = await prisma.industryTemplate.findMany({
    select: {
      industryKey: true,
      industryLabel: true,
      capabilityList: true,
      followupOpenerDefault: true,
    },
    orderBy: { industryLabel: 'asc' },
  });
  return apiSuccess(templates);
}
