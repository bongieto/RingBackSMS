import type { MenuItem, OrderDraft } from '@ringback/shared-types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'with', 'please', 'pls',
  'can', 'i', 'get', 'have', 'want', 'order', 'some', 'my', 'me', 'we',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'extra', 'no', 'yes', 'plus', 'ok', 'okay', 'just', 'that', 'this', 'it',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function scoreItem(item: MenuItem, tokens: Set<string>): number {
  if (tokens.size === 0) return 0;
  const hay = `${item.name} ${item.description ?? ''} ${item.category ?? ''}`.toLowerCase();
  let score = 0;
  for (const tok of tokens) {
    if (hay.includes(tok)) score += 1;
  }
  return score;
}

/**
 * Pick the menu items most likely relevant to this turn. Rules:
 *  - If the menu is small (<=30 items), return the whole thing.
 *  - Otherwise: keyword-score vs user message + last assistant message,
 *    keep top 20, and ALWAYS include items already in the cart.
 */
export function filterMenuForPrompt(
  menu: MenuItem[],
  userMessage: string,
  lastAssistantMessage: string | null,
  draft: OrderDraft | null,
  limit = 30,
): MenuItem[] {
  const available = menu.filter((m) => m.isAvailable !== false);
  if (available.length <= limit) return available;

  const tokens = new Set<string>([
    ...tokenize(userMessage),
    ...tokenize(lastAssistantMessage ?? ''),
  ]);

  const scored = available
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .sort((a, b) => b.score - a.score);

  const picks = new Map<string, MenuItem>();

  // Always include cart items
  if (draft) {
    for (const line of draft.items) {
      const m = available.find((x) => x.id === line.menuItemId);
      if (m) picks.set(m.id, m);
    }
  }

  // Top-scored items up to limit (require score > 0 once we exhaust cart)
  for (const { item, score } of scored) {
    if (picks.size >= limit) break;
    if (score > 0 || picks.size < 20) picks.set(item.id, item);
  }

  // If still room, pad with any remaining (category-diverse)
  if (picks.size < limit) {
    for (const item of available) {
      if (picks.size >= limit) break;
      picks.set(item.id, item);
    }
  }

  return Array.from(picks.values());
}
