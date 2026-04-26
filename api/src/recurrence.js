const UNITS = new Set(['day', 'week', 'month']);

export function validateRecurrence(rec) {
  if (rec === null || rec === undefined) return null;
  if (typeof rec !== 'object') throw new Error('recurrence must be an object or null');
  if (rec.type === 'interval') {
    if (!UNITS.has(rec.unit)) throw new Error('recurrence.unit must be day|week|month');
    if (!Number.isInteger(rec.every) || rec.every < 1) {
      throw new Error('recurrence.every must be an integer >= 1');
    }
    return { type: 'interval', unit: rec.unit, every: rec.every };
  }
  if (rec.type === 'weekly') {
    if (!Array.isArray(rec.weekdays) || !rec.weekdays.length) {
      throw new Error('recurrence.weekdays must be a non-empty array');
    }
    const days = [...new Set(rec.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!days.length) throw new Error('recurrence.weekdays must contain integers 0..6');
    return { type: 'weekly', weekdays: days.sort() };
  }
  throw new Error(`unknown recurrence.type: ${rec.type}`);
}

function advanceOnce(rec, from) {
  const d = new Date(from);
  if (rec.type === 'interval') {
    const every = rec.every;
    if (rec.unit === 'day') d.setDate(d.getDate() + every);
    else if (rec.unit === 'week') d.setDate(d.getDate() + every * 7);
    else if (rec.unit === 'month') d.setMonth(d.getMonth() + every);
    return d;
  }
  if (rec.type === 'weekly') {
    for (let i = 1; i <= 7; i++) {
      const c = new Date(d);
      c.setDate(c.getDate() + i);
      if (rec.weekdays.includes(c.getDay())) return c;
    }
    return null;
  }
  return null;
}

/**
 * Next deadline, cadence-preserving.
 * Starts from `fromDeadline` (or `now` if null), advances step-by-step until strictly > now.
 * Returns ISO string or null.
 */
export function computeNextDeadline(recurrence, fromDeadline, now = new Date()) {
  if (!recurrence) return null;
  const start = fromDeadline ? new Date(fromDeadline) : new Date(now);
  let cur = start;
  let safety = 500;
  do {
    const next = advanceOnce(recurrence, cur);
    if (!next) return null;
    cur = next;
    safety--;
  } while (cur <= now && safety > 0);
  return safety > 0 ? cur.toISOString() : null;
}

/**
 * Skip the current occurrence: returns the next occurrence strictly after max(current, now).
 * Used by the "skip" feature.
 */
export function computeSkippedDeadline(recurrence, currentDeadline, now = new Date()) {
  if (!recurrence) return null;
  // Skip means: from the current deadline, advance at least once, then ensure future.
  const base = currentDeadline ? new Date(currentDeadline) : new Date(now);
  let cur = advanceOnce(recurrence, base);
  if (!cur) return null;
  let safety = 500;
  while (cur <= now && safety > 0) {
    const next = advanceOnce(recurrence, cur);
    if (!next) return null;
    cur = next;
    safety--;
  }
  return safety > 0 ? cur.toISOString() : null;
}
