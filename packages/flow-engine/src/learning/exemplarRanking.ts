/**
 * Pure ranking logic for handoff exemplars — kept in the flow engine so
 * it has no DB dependency and can be unit-tested in isolation.
 *
 * Strategy: Jaccard token overlap between the new inbound and each
 * candidate exemplar's recorded inbound. Cheap (no embeddings needed
 * for v1), deterministic, and good enough to surface "asked about
 * delivery" style matches. Once we have signal from P5 on what kinds
 * of matches actually help, we can swap in embeddings without touching
 * the public surface.
 */

export interface ExemplarCandidate {
  id: string;
  inboundMessage: string;
  humanReply: string;
}

export interface RankedExemplar extends ExemplarCandidate {
  score: number;
}

/** Tokenize a message: lowercase, drop punctuation, drop stop-words and
 *  short tokens. Stop-word list is short on purpose — most of the
 *  signal lives in nouns/verbs ("delivery", "refund", "address"). */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'and', 'or', 'but', 'in', 'on', 'at', 'for',
  'with', 'by', 'from', 'as', 'i', 'me', 'my', 'you', 'your',
  'we', 'our', 'us', 'this', 'that', 'these', 'those', 'it',
  'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could',
  'would', 'should', 'will', 'just', 'so', 'if', 'what', 'how',
]);

export function tokenize(message: string): Set<string> {
  return new Set(
    message
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t)),
  );
}

/** Jaccard similarity of two token sets in [0, 1]. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/** Rank candidates by Jaccard overlap with the inbound. Returns top-k
 *  with score > minScore. A minScore floor matters — otherwise we'd
 *  inject irrelevant exemplars that just confuse the model. */
export function rankExemplars(
  inboundMessage: string,
  candidates: ExemplarCandidate[],
  options: { limit?: number; minScore?: number } = {},
): RankedExemplar[] {
  const limit = options.limit ?? 3;
  const minScore = options.minScore ?? 0.15;

  const queryTokens = tokenize(inboundMessage);
  if (queryTokens.size === 0) return [];

  return candidates
    .map((c) => ({ ...c, score: jaccard(queryTokens, tokenize(c.inboundMessage)) }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Format ranked exemplars as a prompt block. Returns empty string when
 *  there are none, so callers can string-concat unconditionally. */
export function formatExemplarsForPrompt(ranked: RankedExemplar[]): string {
  if (ranked.length === 0) return '';
  const lines = ranked.map((e, i) => {
    const inbound = e.inboundMessage.replace(/\s+/g, ' ').trim().slice(0, 200);
    const reply = e.humanReply.replace(/\s+/g, ' ').trim().slice(0, 240);
    return `${i + 1}. Customer: ${inbound}\n   Our reply: ${reply}`;
  });
  return [
    '',
    'How our team has handled similar messages recently (use these as',
    'guidance — they reflect how we actually answer; never invent facts',
    "beyond what's stated here):",
    ...lines,
  ].join('\n');
}
