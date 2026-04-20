/**
 * Ultra-cheap language detection for inbound SMS. Not a full classifier —
 * matches against marker words that Claude's English-default model
 * reliably mis-detects otherwise. If no marker fires, return null so the
 * agent defaults to English.
 *
 * Tested targets: Spanish (es) and Tagalog (tl). Easy to extend.
 */
// IMPORTANT: never include FOOD names here, even if they're loanwords
// from the target language. "lumpia", "adobo", "pancit", "tacos",
// "pollo", "arroz" etc. show up on English-language restaurant menus
// and get ordered by customers of every background. Real-world bug
// this caused: every customer of a Filipino restaurant named "The
// Lumpia House" sent a first SMS containing "lumpia" and got flipped
// to Tagalog for the rest of the session. Markers must be LANGUAGE
// signals — greetings, particles, function words — not menu items.
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
  // Politeness / affirmation particles — distinctive enough to match
  // as substrings without colliding with English tokens.
  'maraming', 'opo', 'hindi po', ' po ', ' po,', ' po.', ' po!', ' po?',
  // Common Tagalog particle. ("ang" deliberately omitted — collides
  // with English "hang on", "rang", etc.)
  //
  // "prito" was here briefly as a "cooking method, not a food name"
  // — that rationale turned out to be wrong in practice. "Lumpia
  // Prito" is the printed dish name on this tenant's menu, so every
  // English SMS asking about it ("wheres my lumpia prito?") flipped
  // language to Tagalog. Rule stands: markers must be LANGUAGE
  // signals (greetings, particles, function words), never words that
  // appear verbatim in menu item names, even if they're loan terms.
  'yung',
];

// Explicit "don't assume my language" signals. When the customer says
// "I don't speak X" or "English please", clear sticky detection so the
// agent drops back to English on the next turn.
const EN_RESET_RE =
  /\b(?:i\s*don'?t\s*(?:speak|understand|know)\s*(?:tagalog|spanish|espanol|español|filipino|tl|es|that)|english\s*(?:please|only)|in english|speak english)\b/i;

function scoreMarkers(text: string, markers: string[]): number {
  let score = 0;
  const lower = text.toLowerCase();
  for (const m of markers) {
    if (lower.includes(m)) score += 1;
  }
  return score;
}

export function detectLanguage(
  inbound: string,
  previous: string | null | undefined,
): string | null {
  // Explicit English reset always wins — lets the customer override a
  // bad sticky detection by saying "I don't speak Tagalog" or
  // "English please". We return 'en' (not null) so downstream code can
  // distinguish "customer asked for English" from "no signal yet".
  if (inbound && EN_RESET_RE.test(inbound)) return 'en';
  if (previous) return previous; // sticky once detected
  if (!inbound || inbound.length < 3) return null;
  const es = scoreMarkers(inbound, ES_MARKERS);
  const tl = scoreMarkers(inbound, TL_MARKERS);
  if (es === 0 && tl === 0) return null;
  if (tl > es) return 'tl';
  if (es > tl) return 'es';
  return null;
}

export function languageLabel(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const map: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    tl: 'Tagalog',
    fr: 'French',
    zh: 'Chinese',
  };
  return map[tag] ?? tag;
}
