import { describe, test, expect } from 'vitest';
import { computeNextDeadline, computeSkippedDeadline, validateRecurrence } from '../src/recurrence.js';

describe('validateRecurrence', () => {
  test('null passes through', () => {
    expect(validateRecurrence(null)).toBeNull();
  });
  test('interval validated', () => {
    expect(validateRecurrence({ type: 'interval', unit: 'day', every: 3 }))
      .toEqual({ type: 'interval', unit: 'day', every: 3 });
    expect(() => validateRecurrence({ type: 'interval', unit: 'year', every: 1 })).toThrow();
    expect(() => validateRecurrence({ type: 'interval', unit: 'day', every: 0 })).toThrow();
  });
  test('weekly dedupes + sorts + validates range', () => {
    expect(validateRecurrence({ type: 'weekly', weekdays: [5, 2, 2] }))
      .toEqual({ type: 'weekly', weekdays: [2, 5] });
    expect(() => validateRecurrence({ type: 'weekly', weekdays: [] })).toThrow();
    expect(() => validateRecurrence({ type: 'weekly', weekdays: [9] })).toThrow();
  });
});

describe('computeNextDeadline (cadence-preserving)', () => {
  test('daily interval: +1 day from old deadline', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const old = '2026-05-09T10:00:00Z';
    const next = computeNextDeadline({ type: 'interval', unit: 'day', every: 1 }, old, now);
    expect(next).toBe('2026-05-11T10:00:00.000Z'); // 09 -> 10 (≤ now) -> 11
  });

  test('weekly interval preserves time-of-day', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const old = '2026-05-04T09:00:00Z'; // Mon
    const next = computeNextDeadline({ type: 'interval', unit: 'week', every: 1 }, old, now);
    expect(next).toBe('2026-05-11T09:00:00.000Z'); // next Mon, 09:00
  });

  test('monthly interval', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const old = '2026-04-15T09:00:00Z';
    const next = computeNextDeadline({ type: 'interval', unit: 'month', every: 1 }, old, now);
    expect(next).toBe('2026-05-15T09:00:00.000Z');
  });

  test('weekly on specific weekdays: after a missed Tue (day 2), next is Fri (day 5)', () => {
    const now = new Date('2026-05-13T12:00:00Z'); // Wed
    const old = '2026-05-12T10:00:00Z'; // Tue
    const next = computeNextDeadline({ type: 'weekly', weekdays: [2, 5] }, old, now);
    // Advance from Tue → next match after is Fri, 10:00 preserved.
    expect(next).toBe('2026-05-15T10:00:00.000Z');
  });

  test('weekly: advances several times if long gap', () => {
    const now = new Date('2026-06-10T12:00:00Z'); // Wed
    const old = '2026-05-12T10:00:00Z'; // long-past Tue
    const next = computeNextDeadline({ type: 'weekly', weekdays: [2, 5] }, old, now);
    // Should land on the first Tue or Fri after 2026-06-10. Fri = 2026-06-12
    expect(next).toBe('2026-06-12T10:00:00.000Z');
  });

  test('no fromDeadline: starts from now', () => {
    const now = new Date('2026-05-10T12:00:00Z'); // Sun
    const next = computeNextDeadline({ type: 'weekly', weekdays: [1] }, null, now);
    // Next Monday after Sun 2026-05-10 is 2026-05-11 12:00
    expect(next).toBe('2026-05-11T12:00:00.000Z');
  });

  test('null recurrence returns null', () => {
    expect(computeNextDeadline(null, '2026-01-01T00:00:00Z')).toBeNull();
  });
});

describe('computeSkippedDeadline', () => {
  test('skip advances at least one step', () => {
    const now = new Date('2026-05-01T12:00:00Z');
    const old = '2026-05-15T10:00:00Z'; // future
    const skipped = computeSkippedDeadline({ type: 'interval', unit: 'week', every: 1 }, old, now);
    expect(skipped).toBe('2026-05-22T10:00:00.000Z');
  });

  test('skip from past still ends up future', () => {
    const now = new Date('2026-05-20T12:00:00Z');
    const old = '2026-05-01T10:00:00Z';
    const skipped = computeSkippedDeadline({ type: 'interval', unit: 'week', every: 1 }, old, now);
    const d = new Date(skipped);
    expect(d.getTime()).toBeGreaterThan(now.getTime());
  });
});
