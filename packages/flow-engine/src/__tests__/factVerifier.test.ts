import { runFactVerifier } from '../flows/fallbackFlow';
import type { CallerMemory, TenantContext } from '../types';

const tenant = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  tenantName: 'Test Restaurant',
  tenantPhoneNumber: '+12175550100',
  config: {
    timezone: 'America/Chicago',
    businessAddress: '742 Evergreen Terrace',
    businessHoursStart: '11:00',
    businessHoursEnd: '20:00',
  } as any,
  flows: [],
  menuItems: [],
} as unknown as TenantContext;

function memWithEtaMinutesFromNow(minutes: number): CallerMemory {
  return {
    contactName: null,
    contactStatus: null,
    tier: 'NEW',
    lastOrderSummary: null,
    lastConversationPreview: null,
    activeOrder: {
      orderNumber: 'ORD-1',
      status: 'CONFIRMED',
      estimatedReadyTime: new Date(Date.now() + minutes * 60_000).toISOString(),
      pickupTime: null,
      itemsSummary: '1× test',
      total: 9.99,
    },
  };
}

const noActiveOrder: CallerMemory = {
  contactName: null,
  contactStatus: null,
  tier: 'NEW',
  lastOrderSummary: null,
  lastConversationPreview: null,
  activeOrder: null,
};

describe('runFactVerifier — ETA rewriter', () => {
  test('rewrites duration when off by > 5 min (claims 15, real 25)', () => {
    const memory = memWithEtaMinutesFromNow(25);
    const reply = "Thanks! Your order will be ready in 15 minutes.";
    const { rewrittenText, findings } = runFactVerifier(reply, memory, tenant);

    expect(rewrittenText).toContain('in about 25 minutes');
    expect(rewrittenText).not.toMatch(/in\s+15\s+min/i);
    const f = findings.find((x) => x.kind === 'eta_rewritten');
    expect(f).toBeDefined();
    expect(f!.evidence.claimedMinutes).toBe(15);
    expect(f!.evidence.realMinutesFromNow).toBe(25);
  });

  test('rewrites short-form "in N min"', () => {
    const memory = memWithEtaMinutesFromNow(20);
    const reply = 'Ready in 10 min!';
    const { rewrittenText } = runFactVerifier(reply, memory, tenant);
    expect(rewrittenText).toContain('in about 20 minutes');
  });

  test('does NOT rewrite when within tolerance (claims 23, real 25, tolerance 5)', () => {
    const memory = memWithEtaMinutesFromNow(25);
    const reply = "Ready in 23 minutes.";
    const { rewrittenText, findings } = runFactVerifier(reply, memory, tenant);

    expect(rewrittenText).toBe(reply); // unchanged
    expect(findings.some((f) => f.kind === 'eta_rewritten')).toBe(false);
    expect(findings.some((f) => f.kind === 'eta_within_tolerance')).toBe(true);
  });

  test('does NOTHING when there is no active order', () => {
    const reply = 'Ready in 15 minutes.';
    const { rewrittenText, findings } = runFactVerifier(reply, noActiveOrder, tenant);

    expect(rewrittenText).toBe(reply);
    expect(findings.some((f) => f.kind.startsWith('eta_'))).toBe(false);
  });

  test('handles "in about N minutes" phrasing', () => {
    const memory = memWithEtaMinutesFromNow(30);
    const reply = "We'll have it ready in about 12 minutes.";
    const { rewrittenText, findings } = runFactVerifier(reply, memory, tenant);

    expect(rewrittenText).toContain('in about 30 minutes');
    expect(findings.some((f) => f.kind === 'eta_rewritten')).toBe(true);
  });

  test('logs (does not rewrite) time-of-day mismatch', () => {
    // Real ETA 25 minutes from now — canonical clock time is far from "9:00 PM"
    const memory = memWithEtaMinutesFromNow(25);
    const reply = 'Your order will be ready around 9:00 PM.';
    const { rewrittenText, findings } = runFactVerifier(reply, memory, tenant);

    // Time-of-day path is detect-only at this stage.
    expect(rewrittenText).toBe(reply);
    const f = findings.find((f) => f.kind === 'eta_within_tolerance');
    expect(f?.evidence.rewriteSkipped).toBe(true);
    expect(f?.evidence.claimType).toBe('time_of_day');
  });
});

describe('runFactVerifier — detect-only loggers', () => {
  test('detects a phone number in the reply', () => {
    const reply = "Call us at 217-555-9999 if anything changes.";
    const { findings } = runFactVerifier(reply, noActiveOrder, tenant);

    const f = findings.find((x) => x.kind === 'phone_claim_detected');
    expect(f).toBeDefined();
    expect(f!.evidence.mentioned).toContain('555-9999');
    expect(f!.evidence.tenantPhone).toBe('+12175550100');
  });

  test('detects a US-style street address mention', () => {
    const reply = "We're at 100 Main Street, see you soon.";
    const { findings } = runFactVerifier(reply, noActiveOrder, tenant);

    const f = findings.find((x) => x.kind === 'address_claim_detected');
    expect(f).toBeDefined();
    expect(f!.evidence.tenantAddress).toBe('742 Evergreen Terrace');
  });

  test('detects an hours claim ("we close at 9 PM")', () => {
    const reply = "We close at 9 PM tonight — see you before then!";
    const { findings } = runFactVerifier(reply, noActiveOrder, tenant);

    const f = findings.find((x) => x.kind === 'hours_claim_detected');
    expect(f).toBeDefined();
    expect(f!.evidence.hoursEnd).toBe('20:00');
  });

  test('clean reply with no claims yields no findings', () => {
    const reply = 'Thanks for reaching out — let us know what you need!';
    const { rewrittenText, findings } = runFactVerifier(reply, noActiveOrder, tenant);

    expect(rewrittenText).toBe(reply);
    expect(findings.length).toBe(0);
  });
});
