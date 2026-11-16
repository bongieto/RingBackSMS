/**
 * Real-traffic accuracy eval — case format and result types.
 *
 * A "case" is a single inbound-SMS turn captured from production logs
 * (Axiom queries emit one of these per turn). The harness replays each
 * case through the current flow engine and compares the engine's output
 * to what the bot historically did. Aggregated results size where the
 * new accuracy work changes behavior.
 *
 * Case JSON is canonical wire format — the team shapes their Axiom
 * query to emit these fields, drops the NDJSON into a file, runs
 * `pnpm eval:replay`. Keep field names stable; readers parse them.
 */
import type { FlowType } from '@ringback/shared-types';
import type { CallerMemory } from '../types';

/** One inbound-SMS turn captured from production. Every field marked
 *  optional gracefully degrades the grader (it just doesn't score the
 *  missing dimension). */
export interface RealTrafficCase {
  /** Stable id so failures point at a specific row. Use Axiom's
   *  message id or message_sid; falls back to row index. */
  id: string;
  tenantId: string;
  tenantName: string;
  callerPhone: string;

  /** The customer's inbound SMS that triggered this turn. */
  inboundMessage: string;

  /** Prior turns (oldest → newest). Used by the engine for context.
   *  Cap to the last 6 — the engine ignores anything older. */
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;

  /** Snapshot of CallerMemory at the time of the original turn. The
   *  most important field for grading is `activeOrder.estimatedReadyTime`
   *  — it's what the fact verifier compares against. */
  callerMemorySnapshot?: CallerMemory;

  /** Minimum tenant config we need to reconstruct a usable TenantContext.
   *  Loose JSON because production has a wider config surface than the
   *  engine reads. Unknown fields are passed through to the engine. */
  tenantConfigSnapshot?: Record<string, unknown>;

  /** Enabled flows at the time of the original turn. */
  enabledFlowTypes?: FlowType[];

  /** Tenant's POS/menu items at the time. Optional — flows that don't
   *  reach the order agent ignore this. */
  menuItemsSnapshot?: Array<Record<string, unknown>>;

  /** Hours info at the time (openNow + a couple display strings).
   *  Needed for fallback-flow scenarios; optional otherwise. */
  hoursInfoSnapshot?: {
    openNow: boolean;
    nextOpenDisplay?: string | null;
    todayHoursDisplay?: string;
    weeklyHoursDisplay?: string;
    minutesUntilClose?: number | null;
    closesAtDisplay?: string | null;
    closingSoon?: boolean;
  };

  // ── Ground truth: what the bot actually did ──────────────────────────

  /** The reply the bot sent in production. */
  originalReply: string;
  originalFlowType?: FlowType;
  originalDecisions?: Array<{ handler?: string; outcome?: string }>;

  // ── Optional human label (for hand-reviewed cases) ───────────────────
  humanLabel?: {
    /** A reviewer's verdict on this turn: did the bot get it right? */
    verdict?: 'correct' | 'incorrect' | 'ambiguous';
    /** What the engine SHOULD have routed to. */
    expectedFlowType?: FlowType;
    /** Whether the reply should have been a deflection (not LLM). */
    expectedDeflection?: boolean;
    /** Free-text reviewer note. */
    notes?: string;
  };
}

/** Result of replaying one case through the current engine. */
export interface ReplayResult {
  caseId: string;
  ok: boolean;
  /** Populated only when ok=false. */
  error?: string;
  /** What the current engine produced. */
  current?: {
    reply: string;
    flowType: FlowType;
    flowStep: string | null;
    sideEffectTypes: string[];
    decisions: Array<{ handler?: string; outcome?: string }>;
  };
}

/** Per-case grader output — small, structured, easy to aggregate. */
export interface CaseGrade {
  caseId: string;
  /** True when every checked dimension passes. */
  pass: boolean;
  /** Dimension-by-dimension findings. Each `passed=false` is rendered
   *  in the report. */
  dimensions: Array<{
    name:
      | 'flow_type_agreement'
      | 'human_label_match'
      | 'reply_length_parity'
      | 'reply_token_overlap'
      | 'new_decision_outcomes'
      | 'guard_newly_triggered';
    passed: boolean;
    detail?: string;
  }>;
  /** Outcomes the current engine emitted that the original didn't.
   *  Examples: 'eta_rewritten', 'deflected_pii_change'. These are the
   *  signal we're looking for. */
  newOutcomes: string[];
}

/** Aggregate report shape returned by `aggregateReport(grades, cases, results)`. */
export interface AggregateReport {
  total: number;
  ok: number;
  errors: number;
  passed: number;
  /** Per-flowType: how often we agreed with the original. */
  flowTypeAgreement: Record<string, { agree: number; total: number }>;
  /** Per-outcome: how often the current engine emitted a decision that
   *  did NOT appear in the original. */
  newOutcomeCounts: Record<string, number>;
  /** Reply-length distribution shift summary (median ratio). */
  replyLengthMedianRatio: number;
  /** First N case failures, for the report tail. */
  sampleFailures: CaseGrade[];
}
