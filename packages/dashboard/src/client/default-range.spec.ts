import { describe, expect, it } from 'vitest';
import { defaultRange, isIsoDay, normalizeRange, utcDay } from './default-range.js';

const NOW = new Date('2026-03-10T12:00:00.000Z');

describe('utcDay', () => {
  it('formats the offset day in UTC', () => {
    expect(utcDay(NOW, 0)).toBe('2026-03-10');
    expect(utcDay(NOW, -1)).toBe('2026-03-09');
    expect(utcDay(NOW, -10)).toBe('2026-02-28');
  });
});

describe('isIsoDay', () => {
  it('accepts real calendar days', () => {
    expect(isIsoDay('2026-03-10')).toBe(true);
  });
  it('rejects malformed or impossible days', () => {
    expect(isIsoDay('2026-3-10')).toBe(false);
    expect(isIsoDay('2026-13-01')).toBe(false);
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('')).toBe(false);
  });
});

describe('defaultRange', () => {
  it('is the trailing 7 UTC days ending today', () => {
    expect(defaultRange(NOW)).toEqual({ fromDay: '2026-03-04', toDay: '2026-03-10' });
  });
  it('honors a custom span', () => {
    expect(defaultRange(NOW, 1)).toEqual({ fromDay: '2026-03-10', toDay: '2026-03-10' });
  });
});

describe('normalizeRange', () => {
  it('falls back to the default for invalid days', () => {
    expect(normalizeRange({ fromDay: 'x', toDay: 'y' }, NOW)).toEqual(defaultRange(NOW));
  });
  it('swaps an inverted range', () => {
    expect(normalizeRange({ fromDay: '2026-03-10', toDay: '2026-03-01' }, NOW)).toEqual({
      fromDay: '2026-03-01',
      toDay: '2026-03-10',
    });
  });
});
