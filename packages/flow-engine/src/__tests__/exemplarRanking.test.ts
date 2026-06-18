import {
  formatExemplarsForPrompt,
  jaccard,
  rankExemplars,
  tokenize,
} from '../learning/exemplarRanking';

describe('tokenize', () => {
  test('drops stop-words and short tokens', () => {
    const tokens = tokenize('Do you have any delivery to Niles today?');
    expect(tokens.has('delivery')).toBe(true);
    expect(tokens.has('niles')).toBe(true);
    expect(tokens.has('today')).toBe(true);
    // Stop words
    expect(tokens.has('do')).toBe(false);
    expect(tokens.has('you')).toBe(false);
    // Too short
    expect(tokens.has('to')).toBe(false);
  });

  test('punctuation and case insensitive', () => {
    expect(tokenize('Hello, World!')).toEqual(tokenize('hello world'));
  });
});

describe('jaccard', () => {
  test('identical sets → 1', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });
  test('disjoint sets → 0', () => {
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });
  test('empty either → 0', () => {
    expect(jaccard(new Set(['a']), new Set())).toBe(0);
  });
});

describe('rankExemplars', () => {
  const candidates = [
    { id: 'A', inboundMessage: 'Do you guys deliver to Niles?', humanReply: 'Yes on Thursdays.' },
    { id: 'B', inboundMessage: 'Are you open tomorrow morning?', humanReply: 'We open at 11.' },
    { id: 'C', inboundMessage: 'Delivery to Skokie possible?', humanReply: 'Yes call ahead.' },
    { id: 'D', inboundMessage: 'How much is the siomai?', humanReply: '5.99 for 4 pieces.' },
  ];

  test('returns the most overlapping candidate first', () => {
    // C's inbound is "Delivery to Skokie possible?" — sharing "delivery"
    // + "skokie" with this query (no stemming, so "deliver" vs "delivery"
    // are distinct tokens; we use the form C actually contains).
    const ranked = rankExemplars('Delivery to Skokie tonight', candidates);
    expect(ranked[0].id).toBe('C');
  });

  test('respects the score floor — irrelevant cases drop out', () => {
    // "weather" has no overlap with any candidate above threshold.
    const ranked = rankExemplars('What is the weather like?', candidates);
    expect(ranked.length).toBe(0);
  });

  test('honors the limit', () => {
    const ranked = rankExemplars('Do you deliver and are you open?', candidates, { limit: 2 });
    expect(ranked.length).toBeLessThanOrEqual(2);
  });

  test('empty query → no exemplars', () => {
    expect(rankExemplars('', candidates)).toEqual([]);
  });

  test('empty candidates → empty result', () => {
    expect(rankExemplars('deliver to me', [])).toEqual([]);
  });

  test('attaches a numeric score to each ranked exemplar', () => {
    const ranked = rankExemplars('Delivery to Niles tomorrow', candidates);
    expect(ranked[0].score).toBeGreaterThan(0);
    expect(typeof ranked[0].score).toBe('number');
  });
});

describe('formatExemplarsForPrompt', () => {
  test('empty input → empty string', () => {
    expect(formatExemplarsForPrompt([])).toBe('');
  });

  test('renders a labeled block', () => {
    const out = formatExemplarsForPrompt([
      {
        id: 'A',
        inboundMessage: 'do you deliver?',
        humanReply: 'Yes on Thursdays.',
        score: 0.5,
      },
    ]);
    expect(out).toContain('similar messages');
    expect(out).toContain('Customer: do you deliver?');
    expect(out).toContain('Our reply: Yes on Thursdays.');
  });

  test('truncates very long inbound + reply', () => {
    const out = formatExemplarsForPrompt([
      {
        id: 'X',
        inboundMessage: 'a '.repeat(300),
        humanReply: 'b '.repeat(300),
        score: 0.5,
      },
    ]);
    expect(out.length).toBeLessThan(800);
  });
});
