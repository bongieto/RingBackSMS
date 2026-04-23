/**
 * Canonical outcome strings for DecisionDraft.outcome.
 *
 * `outcome` used to be a free-form string, which meant typos silently
 * broke analytics queries ("refuesd_closed" vs. "refused_closed" is a
 * dashboard regression that only shows up weeks later when someone asks
 * "how many closed-hour refusals did we have last quarter?"). Routing
 * the known outcomes through a `const` object gives us:
 *
 *   - IDE autocomplete at the push-site.
 *   - A compile-time check that handlers don't diverge from dashboards.
 *   - A single place to document what each tag means and when it fires.
 *
 * DecisionDraft.outcome intentionally stays `string` rather than a
 * `DecisionOutcome` union — handlers sometimes emit genuinely novel
 * outcome tags before they're canonical, and flipping to a union would
 * force every new tag to ship in two packages at once. The convention:
 * use `DecisionOutcomes.FOO` wherever a canonical tag exists, and add
 * new tags here as they graduate from experimental.
 */

export const DecisionOutcomes = {
  // ── PRE_HANDLER: dedup, rate limit, compliance ──────────────────────
  /** Handler ran but did not match — pass the message through. */
  MISS: 'miss',
  /** This inbound message sid was already processed. */
  SUPPRESSED_DUPLICATE: 'suppressed_duplicate',
  /** Caller state was stale (>30 min) and discarded. */
  DISCARDED: 'discarded',
  /** Conversation is in HUMAN handoff — AI path skipped. */
  HANDED_OFF_TO_HUMAN: 'handed_off_to_human',

  // ── FLOW: routing ───────────────────────────────────────────────────
  /** A flow handler was entered (as distinct from matched-but-skipped). */
  ENTERED: 'entered',
  /** Tool-use LLM client wasn't injected — fell back to regex orderFlow. */
  FALLBACK_NO_TOOL_CLIENT: 'fallback_no_tool_client',

  // ── ORDER: hard gates ───────────────────────────────────────────────
  /** Hard closed-hours gate fired. Overrides acceptClosedHourOrders. */
  REFUSED_CLOSED: 'refused_closed',
  /** Customer said "yes" but name or pickup is still missing. */
  CONFIRM_BLOCKED_MISSING_SLOT: 'confirm_blocked_missing_slot',

  // ── ORDER: strict-sequence enforcer ─────────────────────────────────
  /** LLM tried to skip a slot; enforcer forced flowStep to the gap. */
  SEQUENCE_CORRECTED: 'sequence_corrected',
  /** Bare-name regex captured a customer name the LLM missed. */
  NAME_CAPTURED_BY_REGEX: 'name_captured_by_regex',
} as const;

export type DecisionOutcome =
  (typeof DecisionOutcomes)[keyof typeof DecisionOutcomes];
