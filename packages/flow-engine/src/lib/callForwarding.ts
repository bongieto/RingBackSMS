// Carrier-specific MMI/dial-code generator for the Call Forwarding Setup
// wizard on the dashboard. Pure: no React, no I/O, no clock — given a
// carrier + action + (optional) ring delay + (optional) forwarding number,
// returns the exact code the user should dial on their cell phone.
//
// Codes verified from each carrier's published documentation as of
// 2025-2026 (US networks). When carriers change codes — they sometimes do
// — update the table below and the unit tests in one PR.

export type Carrier = 'att' | 'verizon' | 'tmobile' | 'other';

export type ForwardingAction =
  | 'forward_missed'   // unanswered/conditional forwarding
  | 'forward_all'      // immediate/unconditional forwarding
  | 'turn_off'         // disable forwarding (best-effort: reset closest match)
  | 'check_status';    // query carrier for current forwarding settings

export interface ForwardingCodeInput {
  carrier: Carrier;
  action: ForwardingAction;
  /** Required when (carrier in {att, tmobile} AND action === 'forward_missed').
   *  Ignored otherwise. Allowed: 5 | 10 | 15 | 20 | 25 | 30. */
  ringDelaySeconds?: number;
  /** Required when the action needs a destination (forward_missed or
   *  forward_all). Ignored for turn_off / check_status. May contain "+",
   *  spaces, parens, dashes — we strip them per carrier rules. */
  forwardingNumber?: string;
}

export interface GeneratedCode {
  /** The dial string the user types into the phone keypad. */
  code: string | null;
  /** Short human-readable description shown above the dial code. */
  description: string;
  /** Optional secondary code shown as a fallback (currently AT&T-only). */
  fallbackCode?: string;
  /** Optional carrier-specific note to display on the result screen. */
  note?: string;
  /** Optional troubleshooting tip (currently Verizon iOS Live Voicemail). */
  troubleshooting?: string;
  /** True when the wizard should ask the user for a forwarding number
   *  before generating the code. False for turn-off / check-status. */
  needsForwardingNumber: boolean;
  /** True when the wizard should ask for a ring delay (AT&T/T-Mobile +
   *  forward_missed). False otherwise. */
  needsRingDelay: boolean;
}

const ALLOWED_RING_DELAYS = [5, 10, 15, 20, 25, 30] as const;

/** Default ring delay (seconds) for service businesses / missed-call SMS. */
export const DEFAULT_RING_DELAY_SECONDS = 20;

/** Strip everything except digits. Used for Verizon, which expects the raw
 *  10-digit number with no `+`, no parens, no spaces. */
function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

/** Strip leading "1" country code from a 10/11-digit US number. Verizon's
 *  *71/*72 codes want the bare 10-digit. */
function strip1(input: string): string {
  const d = digitsOnly(input);
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/** AT&T and T-Mobile accept the number with `+` and country code embedded
 *  in their MMI strings — we just sanitize whitespace and parens but keep
 *  the leading `+` if present. */
function sanitizeForMmi(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  const stripped = digitsOnly(trimmed);
  return hasPlus ? `+${stripped}` : stripped;
}

export function isValidRingDelay(seconds: number): boolean {
  return (ALLOWED_RING_DELAYS as readonly number[]).includes(seconds);
}

export function generateForwardingCode(input: ForwardingCodeInput): GeneratedCode {
  const { carrier, action } = input;
  const seconds = input.ringDelaySeconds;
  const rawNumber = input.forwardingNumber?.trim() ?? '';

  // First, derive the metadata that the wizard uses to gate which steps
  // it shows. This is independent of whether the user has supplied the
  // number/delay yet — the wizard calls generateForwardingCode at every
  // step transition to know what to ask next.
  const needsForwardingNumber = action === 'forward_missed' || action === 'forward_all';
  const needsRingDelay =
    (carrier === 'att' || carrier === 'tmobile') && action === 'forward_missed';

  // "Other" carrier — no codes shipped; surface guidance instead.
  if (carrier === 'other') {
    return {
      code: null,
      description: 'Carrier-specific',
      note:
        rawNumber.length > 0
          ? `Codes vary by carrier. Contact your provider and ask about conditional call forwarding to ${rawNumber}.`
          : `Codes vary by carrier. Contact your provider and ask about conditional call forwarding to your RingbackSMS number.`,
      needsForwardingNumber,
      needsRingDelay,
    };
  }

  // Validate ring delay before consuming it. We default to 20s if the
  // wizard somehow omits the delay on a step that requires it (defensive).
  const ringDelay = needsRingDelay
    ? isValidRingDelay(seconds ?? -1)
      ? (seconds as number)
      : DEFAULT_RING_DELAY_SECONDS
    : 0;

  if (carrier === 'att') {
    switch (action) {
      case 'forward_missed': {
        const n = sanitizeForMmi(rawNumber);
        return {
          code: n ? `**61*${n}**${ringDelay}#` : null,
          description: `Forward unanswered calls after ${ringDelay} seconds`,
          fallbackCode: n ? `*61*${n}#` : undefined,
          note: 'If the conditional code above fails, try the fallback — some plans don\u2019t accept the ring-delay variant.',
          needsForwardingNumber,
          needsRingDelay,
        };
      }
      case 'forward_all': {
        // AT&T doesn't have a clean unconditional-forwarding MMI documented
        // for all plans — surface guidance.
        return {
          code: null,
          description: 'Immediate forwarding',
          note: 'AT&T doesn\u2019t expose a universal "forward all" code. Set up unanswered forwarding instead, or contact AT&T support.',
          needsForwardingNumber,
          needsRingDelay,
        };
      }
      case 'turn_off':
        return {
          code: '##61#',
          description: 'Turn off unanswered forwarding',
          needsForwardingNumber: false,
          needsRingDelay: false,
        };
      case 'check_status':
        return {
          code: '*#61#',
          description: 'Check current unanswered forwarding setting',
          needsForwardingNumber: false,
          needsRingDelay: false,
        };
    }
  }

  if (carrier === 'verizon') {
    const verizonTroubleshooting =
      'If forwarding doesn\u2019t activate, turn off iPhone Live Voicemail under Settings \u2192 Apps \u2192 Phone \u2192 Live Voicemail.';
    const verizonRingNote =
      'Verizon does not support custom ring delay. Forwarding kicks in after about 3\u20134 rings.';
    switch (action) {
      case 'forward_missed': {
        const n = strip1(rawNumber);
        return {
          code: n ? `*71${n}` : null,
          description: 'Forward unanswered or busy calls',
          note: verizonRingNote,
          troubleshooting: verizonTroubleshooting,
          needsForwardingNumber,
          needsRingDelay,
        };
      }
      case 'forward_all': {
        const n = strip1(rawNumber);
        return {
          code: n ? `*72${n}` : null,
          description: 'Forward all calls immediately',
          troubleshooting: verizonTroubleshooting,
          needsForwardingNumber,
          needsRingDelay,
        };
      }
      case 'turn_off':
        return {
          code: '*73',
          description: 'Turn off forwarding',
          needsForwardingNumber: false,
          needsRingDelay: false,
        };
      case 'check_status':
        return {
          code: null,
          description: 'Check current forwarding setting',
          note: 'Verizon does not expose a check-status code on most plans. Call *611 from your Verizon line to verify settings with support.',
          needsForwardingNumber: false,
          needsRingDelay: false,
        };
    }
  }

  if (carrier === 'tmobile') {
    switch (action) {
      case 'forward_missed': {
        const n = sanitizeForMmi(rawNumber);
        return {
          code: n ? `**61*${n}**${ringDelay}#` : null,
          description: `Forward unanswered calls after ${ringDelay} seconds`,
          needsForwardingNumber,
          needsRingDelay,
        };
      }
      case 'forward_all': {
        const n = sanitizeForMmi(rawNumber);
        return {
          code: n ? `**21*${n}#` : null,
          description: 'Forward all calls immediately',
          needsForwardingNumber,
          needsRingDelay,
        };
      }
      case 'turn_off':
        return {
          code: '##61#',
          description: 'Turn off unanswered forwarding (use ##21# for "forward all", ##004# to reset everything)',
          needsForwardingNumber: false,
          needsRingDelay: false,
        };
      case 'check_status':
        return {
          code: '*#61#',
          description: 'Check current unanswered forwarding setting',
          needsForwardingNumber: false,
          needsRingDelay: false,
        };
    }
  }

  // Exhaustiveness fallback — should be unreachable.
  return {
    code: null,
    description: 'Unknown carrier',
    needsForwardingNumber,
    needsRingDelay,
  };
}

/** Allowed ring-delay values exposed for UI rendering. */
export const RING_DELAY_OPTIONS = ALLOWED_RING_DELAYS;
