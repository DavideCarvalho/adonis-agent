import { describe, expect, it } from 'vitest';
import { buildTrendGeometry } from './trend-path.js';
import type { UsageTrendPoint } from './types.js';

const points: UsageTrendPoint[] = [
  { day: '2026-03-01', totalTokens: 100, costUsd: 1 },
  { day: '2026-03-02', totalTokens: 300, costUsd: 3 },
  { day: '2026-03-03', totalTokens: 200, costUsd: 2 },
];

describe('buildTrendGeometry', () => {
  it('returns empty geometry with max 1 for no points', () => {
    expect(buildTrendGeometry([], 'costUsd', 100, 50)).toEqual({
      line: '',
      area: '',
      vertices: [],
      max: 1,
    });
  });

  it('spreads vertices across the width and inverts the y-axis against the series max', () => {
    const geo = buildTrendGeometry(points, 'totalTokens', 300, 100);
    expect(geo.max).toBe(300);
    expect(geo.vertices).toHaveLength(3);
    // First point at x=0; peak (300) at y=0; even x spacing.
    expect(geo.vertices[0]?.x).toBe(0);
    expect(geo.vertices[2]?.x).toBe(300);
    expect(geo.vertices[1]?.y).toBe(0);
    expect(geo.line.startsWith('M0.00,')).toBe(true);
    expect(geo.area.endsWith('Z')).toBe(true);
  });

  it('centers a single point', () => {
    const geo = buildTrendGeometry([points[0]!], 'costUsd', 200, 100);
    expect(geo.vertices[0]?.x).toBe(100);
  });
});
