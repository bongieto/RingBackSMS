/**
 * Ultra-cheap language detection for inbound SMS. Not a full classifier —
 * matches against marker words that Claude's English-default model
 * reliably mis-detects otherwise. If no marker fires, return null so the
 * agent defaults to English.
 *
 * Tested targets: Spanish (es) and Tagalog (tl). Easy to extend.
 */
const ES_MARKERS = [
  'hola', 'gracias', 'por favor', 'quiero', 'quisiera', 'necesito',
  'tengo', 'esta', 'estoy', 'está', 'pedido', 'orden', 'cuánto', 'cuanto',
  'dónde', 'donde', 'cuándo', 'cuando', 'para mí', 'para mi',
  'buenas', 'buenos dias', 'buenas tardes', 'buenas noches',
  'tacos', 'pollo', 'arroz',
];

const TL_MARKERS = [
  'salamat', 'kumusta', 'kamusta', 'paki', 'pabili', 'gusto ko',
  'meron ba', 'ilan', 'magkano', 'pwede', 'puwede',
  'para sa akin', 'bigyan mo', 'lumpia', 'adobo', 'pancit', 'sinigang',
  'kanin', 'ulam',
];

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
