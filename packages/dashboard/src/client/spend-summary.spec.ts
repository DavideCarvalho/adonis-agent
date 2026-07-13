import { describe, expect, it } from 'vitest';
import { donutSegments, summarizeActors, summarizeSpend, withShares } from './spend-summary.js';
import type { ActorSpendRow, ModelSpendRow } from './types.js';

const models: ModelSpendRow[] = [
  { modelId: 'gpt-4o', requests: 3, inputTokens: 1000, outputTokens: 500, costUsd: 6 },
  { modelId: 'haiku', requests: 5, inputTokens: 2000, outputTokens: 200, costUsd: 2 },
];

describe('summarizeSpend', () => {
  it('sums cost, tokens, and requests', () => {
    expect(summarizeSpend(models)).toEqual({
      costUsd: 8,
      inputTokens: 3000,
      outputTokens: 700,
      totalTokens: 3700,
      requests: 8,
    });
  });
  it('is zero for no rows', () => {
    expect(summarizeSpend([]).costUsd).toBe(0);
  });
});

describe('withShares', () => {
  it('computes cost share and sorts by cost desc', () => {
    const shares = withShares(models);
    expect(shares[0]?.modelId).toBe('gpt-4o');
    expect(shares[0]?.costShare).toBeCloseTo(0.75);
    expect(shares[1]?.costShare).toBeCloseTo(0.25);
  });
  it('falls back to token share when nothing is priced', () => {
    const unpriced: ModelSpendRow[] = [
      { modelId: 'a', requests: 1, inputTokens: 300, outputTokens: 0, costUsd: 0 },
      { modelId: 'b', requests: 1, inputTokens: 100, outputTokens: 0, costUsd: 0 },
    ];
    const shares = withShares(unpriced);
    expect(shares[0]?.costShare).toBeCloseTo(0.75);
  });
});

describe('donutSegments', () => {
  it('lays arcs end-to-end and drops zero-share rows', () => {
    const segs = donutSegments(withShares(models));
    expect(segs).toHaveLength(2);
    expect(segs[0]?.offset).toBe(0);
    expect(segs[1]?.offset).toBeCloseTo(0.75);
    expect(segs[0]!.fraction + segs[1]!.fraction).toBeCloseTo(1);
  });
});

describe('summarizeActors', () => {
  it('sums across actor rows', () => {
    const actors: ActorSpendRow[] = [
      { actorRef: 'u:1', requests: 2, totalTokens: 100, costUsd: 1 },
      { actorRef: 'u:2', requests: 3, totalTokens: 200, costUsd: 4 },
    ];
    expect(summarizeActors(actors)).toEqual({ costUsd: 5, totalTokens: 300, requests: 5 });
  });
});
