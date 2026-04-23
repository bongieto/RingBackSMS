import { validatePickupPhrase } from '../ai/pickupTimeValidator';

// Convenience: default tenant is open 11:00-20:00, grace window 15 min.
const HOURS = { todayOpen: '11:00', todayClose: '20:00' };

describe('validatePickupPhrase', () => {
  describe('future-day phrases — always accepted (delegated to existing regex)', () => {
    it.each([
      'tomorrow',
      'tomorrow at 6pm',
      'monday at 7',
      'next friday',
      'tue 12pm',
      'schedule for wednesday',
    ])('accepts %p', (phrase) => {
      const r = validatePickupPhrase({
        phrase,
        nowHour: 14,
        nowMinute: 0,
        ...HOURS,
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('ASAP / NOW', () => {
    it('accepts "asap" during open hours with room before close', () => {
      const r = validatePickupPhrase({
        phrase: 'asap',
        nowHour: 14,
        nowMinute: 0,
        ...HOURS,
      });
      expect(r.ok).toBe(true);
    });

    it('rejects "asap" after close', () => {
      const r = validatePickupPhrase({
        phrase: 'asap',
        nowHour: 22,
        nowMinute: 0,
        ...HOURS,
      });
      expect(r).toEqual({ ok: false, reason: 'after_close' });
    });

    it('rejects "now" inside the last-orders grace window', () => {
      // close 20:00, now 19:50, grace 15 → 10 min left, must refuse
      const r = validatePickupPhrase({
        phrase: 'now',
        nowHour: 19,
        nowMinute: 50,
        ...HOURS,
      });
      expect(r).toEqual({ ok: false, reason: 'inside_last_orders_grace' });
    });

    it('rejects "asap" when todayOpen / todayClose are null (closed today)', () => {
      const r = validatePickupPhrase({
        phrase: 'asap',
        nowHour: 12,
        nowMinute: 0,
        todayOpen: null,
        todayClose: null,
      });
      expect(r).toEqual({ ok: false, reason: 'closed_today' });
    });
  });

  describe('concrete clock times', () => {
    it('accepts 6pm during open hours', () => {
      const r = validatePickupPhrase({
        phrase: '6pm',
        nowHour: 14,
        nowMinute: 0,
        ...HOURS,
      });
      expect(r.ok).toBe(true);
    });

    it('rejects "midnight" when close is 20:00', () => {
      const r = validatePickupPhrase({
        phrase: 'pick up at midnight',
        nowHour: 14,
        nowMinute: 0,
        ...HOURS,
      });
      expect(r).toEqual({ ok: false, reason: 'after_close' });
    });

    it('rejects "noon" when we open at 11am but request is before open', () => {
      const r = validatePickupPhrase({
        phrase: '10:30am',
        nowHour: 10,
        nowMinute: 0,
        ...HOURS,
      });
      expect(r).toEqual({ ok: false, reason: 'before_open' });
    });

    it('accepts noon (12:00) when open 11-20', () => {
      const r = validatePickupPhrase({
        phrase: 'noon',
        nowHour: 10,
        nowMinute: 30,
        ...HOURS,
      });
      expect(r.ok).toBe(true);
    });

    it('rejects 11:55pm when close is 20:00 (QA case)', () => {
      // Exact regression guard: audit flagged customer saying "12:19am"
      // at 12:19am as billed. A concrete time outside open window should
      // be rejected.
      const r = validatePickupPhrase({
        phrase: '11:55 pm',
        nowHour: 23,
        nowMinute: 55,
        ...HOURS,
      });
      expect(r).toEqual({ ok: false, reason: 'after_close' });
    });

    it('rejects 7:55pm when close is 8:00pm (inside grace window)', () => {
      const r = validatePickupPhrase({
        phrase: 'pick up at 7:55pm',
        nowHour: 19,
        nowMinute: 30,
        ...HOURS,
      });
      expect(r).toEqual({ ok: false, reason: 'inside_last_orders_grace' });
    });

    it('accepts 19:30 (24-hour format)', () => {
      const r = validatePickupPhrase({
        phrase: '19:30',
        nowHour: 14,
        nowMinute: 0,
        ...HOURS,
      });
      expect(r.ok).toBe(true);
    });

    it('12am resolves to 0 minutes (midnight start-of-day) and lands before_open when we open 11am', () => {
      const r = validatePickupPhrase({
        phrase: '12 am',
        nowHour: 14,
        nowMinute: 0,
        ...HOURS,
      });
      expect(r).toEqual({ ok: false, reason: 'before_open' });
    });
  });

  describe('overnight hours (e.g. 18:00 → 02:00)', () => {
    const OVERNIGHT = { todayOpen: '18:00', todayClose: '02:00' };

    it('accepts 11pm during overnight open window', () => {
      const r = validatePickupPhrase({
        phrase: '11pm',
        nowHour: 19,
        nowMinute: 0,
        ...OVERNIGHT,
      });
      expect(r.ok).toBe(true);
    });

    it('accepts 1am (early-morning but inside overnight window)', () => {
      const r = validatePickupPhrase({
        phrase: '1am',
        nowHour: 19,
        nowMinute: 0,
        ...OVERNIGHT,
      });
      expect(r.ok).toBe(true);
    });

    it('rejects 3am (past overnight close at 2am)', () => {
      const r = validatePickupPhrase({
        phrase: '3am',
        nowHour: 23,
        nowMinute: 0,
        ...OVERNIGHT,
      });
      expect(r).toEqual({ ok: false, reason: 'after_close' });
    });
  });

  describe('ambiguous / unresolvable phrases — default accept', () => {
    it.each([
      'in 30 minutes',
      'whenever is fine',
      'sometime today',
      'a bit later',
      'after my shift',
      'when you have time',
      '',
    ])('accepts %p (unresolvable → trust caller)', (phrase) => {
      const r = validatePickupPhrase({
        phrase,
        nowHour: 14,
        nowMinute: 0,
        ...HOURS,
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('last-orders grace override', () => {
    it('respects a 30-minute custom grace', () => {
      // close 20:00, request 7:45pm, grace 30 → 15 min left, refuse
      const r = validatePickupPhrase({
        phrase: '7:45pm',
        nowHour: 18,
        nowMinute: 0,
        ...HOURS,
        lastOrdersGraceMinutes: 30,
      });
      expect(r).toEqual({ ok: false, reason: 'inside_last_orders_grace' });
    });

    it('accepts the same phrase when grace is 0', () => {
      const r = validatePickupPhrase({
        phrase: '7:45pm',
        nowHour: 18,
        nowMinute: 0,
        ...HOURS,
        lastOrdersGraceMinutes: 0,
      });
      expect(r.ok).toBe(true);
    });
  });
});
