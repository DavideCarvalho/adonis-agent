import { describe, expect, it } from 'vitest';
import { InMemoryQuotaStore } from '../src/testing/index.js';

describe('InMemoryQuotaStore', () => {
  it('reports withinLimit until the budget is exhausted', async () => {
    const quota = new InMemoryQuotaStore(100);
    const before = await quota.check('u1', '2026-06-30');
    expect(before).toEqual({ usedTokens: 0, limitTokens: 100, withinLimit: true });

    await quota.bump('u1', '2026-06-30', 100);
    const after = await quota.check('u1', '2026-06-30');
    expect(after.usedTokens).toBe(100);
    expect(after.withinLimit).toBe(false);
  });

  it('accumulates across bumps and isolates by actor + day', async () => {
    const quota = new InMemoryQuotaStore(1_000);
    await quota.bump('u1', '2026-06-30', 200);
    await quota.bump('u1', '2026-06-30', 300);
    await quota.bump('u1', '2026-07-01', 50);
    await quota.bump('u2', '2026-06-30', 10);

    expect((await quota.check('u1', '2026-06-30')).usedTokens).toBe(500);
    expect((await quota.check('u1', '2026-07-01')).usedTokens).toBe(50);
    expect((await quota.check('u2', '2026-06-30')).usedTokens).toBe(10);
    // an untouched actor/day starts fresh
    expect((await quota.check('u3', '2026-06-30')).usedTokens).toBe(0);
  });
});
