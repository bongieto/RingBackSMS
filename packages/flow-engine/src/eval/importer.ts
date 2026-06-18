/**
 * Parse an NDJSON file of RealTrafficCase rows.
 *
 * We accept two shapes per line, transparently:
 *
 *  1. Native — a JSON object that already matches RealTrafficCase.
 *  2. Axiom — a JSON object with the team's Axiom log fields (which
 *     don't exactly match our case format). The mapper below extracts
 *     the fields we know about; unrecognized fields are dropped.
 *
 * Lines that fail to parse are reported as ImportError records; the
 * caller decides whether to abort or skip them.
 */
import type { FlowType } from '@ringback/shared-types';
import type { RealTrafficCase } from './types';

export interface ImportError {
  lineNumber: number;
  reason: string;
  rawLine: string;
}

export interface ImportResult {
  cases: RealTrafficCase[];
  errors: ImportError[];
}

/** Map a single JSON object to a RealTrafficCase. Heuristic — checks
 *  for native fields first, falls back to Axiom-style fields. */
export function mapRowToCase(row: unknown, index: number): RealTrafficCase | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;

  // Native: case already has the canonical shape.
  if (
    typeof r.id === 'string' &&
    typeof r.tenantId === 'string' &&
    typeof r.inboundMessage === 'string' &&
    typeof r.originalReply === 'string'
  ) {
    return r as unknown as RealTrafficCase;
  }

  // Axiom-style. Pull out what we know about; fall back to defaults.
  const inboundMessage =
    (r.inboundMessage as string | undefined) ??
    (r.Body as string | undefined) ??
    (r.body as string | undefined);
  const callerPhone =
    (r.callerPhone as string | undefined) ??
    (r.From as string | undefined) ??
    (r.from as string | undefined);
  const originalReply =
    (r.originalReply as string | undefined) ??
    (r.botReply as string | undefined) ??
    (r.smsReply as string | undefined) ??
    (r.reply as string | undefined);
  const tenantId = (r.tenantId as string | undefined) ?? (r.tenant_id as string | undefined);

  if (!inboundMessage || !callerPhone || !originalReply || !tenantId) {
    return null;
  }

  const id =
    (r.id as string | undefined) ??
    (r.messageSid as string | undefined) ??
    (r.MessageSid as string | undefined) ??
    `row-${index}`;

  const tenantName =
    (r.tenantName as string | undefined) ??
    (r.tenant_name as string | undefined) ??
    'Unknown Tenant';

  return {
    id,
    tenantId,
    tenantName,
    callerPhone,
    inboundMessage,
    originalReply,
    recentMessages: r.recentMessages as RealTrafficCase['recentMessages'],
    callerMemorySnapshot: r.callerMemorySnapshot as RealTrafficCase['callerMemorySnapshot'],
    tenantConfigSnapshot: r.tenantConfigSnapshot as RealTrafficCase['tenantConfigSnapshot'],
    enabledFlowTypes: r.enabledFlowTypes as FlowType[] | undefined,
    menuItemsSnapshot: r.menuItemsSnapshot as RealTrafficCase['menuItemsSnapshot'],
    hoursInfoSnapshot: r.hoursInfoSnapshot as RealTrafficCase['hoursInfoSnapshot'],
    originalFlowType: r.originalFlowType as FlowType | undefined,
    originalDecisions: r.originalDecisions as RealTrafficCase['originalDecisions'],
    humanLabel: r.humanLabel as RealTrafficCase['humanLabel'],
  };
}

/** Parse a string of NDJSON content (one JSON object per line). Empty
 *  lines and comment lines starting with `//` are skipped. */
export function parseNdjson(content: string): ImportResult {
  const cases: RealTrafficCase[] = [];
  const errors: ImportError[] = [];

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('//')) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      errors.push({
        lineNumber: i + 1,
        reason: `JSON parse failed: ${(e as Error).message}`,
        rawLine: trimmed.slice(0, 200),
      });
      continue;
    }

    const c = mapRowToCase(parsed, i);
    if (!c) {
      errors.push({
        lineNumber: i + 1,
        reason:
          'missing required fields (tenantId, callerPhone, inboundMessage, originalReply)',
        rawLine: trimmed.slice(0, 200),
      });
      continue;
    }
    cases.push(c);
  }

  return { cases, errors };
}
