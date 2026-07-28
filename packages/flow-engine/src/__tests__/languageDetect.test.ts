import { detectLanguage } from '../ai/languageDetect';

describe('detectLanguage', () => {
  describe('English false-positive regressions', () => {
    // Production incident 2026-07-26: 'esta' matched the substring in
    // "r-esta-urant", so this exact customer question got the Spanish
    // rejection three times in a row.
    it('does not flag "Is it a dine in restaurant?" as Spanish', () => {
      expect(detectLanguage('Is it a dine in restaurant?')).toBeNull();
    });

    it('does not flag "This the new restaurant open on wabash" as Spanish', () => {
      expect(detectLanguage('This the new restaurant open on wabash')).toBeNull();
    });

    it.each([
      'I want to establish a pickup time',
      'my estate sale is tomorrow',   // esta ⊂ estate
      'the standings are up',          // tengo ⊄, esta ⊄ — control
      'we are estimating 6pm',         // esta ⊂ estimating
      'where is the pedido... jk just kidding my order', // real marker but as word — see below
      'is the truck at the estadium event', // esta ⊂ estadium (misspelling)
      'can I get yung... nevermind',   // 'yung' as a word IS a marker; excluded here
    ])('substring-only marker hits stay English: %s', (msg) => {
      // Messages where would-be markers appear only INSIDE other words
      // must not trip the gate. (Rows with genuine standalone markers
      // are asserted separately below.)
      const result = detectLanguage(msg);
      if (msg.includes('pedido') || msg.includes('yung')) {
        // standalone marker present — allowed to detect
        return;
      }
      expect(result).toBeNull();
    });

    it('does not flag menu-item loanwords', () => {
      expect(detectLanguage('2 lumpia prito for tomorrow please')).toBeNull();
      expect(detectLanguage('one pancit bihon and adobo bowl')).toBeNull();
    });
  });

  describe('true positives still detected', () => {
    it('detects real Spanish', () => {
      expect(detectLanguage('Hola, quisiera hacer un pedido por favor')).toBe('es');
      expect(detectLanguage('Buenas tardes, cuánto cuesta la lumpia?')).toBe('es');
    });

    it('detects accented markers with word boundaries', () => {
      expect(detectLanguage('¿Dónde está el food truck?')).toBe('es');
    });

    it('detects real Tagalog', () => {
      expect(detectLanguage('Kumusta, magkano yung lumpia?')).toBe('tl');
      expect(detectLanguage('Salamat po, pabili ng pancit bukas')).toBe('tl');
    });
  });

  describe('edge cases', () => {
    it('returns null for empty and very short inputs', () => {
      expect(detectLanguage('')).toBeNull();
      expect(detectLanguage('ok')).toBeNull();
    });

    it('marker at start/end of message still matches', () => {
      expect(detectLanguage('gracias!')).toBe('es');
      expect(detectLanguage('ok salamat')).toBe('tl');
    });
  });
});
