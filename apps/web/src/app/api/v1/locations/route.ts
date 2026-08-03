import { NextRequest } from 'next/server';
import { CommerceScopes } from '@ringback/shared-types';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { commerceError, commerceResponse } from '@/lib/server/commerce/http';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.MENU_READ]);
    const locations = await prisma.tenantLocation.findMany({
      where: { tenantId: auth.tenantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, address: true, phone: true, timezone: true, updatedAt: true },
    });
    return commerceResponse(locations);
  } catch (error) {
    logger.warn('Commerce locations request failed', { error });
    return commerceError(error);
  }
}
