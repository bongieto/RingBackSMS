/**
 * Turn Record observation layer — shared types.
 *
 * A "Turn" is one inbound-SMS -> outcome cycle. Every call to
 * processInboundSms produces exactly one Turn row and N Decision rows
 * capturing the handler chain's reasoning. Flow handlers live in
 * @ringback/flow-engine (no Prisma dep), so decisions flow upward via a
 * plain array threaded through FlowInput; apps/web owns persistence.
 *
 * These types are the contract between the two packages.
 */

export type DecisionPhase = 'PRE_HANDLER' | 'FLOW' | 'POST_HANDLER';

export interface DecisionDraft {
  /** Stable handler identifier, e.g. "checkSuppression" or "orderAgent". */
  handler: string;
  phase: DecisionPhase;
  /** Handler-specific outcome tag, e.g. "suppressed_silent", "hit", "miss". */
  outcome: string;
  /** Human-readable one-liner. Optional. */
  reason?: string;
  /**
   * Structured evidence the handler used. Keep small (<1KB). Must be
   * JSON-serializable — Prisma persists this as Json.
   */
  evidence?: Record<string, unknown>;
  /** Wall-clock duration spent inside this handler. */
  durationMs: number;
}

/**
 * Terminal state of a Turn. SUPPRESSED_* values are distinct from
 * REPLIED-with-empty-body so dashboards can separate "we stayed quiet on
 * purpose" from "we replied with a zero-length message".
 */
export type TurnOutcome =
  | 'REPLIED'
  | 'DEFLECTED'
  | 'SUPPRESSED_COMPLIANCE'
  | 'SUPPRESSED_RATE_LIMIT'
  | 'SUPPRESSED_DUPLICATE'
  | 'HANDED_OFF_TO_HUMAN'
  | 'QUEUED_FOR_BUSINESS_HOURS'
  | 'ERROR_LLM_TIMEOUT'
  | 'ERROR_LLM_REFUSED'
  | 'ERROR_HANDLER_THREW'
  | 'ERROR_UNHANDLED';

export type TurnDirection = 'INBOUND' | 'OUTBOUND_PROACTIVE';
