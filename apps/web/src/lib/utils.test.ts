import { formatCallbackTaskTitle, formatPhoneNumber } from './utils';

describe('formatPhoneNumber', () => {
  it('formats an E.164 US caller number for operational use', () => {
    expect(formatPhoneNumber('+13095552614')).toBe('+1 (309) 555-2614');
  });

  it('formats a ten-digit US caller number', () => {
    expect(formatPhoneNumber('3095552614')).toBe('(309) 555-2614');
  });

  it('preserves international and nonstandard values', () => {
    expect(formatPhoneNumber('+442079460958')).toBe('+442079460958');
    expect(formatPhoneNumber('Unknown caller')).toBe('Unknown caller');
  });
});

describe('formatCallbackTaskTitle', () => {
  it('reveals the caller number in a legacy masked rapid-redial task', () => {
    expect(
      formatCallbackTaskTitle('🔥 Call back +1309***2614 — 2+ attempts', '+13095552614')
    ).toBe('🔥 Call back +1 (309) 555-2614 — 2+ attempts');
  });

  it('leaves unrelated task titles unchanged', () => {
    expect(formatCallbackTaskTitle('Review voicemail', '+13095552614')).toBe('Review voicemail');
  });
});
