import {
  generateForwardingCode,
  isValidRingDelay,
  DEFAULT_RING_DELAY_SECONDS,
  RING_DELAY_OPTIONS,
} from '../lib/callForwarding';

const NUM_E164 = '+16317905591';
const NUM_RAW = '6317905591';

describe('generateForwardingCode — AT&T', () => {
  it('forward_missed renders **61*{n}**{s}#', () => {
    const r = generateForwardingCode({
      carrier: 'att',
      action: 'forward_missed',
      ringDelaySeconds: 20,
      forwardingNumber: NUM_E164,
    });
    expect(r.code).toBe('**61*+16317905591**20#');
    expect(r.fallbackCode).toBe('*61*+16317905591#');
    expect(r.needsForwardingNumber).toBe(true);
    expect(r.needsRingDelay).toBe(true);
  });

  it('falls back to default ring delay if missing', () => {
    const r = generateForwardingCode({
      carrier: 'att',
      action: 'forward_missed',
      forwardingNumber: NUM_E164,
    });
    expect(r.code).toBe(`**61*+16317905591**${DEFAULT_RING_DELAY_SECONDS}#`);
  });

  it('rejects invalid ring delay and uses default', () => {
    const r = generateForwardingCode({
      carrier: 'att',
      action: 'forward_missed',
      ringDelaySeconds: 7,
      forwardingNumber: NUM_E164,
    });
    expect(r.code).toBe(`**61*+16317905591**${DEFAULT_RING_DELAY_SECONDS}#`);
  });

  it('strips formatting characters but keeps the leading +', () => {
    const r = generateForwardingCode({
      carrier: 'att',
      action: 'forward_missed',
      ringDelaySeconds: 15,
      forwardingNumber: '+1 (631) 790-5591',
    });
    expect(r.code).toBe('**61*+16317905591**15#');
  });

  it('check_status returns *#61# without needing a number', () => {
    const r = generateForwardingCode({ carrier: 'att', action: 'check_status' });
    expect(r.code).toBe('*#61#');
    expect(r.needsForwardingNumber).toBe(false);
    expect(r.needsRingDelay).toBe(false);
  });

  it('turn_off returns ##61#', () => {
    const r = generateForwardingCode({ carrier: 'att', action: 'turn_off' });
    expect(r.code).toBe('##61#');
  });

  it('forward_all surfaces guidance instead of a code', () => {
    const r = generateForwardingCode({
      carrier: 'att',
      action: 'forward_all',
      forwardingNumber: NUM_E164,
    });
    expect(r.code).toBeNull();
    expect(r.note).toMatch(/AT&T doesn['\u2019]t expose a universal/);
  });

  it('returns null code when number is missing', () => {
    const r = generateForwardingCode({
      carrier: 'att',
      action: 'forward_missed',
      ringDelaySeconds: 20,
    });
    expect(r.code).toBeNull();
  });
});

describe('generateForwardingCode — Verizon', () => {
  it('forward_missed renders *71{10digits}', () => {
    const r = generateForwardingCode({
      carrier: 'verizon',
      action: 'forward_missed',
      forwardingNumber: NUM_E164,
    });
    expect(r.code).toBe(`*71${NUM_RAW}`);
    expect(r.note).toMatch(/3.4 rings/);
    expect(r.troubleshooting).toMatch(/Live Voicemail/);
  });

  it('forward_all renders *72{10digits}', () => {
    const r = generateForwardingCode({
      carrier: 'verizon',
      action: 'forward_all',
      forwardingNumber: NUM_E164,
    });
    expect(r.code).toBe(`*72${NUM_RAW}`);
  });

  it('strips +1, parens, dashes, spaces from the number', () => {
    const r = generateForwardingCode({
      carrier: 'verizon',
      action: 'forward_all',
      forwardingNumber: '+1 (631) 790-5591',
    });
    expect(r.code).toBe('*726317905591');
  });

  it('keeps a 10-digit number with no leading 1 intact', () => {
    const r = generateForwardingCode({
      carrier: 'verizon',
      action: 'forward_all',
      forwardingNumber: NUM_RAW,
    });
    expect(r.code).toBe(`*72${NUM_RAW}`);
  });

  it('turn_off returns *73', () => {
    const r = generateForwardingCode({ carrier: 'verizon', action: 'turn_off' });
    expect(r.code).toBe('*73');
  });

  it('does not require a ring delay', () => {
    const r = generateForwardingCode({
      carrier: 'verizon',
      action: 'forward_missed',
      forwardingNumber: NUM_E164,
    });
    expect(r.needsRingDelay).toBe(false);
  });

  it('check_status returns null code with guidance', () => {
    const r = generateForwardingCode({ carrier: 'verizon', action: 'check_status' });
    expect(r.code).toBeNull();
    expect(r.note).toMatch(/\*611/);
  });
});

describe('generateForwardingCode — T-Mobile', () => {
  it('forward_missed renders **61*{n}**{s}#', () => {
    const r = generateForwardingCode({
      carrier: 'tmobile',
      action: 'forward_missed',
      ringDelaySeconds: 25,
      forwardingNumber: NUM_E164,
    });
    expect(r.code).toBe('**61*+16317905591**25#');
    expect(r.needsRingDelay).toBe(true);
  });

  it('forward_all renders **21*{n}#', () => {
    const r = generateForwardingCode({
      carrier: 'tmobile',
      action: 'forward_all',
      forwardingNumber: NUM_E164,
    });
    expect(r.code).toBe('**21*+16317905591#');
    expect(r.needsRingDelay).toBe(false);
  });

  it('turn_off returns ##61# with a hint about other reset codes', () => {
    const r = generateForwardingCode({ carrier: 'tmobile', action: 'turn_off' });
    expect(r.code).toBe('##61#');
    expect(r.description).toMatch(/##21#/);
    expect(r.description).toMatch(/##004#/);
  });

  it('check_status returns *#61#', () => {
    const r = generateForwardingCode({ carrier: 'tmobile', action: 'check_status' });
    expect(r.code).toBe('*#61#');
  });
});

describe('generateForwardingCode — Other carrier', () => {
  it('returns no code and a guidance note for any action', () => {
    const r = generateForwardingCode({
      carrier: 'other',
      action: 'forward_missed',
      forwardingNumber: NUM_E164,
    });
    expect(r.code).toBeNull();
    expect(r.note).toMatch(/Codes vary by carrier/);
    expect(r.note).toContain(NUM_E164);
  });

  it('omits the number from the note when not provided', () => {
    const r = generateForwardingCode({
      carrier: 'other',
      action: 'turn_off',
    });
    expect(r.note).toMatch(/RingbackSMS number/);
  });
});

describe('isValidRingDelay', () => {
  it('accepts every documented ring delay', () => {
    for (const s of RING_DELAY_OPTIONS) {
      expect(isValidRingDelay(s)).toBe(true);
    }
  });

  it('rejects undocumented values', () => {
    expect(isValidRingDelay(0)).toBe(false);
    expect(isValidRingDelay(7)).toBe(false);
    expect(isValidRingDelay(45)).toBe(false);
  });
});
