import { PrismaClient } from '@prisma/client';
import { posRegistry } from './registry';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Finds all tenants whose POS token expires within the next 24 hours
 * and attempts to refresh their tokens via the appropriate adapter.
 *
 * Designed to be called on an interval (e.g. setInterval in index.ts).
 */
export async function refreshExpiringPosTokens(): Promise<void> {
  const now = new Date();
  const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // now + 24h

  try {
    const tenants = await prisma.tenant.findMany({
      where: {
        posProvider: { not: null },
        posTokenExpiresAt: {
          not: null,
          lt: threshold,
        },
      },
      select: {
        id: true,
        posProvider: true,
        posTokenExpiresAt: true,
      },
    });

    if (tenants.length === 0) {
      logger.debug('No POS tokens need refreshing');
      return;
    }

    logger.info('Starting POS token refresh job', {
      tenantsToRefresh: tenants.length,
    });

    let successCount = 0;
    let failCount = 0;

    for (const tenant of tenants) {
      const provider = tenant.posProvider!;
      try {
        const adapter = posRegistry.get(provider);
        await adapter.refreshToken(tenant.id);
        successCount++;
        logger.info('POS token refreshed successfully', {
          tenantId: tenant.id,
          provider,
        });
      } catch (err) {
        failCount++;
        logger.error('Failed to refresh POS token', {
          tenantId: tenant.id,
          provider,
          error: (err as Error).message,
        });
      }
    }

    logger.info('POS token refresh job completed', {
      total: tenants.length,
      success: successCount,
      failed: failCount,
    });
  } catch (err) {
    logger.error('POS token refresh job failed', {
      error: (err as Error).message,
    });
  }
}
