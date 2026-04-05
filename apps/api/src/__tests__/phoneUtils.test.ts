import { toE164, maskPhone, isValidE164, getNationalNumber } from '../utils/phoneUtils';

describe('phoneUtils', () => {
  describe('toE164', () => {
    it('formats 10-digit US number', () => {
      expect(toE164('2175551234')).toBe('+12175551234');
    });

    it('formats 10-digit number with dashes', () => {
      expect(toE164('217-555-1234')).toBe('+12175551234');
    });

    it('formats 10-digit number with parens', () => {
      expect(toE164('(217) 555-1234')).toBe('+12175551234');
    });

    it('passes through valid E.164', () => {
      expect(toE164('+12175551234')).toBe('+12175551234');
    });

    it('formats 11-digit NANP number', () => {
      expect(toE164('12175551234')).toBe('+12175551234');
    });

    it('returns null for invalid number', () => {
      expect(toE164('123')).toBeNull();
      expect(toE164('abc')).toBeNull();
    });
  });

  describe('maskPhone', () => {
    it('masks middle digits', () => {
      expect(maskPhone('+12175551234')).toBe('+1217***1234');
    });

    it('handles short input', () => {
      expect(maskPhone('123')).toBe('****');
    });
  });

  describe('isValidE164', () => {
    it('validates correct E.164', () => {
      expect(isValidE164('+12175551234')).toBe(true);
      expect(isValidE164('+447911123456')).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(isValidE164('2175551234')).toBe(false);
      expect(isValidE164('+1')).toBe(false);
      expect(isValidE164('+12175551234567890')).toBe(false);
    });
  });

  describe('getNationalNumber', () => {
    it('strips +1 country code for NANP', () => {
      expect(getNationalNumber('+12175551234')).toBe('2175551234');
    });

    it('strips + prefix for non-NANP', () => {
      expect(getNationalNumber('+447911123456')).toBe('447911123456');
    });
  });
});
