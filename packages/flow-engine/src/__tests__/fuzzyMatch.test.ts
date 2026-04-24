import type { MenuItem } from '@ringback/shared-types';
import {
  findItemFuzzyMatches,
  findItemPhraseMatches,
  levenshteinWithinBudget,
} from '../ai/buildAgentPrompt';

function mkItem(id: string, name: string): MenuItem {
  return {
    id,
    tenantId: 'tenant',
    name,
    description: null,
    price: 5.99,
    category: null,
    isAvailable: true,
    duration: null,
    requiresBooking: false,
    squareCatalogId: null,
    squareVariationId: null,
    posCatalogId: null,
    posVariationId: null,
    lastSyncedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  } as MenuItem;
}

const menu: MenuItem[] = [
  mkItem('a7', '#A7 Siomai (4 Pcs)'),
  mkItem('lb2', '#LB2 Pork BBQ Bowl'),
  mkItem('m3', 'Pancit Bihon'),
  mkItem('d1', '#D1 Calamansi Sizzler'),
  mkItem('ad', 'Adobo Chicken'),
];

describe('levenshteinWithinBudget', () => {
  test('identical strings = 0', () => {
    expect(levenshteinWithinBudget('siomai', 'siomai', 1)).toBe(0);
  });
  test('one substitution = 1', () => {
    expect(levenshteinWithinBudget('siomai', 'siomei', 1)).toBe(1);
  });
  test('one insertion = 1', () => {
    expect(levenshteinWithinBudget('siomi', 'siomai', 1)).toBe(1);
  });
  test('one deletion = 1', () => {
    expect(levenshteinWithinBudget('siomaii', 'siomai', 1)).toBe(1);
  });
  test('bails past budget cheaply', () => {
    // Length diff alone exceeds budget → instant bail.
    expect(levenshteinWithinBudget('abc', 'abcdefghij', 1)).toBeGreaterThan(1);
  });
  test('two edits exceeds budget of 1', () => {
    expect(levenshteinWithinBudget('siomai', 'shimai', 1)).toBeGreaterThan(1);
  });
});

describe('findItemFuzzyMatches', () => {
  test('"siomi" (one-char typo) → Siomai', () => {
    // Sanity: exact matcher must not already find it, else fuzzy is redundant.
    expect(findItemPhraseMatches('1 siomi', menu)).toHaveLength(0);
    const fuzzy = findItemFuzzyMatches('1 siomi', menu);
    expect(fuzzy).toHaveLength(1);
    expect(fuzzy[0].item.id).toBe('a7');
  });

  test('"pansit bihon" (one-char typo) → Pancit Bihon', () => {
    expect(findItemPhraseMatches('pansit bihon', menu)).toHaveLength(0);
    const fuzzy = findItemFuzzyMatches('pansit bihon', menu);
    expect(fuzzy).toHaveLength(1);
    expect(fuzzy[0].item.id).toBe('m3');
  });

  test('exact matches are skipped (no duplication with phrase matcher)', () => {
    // "siomai" exact — fuzzy matcher requires totalDist ≥ 1, so it
    // returns nothing. The phrase matcher is responsible here.
    const fuzzy = findItemFuzzyMatches('1 siomai', menu);
    expect(fuzzy).toHaveLength(0);
  });

  test('two-char typo does NOT match (budget = 1)', () => {
    // "siomi" → "siomai" is distance 1. "soami" → "siomai" is distance
    // 2 (substitution + insertion). Must be rejected.
    const fuzzy = findItemFuzzyMatches('soami', menu);
    expect(fuzzy).toHaveLength(0);
  });

  test('short tokens (<4 chars) are ignored to avoid false positives', () => {
    // "bbq" is 3 chars — fuzzy would match too aggressively against
    // anything of similar length. Skipped.
    const fuzzy = findItemFuzzyMatches('bbq', menu);
    expect(fuzzy).toHaveLength(0);
  });

  test('multi-word items: all words must be within budget', () => {
    // "pansit" is distance-1 from "pancit", but "bijon" is distance-1
    // from "bihon" — both good, so match. Distance per-token ≤ 1.
    expect(findItemFuzzyMatches('pansit bijon', menu)).toHaveLength(1);
    // But if ONE word is too far, whole match drops.
    expect(findItemFuzzyMatches('pansit xyz', menu)).toHaveLength(0);
  });

  test('gibberish leaves fuzzy empty', () => {
    expect(findItemFuzzyMatches('zzzz qqqq wwww', menu)).toHaveLength(0);
  });
});
