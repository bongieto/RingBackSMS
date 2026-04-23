/**
 * Redis-backed cache for the TenantContext hot-path fetch.
 *
 * Every inbound SMS turns into a single `prisma.tenant.findUnique` with
 * four includes (config, flows, menuItems, and nested modifierGroups +
 * modifiers). On a tenant with a full menu and an active order flow
 * that's a chunky query — and it runs unchanged for every SMS, even
 * back-to-back messages from the same caller. This cache collapses
 * bursts of traffic down to a single DB hit per tenant per TTL window.
 *
 * Design:
 *   - Short TTL (60s). Operators editing config in the dashboard want
 *     their change to propagate quickly; 60s is the ceiling without
 *     invalidation. Explicit `invalidateTenantContext(tenantId)` calls
 *     at the highest-impact mutation sites (greeting copy, POS tokens,
 *     flow enable/disable) push the floor to "immediately".
 *   - Version key — we bump the namespace when the cached shape
 *     changes incompatibly, so a rolling deploy can't read back a
 *     payload the new code can't parse.
 *   - Fail-safe — any Redis error reads-through to the DB and returns
 *     the fresh value. A flaky Redis must never drop inbound SMS on
 *     the floor.
 */
import type { TenantContext } from '@ringback/flow-engine';
import { FlowType } from '@ringback/shared-types';
import { prisma } from '../db';
import { logger } from '../logger';
import { buildRedisOptions } from '../redisConfig';
import { Redis } from 'ioredis';

// Bump this when the cached payload shape changes (field added, type
// switched). Stale payloads keyed under older versions simply expire.
const CACHE_VERSION = 'v1';
const DEFAULT_TTL_SECONDS = 60;

let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(buildRedisOptions());
    redisClient.on('error', (err) =>
      logger.warn('tenantContextCache redis error', { err: err.message }),
    );
  }
  return redisClient;
}

function cacheKey(tenantId: string): string {
  return `tenantctx:${CACHE_VERSION}:${tenantId}`;
}

/**
 * Fetch a tenant's full flow-engine context. Returns the cached payload
 * if present, otherwise loads + caches for DEFAULT_TTL_SECONDS.
 *
 * Returns null when the tenant is missing OR has no config row — the
 * flow-engine service short-circuits in both cases.
 *
 * The returned object is the SAME shape as the previous inline query
 * in processInboundSms; callers swap the inline query for this one
 * without other changes.
 */
export async function getCachedTenantForFlowEngine(
  tenantId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<CachedTenantPayload | null> {
  // ── Try cache ──
  try {
    const redis = getRedis();
    const raw = await redis.get(cacheKey(tenantId));
    if (raw) {
      const parsed = JSON.parse(raw) as CachedTenantPayload;
      // Dates come back as strings over JSON — rehydrate the few
      // fields the flow engine touches as Date objects.
      rehydrateDates(parsed);
      return parsed;
    }
  } catch (err) {
    logger.warn('tenantContextCache read failed, reading through to DB', {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Miss / error: load from DB ──
  const fresh = await loadTenantFromDb(tenantId);
  if (!fresh) return null;

  // ── Best-effort write-back ──
  try {
    const redis = getRedis();
    await redis.set(
      cacheKey(tenantId),
      JSON.stringify(fresh),
      'EX',
      ttlSeconds,
    );
  } catch (err) {
    logger.warn('tenantContextCache write failed (will refetch next turn)', {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return fresh;
}

/**
 * Invalidate a tenant's cached context. Called from mutation sites that
 * change any field the flow engine consumes (greeting, business hours,
 * POS tokens, flow enable/disable, menu items, sales tax rate, etc.).
 *
 * Fail-safe: any error here degrades to "readers will see stale data
 * until TTL elapses." The alternative — throwing — would turn a cache
 * blip into a dashboard 500.
 */
export async function invalidateTenantContext(tenantId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(cacheKey(tenantId));
  } catch (err) {
    logger.warn('tenantContextCache invalidate failed (stale until TTL)', {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ──────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────

/** Shape we cache. Mirrors the prisma.tenant.findUnique include used by
 *  the old inline query, kept Typed-enough that the caller doesn't need
 *  casts beyond what it already did. */
export interface CachedTenantPayload {
  id: string;
  name: string;
  slug: string | null;
  twilioPhoneNumber: string | null;
  config: any; // TenantConfig row — serializable; flow-engine casts it anyway.
  flows: any[];
  menuItems: any[];
}

async function loadTenantFromDb(tenantId: string): Promise<CachedTenantPayload | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      config: true,
      flows: { where: { isEnabled: true } },
      menuItems: {
        where: { isAvailable: true, posDeletedAt: null },
        include: {
          categoryRef: { select: { isAvailable: true } },
          modifierGroups: {
            include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  });
  if (!tenant || !tenant.config) return null;
  return tenant as unknown as CachedTenantPayload;
}

/**
 * Turn ISO strings back into Date where the caller expects Date
 * instances (flow-engine reads MenuItem.lastSyncedAt as Date | null;
 * Flow.createdAt / .updatedAt are Dates). Operate in place — the
 * cached payload doesn't leak outside this module so mutation is safe.
 */
function rehydrateDates(payload: CachedTenantPayload): void {
  for (const flow of payload.flows) {
    if (typeof flow.createdAt === 'string') flow.createdAt = new Date(flow.createdAt);
    if (typeof flow.updatedAt === 'string') flow.updatedAt = new Date(flow.updatedAt);
  }
  for (const item of payload.menuItems) {
    if (typeof item.createdAt === 'string') item.createdAt = new Date(item.createdAt);
    if (typeof item.updatedAt === 'string') item.updatedAt = new Date(item.updatedAt);
    if (typeof item.lastSyncedAt === 'string') item.lastSyncedAt = new Date(item.lastSyncedAt);
    if (typeof item.posDeletedAt === 'string') item.posDeletedAt = new Date(item.posDeletedAt);
  }
  if (payload.config) {
    if (typeof payload.config.createdAt === 'string') payload.config.createdAt = new Date(payload.config.createdAt);
    if (typeof payload.config.updatedAt === 'string') payload.config.updatedAt = new Date(payload.config.updatedAt);
  }
}

// Silence unused-import warning; TenantContext is referenced in docs above.
export type __TenantContext = TenantContext;
