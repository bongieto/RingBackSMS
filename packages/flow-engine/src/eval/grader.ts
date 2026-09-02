/**
 * Deterministic grader for replay results.
 *
 * Each dimension is a separate function so individual scores are easy
 * to inspect, and the per-case grade is composed by `gradeCase`. The
 * point isn't binary pass/fail — it's surfacing *where* the current
 * engine behaves differently than the original, so the team can decide
 * whether the diff is an improvement (good — that's the whole point of
 * the new accuracy work) or a regression.
 */
import type { CaseGrade, RealTrafficCase, ReplayResult } from './types';

/** Token overlap between two strings, normalized to [0, 1]. Empty
 *  strings → 1 (vacuous agreement, doesn't penalize the cell). */
export function tokenOverlap(a: string, b: string): number {
  const norm = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1),
    );
  const A = norm(a);
  const B = norm(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let intersect = 0;
  for (const t of A) if (B.has(t)) intersect++;
  const union = A.size + B.size - intersect;
  return union === 0 ? 1 : intersect / union;
}

/** Compute outcomes the current engine emitted that the original did
 *  not. These are the signal: P3's `eta_rewritten`, `deflected_pii_change`,
 *  P4's `intent_*` decisions, etc. */
export function findNewOutcomes(
  current: Array<{ outcome?: string }>,
  original: Array<{ outcome?: string }> | undefined,
): string[] {
  const originalSet = new Set(
    (original ?? []).map((d) => d.outcome).filter((o): o is string => Boolean(o)),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of current) {
    const o = d.outcome;
    if (!o) continue;
    if (originalSet.has(o)) continue;
    if (seen.has(o)) continue;
    seen.add(o);
    out.push(o);
  }
  return out;
}

/** A guard fired in the current run that the original didn't have. */
const GUARD_OUTCOME_RE =
  /^(deflected_|blocked_|rewrote_unsupported_claim|eta_rewritten|hours_claim_detected|address_claim_detected|phone_claim_detected)/;
export function newGuardFired(newOutcomes: string[]): boolean {
  return newOutcomes.some((o) => GUARD_OUTCOME_RE.test(o));
}

const REPLY_LENGTH_TOLERANCE = 0.5; // ±50% length

export interface GradeOptions {
  /** Tokens overlap threshold for reply_token_overlap dimension.
   *  Default 0.3 — generous because LLM phrasing varies turn to turn. */
  tokenOverlapThreshold?: number;
}

export function gradeCase(
  c: RealTrafficCase,
  r: ReplayResult,
  options: GradeOptions = {},
): CaseGrade {
  const dims: CaseGrade['dimensions'] = [];

  if (!r.ok || !r.current) {
    return {
      caseId: c.id,
      pass: false,
      dimensions: [
        { name: 'flow_type_agreement', passed: false, detail: r.error ?? 'replay failed' },
      ],
      newOutcomes: [],
    };
  }

  // Flow type agreement (skipped if the case didn't record one).
  if (c.originalFlowType) {
    const passed = r.current.flowType === c.originalFlowType;
    dims.push({
      name: 'flow_type_agreement',
      passed,
      detail: passed
        ? undefined
        : `current=${r.current.flowType} vs original=${c.originalFlowType}`,
    });
  }

  // Human label (if a reviewer marked the case).
  if (c.humanLabel?.expectedFlowType) {
    const passed = r.current.flowType === c.humanLabel.expectedFlowType;
    dims.push({
      name: 'human_label_match',
      passed,
      detail: passed
        ? undefined
        : `current=${r.current.flowType} vs reviewer-expected=${c.humanLabel.expectedFlowType}`,
    });
  }

  // Reply length parity — catches truncation/expansion regressions.
  const origLen = c.originalReply.length || 1;
  const newLen = r.current.reply.length;
  const ratio = newLen / origLen;
  const lengthPass = ratio >= 1 - REPLY_LENGTH_TOLERANCE && ratio <= 1 + REPLY_LENGTH_TOLERANCE;
  dims.push({
    name: 'reply_length_parity',
    passed: lengthPass,
    detail: lengthPass
      ? undefined
      : `length ratio ${ratio.toFixed(2)} (current=${newLen}, original=${origLen})`,
  });

  // Reply token overlap (Jaccard). Skipped on empty original.
  if (c.originalReply.trim().length > 0) {
    const overlap = tokenOverlap(c.originalReply, r.current.reply);
    const threshold = options.tokenOverlapThreshold ?? 0.3;
    const passed = overlap >= threshold;
    dims.push({
      name: 'reply_token_overlap',
      passed,
      detail: passed ? undefined : `overlap ${overlap.toFixed(2)} < ${threshold.toFixed(2)}`,
    });
  }

  // New decision outcomes — informational, doesn't fail the case.
  const newOutcomes = findNewOutcomes(r.current.decisions, c.originalDecisions);
  dims.push({
    name: 'new_decision_outcomes',
    passed: true,
    detail: newOutcomes.length > 0 ? newOutcomes.join(',') : undefined,
  });

  // Guard newly triggered — informational. Often a sign the new work is
  // catching something the original missed.
  const guardFired = newGuardFired(newOutcomes);
  dims.push({
    name: 'guard_newly_triggered',
    passed: true,
    detail: guardFired ? newOutcomes.filter((o) => GUARD_OUTCOME_RE.test(o)).join(',') : undefined,
  });

  return {
    caseId: c.id,
    pass: dims.every((d) => d.passed),
    dimensions: dims,
    newOutcomes,
  };
}
