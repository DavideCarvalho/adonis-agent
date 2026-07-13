import type { GovernanceRange } from './types.js';

/** `YYYY-MM-DD` for the UTC day `offsetDays` before `now` (negative → past). */
export function utcDay(now: Date, offsetDays = 0): string {
  const d = new Date(now.getTime() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** True for a well-formed `YYYY-MM-DD` calendar day. */
export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(time) && value === new Date(time).toISOString().slice(0, 10);
}

/** The default range: the trailing `days` UTC days ending today (inclusive), default 7. */
export function defaultRange(now: Date = new Date(), days = 7): GovernanceRange {
  const span = Math.max(1, Math.floor(days));
  return { fromDay: utcDay(now, -(span - 1)), toDay: utcDay(now, 0) };
}

/** Coerce a possibly-invalid range into a valid one, falling back to {@link defaultRange}. */
export function normalizeRange(
  range: Partial<GovernanceRange>,
  now: Date = new Date(),
): GovernanceRange {
  const fallback = defaultRange(now);
  const fromDay = range.fromDay && isIsoDay(range.fromDay) ? range.fromDay : fallback.fromDay;
  const toDay = range.toDay && isIsoDay(range.toDay) ? range.toDay : fallback.toDay;
  // Guard an inverted range (from after to) by swapping.
  return fromDay <= toDay ? { fromDay, toDay } : { fromDay: toDay, toDay: fromDay };
}
