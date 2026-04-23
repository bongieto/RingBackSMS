/**
 * Audit-log writer for tenant configuration changes.
 *
 * The original system had no way to answer "who changed this tenant's
 * greeting last Tuesday?" — dashboard saves and super-admin edits left
 * no trail. This module is the write side; consumers (dashboard drawer,
 * audit export CSV, compliance workflows) read from ConfigAuditLog.
 *
 * Design:
 *   - Pure additive — we never update or delete rows. An operator
 *     reviewing a suspected misconfiguration needs the full history,
 *     including since-reverted states.
 *   - Best-effort — if the insert fails we log and swallow. Missing an
 *     audit row is less bad than taking the mutation endpoint down
 *     because Postgres is flaky. Alerting on audit-write failure rates
 *     is a follow-up.
 *   - Diffs as `{ field: { before, after } }`. Fields absent from the
 *     diff were not touched. Callers pass a diff OR the pair of
 *     {before, after} records and we compute the diff.
 */
import { prisma } from '../db';
import { logger } from '../logger';

export type ConfigAuditActor = string;  // 'clerk:<userId>' | 'system:<name>'

export interface ConfigAuditEntry {
  tenantId: string;
  actor: ConfigAuditActor;
  action: string;                        // free-form, stable tag: 'tenant.update', 'config.update', etc.
  entity: string;                        // 'Tenant' | 'TenantConfig' | 'MenuItem' | ...
  entityId?: string | null;
  /** Either a pre-computed diff or the pair of records. */
  changes: Record<string, { before: unknown; after: unknown }>;
}

/**
 * Compute a field-level diff between `before` and `after` snapshots.
 * Returns only fields whose serialized form differs. Arrays and nested
 * objects are compared by JSON identity — good enough for flat config
 * columns; if a field is a deeply-nested structure, pass the diff
 * directly instead.
 */
export function diffRecords(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  opts: { only?: string[]; skip?: string[] } = {},
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    if (opts.only && !opts.only.includes(key)) continue;
    if (opts.skip && opts.skip.includes(key)) continue;
    const b = before?.[key];
    const a = after?.[key];
    if (serialize(b) !== serialize(a)) {
      diff[key] = { before: b, after: a };
    }
  }
  return diff;
}

function serialize(v: unknown): string {
  // Stable stringify — sort keys so object insertion order doesn't
  // produce false "changed" diffs. Primitives fall through to
  // JSON.stringify directly.
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return JSON.stringify(v.map(serialize));
  const entries = Object.entries(v as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b));
  return '{' + entries.map(([k, val]) => `${JSON.stringify(k)}:${serialize(val)}`).join(',') + '}';
}

/**
 * Persist an audit entry. Swallows its own errors (see module docstring).
 * Skips the write entirely when `changes` is empty so a no-op PATCH
 * doesn't pollute the timeline.
 */
export async function recordConfigAudit(entry: ConfigAuditEntry): Promise<void> {
  if (!entry.changes || Object.keys(entry.changes).length === 0) return;
  try {
    await prisma.configAuditLog.create({
      data: {
        tenantId: entry.tenantId,
        actor: entry.actor,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        changes: entry.changes as never,
      },
    });
  } catch (err) {
    logger.error('recordConfigAudit failed (mutation still applied)', {
      err: err instanceof Error ? err.message : String(err),
      tenantId: entry.tenantId,
      action: entry.action,
    });
  }
}

/** Convenience: "clerk:<userId>" formatting used consistently across callers. */
export function actorFromClerk(userId: string | null | undefined): ConfigAuditActor {
  return userId ? `clerk:${userId}` : 'system:unknown';
}
