/**
 * Cheap language detector used as a one-shot gate: does THIS inbound
 * message appear to be in a language we don't support?
 *
 * History: we used to detect Spanish / Tagalog and reply in-language,
 * with sticky per-contact language storage. That approach produced
 * four consecutive regression rounds (markers colliding with menu
 * item names, bilingual sentences flipping language mid-convo, LLM
 * behavior varying under multilingual prompt load). We pulled the
 * plug on foreign-language support — the bot now answers in English
 * only, and when we detect a clearly non-English message we reply
 * with a fixed "we only speak English" apology.
 *
 * This function is intentionally kept simple: scan the current
 * message for marker tokens; no stickiness, no cross-turn state. The
 * caller invokes it per-turn and acts on the result directly.
 *
 * Tested targets: Spanish (es) and Tagalog (tl). Adding another
 * language is a matter of adding a marker list — the short-circuit
 * behavior in the host app doesn't need to change.
 */
// IMPORTANT: never include FOOD names here, even if they're loanwords
// from the target language. "lumpia", "adobo", "pancit", "tacos",
// "pollo", "arroz", "prito" etc. show up on English-language
// restaurant menus and get ordered by customers of every background.
// Real-world bugs this caused:
//   - "The Lumpia House" customers sent first SMS containing "lumpia"
//     and got flipped to Tagalog for the rest of the session.
//   - "wheres my lumpia prito?" (plain English) detected as Tagalog
//     because "prito" was in the marker list as a "cooking method".
// Markers must be LANGUAGE signals — greetings, particles, function
// words — not menu items or cooking verbs.
const ES_MARKERS = [
  'hola', 'gracias', 'por favor', 'quiero', 'quisiera', 'necesito',
  'tengo', 'esta', 'estoy', 'está', 'pedido', 'cuánto', 'cuanto',
  'dónde', 'donde', 'cuándo', 'cuando', 'para mí', 'para mi',
  'buenas', 'buenos dias', 'buenas tardes', 'buenas noches',
];

const TL_MARKERS = [
  'salamat', 'kumusta', 'kamusta', 'paki', 'pabili', 'gusto ko',
  'meron ba', 'meron', 'wala', 'ilan', 'magkano', 'pwede', 'puwede',
  'para sa akin', 'bigyan mo',
  // Time/day words — show up in pickup-time phrasing like "bukas 12pm"
  // and are strong Tagalog signals (not English substrings of note).
  'bukas', 'mamaya', 'ngayon', 'kanina',
  // Politeness particles. "hindi po" and "maraming" are strong — the
  // 2-word phrases are unambiguously Tagalog. Bare " po " and "opo"
  // were previously here but caused false positives on Filipino-American
  // English-with-po phrasing ("2 lumpia prito po for tomorrow"), which
  // shouldn't trip the English-only gate for what is mostly English.
  // We rely on stronger markers to catch actual Tagalog messages.
  'maraming', 'hindi po',
  // Common Tagalog particle. ("ang" deliberately omitted — collides
  // with English "hang on", "rang", etc.)
  'yung',
];

function scoreMarkers(text: string, markers: string[]): number {
  let score = 0;
  const lower = text.toLowerCase();
  for (const m of markers) {
    if (lower.includes(m)) score += 1;
  }
  return score;
}

/**
 * Returns 'es' or 'tl' when the current inbound message contains
 * strong markers for that language; null otherwise (including for
 * English or for any message too short to judge).
 *
 * The `_previous` parameter is retained only for signature
 * compatibility with older call sites — sticky language state has
 * been removed and the argument is ignored.
 */
export function detectLanguage(
  inbound: string,
  _previous?: string | null,
): 'es' | 'tl' | null {
  if (!inbound || inbound.length < 3) return null;
  const es = scoreMarkers(inbound, ES_MARKERS);
  const tl = scoreMarkers(inbound, TL_MARKERS);
  if (es === 0 && tl === 0) return null;
  if (tl > es) return 'tl';
  if (es > tl) return 'es';
  return null;
}
